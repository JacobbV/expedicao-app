// Service worker: o app abre sem internet com a última versão baixada.
importScripts("./js/version.js");
const CACHE = "expedicao-" + self.APP_VERSION;
const FILES = ["./", "./index.html", "./css/app.css", "./js/app.js", "./js/store.js", "./js/version.js", "./firebase-config.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Arquivos do próprio app: tenta a rede primeiro (versão nova), cai no que está guardado sem sinal
  if (url.origin === location.origin) {
    e.respondWith(Promise.race([fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; }),
      new Promise((_, rej) => setTimeout(rej, 4000))]).catch(() => caches.match(req).then(r => r || caches.match("./index.html"))));
    return;
  }
  // Bibliotecas e fontes: guardadas na primeira vez
  if (/gstatic\.com|googleapis\.com/.test(url.hostname) && !/firestore|identitytoolkit|securetoken/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return res; })));
  }
});
