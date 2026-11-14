// Release-specific shell. A new version is installed only if all required assets are cached.
const CACHE_NAME = 'worklog-v0.6.4-' + new URL(self.registration.scope).pathname;
const FILES = ['./','./index.html','./work-records.html','./backup.html','./home.css?v=1101','./release-touch.css?v=final1','./pages.css?v=1101','./pages.css?v=1201','./home.js?v=1101','./records.js?v=1201','./backup.js?v=1101','./database/storage.js?v=1101','./database/migrations.js?v=1101','./database/database.js?v=1101','./startup.js?v=1101','./manifest.webmanifest'];
const SQL_SOURCES = ['./sqlite/','https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/','https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/'];
async function cacheSqlite(cache) {
    for (const base of SQL_SOURCES) {
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 7000);
        try {
            const files = ['sql-wasm.js','sql-wasm.wasm'];
            const responses = await Promise.all(files.map(name => fetch(new URL(base + name, self.registration.scope), {signal:controller.signal})));
            if (responses.every(response => response.ok)) {
                await Promise.all(files.map((name,i) => cache.put(new URL(base + name,self.registration.scope), responses[i])));
                return;
            }
        } catch (_) {} finally { clearTimeout(timer); }
    }
}
self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(FILES.map(path => new Request(new URL(path,self.registration.scope), {cache:'reload'})));
    await cacheSqlite(cache);
    await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
    const request = event.request; if (request.method !== 'GET') return;
    const url = new URL(request.url), scope = new URL(self.registration.scope);
    const local = url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
    const external = ['cdn.jsdelivr.net','cdnjs.cloudflare.com'].includes(url.hostname);
    if (!local && !external) return;
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        // Versioned assets and libraries are immutable for this release; HTML is network-first.
        const immutable = request.mode !== 'navigate' && (['1101','1201','final1'].includes(url.searchParams.get('v')) || (!local && /sql-wasm\.(js|wasm)$/.test(url.pathname)));
        if (immutable) { const hit = await cache.match(request); if (hit) return hit; }
        try {
            const response = await fetch(request, {cache: immutable ? 'default' : 'no-cache'});
            if (response.ok || response.type === 'opaque') { try { await cache.put(request,response.clone()); } catch (_) {} }
            return response;
        } catch (error) {
            const saved = await cache.match(request) || (request.mode === 'navigate' ? await cache.match(new URL(url.pathname,scope)) : null);
            if (saved) return saved;
            throw error;
        }
    })());
});
