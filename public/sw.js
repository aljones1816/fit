const CACHE_NAME = 'fit-v1';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['./', './index.html', './manifest.webmanifest'])
    )
  );
  // Take over immediately — don't wait for old SW clients to close
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Purge caches from previous versions
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Hashed assets (/assets/…) are immutable — cache-first
  // Vite names them with a content hash so a new build = a new URL, never stale
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (index.html, manifest, icons) — network-first
  // This ensures a fresh index.html (pointing to latest hashed assets) on every load
  // Falls back to cache when offline
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(r => r || caches.match('./index.html'))
      )
  );
});
