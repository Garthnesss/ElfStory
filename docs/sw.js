// ElfStory app-shell service worker (Phase 6 "reach & refinement").
//
// Cache-first for the static app shell; navigations fall back to the
// cached index when the network is unreachable, so an installed copy
// keeps working offline. All paths resolve against the registration
// scope, so the same file works at a domain root or under a sub-path.
// Bump the cache name to retire old shells; activation deletes every
// other cache.

const CACHE_NAME = 'elfstory-shell-v1';
const SHELL_PATHS = ['./', './index.html', './manifest.webmanifest', './icons/emblem.svg'];
const shellUrl = (path) => new URL(path, self.registration.scope).toString();
const INDEX_URL = shellUrl('./index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_PATHS.map(shellUrl)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    // Fresh page when the network answers; the cached index when it doesn't.
    event.respondWith(
      fetch(request).catch(() => caches.match(INDEX_URL, { ignoreSearch: true }))
    );
    return;
  }
  event.respondWith(
    caches
      .match(request, { ignoreSearch: true })
      .then((hit) => hit ?? fetch(request))
  );
});
