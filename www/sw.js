const CACHE_NAME = "wird-v1.50";
const AUDIO_CACHE_NAME = "wird-audio-v1";

const ASSETS = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./compiled.css",
    "./data.json",
    "./strings.json",
    "./manifest.json",
    "./favicon.ico",
    "./img/icon.png",
    "./fonts/amiri-v30-arabic_latin-700.woff2",
    "./fonts/amiri-v30-arabic_latin-regular.woff2"
];

// 1. INSTALL: Pre-cache static assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// 2. ACTIVATE: Cleanup old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME && key !== AUDIO_CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});

// 3. FETCH: Smart Caching (Cache-First for Audio, Stale-While-Revalidate for others)
self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;
    const url = new URL(event.request.url);

    // Audio CDN Strategy: Cache-First
    const isMp3 = url.pathname.toLowerCase().endsWith(".mp3");
    if (isMp3) {
        event.respondWith(
            caches.open(AUDIO_CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((response) => {
                    if (response) return response;
                    return fetch(event.request).then((networkResponse) => {
                        if (networkResponse && networkResponse.ok) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    });
                });
            })
        );
        return;
    }

    // Default Strategy: Stale-While-Revalidate
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            });
            return cachedResponse || fetchPromise;
        })
    );
});

// 5. LISTENER: Handle the "Skip Waiting" message from script.js
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
