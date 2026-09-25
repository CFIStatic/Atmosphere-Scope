const SHELL = ["/", "/measure", "/manifest.webmanifest", "/favicon.ico", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"];
const CACHE = "scope-shell-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || (await caches.match("/measure")) || Response.error()),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag === "upload-captures") event.waitUntil(pingClients());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "queue-upload") event.waitUntil(pingClients());
});

async function pingClients() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: "resume-uploads" });
}
