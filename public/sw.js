// Flourish — self-unregistering "kill-switch" service worker.
//
// WHY THIS EXISTS: a pre-Vite single-file build (commit 74216a7, March 2026) ran
//   navigator.serviceWorker.register('sw.js')
// which installed a service worker in every visitor's browser. The app was later refactored to Vite
// and now ships NO service worker — but that old SW persists in returning visitors' browsers and
// serves a broken, stale cached shell that survives a hard-refresh (a SW intercepts even Cmd+Shift+R).
//
// This file replaces that old worker. On a returning visitor's next visit, the browser's SW update
// check re-fetches /sw.js over the network (SW-script fetches bypass the old SW's cache; also served
// no-cache), sees these new bytes, installs this worker, and on activate it: clears all caches,
// unregisters itself, and reloads open tabs exactly once — freeing the client. Afterwards there is no
// registration and the app never registers one again, so it runs once and never loops.
//
// New visitors never had a service worker and never request this file, so they are 100% unaffected.
//
// IMPORTANT: there is intentionally NO 'fetch' handler — every request goes straight to the network,
// so this worker can never serve stale content while it is briefly alive.

self.addEventListener('install', () => {
  // Take over immediately instead of waiting for all old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1) Delete every cache the old worker created.
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) { /* best-effort */ }

    // 2) Remove this registration — after this, no service worker controls the site.
    try {
      await self.registration.unregister();
    } catch (_) { /* best-effort */ }

    // 3) Reload open tabs ONCE so they re-fetch the live site from the network (now uncontrolled).
    //    No loop: the reloaded page has no controller and the app never re-registers a worker, so
    //    /sw.js is never requested again.
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        try { client.navigate(client.url); } catch (_) { /* tab heals on its next manual navigation */ }
      }
    } catch (_) { /* best-effort */ }
  })());
});
