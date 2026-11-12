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

    navigator.serviceWorker.register("./service-worker.js");

}