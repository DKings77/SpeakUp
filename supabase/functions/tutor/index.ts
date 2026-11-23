// =====================================================================
// Speak Up · Edge Function "tutor"
//
// Acciones (POST JSON salvo indicación):
//   start      { mode, topic, focus? }            → crea sesión de conversación + saludo
//   turn       { session_id, user_text }          → turno de conversación
//              multipart: action=turn, session_id, audio  (Whisper)
//   end        { session_id }                     → cierra la sesión, actualiza racha
//   transcribe multipart: action=transcribe, audio → { text }  (Whisper, para lecciones/escucha)
//   lesson     { unit }                           → contenido de la lección (se genera 1 vez y se guarda)
//   check      { es, expected, said, grammar? }   → corrige una frase hablada (drills)
//   listening  { level, topic }                   → genera un ejercicio de escucha
//   answer     { exercise_id, index, answer }     → evalúa una respuesta de comprensión
//
// Secrets: ANTHROPIC_API_KEY (obligatorio), OPENAI_API_KEY (solo si usas Whisper),
//          CLAUDE_MODEL (opcional), STT_MODEL (opcional)
// =====================================================================

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";
import { BASE_RULES, contextPrompt, TUTOR_TOOL } from "./prompts.ts";
import {
  ANSWER_SYSTEM, ANSWER_TOOL, CHECK_SYSTEM, CHECK_TOOL, LESSON_TOOL, LISTENING_TOOL,
  lessonSystem, listeningSystem, UnitSpec,
} from "./prompts_course.ts";

const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-haiku-4-5";
const STT_MODEL = Deno.env.get("STT_MODEL") ?? "whisper-1";
const HISTORY_LIMIT = 8;
const MAX_TEXT = 800;
const MAX_AUDIO_BYTES = 4_000_000;
const LEVELS = ["A1", "A1+", "A2", "A2+", "B1", "B1+", "B2", "C1", "C2"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// deno-lint-ignore no-explicit-any
type Any = any;

// ---------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) throw new HttpError(401, "No autenticado");

    let body: Record<string, Any> = {};
    let audio: File | null = null;
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      for (const [k, v] of form.entries()) {
        if (v instanceof File) audio = v; else body[k] = v;
      }
    } else {
      body = await req.json();
    }

    switch (body.action) {
      case "start": return json(await startSession(sb, body));
      case "turn": return json(await doTurn(sb, String(body.session_id), body.user_text, audio));
      case "end": return json(await endSession(sb, String(body.session_id)));
      case "transcribe": {
        if (!audio) throw new HttpError(400, "Falta el audio");
        const profile = await getProfile(sb);
        return json({ text: await transcribe(audio, profile.glossary ?? []) });
      }
      case "lesson": return json(await getLesson(sb, body.unit as UnitSpec, Boolean(body.regenerate)));
      case "check": return json(await checkSentence(sb, body));
      case "listening": return json(await newListening(sb, String(body.level ?? "A2"), String(body.topic ?? "daily life")));
      case "answer": return json(await checkAnswer(sb, body));
      default: throw new HttpError(400, "Acción desconocida");
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error(e);
    return json({ error: (e as Error).message ?? "Error interno" }, status);
  }
});

// =====================================================================
// CONVERSACIÓN
// =====================================================================
async function startSession(sb: SupabaseClient, body: Record<string, Any>) {
  const mode = String(body.mode ?? "freetalk");
  const topic = String(body.topic ?? "daily life").slice(0, 300);
  const focus = body.focus ? String(body.focus).slice(0, 300) : null;
  if (!["freetalk", "roleplay"].includes(mode)) throw new HttpError(400, "Modo no soportado");

  const { data: session, error } = await sb.from("sessions").insert({ mode, topic, focus }).select().single();
  if (error) throw error;

  const profile = await getProfile(sb);
  const opener = mode === "roleplay"
    ? "[START] Start the role-play now. Say your first line in character and ask your first question."
    : "[START] Greet David briefly and ask your first simple question about the topic.";

  const result = await tutorTurn(sb, profile, mode, topic, focus, [{ role: "user", content: opener }]);
  await sb.from("messages").insert({ session_id: session.id, role: "tutor", text: result.reply });
  return { session_id: session.id, ...result };
}

async function doTurn(sb: SupabaseClient, sessionId: string, userText: string | undefined, audio: File | null) {
  const { data: session, error } = await sb.from("sessions").select("*").eq("id", sessionId).single();
  if (error || !session) throw new HttpError(404, "Sesión no encontrada");
  if (session.ended_at) throw new HttpError(400, "La sesión ya está cerrada");

  const profile = await getProfile(sb);
  let text = String(userText ?? "").trim();
  if (audio) text = await transcribe(audio, profile.glossary ?? []);
  if (!text) return { user_text: "", empty: true };
  text = text.slice(0, MAX_TEXT);

  const { data: hist } = await sb.from("messages").select("role, text").eq("session_id", sessionId)
    .order("id", { ascending: false }).limit(HISTORY_LIMIT);
  const history = (hist ?? []).reverse().map((m) => ({
    role: m.role === "tutor" ? "assistant" : "user", content: m.text as string,
  }));
  history.push({ role: "user", content: text });

  const result = await tutorTurn(sb, profile, session.mode, session.topic ?? "", session.focus, history);

  await sb.from("messages").insert([
    { session_id: sessionId, role: "user", text, corrected_text: result.corrected_sentence },
    { session_id: sessionId, role: "tutor", text: result.reply },
  ]);
  await saveMistakes(sb, result.corrections);
  await saveVocab(sb, result.new_vocab.map((v: Any) => ({ term: v.term, translation_es: v.translation_es, example: v.example })));
  await sb.from("sessions").update({ turns: (session.turns ?? 0) + 1, level_estimate: result.level_signal }).eq("id", sessionId);

  return { user_text: text, ...result };
}

async function endSession(sb: SupabaseClient, sessionId: string) {
  const { data: session } = await sb.from("sessions").select("*").eq("id", sessionId).single();
  if (!session) throw new HttpError(404, "Sesión no encontrada");
  if (session.ended_at) return { ok: true };

  const now = new Date();
  const durationSec = Math.min(Math.round((now.getTime() - new Date(session.started_at).getTime()) / 1000), 3 * 3600);
  await sb.from("sessions").update({ ended_at: now.toISOString(), duration_sec: durationSec }).eq("id", sessionId);
  if ((session.turns ?? 0) === 0) return { ok: true, counted: false };

  const streak = await bumpProgress(sb, Math.round(durationSec / 60), session.level_estimate);
  return { ok: true, counted: true, streak_days: streak, duration_sec: durationSec };
}

/** Suma minutos y actualiza la racha (zona horaria de Madrid). Devuelve la racha. */
async function bumpProgress(sb: SupabaseClient, minutes: number, level?: string | null) {
  const now = new Date();
  const today = madridDate(now);
  const yesterday = madridDate(new Date(now.getTime() - 86_400_000));
  const { data: prog } = await sb.from("progress").select("*").maybeSingle();
  const p = prog ?? { streak_days: 0, last_practice_date: null, total_minutes: 0, total_sessions: 0 };

  let streak = p.streak_days;
  if (p.last_practice_date === today) { /* ya contó hoy */ }
  else if (p.last_practice_date === yesterday) streak += 1;
  else streak = 1;

  const row: Record<string, Any> = {
    streak_days: streak,
    last_practice_date: today,
    total_minutes: p.total_minutes + minutes,
    total_sessions: p.total_sessions + 1,
  };
  if (level) row.level_speaking = level;
  if (prog) await sb.from("progress").update(row).eq("user_id", prog.user_id);
  else await sb.from("progress").insert(row);
  return streak;
}

async function tutorTurn(sb: SupabaseClient, profile: Any, mode: string, topic: string, focus: string | null,
  messages: { role: string; content: string }[]) {
  const ctx = contextPrompt({
    level: profile.level, mode, topic, focus,
    spanishSupport: profile.spanish_support,
    glossary: profile.glossary ?? [],
    frequentMistakes: await frequentMistakes(sb),
  });
  const out = await claude({
    system: [{ type: "text", text: BASE_RULES, cache_control: { type: "ephemeral" } }, { type: "text", text: ctx }],
    tool: TUTOR_TOOL, messages, maxTokens: 800, temperature: 0.7,
  });
  return {
    reply: String(out.reply ?? "Sorry, can you say that again?"),
    corrections: Array.isArray(out.corrections) ? out.corrections.slice(0, 3) : [],
    corrected_sentence: out.corrected_sentence ?? null,
    corrected_sentence_es: out.corrected_sentence ? (out.corrected_sentence_es ?? null) : null,
    why_es: out.corrected_sentence ? (out.why_es ?? null) : null,
    praise_es: out.praise_es ?? null,
    new_vocab: Array.isArray(out.new_vocab) ? out.new_vocab.slice(0, 2) : [],
    hint: out.hint && out.hint.model_sentence ? out.hint : null,
    level_signal: LEVELS.includes(out.level_signal) ? out.level_signal : profile.level,
  };
}

// =====================================================================
// CURSO
// =====================================================================
async function getLesson(sb: SupabaseClient, unit: UnitSpec, regenerate: boolean) {
  if (!unit?.id || !/^[abc][12]-(\d\d|exam)$/.test(unit.id)) throw new HttpError(400, "Unidad no válida");

  if (!regenerate) {
    const { data: cached } = await sb.from("lessons").select("content").eq("unit_id", unit.id).maybeSingle();
    if (cached) return { unit_id: unit.id, content: cached.content, cached: true };
  }

  const spec: UnitSpec = {
    id: unit.id, level: String(unit.level).slice(0, 3), kind: unit.kind === "exam" ? "exam" : "unit",
    title: String(unit.title).slice(0, 200), grammar: String(unit.grammar).slice(0, 400),
    vocab: String(unit.vocab).slice(0, 400), speaking: String(unit.speaking).slice(0, 300), pron: String(unit.pron).slice(0, 200),
  };
  const content = await claude({
    system: [{ type: "text", text: lessonSystem(spec) }],
    tool: LESSON_TOOL,
    messages: [{ role: "user", content: `Write the lesson for unit ${spec.id} now.` }],
    maxTokens: 6000, temperature: 0.6,
  });

  // Validación mínima del test
  content.quiz = (content.quiz ?? []).filter((q: Any) =>
    Array.isArray(q.options) && q.options.length >= 2 && q.answer_index >= 0 && q.answer_index < q.options.length);

  await sb.from("lessons").upsert({ unit_id: spec.id, content }, { onConflict: "user_id,unit_id" });
  return { unit_id: spec.id, content, cached: false };
}

async function checkSentence(sb: SupabaseClient, body: Record<string, Any>) {
  const said = String(body.said ?? "").slice(0, MAX_TEXT).trim();
  if (!said) throw new HttpError(400, "No hay frase");
  const out = await claude({
    system: [{ type: "text", text: CHECK_SYSTEM }],
    tool: CHECK_TOOL,
    messages: [{
      role: "user",
      content: `Spanish sentence: ${String(body.es ?? "").slice(0, 300)}
Expected answer: ${String(body.expected ?? "").slice(0, 300)}
${body.grammar ? `Target grammar: ${String(body.grammar).slice(0, 300)}\n` : ""}What he said: ${said}`,
    }],
    maxTokens: 500, temperature: 0.2,
  });
  const corrections = Array.isArray(out.corrections) ? out.corrections.slice(0, 2) : [];
  if (!out.ok) await saveMistakes(sb, corrections);
  return { ok: Boolean(out.ok), feedback_es: out.feedback_es ?? "", better: out.better ?? null, corrections };
}

// =====================================================================
// ESCUCHA
// =====================================================================
async function newListening(sb: SupabaseClient, level: string, topic: string) {
  const lvl = ["A1", "A2", "B1", "B2", "C1", "C2"].includes(level) ? level : "A2";
  const t = topic.slice(0, 200);
  const content = await claude({
    system: [{ type: "text", text: listeningSystem(lvl, t) }],
    tool: LISTENING_TOOL,
    messages: [{ role: "user", content: `Write a new listening exercise. Random seed: ${crypto.randomUUID().slice(0, 8)}` }],
    maxTokens: 2500, temperature: 0.9,
  });
  if (!Array.isArray(content.lines) || !content.lines.length) throw new HttpError(502, "Ejercicio vacío");
  if (!(content.dictation_index >= 0 && content.dictation_index < content.lines.length)) content.dictation_index = 0;

  const { data, error } = await sb.from("listening_exercises").insert({ level: lvl, topic: t, content }).select("id").single();
  if (error) throw error;
  return { id: data.id, level: lvl, content };
}

async function checkAnswer(sb: SupabaseClient, body: Record<string, Any>) {
  const { data: ex } = await sb.from("listening_exercises").select("content").eq("id", String(body.exercise_id)).single();
  if (!ex) throw new HttpError(404, "Ejercicio no encontrado");
  const c = ex.content;
  const q = c.questions?.[Number(body.index)];
  if (!q) throw new HttpError(400, "Pregunta no válida");
  const answer = String(body.answer ?? "").slice(0, MAX_TEXT).trim() || "[no answer]";
  const transcript = c.lines.map((l: Any) => `${l.name}: ${l.text}`).join("\n");

  const out = await claude({
    system: [{ type: "text", text: ANSWER_SYSTEM }],
    tool: ANSWER_TOOL,
    messages: [{
      role: "user",
      content: `AUDIO TRANSCRIPT:\n${transcript}\n\nQUESTION: ${q.question_en}\nREFERENCE ANSWER: ${q.expected_answer}\nHIS ANSWER: ${answer}`,
    }],
    maxTokens: 500, temperature: 0.2,
  });
  const corrections = Array.isArray(out.corrections) ? out.corrections.slice(0, 2) : [];
  await saveMistakes(sb, corrections);
  return {
    understood: ["yes", "partly", "no"].includes(out.understood) ? out.understood : "no",
    feedback_es: out.feedback_es ?? "", model_answer: out.model_answer ?? q.expected_answer, corrections,
  };
}

// =====================================================================
// Helpers
// =====================================================================
async function getProfile(sb: SupabaseClient) {
  let { data } = await sb.from("profile").select("*").maybeSingle();
  if (!data) data = (await sb.from("profile").insert({}).select().single()).data;
  return data;
}

async function frequentMistakes(sb: SupabaseClient) {
  const { data } = await sb.from("mistakes").select("original, correction, times_seen")
    .order("times_seen", { ascending: false }).order("last_seen", { ascending: false }).limit(6);
  return data ?? [];
}

/** Llama a Claude forzando una herramienta: devuelve siempre el JSON de esa herramienta. */
async function claude(opts: {
  system: Any[]; tool: Any; messages: { role: string; content: string }[]; maxTokens: number; temperature: number;
}) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new HttpError(500, "Falta ANTHROPIC_API_KEY en los secrets");

  // Claude exige alternar user/assistant y empezar por user.
  const msgs: { role: string; content: string }[] = [];
  for (const m of opts.messages) {
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += "\n" + m.content;
    else msgs.push({ ...m });
  }
  if (msgs[0]?.role !== "user") msgs.unshift({ role: "user", content: "[conversation continues]" });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.system,
      tools: [opts.tool],
      tool_choice: { type: "tool", name: opts.tool.name },
      messages: msgs,
    }),
  });
  if (!res.ok) {
    console.error("Claude API error", res.status, await res.text());
    throw new HttpError(502, `Error de la API de Claude (${res.status})`);
  }
  const data = await res.json();
  console.log("usage", opts.tool.name, JSON.stringify(data.usage));
  const block = data.content?.find((b: Any) => b.type === "tool_use");
  if (!block) throw new HttpError(502, "Respuesta sin formato válido");
  return block.input;
}

async function transcribe(audio: File, glossary: string[]): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new HttpError(500, "Falta OPENAI_API_KEY en los secrets (o usa el reconocimiento del iPhone)");
  if (audio.size > MAX_AUDIO_BYTES) throw new HttpError(413, "Audio demasiado largo");
  if (audio.size < 1500) return "";

  // El "prompt" orienta a Whisper: glosario + estilo literal (con errores y muletillas)
  const prompt = `${glossary.join(", ")}. Umm, yesterday I go to the office and, uh, the server are down.`;
  const ext = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  const fd = new FormData();
  fd.append("file", audio, `speech.${ext}`);
  fd.append("model", STT_MODEL);
  fd.append("language", "en");
  fd.append("prompt", prompt);
  fd.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
  });
  if (!res.ok) {
    console.error("Whisper error", res.status, await res.text());
    throw new HttpError(502, `Error de transcripción (${res.status})`);
  }
  return String((await res.json()).text ?? "").trim();
}

async function saveMistakes(sb: SupabaseClient, corrections: Any[]) {
  for (const c of corrections) {
    if (!c?.original || !c?.correct) continue;
    const type = ["grammar", "vocabulary", "preposition", "pronunciation"].includes(c.type) ? c.type : "grammar";
    const { data: existing } = await sb.from("mistakes").select("id, times_seen")
      .eq("original", c.original).eq("correction", c.correct).maybeSingle();
    if (existing) {
      await sb.from("mistakes").update({
        times_seen: existing.times_seen + 1, last_seen: new Date().toISOString(), due_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await sb.from("mistakes").insert({ type, original: c.original, correction: c.correct, explanation_es: c.explanation_es });
    }
  }
}

async function saveVocab(sb: SupabaseClient, vocab: { term: string; translation_es?: string; example?: string }[]) {
  const rows = vocab.filter((v) => v?.term).map((v) => ({
    term: String(v.term).toLowerCase().trim(), translation_es: v.translation_es, example: v.example,
  }));
  if (rows.length) await sb.from("vocabulary").upsert(rows, { onConflict: "user_id,term", ignoreDuplicates: true });
}

function madridDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
}
