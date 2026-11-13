// WORK LOG: 公開更新時にバージョンを変更する
const CACHE_NAME = "worklog-navigation-v1";
const FILES = ["./", "./index.html", "./home.css", "./home.js"];
self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(FILES.map(path => new Request(path, {cache: "reload"})));
        await self.skipWaiting();
    })());
});
self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        // このアプリの旧キャッシュのみ削除する
        for (const key of await caches.keys()) {
            if (key !== CACHE_NAME && key.startsWith("worklog-")) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});
self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    const scope = new URL(self.registration.scope);
    const local = url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
    const external = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net"].includes(url.hostname);
    if (!local && !external) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
            const response = await fetch(request, {cache: "no-cache"});
            if (response.ok || response.type === "opaque") {
                try { await cache.put(request, response.clone()); } catch (_) {}
            }
            return response;
        } catch (error) {
            const saved = await cache.match(request);
            if (saved) return saved;
            throw error;
        }
    })());
});
