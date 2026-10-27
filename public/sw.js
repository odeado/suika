const CACHE_NAME = 'suika-kawaii-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/tropical_beach_bg.jpg',
  '/farm_meadow_bg.jpg',
  '/halloween_night_bg.jpg',
  '/ocean_aquarium_bg.jpg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Pre-cache warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Purging obsolete cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Ignore firebase and non-http(s) requests
  if (!event.request.url.startsWith('http') || event.request.url.includes('firestore.googleapis.com')) {
    return;
  }

  // 1. NETWORK-FIRST for HTML navigation so users never get stuck on obsolete asset hashes
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((res) => res || caches.match('/'));
        })
    );
    return;
  }

  // 2. STALE-WHILE-REVALIDATE / CACHE-FIRST for static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          networkResponse && 
          networkResponse.status === 200 && 
          (event.request.url.endsWith('.png') || 
           event.request.url.endsWith('.jpg') || 
           event.request.url.endsWith('.svg') || 
           event.request.url.includes('/assets/'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
