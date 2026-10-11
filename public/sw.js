const CACHE = 'soylet-shell-v1';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // Precache the HTML and its Vite-generated entry JS/CSS on the first visit.
    // The initial page load happens before the service worker controls this tab.
    const response = await fetch(new Request(self.registration.scope, { cache: 'reload' }));
    if (!response.ok) throw new Error('App shell could not be downloaded');
    const html = await response.clone().text();
    await cache.put(self.registration.scope, response);
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
      .map(match => new URL(match[1], self.registration.scope))
      .filter(url => url.origin === self.location.origin && url.protocol.startsWith('http'))
      .map(url => url.href);
    await Promise.all(assets.map(url => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('soylet-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !['http:', 'https:'].includes(url.protocol) || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
        return response;
      } catch {
        return await caches.match(request) || await caches.match(self.registration.scope) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
    return response;
  })());
});