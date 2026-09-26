import { initChrome } from "./ui.js";

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const POOL = ["🍓", "🍋", "🐍", "🚀", "🧠", "🍎", "👾", "⭐", "🌸", "🎮", "😎", "🍉", "🐲", "🍄", "🦄", "🍇"];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

initChrome();

const canvas = document.getElementById("space");
const ctx = canvas.getContext("2d");
const sprites = new Map();
const count = navigator.hardwareConcurrency > 4 ? 90 : 55;
let width = 0;
let height = 0;
let dpr = 1;
let stars = [];
let speed = 0.0022;
let warp = null;
let tilt = { x: 0, y: 0, tx: 0, ty: 0 };
let visible = true;
let last = performance.now();

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawn(z = 0.2 + Math.random() * 0.8, emoji) {
  return {
    x: (Math.random() - 0.5) * 2.4,
    y: (Math.random() - 0.5) * 2.4,
    z,
    emoji: emoji ?? POOL[Math.floor(Math.random() * POOL.length)],
    spin: (Math.random() - 0.5) * 0.6,
  };
}

// Sizes are bucketed so a few dozen cached bitmaps cover every depth.
function sprite(emoji, size) {
  const bucket = Math.max(8, Math.round(size / 6) * 6);
  const key = `${emoji}|${bucket}`;
  let image = sprites.get(key);
  if (!image) {
    image = document.createElement("canvas");
    const px = Math.ceil(bucket * dpr);
    image.width = image.height = px;
    const g = image.getContext("2d");
    g.font = `${px * 0.82}px ${EMOJI_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(emoji, px / 2, px / 2 + px * 0.06);
    sprites.set(key, image);
  }
  return image;
}

function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  if (visible || warp) render(dt);
  requestAnimationFrame(frame);
}

function render(dt) {
  tilt.x += (tilt.tx - tilt.x) * 0.05;
  tilt.y += (tilt.ty - tilt.y) * 0.05;
  if (warp) speed = Math.min(speed * 1.09, 0.06);

  const cx = width / 2 + tilt.x * 40;
  const cy = height / 2 + tilt.y * 30;
  const focal = Math.min(width, height) * 0.5;
  const base = Math.max(34, Math.min(width, height) * 0.075);

  ctx.clearRect(0, 0, width, height);
  stars.sort((a, b) => b.z - a.z);
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    star.z -= speed * dt * 0.06;
    if (star.z <= 0.04) {
      stars[i] = spawn(1, warp && Math.random() < 0.7 ? warp.emoji : undefined);
      continue;
    }
    const sx = cx + (star.x / star.z) * focal;
    const sy = cy + (star.y / star.z) * focal;
    const size = base / (star.z * 2.2);
    if (sx < -size || sx > width + size || sy < -size || sy > height + size) continue;
    ctx.globalAlpha = Math.min(1, (1 - star.z) * 1.6);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(star.spin * (1 - star.z) * 2);
    ctx.drawImage(sprite(star.emoji, size), -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

if (!reducedMotion) {
  resize();
  stars = Array.from({ length: count }, () => spawn());
  requestAnimationFrame(frame);
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", (e) => {
    tilt.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    tilt.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  });
  new IntersectionObserver(([entry]) => (visible = entry.isIntersecting)).observe(canvas);
  document.addEventListener("visibilitychange", () => (last = performance.now()));
}

// Opening a game flies the camera into that game's emoji, and the game's
// colour floods out from its card before the next page takes over.
for (const card of document.querySelectorAll(".game-card")) {
  card.addEventListener("click", (e) => {
    if (reducedMotion || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const icon = card.querySelector(".game-icon").getBoundingClientRect();
    const x = icon.left + icon.width / 2;
    const y = icon.top + icon.height / 2;
    warp = { emoji: card.dataset.emoji };
    tilt.tx = tilt.ty = 0;
    for (let i = 0; i < 24; i++) stars[i] = spawn(0.3 + Math.random() * 0.7, card.dataset.emoji);

    const flood = document.getElementById("flood");
    flood.style.setProperty("--x", `${x}px`);
    flood.style.setProperty("--y", `${y}px`);
    flood.style.background = getComputedStyle(card).getPropertyValue("--tone");
    flood.textContent = card.dataset.emoji;
    flood.classList.add("go");
    setTimeout(() => (location.href = card.href), 720);
  });
}

// Coming back through the browser history restores this page from cache
// with the flood still covering it.
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  document.getElementById("flood").classList.remove("go");
  warp = null;
  speed = 0.0022;
});
