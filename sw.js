/* 오프라인에서도 열리게 해 주는 파일입니다.
   화면 파일은 인터넷이 되면 항상 새 버전을 먼저 받고, 안 되면 저장해 둔 것을 씁니다. */
const CACHE = "eng-app-v33";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./sync.js", "./firebase-config.js", "./ipa.js",
  "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // 로그인·서버 요청은 건드리지 않음
  e.respondWith(
    fetch(new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" })).then(r => {   // 항상 새 버전 확인
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match("./index.html")))
  );
});
