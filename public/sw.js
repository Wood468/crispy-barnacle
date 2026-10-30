/* GO Field Notes offline shell. Never cache /api/*, including private user-state and notification responses. */
const SHELL_CACHE = 'gofn-shell-v118';
const SHELL_URLS = [
  '/', '/index.html', '/offline.html', '/offline.css',
  '/styles.css', '/dash.css', '/dash.css?v=20261030a', '/lib.js', '/dedupe.js', '/move.js',
  '/imgerr.js', '/whatsnew.js', '/pin.js', '/app.js', '/app.js?v=20261030d', '/dash.js', '/dash.js?v=20261030h', '/detail.js', '/detail.js?v=20261030c', '/fresh.js', '/places.js', '/review.js', '/nudge.js', '/account.js', '/store.js', '/season.js', '/weekly.js', '/buy.js', '/extra.js',
  '/infographic.js', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg', '/icon-180.png', '/icon-192.png', '/icon-512.png',
  '/data.json', '/dex.json', '/event-info.json', '/forms.json', '/moves.json',
  '/places.json', '/event-details.json', '/event-moves.json', '/regional-events.json', '/world-events.json', '/best-by-type.json', '/prices.json', '/pvp.json', '/release-status.json', '/types.json',
  '/art/index.json'
];
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
    const cache = await caches.open(SHELL_CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const key = request.mode === 'navigate' ? (url.pathname === '/' ? '/' : url.pathname) : request;
        await cache.put(key, response.clone());
      }
      return response;
    } catch (_) {
      const cached = await cache.match(request) ||
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
