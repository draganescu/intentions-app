const CACHE_NAME = 'natural-chat-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/db.js',
    '/manifest.json',
    'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.12.0/cdn/themes/light.css',
    'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.12.0/cdn/shoelace-autoloader.js',
    'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.12.0/cdn/components/icon/icon.js',
    'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.12.0/cdn/components/icon-button/icon-button.js',
    'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.12.0/cdn/components/textarea/textarea.js',
    'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.12.0/cdn/components/button/button.js'
];

// Install event
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate event
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
});

// Fetch event
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // If we got a valid response, clone it and update the cache
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                }
                return response;
            })
            .catch(() => {
                // If network request fails, try to get it from the cache
                return caches.match(event.request);
            })
    );
}); 