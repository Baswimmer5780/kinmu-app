const CACHE_NAME = "worklog-v2";

const FILES = [
    "./",
    "./index.html",
    "./home.css",
    "./home.js",
    //"./manifest.webmanifest"
];

// 初回：ファイルをスマホに保存
self.addEventListener("install", function (event) {

    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(FILES);
        })
    );

});

// ページを開いたとき：保存済みファイルを使う
self.addEventListener("fetch", function (event) {

    event.respondWith(
        caches.match(event.request).then(function (response) {

            if (response) {
                return response;
            }

            return fetch(event.request);

        })
    );

});

self.addEventListener("activate", function (event) {

    event.waitUntil(
        caches.keys().then(function (keys) {

            return Promise.all(
                keys
                    .filter(key =>
                        key.startsWith("worklog-") &&
                        key !== CACHE_NAME
                    )
                    .map(key => caches.delete(key))
            );

        })
    );

});