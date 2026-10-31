// =====================================================================
// Utilidades de interfaz
// =====================================================================

export const $ = (sel) => document.querySelector(sel);

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const TABS = ["today", "course", "listen", "talkhome", "review"];
const SCREENS = ["login", ...TABS, "lesson", "listenex", "talk", "summary", "settings"];

export function show(name) {
  for (const s of SCREENS) $(`#screen-${s}`).hidden = s !== name;
  const tabbed = TABS.includes(name);
  $("#tabbar").hidden = !tabbed;
  document.querySelectorAll("#tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  window.scrollTo(0, 0);
}

let toastTimer;
export function toast(msg, ms = 3500) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), ms);
}

export function loading(on, text = "Cargando…") {
  $("#loading").hidden = !on;
  $("#loading-text").textContent = text;
}

export const TYPE_LABEL = {
  grammar: "gramática", vocabulary: "vocabulario", preposition: "preposición", pronunciation: "pronunciación",
};

export function correctionHTML(c) {
  return `<div class="corr">
    <span class="from">${esc(c.original)}</span> → <span class="to">${esc(c.correct)}</span>
    <span class="tag">${esc(TYPE_LABEL[c.type] ?? c.type)}</span>
    <span class="why">${esc(c.explanation_es)}</span>
  </div>`;
}

export function vocabHTML(v) {
  return `<div class="vocab-line"><strong>${esc(v.term)}</strong> — ${esc(v.translation_es ?? v.es)}
    ${v.example ? `<br><small class="muted">${esc(v.example)}</small>` : ""}</div>`;
}

/** Botón 🔊 que lee un texto en inglés (data-say). Ver app.js: delegación global. */
export const sayBtn = (text, label = "🔊") =>
  `<button class="mini" data-say="${esc(text)}" aria-label="Escuchar">${label}</button>`;

// ---------------------------------------------------------------------
// Comparar lo que dijiste con lo esperado (sin IA, coste 0)
// ---------------------------------------------------------------------
const CONTRACTIONS = {
  "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is", "it's": "it is", "we're": "we are",
  "they're": "they are", "i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have",
  "i'll": "i will", "you'll": "you will", "it'll": "it will", "we'll": "we will", "i'd": "i would",
  "don't": "do not", "doesn't": "does not", "didn't": "did not", "isn't": "is not", "aren't": "are not",
  "wasn't": "was not", "weren't": "were not", "can't": "cannot", "won't": "will not", "haven't": "have not",
  "hasn't": "has not", "couldn't": "could not", "wouldn't": "would not", "shouldn't": "should not",
  "there's": "there is", "that's": "that is", "what's": "what is", "let's": "let us",
};
const NUMBERS = { one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10" };

export function words(s) {
  return String(s ?? "").toLowerCase().replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean)
    .flatMap((w) => (CONTRACTIONS[w] ?? w).split(" "))
    .map((w) => NUMBERS[w] ?? w.replace(/'s$/, "").replace(/'/g, ""))
    .filter((w) => !["uh", "um", "umm", "er", "ah"].includes(w));
}

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Similitud 0..1 a nivel de palabras. */
export function similarity(a, b) {
  const x = words(a), y = words(b);
  if (!x.length && !y.length) return 1;
  return 1 - lev(x, y) / Math.max(x.length, y.length);
}

/** Palabras de target marcadas como acertadas o no según lo dicho. */
export function diffWords(target, said) {
  const saidSet = words(said);
  const pool = [...saidSet];
  return String(target).split(/\s+/).filter(Boolean).map((tok) => {
    const w = words(tok)[0];
    const i = w ? pool.indexOf(w) : -1;
    if (i >= 0) pool.splice(i, 1);
    return { tok, ok: !w || i >= 0 };
  });
}

export function madridDate(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(d);
}
