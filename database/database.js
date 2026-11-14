// WORK LOG: load a matching sql.js JavaScript/WASM pair, then open SQLite.
// The working v0.1 prototype used sql.js 1.13.0; retain it as a known fallback.
const SQLITE_SOURCES = [
    new URL('./sqlite/', document.baseURI).href,
    'https://cdn.jsdelivr.net/npm/sql.js@1.13.0/dist/',
    'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/'
];
function withTimeout(promise, ms, message) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}
async function fetchWasm(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url, {signal: controller.signal, cache: 'no-cache'});
        if (!response.ok) throw new Error('WASM HTTP ' + response.status);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 97 || bytes[2] !== 115 || bytes[3] !== 109) throw new Error('WASMファイルではありません');
        return bytes;
    } finally { clearTimeout(timer); }
}
function loadSqlScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // A failed sql.js initializer can cache its rejected Promise. Reload the
        // actual script for each fallback instead of reusing that initializer.
        window.initSqlJs = undefined;
        script.src = url;
        const timer = setTimeout(() => { script.remove(); reject(new Error('JS読み込みタイムアウト')); }, 8000);
        script.onload = () => {
            clearTimeout(timer);
            const init = window.initSqlJs;
            script.remove();
            if (typeof init === 'function') resolve(init);
            else reject(new Error('initSqlJs が見つかりません'));
        };
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('JS読み込み失敗')); };
        document.head.append(script);
    });
}
async function loadSQLite(progress = () => {}) {
    const errors = [];
    for (let i = 0; i < SQLITE_SOURCES.length; i++) {
        const base = SQLITE_SOURCES[i];
        const label = i === 0 ? 'ローカル sqlite/' : i === 1 ? 'jsDelivr CDN' : 'cdnjs CDN';
        progress('SQLiteライブラリを読み込み中… (' + label + ')');
        try {
            const bytes = await fetchWasm(base + 'sql-wasm.wasm');
            const init = await loadSqlScript(base + 'sql-wasm.js');
            return await withTimeout(init({wasmBinary: bytes, locateFile: name => base + name}), 12000, 'SQLite初期化タイムアウト');
        } catch (error) { errors.push(label + ': ' + error.message); }
    }
    throw new Error('SQLiteライブラリの読み込み失敗。' + errors.join(' / '));
}

const WorkDB = (() => {
    let SQL, db, revision = 0, busy = false, initialization;
    const rowsFrom = (database, sql, args = []) => {
        const stmt = database.prepare(sql);
        try { stmt.bind(args); const result = []; while (stmt.step()) result.push(stmt.getAsObject()); return result; }
        finally { stmt.free(); }
    };
    const rows = (sql, args = []) => rowsFrom(db, sql, args);
    const version = d => d.exec('PRAGMA user_version')[0].values[0][0];
    const tableNames = d => rowsFrom(d, "SELECT name FROM sqlite_master WHERE type='table'").map(x => x.name);
    const dateOK = value => {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(value + 'T00:00:00Z');
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    };
    const moneyOK = n => Number.isSafeInteger(n) && n >= 0;
    const timeMinutes = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0,2))*60 + Number(value.slice(3)) : NaN;
    function integrity(d) {
        const check = d.exec('PRAGMA integrity_check');
        if (check.length !== 1 || check[0].values.length !== 1 || check[0].values[0][0] !== 'ok') throw new Error('DB整合性エラー');
        if (d.exec('PRAGMA foreign_key_check').length) throw new Error('DB外部キー整合性エラー');
    }
    const requiredColumns = {
        workplaces: 'id name sort_order is_active default_pay_type default_hourly_rate default_one_way_fare default_grading_rate',
        work_records: 'id workplace_id workplace_name_snapshot work_date transportation_fee memo created_at updated_at',
        work_record_items: 'id work_record_id pay_type lesson_code class_type start_time end_time work_minutes unit_rate multiplier amount subject effort exact_amount',
        record_history: 'id record_id action snapshot created_at'
    };
    function checkColumns(d, table, required) {
        if (!tableNames(d).includes(table)) throw new Error('必要なテーブルがありません: ' + table);
        const names = rowsFrom(d, 'PRAGMA table_info(' + table + ')').map(x => x.name);
        if (required.split(' ').some(name => !names.includes(name))) throw new Error('DBの構造が異なります: ' + table);
    }
    function validate(d) {
        integrity(d);
        migrate(d);
        for (const [table, columns] of Object.entries(requiredColumns)) checkColumns(d, table, columns);
        integrity(d);
        if (rowsFrom(d, 'SELECT work_date,transportation_fee FROM work_records').some(r => !dateOK(r.work_date) || !moneyOK(r.transportation_fee))) throw new Error('勤務記録に不正な日付・交通費があります。');
        if (rowsFrom(d, 'SELECT amount,pay_type FROM work_record_items').some(r => !moneyOK(r.amount) || !['lesson','hourly','direct','piecework'].includes(r.pay_type))) throw new Error('勤務明細に不正な金額・給与区分があります。');
        for (const i of rowsFrom(d, "SELECT * FROM work_record_items WHERE pay_type='piecework'")) {
            const pay = gradingPay(i.unit_rate, i.effort);
            if (!i.subject?.trim() || pay.amount !== i.amount || pay.raw !== i.exact_amount) throw Error('採点明細の計算結果が不正です。');
        }
        const duplicate = d.exec('SELECT 1 FROM work_records GROUP BY work_date,workplace_id HAVING COUNT(*)>1 LIMIT 1');
        if (duplicate.length) throw new Error('同日・同勤務先の親記録が重複しています。');
        if (d.exec('SELECT 1 FROM work_record_items WHERE lesson_code IS NOT NULL GROUP BY work_record_id,lesson_code HAVING COUNT(*)>1 LIMIT 1').length) throw new Error('コマが重複しています。');
        d.run('PRAGMA foreign_keys=ON');
    }
    function exportBytes(d) {
        const bytes = d.export();
        // sql.js reopens the connection on export; restore connection settings.
        d.run('PRAGMA foreign_keys=ON');
        return bytes;
    }
    function decodeBase64(text) {
        const raw = atob(text);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }
    function findOrCreatePlace(d, name) {
        let place = rowsFrom(d, 'SELECT * FROM workplaces WHERE name=?', [name])[0];
        if (!place) {
            d.run('INSERT INTO workplaces(name,sort_order) VALUES(?,(SELECT COALESCE(MAX(sort_order),0)+10 FROM workplaces))', [name]);
            place = rowsFrom(d, 'SELECT * FROM workplaces WHERE name=?', [name])[0];
        }
        return place;
    }
    // Stable record ids even after a record is deleted: history keeps its id.
    function insertRecord(d, place, date, fare, createdAt) {
        const id = rowsFrom(d, 'SELECT MAX(COALESCE((SELECT MAX(id) FROM work_records),0),COALESCE((SELECT MAX(record_id) FROM record_history),0))+1 AS next')[0].next;
        d.run('INSERT INTO work_records(id,workplace_id,workplace_name_snapshot,work_date,transportation_fee,created_at,updated_at) VALUES(?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),COALESCE(?,CURRENT_TIMESTAMP))', [id,place.id,place.name,date,fare,createdAt ?? null,createdAt ?? null]);
        return rowsFrom(d, 'SELECT * FROM work_records WHERE id=?', [id])[0];
    }
    // Migrate only the explicitly known old v0.1 schema. Do not infer fares,
    // rename workplaces, recompute wages or remove the original localStorage.
    function convertLegacy(old) {
        if (version(old) !== 0 || tableNames(old).includes('workplaces')) throw new Error('未対応の旧DB形式です。');
        checkColumns(old, 'work_records', 'id work_date workplace start_time end_time hourly_rate direct_amount salary created_at');
        integrity(old);
        const source = rowsFrom(old, 'SELECT * FROM work_records ORDER BY id');
        const next = new SQL.Database();
        try {
            createSchema(next);
            next.run('PRAGMA foreign_keys=ON');
            next.run('BEGIN');
            for (const r of source) {
                if (!dateOK(r.work_date) || typeof r.workplace !== 'string' || !r.workplace.trim() || !moneyOK(r.salary) || ![0,1].includes(r.direct_amount)) throw new Error('旧記録 ID ' + r.id + ' の形式を確認してください。');
                const direct = r.direct_amount === 1;
                const minutes = direct ? null : timeMinutes(r.end_time) - timeMinutes(r.start_time);
                if (!direct && (!Number.isInteger(minutes) || minutes <= 0 || !moneyOK(r.hourly_rate))) throw new Error('旧記録 ID ' + r.id + ' の勤務時間・時給が不正です。');
                const place = findOrCreatePlace(next, r.workplace);
                const parent = rowsFrom(next, 'SELECT * FROM work_records WHERE workplace_id=? AND work_date=?', [place.id,r.work_date])[0] || insertRecord(next,place,r.work_date,0,r.created_at);
                next.run('INSERT INTO work_record_items(work_record_id,pay_type,start_time,end_time,work_minutes,unit_rate,amount) VALUES(?,?,?,?,?,?,?)', [parent.id,direct?'direct':'hourly',direct?null:r.start_time,direct?null:r.end_time,minutes,direct?null:r.hourly_rate,r.salary]);
                next.run('INSERT INTO record_history(record_id,action,snapshot) VALUES(?,?,?)',[parent.id,'legacy_import',JSON.stringify(r)]);
            }
            next.run('COMMIT');
            validate(next);
            return next;
        } catch (error) { next.close(); throw error; }
    }
    function openBytes(bytes) {
        if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
        const candidate = new SQL.Database(bytes);
        try {
            if (version(candidate) === 0) {
                const converted = convertLegacy(candidate);
                candidate.close();
                return converted;
            }
            validate(candidate);
            return candidate;
        } catch (error) { candidate.close(); throw error; }
    }
    async function initInternal(progress) {
        SQL = await loadSQLite(progress);
        progress('SQLite保存データを確認中…');
        const saved = await WorkLogStorage.load();
        if (saved !== undefined) {
            if (!saved || !saved.bytes || !Number.isSafeInteger(saved.revision) || saved.revision < 1) throw new Error('保存データの形式が不正です。上書きはしていません。');
            // Existing IndexedDB is authoritative; never import v0.1 twice.
            const candidate = new SQL.Database(new Uint8Array(saved.bytes));
            try {
                const oldVersion = version(candidate);
                validate(candidate);
                revision = saved.revision;
                if (oldVersion !== version(candidate)) {
                    progress('DBを更新中…（更新前のデータを保持）');
                    revision = await WorkLogStorage.save(exportBytes(candidate), revision, {backupMigration:true});
                }
            } catch (error) { candidate.close(); throw error; }
            db = candidate;
            return;
        }
        const legacy = localStorage.getItem('kinmu_sqlite_v01');
        let candidate;
        try {
            if (legacy !== null) {
                progress('旧版のSQLiteデータを移行中…（元データは保持）');
                candidate = openBytes(decodeBase64(legacy));
            } else {
                progress('新しいSQLiteデータベースを作成中…');
                candidate = new SQL.Database();
                createSchema(candidate);
                validate(candidate);
            }
            try { revision = await WorkLogStorage.save(exportBytes(candidate),0); }
            catch (error) {
                // Another tab may have completed first-run migration already.
                if (error.code !== 'REVISION_CONFLICT') throw error;
                candidate.close(); candidate = null;
                const latest = await WorkLogStorage.load();
                if (!latest?.bytes || !Number.isSafeInteger(latest.revision) || latest.revision < 1) throw error;
                candidate = new SQL.Database(new Uint8Array(latest.bytes));
                validate(candidate); revision = latest.revision;
            }
            db = candidate; candidate = null;
        } finally { candidate?.close(); }
    }
    function init(progress = () => {}) {
        if (!initialization) initialization = initInternal(progress).catch(error => { initialization = null; throw error; });
        return initialization;
    }
    function ready() { if (!db) throw new Error('SQLiteの準備が完了していません。'); }
    async function write(fn) {
        ready(); if (busy) throw new Error('保存処理中です。'); busy = true;
        let before;
        try {
            before = exportBytes(db);
            db.run('BEGIN');
            const result = fn();
            db.run('COMMIT');
            validate(db);
            const nextRevision = await WorkLogStorage.save(exportBytes(db), revision);
            revision = nextRevision;
            return result;
        } catch (error) {
            if (before) { db.close(); db = new SQL.Database(before); db.run('PRAGMA foreign_keys=ON'); }
            throw error;
        } finally { busy = false; }
    }
    const places = () => rows('SELECT * FROM workplaces WHERE is_active=1 ORDER BY sort_order,id');
    const list = () => rows('SELECT r.*,COALESCE(SUM(i.amount),0) AS base_salary FROM work_records r LEFT JOIN work_record_items i ON i.work_record_id=r.id GROUP BY r.id ORDER BY work_date DESC,r.id DESC');
    const items = id => rows('SELECT * FROM work_record_items WHERE work_record_id=? ORDER BY id',[id]);
    const existing = (date,name) => rows('SELECT r.* FROM work_records r JOIN workplaces w ON w.id=r.workplace_id WHERE r.work_date=? AND w.name=?',[date,name])[0];
    function history(id,action) { db.run('INSERT INTO record_history(record_id,action,snapshot) VALUES(?,?,?)',[id,action,JSON.stringify({record:rows('SELECT * FROM work_records WHERE id=?',[id])[0],items:items(id)})]); }
    function validateItem(i) {
        if (!moneyOK(i.amount) || !['lesson','hourly','direct','piecework'].includes(i.type)) throw new Error('給与明細が不正です。');
        if (i.type === 'piecework') { const pay = gradingPay(i.rate,i.effort); if (typeof i.subject !== 'string' || !i.subject.trim() || pay.amount !== i.amount || pay.raw !== i.exactAmount) throw Error('採点明細が不正です。'); return; }
        if (i.type !== 'direct' && (!Number.isInteger(i.minutes) || i.minutes<=0 || timeMinutes(i.end)-timeMinutes(i.start)!==i.minutes || !moneyOK(i.rate))) throw new Error('勤務時間・単価を確認してください。');
        if (i.type==='lesson' && (typeof i.code!=='string' || !i.code || !['junior','adult'].includes(i.classType) || !Number.isFinite(i.multiplier) || i.multiplier<=0)) throw new Error('コマ情報が不正です。');
    }
    async function add(data) {
        if (!dateOK(data.date) || typeof data.name!=='string' || !data.name.trim() || !moneyOK(data.fare) || !Array.isArray(data.items) || !data.items.length) throw new Error('日付・勤務先・給与を確認してください。');
        data.items.forEach(validateItem);
        return write(() => {
            const place=findOrCreatePlace(db,data.name);
            let record=existing(data.date,data.name);
            if (!record) record=insertRecord(db,place,data.date,data.fare);
            else history(record.id,'append');
            let count=0;
            for (const i of data.items) {
                if (i.code && items(record.id).some(x=>x.lesson_code===i.code)) continue;
                db.run('INSERT INTO work_record_items(work_record_id,pay_type,lesson_code,class_type,start_time,end_time,work_minutes,unit_rate,multiplier,amount,subject,effort,exact_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[record.id,i.type,i.code??null,i.classType??null,i.start??null,i.end??null,i.minutes??null,i.rate??null,i.multiplier??1,i.amount,i.subject??null,i.effort??null,i.exactAmount??null]);
                count++;
            }
            if (!count) throw new Error('追加できる新しい明細がありません。');
            db.run('UPDATE work_records SET updated_at=CURRENT_TIMESTAMP WHERE id=?',[record.id]);
            return count;
        });
    }
    async function remove(id) { return write(()=>{history(id,'delete');db.run('DELETE FROM work_records WHERE id=?',[id]);}); }
    async function edit(id,fare,memo) {
        if (!moneyOK(fare) || typeof memo!=='string') throw new Error('交通費・備考を確認してください。');
        return write(()=>{history(id,'edit');db.run('UPDATE work_records SET transportation_fee=?,memo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[fare,memo,id]);});
    }
    async function restore(bytes) {
        ready(); if (busy) throw new Error('処理中です。'); busy=true;
        let candidate;
        try {
            candidate=openBytes(bytes);
            const next=await WorkLogStorage.save(exportBytes(candidate),revision,{backupPrevious:true});
            db.close(); db=candidate; candidate=null; revision=next;
        } finally { candidate?.close(); busy=false; }
    }
    return {init,places,list,items,existing,add,remove,edit,restore,export:()=>{ready();if(busy)throw new Error('保存処理中です。');return exportBytes(db);},exportMigration:async()=>{const p=await WorkLogStorage.loadMigration();return p?.bytes??null;},exportPrevious:async()=>{const p=await WorkLogStorage.loadPrevious();return p?.bytes??null;}};
})();
