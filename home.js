// WORK LOG: 設定 → DOM → 計算 → 表示 → イベント → 初期化
const LESSON_MINUTES = 70;
const LESSON_PAY = 1440;
const ADULT_MULTIPLIER = 1.25;
const ONE_WAY_FARES = new Map([["守口スイミング", 190], ["ロボ団", 500]]);
let workplaceSettings = new Map();
let hourlyOverride = false, gradingOverride = false;
const WEEKDAYS = "日月火水木金土";
let databaseReady = false;
let saving = false;

const byId = id => document.getElementById(id);
const elements = {};
for (const id of [
    "openRegistration", "inputArea", "registrationArrow", "openRecords", "recordsArea",
    "recordsArrow", "log", "workForm", "workplace", "rate", "hourly", "lesson", "direct",
    "flat", "otherWorkplace", "otherWorkplaceField", "date", "start", "end", "amount",
    "numberOfLessons", "selectedCount", "workTime", "juniorSummary", "adultSummary",
    "lessonSalary", "lessonError", "hourlyWorkTime", "hourlySalary", "transport",
    "grading", "gradingRate", "gradingLock", "gradingSubject", "gradingEffort", "gradingExact", "gradingSalary", "rateLock", "rateHint",
    "transportFormula", "baseSalary", "transportSalary", "grossSalary", "clearLessons", "lessonDayHint"
]) {
    elements[id] = byId(id);
}
const lessonButtons = document.querySelectorAll(".lessonButton");

// 共通の表示・入力処理
const yen = amount => amount.toLocaleString("ja-JP");
function formatDuration(minutes) {
    return Math.trunc(minutes / 60) + "時間" + minutes % 60 + "分";
}
function timeToMinutes(value) {
    if (!value) return NaN;
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
}
function readAmount(input) {
    return input.value !== "" && input.validity.valid ? Number(input.value) : null;
}
function setText(id, value) {
    elements[id].textContent = value;
}

// 将来のSQLite保存用：選択区分と実際の勤務先名を分ける。
function getWorkplaceData() {
    const workplaceType = elements.workplace.value;
    return {
        workplaceType,
        workplaceName: workplaceType === "その他" ? elements.otherWorkplace.value.trim() : workplaceType
    };
}

// 計算：DOMへの書き込みは行わない。
function calculateLessons() {
    const selected = Array.from(lessonButtons).filter(button => button.classList.contains("selected"));
    const count = selected.length;
    const adultCount = selected.filter(button => Number(button.dataset.rate) === ADULT_MULTIPLIER).length;
    return {
        count,
        adultCount,
        juniorCount: count - adultCount,
        duration: count * LESSON_MINUTES,
        salary: selected.reduce((sum, button) => sum + LESSON_PAY * Number(button.dataset.rate), 0)
    };
}
function calculateHourly() {
    const duration = timeToMinutes(elements.end.value) - timeToMinutes(elements.start.value);
    const rate = readAmount(elements.rate);
    return { duration, salary: duration > 0 && rate !== null ? Math.round(duration / 60 * rate) : null };
}
function calculateGrading() {
    try { return gradingPay(readAmount(elements.gradingRate), elements.gradingEffort.value.trim()); }
    catch (_) { return null; }
}
function resetRates() {
    const place = workplaceSettings.get(elements.workplace.value);
    hourlyOverride = gradingOverride = false;
    elements.rate.value = place?.default_hourly_rate ?? "";
    elements.gradingRate.value = place?.default_grading_rate ?? 2000;
    updateLocks();
}
function updateLocks() {
    const rate = workplaceSettings.get(elements.workplace.value)?.default_hourly_rate;
    const configured = rate != null;
    elements.rate.readOnly = configured && !hourlyOverride;
    elements.rateLock.hidden = !configured;
    elements.rateLock.textContent = hourlyOverride ? "基本時給に戻す" : "今回だけ変更";
    elements.rateHint.textContent = configured ? (hourlyOverride ? "今回の勤務だけ変更します。基本時給は変わりません。" : "基本時給 " + yen(rate) + "円（ロック中）") : "時給を入力してください。";
    elements.gradingRate.readOnly = !gradingOverride;
    elements.gradingLock.textContent = gradingOverride ? "基本単価に戻す" : "今回だけ変更";
}
function calculatePayroll(lessons, hourly) {
    const workplace = getWorkplaceData().workplaceType;
    let base = null;
    if (workplace) {
        if (elements.direct.checked) base = readAmount(elements.amount);
        else if (!elements.grading.hidden) base = calculateGrading()?.amount ?? null;
        else if (!elements.lesson.hidden) base = lessons.count > 0 ? lessons.salary : null;
        else base = hourly.salary;
    }
    const oneWay = ONE_WAY_FARES.get(workplace) ?? 0;
    const fare = oneWay * 2;
    return { base, oneWay, fare, gross: base === null ? null : base + fare };
}

// 表示：計算結果を画面に反映する。
function renderLessons(result) {
    setText("numberOfLessons", result.count);
    setText("selectedCount", result.count + "コマ選択中");
    setText("workTime", formatDuration(result.duration));
    setText("juniorSummary", result.juniorCount + "コマ / " + yen(result.juniorCount * LESSON_PAY) + "円");
    setText("adultSummary", result.adultCount + "コマ / " + yen(result.adultCount * LESSON_PAY * ADULT_MULTIPLIER) + "円");
    setText("lessonSalary", yen(result.salary) + "円");
    elements.lessonError.hidden = result.count > 0;
}
function renderHourly(result) {
    setText("hourlyWorkTime", result.duration > 0 ? formatDuration(result.duration) : "—");
    setText("hourlySalary", result.salary === null ? "—" : yen(result.salary) + "円");
}
function renderPayroll(result) {
    setText("transport", yen(result.fare) + "円");
    setText("transportFormula", yen(result.oneWay) + "円 × 2");
    setText("baseSalary", result.base === null ? "—" : yen(result.base));
    setText("transportSalary", yen(result.fare));
    setText("grossSalary", result.gross === null ? "—" : yen(result.gross));
}
function updatePreview() {
    const lessons = calculateLessons();
    const hourly = calculateHourly();
    renderLessons(lessons);
    renderHourly(hourly);
    const grading = calculateGrading();
    setText("gradingExact", grading ? grading.raw + "円" : "—");
    setText("gradingSalary", grading ? yen(grading.amount) + "円" : "—");
    renderPayroll(calculatePayroll(lessons, hourly));
    updateSaveButton();
}

// 勤務先・給与体系の切り替え
function updatePayMode() {
    const workplace = elements.workplace.value;
    const isGrading = workplace === "東進・採点";
    if (isGrading) elements.direct.checked = false;
    elements.direct.disabled = isGrading;
    const direct = elements.direct.checked;
    const isLesson = workplace === "守口スイミング" && !direct;
    elements.otherWorkplaceField.hidden = workplace !== "その他";
    elements.otherWorkplace.required = !elements.otherWorkplaceField.hidden;
    elements.otherWorkplace.disabled = elements.otherWorkplaceField.hidden;
    elements.lesson.hidden = !isLesson;
    elements.grading.hidden = !isGrading;
    elements.hourly.hidden = !workplace || isLesson || direct || isGrading;
    elements.flat.hidden = !workplace || !direct;
    // Hidden controls must not participate in the browser's form validation.
    for (const id of ["start", "end", "rate"]) elements[id].disabled = elements.hourly.hidden;
    elements.amount.disabled = elements.flat.hidden;
    for (const id of ["gradingRate", "gradingSubject", "gradingEffort"]) elements[id].disabled = !isGrading;
    updateLocks();
    updatePreview();
}

// コマ選択・曜日制限
function setLessonSelected(button, selected) {
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
}
function updateLessonAvailability() {
    const value = elements.date.value;
    const day = value ? new Date(value + "T00:00:00").getDay() : null;
    lessonButtons.forEach(button => {
        const allowed = day !== null && (!button.dataset.days || button.dataset.days.split(",").map(Number).includes(day));
        button.disabled = !allowed;
        if (!allowed) setLessonSelected(button, false);
    });
    setText("lessonDayHint", day === null ? "日付を選択してください。" : "「" + WEEKDAYS[day] + "曜日」の勤務可能コマを表示しています。");
    updatePreview();
}

// 共通の開閉処理：勤務登録・記録の両方で使用。
function setupPanel(button, area, arrow) {
    function setOpen(isOpen) {
        area.classList.toggle("open", isOpen);
        arrow.classList.toggle("open", isOpen);
        area.inert = !isOpen;
        button.setAttribute("aria-expanded", String(isOpen));
    }
    button.addEventListener("click", () => setOpen(!area.classList.contains("open")));
    return setOpen;
}

function bindEvents() {
    setupPanel(elements.openRegistration, elements.inputArea, elements.registrationArrow);
    const openRecords = setupPanel(elements.openRecords, elements.recordsArea, elements.recordsArrow);
    elements.log.addEventListener("click", () => openRecords(true));
    if (location.hash === "#recordsPanel") openRecords(true);
    elements.workplace.addEventListener("change", () => {
        resetRates();
        updatePayMode();
    });
    elements.rateLock.addEventListener("click", () => {
        hourlyOverride = !hourlyOverride;
        if (!hourlyOverride) elements.rate.value = workplaceSettings.get(elements.workplace.value)?.default_hourly_rate ?? "";
        updateLocks(); updatePreview();
    });
    elements.gradingLock.addEventListener("click", () => {
        gradingOverride = !gradingOverride;
        if (!gradingOverride) elements.gradingRate.value = workplaceSettings.get(elements.workplace.value)?.default_grading_rate ?? 2000;
        updateLocks(); updatePreview();
    });
    for (const id of ["gradingRate", "gradingSubject", "gradingEffort"]) elements[id].addEventListener("input", updatePreview);
    elements.direct.addEventListener("change", updatePayMode);
    lessonButtons.forEach(button => {
        button.addEventListener("click", () => {
            if (button.disabled) return;
            setLessonSelected(button, !button.classList.contains("selected"));
            updatePreview();
        });
    });
    elements.clearLessons.addEventListener("click", () => {
        lessonButtons.forEach(button => setLessonSelected(button, false));
        updatePreview();
    });
    for (const id of ["start", "end", "rate", "amount", "otherWorkplace"]) {
        elements[id].addEventListener("input", updatePreview);
    }
    elements.date.addEventListener("input", updateLessonAvailability);
    elements.date.addEventListener("change", updateLessonAvailability);
    elements.workForm.addEventListener("submit", saveRegistration);
}
function initialize() {
    bindEvents();
    if (!elements.date.value) {
        const today = new Date();
        elements.date.value = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    }
    updateLessonAvailability();
    updatePayMode();

}
// The button depends on both successful persistent database initialization and valid input.
function getRegistration() {
    const name = getWorkplaceData().workplaceName;
    const date = elements.date.value;
    const lessons = calculateLessons();
    const hourly = calculateHourly();
    const payroll = calculatePayroll(lessons, hourly);
    if (!name || !date || !elements.date.validity.valid || payroll.base === null || !Number.isSafeInteger(payroll.base) || payroll.base < 0) return null;
    let items;
    if (elements.direct.checked) items = [{type: "direct", amount: payroll.base}];
    else if (!elements.grading.hidden) {
        const result = calculateGrading();
        if (!result || !elements.gradingSubject.value) return null;
        items = [{type:"piecework", subject:elements.gradingSubject.value, rate:Number(elements.gradingRate.value), effort:elements.gradingEffort.value.trim(), exactAmount:result.raw, amount:result.amount}];
    }
    else if (!elements.lesson.hidden) items = Array.from(lessonButtons).filter(b => b.classList.contains("selected") && !b.disabled).map(b => ({
        type: "lesson", code: b.value, classType: Number(b.dataset.rate) === ADULT_MULTIPLIER ? "adult" : "junior",
        start: b.dataset.start, end: b.dataset.end, minutes: LESSON_MINUTES,
        rate: LESSON_PAY, multiplier: Number(b.dataset.rate), amount: LESSON_PAY * Number(b.dataset.rate)
    }));
    else items = [{type: "hourly", start: elements.start.value, end: elements.end.value, minutes: hourly.duration, rate: Number(elements.rate.value), amount: payroll.base}];
    return items.length ? {name,date,fare:payroll.fare,items} : null;
}
function updateSaveButton() {
    const button = byId("save");
    const help = byId("saveHelp");
    const valid = !!getRegistration();
    button.disabled = !databaseReady || !valid || saving;
    if (help) help.textContent = saving ? "保存中…" : !databaseReady ? "SQLiteの準備が完了するまで登録できません。上部の状態表示を確認してください。" : !valid ? "勤務先・日付・勤務内容を入力すると登録できます。" : "入力内容をSQLiteに保存できます。";
}
async function startDatabase() {
    const status = byId("status");
    try {
        await WorkDB.init(message => { status.textContent = message; });
        const select = elements.workplace;
        const previous = select.value;
        const places = WorkDB.places();
        workplaceSettings = new Map(places.map(p => [p.name,p]));
        select.replaceChildren(new Option("勤務先を選択", ""), ...places.map(p => new Option(p.name,p.name)), new Option("その他","その他"));
        select.value = previous;
        resetRates();
        databaseReady = true;
        status.textContent = "SQLite保存可能";
        updatePayMode();
    } catch (error) {
        databaseReady = false;
        status.textContent = "SQLite準備失敗: " + error.message;
        console.error(error);
        updateSaveButton();
    }
}
async function saveRegistration(event) {
    event.preventDefault();
    if (!databaseReady || saving) return;
    const data = getRegistration();
    if (!data) { updateSaveButton(); return; }
    const status = byId("status");
    const message = byId("registrationMessage");
    try {
        const old = WorkDB.existing(data.date, data.name);
        if (old) {
            const previous = WorkDB.items(old.id);
            const duplicateCodes = data.items.filter(i => i.code && previous.some(x=>x.lesson_code===i.code)).map(i=>i.code);
            const newItems = data.items.filter(i=>!i.code || !duplicateCodes.includes(i.code));
            if (!newItems.length) { message.textContent = "選択したコマはすべて登録済みです。"; return; }
            const overlap = newItems.some(i => previous.some(x => i.start && x.start_time && i.start < x.end_time && i.end > x.start_time));
            const directDuplicate = newItems.some(i=>i.type==="direct" && previous.some(x=>x.pay_type==="direct" && x.amount===i.amount));
            let detail = "既存の勤務記録に追加しますか？\n交通費は登録済みの金額のままです。";
            if (duplicateCodes.length) detail += "\n登録済みコマは除外: " + duplicateCodes.join("、");
            if (overlap) detail += "\n注意: 勤務時間が重複しています。";
            if (newItems.some(i=>i.type==="piecework") && previous.some(x=>x.pay_type==="piecework")) detail += "\n注意: この日の採点記録がすでにあります。Slackの累計ではなく、未登録の追加工数だけを入力してください。";
            if (directDuplicate) detail += "\n注意: 同じ金額の直接入力が登録済みです。";
            if (!confirm(detail)) return;
        }
        saving = true;
        updateSaveButton();
        message.textContent = "保存中…";
        const count = await WorkDB.add(data);
        message.textContent = "勤務記録を保存しました（明細 " + count + "件）。";
        status.textContent = "SQLite保存可能";
        lessonButtons.forEach(b => setLessonSelected(b,false));
        if (elements.direct.checked) elements.amount.value = "";
        elements.gradingEffort.value = "";
        resetRates();
    } catch (error) {
        message.textContent = "保存できませんでした: " + error.message;
        if (error.code === "REVISION_CONFLICT") { databaseReady = false; status.textContent = error.message; }
        console.error(error);
    } finally { saving = false; updatePreview(); }
}
try {
    initialize();
    startDatabase();
} catch (error) {
    byId("status").textContent = "画面初期化エラー: " + error.message;
    console.error(error);
}
