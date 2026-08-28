// Bump this on every deploy so the cache below gets invalidated — otherwise
// installed phones keep serving the old cached files forever.
const CACHE_NAME = "fuellog-v11";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./i18n/de.js",
  "./i18n/en.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// On install, pre-cache all app assets so the app can launch fully offline
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// On activate, drop any caches from older versions of this app
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first: serve from cache when available, otherwise fall back to network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
