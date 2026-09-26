import { COLS, ROWS, botMove, dropRow, emptyBoard, isFull, winningLine } from "./rules.js";
import { onLangChange, t } from "../i18n.js";
import { openLobby } from "../lobby.js";
import { bindRoom, isInt, oneOf } from "../online.js";
import { playClip, sfx } from "../sfx.js";
import { el, hideOverlay, initChrome } from "../ui.js";

const TOKENS = { 1: "🍓", 2: "🍋" };
const REACTIONS = ["😂", "😎", "😱", "🔥", "👏", "🤝"];

const boardEl = document.getElementById("board");
const overlay = document.getElementById("overlay");
const statusText = document.getElementById("statusText");
const statusAction = document.getElementById("statusAction");
const reactionsEl = document.getElementById("reactions");
const netBadge = document.getElementById("netBadge");
const players = {
  1: document.getElementById("p1"),
  2: document.getElementById("p2"),
};

let mode = "bot";
let room = null;
let me = 1;
let board = emptyBoard();
let turn = 1;
let starter = 1;
let over = true;
let busy = false;
let lastReactionIn = 0;
const scores = { 1: 0, 2: 0 };
const slots = [];

initChrome();
buildBoard();
onLangChange(() => {
  paintPlayers();
  paintStatus();
});
chooseMode();

async function chooseMode() {
  const choice = await openLobby({
    game: "four",
    localChoices: [
      { id: "bot", ico: "🤖", title: t("four.bot"), hint: t("four.botHint") },
      { id: "local", ico: "👥", title: t("four.local"), hint: t("four.localHint") },
    ],
  });
  mode = choice.mode;
  room = choice.room ?? null;
  me = mode === "guest" ? 2 : 1;
  scores[1] = scores[2] = 0;

  if (room) {
    bindRoom(room, {
      badge: netBadge,
      overlay,
      onMessage,
      onClose: () => {
        reactionsEl.hidden = true;
        over = true;
        paintPlayers();
      },
      fallback: { label: t("four.playBot"), onClick: playBot },
    });
    buildReactions();
  }
  if (mode === "guest") {
    over = true;
    paintPlayers();
    setStatus(t("four.waitHost"));
  } else startRound(1);
}

function buildBoard() {
  for (let r = 0; r < ROWS; r++) {
    slots.push([]);
    for (let c = 0; c < COLS; c++) {
      const slot = el("div", "slot");
      slot.style.gridRow = r + 1;
      slot.style.gridColumn = c + 1;
      boardEl.append(slot);
      slots[r].push(slot);
    }
  }
  for (let c = 0; c < COLS; c++) {
    const column = el("button", "column");
    column.style.gridColumn = c + 1;
    column.dataset.col = c;
    column.setAttribute("aria-label", `${t("four.column")} ${c + 1}`);
    column.addEventListener("click", () => tryPlay(c));
    boardEl.append(column);
  }
}

function paintPlayers() {
  const names = {
    bot: [t("you"), t("four.botName")],
    local: [t("four.player1"), t("four.player2")],
    host: [t("you"), t("four.friend")],
    guest: [t("four.friend"), t("you")],
  }[mode];
  for (const p of [1, 2]) {
    const chip = players[p];
    chip.querySelector(".name").textContent = names[p - 1];
    chip.querySelector(".score").textContent = scores[p];
    chip.classList.toggle("active", !over && turn === p);
  }
}

function startRound(first) {
  board = emptyBoard();
  starter = first;
  turn = first;
  over = false;
  busy = false;
  hideOverlay(overlay);
  for (const row of slots) for (const slot of row) slot.replaceChildren();
  boardEl.classList.remove("finished");
  paintPlayers();
  paintStatus();
  if (mode === "host") room.send({ t: "round", starter: first });
  maybeBot();
}

function canPlay() {
  if (over || busy) return false;
  if (mode === "local") return true;
  return turn === me;
}

function tryPlay(col) {
  if (!canPlay() || dropRow(board, col) === -1) return;
  if (room) room.send({ t: "move", col });
  play(col);
}

function play(col) {
  const row = dropRow(board, col);
  if (row === -1) return;
  board[row][col] = turn;

  const disc = el("div", `disc p${turn}`, TOKENS[turn]);
  disc.style.setProperty("--fall", row + 1);
  slots[row][col].append(disc);
  sfx.drop();
  navigator.vibrate?.(10);

  const line = winningLine(board, row, col);
  if (line) return finish(turn, line);
  if (isFull(board)) return finish(0, null);
  turn = 3 - turn;
  paintPlayers();
  paintStatus();
  maybeBot();
}

function maybeBot() {
  if (mode !== "bot" || over || turn !== 2) return;
  busy = true;
  paintStatus();
  setTimeout(() => {
    busy = false;
    play(botMove(board, 2));
  }, 450 + Math.random() * 350);
}

function finish(winner, line) {
  over = true;
  if (winner) scores[winner] += 1;
  if (line) {
    boardEl.classList.add("finished");
    for (const [r, c] of line) slots[r][c].firstChild.classList.add("win");
  }
  paintPlayers();

  const iWon = mode === "local" ? winner !== 0 : winner === me;
  if (winner === 0) sfx.hit();
  else playClip(iWon ? "levelUp" : "fail", 0.5);

  let message;
  if (!winner) message = t("four.draw");
  else if (mode === "local") message = t("four.wins", { token: TOKENS[winner] });
  else message = t(iWon ? "four.youWin" : mode === "bot" ? "four.botWins" : "four.friendWins");
  setStatus(message, t("four.again"), requestRematch);
}

function requestRematch() {
  if (mode === "guest") {
    room.send({ t: "again" });
    setStatus(t("four.waitHost"));
    return;
  }
  startRound(3 - starter);
}

function paintStatus() {
  if (over) return;
  if (mode === "bot" && turn === 2) return setStatus(t("four.botThinking"));
  if (mode === "local") return setStatus(t("four.turnOf", { token: TOKENS[turn] }));
  setStatus(turn === me ? t("four.yourTurn", { token: TOKENS[me] }) : t("four.friendTurn"));
}

function setStatus(text, actionLabel, action) {
  statusText.textContent = text;
  statusAction.hidden = !actionLabel;
  if (actionLabel) {
    statusAction.textContent = actionLabel;
    statusAction.onclick = action;
    statusAction.focus({ preventScroll: true });
  }
}

function onMessage(message) {
  if (message.t === "move") {
    const { col } = message;
    if (!over && turn === 3 - me && isInt(col, 0, COLS - 1) && dropRow(board, col) !== -1) play(col);
  } else if (message.t === "round" && mode === "guest" && oneOf(message.starter, [1, 2])) {
    startRound(message.starter);
  } else if (message.t === "again" && mode === "host" && over) {
    startRound(3 - starter);
  } else if (message.t === "react" && oneOf(message.e, REACTIONS) && Date.now() - lastReactionIn > 300) {
    lastReactionIn = Date.now();
    floatReaction(message.e, "them");
  }
}

function playBot() {
  room = null;
  mode = "bot";
  me = 1;
  scores[1] = scores[2] = 0;
  startRound(1);
}

function buildReactions() {
  reactionsEl.hidden = false;
  let last = 0;
  for (const emoji of REACTIONS) {
    const btn = el("button", "reaction", emoji);
    btn.setAttribute("aria-label", `${t("four.react")} ${emoji}`);
    btn.addEventListener("click", () => {
      if (Date.now() - last < 600) return;
      last = Date.now();
      room?.send({ t: "react", e: emoji });
      floatReaction(emoji, "me");
    });
    reactionsEl.append(btn);
  }
}

function floatReaction(emoji, side) {
  const bubble = el("div", `float-reaction ${side}`, emoji);
  bubble.style.setProperty("--drift", `${Math.round(Math.random() * 40 - 20)}px`);
  document.getElementById("stage").append(bubble);
  setTimeout(() => bubble.remove(), 1800);
}

window.addEventListener("keydown", (e) => {
  const col = Number(e.key) - 1;
  if (col >= 0 && col < COLS) tryPlay(col);
});
