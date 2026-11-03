/* GO Field Notes offline shell. Never cache /api/*, including private user-state and notification responses. */
const SHELL_CACHE = 'gofn-shell-v227';
const SHELL_URLS = [
  '/', '/index.html', '/offline.html', '/offline.css',
  /* Versioned code and styles are listed once, exactly as index.html, app.js and dash.js request them. Any other ?v= (or unversioned) request is answered offline by the ignoreSearch fallback below. */
  '/styles.css?v=20261102b', '/dash.css?v=20261103d', '/lib.js?v=20261102d', '/dedupe.js?v=20261101b', '/move.js?v=20261102a', '/imgerr.js?v=20261015a', '/whatsnew.js?v=20261102d', '/pin.js?v=20261101b', '/local-state.js?v=20261030a', '/app.js?v=20261103e', '/raid-share.js?v=20261102b', '/dash.js?v=20261103g', '/detail.js?v=20261102f', '/fresh.js?v=20261103a', '/places.js?v=20261102a', '/review.js?v=20261102e', '/nudge.js?v=20261102a', '/account.js?v=20261102a', '/store.js?v=20261102a', '/season.js?v=20261102e', '/weekly.js?v=20261102a', '/buy.js?v=20261102a', '/extra.js?v=20261102c', '/infographic.js?v=20261103a', '/pwa.js',
  '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png',
  '/data.json', '/dex.json', '/event-info.json', '/forms.json', '/moves.json',
  '/places.json', '/event-details.json', '/event-moves.json', '/regional-events.json', '/world-events.json', '/best-by-type.json', '/prices.json', '/pvp.json', '/release-status.json', '/types.json',
  '/art/index.json', '/costumes.json', '/datamine-news.json', '/data/cp/cp-multipliers.json', '/data/cp/pokemon.json',
  '/season.json', '/weekly.json', '/tickets-external.json', '/store-log.json', '/infographic-queue.json'
];
const SHELL_URL_SET = new Set(SHELL_URLS.map(function (url) { return new URL(url, self.location.origin).href; }));
const MAX_RUNTIME_CACHE_ENTRIES = 120;
let runtimeTrimQueue = Promise.resolve(), trimQueued = false;
function trimRuntimeCache(cache) {
  // Serialize trims so concurrent fetch events cannot leave the runtime cache over its limit. A trim that is queued but has not started yet covers every write made before it starts, so a burst of pictures queues one walk, not one per picture.
  if (trimQueued) return runtimeTrimQueue;
  trimQueued = true;
  runtimeTrimQueue = runtimeTrimQueue.catch(function () {}).then(async function () {
    trimQueued = false;
    const keys = await cache.keys();
    const runtime = keys.filter(function (request) { return !SHELL_URL_SET.has(request.url); });
    const excess = runtime.length - MAX_RUNTIME_CACHE_ENTRIES;
    if (excess > 0) await Promise.all(runtime.slice(0, excess).map(function (request) { return cache.delete(request); }));
  });
  return runtimeTrimQueue;
}
/* Runs after the response has been handed to the page (event.waitUntil), so a slow or full cache never delays what the person sees.*/
async function storeCopy(key, copy) {
  try {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(key, copy);
    await trimRuntimeCache(cache);
  } catch (_) {
    // Cache quota/storage failures must not turn a successful online response into an offline error.
  }
}
/* Stable-path pictures (/art, /dex, /ico webp) are served from the cache first: the Worker already lets the browser reuse them for a day. After a day the cached copy is refreshed in the background. */
const IMAGE_PATH = /^\/(?:art|dex|ico|infographic-thumbs)\/.+\.webp$/;
const IMAGE_REFRESH_MS = 86400000;
/* Offline only: a request may differ from the cached one just by its ?v= or ?t= (older page, other version), so match code, styles and JSON by path. Never used for pages or API calls. */
const STATIC_PATH = /\.(?:js|css|json)$/;
self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_URLS.map(async function (url) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok && response.type === 'basic') await cache.put(url, response);
      } catch (_) { /* A single optional file must not prevent installation. */ }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const names = await caches.keys();
    await Promise.all(names.filter(function (name) { return name.startsWith('gofn-shell-') && name !== SHELL_CACHE; }).map(function (name) { return caches.delete(name); }));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith((async function () {
    const isImage = IMAGE_PATH.test(url.pathname);
    if (isImage) {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(request);
      if (hit) {
        const age = Date.now() - Date.parse(hit.headers.get('date') || '');
        if (!(age < IMAGE_REFRESH_MS)) event.waitUntil(fetch(request).then(function (fresh) { return fresh.ok && fresh.type === 'basic' ? storeCopy(request, fresh) : null; }).catch(function () {}));
        return hit;
      }
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const key = request.mode === 'navigate' ? (url.pathname === '/' ? '/' : url.pathname) : request;
        event.waitUntil(storeCopy(key, response.clone()));
      }
      return response;
    } catch (_) {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request) ||
        (STATIC_PATH.test(url.pathname) ? await cache.match(request, { ignoreSearch: true }) : null) ||
        (request.mode === 'navigate' ? await cache.match(url.pathname === '/' ? '/' : url.pathname) : null) ||
        (request.mode === 'navigate' ? await cache.match('/index.html') : null) ||
        (request.mode === 'navigate' ? await cache.match('/offline.html') : null);
      if (cached) return cached;
      return new Response('You are offline and this resource has not been cached yet.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
    }
  })());
});
function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
self.addEventListener('push', function (event) {
  event.waitUntil((async function () {
    var data = { title: 'GO Field Notes', body: 'Something changed. Open the app.', url: null };
    try {
      var sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        var id = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint)));
        var r = await fetch('/api/notify/latest?s=' + id);
        if (r.ok) data = await r.json();
      }
    } catch (_) { /* show the generic message */ }
    await self.registration.showNotification(data.title || 'GO Field Notes', { body: data.body || '', icon: '/icon-180.png', data: { url: data.url || '/' }, tag: 'gofn' });
  })());
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  if (!/^https:\/\//.test(url) && url !== '/') url = '/';
  event.waitUntil(self.clients.openWindow(url));
});
