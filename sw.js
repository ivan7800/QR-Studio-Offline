const CACHE_NAME = 'qr-studio-offline-v4';
const ASSETS = ['./','./index.html','./style.css','./app.js?v=4','./manifest.json','./icon.svg','./vendor/qr-lite.js?v=4'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', event => { if (event.request.method !== 'GET') return; event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(res => { const copy = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)); return res; }).catch(() => caches.match('./index.html')))); });
