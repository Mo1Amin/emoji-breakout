import { onLangChange, t } from "./i18n.js";
import { openLobby } from "./lobby.js";
import { bindRoom, homeAction, isInt, oneOf } from "./online.js";
import { playClip, sfx } from "./sfx.js";
import { load, save } from "./storage.js";
import { el, hideOverlay, initChrome, showOverlay, toast } from "./ui.js";

// Pairs that look alike at a glance. The game is spotting the one that
// is not like the others, so the closer the pair, the harder the round.
const PAIRS = [
  ["😀", "😃"], ["😁", "😄"], ["😐", "😑"], ["😗", "😙"], ["😟", "🙁"], ["😺", "😸"],
  ["🌑", "🌚"], ["🌕", "🌝"], ["🕐", "🕑"], ["🍏", "🍎"], ["🐭", "🐹"], ["🌲", "🌳"],
  ["🙈", "🙊"], ["🐻", "🐨"], ["🍊", "🍑"], ["⚽", "🏐"], ["🌹", "🥀"], ["🌖", "🌗"],
  ["🟠", "🟡"], ["🔷", "🔹"], ["😪", "😥"], ["🐑", "🐏"], ["🍪", "🥯"], ["⏳", "⌛"],
];
const SOLO_SECONDS = 45;
const WRONG_PENALTY_MS = 2000;
const RACE_TARGET = 10;
const RACE_FREEZE_MS = 1000;

const board = document.getElementById("oddBoard");
const overlay = document.getElementById("overlay");
const netBadge = document.getElementById("netBadge");
const hudEl = document.getElementById("hud");
const playersEl = document.getElementById("players");
const timeBar = document.getElementById("timeBar");
const hud = { score: document.getElementById("hudScore"), best: document.getElementById("hudBest"), time: document.getElementById("hudTime") };
const chips = { 1: document.getElementById("p1"), 2: document.getElementById("p2") };

let mode = "solo";
let room = null;
let me = 1;
let round = null;
let roundNo = 0;
let score = 0;
let best = Number(load("odd.best", 0)) || 0;
let endsAt = 0;
let timer = 0;
let frozenUntil = 0;
let playing = false;
const scores = { 1: 0, 2: 0 };

initChrome();
onLangChange(paintPlayers);
hud.best.textContent = best;
chooseMode();

async function chooseMode() {
  const choice = await openLobby({
    game: "odd",
    localChoices: [{ id: "solo", ico: "👀", title: t("odd.solo"), hint: t("odd.soloHint", { s: SOLO_SECONDS }) }],
  });
  mode = choice.mode;
  room = choice.room ?? null;
  me = mode === "guest" ? 2 : 1;
  if (room) {
    bindRoom(room, {
      badge: netBadge,
      overlay,
      onMessage,
      onClose: () => (playing = false),
      fallback: { label: t("odd.playSolo"), onClick: playSolo },
    });
    hudEl.hidden = true;
    timeBar.hidden = true;
    playersEl.hidden = false;
    paintPlayers();
  }
  if (mode === "solo") startSolo();
  else if (mode === "host") startRace();
  else showOverlay(overlay, { emoji: "⏳", title: t("odd.waitHost"), actions: [homeAction(room)] });
}

function playSolo() {
  room = null;
  mode = "solo";
  me = 1;
  hudEl.hidden = false;
  timeBar.hidden = false;
  playersEl.hidden = true;
  startSolo();
}

function makeRound(n) {
  const size = Math.min(3 + Math.floor(n / 2), 7);
  return {
    n,
    size,
    pair: Math.floor(Math.random() * PAIRS.length),
    swap: Math.random() < 0.5,
    odd: Math.floor(Math.random() * size * size),
  };
}

function render(r) {
  round = r;
  const [common, different] = r.swap ? [...PAIRS[r.pair]].reverse() : PAIRS[r.pair];
  board.style.setProperty("--size", r.size);
  board.replaceChildren(
    ...Array.from({ length: r.size * r.size }, (_, i) => {
      const cell = el("button", "odd-cell", i === r.odd ? different : common);
      cell.addEventListener("click", () => tap(i, cell));
      return cell;
    }),
  );
}

function tap(i, cell) {
  if (!playing || !round || round.claimed) return;
  if (Date.now() < frozenUntil) return;
  if (i !== round.odd) {
    cell.classList.add("wrong");
    setTimeout(() => cell.classList.remove("wrong"), 400);
    sfx.hit();
    navigator.vibrate?.(50);
    if (mode === "solo") endsAt -= WRONG_PENALTY_MS;
    else frozenUntil = Date.now() + RACE_FREEZE_MS;
    return;
  }
  if (mode === "solo") return foundSolo(cell);
  if (mode === "guest") {
    cell.classList.add("pending");
    room.send({ t: "claim", n: round.n, i });
  } else award(1);
}

function startSolo() {
  score = 0;
  roundNo = 0;
  hud.score.textContent = "0";
  hideOverlay(overlay);
  render(makeRound(roundNo));
  playing = true;
  endsAt = Date.now() + SOLO_SECONDS * 1000;
  clearInterval(timer);
  timer = setInterval(tickSolo, 100);
  playClip("start", 0.4);
}

function tickSolo() {
  const left = Math.max(0, endsAt - Date.now());
  hud.time.textContent = Math.ceil(left / 1000);
  timeBar.style.setProperty("--left", left / (SOLO_SECONDS * 1000));
  if (left > 0) return;
  clearInterval(timer);
  playing = false;
  const record = score > best;
  if (record) {
    best = score;
    save("odd.best", best);
    hud.best.textContent = best;
  }
  playClip(record ? "levelUp" : "fail", 0.5);
  showOverlay(overlay, {
    emoji: record ? "🏆" : "⏱️",
    eyebrow: record ? t("odd.newBest") : "",
    title: t("odd.timeUp"),
    text: t("odd.soloResult", { score, best }),
    actions: [{ label: t("odd.again"), primary: true, onClick: startSolo }, homeAction()],
  });
}

function foundSolo(cell) {
  cell.classList.add("found");
  sfx.match();
  score += 1;
  hud.score.textContent = score;
  round.claimed = true;
  setTimeout(() => render(makeRound(++roundNo)), 220);
}

function startRace() {
  scores[1] = scores[2] = 0;
  roundNo = 0;
  hideOverlay(overlay);
  paintPlayers();
  playClip("start", 0.4);
  nextRound();
}

function nextRound() {
  const r = makeRound(roundNo++);
  room.send({ t: "round", ...r });
  beginRound(r);
}

function beginRound(r) {
  frozenUntil = 0;
  playing = true;
  render(r);
}

// The host is the referee: the first correct tap it hears about wins the
// round, whether it came from its own screen or from the guest.
function award(player) {
  if (round.claimed) return;
  round.claimed = true;
  scores[player] += 1;
  const done = scores[player] >= RACE_TARGET;
  room.send({ t: "won", n: round.n, by: player, scores: [scores[1], scores[2]], done });
  showWin(player, done);
  if (!done) setTimeout(nextRound, 900);
}

function showWin(player, done) {
  const cell = board.children[round.odd];
  cell?.classList.add(player === me ? "found" : "stolen");
  if (player === me) sfx.match();
  else toast(t("odd.friendGotIt"));
  paintPlayers();
  if (!done) return;
  playing = false;
  const iWon = player === me;
  playClip(iWon ? "levelUp" : "fail", 0.5);
  showOverlay(overlay, {
    emoji: iWon ? "🏆" : "🥈",
    title: t(iWon ? "odd.youWin" : "odd.friendWins"),
    text: t("odd.raceScore", { a: scores[me], b: scores[3 - me] }),
    actions: [{ label: t("odd.again"), primary: true, onClick: rematch }, homeAction(room)],
  });
}

function rematch() {
  if (mode === "host") return startRace();
  room.send({ t: "again" });
  showOverlay(overlay, { emoji: "⏳", title: t("odd.waitHost"), actions: [homeAction(room)] });
}

function onMessage(message) {
  if (mode === "host") {
    if (message.t === "claim" && round && message.n === round.n && message.i === round.odd && playing) award(2);
    else if (message.t === "again" && !playing) startRace();
    return;
  }
  if (message.t === "round" && isRound(message)) {
    hideOverlay(overlay);
    if (message.n === 0) scores[1] = scores[2] = 0;
    paintPlayers();
    beginRound({ n: message.n, size: message.size, pair: message.pair, swap: message.swap, odd: message.odd });
  } else if (message.t === "won" && round && message.n === round.n && oneOf(message.by, [1, 2]) && isScores(message.scores)) {
    round.claimed = true;
    [scores[1], scores[2]] = message.scores;
    showWin(message.by, message.done === true);
  }
}

function isRound(r) {
  return isInt(r.n, 0, 1e4) && isInt(r.size, 3, 7) && isInt(r.pair, 0, PAIRS.length - 1) &&
    typeof r.swap === "boolean" && isInt(r.odd, 0, r.size * r.size - 1);
}

function isScores(s) {
  return Array.isArray(s) && isInt(s[0], 0, RACE_TARGET) && isInt(s[1], 0, RACE_TARGET);
}

function paintPlayers() {
  if (mode === "solo") return;
  const names = { host: [t("you"), t("odd.friend")], guest: [t("odd.friend"), t("you")] }[mode];
  for (const p of [1, 2]) {
    chips[p].querySelector(".name").textContent = names[p - 1];
    chips[p].querySelector(".score").textContent = `${scores[p]}/${RACE_TARGET}`;
  }
}
