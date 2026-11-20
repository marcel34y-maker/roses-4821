// Offline support: always try for the newest files first, use the saved copy only when offline.
const CACHE = "roses-v5";
const SHELL = [
  "./", "index.html", "style.css", "app.js", "bouquet3d.js", "vendor/three.js", "manifest.json", "notes.json",
  "icons/icon.svg", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const sameSite = url.origin === self.location.origin;
  // the big 3D engine and fonts rarely change: saved copy first
  const cacheFirst = !sameSite || url.pathname.endsWith("/vendor/three.js");

  if (cacheFirst) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      }))
    );
    return;
  }

  // the app itself and your notes: newest first
  const key = url.pathname.endsWith("/notes.json") ? "notes.json" : e.request;
  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
        return res;
      })
      .catch(() => caches.match(key, { ignoreSearch: true }))
  );
});
