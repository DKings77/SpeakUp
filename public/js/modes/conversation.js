// =====================================================================
// Hablar con Sam: conversación libre, mis temas, role-play y práctica de unidad
// =====================================================================
import { $, esc, show, toast, correctionHTML, vocabHTML } from "../ui.js";
import { getListener, speak, stopSpeaking, releaseMic } from "../speech.js";
import { state, engine, ttsOpts, logToday } from "../state.js";
import * as api from "../tutor.js";

const MIN_HOLD_MS = 350;
const HF_NO_SPEECH_MS = 15000; // manos libres: si no hablas en 15 s, se pausa

const st = {
  sessionId: null, engine: "webspeech", listener: null,
  recording: false, busy: false, t0: 0, startedAt: 0, timer: null,
  turns: 0, corrections: [], vocab: [],
  hideText: localGet("hideTutorText") === "1",
  // Manos libres
  handsFree: localGet("handsFree") === "1",
  paused: false, heard: false, lastChange: 0, lastLive: "", vadTimer: null, meter: null, emptyTries: 0,
};

/** Segundos de silencio para dar tu frase por terminada (Ajustes). */
export const hfSilenceMs = () => Number(localGet("hfSilence")) || 2000;

function localGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

export function initConversation() {
  const btn = $("#btn-talk");
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (st.handsFree) return handsFreeTap(); // manos libres: un toque = enviar ya / reanudar
    btn.setPointerCapture?.(e.pointerId);
    beginRecording();
  });
  ["pointerup", "pointercancel"].forEach((ev) => btn.addEventListener(ev, () => { if (!st.handsFree) finishRecording(); }));
  btn.addEventListener("contextmenu", (e) => e.preventDefault());

  // Barra espaciadora en el PC = mantener pulsado (o tocar, en manos libres)
  const typing = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  document.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || e.repeat || $("#screen-talk").hidden || typing()) return;
    e.preventDefault();
    if (st.handsFree) handsFreeTap(); else beginRecording();
  });
  document.addEventListener("keyup", (e) => {
    if (e.code !== "Space" || $("#screen-talk").hidden || typing()) return;
    e.preventDefault();
    if (!st.handsFree) finishRecording();
  });

  $("#btn-handsfree").addEventListener("click", toggleHandsFree);
  renderHandsFreeBtn();

  $("#btn-dontknow").addEventListener("click", () => sendTyped("no sé"));
  $("#btn-keyboard").addEventListener("click", () => {
    const f = $("#type-form"); f.hidden = !f.hidden;
    if (!f.hidden) $("#type-input").focus();
  });
  $("#type-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#type-input").value.trim();
    if (v) { $("#type-input").value = ""; sendTyped(v); }
  });
  $("#btn-toggle-text").addEventListener("click", () => {
    st.hideText = !st.hideText;
    localSet("hideTutorText", st.hideText ? "1" : "0");
    toast(st.hideText ? "Texto de Sam oculto: toca la burbuja para verlo" : "Texto de Sam visible");
    document.querySelectorAll(".bubble.tutor").forEach((b) => b.classList.toggle("hidden-text", st.hideText));
  });
  $("#btn-end").addEventListener("click", endConversation);
}

/** mode: freetalk | roleplay · focus: gramática de la unidad a practicar (opcional) */
export async function startConversation(mode, topic, label, focus = null) {
  Object.assign(st, { sessionId: null, turns: 0, corrections: [], vocab: [] });
  st.engine = engine();
  st.listener = getListener(st.engine, showLive);

  $("#chat").innerHTML = "";
  $("#talk-topic").textContent = label;
  $("#type-form").hidden = true;
  show("talk");
  setBusy(true, "Sam está preparando la conversación…");

  st.startedAt = Date.now();
  clearInterval(st.timer);
  st.timer = setInterval(updateTimer, 1000);
  updateTimer();

  try {
    const res = await api.startSession(mode, topic, focus);
    st.sessionId = res.session_id;
    addTutorBubble(res.reply);
    setBusy(true, "🔊 Sam está hablando…");
    await say(res.reply);
  } catch (e) {
    toast(e.message);
    clearInterval(st.timer);
    show("talkhome");
  } finally {
    setBusy(false);
  }
  st.paused = false;
  st.emptyTries = 0;
  autoListen();
}

async function beginRecording() {
  if (st.busy || st.recording || !st.sessionId) return;
  stopSpeaking();
  st.recording = true;
  st.t0 = Date.now();
  $("#btn-talk").classList.add("recording");
  status(st.handsFree ? "🟢 Te escucho… habla cuando quieras" : "🔴 Te escucho… suelta para enviar");
  try {
    await st.listener.start();
    if (st.handsFree && st.recording) startVad();
  } catch (e) {
    st.recording = false;
    stopVad();
    $("#btn-talk").classList.remove("recording");
    status("");
    toast(e.name === "NotAllowedError" ? "Permite el micrófono para poder hablar" : e.message);
    if (st.handsFree) pauseHandsFree();
  }
}

async function finishRecording() {
  if (!st.recording) return;
  st.recording = false;
  stopVad();
  $("#btn-talk").classList.remove("recording");
  showLive("");

  if (!st.handsFree && Date.now() - st.t0 < MIN_HOLD_MS) {
    st.listener.abort();
    status("Mantén pulsado el botón mientras hablas");
    return;
  }

  setBusy(true, "🤔 Pensando…");
  let userBubble = null;
  try {
    let res;
    if (st.engine === "whisper") {
      // Con Whisper enviamos el audio directamente: una sola llamada (transcribe + responde)
      const blob = await st.listener.stopRaw();
      if (!blob || blob.size < 1500) return notHeard();
      userBubble = addUserBubble("…");
      res = await api.sendAudio(st.sessionId, blob);
      if (res.empty) { userBubble.remove(); return notHeard(); }
      userBubble.querySelector(".text").textContent = res.user_text;
    } else {
      const text = await st.listener.stop();
      if (!text) return notHeard();
      userBubble = addUserBubble(text);
      res = await api.sendText(st.sessionId, text);
    }
    await handleResult(res, userBubble);
  } catch (e) {
    userBubble?.remove();
    toast(e.message);
    setBusy(false);
    if (st.handsFree) pauseHandsFree("⏸ Ha habido un error · toca 🎤 para seguir");
  }
}

function notHeard() {
  setBusy(false, "No te he oído. Prueba otra vez 🙂");
  if (!st.handsFree) return;
  st.emptyTries++;
  if (st.emptyTries >= 2) pauseHandsFree();
  else setTimeout(autoListen, 400);
}

async function sendTyped(text) {
  if (st.busy || !st.sessionId) return;
  if (st.recording) { st.recording = false; stopVad(); st.listener.abort(); $("#btn-talk").classList.remove("recording"); showLive(""); }
  stopSpeaking();
  setBusy(true, "🤔 Pensando…");
  const userBubble = addUserBubble(text);
  try {
    await handleResult(await api.sendText(st.sessionId, text), userBubble);
  } catch (e) {
    userBubble.remove();
    toast(e.message);
    setBusy(false);
  }
}

async function handleResult(res, userBubble) {
  st.turns++;
  if (st.turns === 1) logToday("talk").catch(() => {});

  if (res.corrected_sentence && userBubble) {
    const fixed = document.createElement("div");
    fixed.className = "fixed";
    fixed.innerHTML = `✔ ${esc(res.corrected_sentence)} <button class="mini" aria-label="Escuchar">🔊</button>
      ${res.corrected_sentence_es ? `<div class="fixed-es">🇪🇸 ${esc(res.corrected_sentence_es)}</div>` : ""}
      ${res.why_es ? `<div class="fixed-why">💬 ${esc(res.why_es)}</div>` : ""}`;
    fixed.querySelector("button").onclick = () => say(res.corrected_sentence);
    userBubble.appendChild(fixed);
  }

  const parts = [];
  if (res.corrections?.length) {
    parts.push(`<h3>📋 Correcciones</h3>${res.corrections.map(correctionHTML).join("")}`);
    st.corrections.push(...res.corrections);
  } else if (res.praise_es) {
    parts.push(`<div class="praise">👏 ${esc(res.praise_es)}</div>`);
  }
  if (res.new_vocab?.length) {
    parts.push(`<h3 style="margin-top:8px">📚 Nuevo</h3>${res.new_vocab.map(vocabHTML).join("")}`);
    st.vocab.push(...res.new_vocab);
  }
  if (parts.length) addCard("feedback", parts.join(""));

  if (res.hint) {
    const card = addCard("feedback hint",
      `💡 Prueba a decir: <strong>${esc(res.hint.model_sentence)}</strong>
       <button class="mini" aria-label="Escuchar">🔊</button><br><small>${esc(res.hint.translation_es)}</small>`);
    card.querySelector("button").onclick = () => say(res.hint.model_sentence);
  }

  addTutorBubble(res.reply);
  status("🔊 Sam está hablando… (pulsa para interrumpir)");
  st.busy = false;
  $("#btn-talk").classList.remove("busy");
  await say(res.reply);
  st.emptyTries = 0;
  if (st.handsFree) autoListen();
  else if (!st.recording && !st.busy) status("Mantén pulsado para hablar");
}

// ---------------------------------------------------------------------
// Manos libres: escucha sola cuando Sam termina, y envía al detectar silencio
// ---------------------------------------------------------------------
function autoListen() {
  if (!st.handsFree || st.paused || !st.sessionId || st.busy || st.recording || $("#screen-talk").hidden) return;
  beginRecording();
}

function handsFreeTap() {
  if (!st.sessionId || st.busy) return;
  if (st.recording) return finishRecording(); // enviar ya, sin esperar el silencio
  stopSpeaking();
  st.paused = false;
  st.emptyTries = 0;
  autoListen();
}

function pauseHandsFree(msg) {
  if (st.recording) { st.recording = false; st.listener.abort(); $("#btn-talk").classList.remove("recording"); showLive(""); }
  stopVad();
  st.paused = true;
  status(msg ?? "⏸ Manos libres en pausa · toca 🎤 para seguir");
}

function toggleHandsFree() {
  st.handsFree = !st.handsFree;
  localSet("handsFree", st.handsFree ? "1" : "0");
  renderHandsFreeBtn();
  if (st.handsFree) {
    toast("Manos libres: habla cuando Sam termine. Envío tu frase tras una pausa.");
    st.paused = false; st.emptyTries = 0;
    autoListen();
  } else {
    if (st.recording) { st.recording = false; stopVad(); st.listener.abort(); $("#btn-talk").classList.remove("recording"); showLive(""); }
    st.paused = false;
    if (!st.busy) status("Mantén pulsado para hablar");
  }
}

function renderHandsFreeBtn() {
  const b = $("#btn-handsfree");
  b.textContent = st.handsFree ? "🙌 Manos libres: ON" : "🙌 Manos libres: OFF";
  b.classList.toggle("on", st.handsFree);
  $("#btn-talk").setAttribute("aria-label", st.handsFree ? "Tocar para enviar o reanudar" : "Mantén pulsado para hablar");
}

function startVad() {
  stopVad();
  st.heard = false; st.lastLive = ""; st.lastChange = Date.now();
  // Con Whisper no hay texto en directo: medimos el volumen del micro
  st.meter = st.engine === "whisper" ? levelMeter(st.listener.rec?.stream) : null;
  st.vadTimer = setInterval(vadTick, 200);
}

function stopVad() {
  clearInterval(st.vadTimer);
  st.vadTimer = null;
  st.meter?.close();
  st.meter = null;
}

function vadTick() {
  if (!st.recording) return stopVad();
  const now = Date.now();
  if (st.meter && st.meter.level() > 0.04) { st.heard = true; st.lastChange = now; }
  if (st.heard && now - st.lastChange > hfSilenceMs()) return finishRecording();
  if (!st.heard && now - st.t0 > HF_NO_SPEECH_MS) pauseHandsFree("⏸ No te oigo · toca 🎤 cuando quieras seguir");
}

/** Nivel de volumen (0..1) de un stream de micro, con Web Audio. */
function levelMeter(stream) {
  if (!stream) return null;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    return {
      level() { an.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length); },
      close() { try { src.disconnect(); ctx.close(); } catch { /* ignore */ } },
    };
  } catch { return null; }
}

async function endConversation() {
  stopSpeaking();
  clearInterval(st.timer);
  stopVad();
  st.paused = false;
  if (st.recording) { st.recording = false; st.listener?.abort(); }
  releaseMic();

  let streak = "—";
  if (st.sessionId) {
    try { const r = await api.endSession(st.sessionId); if (r.streak_days) streak = r.streak_days; }
    catch (e) { toast(e.message); }
  }
  st.sessionId = null;

  $("#sum-minutes").textContent = Math.round((Date.now() - st.startedAt) / 60000);
  $("#sum-turns").textContent = st.turns;
  $("#sum-streak").textContent = streak;
  $("#sum-corrections").innerHTML = st.corrections.length
    ? st.corrections.map(correctionHTML).join("") : `<p class="muted">Sin correcciones. ¡Muy bien! 🎉</p>`;
  $("#sum-vocab").innerHTML = st.vocab.length
    ? st.vocab.map(vocabHTML).join("") : `<p class="muted">Nada nuevo esta vez.</p>`;
  show("summary");
}

// ---------------------------------------------------------------------
function say(text, rate) { return speak(text, ttsOpts(rate ? { rate } : {})); }

function addTutorBubble(text) {
  const b = document.createElement("div");
  b.className = "bubble tutor" + (st.hideText ? " hidden-text" : "");
  b.innerHTML = `<div class="text">${esc(text)}</div>
    <div class="actions">
      <button class="mini" data-r="" aria-label="Repetir">🔊</button>
      <button class="mini" data-r="0.6" aria-label="Repetir lento">🐢</button>
    </div>`;
  b.querySelector(".text").onclick = () => b.classList.remove("hidden-text");
  b.querySelectorAll("button").forEach((x) => (x.onclick = () => say(text, x.dataset.r ? Number(x.dataset.r) : undefined)));
  append(b);
}

function addUserBubble(text) {
  const b = document.createElement("div");
  b.className = "bubble user";
  b.innerHTML = `<div class="text">${esc(text)}</div>`;
  append(b);
  return b;
}

function addCard(cls, html) {
  const d = document.createElement("div");
  d.className = cls; d.innerHTML = html;
  append(d);
  return d;
}

function append(el) { const chat = $("#chat"); chat.appendChild(el); chat.scrollTop = chat.scrollHeight; }

function setBusy(busy, msg) {
  st.busy = busy;
  $("#btn-talk").classList.toggle("busy", busy);
  status(msg ?? (busy ? "" : "Mantén pulsado para hablar"));
}
function status(msg) { $("#talk-status").textContent = msg; }
function showLive(t) {
  const el = $("#live-text");
  el.textContent = t;
  el.hidden = !t;
  // Manos libres: cada palabra nueva reinicia el contador de silencio
  if (st.recording && t && t !== st.lastLive) { st.heard = true; st.lastChange = Date.now(); st.lastLive = t; }
}
function updateTimer() {
  const s = Math.floor((Date.now() - st.startedAt) / 1000);
  $("#talk-timer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
