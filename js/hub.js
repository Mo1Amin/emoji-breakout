import { initChrome } from "./ui.js";

const root = document.documentElement;
const flood = document.getElementById("flood");

initChrome();
if (root.classList.contains("intro")) playIntro();

// The mark draws itself large in the middle of the screen, flies up to its
// place in the top-left corner, and the name stretches out beside it.
// Written with the Web Animations API on purpose: the reduced-motion rule in
// arcade.css shortens CSS animations to nothing, and this intro is the one
// moment that should still play.
async function playIntro() {
  const mark = document.getElementById("mark");
  const name = document.getElementById("brandName");
  const tile = mark.querySelector(".mark-tile");
  const strokes = [...mark.querySelectorAll(".ink")];

  const box = mark.getBoundingClientRect();
  const scale = Math.min(window.innerWidth, window.innerHeight) * 0.36 / box.width;
  const dx = window.innerWidth / 2 - (box.left + box.width / 2);
  const dy = window.innerHeight / 2 - (box.top + box.height / 2);
  const centre = `translate(${dx}px, ${dy}px) scale(${scale})`;

  const running = [];
  let skipped = false;
  const run = (el, frames, options) => {
    const animation = el.animate(frames, { fill: "both", ...options });
    running.push(animation);
    if (skipped) animation.finish();
    return animation;
  };
  // Any tap or key skips straight to the end.
  const skip = () => {
    skipped = true;
    running.forEach((a) => a.finish());
  };
  window.addEventListener("pointerdown", skip, { once: true });
  window.addEventListener("keydown", skip, { once: true });

  run(mark, [{ transform: centre }, { transform: centre }], { duration: 1 });
  run(tile, [{ transform: "scale(0) rotate(-14deg)" }, { transform: "none" }], {
    duration: 520,
    delay: 150,
    easing: "cubic-bezier(0.2, 0.9, 0.3, 1.3)",
  });
  const timing = [
    [560, 300],
    [880, 460],
    [1380, 300],
    [1700, 280],
  ];
  strokes.forEach((stroke, i) =>
    run(stroke, [{ strokeDashoffset: 1.01 }, { strokeDashoffset: 0 }], {
      delay: timing[i][0],
      duration: timing[i][1],
      easing: "ease-in-out",
    }),
  );
  await Promise.all(running.map((a) => a.finished));

  await run(mark, [{ transform: centre }, { transform: `${centre} scale(1.08) rotate(-4deg)` }, { transform: centre }], {
    duration: 380,
    easing: "ease-out",
  }).finished;
  await run(mark, [{ transform: centre }, { transform: "none" }], {
    duration: 850,
    easing: "cubic-bezier(0.7, 0, 0.2, 1)",
  }).finished;
  await run(name, [
    { clipPath: "inset(0 100% 0 0)", transform: "translateX(-14px)" },
    { clipPath: "inset(0 0 0 0)", transform: "none" },
  ], { duration: 560, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }).finished;

  window.removeEventListener("pointerdown", skip);
  window.removeEventListener("keydown", skip);
  root.classList.remove("intro");
  running.forEach((a) => a.cancel());
  try {
    sessionStorage.setItem("playto.intro", "1");
  } catch {}
}

// Opening a game floods its colour out from the card's icon before the
// next page takes over.
for (const card of document.querySelectorAll(".game-card")) {
  card.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
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
