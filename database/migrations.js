const SCHEMA = `
CREATE TABLE workplaces(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)), default_pay_type TEXT NOT NULL DEFAULT 'hourly' CHECK(default_pay_type IN('hourly','lesson','direct')), default_hourly_rate INTEGER, default_one_way_fare INTEGER NOT NULL DEFAULT 0 CHECK(default_one_way_fare>=0));
CREATE TABLE work_records(id INTEGER PRIMARY KEY, workplace_id INTEGER NOT NULL REFERENCES workplaces(id) ON DELETE RESTRICT, workplace_name_snapshot TEXT NOT NULL, work_date TEXT NOT NULL, transportation_fee INTEGER NOT NULL CHECK(transportation_fee>=0), memo TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(work_date,workplace_id));
CREATE TABLE work_record_items(id INTEGER PRIMARY KEY, work_record_id INTEGER NOT NULL REFERENCES work_records(id) ON DELETE CASCADE, pay_type TEXT NOT NULL CHECK(pay_type IN('lesson','hourly','direct')), lesson_code TEXT, class_type TEXT, start_time TEXT, end_time TEXT, work_minutes INTEGER CHECK(work_minutes>=0), unit_rate INTEGER CHECK(unit_rate>=0), multiplier REAL NOT NULL DEFAULT 1 CHECK(multiplier>0), amount INTEGER NOT NULL CHECK(amount>=0), UNIQUE(work_record_id,lesson_code));
CREATE INDEX records_place_date ON work_records(workplace_id,work_date);
CREATE TABLE record_history(id INTEGER PRIMARY KEY, record_id INTEGER NOT NULL, action TEXT NOT NULL, snapshot TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
PRAGMA user_version=1;`;
const INITIAL_PLACES=['守口スイミング','ロボ団','東進・採点','東進・品質管理','Cinet','想彩','エイジェックマーケティング','社会経済実験','Uber Eats','Rocket Now'];
const DB_VERSION = 2;
// Exact decimal input; keep the unrounded result alongside the provisional yen amount.
function gradingPay(rate, effort) {
    if (!Number.isSafeInteger(rate) || rate < 0 || typeof effort !== 'string' || !/^\d{1,12}(?:\.\d{1,12})?$/.test(effort)) throw Error('採点者単価・合計工数を確認してください（小数12桁まで）。');
    const [whole, fraction = ''] = effort.split('.');
    const scale = 10n ** BigInt(fraction.length);
    const units = BigInt(whole + fraction);
    if (units <= 0n) throw Error('合計工数は0より大きくしてください。');
    const product = BigInt(rate) * units;
    const rounded = (product * 2n + scale) / (scale * 2n);
    if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('給与額が大きすぎます。');
    const digits = product.toString().padStart(fraction.length + 1, '0');
    const raw = fraction.length ? (digits.slice(0,-fraction.length) + '.' + digits.slice(-fraction.length)).replace(/0+$/, '').replace(/\.$/, '') : digits;
    return {amount: Number(rounded), raw};
}
function migrate(db) {
    const version = db.exec('PRAGMA user_version')[0].values[0][0];
    if (version === DB_VERSION) return;
    if (version !== 1) throw Error('未対応のDBバージョンです。');
    // Rebuild only the two tables whose CHECK constraints must change.
    // Existing parent IDs and every old column are copied verbatim.
    db.run('PRAGMA foreign_keys=OFF');
    try {
        db.run('BEGIN');
        db.run(`CREATE TABLE workplaces_new(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN(0,1)), default_pay_type TEXT NOT NULL DEFAULT 'hourly' CHECK(default_pay_type IN('hourly','lesson','direct','piecework')), default_hourly_rate INTEGER, default_one_way_fare INTEGER NOT NULL DEFAULT 0 CHECK(default_one_way_fare>=0), default_grading_rate INTEGER CHECK(default_grading_rate>=0));
        INSERT INTO workplaces_new(id,name,sort_order,is_active,default_pay_type,default_hourly_rate,default_one_way_fare) SELECT id,name,sort_order,is_active,default_pay_type,default_hourly_rate,default_one_way_fare FROM workplaces;
        CREATE TABLE work_record_items_new(id INTEGER PRIMARY KEY, work_record_id INTEGER NOT NULL REFERENCES work_records(id) ON DELETE CASCADE, pay_type TEXT NOT NULL CHECK(pay_type IN('lesson','hourly','direct','piecework')), lesson_code TEXT, class_type TEXT, start_time TEXT, end_time TEXT, work_minutes INTEGER CHECK(work_minutes>=0), unit_rate INTEGER CHECK(unit_rate>=0), multiplier REAL NOT NULL DEFAULT 1 CHECK(multiplier>0), amount INTEGER NOT NULL CHECK(amount>=0), subject TEXT, effort TEXT, exact_amount TEXT, UNIQUE(work_record_id,lesson_code), CHECK(pay_type!='piecework' OR (subject IS NOT NULL AND effort IS NOT NULL AND exact_amount IS NOT NULL AND unit_rate IS NOT NULL)));
        INSERT INTO work_record_items_new(id,work_record_id,pay_type,lesson_code,class_type,start_time,end_time,work_minutes,unit_rate,multiplier,amount) SELECT id,work_record_id,pay_type,lesson_code,class_type,start_time,end_time,work_minutes,unit_rate,multiplier,amount FROM work_record_items;
        DROP TABLE work_record_items; ALTER TABLE work_record_items_new RENAME TO work_record_items;
        DROP TABLE workplaces; ALTER TABLE workplaces_new RENAME TO workplaces;
        UPDATE workplaces SET default_hourly_rate=1600 WHERE name='東進・品質管理';
        UPDATE workplaces SET default_pay_type='piecework', default_grading_rate=2000 WHERE name='東進・採点';
        PRAGMA user_version=2;`);
        if (db.exec('PRAGMA foreign_key_check').length) throw Error('DB更新後の外部キー整合性エラー');
        db.run('COMMIT');
    } catch (error) { db.run('ROLLBACK'); throw error; }
    finally { db.run('PRAGMA foreign_keys=ON'); }
}
function createSchema(db){db.run('BEGIN');try{db.run(SCHEMA);INITIAL_PLACES.forEach((name,i)=>db.run('INSERT INTO workplaces(name,sort_order,default_pay_type,default_hourly_rate,default_one_way_fare) VALUES(?,?,?,?,?)',[name,(i+1)*10,i===0?'lesson':'hourly',i===1?1300:null,i===0?190:i===1?500:0]));db.run('COMMIT');}catch(e){db.run('ROLLBACK');throw e;}}
