// DentVision AI v1.6.1 - pulizia forzata cache precedente
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(function (name) { return caches.delete(name); }));
    await self.clients.claim();
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach(function (client) { client.navigate(client.url); });
  })());
});
