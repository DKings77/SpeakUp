// =====================================================================
// Escuchar y responder
// Pasos: Escuchar (sin texto) → Preguntas (respondes hablando) → Dictado → Transcripción
// =====================================================================
import { sb } from "../auth.js";
import { $, esc, show, toast, loading, sayBtn, correctionHTML, diffWords, similarity } from "../ui.js";
import { state, engine, ttsOpts, logToday, addMinutes, addVocab } from "../state.js";
import { holdToTalk, speak, stopSpeaking } from "../speech.js";
import { micState } from "./course.js";
import * as api from "../tutor.js";

const STEPS = ["Escuchar", "Preguntas", "Dictado", "Texto"];
const LEVEL_RATE = { A1: 0.7, A2: 0.8, B1: 0.9, B2: 1.0 };
export const LISTEN_TOPICS = [
  { id: "a random everyday situation", label: "🎲 Sorpresa" },
  { id: "IT work: servers, incidents, support calls, meetings", label: "💻 Trabajo IT" },
  { id: "travel: airport, hotel, train, tourist information", label: "✈️ Viajes" },
  { id: "sport: triathlon, cycling, running, football", label: "🚴 Deporte" },
  { id: "daily life: family, shopping, restaurants, neighbours", label: "🏠 Día a día" },
  { id: "phone calls and voicemail messages", label: "📞 Llamadas" },
  { id: "technology news and interesting facts", label: "📰 Noticias tech" },
];

let X = null;      // ejercicio abierto
let playToken = 0; // para cortar la reproducción
let onExit = null;

export function initListening({ exit }) {
  onExit = exit;
  $("#listen-topics").innerHTML = LISTEN_TOPICS
    .map((t) => `<button class="chip" data-topic="${esc(t.id)}">${esc(t.label)}</button>`).join("");
  $("#listen-topics").onclick = (e) => {
    const c = e.target.closest("[data-topic]");
    if (c) createExercise($("#listen-level").value, c.dataset.topic);
  };
  $("#lx-back").onclick = () => { stopAll(); X = null; onExit?.(); };
  $("#lx-prev").onclick = () => move(-1);
  $("#lx-next").onclick = () => move(+1);
}

/** Nivel de escucha sugerido según el nivel del perfil. */
const suggestedLevel = () => ({ "A1": "A1", "A1+": "A1", "A2": "A2", "A2+": "A2", "B1": "B1", "B1+": "B1", "B2": "B2" }[state.profile?.level] ?? "A1");

export async function renderListenHome() {
  if (!$("#listen-level").dataset.touched) $("#listen-level").value = suggestedLevel();
  $("#listen-level").onchange = () => ($("#listen-level").dataset.touched = "1");

  const { data } = await sb.from("listening_exercises").select("id, level, topic, content, score, created_at")
    .order("created_at", { ascending: false }).limit(8);
  $("#listen-history").innerHTML = data?.length
    ? data.map((r) => `<button class="unit-row" data-ex="${r.id}">
        <span class="ico">${r.score == null ? "▶" : r.score >= 75 ? "✓" : "↺"}</span>
        <span class="meta"><strong>${esc(r.content?.title ?? "Ejercicio")}</strong><small>${r.level} · ${new Date(r.created_at).toLocaleDateString("es-ES")}</small></span>
        ${r.score != null ? `<span class="score">${r.score}%</span>` : ""}</button>`).join("")
    : `<p class="muted">Todavía ninguno. Elige un tema arriba.</p>`;
  $("#listen-history").onclick = (e) => {
    const b = e.target.closest("[data-ex]");
    const r = data?.find((x) => x.id === b?.dataset.ex);
    if (r) openExercise({ id: r.id, level: r.level, content: r.content });
  };
}

async function createExercise(level, topic) {
  loading(true, "Sam está preparando el audio…");
  try {
    openExercise(await api.newListening(level, topic));
  } catch (e) {
    toast(e.message);
  } finally {
    loading(false);
  }
}

function openExercise(ex) {
  X = {
    ...ex, c: ex.content, step: 0, startedAt: Date.now(),
    qIdx: 0, qResults: {}, dictation: null, finished: false, showEs: ex.level === "A1" || ex.level === "A2",
  };
  $("#lx-title").textContent = X.c.title;
  $("#lx-level").textContent = `${X.level} · ${X.c.kind === "dialogue" ? "Diálogo" : "Monólogo"}`;
  show("listenex");
  render();
}

function move(dir) {
  stopAll();
  if (X.step === 1 && dir > 0 && X.qIdx < X.c.questions.length - 1) { X.qIdx++; return render(); }
  if (X.step === 1 && dir < 0 && X.qIdx > 0) { X.qIdx--; return render(); }
  X.step = Math.max(0, Math.min(3, X.step + dir));
  render();
}

const rate = (slow = false) => (LEVEL_RATE[X.level] ?? 0.85) * (state.profile?.listening_rate ?? 1) * (slow ? 0.75 : 1);

function stopAll() { playToken++; stopSpeaking(); }

/** Reproduce líneas en orden, con voz distinta para el hablante B. */
async function playLines(indices, slow = false) {
  stopAll();
  const token = playToken;
  for (const i of indices) {
    if (token !== playToken) return;
    const line = X.c.lines[i];
    document.querySelectorAll(".line-pill").forEach((p) => p.classList.toggle("playing", Number(p.dataset.line) === i));
    await speak(line.text, ttsOpts({ rate: rate(slow), alt: X.c.kind === "dialogue" && line.speaker === "B" }));
    await new Promise((r) => setTimeout(r, 350));
  }
  document.querySelectorAll(".line-pill").forEach((p) => p.classList.remove("playing"));
}

// ---------------------------------------------------------------------
function render() {
  const nav = $("#lx-steps");
  nav.innerHTML = STEPS.map((s, i) =>
    `<button class="${i === X.step ? "active" : i < X.step ? "done" : ""}" data-step="${i}">${i + 1}. ${s}</button>`).join("");
  nav.onclick = (e) => { const b = e.target.closest("[data-step]"); if (b) { stopAll(); X.step = Number(b.dataset.step); render(); } };

  $("#lx-prev").hidden = X.step === 0;
  $("#lx-next").hidden = X.step === 3;
  $("#lx-next").textContent = X.step === 1 && X.qIdx < X.c.questions.length - 1 ? "Siguiente pregunta →" : "Siguiente →";

  const body = $("#lx-body");
  body.scrollTop = 0;
  [stepListen, stepQuestions, stepDictation, stepTranscript][X.step](body);
}

// 1 · Escuchar
function stepListen(body) {
  const all = X.c.lines.map((_, i) => i);
  body.innerHTML = `
    <div class="card">
      <p>🎧 ${esc(X.c.context_es)}</p>
      <p class="muted">Escúchalo sin leer. Puedes repetirlo las veces que quieras, entero o frase a frase.</p>
      <div class="player">
        <button class="btn primary" id="lx-play">▶ Escuchar todo</button>
        <button class="btn" id="lx-slow">🐢 Lento</button>
        <button class="btn" id="lx-stop">⏹</button>
      </div>
      <p class="muted" style="text-align:center">Frase a frase${X.c.kind === "dialogue" ? " (borde discontinuo = 2ª persona)" : ""}:</p>
      <div class="line-pills">${X.c.lines.map((l, i) =>
        `<button class="line-pill ${l.speaker === "B" ? "b" : ""}" data-line="${i}">${i + 1}</button>`).join("")}</div>
    </div>
    <div class="card">
      <h2>❓ Lo que te voy a preguntar</h2>
      <p class="muted">Léelo antes de escuchar: así sabes en qué fijarte.</p>
      ${X.c.questions.map((q, i) => `<p>${i + 1}. ${esc(q.question_en)}${X.showEs ? `<br><small class="muted">${esc(q.question_es)}</small>` : ""}</p>`).join("")}
    </div>`;
  $("#lx-play").onclick = () => playLines(all);
  $("#lx-slow").onclick = () => playLines(all, true);
  $("#lx-stop").onclick = stopAll;
  body.querySelectorAll("[data-line]").forEach((b) => b.onclick = () => playLines([Number(b.dataset.line)]));
}

// 2 · Preguntas (respuesta hablada)
function stepQuestions(body) {
  const q = X.c.questions[X.qIdx];
  const r = X.qResults[X.qIdx];
  body.innerHTML = `
    <div class="card drill-card">
      <small class="muted">Pregunta ${X.qIdx + 1} de ${X.c.questions.length}</small>
      <div class="es-big">${esc(q.question_en)} ${sayBtn(q.question_en)}</div>
      ${X.showEs ? `<small class="muted">${esc(q.question_es)}</small>` : `<button class="btn small" id="q-es">Ver en español</button>`}
      <div class="mic-row"><button class="mic" id="q-mic">🎤</button></div>
      <p class="heard" id="q-heard">${r?.answer ? `Has dicho: "${esc(r.answer)}"` : "Responde hablando (frase corta)"}</p>
      <div id="q-result">${r?.html ?? ""}</div>
      <form id="q-type" class="type-form" style="margin-top:12px">
        <input id="q-input" type="text" placeholder="…o escríbelo" autocomplete="off">
        <button class="btn small" type="submit">OK</button>
      </form>
      <div class="player">
        <button class="btn small" id="q-replay">🔁 Volver a escuchar el audio</button>
      </div>
    </div>`;

  speak(q.question_en, ttsOpts({ rate: rate() }));
  $("#q-es")?.addEventListener("click", (e) => { e.target.outerHTML = `<small class="muted">${esc(q.question_es)}</small>`; });
  $("#q-replay").onclick = () => playLines(X.c.lines.map((_, i) => i));

  const evaluate = async (answer) => {
    $("#q-heard").textContent = answer ? `Has dicho: "${answer}"` : "No te he oído";
    if (!answer) return;
    $("#q-result").innerHTML = `<p class="muted">Comprobando…</p>`;
    try {
      const res = await api.checkAnswer(X.id, X.qIdx, answer);
      const icon = { yes: "✅", partly: "🟡", no: "❌" }[res.understood];
      const html = `<div class="result ${res.understood === "no" ? "ko" : "ok"}">${icon} ${esc(res.feedback_es)}
        <div style="margin-top:6px">${sayBtn(res.model_answer)} <strong>${esc(res.model_answer)}</strong></div>
        ${res.corrections.map(correctionHTML).join("")}</div>`;
      X.qResults[X.qIdx] = { answer, understood: res.understood, html };
      $("#q-result").innerHTML = html;
    } catch (e) { $("#q-result").innerHTML = `<div class="result ko">${esc(e.message)}</div>`; }
  };

  holdToTalk($("#q-mic"), {
    getEngine: engine,
    onInterim: (t) => ($("#q-heard").textContent = t),
    onState: micState("#q-heard"),
    onText: evaluate,
  });
  $("#q-type").onsubmit = (e) => { e.preventDefault(); const v = $("#q-input").value.trim(); if (v) evaluate(v); };
}

// 3 · Dictado
function stepDictation(body) {
  const line = X.c.lines[X.c.dictation_index];
  const d = X.dictation;
  body.innerHTML = `
    <div class="card drill-card">
      <h2>✍️ Dictado</h2>
      <p class="muted">Escucha la frase y repítela exactamente (hablando o escribiendo).</p>
      <div class="player">
        <button class="btn primary" id="d-play">▶ Escuchar</button>
        <button class="btn" id="d-slow">🐢 Lento</button>
      </div>
      <div class="mic-row"><button class="mic" id="d-mic">🎤</button></div>
      <p class="heard" id="d-heard">${d ? `Has dicho: "${esc(d.said)}"` : ""}</p>
      <div id="d-result">${d?.html ?? ""}</div>
      <form id="d-type" class="type-form" style="margin-top:12px">
        <input id="d-input" type="text" placeholder="…o escríbela" autocomplete="off">
        <button class="btn small" type="submit">OK</button>
      </form>
    </div>`;

  const play = (slow) => speak(line.text, ttsOpts({ rate: rate(slow), alt: X.c.kind === "dialogue" && line.speaker === "B" }));
  $("#d-play").onclick = () => play(false);
  $("#d-slow").onclick = () => play(true);
  play(false);

  const evaluate = (said) => {
    $("#d-heard").textContent = said ? `Has dicho: "${said}"` : "No te he oído";
    if (!said) return;
    const pct = Math.round(similarity(line.text, said) * 100);
    const diff = diffWords(line.text, said).map((w) => `<span class="${w.ok ? "hit" : "miss"}">${esc(w.tok)}</span>`).join(" ");
    const html = `<div class="result ${pct >= 80 ? "ok" : "ko"}">${pct >= 80 ? "✅" : "🔁"} ${pct}% correcto
      <p class="diff" style="font-size:1.1rem">${diff}</p>
      <small class="muted">En rojo, las palabras que se te escaparon.</small></div>`;
    X.dictation = { said, pct, html };
    $("#d-result").innerHTML = html;
  };

  holdToTalk($("#d-mic"), {
    getEngine: engine,
    onInterim: (t) => ($("#d-heard").textContent = t),
    onState: micState("#d-heard"),
    onText: evaluate,
  });
  $("#d-type").onsubmit = (e) => { e.preventDefault(); const v = $("#d-input").value.trim(); if (v) evaluate(v); };
}

// 4 · Transcripción + vocabulario + guardar resultado
function stepTranscript(body) {
  const answered = Object.values(X.qResults);
  const points = answered.reduce((s, r) => s + (r.understood === "yes" ? 1 : r.understood === "partly" ? 0.5 : 0), 0);
  const score = X.c.questions.length ? Math.round((points / X.c.questions.length) * 100) : 0;

  body.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="big-score">${score}%</div>
      <p class="muted">Comprensión (${answered.length}/${X.c.questions.length} preguntas respondidas)${X.dictation ? ` · Dictado ${X.dictation.pct}%` : ""}</p>
    </div>
    <div class="card transcript">
      <h2>📄 Transcripción</h2>
      <p class="muted">Léelo mientras lo escuchas: así conectas sonido y palabra.</p>
      <div class="player"><button class="btn small" id="t-play">▶ Escuchar todo</button></div>
      ${X.c.lines.map((l) => `<div class="ex-line">${sayBtn(l.text)}<div><span class="who">${esc(l.name)}:</span>${esc(l.text)}</div></div>`).join("")}
    </div>
    <div class="card">
      <h2>📚 Vocabulario clave</h2>
      ${X.c.key_vocab.map((v) => `<div class="ex-line">${sayBtn(v.term)}<div><span class="en">${esc(v.term)}</span> <span class="muted">— ${esc(v.es)}</span></div></div>`).join("")}
      <button class="btn block" id="t-vocab">➕ Añadir al repaso</button>
    </div>
    <button class="btn primary block" id="t-done">Terminar</button>`;

  $("#t-play").onclick = () => playLines(X.c.lines.map((_, i) => i));
  $("#t-vocab").onclick = async (e) => {
    await addVocab(X.c.key_vocab).catch(() => {});
    e.target.disabled = true; e.target.textContent = "✓ Añadido al repaso";
  };
  $("#t-done").onclick = () => { stopAll(); X = null; onExit?.(); };

  if (!X.finished) {
    X.finished = true;
    sb.from("listening_exercises").update({ score }).eq("id", X.id).then(() => {});
    logToday("listening").catch(() => {});
    addMinutes(Math.round((Date.now() - X.startedAt) / 60000)).catch(() => {});
  }
}
