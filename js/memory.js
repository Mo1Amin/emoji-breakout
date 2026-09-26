import { onLangChange, t } from "./i18n.js";
import { openLobby } from "./lobby.js";
import { bindRoom, homeAction, isInt, oneOf } from "./online.js";
import { shuffle } from "./random.js";
import { playClip, sfx } from "./sfx.js";
import { load, save } from "./storage.js";
import { el, hideOverlay, initChrome, showOverlay } from "./ui.js";

const LEVELS = [
  { pairs: 3, cols: 3, theme: ["🐶", "🐱", "🐰", "🦊", "🐼", "🐨"] },
  { pairs: 4, cols: 4, theme: ["🍎", "🍌", "🍇", "🍉", "🍓", "🍍", "🥝", "🍑"] },
  { pairs: 6, cols: 4, theme: ["😀", "😂", "😍", "😎", "🤩", "😴", "🤯", "🥳", "😇", "🤠"] },
  { pairs: 8, cols: 4, theme: ["🚀", "🪐", "🌙", "⭐", "☄️", "🛸", "👽", "🌍", "🔭", "🌞"] },
  { pairs: 10, cols: 4, theme: ["⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🏓", "🥊", "⛳", "🎳", "🏒", "🥏"] },
  { pairs: 12, cols: 4, theme: ["🍕", "🍔", "🌮", "🍣", "🍩", "🍪", "🧁", "🍦", "🥐", "🌭", "🍿", "🥨", "🍜", "🥞"] },
  { pairs: 15, cols: 5, theme: ["🐙", "🦀", "🐠", "🐬", "🐳", "🦈", "🐢", "🦑", "🐡", "🦞", "🐚", "🪸", "🦭", "🐧", "🦦", "🐊"] },
  { pairs: 18, cols: 6, theme: null },
];
const ALL = [...new Set(LEVELS.flatMap((l) => l.theme ?? []))];
const VERSUS = { pairs: 10, cols: 4 };
const TOKENS = { 1: "🍓", 2: "🍋" };

const grid = document.getElementById("grid");
const overlay = document.getElementById("overlay");
const hudEl = document.getElementById("hud");
const playersEl = document.getElementById("players");
const netBadge = document.getElementById("netBadge");
const levelsBtn = document.getElementById("levelsBtn");
const hud = {
  level: document.getElementById("hudLevel"),
  moves: document.getElementById("hudMoves"),
  time: document.getElementById("hudTime"),
};
const chips = { 1: document.getElementById("p1"), 2: document.getElementById("p2") };

let mode = "solo";
let room = null;
let me = 1;
let levelIndex = 0;
let deck = [];
let tiles = [];
let open = [];
let matched = 0;
let moves = 0;
let startedAt = 0;
let timer = 0;
let locked = true;
let turn = 1;
let starter = 1;
let over = false;
let remoteFlips = [];
const scores = { 1: 0, 2: 0 };

initChrome();
onLangChange(() => {
  if (overlay.dataset.screen === "levels") showLevels();
  if (mode !== "solo") paintPlayers();
});
levelsBtn.addEventListener("click", () => {
  clearInterval(timer);
  showLevels();
});
chooseMode();

async function chooseMode() {
  const choice = await openLobby({
    game: "memory",
    localChoices: [
      { id: "solo", ico: "🧠", title: t("memory.solo"), hint: t("memory.soloHint") },
      { id: "local", ico: "👥", title: t("memory.local"), hint: t("memory.localHint") },
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
      onClose: () => (over = true),
      fallback: { label: t("memory.playSolo"), onClick: playSolo },
    });
  }
  if (mode === "solo") return showLevels();
  hudEl.hidden = true;
  playersEl.hidden = false;
  levelsBtn.hidden = true;
  if (mode === "guest") showOverlay(overlay, { emoji: "⏳", title: t("memory.waitHost"), actions: [homeAction(room)] });
  else startVersus(1);
}

function playSolo() {
  room = null;
  mode = "solo";
  hudEl.hidden = false;
  playersEl.hidden = true;
  levelsBtn.hidden = false;
  showLevels();
}

function progress() {
  const stars = load("memory.stars", []);
  return Array.isArray(stars) ? stars.map((n) => (isInt(n, 0, 3) ? n : 0)) : [];
}

function showLevels() {
  const stars = progress();
  const card = el("div", "card");
  card.append(el("div", "eyebrow", t("memory.eyebrow")), el("h2", "", t("memory.pick")));
  const list = el("div", "level-list");
  LEVELS.forEach((level, i) => {
    const btn = el("button", "level-row");
    btn.disabled = i > 0 && !stars[i - 1];
    const got = stars[i] ?? 0;
    btn.append(
      el("span", "lv-emoji", btn.disabled ? "🔒" : (level.theme ?? ALL)[0]),
      el("span", "lv-name", t("memory.levelPairs", { n: i + 1, pairs: level.pairs })),
      el("span", "lv-stars", "★".repeat(got) + "☆".repeat(3 - got)),
    );
    btn.addEventListener("click", () => startLevel(i));
    list.append(btn);
  });
  card.append(list);
  overlay.innerHTML = "";
  overlay.append(card);
  overlay.dataset.screen = "levels";
  overlay.hidden = false;
}

function makeDeck(pairs, theme) {
  const faces = shuffle([...theme]).slice(0, pairs);
  return shuffle([...faces, ...faces]);
}

function deal(cards, cols) {
  hideOverlay(overlay);
  overlay.dataset.screen = "";
  deck = cards;
  open = [];
  matched = 0;
  moves = 0;
  remoteFlips = [];
  grid.replaceChildren();
  grid.style.setProperty("--cols", cols);
  tiles = deck.map((face, i) => {
    const btn = el("button", "tile");
    btn.setAttribute("aria-label", t("memory.card", { n: i + 1 }));
    const inner = el("span", "tile-inner");
    inner.append(el("span", "tile-back"), el("span", "tile-front", face));
    btn.append(inner);
    btn.style.animationDelay = `${i * 18}ms`;
    btn.addEventListener("click", () => tryFlip(i));
    grid.append(btn);
    return btn;
  });
}

function startLevel(index) {
  levelIndex = index;
  const level = LEVELS[index];
  deal(makeDeck(level.pairs, level.theme ?? ALL), level.cols);
  clearInterval(timer);
  hud.level.textContent = `${index + 1}/${LEVELS.length}`;
  hud.moves.textContent = "0";
  hud.time.textContent = "0:00";

  // A short look at the whole board first; memorising is the game.
  locked = true;
  const peek = 900 + level.pairs * 90;
  setTimeout(() => tiles.forEach((c) => c.classList.add("flipped")), 250);
  setTimeout(() => {
    tiles.forEach((c) => c.classList.remove("flipped"));
    locked = false;
    startedAt = Date.now();
    timer = setInterval(tickClock, 500);
  }, 250 + peek);
}

function startVersus(first) {
  const cards = makeDeck(VERSUS.pairs, ALL);
  if (mode === "host") room.send({ t: "deal", deck: cards, starter: first });
  beginVersus(cards, first);
}

function beginVersus(cards, first) {
  starter = first;
  turn = first;
  over = false;
  scores[1] = scores[2] = 0;
  deal(cards, VERSUS.cols);
  locked = false;
  paintPlayers();
}

function tickClock() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  hud.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function myTurn() {
  return mode === "solo" || mode === "local" || turn === me;
}

function tryFlip(i) {
  if (locked || over || !myTurn() || tiles[i].classList.contains("flipped")) return;
  room?.send({ t: "flip", i });
  flip(i);
}

function flip(i) {
  const card = tiles[i];
  card.classList.add("flipped");
  sfx.flip();
  open.push(i);
  if (open.length < 2) return;

  moves += 1;
  hud.moves.textContent = moves;
  const [a, b] = open;
  open = [];
  locked = true;
  if (deck[a] === deck[b]) {
    matched += 1;
    if (mode !== "solo") scores[turn] += 1;
    setTimeout(() => {
      tiles[a].classList.add("matched");
      tiles[b].classList.add("matched");
      sfx.match();
      unlock();
    }, 250);
    if (matched === deck.length / 2) setTimeout(mode === "solo" ? winSolo : endVersus, 700);
  } else {
    setTimeout(() => {
      tiles[a].classList.add("miss");
      tiles[b].classList.add("miss");
    }, 350);
    setTimeout(() => {
      tiles[a].classList.remove("flipped", "miss");
      tiles[b].classList.remove("flipped", "miss");
      if (mode !== "solo") turn = 3 - turn;
      unlock();
    }, 900);
  }
  if (mode !== "solo") paintPlayers();
}

// The two phones finish animating a miss at slightly different moments, so
// a flip from the other side can arrive while this side is still locked.
// It waits here instead of being dropped, which would desync the boards.
function unlock() {
  locked = false;
  if (mode !== "solo") paintPlayers();
  while (!locked && remoteFlips.length) {
    const i = remoteFlips.shift();
    if (turn === 3 - me && !tiles[i].classList.contains("flipped")) flip(i);
  }
}

function paintPlayers() {
  const names = { local: [t("memory.player1"), t("memory.player2")], host: [t("you"), t("memory.friend")], guest: [t("memory.friend"), t("you")] }[mode];
  for (const p of [1, 2]) {
    chips[p].querySelector(".name").textContent = names[p - 1];
    chips[p].querySelector(".score").textContent = scores[p];
    chips[p].classList.toggle("active", !over && turn === p);
  }
}

function winSolo() {
  clearInterval(timer);
  tickClock();
  const pairs = LEVELS[levelIndex].pairs;
  const stars = moves <= Math.ceil(pairs * 1.5) ? 3 : moves <= Math.ceil(pairs * 2.2) ? 2 : 1;
  const saved = progress();
  saved[levelIndex] = Math.max(saved[levelIndex] ?? 0, stars);
  save("memory.stars", saved);
  playClip("levelUp", 0.5);

  const last = levelIndex === LEVELS.length - 1;
  showOverlay(overlay, {
    emoji: last ? "🏆" : "🎉",
    eyebrow: "★".repeat(stars) + "☆".repeat(3 - stars),
    title: t(last ? "memory.allDone" : "memory.done"),
    text: t("memory.result", { moves, time: hud.time.textContent }),
    actions: [
      last
        ? { label: t("memory.levels"), primary: true, onClick: showLevels }
        : { label: t("memory.next"), primary: true, onClick: () => startLevel(levelIndex + 1) },
      { label: t("memory.replay"), onClick: () => startLevel(levelIndex) },
      ...(last ? [] : [{ label: t("memory.levels"), onClick: showLevels }]),
    ],
  });
}

function endVersus() {
  over = true;
  paintPlayers();
  const winner = scores[1] === scores[2] ? 0 : scores[1] > scores[2] ? 1 : 2;
  let title;
  if (!winner) title = t("memory.draw");
  else if (mode === "local") title = t("memory.wins", { token: TOKENS[winner] });
  else title = t(winner === me ? "memory.youWin" : "memory.friendWins");
  if (!winner || mode === "local" || winner === me) playClip("levelUp", 0.5);
  else playClip("fail", 0.5);

  showOverlay(overlay, {
    emoji: winner ? TOKENS[winner] : "🤝",
    title,
    text: t("memory.versusScore", { a: scores[1], b: scores[2] }),
    actions: [{ label: t("memory.again"), primary: true, onClick: rematch }, homeAction(room)],
  });
}

function rematch() {
  if (mode === "guest") {
    room.send({ t: "again" });
    showOverlay(overlay, { emoji: "⏳", title: t("memory.waitHost"), actions: [homeAction(room)] });
  } else startVersus(3 - starter);
}

function onMessage(message) {
  if (message.t === "deal" && mode === "guest" && isDeck(message.deck) && oneOf(message.starter, [1, 2])) {
    beginVersus(message.deck, message.starter);
  } else if (message.t === "flip" && !over && isInt(message.i, 0, tiles.length - 1)) {
    if (remoteFlips.length < 4) remoteFlips.push(message.i);
    if (!locked) unlock();
  } else if (message.t === "again" && mode === "host" && over) {
    startVersus(3 - starter);
  }
}

// The host deals, so the guest makes sure it got a real deck: the right
// size, known emoji only, and every face exactly twice.
function isDeck(cards) {
  if (!Array.isArray(cards) || cards.length !== VERSUS.pairs * 2) return false;
  const counts = new Map();
  for (const face of cards) {
    if (!oneOf(face, ALL)) return false;
    counts.set(face, (counts.get(face) ?? 0) + 1);
  }
  return [...counts.values()].every((n) => n === 2);
}
