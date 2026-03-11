// PieChat Service Worker — Offline shell + cache API responses + notifications
const CACHE_NAME = 'piechat-v2';
const SHELL_URLS = [
    '/',
    '/chat',
    '/login',
    '/manifest.json',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Network-first for API calls, cache-first for app shell
    const url = new URL(event.request.url);

    if (url.pathname.startsWith('/_matrix') || url.pathname.startsWith('/auth')) {
        // Network only for API
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Only cache successful full responses (not 206 partial)
                if (response.status === 200 && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ─── Notification Click Handler ─────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const url = event.notification.data?.url || '/chat';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            // Focus existing PieChat tab if available
            for (const client of clients) {
                if (client.url.includes('/chat') && 'focus' in client) {
                    client.focus();
                    client.navigate(url);
                    return;
                }
            }
            // Otherwise open new tab
            return self.clients.openWindow(url);
        })
    );
});
