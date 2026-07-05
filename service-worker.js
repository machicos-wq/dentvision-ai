// DentVision AI v1.7.2
// Nessuna cache delle pagine: evita di aprire versioni vecchie dell'app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
