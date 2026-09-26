import { drawEmoji } from "./emoji.js";
import { initChrome } from "./ui.js";

const POOL = ["🍓", "🍋", "🐍", "🚀", "🧠", "🏒", "👀", "🍎", "👾", "⭐", "🌸", "🎮", "😎", "🍉", "🐲", "🍄", "🦄", "🍇"];
const FORM_MS = 1500;
const HOLD_MS = 450;
const RELEASE_MS = 700;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

initChrome();

const canvas = document.getElementById("space");
const wordmark = document.getElementById("wordmark");
const ctx = canvas.getContext("2d");
const count = navigator.hardwareConcurrency > 4 ? 90 : 55;
let width = 0;
let height = 0;
let stars = [];
let swarm = null;
let speed = 0.0022;
let warp = null;
let tilt = { x: 0, y: 0, tx: 0, ty: 0 };
let visible = true;
let last = performance.now();

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

function frame(now) {
  const dt = Math.min(now - last, 50);
  last = now;
  if (visible || warp) {
    ctx.clearRect(0, 0, width, height);
    drawStars(dt);
    if (swarm) drawSwarm(now);
  }
  requestAnimationFrame(frame);
}

function drawStars(dt) {
  tilt.x += (tilt.tx - tilt.x) * 0.05;
  tilt.y += (tilt.ty - tilt.y) * 0.05;
  if (warp) speed = Math.min(speed * 1.09, 0.06);

  const cx = width / 2 + tilt.x * 40;
  const cy = height / 2 + tilt.y * 30;
  const focal = Math.min(width, height) * 0.5;
  const base = Math.max(34, Math.min(width, height) * 0.075);

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
    // Bucketed so a few dozen cached bitmaps cover every depth.
    const size = Math.max(8, Math.round(base / (star.z * 2.2) / 6) * 6);
    if (sx < -size || sx > width + size || sy < -size || sy > height + size) continue;
    ctx.globalAlpha = Math.min(1, (1 - star.z) * 1.6);
    drawEmoji(ctx, star.emoji, sx, sy, size, star.spin * (1 - star.z) * 2);
  }
  ctx.globalAlpha = 1;
}

// The name is sampled from the real heading's font and position, then a
// swarm of emoji flies in from the edges of space and settles on those
// points, left to right, before the text itself takes over.
async function formWordmark() {
  const style = getComputedStyle(wordmark);
  const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  await document.fonts.load(font, wordmark.textContent);
  const box = wordmark.getBoundingClientRect();
  const origin = canvas.getBoundingClientRect();

  const sample = document.createElement("canvas");
  sample.width = Math.ceil(box.width);
  sample.height = Math.ceil(box.height);
  const g = sample.getContext("2d", { willReadFrequently: true });
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(wordmark.textContent, sample.width / 2, sample.height / 2 + parseFloat(style.fontSize) * 0.06);
  const pixels = g.getImageData(0, 0, sample.width, sample.height).data;

  const step = Math.max(6, Math.round(parseFloat(style.fontSize) / 13));
  const points = [];
  for (let y = step / 2; y < sample.height; y += step) {
    for (let x = step / 2; x < sample.width; x += step) {
      if (pixels[(Math.floor(y) * sample.width + Math.floor(x)) * 4 + 3] > 140) points.push([x, y]);
    }
  }

  const reach = Math.max(width, height);
  swarm = {
    start: performance.now(),
    size: step * 1.5,
    bits: points.map(([x, y]) => {
      const angle = Math.random() * Math.PI * 2;
      const tx = box.left - origin.left + x;
      const ty = box.top - origin.top + y;
      return {
        sx: width / 2 + Math.cos(angle) * reach * (0.6 + Math.random() * 0.5),
        sy: height / 2 + Math.sin(angle) * reach * (0.6 + Math.random() * 0.5),
        tx,
        ty,
        delay: (x / sample.width) * 450 + Math.random() * 180,
        emoji: POOL[Math.floor(Math.random() * POOL.length)],
        spin: (Math.random() - 0.5) * 6,
      };
    }),
  };
}

function drawSwarm(now) {
  const elapsed = now - swarm.start;
  const releaseAt = FORM_MS + HOLD_MS;
  if (elapsed > releaseAt && !wordmark.classList.contains("formed")) wordmark.classList.add("formed");
  const fade = elapsed > releaseAt ? 1 - (elapsed - releaseAt) / RELEASE_MS : 1;
  if (fade <= 0) {
    swarm = null;
    return;
  }
  ctx.globalAlpha = fade;
  for (const bit of swarm.bits) {
    const t = Math.min(1, Math.max(0, (elapsed - bit.delay) / (FORM_MS - 450)));
    const ease = 1 - Math.pow(1 - t, 3);
    const x = bit.sx + (bit.tx - bit.sx) * ease;
    const y = bit.sy + (bit.ty - bit.sy) * ease;
    const size = swarm.size * (1 + (1 - ease) * 2.5);
    drawEmoji(ctx, bit.emoji, x, y, Math.round(size / 3) * 3, bit.spin * (1 - ease));
  }
  ctx.globalAlpha = 1;
}

resize();
stars = Array.from({ length: count }, () => spawn());
window.addEventListener("resize", resize);

if (reducedMotion) {
  // One still frame of the galaxy instead of an empty hero.
  wordmark.classList.add("formed");
  drawStars(0);
} else {
  requestAnimationFrame(frame);
  formWordmark().catch(() => wordmark.classList.add("formed"));
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
    warp = { emoji: card.dataset.emoji };
    tilt.tx = tilt.ty = 0;
    for (let i = 0; i < 24; i++) stars[i] = spawn(0.3 + Math.random() * 0.7, card.dataset.emoji);

    const flood = document.getElementById("flood");
    flood.style.setProperty("--x", `${icon.left + icon.width / 2}px`);
    flood.style.setProperty("--y", `${icon.top + icon.height / 2}px`);
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
