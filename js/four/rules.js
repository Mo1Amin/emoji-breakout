export const COLS = 7;
export const ROWS = 6;
const LINES = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

export function dropRow(board, col) {
  for (let row = ROWS - 1; row >= 0; row--) if (!board[row][col]) return row;
  return -1;
}

export function winningLine(board, row, col) {
  const player = board[row][col];
  for (const [dr, dc] of LINES) {
    const line = [[row, col]];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        line.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

export function isFull(board) {
  return board[0].every(Boolean);
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];

function scoreWindow(cells, me) {
  const them = 3 - me;
  const mine = cells.filter((v) => v === me).length;
  const theirs = cells.filter((v) => v === them).length;
  const empty = cells.length - mine - theirs;
  if (mine === 4) return 1000;
  if (mine === 3 && empty === 1) return 6;
  if (mine === 2 && empty === 2) return 2;
  if (theirs === 3 && empty === 1) return -8;
  return 0;
}

function evaluate(board, me) {
  let score = 0;
  for (let r = 0; r < ROWS; r++) if (board[r][3] === me) score += 3;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of LINES) {
        const endR = r + dr * 3;
        const endC = c + dc * 3;
        if (endR < 0 || endR >= ROWS || endC < 0 || endC >= COLS) continue;
        score += scoreWindow([0, 1, 2, 3].map((k) => board[r + dr * k][c + dc * k]), me);
      }
    }
  }
  return score;
}

function search(board, depth, alpha, beta, player, me) {
  let best = player === me ? -Infinity : Infinity;
  let bestCol = -1;
  for (const col of ORDER) {
    const row = dropRow(board, col);
    if (row === -1) continue;
    board[row][col] = player;
    let value;
    if (winningLine(board, row, col)) value = (player === me ? 1 : -1) * (100000 + depth);
    else if (depth === 0 || isFull(board)) value = evaluate(board, me);
    else value = search(board, depth - 1, alpha, beta, 3 - player, me).value;
    board[row][col] = 0;

    if (player === me ? value > best : value < best) [best, bestCol] = [value, col];
    if (player === me) alpha = Math.max(alpha, value);
    else beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return { value: best, col: bestCol };
}

// Depth 5 plays a solid game but still misses long traps, which keeps it
// beatable. The occasional random opening move stops rounds repeating.
export function botMove(board, me) {
  const moves = board.flat().filter(Boolean).length;
  if (moves < 2 && Math.random() < 0.5) {
    const options = [2, 3, 4].filter((c) => dropRow(board, c) !== -1);
    return options[Math.floor(Math.random() * options.length)];
  }
  const copy = board.map((row) => [...row]);
  return search(copy, 5, -Infinity, Infinity, me, me).col;
}
