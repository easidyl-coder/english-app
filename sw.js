/* 오프라인에서도 열리게 해 주는 파일입니다.
   화면 파일은 인터넷이 되면 새 버전을 먼저 받고, 안 되거나 3초 넘게 걸리면 저장해 둔 것을 씁니다. */
const CACHE = "eng-app-v63";
const FILES = ["./", "./index.html", "./manifest.webmanifest", "./sync.js", "./firebase-config.js", "./ipa.js",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./privacy.html"];
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
  const net = fetch(new Request(e.request.url, { cache: "no-cache", credentials: "same-origin" })).then(r => {   // 늘 새 버전 확인
    if (r.ok){ const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  });
  const saved = () => caches.match(e.request).then(r => r || (e.request.mode === "navigate" ? caches.match("./index.html") : undefined));
  // 인터넷이 느리면 3초 기다린 뒤 저장해 둔 것으로 먼저 열기 (새 버전은 받는 대로 저장돼 다음에 열 때 보임)
  const slow = new Promise(res => setTimeout(res, 3000)).then(saved);
  e.respondWith(
    Promise.race([net.catch(saved), slow.then(r => r || net)])
      .then(r => r || net)
      .catch(() => saved())
  );
  e.waitUntil(net.catch(() => {}));
});
