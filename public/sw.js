/* Only the generic offline help page is cached. Account pages and rental data stay on the network. */
const CACHE_PREFIX = "malapit-offline-";
const CACHE_NAME = CACHE_PREFIX + "v1";
const OFFLINE_PAGE = "/offline.html";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const response = await fetch(OFFLINE_PAGE, { cache: "reload", credentials: "same-origin" });
    if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("text/html") || !(await response.clone().text()).includes("data-malapit-offline")) {
      throw new Error("The offline help page could not be loaded.");
    }
    const cache = await caches.open(CACHE_NAME);
    await cache.put(OFFLINE_PAGE, response);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  // Leave API calls, writes, sign-in/out, and all cross-origin traffic untouched.
  if (request.method !== "GET" || request.mode !== "navigate" || url.origin !== self.location.origin || url.pathname !== "/") return;
  event.respondWith((async () => {
    try { return await fetch(request); }
    catch {
      const fallback = await (await caches.open(CACHE_NAME)).match(OFFLINE_PAGE);
      return fallback || new Response("You are offline. Reconnect to browse current rentals.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
