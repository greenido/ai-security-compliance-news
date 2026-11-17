// Bump the version when PRECACHE_URLS changes so old caches are dropped.
const PRECACHE = 'ai-secnews-precache-v2';
const RUNTIME = 'ai-secnews-runtime-v2';
const MAX_RUNTIME_ENTRIES = 60;
const PRECACHE_URLS = [
  './',
  './index.html',
  './about.html',
  './css/tailwind.css',
  './js/app.js',
  './js/posts-loader.js',
  './manifest.json',
  './images/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== PRECACHE && k !== RUNTIME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Drop the oldest runtime entries (cache.keys() is in insertion order).
async function trimRuntimeCache() {
  const cache = await caches.open(RUNTIME);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES)).map((k) => cache.delete(k)));
}

// Network first, cache as offline fallback. Only same-origin, successful
// responses are cached; third-party requests (fonts, Unsplash) go straight
// to the network.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          event.waitUntil(
            caches.open(RUNTIME).then((cache) => cache.put(request, copy)).then(trimRuntimeCache)
          );
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
