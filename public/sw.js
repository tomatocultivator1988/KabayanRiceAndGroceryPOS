const CACHE = "ricepos-v2"
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => e.waitUntil(Promise.all([clients.claim(), caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x))))])))
self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.pathname.startsWith("/api/")) return
  // Never cache or serve RSC streaming responses (stale RSC breaks client nav)
  if (req.headers.get("RSC") === "1" || (req.headers.get("accept") || "").includes("text/x-component")) return
  e.respondWith(
    fetch(req).then(r => {
      const ct = (r.headers.get("content-type") || "").split(";")[0]
      const cacheable = ["text/html", "text/css", "application/javascript", "text/javascript"].includes(ct)
      if (r.ok && r.type === "basic" && cacheable) {
        const c = r.clone()
        caches.open(CACHE).then(cache => cache.put(req, c))
      }
      return r
    }).catch(() => caches.match(req))
  )
})
