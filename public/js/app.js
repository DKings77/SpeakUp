// =====================================================================
// Speak Up · arranque, pestañas, "Hoy", "Hablar" y ajustes
// =====================================================================
import { currentSession, login, logout, sb } from "./auth.js";
import { $, esc, show, toast } from "./ui.js";
import { FREETALK_TOPICS, ROLEPLAY_TOPICS, SUPABASE_URL } from "./config.js";
import { UNITS } from "./curriculum.js";
import { englishVoices, speak, unlockAudio, pickEngine, engineLabel, isNative } from "./speech.js";
import {
  state, loadProfile, updateProfile, loadUnitProgress, completedCount, nextUnit, getToday, ttsOpts,
} from "./state.js";
import { initConversation, startConversation } from "./modes/conversation.js";
import { startReview } from "./modes/review.js";
import { initCourse, renderCourse, openLesson } from "./modes/course.js";
import { initListening, renderListenHome } from "./modes/listening.js";

// ---------------------------------------------------------------------
async function boot() {
  if (SUPABASE_URL.includes("TU-PROYECTO")) {
    show("login");
    $("#login-error").hidden = false;
    $("#login-error").textContent = "Falta configurar js/config.js con la URL y la clave de Supabase.";
    return;
  }

  initConversation();
  initCourse({ practiceWithSam, exit: () => goTab("course") });
  initListening({ exit: () => goTab("listen") });
  wireGlobal();
  wireLogin();
  wireSettings();
  wireTalkHome();

  if (!isNative && "serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  if (await currentSession()) await enterApp();
  else show("login");
}

async function enterApp() {
  await Promise.all([loadProfile(), loadUnitProgress()]);
  await goTab("today");
}

// ---------------------------------------------------------------------
// Navegación
// ---------------------------------------------------------------------
async function goTab(tab) {
  show(tab);
  try {
    if (tab === "today") await renderToday();
    if (tab === "course") renderCourse();
    if (tab === "listen") await renderListenHome();
    if (tab === "talkhome") renderTalkHome();
    if (tab === "review") { unlockAudio(); await startReview(); }
  } catch (e) { toast(e.message); }
}

function wireGlobal() {
  document.addEventListener("click", (e) => {
    // Botones 🔊 en cualquier pantalla
    const s = e.target.closest("[data-say]");
    if (s) {
      e.preventDefault();
      speak(s.dataset.say, ttsOpts(s.dataset.rate ? { rate: Number(s.dataset.rate) } : {}));
      return;
    }
    const t = e.target.closest("[data-tab]");
    if (t) return goTab(t.dataset.tab);
    const g = e.target.closest("[data-go]");
    if (g) {
      if (g.dataset.go === "settings") { fillSettings(); return show("settings"); }
      return goTab(g.dataset.go);
    }
  });
}

// ---------------------------------------------------------------------
// HOY
// ---------------------------------------------------------------------
async function renderToday() {
  const now = new Date();
  const h = Number(new Intl.DateTimeFormat("es-ES", { hour: "numeric", hour12: false, timeZone: "Europe/Madrid" }).format(now));
  $("#today-hello").textContent = `${h < 14 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches"}, David`;
  $("#today-date").textContent = now.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  const nowIso = now.toISOString();
  const [prog, m, v, today] = await Promise.all([
    sb.from("progress").select("*").maybeSingle(),
    sb.from("mistakes").select("id", { count: "exact", head: true }).lte("due_at", nowIso),
    sb.from("vocabulary").select("id", { count: "exact", head: true }).lte("due_at", nowIso),
    getToday(),
  ]);
  const due = (m.count ?? 0) + (v.count ?? 0);
  $("#stat-streak").textContent = prog.data?.streak_days ?? 0;
  $("#stat-minutes").textContent = prog.data?.total_minutes ?? 0;
  $("#stat-due").textContent = due;

  const next = nextUnit();
  const items = [
    { key: "review", ico: "🔁", name: due ? `Repaso (${due} tarjetas)` : "Repaso (nada pendiente)", min: 5, done: today.review || due === 0, go: () => goTab("review") },
    { key: "lesson", ico: "📚", name: `Lección: ${next.title}`, min: 10, done: today.lesson, go: () => openLesson(next.id) },
    { key: "listening", ico: "🎧", name: "Escuchar y responder", min: 8, done: today.listening, go: () => goTab("listen") },
    { key: "talk", ico: "🗣️", name: "Hablar con Sam", min: 7, done: today.talk, go: () => practiceCurrentUnit() },
  ];
  $("#plan-list").innerHTML = items.map((it, i) => `
    <div class="plan-item ${it.done ? "done" : ""}" data-plan="${i}">
      <span class="check">${it.done ? "✓" : it.ico}</span>
      <span class="plan-name">${esc(it.name)}</span>
      <small>${it.min} min</small>
    </div>`).join("");
  $("#plan-list").onclick = (e) => {
    const p = e.target.closest("[data-plan]");
    if (p) { unlockAudio(); items[Number(p.dataset.plan)].go(); }
  };

  const done = completedCount();
  const b2Total = UNITS.findIndex((x) => x.id === "b2-exam") + 1;
  const goalB2 = done < b2Total;
  const total = goalB2 ? b2Total : UNITS.length;
  $("#continue-title").textContent = `${next.level} · ${next.title}`;
  $("#b2-bar").style.width = `${Math.min(100, Math.round((done / total) * 100))}%`;
  $("#b2-text").textContent = goalB2
    ? `${done} de ${b2Total} unidades hacia el B2 · el curso sigue hasta C2`
    : `${done} de ${UNITS.length} unidades hacia el C2`;
  $("#card-continue").onclick = () => openLesson(next.id);
}

// ---------------------------------------------------------------------
// HABLAR
// ---------------------------------------------------------------------
/** Última unidad superada (o la siguiente si aún no hay ninguna). */
function currentStudyUnit() {
  const done = UNITS.filter((x) => state.unitProgress[x.id]?.status === "completed" && x.kind === "unit");
  return done[done.length - 1] ?? nextUnit();
}

function practiceCurrentUnit() {
  const u = currentStudyUnit();
  startConversation("freetalk", `${u.speaking} (David's real life)`, `🎯 ${u.title}`, u.grammar);
}

function practiceWithSam(unit, promptEn) {
  startConversation("freetalk", promptEn || unit.speaking, `🎯 ${unit.title}`, unit.grammar);
}

function renderTalkHome() {
  const u = currentStudyUnit();
  $("#practice-unit-text").textContent = `${u.level} · ${u.title}: Sam te hará preguntas para usar «${u.grammar}».`;
  const custom = state.profile?.custom_topics ?? [];
  $("#topics-custom").innerHTML = custom.length
    ? custom.map((t, i) => `<span class="chip" data-mode="freetalk" data-topic="${esc(t)}">${esc(t)}
        <button class="mini" data-del="${i}" aria-label="Borrar">✕</button></span>`).join("")
    : `<small class="muted">Aún no tienes temas propios.</small>`;
}

function wireTalkHome() {
  const chips = (list, mode, el) => {
    $(el).innerHTML = list.map((t) => `<button class="chip" data-mode="${mode}" data-topic="${esc(t.id)}">${esc(t.label)}</button>`).join("");
  };
  chips(FREETALK_TOPICS, "freetalk", "#topics-freetalk");
  chips(ROLEPLAY_TOPICS, "roleplay", "#topics-roleplay");

  $("#screen-talkhome").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      e.stopPropagation();
      const list = [...(state.profile.custom_topics ?? [])];
      list.splice(Number(del.dataset.del), 1);
      await updateProfile({ custom_topics: list }).catch((err) => toast(err.message));
      return renderTalkHome();
    }
    const chip = e.target.closest("[data-topic]");
    if (chip) {
      unlockAudio();
      const label = chip.childNodes[0].textContent.trim();
      return startConversation(chip.dataset.mode, chip.dataset.topic, label);
    }
  });
  $("#card-practice-unit").onclick = () => { unlockAudio(); practiceCurrentUnit(); };
  $("#custom-topic-form").onsubmit = async (e) => {
    e.preventDefault();
    const v = $("#custom-topic-input").value.trim();
    if (!v) return;
    const list = [...(state.profile.custom_topics ?? []), v].slice(-20);
    try { await updateProfile({ custom_topics: list }); $("#custom-topic-input").value = ""; renderTalkHome(); }
    catch (err) { toast(err.message); }
  };
}

// ---------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------
function wireLogin() {
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#login-error").hidden = true;
    try {
      await login($("#login-email").value.trim(), $("#login-pass").value);
      await enterApp();
    } catch (err) {
      $("#login-error").textContent = err.message;
      $("#login-error").hidden = false;
    }
  });
  $("#btn-logout").addEventListener("click", async () => { await logout(); show("login"); });
}

// ---------------------------------------------------------------------
// AJUSTES
// ---------------------------------------------------------------------
async function fillSettings() {
  const p = state.profile;
  $("#set-level").value = p.level;
  $("#set-rate").value = p.tts_rate;
  $("#set-rate-val").textContent = p.tts_rate;
  $("#set-stt").value = p.stt_engine;
  $("#set-spanish").value = String(p.spanish_support);
  $("#set-glossary").value = (p.glossary ?? []).join(", ");
  $("#settings-msg").hidden = true;

  const voices = await englishVoices();
  $("#set-voice").innerHTML = `<option value="">Automática (la mejor disponible)</option>` +
    voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name)} (${esc(v.lang)})</option>`).join("");
  $("#set-voice").value = p.tts_voice ?? "";
}

function wireSettings() {
  $("#set-rate").addEventListener("input", (e) => ($("#set-rate-val").textContent = e.target.value));
  $("#btn-test-voice").addEventListener("click", () => {
    unlockAudio();
    speak("Hi David! I'm Sam, your English tutor. How are you today?", {
      rate: Number($("#set-rate").value), voiceName: $("#set-voice").value || null,
    });
  });
  $("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await updateProfile({
        level: $("#set-level").value,
        tts_rate: Number($("#set-rate").value),
        tts_voice: $("#set-voice").value || null,
        stt_engine: $("#set-stt").value,
        spanish_support: Number($("#set-spanish").value),
        glossary: $("#set-glossary").value.split(",").map((s) => s.trim()).filter(Boolean),
      });
      $("#settings-msg").textContent = `✅ Guardado · reconocimiento de voz en este dispositivo: ${engineLabel(pickEngine(state.profile.stt_engine))}`;
      $("#settings-msg").hidden = false;
    } catch (err) { toast("No se pudo guardar: " + err.message); }
  });
}

boot();
