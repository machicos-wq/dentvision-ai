const CACHE="dentvision-v14-listino";const FILES=["./","index.html?v=14","style.css?v=14","app.js?v=14","manifest.json?v=14","icon.svg"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>{if(k!==CACHE)return caches.delete(k)}))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r}).catch(()=>caches.match(e.request)))});
