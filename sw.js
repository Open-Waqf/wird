const CACHE_NAME = "wird-v1.11";

const ASSETS = [ "./", "./index.html", "./style.css", "./script.js", "./compiled.css", "./data.json", "./strings.json", "manifest.json", "./fonts/amiri-v30-arabic_latin-700.woff2", "./fonts/amiri-v30-arabic_latin-regular.woff2", "./img/favicon.ico", "./img/favicon.svg", "./img/favicon-96x96.png", "./img/apple-touch-icon.png", "./img/web-app-manifest-192x192.png", "./img/web-app-manifest-512x512.png" ];

self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(ASSETS.map(a => cache.add(a)));
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== "GET" || url.origin !== self.location.origin) return;
    if (url.pathname.endsWith(".apk")) {
        event.respondWith(fetch(req));
        return;
    }
    if (req.mode === "navigate" || url.pathname.endsWith("index.html")) {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(req);
                const cache = await caches.open(CACHE_NAME);
                cache.put(req, networkResponse.clone());
                return networkResponse;
            } catch (error) {
                const cachedResponse = await caches.match(req);
                return cachedResponse || Response.error();
            }
        })());
        return;
    }
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(req);
        const networkFetch = fetch(req).then(networkResponse => {
            if (networkResponse && networkResponse.ok) {
                cache.put(req, networkResponse.clone());
            }
            return networkResponse;
        }).catch(() => null);
        return cachedResponse || networkFetch;
    })());
});

self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});