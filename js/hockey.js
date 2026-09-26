import { drawEmoji } from "./emoji.js";
import { onLangChange, t } from "./i18n.js";
import { openLobby } from "./lobby.js";
import { bindRoom, homeAction, isInt, isNum, oneOf } from "./online.js";
import { playClip, sfx } from "./sfx.js";
import { fitCanvas, hideOverlay, initChrome, onThemeChange, readTheme, showOverlay } from "./ui.js";

// Player 1 defends the bottom goal, player 2 the top one. Every phone draws
// its own player at the bottom, so the guest's view is the table turned
// around, and its touches are turned back before they are sent.
const W = 360;
const H = 600;
const GOAL_W = 124;
const PUCK_R = 17;
const MALLET_R = 27;
const MAX_PUCK = 17;
const MALLET_STEP = 24;
const BOT_STEP = 6.5;
const WIN_SCORE = 7;
const GOAL_PAUSE = 70;
const SEND_EVERY = 2;
const TICK = 1000 / 60;
const COLORS = { 1: "#ff5a5f", 2: "#ffc83d" };

const canvas = document.getElementById("board");
const wrap = document.getElementById("boardWrap");
const overlay = document.getElementById("overlay");
const netBadge = document.getElementById("netBadge");
const chips = { 1: document.getElementById("p1"), 2: document.getElementById("p2") };

let ctx;
let scale = 1;
let theme = readTheme();
let mode = "bot";
let room = null;
let me = 1;
let world = null;
let prevWorld = null;
let snapAt = 0;
let frame = 0;
let last = performance.now();
let acc = 0;
const touches = new Map();

initChrome();
resize();
window.addEventListener("resize", resize);
onThemeChange(() => (theme = readTheme()));
onLangChange(paintPlayers);
world = newWorld();
requestAnimationFrame(loop);
chooseMode();

function newWorld() {
  return {
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0, spin: 0 },
    mallets: {
      1: { x: W / 2, y: H - 70, tx: W / 2, ty: H - 70, vx: 0, vy: 0 },
      2: { x: W / 2, y: 70, tx: W / 2, ty: 70, vx: 0, vy: 0 },
    },
    score: { 1: 0, 2: 0 },
    phase: "play",
    pause: 0,
    lastGoal: 0,
    events: [],
  };
}

async function chooseMode() {
  const choice = await openLobby({
    game: "hockey",
    localChoices: [
      { id: "bot", ico: "🤖", title: t("hockey.bot"), hint: t("hockey.botHint") },
      { id: "local", ico: "👥", title: t("hockey.local"), hint: t("hockey.localHint") },
    ],
  });
  mode = choice.mode;
  room = choice.room ?? null;
  me = mode === "guest" ? 2 : 1;
  if (room) {
    bindRoom(room, {
      badge: netBadge,
      overlay,
      onMessage,
      onClose: () => (world.phase = "over"),
      fallback: { label: t("hockey.playBot"), onClick: playBot },
    });
  }
  paintPlayers();
  if (mode === "guest") showOverlay(overlay, { emoji: "⏳", title: t("hockey.waitHost"), actions: [homeAction(room)] });
  else startMatch();
}

function playBot() {
  room = null;
  mode = "bot";
  me = 1;
  paintPlayers();
  startMatch();
}

function startMatch() {
  world = newWorld();
  serve(world, 2);
  hideOverlay(overlay);
  playClip("start", 0.4);
  paintPlayers();
}

function serve(w, toward) {
  Object.assign(w.puck, { x: W / 2, y: toward === 1 ? H * 0.62 : H * 0.38, vx: 0, vy: 0 });
}

function loop(now) {
  const dt = Math.min(now - last, 100);
  last = now;
  if (mode !== "guest" && world.phase !== "over") {
    acc += dt;
    while (acc >= TICK && world.phase !== "over") {
      acc -= TICK;
      step(world);
      frame += 1;
      react(world.events);
      if (mode === "host" && (frame % SEND_EVERY === 0 || world.phase === "over")) room.send(snapshot(world));
    }
    if (world.phase === "over") finish();
  }
  draw(now);
  requestAnimationFrame(loop);
}

function step(w) {
  w.events = [];
  if (w.phase === "goal") {
    if (--w.pause <= 0) {
      w.phase = "play";
      serve(w, w.lastGoal === 1 ? 2 : 1);
    }
  }
  if (mode === "bot") steerBot(w);

  for (const id of [1, 2]) {
    const m = w.mallets[id];
    const top = id === 2;
    const tx = clamp(m.tx, MALLET_R, W - MALLET_R);
    const ty = clamp(m.ty, top ? MALLET_R : H / 2 + MALLET_R, top ? H / 2 - MALLET_R : H - MALLET_R);
    const limit = mode === "bot" && id === 2 ? BOT_STEP : MALLET_STEP;
    const dx = tx - m.x;
    const dy = ty - m.y;
    const dist = Math.hypot(dx, dy);
    const k = dist > limit ? limit / dist : 1;
    m.vx = dx * k;
    m.vy = dy * k;
  }

  if (w.phase !== "play") {
    for (const id of [1, 2]) {
      w.mallets[id].x += w.mallets[id].vx;
      w.mallets[id].y += w.mallets[id].vy;
    }
    return;
  }

  // Substeps keep a fast puck from tunnelling through a fast mallet.
  const sub = 4;
  const p = w.puck;
  for (let i = 0; i < sub; i++) {
    for (const id of [1, 2]) {
      const m = w.mallets[id];
      m.x += m.vx / sub;
      m.y += m.vy / sub;
      collide(w, m);
    }
    p.x += p.vx / sub;
    p.y += p.vy / sub;
    bounceWalls(w);
    if (w.phase !== "play") break;
  }
  p.vx *= 0.993;
  p.vy *= 0.993;
  p.spin += p.vx * 0.02;
}

function collide(w, m) {
  const p = w.puck;
  const dx = p.x - m.x;
  const dy = p.y - m.y;
  const dist = Math.hypot(dx, dy);
  const minDist = PUCK_R + MALLET_R;
  if (dist >= minDist || dist === 0) return;
  const nx = dx / dist;
  const ny = dy / dist;
  p.x = m.x + nx * minDist;
  p.y = m.y + ny * minDist;
  const rvx = p.vx - m.vx;
  const rvy = p.vy - m.vy;
  const along = rvx * nx + rvy * ny;
  if (along < 0) {
    p.vx -= 1.9 * along * nx;
    p.vy -= 1.9 * along * ny;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > MAX_PUCK) {
      p.vx *= MAX_PUCK / speed;
      p.vy *= MAX_PUCK / speed;
    }
    w.events.push("hit");
  }
}

function bounceWalls(w) {
  const p = w.puck;
  if (p.x < PUCK_R) (p.x = PUCK_R), (p.vx = Math.abs(p.vx) * 0.9), w.events.push("wall");
  if (p.x > W - PUCK_R) (p.x = W - PUCK_R), (p.vx = -Math.abs(p.vx) * 0.9), w.events.push("wall");
  const inMouth = Math.abs(p.x - W / 2) < GOAL_W / 2 - PUCK_R * 0.4;
  if (!inMouth) {
    if (p.y < PUCK_R) (p.y = PUCK_R), (p.vy = Math.abs(p.vy) * 0.9), w.events.push("wall");
    if (p.y > H - PUCK_R) (p.y = H - PUCK_R), (p.vy = -Math.abs(p.vy) * 0.9), w.events.push("wall");
    return;
  }
  const scorer = p.y < -PUCK_R ? 1 : p.y > H + PUCK_R ? 2 : 0;
  if (!scorer) return;
  w.score[scorer] += 1;
  w.lastGoal = scorer;
  w.events.push("goal");
  if (w.score[scorer] >= WIN_SCORE) {
    w.phase = "over";
    w.events.push("over");
  } else {
    w.phase = "goal";
    w.pause = GOAL_PAUSE;
  }
}

function steerBot(w) {
  const p = w.puck;
  const bot = w.mallets[2];
  if (p.y < H / 2 + 20 && w.phase === "play") {
    // Aim from above the puck so the hit sends it down the table.
    bot.tx = p.x + (p.x - W / 2) * 0.15;
    bot.ty = p.y - PUCK_R;
  } else {
    bot.tx = W / 2 + (p.x - W / 2) * 0.45;
    bot.ty = 64;
  }
}

function snapshot(w) {
  const r = (n) => Math.round(n * 10) / 10;
  const { puck: p, mallets: m } = w;
  return {
    t: "h",
    p: [r(p.x), r(p.y), r(p.vx), r(p.vy)],
    a: [r(m[1].x), r(m[1].y)],
    b: [r(m[2].x), r(m[2].y)],
    s: [w.score[1], w.score[2]],
    ph: w.phase,
    ev: w.events,
  };
}

function applySnapshot(s) {
  prevWorld = world;
  world = {
    puck: { x: s.p[0], y: s.p[1], vx: s.p[2], vy: s.p[3], spin: (prevWorld?.puck.spin ?? 0) + s.p[2] * 0.04 },
    mallets: { 1: { x: s.a[0], y: s.a[1] }, 2: { x: s.b[0], y: s.b[1] } },
    score: { 1: s.s[0], 2: s.s[1] },
    phase: s.ph,
    events: s.ev,
  };
  snapAt = performance.now();
  react(world.events);
  if (world.phase === "over" && prevWorld?.phase !== "over") finish();
  else if (world.phase !== "over" && !overlay.hidden) hideOverlay(overlay);
}

function isSnapshot(s) {
  const inX = (n) => isNum(n, -100, W + 100);
  const inY = (n) => isNum(n, -100, H + 100);
  const v = (n) => isNum(n, -50, 50);
  return (
    Array.isArray(s.p) && inX(s.p[0]) && inY(s.p[1]) && v(s.p[2]) && v(s.p[3]) &&
    Array.isArray(s.a) && inX(s.a[0]) && inY(s.a[1]) &&
    Array.isArray(s.b) && inX(s.b[0]) && inY(s.b[1]) &&
    Array.isArray(s.s) && isInt(s.s[0], 0, WIN_SCORE) && isInt(s.s[1], 0, WIN_SCORE) &&
    oneOf(s.ph, ["play", "goal", "over"]) && Array.isArray(s.ev)
  );
}

function onMessage(message) {
  if (mode === "host" && message.t === "m" && isNum(message.x, 0, W) && isNum(message.y, 0, H)) {
    world.mallets[2].tx = message.x;
    world.mallets[2].ty = message.y;
  } else if (mode === "guest" && message.t === "h" && isSnapshot(message)) {
    applySnapshot(message);
    paintPlayers();
  } else if (mode === "host" && message.t === "again" && world.phase === "over") {
    startMatch();
  }
}

function react(events) {
  for (const event of events) {
    if (event === "hit") sfx.hit();
    else if (event === "wall") sfx.drop();
    else if (event === "goal") {
      sfx.gold();
      navigator.vibrate?.(40);
      paintPlayers();
    }
  }
}

function finish() {
  paintPlayers();
  const winner = world.score[1] > world.score[2] ? 1 : 2;
  const iWon = mode === "local" || winner === me;
  playClip(iWon ? "levelUp" : "fail", 0.5);
  let title;
  if (mode === "local") title = t("hockey.wins", { color: t(`hockey.color${winner}`) });
  else if (winner === me) title = t("hockey.youWin");
  else title = t(mode === "bot" ? "hockey.botWins" : "hockey.friendWins");
  const mine = world.score[me];
  const theirs = world.score[3 - me];
  showOverlay(overlay, {
    emoji: iWon ? "🏆" : "🥅",
    title,
    text: t("hockey.final", { a: mode === "local" ? world.score[1] : mine, b: mode === "local" ? world.score[2] : theirs }),
    actions: [{ label: t("hockey.again"), primary: true, onClick: rematch }, homeAction(room)],
  });
}

function rematch() {
  if (mode !== "guest") return startMatch();
  room.send({ t: "again" });
  showOverlay(overlay, { emoji: "⏳", title: t("hockey.waitHost"), actions: [homeAction(room)] });
}

function paintPlayers() {
  const names = {
    bot: [t("you"), t("hockey.botName")],
    local: [t("hockey.color1"), t("hockey.color2")],
    host: [t("you"), t("hockey.friend")],
    guest: [t("hockey.friend"), t("you")],
  }[mode];
  for (const p of [1, 2]) {
    chips[p].querySelector(".name").textContent = names[p - 1];
    chips[p].querySelector(".score").textContent = world?.score[p] ?? 0;
  }
}

function resize() {
  const top = wrap.getBoundingClientRect().top + window.scrollY;
  const availH = window.innerHeight - top - 20;
  const width = Math.max(240, Math.min(wrap.parentElement.clientWidth - 32, 460, (availH * W) / H));
  wrap.style.width = `${width}px`;
  wrap.style.height = `${(width * H) / W}px`;
  scale = width / W;
  ctx = fitCanvas(canvas, width, (width * H) / W);
}

function draw(now) {
  const flip = me === 2;
  ctx.save();
  ctx.scale(scale, scale);
  if (flip) {
    ctx.translate(W, H);
    ctx.rotate(Math.PI);
  }
  drawTable();

  let { x, y } = world.puck;
  if (mode === "guest" && world.phase === "play") {
    // Between snapshots the puck keeps gliding on its last velocity.
    const frames = Math.min((now - snapAt) / TICK, SEND_EVERY * 3);
    x += world.puck.vx * frames;
    y += world.puck.vy * frames;
  }
  for (const id of [1, 2]) drawMallet(world.mallets[id], COLORS[id]);
  ctx.fillStyle = theme.dark ? "#0d0e12" : "#17161a";
  ctx.beginPath();
  ctx.arc(x, y, PUCK_R, 0, Math.PI * 2);
  ctx.fill();
  drawEmoji(ctx, "😎", x, y, PUCK_R * 1.7, world.puck.spin + (flip ? Math.PI : 0));
  ctx.restore();

  if (world.phase === "goal") {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = theme.text;
    ctx.font = `800 54px ${theme.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(t("hockey.goal"), W / 2, H / 2);
    ctx.restore();
  }
}

function drawTable() {
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = theme.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 54, 0, Math.PI * 2);
  ctx.stroke();
  for (const [y, id] of [[0, 2], [H, 1]]) {
    ctx.fillStyle = COLORS[id];
    ctx.beginPath();
    ctx.roundRect(W / 2 - GOAL_W / 2, y - 6, GOAL_W, 12, 6);
    ctx.fill();
    ctx.strokeStyle = COLORS[id];
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.arc(W / 2, y, GOAL_W / 2 + 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawMallet(m, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(m.x, m.y, MALLET_R * 0.38, 0, Math.PI * 2);
  ctx.fill();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toWorld(e) {
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  return me === 2 ? { x: W - x, y: H - y } : { x, y };
}

// Touches are assigned to a player by the half they start in, so two
// people can share one phone laid flat between them.
function playerFor(point) {
  if (mode === "local") return point.y > H / 2 ? 1 : 2;
  return me;
}

let lastSent = 0;
function moveTo(player, point) {
  if (mode === "guest") {
    const now = performance.now();
    if (now - lastSent < 30) return;
    lastSent = now;
    room?.send({ t: "m", x: clamp(point.x, 0, W), y: clamp(point.y, 0, H) });
    return;
  }
  if (mode === "bot" && player === 2) return;
  world.mallets[player].tx = point.x;
  world.mallets[player].ty = point.y;
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  const point = toWorld(e);
  const player = playerFor(point);
  touches.set(e.pointerId, player);
  moveTo(player, point);
});
canvas.addEventListener("pointermove", (e) => {
  const player = touches.get(e.pointerId) ?? (e.pointerType === "mouse" ? me : null);
  if (player) moveTo(player, toWorld(e));
});
for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, (e) => touches.delete(e.pointerId));
