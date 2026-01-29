const CACHE_NAME = "wird-v1.6.14";

const ASSETS = [ "./", "./index.html", "./style.css", "./script.js", "./tailwind.3.4.17.js", "./data.json", "./strings.json", "manifest.json", "./fonts/amiri-v30-arabic_latin-700.woff2", "./fonts/amiri-v30-arabic_latin-regular.woff2", "./img/favicon.ico", "./img/favicon.svg", "./img/favicon-96x96.png", "./img/apple-touch-icon.png", "./img/web-app-manifest-192x192.png", "./img/web-app-manifest-512x512.png" ];

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

function hasFileExtension(pathname) {
    return /\/[^/?]+\.[a-z0-9]+$/i.test(pathname);
}

self.addEventListener("fetch", event => {
    const req = event.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.endsWith(".apk")) {
        event.respondWith(fetch(req));
        return;
    }
    if (req.mode === "navigate" && !hasFileExtension(url.pathname)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cachedIndex = await cache.match("./index.html");
            try {
                const fresh = await fetch(req);
                if (fresh && fresh.ok) cache.put("./index.html", fresh.clone());
                return fresh;
            } catch {
                return cachedIndex || Response.error();
            }
        })());
        return;
    }
    if (url.pathname.endsWith(".json")) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(req);
            const fetchPromise = fetch(req).then(res => {
                if (res && res.ok) cache.put(req, res.clone());
                return res;
            }).catch(() => null);
            return cached || await fetchPromise || Response.error();
        })());
        return;
    }
    event.respondWith((async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
            const res = await fetch(req);
            if (res && res.ok) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(req, res.clone());
            }
            return res;
        } catch {
            return Response.error();
        }
    })());
});