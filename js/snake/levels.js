export const COLS = 16;
export const ROWS = 20;

const DEFAULT_SPAWNS = [
  { x: 3, y: 15, dir: "U" },
  { x: 12, y: 15, dir: "U" },
];

const MAZE = [
  "################",
  "#..............#",
  "#..............#",
  "#..####..####..#",
  "#..#........#..#",
  "#..#........#..#",
  "#..#..####..#..#",
  "#.....#..#.....#",
  "#.....#..#.....#",
  "####..#..#..####",
  "#..............#",
  "#..............#",
  "#..####..####..#",
  "#.....#..#.....#",
  "#.....#..#.....#",
  "#..............#",
  "#..............#",
  "#..............#",
  "#..............#",
  "################",
];

// Every level adds one new idea, then later levels mix the ones you know.
// Mechanics that need two players (the plates) still work alone, with one
// plate enough and a longer gate timer.
export const LEVELS = [
  { emoji: "🍎", speed: 190, goal: 5, wrap: true },
  { emoji: "🧱", speed: 185, goal: 7, build: (g) => g.border() },
  {
    emoji: "🏛️",
    speed: 180,
    goal: 8,
    build: (g) => {
      g.border();
      for (const [x, y] of [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]]) g.block(x, y, 2, 2);
    },
  },
  {
    emoji: "🌀",
    speed: 178,
    goal: 8,
    build: (g) => {
      g.border();
      g.hline(10, 1, 14);
      g.portal(2, 13, 13, 6);
      g.portal(13, 13, 2, 6);
    },
  },
  { emoji: "🌟", speed: 172, goal: 14, wrap: true, gold: true },
  { emoji: "🍄", speed: 172, goal: 10, mushrooms: true, build: (g) => g.border() },
  {
    emoji: "💣",
    speed: 170,
    goal: 10,
    build: (g) => {
      g.border();
      for (const [x, y] of [[4, 4], [11, 4], [7, 6], [3, 9], [12, 9], [8, 10], [5, 13], [10, 13], [7, 3], [2, 6]]) g.bomb(x, y);
    },
  },
  {
    emoji: "👾",
    speed: 168,
    goal: 10,
    build: (g) => {
      g.border();
      g.patrol(1, 4, 1, 0);
      g.patrol(14, 8, -1, 0);
      g.patrol(1, 12, 1, 0);
    },
  },
  {
    emoji: "🗝️",
    speed: 166,
    goal: 8,
    hearts: true,
    build: (g) => {
      g.border();
      g.box(5, 4, 10, 9);
      g.gate(7, 9);
      g.gate(8, 9);
      g.zone(6, 5, 9, 8);
      g.plate(2, 12);
      g.plate(13, 12);
    },
  },
  { emoji: "🌑", speed: 166, goal: 10, wrap: true, dark: 4.5, hearts: true },
  { emoji: "🧩", speed: 164, goal: 10, build: (g) => g.map(MAZE) },
  { emoji: "⏱️", speed: 150, goal: 14, time: 75, gold: true, build: (g) => g.border() },
  { emoji: "☄️", speed: 160, goal: 12, wrap: true, meteors: 10, hearts: true },
  {
    emoji: "🔥",
    speed: 158,
    goal: 12,
    shrink: 13000,
    spawns: [
      { x: 5, y: 10, dir: "U" },
      { x: 10, y: 10, dir: "U" },
    ],
    build: (g) => g.border(),
  },
  {
    emoji: "👻",
    speed: 156,
    goal: 12,
    hearts: true,
    build: (g) => {
      g.border();
      for (const [x, y] of [[4, 5], [10, 5], [4, 11], [10, 11]]) g.block(x, y, 2, 2);
      g.portal(7, 2, 8, 17);
      g.chaser(2, 2);
      g.chaser(13, 2);
    },
  },
  {
    emoji: "🌘",
    speed: 154,
    goal: 12,
    dark: 4.5,
    hearts: true,
    build: (g) => {
      g.border();
      for (const [x, y] of [[3, 3], [12, 3], [6, 5], [9, 7], [4, 9], [11, 10], [7, 12], [2, 12], [13, 13], [8, 3]]) g.bomb(x, y);
    },
  },
  {
    emoji: "🏰",
    speed: 152,
    goal: 12,
    gold: true,
    build: (g) => {
      g.border();
      g.hline(6, 1, 2);
      g.hline(6, 5, 6);
      g.vline(6, 1, 6);
      g.hline(6, 9, 10);
      g.hline(6, 13, 14);
      g.vline(9, 1, 6);
      g.plate(3, 3);
      g.plate(12, 3);
      g.box(4, 9, 11, 13);
      g.gate(7, 13);
      g.gate(8, 13);
      g.zone(5, 10, 10, 12);
    },
  },
  { emoji: "🌧️", speed: 142, goal: 14, wrap: true, meteors: 8, mushrooms: true, hearts: true },
  {
    emoji: "🕸️",
    speed: 156,
    goal: 10,
    dark: 5,
    hearts: true,
    build: (g) => {
      g.map(MAZE);
      g.chaser(7, 1);
    },
  },
  {
    emoji: "🐲",
    speed: 148,
    goal: 15,
    gold: true,
    hearts: true,
    meteors: 20,
    build: (g) => {
      g.border();
      g.boss(7, 2);
    },
  },
];

export function buildLevel(index) {
  const cfg = LEVELS[index];
  const level = {
    index,
    cfg,
    walls: new Set(),
    gates: [],
    plates: [],
    portals: [],
    bombs: new Set(),
    enemies: [],
    zone: null,
    spawns: cfg.spawns ?? DEFAULT_SPAWNS,
  };
  const at = (x, y) => y * COLS + x;
  const g = {
    wall: (x, y) => level.walls.add(at(x, y)),
    border() {
      for (let x = 0; x < COLS; x++) g.wall(x, 0), g.wall(x, ROWS - 1);
      for (let y = 0; y < ROWS; y++) g.wall(0, y), g.wall(COLS - 1, y);
    },
    hline: (y, x1, x2) => {
      for (let x = x1; x <= x2; x++) g.wall(x, y);
    },
    vline: (x, y1, y2) => {
      for (let y = y1; y <= y2; y++) g.wall(x, y);
    },
    block: (x, y, w, h) => {
      for (let dy = 0; dy < h; dy++) g.hline(y + dy, x, x + w - 1);
    },
    box: (x1, y1, x2, y2) => {
      g.hline(y1, x1, x2);
      g.hline(y2, x1, x2);
      g.vline(x1, y1, y2);
      g.vline(x2, y1, y2);
    },
    map: (rows) => rows.forEach((row, y) => [...row].forEach((c, x) => c === "#" && g.wall(x, y))),
    gate: (x, y) => {
      level.walls.delete(at(x, y));
      level.gates.push(at(x, y));
    },
    plate: (x, y) => level.plates.push(at(x, y)),
    portal: (ax, ay, bx, by) => level.portals.push([at(ax, ay), at(bx, by)]),
    bomb: (x, y) => level.bombs.add(at(x, y)),
    zone: (x1, y1, x2, y2) => (level.zone = { x1, y1, x2, y2 }),
    patrol: (x, y, dx, dy) => level.enemies.push({ kind: "patrol", x, y, dx, dy, size: 1 }),
    chaser: (x, y) => level.enemies.push({ kind: "chaser", x, y, size: 1 }),
    boss: (x, y) => level.enemies.push({ kind: "boss", x, y, size: 2 }),
  };
  cfg.build?.(g);

  for (const spawn of level.spawns) {
    for (let k = -1; k < 3; k++) level.walls.delete(at(spawn.x, spawn.y + k));
  }
  return level;
}

export function ringCells(ring) {
  const cells = [];
  for (let x = ring; x < COLS - ring; x++) cells.push(ring * COLS + x, (ROWS - 1 - ring) * COLS + x);
  for (let y = ring; y < ROWS - ring; y++) cells.push(y * COLS + ring, y * COLS + COLS - 1 - ring);
  return cells;
}
