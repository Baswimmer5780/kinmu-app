const openText = document.getElementById("openText");
const inputArea = document.getElementById("inputArea");
const arrow = document.getElementById("arrow");

openText.onclick = function () {

    inputArea.classList.toggle("open");
    arrow.classList.toggle("open");

    const isOpen = inputArea.classList.contains("open");

    openText.setAttribute("aria-expanded", isOpen);
};

if ("serviceWorker" in navigator) {

    navigator.serviceWorker.register("./service-worker.js").catch(() => {});

}


// 勤務先・給与体系の切り替え
const workplace = document.getElementById("workplace");
const rate = document.getElementById("rate");
const hourly = document.getElementById("hourly");
const lesson = document.getElementById("lesson");
const direct = document.getElementById("direct");
const flat = document.getElementById("flat");
const lessonButtons = document.querySelectorAll(".lessonButton");
const numberOfLessons = document.getElementById("numberOfLessons");
const transport = document.getElementById("transport");
const otherWorkplace = document.getElementById("otherWorkplace");
const otherWorkplaceField = document.getElementById("otherWorkplaceField");
const ONE_WAY_FARES = new Map([["守口スイミング", 190], ["ロボ団", 500]]);
const HOURLY_RATES = new Map([["ロボ団", 1300]]);

// 将来のSQLite保存用：選択区分と実際の勤務先名を分けて取得する。
function getWorkplaceData() {
    return {
        workplaceType: workplace.value,
        workplaceName: workplace.value === "その他" ? otherWorkplace.value.trim() : workplace.value
    };
}
function formatDuration(minutes) {
    return Math.trunc(minutes / 60) + "時間" + minutes % 60 + "分";
}
const yen = n => n.toLocaleString("ja-JP");

function changeMode() {
    const isLesson = workplace.value === "守口スイミング" && !direct.checked;
    const hasWorkplace = workplace.value !== "";
    otherWorkplaceField.hidden = workplace.value !== "その他";
    otherWorkplace.required = !otherWorkplaceField.hidden;
    otherWorkplace.disabled = otherWorkplaceField.hidden;
    lesson.hidden = !isLesson;
    hourly.hidden = !hasWorkplace || isLesson || direct.checked;
    flat.hidden = !hasWorkplace || !direct.checked;
    calcLessons();
}
workplace.onchange = function () {
    rate.value = HOURLY_RATES.get(workplace.value) ?? "";
    changeMode();
};
direct.onchange = changeMode;

function calcLessons() {
    // 選択中のボタンだけ取得して、個数を数える
    const selectedLessons = document.querySelectorAll(".lessonButton.selected");
    const count = selectedLessons.length;
    const valid = count > 0;
    numberOfLessons.textContent = count;
    document.getElementById("selectedCount").textContent = count + "コマ選択中";
    const totalWorkTime = count * 70;
    const totalWorkTimeHour = Math.trunc(totalWorkTime / 60);
    const totalWorkTimeMinute = totalWorkTime % 60;
    document.getElementById("workTime").textContent = totalWorkTimeHour + "時間" + totalWorkTimeMinute + "分";
    let salary = 0;
    let adultCount = 0;
    selectedLessons.forEach(function (button) {
        const multiplier = Number(button.dataset.rate);
        salary += 1440 * multiplier;
        if (multiplier === 1.25) adultCount++;
    });
    const juniorCount = count - adultCount;
    document.getElementById("juniorSummary").textContent = juniorCount + "コマ / " + yen(juniorCount * 1440) + "円";
    document.getElementById("adultSummary").textContent = adultCount + "コマ / " + yen(adultCount * 1800) + "円";
    document.getElementById("lessonSalary").textContent = yen(salary) + "円";
    document.getElementById("lessonError").hidden = valid;
    const minutes = id => {
        const value = document.getElementById(id).value;
        if (!value) return NaN;
        const [h, m] = value.split(":").map(Number);
        return h * 60 + m;
    };
    const duration = minutes("end") - minutes("start");
    const hourlyBase = duration > 0 && rate.value !== "" && rate.validity.valid
        ? Math.round(duration / 60 * Number(rate.value)) : null;
    document.getElementById("hourlyWorkTime").textContent = duration > 0 ? formatDuration(duration) : "—";
    document.getElementById("hourlySalary").textContent = hourlyBase === null ? "—" : yen(hourlyBase) + "円";
    let base = null;
    if (workplace.value) {
        if (direct.checked) {
            const amount = document.getElementById("amount");
            if (amount.value !== "" && amount.validity.valid) base = Number(amount.value);
        } else if (!lesson.hidden) {
            if (valid) base = salary;
        } else {
            base = hourlyBase;
        }
    }
    const oneWay = ONE_WAY_FARES.get(workplace.value) ?? 0;
    const fare = oneWay * 2;
    transport.textContent = yen(fare) + "円";
    document.getElementById("transportFormula").textContent = yen(oneWay) + "円 × 2";
    document.getElementById("baseSalary").textContent = base === null ? "—" : yen(base);
    document.getElementById("transportSalary").textContent = yen(fare);
    document.getElementById("grossSalary").textContent = base === null ? "—" : yen(base + fare);
}
// タップするたびに選択・解除して再計算
lessonButtons.forEach(function (button) {
    button.onclick = function () {
        if (button.disabled) return;
        const selected = button.classList.toggle("selected");
        button.setAttribute("aria-pressed", String(selected));
        calcLessons();
    };
});
document.getElementById("clearLessons").onclick = function () {
    lessonButtons.forEach(function (button) {
        button.classList.remove("selected");
        button.setAttribute("aria-pressed", "false");
    });
    calcLessons();
};
otherWorkplace.oninput = calcLessons;
document.getElementById("form1").addEventListener("submit", event => event.preventDefault());
for (const id of ["start", "end", "rate", "amount"]) {
    document.getElementById(id).oninput = calcLessons;
}
// 日付から曜日を取得（0=日、1=月、…6=土）
const dateInput = document.getElementById("date");
function updateLessonAvailability() {
    const value = dateInput.value;
    const day = value ? new Date(value + "T00:00:00").getDay() : null;
    lessonButtons.forEach(function (button) {
        const allowed = day !== null && (!button.dataset.days || button.dataset.days.split(",").map(Number).includes(day));
        button.disabled = !allowed;
        if (!allowed) {
            button.classList.remove("selected");
            button.setAttribute("aria-pressed", "false");
        }
    });
    document.getElementById("lessonDayHint").textContent = day === null ? "日付を選択してください。" : "「" + "日月火水木金土"[day] + "曜日」の勤務可能コマを表示しています。";
    calcLessons();
}
dateInput.addEventListener("input", updateLessonAvailability);
dateInput.addEventListener("change", updateLessonAvailability);
if (!dateInput.value) {
    const today = new Date();
    dateInput.value = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
}
updateLessonAvailability();
changeMode();

// 記録パネルの開閉
const openRecords = document.getElementById("openRecords");
const recordsArea = document.getElementById("recordsArea");
const recordsArrow = document.getElementById("recordsArrow");
openRecords.onclick = function () {
    const isOpen = recordsArea.classList.toggle("open");
    recordsArrow.classList.toggle("open", isOpen);
    recordsArea.inert = !isOpen;
    openRecords.setAttribute("aria-expanded", String(isOpen));
};

// ナビの「記録」は同じページの記録パネルを開く
document.getElementById("log").addEventListener("click", function () {
    if (!recordsArea.classList.contains("open")) openRecords.click();
});
