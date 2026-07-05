// DentVision AI v1.7.1
// Nessuna cache: evita di restare bloccati su una versione vecchia.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
