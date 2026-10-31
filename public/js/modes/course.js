// =====================================================================
// Curso A1 → B2: lista de unidades y reproductor de lecciones
// Pasos: Explicación → Vocabulario → Pronunciación → Habla → Test → Resultado
// =====================================================================
import { $, esc, show, toast, loading, sayBtn, correctionHTML, similarity } from "../ui.js";
import { LEVELS, UNITS, UNIT_BY_ID, PASS_SCORE } from "../curriculum.js";
import { state, engine, ttsOpts, nextUnit, saveUnitResult, logToday, addMinutes, addVocab } from "../state.js";
import { holdToTalk, speak, stopSpeaking } from "../speech.js";
import * as api from "../tutor.js";

const STEPS = ["Explicación", "Vocabulario", "Pronunciación", "Habla", "Test"];
let L = null; // estado de la lección abierta
let onPracticeWithSam = null;
let onExit = null;

export function initCourse({ practiceWithSam, exit }) {
  onPracticeWithSam = practiceWithSam;
  onExit = exit;
  $("#lesson-back").onclick = closeLesson;
  $("#lesson-prev").onclick = () => go(-1);
  $("#lesson-next").onclick = () => go(+1);
}

// ---------------------------------------------------------------------
// Lista de unidades
// ---------------------------------------------------------------------
export function renderCourse() {
  const current = nextUnit().id;
  $("#course-list").innerHTML = LEVELS.map((lv) => {
    const units = UNITS.filter((x) => x.level === lv.id);
    const done = units.filter((x) => state.unitProgress[x.id]?.status === "completed").length;
    return `<div class="level-block">
      <div class="level-head"><h2>${esc(lv.name)}</h2><small class="muted">${done}/${units.length}</small></div>
      <p class="muted">${esc(lv.goal)}</p>
      ${units.map((x, i) => {
        const p = state.unitProgress[x.id];
        const cls = p?.status === "completed" ? "done" : x.id === current ? "current" : "";
        const ico = p?.status === "completed" ? "✓" : x.kind === "exam" ? "🏁" : i + 1;
        return `<button class="unit-row ${cls}" data-unit="${x.id}">
          <span class="ico">${ico}</span>
          <span class="meta"><strong>${esc(x.title)}</strong><small>${esc(x.grammar)}</small></span>
          ${p?.best_score ? `<span class="score">${p.best_score}%</span>` : ""}
        </button>`;
      }).join("")}
    </div>`;
  }).join("");

  $("#course-list").onclick = (e) => {
    const b = e.target.closest("[data-unit]");
    if (b) openLesson(b.dataset.unit);
  };
  // Llevar la vista a la unidad actual
  requestAnimationFrame(() => $(`.unit-row.current`)?.scrollIntoView({ block: "center" }));
}

// ---------------------------------------------------------------------
// Abrir lección
// ---------------------------------------------------------------------
export async function openLesson(unitId) {
  const unit = UNIT_BY_ID[unitId];
  if (!unit) return;
  loading(true, "Preparando la lección… La primera vez tarda unos 20-30 segundos; luego queda guardada.");
  try {
    const { content } = await api.getLesson(unit);
    L = {
      unit, c: content, step: 0, startedAt: Date.now(),
      pronIdx: 0, pronOk: new Set(),
      drillIdx: 0, drillState: {},
      quizIdx: 0, quizAnswers: [], finished: false,
    };
    $("#lesson-title").textContent = unit.title;
    $("#lesson-unit").textContent = `${unit.level} · ${unit.kind === "exam" ? "Examen" : "Unidad " + unit.id.slice(3)}`;
    show("lesson");
    render();
  } catch (e) {
    toast(e.message);
  } finally {
    loading(false);
  }
}

function closeLesson() {
  stopSpeaking();
  if (L && !L.finished && !confirm("¿Salir de la lección? El avance de esta lección no se guardará.")) return;
  L = null;
  onExit?.();
}

function go(dir) {
  stopSpeaking();
  if (L.step === 4 && dir > 0) {
    // En el test, "Siguiente" avanza de pregunta (solo si está contestada)
    if (L.quizAnswers[L.quizIdx] == null) return toast("Elige una respuesta");
    if (L.quizIdx < L.c.quiz.length - 1) { L.quizIdx++; return render(); }
    return finishLesson();
  }
  if (L.step === 5) return; // resultado
  L.step = Math.max(0, Math.min(4, L.step + dir));
  render();
}

// ---------------------------------------------------------------------
// Pintar el paso actual
// ---------------------------------------------------------------------
function render() {
  const steps = $("#lesson-steps");
  steps.innerHTML = STEPS.map((s, i) =>
    `<button class="${i === L.step ? "active" : i < L.step ? "done" : ""}" data-step="${i}">${i + 1}. ${s}</button>`).join("");
  steps.onclick = (e) => {
    const b = e.target.closest("[data-step]");
    if (b && L.step !== 5) { stopSpeaking(); L.step = Number(b.dataset.step); render(); }
  };
  steps.querySelector(".active")?.scrollIntoView({ inline: "center", block: "nearest" });

  $("#lesson-prev").hidden = L.step === 0 || L.step === 5;
  $("#lesson-next").hidden = L.step === 5;
  $("#lesson-next").textContent = L.step === 4
    ? (L.quizIdx < L.c.quiz.length - 1 ? "Siguiente pregunta →" : "Ver resultado →")
    : L.step === 3 ? "Ir al test →" : "Siguiente →";

  const body = $("#lesson-body");
  body.scrollTop = 0;
  [stepExplain, stepVocab, stepPron, stepSpeak, stepQuiz, stepResult][L.step](body);
}

// 1 · Explicación
function stepExplain(body) {
  const c = L.c;
  body.innerHTML = `
    <div class="card"><p>🎯 ${esc(c.intro_es)}</p></div>
    ${c.explanation.map((s) => `
      <div class="card">
        <h2>${esc(s.title_es)}</h2>
        <p>${esc(s.body_es).replace(/\n/g, "<br>")}</p>
        ${s.examples.map((ex) => `<div class="ex-line">${sayBtn(ex.en)}<div><span class="en">${esc(ex.en)}</span><span class="es">${esc(ex.es)}</span></div></div>`).join("")}
      </div>`).join("")}
    ${c.common_mistakes?.length ? `<div class="card"><h2>⚠️ Errores típicos de hispanohablantes</h2>
      ${c.common_mistakes.map((m) => `<div class="mistake-line">
        <span class="corr"><span class="from">${esc(m.wrong)}</span> → <span class="to">${esc(m.right)}</span></span> ${sayBtn(m.right)}
        <br><small class="muted">${esc(m.why_es)}</small></div>`).join("")}</div>` : ""}`;
}

// 2 · Vocabulario
function stepVocab(body) {
  body.innerHTML = `
    <div class="card">
      <h2>📚 Vocabulario</h2>
      <p class="muted">Toca 🔊 y repítelo en voz alta. Se añadirá a tu repaso al terminar la lección.</p>
      ${L.c.vocab.map((v) => `<div class="ex-line">${sayBtn(v.term)}<div>
        <span class="en">${esc(v.term)}</span> <span class="muted">— ${esc(v.es)}</span>
        <span class="es">${esc(v.example)} ${sayBtn(v.example, "▶")}</span></div></div>`).join("")}
    </div>`;
}

// 3 · Pronunciación
function stepPron(body) {
  const p = L.c.pronunciation;
  const words = p.words ?? [];
  const target = words[L.pronIdx] ?? "";
  body.innerHTML = `
    <div class="card"><h2>👄 Pronunciación</h2><p>${esc(p.tip_es)}</p></div>
    <div class="card drill-card">
      <div>${words.map((w, i) => `<span class="word-pill ${L.pronOk.has(i) ? "ok" : ""}" data-w="${i}">${L.pronOk.has(i) ? "✓ " : ""}${esc(w)}</span>`).join("")}</div>
      <p class="muted" style="margin-top:14px">Escucha y repite:</p>
      <div class="es-big">${esc(target)} ${sayBtn(target)} ${sayBtn(target, "🐢")}</div>
      <div class="mic-row"><button class="mic" id="pron-mic">🎤</button></div>
      <p class="heard" id="pron-heard">Mantén pulsado y dilo</p>
      <div id="pron-result"></div>
    </div>`;

  // "🐢" lento
  body.querySelectorAll('[data-say]').forEach((b) => { if (b.textContent === "🐢") b.dataset.rate = "0.55"; });
  body.querySelectorAll("[data-w]").forEach((el) => el.onclick = () => { L.pronIdx = Number(el.dataset.w); render(); });

  holdToTalk($("#pron-mic"), {
    getEngine: engine,
    onInterim: (t) => ($("#pron-heard").textContent = t),
    onState: micState("#pron-heard"),
    onText: async (said) => {
      $("#pron-heard").textContent = said ? `Has dicho: "${said}"` : "No te he oído";
      if (!said) return;
      const ok = similarity(target, said) >= 0.75;
      $("#pron-result").innerHTML = ok
        ? `<div class="result ok">✅ ¡Bien dicho!</div>`
        : `<div class="result ko">🔁 Casi. Escucha otra vez y repite despacio.</div>`;
      if (ok) {
        L.pronOk.add(L.pronIdx);
        setTimeout(() => { if (L?.step === 2 && L.pronIdx < words.length - 1) { L.pronIdx++; render(); } }, 900);
      } else {
        speak(target, ttsOpts({ rate: 0.6 }));
      }
    },
  });
}

// 4 · Habla (frases en español → dilas en inglés)
function stepSpeak(body) {
  const drills = L.c.drills ?? [];
  const d = drills[L.drillIdx];
  if (!d) { body.innerHTML = `<p class="muted">Sin ejercicios.</p>`; return; }
  const st = L.drillState[L.drillIdx] ?? {};

  body.innerHTML = `
    <div class="card drill-card">
      <small class="muted">Frase ${L.drillIdx + 1} de ${drills.length} · Dilo en inglés</small>
      <div class="es-big">${esc(d.es)}</div>
      <div class="mic-row"><button class="mic" id="drill-mic">🎤</button></div>
      <p class="heard" id="drill-heard">${st.said ? `Has dicho: "${esc(st.said)}"` : "Mantén pulsado y habla"}</p>
      <div id="drill-result">${st.html ?? ""}</div>
      <form id="drill-type" class="type-form" style="margin-top:12px">
        <input id="drill-input" type="text" placeholder="…o escríbelo" autocomplete="off">
        <button class="btn small" type="submit">OK</button>
      </form>
      <div class="player">
        <button class="btn small" id="drill-show">👀 Ver respuesta</button>
        <button class="btn small" id="drill-next">${L.drillIdx < drills.length - 1 ? "Siguiente frase →" : "✓ Terminado"}</button>
      </div>
    </div>`;

  const evaluate = async (said) => {
    $("#drill-heard").textContent = said ? `Has dicho: "${said}"` : "No te he oído";
    if (!said) return;
    const targets = [d.en, ...(d.alt ?? [])];
    const best = Math.max(...targets.map((t) => similarity(t, said)));
    let html;
    if (best >= 0.85) {
      html = `<div class="result ok">✅ ¡Perfecto! ${sayBtn(d.en)} <strong>${esc(d.en)}</strong></div>`;
    } else {
      $("#drill-result").innerHTML = `<p class="muted">Comprobando…</p>`;
      try {
        const r = await api.checkSentence(d.es, d.en, said, L.unit.grammar);
        html = r.ok
          ? `<div class="result ok">✅ ${esc(r.feedback_es)}<br><small>También se dice: ${sayBtn(d.en)} ${esc(d.en)}</small></div>`
          : `<div class="result ko">🔁 ${esc(r.feedback_es)}
              ${r.corrections.map(correctionHTML).join("")}
              <div style="margin-top:6px">${sayBtn(r.better ?? d.en)} <strong>${esc(r.better ?? d.en)}</strong></div></div>`;
      } catch (e) { html = `<div class="result ko">${esc(e.message)}</div>`; }
    }
    L.drillState[L.drillIdx] = { said, html };
    $("#drill-result").innerHTML = html;
  };

  holdToTalk($("#drill-mic"), {
    getEngine: engine,
    onInterim: (t) => ($("#drill-heard").textContent = t),
    onState: micState("#drill-heard"),
    onText: evaluate,
  });
  $("#drill-type").onsubmit = (e) => { e.preventDefault(); const v = $("#drill-input").value.trim(); if (v) evaluate(v); };
  $("#drill-show").onclick = () => {
    $("#drill-result").innerHTML = `<div class="result">${sayBtn(d.en)} <strong>${esc(d.en)}</strong>
      ${(d.alt ?? []).map((a) => `<br><small class="muted">También: ${esc(a)}</small>`).join("")}</div>`;
    speak(d.en, ttsOpts());
  };
  $("#drill-next").onclick = () => {
    if (L.drillIdx < drills.length - 1) { L.drillIdx++; render(); } else { L.step = 4; render(); }
  };
}

// 5 · Test
function stepQuiz(body) {
  const q = L.c.quiz[L.quizIdx];
  if (!q) { body.innerHTML = `<p class="muted">Sin preguntas.</p>`; return; }
  const ans = L.quizAnswers[L.quizIdx];
  body.innerHTML = `
    <div class="card">
      <small class="muted">Pregunta ${L.quizIdx + 1} de ${L.c.quiz.length} · Aprobado: ${PASS_SCORE}%</small>
      <div class="quiz-q">${esc(q.question)}</div>
      ${q.options.map((o, i) => {
        let cls = "";
        if (ans != null) cls = i === q.answer_index ? "right" : i === ans ? "wrong" : "";
        return `<button class="quiz-opt ${cls}" data-opt="${i}" ${ans != null ? "disabled" : ""}>${esc(o)}</button>`;
      }).join("")}
      ${ans != null ? `<div class="result ${ans === q.answer_index ? "ok" : "ko"}">${ans === q.answer_index ? "✅" : "❌"} ${esc(q.explanation_es)}</div>` : ""}
    </div>`;
  body.querySelectorAll("[data-opt]").forEach((b) => b.onclick = () => {
    L.quizAnswers[L.quizIdx] = Number(b.dataset.opt);
    render();
  });
}

// 6 · Resultado
async function finishLesson() {
  const total = L.c.quiz.length;
  const right = L.c.quiz.filter((q, i) => L.quizAnswers[i] === q.answer_index).length;
  const score = total ? Math.round((right / total) * 100) : 100;
  const passed = score >= PASS_SCORE;
  L.score = score; L.passed = passed; L.step = 5; L.finished = true;
  render();

  try {
    await saveUnitResult(L.unit.id, score, passed);
    await addVocab(L.c.vocab ?? []);
    await logToday("lesson");
    await addMinutes(Math.round((Date.now() - L.startedAt) / 60000));
  } catch (e) { toast("No se pudo guardar el progreso: " + e.message); }
}

function stepResult(body) {
  const next = nextUnit();
  const t = L.c.speaking_task;
  body.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="big-score">${L.score}%</div>
      <h2>${L.passed ? "🎉 ¡Unidad superada!" : "Casi… repasa y vuelve a intentarlo"}</h2>
      <p class="muted">${L.passed ? "El vocabulario ya está en tu repaso." : `Necesitas ${PASS_SCORE}% para superar la unidad.`}</p>
    </div>
    ${t ? `<div class="card">
      <h2>🗣️ Ahora, úsalo hablando con Sam</h2>
      <p>${esc(t.prompt_es)}</p>
      <p class="muted">Ejemplo: ${esc(t.example_answer)} ${sayBtn(t.example_answer)}</p>
      <button class="btn primary block" id="res-sam">Practicar con Sam</button>
    </div>` : ""}
    <div class="stack">
      ${L.passed && next.id !== L.unit.id ? `<button class="btn primary" id="res-next">Siguiente: ${esc(next.title)} →</button>` : ""}
      ${!L.passed ? `<button class="btn primary" id="res-retry">Repetir el test</button>` : ""}
      <button class="btn" id="res-course">Volver al curso</button>
    </div>`;

  $("#res-sam")?.addEventListener("click", () => {
    const u = L.unit; L = null;
    onPracticeWithSam?.(u, t.prompt_en);
  });
  $("#res-next")?.addEventListener("click", () => openLesson(next.id));
  $("#res-retry")?.addEventListener("click", () => { L.quizIdx = 0; L.quizAnswers = []; L.step = 4; L.finished = false; render(); });
  $("#res-course").onclick = () => { L = null; onExit?.(); };
}

// ---------------------------------------------------------------------
export function micState(sel) {
  return (s, msg) => {
    const el = $(sel);
    if (!el) return;
    if (s === "recording") el.textContent = "🔴 Te escucho… suelta al terminar";
    else if (s === "busy") el.textContent = "…";
    else if (s === "short") el.textContent = "Mantén pulsado mientras hablas";
    else if (s === "error") { el.textContent = ""; toast(msg); }
  };
}
