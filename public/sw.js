// Service worker: guarda la interfaz para que abra rápido.
// Las llamadas a Supabase / tutor nunca se cachean.
const VERSION = "speakup-v4";
const SHELL = [
  "./", "index.html", "css/styles.css", "manifest.webmanifest",
  "js/app.js", "js/auth.js", "js/config.js", "js/speech.js", "js/tutor.js", "js/ui.js",
  "js/state.js", "js/curriculum.js",
  "js/modes/conversation.js", "js/modes/review.js", "js/modes/course.js", "js/modes/listening.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Red primero (para recibir siempre la última versión), caché si no hay conexión.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
