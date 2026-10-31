// =====================================================================
// Repaso con repetición espaciada (SM-2). No usa IA: coste 0.
// Tarjetas de dos tipos:
//   - error:      ves tu frase errónea + pista → dices la correcta en voz alta
//   - vocabulario: ves la traducción → dices la palabra en inglés
// =====================================================================
import { sb } from "../auth.js";
import { $, esc, toast, TYPE_LABEL } from "../ui.js";
import { speak } from "../speech.js";
import { ttsOpts, logToday, addMinutes } from "../state.js";

const MAX_CARDS = 20;
let queue = [];
let current = null;
let startedAt = 0;
let reviewed = 0;

export async function startReview() {
  startedAt = Date.now();
  reviewed = 0;
  const area = $("#review-area");
  area.innerHTML = `<p class="muted">Cargando…</p>`;
  const now = new Date().toISOString();

  const [m, v] = await Promise.all([
    sb.from("mistakes").select("*").lte("due_at", now).order("due_at").limit(MAX_CARDS),
    sb.from("vocabulary").select("*").lte("due_at", now).order("due_at").limit(MAX_CARDS),
  ]);
  if (m.error || v.error) { toast("Error cargando el repaso"); return; }

  queue = [
    ...m.data.map((r) => ({ kind: "mistake", table: "mistakes", row: r })),
    ...v.data.map((r) => ({ kind: "vocab", table: "vocabulary", row: r })),
  ].sort(() => Math.random() - 0.5).slice(0, MAX_CARDS);

  next();
}

function next() {
  const area = $("#review-area");
  $("#review-count").textContent = queue.length ? `${queue.length} pendientes` : "";
  current = queue.shift();

  if (!current) {
    if (reviewed > 0) {
      logToday("review").catch(() => {});
      addMinutes(Math.max(1, Math.round((Date.now() - startedAt) / 60000))).catch(() => {});
      reviewed = 0;
    }
    area.innerHTML = `<div class="card flash">
      <div class="prompt">🎉 ¡Repaso completado!</div>
      <p class="muted">No hay más tarjetas pendientes. Vuelve mañana: la app te enseñará cada cosa justo antes de que la olvides.</p>
    </div>`;
    return;
  }

  const r = current.row;
  const front = current.kind === "mistake"
    ? `<div class="q">Corrige la frase y dila en voz alta <span class="tag">${esc(TYPE_LABEL[r.type] ?? r.type)}</span></div>
       <div class="prompt">❌ ${esc(r.original)}</div>
       <p class="muted">💡 ${esc(r.explanation_es)}</p>`
    : `<div class="q">¿Cómo se dice en inglés? Dilo en voz alta</div>
       <div class="prompt">${esc(r.translation_es)}</div>`;

  const answerText = current.kind === "mistake" ? r.correction : r.term;
  const back = `<div class="answer">${esc(answerText)} <button class="mini" id="rv-say">🔊</button></div>
    ${current.kind === "vocab" && r.example ? `<p class="muted">${esc(r.example)}</p>` : ""}
    <div class="grades">
      <button class="btn" data-q="0">😵 Otra vez</button>
      <button class="btn" data-q="3">😬 Difícil</button>
      <button class="btn" data-q="4">🙂 Bien</button>
      <button class="btn" data-q="5">😎 Fácil</button>
    </div>`;

  area.innerHTML = `<div class="card flash">${front}
    <div id="rv-back" hidden>${back}</div>
    <button class="btn primary block" id="rv-show">Ver respuesta</button></div>`;

  $("#rv-show").onclick = () => {
    $("#rv-back").hidden = false;
    $("#rv-show").hidden = true;
    say(answerText);
  };
  area.addEventListener("click", onClick, { once: false });
  $("#rv-back").querySelector("#rv-say").onclick = () => say(answerText);
}

function onClick(e) {
  const btn = e.target.closest("[data-q]");
  if (!btn || !current) return;
  $("#review-area").removeEventListener("click", onClick);
  grade(Number(btn.dataset.q));
}

async function grade(q) {
  const card = current;
  reviewed++;
  const upd = sm2(card.row, q);
  const { error } = await sb.from(card.table).update(upd).eq("id", card.row.id);
  if (error) toast("No se pudo guardar el repaso");
  if (q < 3) queue.push({ ...card, row: { ...card.row, ...upd } }); // vuelve a salir hoy
  next();
}

/** Algoritmo SM-2 simplificado. q: 0 (otra vez), 3 (difícil), 4 (bien), 5 (fácil) */
export function sm2(row, q) {
  let { reps = 0, interval_days = 0, ease = 2.5 } = row;
  ease = Number(ease); interval_days = Number(interval_days);

  if (q < 3) {
    reps = 0;
    interval_days = 0;
  } else {
    reps += 1;
    if (reps === 1) interval_days = q === 5 ? 3 : 1;
    else if (reps === 2) interval_days = q === 5 ? 7 : 3;
    else interval_days = Math.round(interval_days * ease * (q === 3 ? 0.8 : 1));
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  const due = new Date(Date.now() + (interval_days > 0 ? interval_days * 86_400_000 : 10 * 60_000));
  return { reps, interval_days, ease: Math.round(ease * 100) / 100, due_at: due.toISOString() };
}

function say(text) { return speak(text, ttsOpts()); }
