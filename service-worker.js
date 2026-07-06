// DentVision AI v1.8.2
// Nessuna cache applicativa: evita che il telefono mostri versioni vecchie.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
