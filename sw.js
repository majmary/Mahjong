// ─────────────────────────────────────────────
// American Mahjong — Service Worker
// Bump CACHE_VERSION whenever you deploy an update.
// ─────────────────────────────────────────────
const CACHE_VERSION = 'mahjong-v9';

const ASSETS = [
  '/mahjong/',
  '/mahjong/index.html',
  '/mahjong/manifest.json',
  '/mahjong/icon-192.png',
  '/mahjong/icon-512.png',
];

// ── Install: cache all assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // Cache what we can; don't let a missing icon break the whole install
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(err => {
          console.warn(`SW: failed to cache ${url}:`, err);
        }))
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_VERSION)
            .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, fall back to network ──
self.addEventListener('fetch', event => {
  // Only handle GET requests for our own origin
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      // Not in cache — fetch from network and cache the response
      return fetch(event.request).then(response => {
        // Only cache valid same-origin responses
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});
