// Register from all pages, but only on HTTP(S). No storage is cleared on update.
if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
    navigator.serviceWorker.register('./service-worker.js', {updateViaCache: 'none'}).catch(error => console.warn('Service worker:', error));
}
