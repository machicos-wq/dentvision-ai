// DentVision AI v1.8.0
// Nessuna cache dei file dell'app: evita che Android mostri una versione vecchia.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
