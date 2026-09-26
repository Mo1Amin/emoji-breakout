import { drawEmoji } from "./emoji.js";
import { t } from "./i18n.js";
import { openLobby } from "./lobby.js";
import { bindRoom, homeAction, isInt, isNum } from "./online.js";
import { pick, randomSeed, seededRandom } from "./random.js";
import { playClip, sfx } from "./sfx.js";
import { load, save } from "./storage.js";
import { fitCanvas, hideOverlay, initChrome, onThemeChange, readTheme, showOverlay, toast } from "./ui.js";

// Everything is simulated in a fixed 360x480 world and scaled to the screen,
// so the game plays the same on a phone and a monitor.
const W = 360;
const H = 480;
const COLS = 8;
const BRICK_H = 22;
const GAP = 5;
const TOP = 46;
const PADDLE_Y = 448;
const BALL_R = 10;
const BALLS = ["😀", "😂", "🤩", "😎", "🤪", "👽", "🤖", "👾", "🐶", "🦄", "🍕", "⚽", "🏀", "🎮", "🚀"];
const ROW_EMOJI = ["🍓", "🍊", "🍋", "🥝", "🫐", "🍇", "🍑"];
const FLOWERS = ["🌸", "🌹", "🌺", "🌻", "🌼", "🌷", "💐"];
const POWERS = [
  { id: "wide", emoji: "🍄", weight: 3 },
  { id: "fire", emoji: "🔥", weight: 2 },
  { id: "multi", emoji: "⭐", weight: 2 },
  { id: "slow", emoji: "🐌", weight: 2 },
  { id: "life", emoji: "❤️", weight: 1 },
];
const PATTERNS = [
  (r) => r < 4,
  (r, c) => r < 6 && Math.abs(c - 3.5) <= r * 0.75 + 0.5,
  (r, c) => r < 6 && (r + c) % 2 === 0,
  (r, c) => r < 7 && Math.abs(c - 3.5) + Math.abs(r - 3) <= 4,
  (r, c) => [0, 2, 4, 6].includes(r) || c === 0 || c === 7,
  (r, c) => r < 7 && (r === 0 || r === 6 || c === 0 || c === 7 || (r === 3 && c > 1 && c < 6)),
  (r, c) => r < 6 && [[1, 6], [2, 5], [0, 1, 2, 3, 4, 5, 6, 7], [0, 2, 3, 4, 5, 7], [0, 1, 2, 3, 4, 5, 6, 7], [1, 6]][r].includes(c),
  (r, c) => r < 7 && (c + r) % 3 !== 0,
  (r, c) => r < 7 && (r % 2 === 0 ? c % 2 === 0 : c % 2 === 1 || r === 3),
  (r, c) => r < 7 && !(r > 1 && r < 5 && c > 1 && c < 6),
];

const canvas = document.getElementById("board");
const wrap = document.getElementById("boardWrap");
const overlay = document.getElementById("overlay");
const codeInput = document.getElementById("codeInput");
const rivalEl = document.getElementById("rival");
const netBadge = document.getElementById("netBadge");
const hud = {
  score: document.getElementById("hudScore"),
  best: document.getElementById("hudBest"),
  level: document.getElementById("hudLevel"),
  lives: document.getElementById("hudLives"),
};

let ctx;
let scale = 1;
let theme = {};

let mode = "solo";
let room = null;
let random = Math.random;
let rival = null;
let lastSent = "";
let state = "menu";
let level = 1;
let score = 0;
let lives = 3;
let best = Number(load("emojiBounceHighScore", 0)) || 0;
let paddle;
let balls = [];
let bricks = [];
let drops = [];
let particles = [];
let effects = {};
let banner = null;
let keys = { left: false, right: false };
let last = performance.now();

initChrome();
theme = readTheme();
resize();
window.addEventListener("resize", resize);
onThemeChange(() => (theme = readTheme()));
prepareBackdrop();
updateHud();
requestAnimationFrame(loop);
chooseMode();

function resize() {
  const top = wrap.getBoundingClientRect().top + window.scrollY;
  const availH = window.innerHeight - top - 80;
  const width = Math.max(260, Math.min(wrap.parentElement.clientWidth - 32, 480, (availH * W) / H));
  wrap.style.width = `${width}px`;
  wrap.style.height = `${(width * H) / W}px`;
  scale = width / W;
  ctx = fitCanvas(canvas, width, (width * H) / W);
}

function newPaddle() {
  return { x: W / 2, w: 74, target: W / 2 };
}

function newBall(stuck = true) {
  return { x: paddle.x, y: PADDLE_Y - BALL_R - 7, vx: 0, vy: 0, stuck, emoji: pick(BALLS, random), spin: 0 };
}

function baseSpeed() {
  return Math.min(4.2 + level * 0.35, 8);
}

function buildBricks() {
  const pattern = PATTERNS[(level - 1) % PATTERNS.length];
  const w = (W - GAP * (COLS + 1)) / COLS;
  const toughRows = level >= 3 ? Math.min(1 + Math.floor(level / 3), 4) : 0;
  bricks = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!pattern(r, c)) continue;
      bricks.push({
        x: GAP + c * (w + GAP),
        y: TOP + r * (BRICK_H + GAP),
        w,
        h: BRICK_H,
        hp: r < toughRows ? 2 : 1,
        emoji: effects.bloom ? FLOWERS[(r + c) % FLOWERS.length] : ROW_EMOJI[r % ROW_EMOJI.length],
      });
    }
  }
}

function startGame(seed = randomSeed()) {
  random = seededRandom(seed);
  rival = mode === "solo" ? null : { score: 0, level: 1, lives: 3, done: false };
  lastSent = "";
  level = 1;
  score = 0;
  lives = 3;
  effects = {};
  startLevel();
  playClip("start", 0.4);
}

function startLevel() {
  paddle = newPaddle();
  balls = [newBall()];
  drops = [];
  buildBricks();
  banner = { text: t("breakout.levelN", { n: level }), until: performance.now() + 1400 };
  state = "play";
  hideOverlay(overlay);
  updateHud();
}

function launch() {
  for (const ball of balls) {
    if (!ball.stuck) continue;
    const angle = (random() - 0.5) * 0.8;
    const speed = baseSpeed();
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.cos(angle) * speed;
    ball.stuck = false;
  }
}

function speedFactor(now) {
  let f = 1;
  if (effects.slow > now) f *= 0.65;
  if (effects.turbo > now) f *= 1.6;
  return f;
}

function step(now, frames) {
  if (keys.left) paddle.target -= 7 * frames;
  if (keys.right) paddle.target += 7 * frames;
  const width = effects.wide > now ? 118 : 74;
  paddle.w += (width - paddle.w) * 0.2;
  paddle.target = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.target));
  paddle.x += (paddle.target - paddle.x) * Math.min(1, 0.45 * frames);

  const factor = speedFactor(now);
  const substeps = 4;
  for (const ball of balls) {
    if (ball.stuck) {
      ball.x = paddle.x;
      ball.y = PADDLE_Y - BALL_R - 7;
      continue;
    }
    ball.spin += 0.08 * frames;
    for (let i = 0; i < substeps; i++) moveBall(ball, (factor * frames) / substeps, now);
  }

  const lost = balls.filter((b) => b.y - BALL_R > H);
  balls = balls.filter((b) => b.y - BALL_R <= H);
  if (lost.length && !balls.length) loseLife();

  for (const drop of drops) {
    drop.y += 2.2 * frames;
    if (drop.y > PADDLE_Y - 8 && drop.y < PADDLE_Y + 14 && Math.abs(drop.x - paddle.x) < paddle.w / 2 + 10) {
      drop.taken = true;
      applyPower(drop.power, now);
    }
  }
  drops = drops.filter((d) => !d.taken && d.y < H + 20);

  for (const p of particles) {
    p.x += p.vx * frames;
    p.y += p.vy * frames;
    p.vy += 0.18 * frames;
    p.life -= frames;
  }
  particles = particles.filter((p) => p.life > 0);

  if (effects.bloom && Math.random() < 0.08 * frames) {
    particles.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 0.6, vy: 0.5, life: 260, emoji: FLOWERS[Math.floor(Math.random() * FLOWERS.length)], size: 18 });
  }

  if (!bricks.length && state === "play") {
    state = "between";
    level += 1;
    score += 50;
    playClip("levelUp", 0.5);
    setTimeout(startLevel, 900);
  }
}

function moveBall(ball, f, now) {
  ball.x += ball.vx * f;
  ball.y += ball.vy * f;

  if (ball.x < BALL_R) (ball.x = BALL_R), (ball.vx = Math.abs(ball.vx));
  if (ball.x > W - BALL_R) (ball.x = W - BALL_R), (ball.vx = -Math.abs(ball.vx));
  if (ball.y < BALL_R) (ball.y = BALL_R), (ball.vy = Math.abs(ball.vy));

  const halfW = paddle.w / 2;
  if (ball.vy > 0 && ball.y + BALL_R >= PADDLE_Y - 6 && ball.y + BALL_R <= PADDLE_Y + 10 && Math.abs(ball.x - paddle.x) <= halfW + BALL_R * 0.6) {
    // Where the ball lands on the paddle decides the angle, which is the
    // only real control the player has over the ball.
    const hit = Math.max(-1, Math.min(1, (ball.x - paddle.x) / halfW));
    const angle = hit * 1.05;
    const speed = Math.hypot(ball.vx, ball.vy);
    ball.vx = Math.sin(angle) * speed;
    ball.vy = -Math.abs(Math.cos(angle) * speed);
    ball.y = PADDLE_Y - 6 - BALL_R;
    sfx.hit();
  }

  const fire = effects.fire > now;
  for (let i = 0; i < bricks.length; i++) {
    const b = bricks[i];
    const nx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(ball.y, b.y + b.h));
    const dx = ball.x - nx;
    const dy = ball.y - ny;
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue;

    if (!fire) {
      const overlapX = BALL_R - Math.abs(dx);
      const overlapY = BALL_R - Math.abs(dy);
      if (dx !== 0 && (dy === 0 || overlapX < overlapY)) {
        ball.vx = Math.sign(dx) * Math.abs(ball.vx);
        ball.x += Math.sign(dx) * overlapX;
      } else {
        const dir = Math.sign(dy) || -Math.sign(ball.vy);
        ball.vy = dir * Math.abs(ball.vy);
        ball.y += dir * overlapY;
      }
    }
    b.hp -= fire ? b.hp : 1;
    if (b.hp <= 0) {
      breakBrick(i);
      i--;
    } else sfx.hit();
    if (!fire) break;
  }

  // A ball stuck bouncing flat between walls never comes back down.
  if (Math.abs(ball.vy) < 1.2) ball.vy = ball.vy < 0 ? -1.2 : 1.2;
}

function breakBrick(index) {
  const [b] = bricks.splice(index, 1);
  score += 10 + level;
  sfx.brick();
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  for (let k = 0; k < 7; k++) {
    particles.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 3.5, life: 40, color: k % 2 ? theme.game : theme.accent, size: 3 + Math.random() * 3 });
  }
  if (random() < 0.14) {
    const total = POWERS.reduce((sum, p) => sum + p.weight, 0);
    let roll = random() * total;
    const power = POWERS.find((p) => (roll -= p.weight) < 0);
    drops.push({ x: cx, y: cy, power });
  }
  updateHud();
}

function applyPower(power, now) {
  sfx.power();
  if (power.id === "life") lives = Math.min(lives + 1, 5);
  if (power.id === "wide") effects.wide = now + 10000;
  if (power.id === "fire") effects.fire = now + 7000;
  if (power.id === "slow") effects.slow = now + 8000;
  if (power.id === "multi") addBalls(2);
  toast(`${power.emoji} ${t(`breakout.power.${power.id}`)}`);
  updateHud();
}

function addBalls(count) {
  const source = balls.find((b) => !b.stuck) ?? balls[0];
  if (!source) return;
  const speed = Math.max(Math.hypot(source.vx, source.vy), baseSpeed());
  for (let i = 0; i < count; i++) {
    const angle = (random() - 0.5) * 1.6;
    balls.push({ ...newBall(false), x: source.x, y: source.y, vx: Math.sin(angle) * speed, vy: -Math.abs(Math.cos(angle) * speed) });
  }
}

function loseLife() {
  lives -= 1;
  sfx.crash();
  navigator.vibrate?.(80);
  if (lives <= 0) return gameOver();
  effects = { bloom: effects.bloom };
  balls = [newBall()];
  paddle.target = paddle.x;
  updateHud();
}

function gameOver() {
  state = "over";
  playClip("fail", 0.5);
  const record = score > best;
  if (record) {
    best = score;
    save("emojiBounceHighScore", best);
  }
  updateHud();
  if (rival) return showRaceResult();
  showOverlay(overlay, {
    emoji: record ? "🏆" : "💥",
    eyebrow: record ? t("breakout.newBest") : t("breakout.levelN", { n: level }),
    title: t("breakout.over"),
    text: t("breakout.overText", { score, best }),
    actions: [{ label: t("breakout.again"), primary: true, onClick: () => startGame() }, homeAction()],
  });
}

function prepareBackdrop() {
  paddle = newPaddle();
  balls = [newBall()];
  buildBricks();
}

async function chooseMode() {
  const choice = await openLobby({
    game: "breakout",
    localChoices: [{ id: "solo", ico: "🚀", title: t("breakout.solo"), hint: t("breakout.soloHint") }],
  });
  mode = choice.mode;
  room = choice.room ?? null;
  if (room) {
    bindRoom(room, {
      badge: netBadge,
      overlay,
      onMessage,
      onClose: () => {
        rival = null;
        rivalEl.hidden = true;
        if (state === "play") state = "paused";
      },
      fallback: { label: t("breakout.playSolo"), onClick: playSolo },
    });
  }
  if (mode === "host") startRace();
  else if (mode === "guest") waitForHost();
  else startGame();
}

function playSolo() {
  room = null;
  mode = "solo";
  startGame();
}

function startRace() {
  const seed = randomSeed();
  room.send({ t: "start", seed });
  startGame(seed);
}

function waitForHost() {
  showOverlay(overlay, { emoji: "⏳", title: t("breakout.waitHost"), actions: [homeAction(room)] });
}

function onMessage(message) {
  if (message.t === "start" && mode === "guest" && isInt(message.seed, 0, 2 ** 32 - 1)) {
    startGame(message.seed);
  } else if (message.t === "again" && mode === "host" && state === "over" && rival?.done) {
    startRace();
  } else if (message.t === "stat" && rival) {
    const { score: theirs, level: theirLevel, lives: theirLives, done } = message;
    if (!isNum(theirs, 0, 1e9) || !isInt(theirLevel, 1, 1e5) || !isInt(theirLives, 0, 9) || typeof done !== "boolean") return;
    Object.assign(rival, { score: theirs, level: theirLevel, lives: theirLives, done });
    paintRival();
    if (state === "over") showRaceResult();
  }
}

// Scores go out only when they change, so a race costs a few messages a
// second at most.
function sendStatus() {
  if (!rival || !room) return;
  const status = { t: "stat", score, level, lives: Math.max(lives, 0), done: state === "over" };
  const key = JSON.stringify(status);
  if (key === lastSent) return;
  lastSent = key;
  room.send(status);
}

function paintRival() {
  if (rivalEl.hidden === Boolean(rival)) {
    rivalEl.hidden = !rival;
    resize();
  }
  if (!rival) return;
  const hearts = rival.done ? "💥" : "❤️".repeat(rival.lives);
  rivalEl.textContent = `${t("breakout.rival")} · ${rival.score} · ${t("breakout.levelN", { n: rival.level })} · ${hearts}`;
}

function showRaceResult() {
  if (!rival.done) {
    return showOverlay(overlay, {
      emoji: "⏳",
      title: t("breakout.waitRival"),
      text: t("breakout.waitRivalText", { mine: score, theirs: rival.score }),
      actions: [homeAction(room)],
    });
  }
  const outcome = score > rival.score ? "win" : score < rival.score ? "lose" : "draw";
  if (outcome === "win") playClip("levelUp", 0.5);
  const again =
    mode === "host"
      ? { label: t("breakout.again"), primary: true, onClick: startRace }
      : { label: t("breakout.again"), primary: true, onClick: askRematch };
  showOverlay(overlay, {
    emoji: { win: "🏆", lose: "🥈", draw: "🤝" }[outcome],
    title: t(`breakout.race.${outcome}`),
    text: t("breakout.raceScore", { mine: score, theirs: rival.score }),
    actions: [again, homeAction(room)],
  });
}

function askRematch() {
  room.send({ t: "again" });
  waitForHost();
}

function draw(now) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, W, H);

  for (const b of bricks) {
    ctx.fillStyle = b.hp > 1 ? (theme.dark ? "#3a3d4a" : "#d9d3c4") : theme.dark ? "#262833" : "#f1ece1";
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 7);
    ctx.fill();
    if (b.hp > 1) {
      ctx.strokeStyle = theme.game;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    drawEmoji(ctx, b.emoji, b.x + b.w / 2, b.y + b.h / 2, 20);
  }

  for (const d of drops) drawEmoji(ctx, d.power.emoji, d.x, d.y, 24, Math.sin(now / 150) * 0.3);

  for (const p of particles) {
    if (p.emoji) drawEmoji(ctx, p.emoji, p.x, p.y, p.size, p.life / 30);
    else {
      ctx.globalAlpha = Math.max(0, p.life / 40);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }
  }

  const fire = effects.fire > now;
  ctx.fillStyle = fire ? "#ff5a3c" : theme.game;
  ctx.beginPath();
  ctx.roundRect(paddle.x - paddle.w / 2, PADDLE_Y - 6, paddle.w, 12, 6);
  ctx.fill();

  for (const ball of balls) {
    if (fire) drawEmoji(ctx, "🔥", ball.x - ball.vx * 2, ball.y - ball.vy * 2, BALL_R * 2.2);
    drawEmoji(ctx, ball.emoji, ball.x, ball.y, BALL_R * 2.4, ball.spin);
  }

  if (balls.some((b) => b.stuck) && state === "play") {
    ctx.fillStyle = theme.muted;
    ctx.font = `600 15px ${theme.font}`;
    ctx.textAlign = "center";
    ctx.fillText(t("breakout.tapLaunch"), W / 2, PADDLE_Y - 40);
  }

  if (banner && banner.until > now) {
    ctx.globalAlpha = Math.min(1, (banner.until - now) / 300);
    ctx.fillStyle = theme.text;
    ctx.font = `800 34px ${theme.font}`;
    ctx.textAlign = "center";
    ctx.fillText(banner.text, W / 2, H / 2 + 20);
    ctx.globalAlpha = 1;
  }

  const active = [
    effects.turbo > now && "⚡",
    effects.wide > now && "🍄",
    effects.fire > now && "🔥",
    effects.slow > now && "🐌",
    effects.bloom && "🌸",
  ].filter(Boolean);
  active.forEach((emoji, i) => drawEmoji(ctx, emoji, 18 + i * 26, 22, 20));
  ctx.restore();
}

function loop(now) {
  const frames = Math.min((now - last) / (1000 / 60), 3);
  last = now;
  if (state === "play" || state === "between") step(now, frames);
  draw(now);
  requestAnimationFrame(loop);
}

function updateHud() {
  sendStatus();
  paintRival();
  hud.score.textContent = score;
  hud.best.textContent = best;
  hud.level.textContent = level;
  hud.lives.textContent = lives > 0 ? "❤️".repeat(Math.min(lives, 5)) : "0";
}

function toWorldX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * W;
}

canvas.addEventListener("pointerdown", (e) => {
  if (state !== "play") return;
  canvas.setPointerCapture(e.pointerId);
  paddle.target = toWorldX(e.clientX);
  launch();
});
canvas.addEventListener("pointermove", (e) => {
  if (state === "play" && (e.pointerType === "mouse" || e.buttons)) paddle.target = toWorldX(e.clientX);
});

window.addEventListener("keydown", (e) => {
  if (e.target === codeInput) return;
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = true;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = true;
  if ((e.key === " " || e.key === "ArrowUp") && state === "play") {
    e.preventDefault();
    launch();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowLeft" || e.key === "a") keys.left = false;
  if (e.key === "ArrowRight" || e.key === "d") keys.right = false;
});

const CODES = {
  turbo() {
    effects.turbo = performance.now() + 10000;
    playClip("turbo", 0.5);
  },
  bloom() {
    effects.bloom = true;
    bricks.forEach((b, i) => (b.emoji = FLOWERS[i % FLOWERS.length]));
    playClip("bloom", 0.5);
  },
  party() {
    addBalls(4);
    sfx.power();
  },
};

document.getElementById("codeBtn").addEventListener("click", () => {
  const row = document.getElementById("codeRow");
  row.hidden = !row.hidden;
  if (!row.hidden) codeInput.focus();
});
codeInput.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const code = codeInput.value.trim().toLowerCase();
  codeInput.value = "";
  if (rival) toast(t("breakout.codesOffRace"));
  else if (CODES[code] && state === "play") {
    CODES[code]();
    toast(t("breakout.codeOn"));
    codeInput.blur();
    document.getElementById("codeRow").hidden = true;
  } else toast(t(state === "play" ? "breakout.codeBad" : "breakout.codePlayFirst"));
});
