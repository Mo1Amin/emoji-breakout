import { onLangChange, t } from "./i18n.js";
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

const grid = document.getElementById("grid");
const overlay = document.getElementById("overlay");
const hud = {
  level: document.getElementById("hudLevel"),
  moves: document.getElementById("hudMoves"),
  time: document.getElementById("hudTime"),
};

let levelIndex = 0;
let cards = [];
let open = [];
let matched = 0;
let moves = 0;
let startedAt = 0;
let timer = 0;
let locked = true;

initChrome();
onLangChange(() => overlay.dataset.screen === "levels" && showLevels());
showLevels();

function progress() {
  return load("memory.stars", []);
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

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function startLevel(index) {
  levelIndex = index;
  const level = LEVELS[index];
  const faces = shuffle([...(level.theme ?? ALL)]).slice(0, level.pairs);
  const deck = shuffle([...faces, ...faces]);

  hideOverlay(overlay);
  overlay.dataset.screen = "";
  grid.replaceChildren();
  grid.style.setProperty("--cols", level.cols);
  cards = deck.map((face, i) => {
    const btn = el("button", "tile");
    btn.dataset.face = face;
    btn.setAttribute("aria-label", t("memory.card", { n: i + 1 }));
    const inner = el("span", "tile-inner");
    inner.append(el("span", "tile-back"), el("span", "tile-front", face));
    btn.append(inner);
    btn.style.animationDelay = `${i * 18}ms`;
    btn.addEventListener("click", () => flip(btn));
    grid.append(btn);
    return btn;
  });

  open = [];
  matched = 0;
  moves = 0;
  clearInterval(timer);
  hud.level.textContent = `${index + 1}/${LEVELS.length}`;
  hud.moves.textContent = "0";
  hud.time.textContent = "0:00";

  // A short look at the whole board first; memorising is the game.
  locked = true;
  const peek = 900 + level.pairs * 90;
  setTimeout(() => cards.forEach((c) => c.classList.add("flipped")), 250);
  setTimeout(() => {
    cards.forEach((c) => c.classList.remove("flipped"));
    locked = false;
    startedAt = Date.now();
    timer = setInterval(tickClock, 500);
  }, 250 + peek);
}

function tickClock() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  hud.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function flip(card) {
  if (locked || card.classList.contains("flipped")) return;
  card.classList.add("flipped");
  sfx.flip();
  open.push(card);
  if (open.length < 2) return;

  moves += 1;
  hud.moves.textContent = moves;
  const [a, b] = open;
  open = [];
  if (a.dataset.face === b.dataset.face) {
    matched += 1;
    setTimeout(() => {
      a.classList.add("matched");
      b.classList.add("matched");
      sfx.match();
    }, 250);
    if (matched === LEVELS[levelIndex].pairs) setTimeout(win, 700);
  } else {
    locked = true;
    setTimeout(() => {
      a.classList.add("miss");
      b.classList.add("miss");
    }, 350);
    setTimeout(() => {
      a.classList.remove("flipped", "miss");
      b.classList.remove("flipped", "miss");
      locked = false;
    }, 900);
  }
}

function win() {
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

document.getElementById("levelsBtn").addEventListener("click", () => {
  clearInterval(timer);
  showLevels();
});
