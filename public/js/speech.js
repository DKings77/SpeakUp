// =====================================================================
// Voz: reconocimiento (STT) y síntesis (TTS)
//
// Motores de reconocimiento:
//   native    → app de iPhone (Capacitor): reconocimiento de Apple, gratis
//   webspeech → navegador Chrome/Edge en el PC, gratis
//   whisper   → graba audio y lo transcribe el backend (de pago, más literal)
// TTS: voces nativas de iOS en la app; speechSynthesis en el navegador.
// =====================================================================
import * as api from "./tutor.js";

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
const plugin = (name) => window.Capacitor?.Plugins?.[name];

export const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Motor según preferencia y dispositivo. */
export function pickEngine(pref = "auto") {
  if (pref === "whisper") return "whisper";
  if (isNative && plugin("SpeechRecognition")) return "native";
  if (pref === "webspeech" && SR) return "webspeech";
  if (!SR || isIOS) return "whisper";
  return "webspeech";
}

export const engineLabel = (e) => ({ native: "iPhone (Apple)", webspeech: "navegador", whisper: "Whisper" }[e] ?? e);

// =====================================================================
// RECONOCIMIENTO: interfaz común  start() / stop() → texto / abort()
// =====================================================================

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const START_OPTS = { language: "en-US", maxResults: 1, partialResults: true, popup: false };

/**
 * App nativa: plugin @capacitor-community/speech-recognition
 * El plugin rechaza start() con "Ongoing speech recognition" si el motor de audio
 * sigue en marcha (p. ej. si soltaste el botón mientras aún arrancaba). Por eso:
 *  - stop()/abort() esperan a que termine de arrancar antes de parar,
 *  - start() comprueba que el motor esté parado y, si no, lo para y reintenta.
 */
class NativeListener {
  constructor(onInterim) {
    this.onInterim = onInterim;
    this.sr = plugin("SpeechRecognition");
    this.text = "";
    this.handle = null;
    this.permOk = false;
    this.starting = null; // promesa del arranque en curso
  }

  /** Para el motor si seguía encendido (hasta ~1,5 s). */
  async ensureIdle() {
    for (let i = 0; i < 6; i++) {
      let listening = false;
      try { listening = (await this.sr.isListening()).listening; } catch { /* ignore */ }
      if (!listening) return;
      try { await this.sr.stop(); } catch { /* ignore */ }
      await sleep(250);
    }
  }

  start() {
    this.starting = this._start();
    return this.starting;
  }

  async _start() {
    if (!this.permOk) {
      const p = await this.sr.requestPermissions();
      if (p.speechRecognition !== "granted") throw new Error("Permite el micrófono y el reconocimiento de voz en Ajustes de iOS");
      this.permOk = true;
    }
    await this.ensureIdle();
    this.text = "";
    await this.handle?.remove?.();
    this.handle = await this.sr.addListener("partialResults", (d) => {
      const t = d?.matches?.[0];
      if (t) { this.text = t; this.onInterim?.(t); }
    });
    try {
      await this.sr.start(START_OPTS);
    } catch (e) {
      if (!/ongoing/i.test(e?.message ?? "")) throw e;
      // Seguía encendido: lo paramos y reintentamos una vez
      try { await this.sr.stop(); } catch { /* ignore */ }
      await sleep(500);
      await this.sr.start(START_OPTS);
    }
  }

  async stop() {
    try { await this.starting; } catch { /* el arranque falló: no hay nada que parar */ }
    try { await this.sr.stop(); } catch { /* ignore */ }
    await sleep(700); // espera el resultado final
    await this.handle?.remove?.();
    this.handle = null;
    return this.text.trim();
  }

  abort() {
    (async () => {
      try { await this.starting; } catch { /* ignore */ }
      try { await this.sr.stop(); } catch { /* ignore */ }
      await this.handle?.remove?.();
      this.handle = null;
    })();
  }

  release() { this.abort(); }
}

/** Navegador: Web Speech API */
class WebSpeechListener {
  constructor(onInterim) {
    this.onInterim = onInterim;
    this.rec = new SR();
    this.rec.lang = "en-US";
    this.rec.continuous = true;
    this.rec.interimResults = true;
    this.finalText = ""; this.interim = ""; this.holding = false;

    this.rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) this.finalText += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      this.interim = interim;
      this.onInterim?.((this.finalText + interim).trim());
    };
    this.rec.onerror = (e) => { if (e.error === "not-allowed") this.error = "Permiso de micrófono denegado"; };
    this.rec.onend = () => {
      if (this.holding) { try { this.rec.start(); } catch { /* ignore */ } }
      else this._resolve?.((this.finalText + this.interim).trim());
    };
  }
  async start() {
    this.finalText = ""; this.interim = ""; this.error = null; this.holding = true;
    this.rec.start();
  }
  stop() {
    this.holding = false;
    return new Promise((resolve) => {
      this._resolve = resolve;
      try { this.rec.stop(); } catch { resolve((this.finalText + this.interim).trim()); }
      setTimeout(() => resolve((this.finalText + this.interim).trim()), 2500);
    }).then((t) => { if (this.error) throw new Error(this.error); return t; });
  }
  abort() { this.holding = false; try { this.rec.abort(); } catch { /* ignore */ } }
  release() {}
}

/** Grabación de audio (para Whisper) */
export class AudioRecorder {
  constructor() { this.stream = null; }
  async start() {
    if (!this.stream?.active) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    }
    const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"]
      .find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? "";
    this.chunks = [];
    this.mr = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.mr.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.mr.start();
  }
  stop() {
    return new Promise((resolve) => {
      if (!this.mr || this.mr.state === "inactive") return resolve(null);
      this.mr.onstop = () => resolve(new Blob(this.chunks, { type: this.mr.mimeType || "audio/webm" }));
      this.mr.stop();
    });
  }
  abort() { try { this.mr?.stop(); } catch { /* ignore */ } }
  release() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; }
}

/** Whisper como "listener": graba y transcribe en el backend */
class WhisperListener {
  constructor() { this.rec = new AudioRecorder(); }
  start() { return this.rec.start(); }
  async stop() {
    const blob = await this.rec.stop();
    if (!blob || blob.size < 1500) return "";
    return (await api.transcribe(blob)).text ?? "";
  }
  async stopRaw() { return this.rec.stop(); } // para la conversación: se envía el audio directamente
  abort() { this.rec.abort(); }
  release() { this.rec.release(); }
}

// Un listener por motor, reutilizado en toda la app (evita pedir permisos una y otra vez)
const listeners = {};
export function getListener(engine, onInterim) {
  if (!listeners[engine]) {
    listeners[engine] = engine === "native" ? new NativeListener()
      : engine === "webspeech" ? new WebSpeechListener() : new WhisperListener();
  }
  listeners[engine].onInterim = onInterim;
  return listeners[engine];
}
export function releaseMic() { Object.values(listeners).forEach((l) => l.release()); }

/**
 * Convierte un botón en "mantener pulsado para hablar".
 * onText(texto) recibe lo reconocido. Devuelve { release } para soltar el micro.
 */
export function holdToTalk(btn, { getEngine, onText, onInterim, onState, minMs = 350 }) {
  let listener = null, recording = false, t0 = 0, busy = false;

  const begin = async (e) => {
    e?.preventDefault?.();
    if (busy || recording) return;
    stopSpeaking();
    listener = getListener(getEngine(), onInterim);
    recording = true; t0 = Date.now();
    btn.classList.add("recording");
    onState?.("recording");
    try { await listener.start(); }
    catch (err) {
      recording = false; btn.classList.remove("recording"); onState?.("idle");
      onState?.("error", err.name === "NotAllowedError" ? "Permite el micrófono para poder hablar" : err.message);
    }
  };
  const end = async () => {
    if (!recording) return;
    recording = false;
    btn.classList.remove("recording");
    if (Date.now() - t0 < minMs) { listener.abort(); onState?.("short"); return; }
    busy = true; btn.classList.add("busy"); onState?.("busy");
    try { await onText(await listener.stop()); }
    catch (err) { onState?.("error", err.message); }
    finally { busy = false; btn.classList.remove("busy"); onState?.("idle"); }
  };

  btn.addEventListener("pointerdown", (e) => { btn.setPointerCapture?.(e.pointerId); begin(e); });
  btn.addEventListener("pointerup", end);
  btn.addEventListener("pointercancel", end);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

// =====================================================================
// TTS
// =====================================================================
let webVoices = [];
let nativeVoices = null; // [{name, lang, index}]

function loadWebVoices() {
  if (!("speechSynthesis" in window)) return [];
  webVoices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("en"));
  return webVoices;
}
if (!isNative && "speechSynthesis" in window) {
  loadWebVoices();
  speechSynthesis.onvoiceschanged = loadWebVoices;
}

/** Lista de voces en inglés: [{ name, lang }] */
export async function englishVoices() {
  if (isNative && plugin("TextToSpeech")) {
    if (!nativeVoices) {
      try {
        const { voices } = await plugin("TextToSpeech").getSupportedVoices();
        nativeVoices = voices.map((v, index) => ({ name: v.name, lang: v.lang, index }))
          .filter((v) => v.lang?.toLowerCase().startsWith("en"));
      } catch { nativeVoices = []; }
    }
    return nativeVoices;
  }
  return (webVoices.length ? webVoices : loadWebVoices()).map((v) => ({ name: v.name, lang: v.lang }));
}

const PREFERRED = [/premium/i, /enhanced/i, /natural/i, /online/i, /^ava/i, /^evan/i, /samantha/i, /google us english/i, /jenny/i, /aria/i];

async function chooseVoice(name, alt = false) {
  const voices = await englishVoices();
  if (!voices.length) return null;
  const main = (() => {
    if (name) { const v = voices.find((x) => x.name === name); if (v) return v; }
    const us = voices.filter((v) => /en[-_]US/i.test(v.lang));
    for (const re of PREFERRED) {
      const v = us.find((x) => re.test(x.name)) ?? voices.find((x) => re.test(x.name));
      if (v) return v;
    }
    return us[0] ?? voices[0];
  })();
  if (!alt) return main;
  // Segunda voz para diálogos: otra voz distinta, mejor de otro acento
  const others = voices.filter((v) => v.name !== main.name);
  const good = (list) => { for (const re of PREFERRED) { const v = list.find((x) => re.test(x.name)); if (v) return v; } return list[0]; };
  return good(others.filter((v) => /en[-_]GB/i.test(v.lang))) ?? good(others) ?? main;
}

/** Lee un texto en inglés. Se resuelve al terminar. */
export async function speak(text, { rate = 0.8, voiceName = null, alt = false } = {}) {
  if (!text) return;
  const v = await chooseVoice(voiceName, alt);
  if (isNative && plugin("TextToSpeech")) {
    try {
      await plugin("TextToSpeech").stop();
      await plugin("TextToSpeech").speak({
        text, lang: v?.lang ?? "en-US", rate, pitch: 1.0, volume: 1.0,
        ...(v?.index != null ? { voice: v.index } : {}), category: "playback",
      });
    } catch { /* interrumpido */ }
    return;
  }
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const wv = webVoices.find((x) => x.name === v?.name);
    if (wv) u.voice = wv;
    u.lang = v?.lang ?? "en-US";
    u.rate = rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (isNative && plugin("TextToSpeech")) { plugin("TextToSpeech").stop().catch(() => {}); return; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}

/** iOS Safari solo permite TTS tras un toque: llamar dentro de un click. */
export function unlockAudio() {
  if (isNative || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}
