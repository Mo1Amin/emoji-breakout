import { initChrome } from "./ui.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const flood = document.getElementById("flood");

initChrome();

// Opening a game floods its colour out from the card's icon before the
// next page takes over.
for (const card of document.querySelectorAll(".game-card")) {
  card.addEventListener("click", (e) => {
    if (reducedMotion || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const icon = card.querySelector(".game-icon").getBoundingClientRect();
    flood.style.setProperty("--x", `${icon.left + icon.width / 2}px`);
    flood.style.setProperty("--y", `${icon.top + icon.height / 2}px`);
    flood.style.background = getComputedStyle(card).getPropertyValue("--tone");
    flood.classList.add("go");
    setTimeout(() => (location.href = card.href), 650);
  });
}

// Coming back through the browser history restores this page from cache
// with the flood still covering it.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) flood.classList.remove("go");
});
