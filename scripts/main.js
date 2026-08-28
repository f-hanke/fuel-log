// Entry point: initial render, and PWA service worker registration/updating.
// Loaded last, after every view module is ready.

applyStaticTranslations();
renderDay();

if ("serviceWorker" in navigator) {
  let swRegistration = null;

  window.addEventListener("load", () => {
    // updateViaCache:'none' tells the browser to never reuse an HTTP-cached copy of
    // sw.js for update checks — always hit the network, so stale CDN/browser caching
    // can't hide a new version from us
    navigator.serviceWorker.register("sw.js", { updateViaCache: 'none' }).then((reg) => {
      swRegistration = reg;
      // Force a fresh check for a newer sw.js every time the app is opened,
      // instead of waiting for the browser's own (slow/unreliable) update timer
      reg.update();
    }).catch(() => {});
  });

  // iOS home-screen apps are often just "resumed" from the background instead of
  // getting a real page load (the load listener above never fires again), so also
  // re-check for updates whenever the app becomes visible/foregrounded again
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && swRegistration) {
      swRegistration.update();
    }
  });
  window.addEventListener("pageshow", () => {
    if (swRegistration) swRegistration.update();
  });

  // Once a new service worker takes control (new version activated),
  // reload automatically so the update is visible without closing the app —
  // this never touches localStorage, so logged meals are never affected
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
}
