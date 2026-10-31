// =====================================================================
// Estado compartido: perfil, progreso del curso y plan diario
// =====================================================================
import { sb } from "./auth.js";
import { madridDate } from "./ui.js";
import { UNITS } from "./curriculum.js";
import { pickEngine } from "./speech.js";

export const state = {
  profile: null,
  unitProgress: {}, // unit_id → { status, best_score, attempts }
};

export const engine = () => pickEngine(state.profile?.stt_engine);
export const ttsOpts = (extra = {}) => ({ rate: state.profile?.tts_rate ?? 0.8, voiceName: state.profile?.tts_voice, ...extra });

export async function loadProfile() {
  let { data } = await sb.from("profile").select("*").maybeSingle();
  if (!data) data = (await sb.from("profile").insert({}).select().single()).data;
  state.profile = data ?? {
    level: "A1+", tts_rate: 0.8, stt_engine: "auto", spanish_support: 2, glossary: [], custom_topics: [], current_unit: "a1-01",
  };
  return state.profile;
}

export async function updateProfile(fields) {
  const { data, error } = await sb.from("profile").update({ ...fields, updated_at: new Date().toISOString() })
    .eq("user_id", state.profile.user_id).select().single();
  if (error) throw error;
  state.profile = data;
  return data;
}

export async function loadUnitProgress() {
  const { data } = await sb.from("unit_progress").select("*");
  state.unitProgress = Object.fromEntries((data ?? []).map((r) => [r.unit_id, r]));
  return state.unitProgress;
}

export const completedCount = () => Object.values(state.unitProgress).filter((r) => r.status === "completed").length;

/** Unidad recomendada: la primera no completada. */
export function nextUnit() {
  return UNITS.find((x) => state.unitProgress[x.id]?.status !== "completed") ?? UNITS[UNITS.length - 1];
}

/** Guarda el resultado del test de una unidad. */
export async function saveUnitResult(unitId, score, passed) {
  const prev = state.unitProgress[unitId];
  const row = {
    unit_id: unitId,
    status: passed || prev?.status === "completed" ? "completed" : "in_progress",
    best_score: Math.max(score, prev?.best_score ?? 0),
    attempts: (prev?.attempts ?? 0) + 1,
    completed_at: passed ? new Date().toISOString() : prev?.completed_at ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("unit_progress").upsert(row, { onConflict: "user_id,unit_id" });
  if (error) throw error;
  state.unitProgress[unitId] = { ...prev, ...row };
  if (passed) await updateProfile({ current_unit: nextUnit().id }).catch(() => {});
}

// ---------------------------------------------------------------------
// Plan diario
// ---------------------------------------------------------------------
export async function getToday() {
  const { data } = await sb.from("daily_log").select("*").eq("day", madridDate()).maybeSingle();
  return data ?? { review: false, lesson: false, listening: false, talk: false };
}

export async function logToday(field) {
  const day = madridDate();
  const { data } = await sb.from("daily_log").select("*").eq("day", day).maybeSingle();
  if (data) await sb.from("daily_log").update({ [field]: true }).eq("day", day).eq("user_id", data.user_id);
  else await sb.from("daily_log").insert({ day, [field]: true });
}

/** Suma minutos de práctica fuera de la conversación (lecciones, escucha, repaso) y la racha. */
export async function addMinutes(minutes) {
  if (minutes <= 0) return;
  const today = madridDate();
  const yesterday = madridDate(new Date(Date.now() - 86_400_000));
  const { data: p } = await sb.from("progress").select("*").maybeSingle();
  let streak = p?.streak_days ?? 0;
  if (p?.last_practice_date !== today) streak = p?.last_practice_date === yesterday ? streak + 1 : 1;
  const row = { streak_days: streak, last_practice_date: today, total_minutes: (p?.total_minutes ?? 0) + minutes };
  if (p) await sb.from("progress").update(row).eq("user_id", p.user_id);
  else await sb.from("progress").insert({ ...row, total_sessions: 0 });
}

/** Añade vocabulario al repaso (sin duplicar). */
export async function addVocab(items) {
  const rows = items.filter((v) => v?.term).map((v) => ({
    term: String(v.term).toLowerCase().trim(), translation_es: v.es ?? v.translation_es, example: v.example ?? null,
  }));
  if (rows.length) await sb.from("vocabulary").upsert(rows, { onConflict: "user_id,term", ignoreDuplicates: true });
}
