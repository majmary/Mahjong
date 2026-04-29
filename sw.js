// ─────────────────────────────────────────────
// American Mahjong — Service Worker
// Bump CACHE_VERSION whenever you deploy an update.
// ─────────────────────────────────────────────
const CACHE_VERSION = 'mahjong-v70';

const ASSETS = [
  '/mahjong/',
  '/mahjong/index.html',
  '/mahjong/game.html',
  '/mahjong/pivot.html',
  '/mahjong/wrong.html',
  '/mahjong/build.html',
  '/mahjong/learn.html',
  '/mahjong/manifest.json',
  '/mahjong/icon-192.png',
  '/mahjong/icon-512.png',
  '/mahjong/css/shared.css',
  '/mahjong/js/card-loader.js',
  '/mahjong/js/patterns.js',
  '/mahjong/data/card-2024.js',
  '/mahjong/data/card-2025.js',
  '/mahjong/data/card-2026.js',
  '/mahjong/learn/learn.html',
  '/mahjong/learn/lesson1/lesson-1-1.html',
  '/mahjong/learn/lesson1/lesson-1-2.html',
  '/mahjong/learn/lesson1/lesson-1-3.html',
  '/mahjong/learn/lesson1/lesson-1-4.html',
  '/mahjong/learn/lesson1/lesson-1-5.html',
  '/mahjong/learn/lesson2/lesson-2-1.html',
   '/mahjong/learn/lesson2/lesson-2-2.html',
   '/mahjong/learn/lesson2/lesson-2-3.html',
   '/mahjong/learn/lesson2/lesson-2-4.html',
   '/mahjong/learn/lesson2/lesson-2-5.html',
   '/mahjong/learn/lesson3/lesson-3-1.html',
     '/mahjong/learn/lesson3/lesson-3-2.html',
     '/mahjong/learn/lesson3/lesson-3-3.html',
     '/mahjong/learn/lesson3/lesson-3-4.html',
       '/mahjong/learn/lesson4/lesson-4-1.html',
   '/mahjong/learn/lesson4/lesson-4-2.html',
   '/mahjong/learn/lesson4/lesson-4-3.html',
   '/mahjong/learn/lesson4/lesson-4-4.html',
   '/mahjong/learn/lesson4/lesson-4-5.html',
   '/mahjong/learn/lesson4/lesson-4-6.html',
   '/mahjong/learn/lesson6/lesson-6-1.html',
  '/mahjong/learn/lesson6/lesson-6-2.html',
  '/mahjong/learn/lesson6/lesson-6-3.html',
  '/mahjong/learn/lesson6/lesson-6-4.html',
  '/mahjong/learn/lesson6/lesson-6-5.html',




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
