// Bump this on every deploy so the cache below gets invalidated — otherwise
// installed phones keep serving the old cached files forever.
const CACHE_NAME = "fuellog-v22";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./scripts/state.js",
  "./scripts/day.js",
  "./scripts/week-month.js",
  "./scripts/settings.js",
  "./scripts/main.js",
  "./i18n/de.js",
  "./i18n/en.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// On install, pre-cache all app assets so the app can launch fully offline.
// Each file is cached individually (not via cache.addAll) so that one asset
// briefly failing (e.g. a deploy still propagating) can't fail the *entire*
// install and leave an empty/partial cache lying around.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS.map((url) => cache.add(url).catch((err) => console.warn("Precache failed:", url, err)))
      )
    )
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

// Network-first: always try to fetch the freshest file, and only fall back to
// the cache when the network fails (offline). This is the opposite of the old
// cache-first strategy, which could get an installed app permanently stuck
// serving stale or broken cached files after an update. Cache lookups/writes
// are explicitly scoped to our own CACHE_NAME (not the global caches.match),
// so a leftover cache from another version can never be served by mistake.
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.open(CACHE_NAME).then((cache) => cache.match(event.request)))
  );
});
