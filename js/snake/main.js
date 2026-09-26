import { createGame } from "./engine.js";
import { COLS, LEVELS, ROWS } from "./levels.js";
import { SNAKE_COLORS, createRenderer } from "./render.js";
import { onLangChange, t } from "../i18n.js";
import { openLobby } from "../lobby.js";
import { playClip, sfx } from "../sfx.js";
import { load, save } from "../storage.js";
import { el, hideOverlay, initChrome, isTouch, showOverlay, toast } from "../ui.js";

const KEYS = {
  ArrowUp: "U", ArrowDown: "D", ArrowLeft: "L", ArrowRight: "R",
  w: "U", s: "D", a: "L", d: "R", W: "U", S: "D", A: "L", D: "R",
};

const canvas = document.getElementById("board");
const wrap = document.getElementById("boardWrap");
const overlay = document.getElementById("overlay");
const dpad = document.getElementById("dpad");
const netBadge = document.getElementById("netBadge");
const hud = {
  level: document.getElementById("hudLevel"),
  goal: document.getElementById("hudGoal"),
  lives: document.getElementById("hudLives"),
  score: document.getElementById("hudScore"),
  time: document.getElementById("hudTime"),
  timeBox: document.getElementById("hudTimeBox"),
};

const renderer = createRenderer(canvas);

let role = "solo";
let room = null;
let game = null;
let running = false;
let me = 0;
let snap = null;
let prevSnap = null;
let snapAt = 0;
let acc = 0;
let lastFrame = performance.now();
let lastHud = "";

initChrome();
onLangChange(() => {
  lastHud = "";
  if (!overlay.hidden && overlay.dataset.screen === "levels") showLevelPicker();
});
document.documentElement.style.setProperty("--you", SNAKE_COLORS[0]);
if (isTouch()) dpad.hidden = false;
layout();
window.addEventListener("resize", layout);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderer.readTheme());
requestAnimationFrame(frame);
chooseMode();

async function chooseMode() {
  const choice = await openLobby({
    game: "snake",
    localChoices: [{ id: "solo", ico: "🐍", title: t("snake.solo"), hint: t("snake.soloHint") }],
  });
  role = choice.mode;
  room = choice.room ?? null;
  me = role === "guest" ? 1 : 0;
  document.documentElement.style.setProperty("--you", SNAKE_COLORS[me]);

  document.getElementById("pauseBtn").hidden = role !== "solo";
  if (room) {
    netBadge.hidden = false;
    netBadge.textContent = `${t("net.online")} · ${room.code}`;
    room.on("message", onMessage).on("close", onDisconnect);
  }
  if (role === "guest") {
    showOverlay(overlay, { emoji: "⏳", title: t("snake.waitHost"), text: t("snake.waitHostText"), actions: [homeAction()] });
  } else showLevelPicker();
}

function unlocked() {
  return load("snake.unlocked", 0);
}

function showLevelPicker() {
  const card = el("div", "card level-card");
  card.append(el("div", "eyebrow", role === "host" ? t("snake.coopEyebrow") : t("snake.soloEyebrow")));
  card.append(el("h2", "", t("snake.pickLevel")));
  const grid = el("div", "level-grid");
  const max = unlocked();
  LEVELS.forEach((level, i) => {
    const btn = el("button", "level-btn");
    const locked = i > max;
    btn.disabled = locked;
    btn.append(el("span", "lv-emoji", locked ? "🔒" : level.emoji), el("span", "lv-num", String(i + 1)));
    btn.setAttribute("aria-label", `${t("snake.level")} ${i + 1}: ${t(`snake.l${i + 1}.name`)}`);
    btn.addEventListener("click", () => startGame(i));
    grid.append(btn);
  });
  card.append(grid);
  const start = el("button", "btn btn-primary btn-block", t("snake.continueFrom", { n: Math.min(max, LEVELS.length - 1) + 1 }));
  start.addEventListener("click", () => startGame(Math.min(max, LEVELS.length - 1)));
  card.append(start);
  overlay.innerHTML = "";
  overlay.append(card);
  overlay.dataset.screen = "levels";
  overlay.hidden = false;
  start.focus({ preventScroll: true });
}

function startGame(levelIndex) {
  hideOverlay(overlay);
  overlay.dataset.screen = "";
  if (game && role !== "guest") game.restart(levelIndex);
  else game = createGame(role === "host" ? 2 : 1, levelIndex);
  snap = prevSnap = null;
  acc = 0;
  running = true;
  playClip("start", 0.4);
  publish();
}

function frame(now) {
  const dt = Math.min(now - lastFrame, 250);
  lastFrame = now;
  if (game && running) {
    acc += dt;
    while (acc >= game.speed) {
      acc -= game.speed;
      game.step();
      publish();
    }
  }
  if (snap) {
    const alpha = Math.min(1, (now - snapAt) / LEVELS[snap.lv].speed);
    renderer.draw(snap, prevSnap, alpha, { me, banner: bannerFor(snap) });
  }
  requestAnimationFrame(frame);
}

function publish() {
  const next = game.snapshot();
  receive(next);
  if (role === "host") room.send({ t: "s", s: next });
}

function receive(next) {
  prevSnap = snap;
  snap = next;
  snapAt = performance.now();
  for (const event of next.ev) react(event, next);
  updateHud(next);
  if (prevSnap?.ph !== next.ph) onPhase(next);
}

function react(event, s) {
  switch (event) {
    case "eat": return sfx.eat();
    case "gold": return sfx.gold();
    case "heart": return sfx.power();
    case "portal": return sfx.flip();
    case "gate": return sfx.power(), toast(t("snake.gateOpen"));
    case "cut": return sfx.hit();
    case "shroom": return sfx.hit(), toast(t("snake.confused"));
    case "crash": return sfx.crash(), navigator.vibrate?.(70);
    case "revive": return sfx.revive();
    case "rescue": return toast(t("snake.rescued"));
    case "shrink": return sfx.crash();
    case "timeup": return toast(t("snake.timeUp"));
    case "clear":
      save("snake.unlocked", Math.max(unlocked(), Math.min(s.lv + 1, LEVELS.length - 1)));
      return playClip("levelUp", 0.5);
    case "over": return playClip("fail", 0.5);
    case "won":
      save("snake.unlocked", LEVELS.length - 1);
      return playClip("levelUp", 0.6);
  }
}

function onPhase(s) {
  if (s.ph === "over") {
    const text = t("snake.overText", { n: s.lv + 1, score: s.sc });
    if (role === "guest") {
      showOverlay(overlay, { emoji: "💥", title: t("snake.over"), text: `${text} ${t("snake.hostDecides")}`, actions: [homeAction()] });
    } else {
      showOverlay(overlay, {
        emoji: "💥",
        title: t("snake.over"),
        text,
        actions: [
          { label: t("snake.retry"), primary: true, onClick: () => startGame(s.lv) },
          { label: t("snake.pickLevel"), onClick: showLevelPicker },
          homeAction(),
        ],
      });
    }
  } else if (s.ph === "won") {
    showOverlay(overlay, {
      emoji: "🏆",
      title: t("snake.won"),
      text: t(role === "solo" ? "snake.wonSolo" : "snake.wonCoop", { score: s.sc }),
      actions: role === "guest" ? [homeAction()] : [{ label: t("snake.pickLevel"), primary: true, onClick: showLevelPicker }, homeAction()],
    });
  } else if (!overlay.hidden && overlay.dataset.screen !== "levels" && overlay.dataset.screen !== "pause") {
    hideOverlay(overlay);
  }
}

function bannerFor(s) {
  const n = s.lv + 1;
  if (s.ph === "intro") {
    return {
      emoji: LEVELS[s.lv].emoji,
      title: `${n}. ${t(`snake.l${n}.name`)}`,
      sub: `${t(`snake.l${n}.hint`)} ${t("snake.goalLine", { goal: LEVELS[s.lv].goal })}`,
    };
  }
  if (s.ph === "clear") {
    return { emoji: "✨", title: t("snake.clear"), sub: n < LEVELS.length ? t("snake.nextUp", { n: n + 1 }) : "" };
  }
  return null;
}

function updateHud(s) {
  const level = LEVELS[s.lv];
  const key = [s.lv, s.e, s.li, s.sc, Math.ceil(s.tm / 1000)].join("|");
  if (key === lastHud) return;
  lastHud = key;
  hud.level.textContent = `${s.lv + 1}/${LEVELS.length}`;
  hud.goal.textContent = `${Math.min(s.e, level.goal)}/${level.goal}`;
  hud.lives.textContent = `❤️ ${s.li}`;
  hud.score.textContent = s.sc;
  hud.timeBox.hidden = !level.time;
  if (level.time) hud.time.textContent = Math.max(0, Math.ceil(s.tm / 1000));
}

function steer(dir) {
  if (role === "guest") room?.send({ t: "in", d: dir });
  else if (game && running) game.input(0, dir);
}

function onMessage(message) {
  if (role === "host" && message.t === "in") game?.input(1, message.d);
  if (role === "guest" && message.t === "s") receive(message.s);
}

function onDisconnect() {
  running = false;
  netBadge.hidden = true;
  const level = snap?.lv ?? 0;
  const continueSolo = () => {
    role = "solo";
    room = null;
    me = 0;
    document.documentElement.style.setProperty("--you", SNAKE_COLORS[0]);
    document.getElementById("pauseBtn").hidden = false;
    game = createGame(1, level);
    snap = prevSnap = null;
    hideOverlay(overlay);
    running = true;
    publish();
  };
  showOverlay(overlay, {
    emoji: "🔌",
    title: t("net.lost"),
    text: t("net.lostText"),
    actions: [{ label: t("snake.keepSolo"), primary: true, onClick: continueSolo }, homeAction()],
  });
}

function homeAction() {
  return {
    label: t("home"),
    onClick: () => {
      room?.leave();
      location.href = "./";
    },
  };
}

function pause() {
  if (role !== "solo" || !running || snap?.ph !== "play") return;
  running = false;
  showOverlay(overlay, {
    emoji: "⏸️",
    title: t("paused"),
    actions: [
      { label: t("resume"), primary: true, onClick: resume },
      { label: t("snake.pickLevel"), onClick: showLevelPicker },
      homeAction(),
    ],
  });
  overlay.dataset.screen = "pause";
}

function resume() {
  hideOverlay(overlay);
  overlay.dataset.screen = "";
  lastFrame = performance.now();
  running = true;
}

function layout() {
  const top = wrap.getBoundingClientRect().top + window.scrollY;
  const reserve = dpad.hidden ? 24 : dpad.offsetHeight + 36;
  const availH = window.innerHeight - top - reserve;
  const availW = wrap.parentElement.clientWidth - 32;
  const cell = Math.max(14, Math.floor(Math.min(Math.min(availW, 560) / COLS, availH / ROWS)));
  wrap.style.width = `${COLS * cell}px`;
  wrap.style.height = `${ROWS * cell}px`;
  renderer.resize(cell);
}

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (KEYS[e.key]) {
    e.preventDefault();
    steer(KEYS[e.key]);
  } else if (e.key === "p" || e.key === "Escape") {
    if (overlay.dataset.screen === "pause") resume();
    else pause();
  }
});

let swipe = null;
wrap.addEventListener("pointerdown", (e) => {
  swipe = { x: e.clientX, y: e.clientY };
});
wrap.addEventListener("pointermove", (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : dy > 0 ? "D" : "U");
  swipe = { x: e.clientX, y: e.clientY };
});
for (const type of ["pointerup", "pointercancel", "pointerleave"]) wrap.addEventListener(type, () => (swipe = null));

for (const btn of dpad.querySelectorAll("[data-dir]")) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    steer(btn.dataset.dir);
    navigator.vibrate?.(8);
  });
}

document.getElementById("pauseBtn").addEventListener("click", pause);
document.addEventListener("visibilitychange", () => document.hidden && pause());
