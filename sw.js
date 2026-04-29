// ─────────────────────────────────────────────
// American Mahjong — Service Worker
// Bump CACHE_VERSION whenever you deploy an update.
// ─────────────────────────────────────────────
const CACHE_VERSION = 'mahjong-v70';

const ASSETS = [
  '/Mahjong/',
  '/Mahjong/index.html',
  '/Mahjong/game.html',
  '/Mahjong/pivot.html',
  '/Mahjong/wrong.html',
  '/Mahjong/build.html',
  '/Mahjong/learn.html',
  '/Mahjong/manifest.json',
  '/Mahjong/icon-192.png',
  '/Mahjong/icon-512.png',
  '/Mahjong/css/shared.css',
  '/Mahjong/js/card-loader.js',
  '/Mahjong/js/patterns.js',
  '/Mahjong/data/card-2024.js',
  '/Mahjong/data/card-2025.js',
  '/Mahjong/data/card-2026.js',
  '/Mahjong/learn/learn.html',
  '/Mahjong/learn/lesson1/lesson-1-1.html',
  '/Mahjong/learn/lesson1/lesson-1-2.html',
  '/Mahjong/learn/lesson1/lesson-1-3.html',
  '/Mahjong/learn/lesson1/lesson-1-4.html',
  '/Mahjong/learn/lesson1/lesson-1-5.html',
  '/Mahjong/learn/lesson2/lesson-2-1.html',
   '/Mahjong/learn/lesson2/lesson-2-2.html',
   '/Mahjong/learn/lesson2/lesson-2-3.html',
   '/Mahjong/learn/lesson2/lesson-2-4.html',
   '/Mahjong/learn/lesson2/lesson-2-5.html',
   '/Mahjong/learn/lesson3/lesson-3-1.html',
     '/Mahjong/learn/lesson3/lesson-3-2.html',
     '/Mahjong/learn/lesson3/lesson-3-3.html',
     '/Mahjong/learn/lesson3/lesson-3-4.html',
       '/Mahjong/learn/lesson4/lesson-4-1.html',
   '/Mahjong/learn/lesson4/lesson-4-2.html',
   '/Mahjong/learn/lesson4/lesson-4-3.html',
   '/Mahjong/learn/lesson4/lesson-4-4.html',
   '/Mahjong/learn/lesson4/lesson-4-5.html',
   '/Mahjong/learn/lesson4/lesson-4-6.html',
   '/Mahjong/learn/lesson6/lesson-6-1.html',
  '/Mahjong/learn/lesson6/lesson-6-2.html',
  '/Mahjong/learn/lesson6/lesson-6-3.html',
  '/Mahjong/learn/lesson6/lesson-6-4.html',
  '/Mahjong/learn/lesson6/lesson-6-5.html',
  '/Mahjong/exercises/joker.html',




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
