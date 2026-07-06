// DentVision AI v2.1.1
// Non viene mantenuta una cache di pagine: evita che Android mostri versioni vecchie.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
