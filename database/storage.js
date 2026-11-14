// Storage adapter: the database format is independent of the storage location.
// Keep the existing IndexedDB name, store and key for compatibility.
const WorkLogStorage = (() => {
    function open() {
        return new Promise((resolve, reject) => {
            let blocked = false;
            const request = indexedDB.open('worklog', 1);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('files')) request.result.createObjectStore('files');
            };
            request.onblocked = () => { blocked = true; reject(new Error('IndexedDBが使用中です。他のWORK LOGのタブを閉じて再読み込みしてください。')); };
            request.onerror = () => reject(request.error || new Error('IndexedDBを開けません。'));
            request.onsuccess = () => {
                if (blocked) { request.result.close(); return; }
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
        });
    }
    async function read(key) {
        const db = await open();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction('files', 'readonly');
                const request = tx.objectStore('files').get(key);
                tx.oncomplete = () => resolve(request.result);
                tx.onabort = () => reject(tx.error || new Error('IndexedDB読み込み失敗'));
            });
        } finally { db.close(); }
    }
    async function save(bytes, revision, {backupPrevious = false, backupMigration = false} = {}) {
        const db = await open();
        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction('files', 'readwrite');
                const store = tx.objectStore('files');
                let failure;
                const request = store.get('main');
                request.onsuccess = () => {
                    try {
                        const old = request.result;
                        if ((old?.revision ?? 0) !== revision) {
                            failure = new Error('別の画面で更新されました。再読み込みしてください。');
                            failure.code = 'REVISION_CONFLICT';
                            tx.abort();
                            return;
                        }
                        if (backupPrevious && old) store.put(old, 'previous');
                        if (backupMigration && old) store.put(old, 'before-schema-v2');
                        store.put({bytes, revision: revision + 1}, 'main');
                    } catch (error) { failure = error; tx.abort(); }
                };
                tx.oncomplete = () => resolve(revision + 1);
                tx.onabort = () => reject(failure || tx.error || new Error('IndexedDBへの保存に失敗しました。'));
            });
        } finally { db.close(); }
    }
    return {load: () => read('main'), loadPrevious: () => read('previous'), loadMigration: () => read('before-schema-v2'), save};
})();
