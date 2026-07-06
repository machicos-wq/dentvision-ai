// DentVision AI v2.0
// Non viene mantenuta una cache di pagine: evita che Android mostri versioni vecchie.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
