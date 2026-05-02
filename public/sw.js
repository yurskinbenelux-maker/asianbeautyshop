// ─────────────────────────────────────────────────────────────────────────
// YurSkin service worker.
//
// Two responsibilities, kept deliberately small:
//   1. Cache static assets (fonts, brand PNGs, manifest) so the shell
//      survives a flaky connection.
//   2. Serve a minimal offline fallback for navigations.
//
// Why no aggressive runtime caching: stale product copy / pricing /
// stock at the cache layer would lose us trust faster than offline
// loads would gain it. So API + page responses are pass-through; only
// hash-named static assets get cached. Next.js's own _next/static is
// already immutable + browser-cached, but we ALSO put it in the SW
// cache so a brief offline blip doesn't dead-link the page mid-route.
// ─────────────────────────────────────────────────────────────────────────

const CACHE_VERSION = "yur-v1";
const STATIC_CACHE = `static-${CACHE_VERSION}`;

// Pre-warm a tiny set on install. The rest gets picked up lazily.
const PRECACHE = [
  "/brand/apple-touch-icon.png",
  "/brand/icon-192.png",
  "/brand/icon-512.png",
  "/brand/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {
        // Network blip during install — let it slide; next install retries.
      }),
  );
  // Take over from any previous worker right away.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop old version caches.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) => k.startsWith("static-") && k !== STATIC_CACHE,
          )
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET — POST/PUT/etc must hit the network unchanged.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Pass-through: API, server actions, anything in /api/, anything with
  // ?nocache=, and any cross-origin request. We only own same-origin
  // static assets.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.searchParams.has("nocache")) return;

  // Static assets — Next's hashed _next/static AND our public/brand
  // PNGs. Cache-first so repeat visits are instant.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(png|jpg|jpeg|webp|avif|svg|woff2?|ttf|ico)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          // Last resort — return whatever we had even if stale.
          return cached ?? Response.error();
        }
      }),
    );
    return;
  }

  // Page navigation — network-first with offline fallback. We don't
  // cache HTML responses (would risk stale prices / stock); instead we
  // surface a small "you're offline" page on failure.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            `<!doctype html><meta charset="utf-8"><title>Offline · YU.R</title>
             <style>body{font-family:Georgia,serif;background:#F8F4EC;color:#121110;padding:48px;text-align:center}h1{font-size:28px}p{color:#5E5751}</style>
             <h1>You're offline</h1>
             <p>Your connection dropped. Refresh once you're back online.</p>`,
            {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            },
          ),
      ),
    );
  }
});
