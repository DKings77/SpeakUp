// =====================================================================
// Llamadas a la Edge Function "tutor"
// =====================================================================
import { sb } from "./auth.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const FN_URL = `${SUPABASE_URL}/functions/v1/tutor`;

async function call(body) {
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sesión caducada: vuelve a entrar");

  const isForm = body instanceof FormData;
  let res;
  try {
    res = await fetch(FN_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        ...(isForm ? {} : { "Content-Type": "application/json" }),
      },
      body: isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new Error("Sin conexión con el servidor");
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error ?? `Error ${res.status}`);
  return out;
}

const audioForm = (fields, blob) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
  fd.append("audio", blob, `speech.${ext}`);
  return fd;
};

// Conversación
export const startSession = (mode, topic, focus = null) => call({ action: "start", mode, topic, focus });
export const sendText = (sessionId, text) => call({ action: "turn", session_id: sessionId, user_text: text });
export const sendAudio = (sessionId, blob) => call(audioForm({ action: "turn", session_id: sessionId }, blob));
export const endSession = (sessionId) => call({ action: "end", session_id: sessionId });

// Voz → texto (Whisper)
export const transcribe = (blob) => call(audioForm({ action: "transcribe" }, blob));

// Curso
export const getLesson = (unit, regenerate = false) => call({ action: "lesson", unit, regenerate });
export const checkSentence = (es, expected, said, grammar) => call({ action: "check", es, expected, said, grammar });

// Escucha
export const newListening = (level, topic) => call({ action: "listening", level, topic });
export const checkAnswer = (exerciseId, index, answer) => call({ action: "answer", exercise_id: exerciseId, index, answer });
