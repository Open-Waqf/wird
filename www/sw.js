const CACHE_NAME = "wird-v1.6.19";

const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./tailwind.3.4.17.js",
    "./data.json",
    "./strings.json",
    "manifest.json",

    "./fonts/amiri-v30-arabic_latin-700.woff2",
    "./fonts/amiri-v30-arabic_latin-regular.woff2",

    "./img/favicon.ico",
    "./img/favicon.svg",
    "./img/favicon-96x96.png",
    "./img/apple-touch-icon.png",
    "./img/web-app-manifest-192x192.png",
    "./img/web-app-manifest-512x512.png",
];

self.addEventListener("install", (event) => {
    self.skipWaiting();
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Don’t brick install if one asset fails (CDN hiccup, typo, etc.)
        await Promise.allSettled(ASSETS.map((a) => cache.add(a)));
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
        await self.clients.claim();
    })());
});

function hasFileExtension(pathname) {
    // "/foo/bar.apk" => true, "/foo/bar" => false
    return /\/[^/?]+\.[a-z0-9]+$/i.test(pathname);
}

self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // 1. Ignore non-GET and external requests
    if (req.method !== "GET" || url.origin !== self.location.origin) return;

    // 2. Network Only: APK downloads (Never cache)
    if (url.pathname.endsWith(".apk")) {
        event.respondWith(fetch(req));
        return;
    }

    // 3. Network First: Main HTML (Critical for detecting version changes)
    if (req.mode === "navigate" || url.pathname.endsWith("index.html")) {
        event.respondWith((async () => {
            try {
                // Try network first
                const networkResponse = await fetch(req);
                const cache = await caches.open(CACHE_NAME);
                cache.put(req, networkResponse.clone());
                return networkResponse;
            } catch (error) {
                // Fallback to cache if offline
                const cachedResponse = await caches.match(req);
                return cachedResponse || Response.error();
            }
        })());
        return;
    }

    // 4. Stale-While-Revalidate: All other assets (CSS, JS, JSON, Images)
    // This serves fast from cache, but updates the cache in the background
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(req);

        // Fetch from network to update cache for NEXT time
        const networkFetch = fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
                cache.put(req, networkResponse.clone());
            }
            return networkResponse;
        }).catch(() => null); // Ignore errors if offline

        // Return cached response if we have it, otherwise wait for network
        return cachedResponse || networkFetch;
    })());
});

// 5. LISTENER: Handle the "Skip Waiting" message from script.js
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});