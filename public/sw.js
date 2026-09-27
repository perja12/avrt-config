const BUILD_ID = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_PREFIX = `avrt-config:${encodeURIComponent(self.registration.scope)}:`;
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const APP_SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg"];

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(APP_SHELL);
  const index = await fetch("./index.html", { cache: "no-cache" });
  if (!index.ok) return;
  const html = await index.text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((url) => !url.startsWith("data:") && !url.startsWith("#"))
    .map((url) => new URL(url, self.location).toString());
  await Promise.all(assetUrls.map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SKIP_WAITING") return;
  event.waitUntil((async () => {
    await self.skipWaiting();
    event.source?.postMessage({ type: "SKIP_WAITING_DONE" });
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      // Legacy unscoped caches cannot be attributed to a deployment safely.
      keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        return request.mode === "navigate" ? caches.match("./index.html") : Response.error();
      })),
  );
});
