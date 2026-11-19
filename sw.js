// Offline support. Bump the version if you change the app and want it to refresh right away.
const CACHE = "roses-v3";
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
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Notes: always try for the newest, fall back to the last copy when offline.
  if (url.pathname.endsWith("/notes.json")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("notes.json", copy));
          return res;
        })
        .catch(() => caches.match("notes.json"))
    );
    return;
  }

  // Everything else: serve the cached copy fast, refresh it in the background.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => {
      const fresh = fetch(e.request)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
