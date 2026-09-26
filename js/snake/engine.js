import { COLS, LEVELS, ROWS, buildLevel, ringCells } from "./levels.js";

export const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
export const DIRECTIONS = Object.keys(DIRS);
const OPPOSITE = { U: "D", D: "U", L: "R", R: "L" };

const START_LIVES = 3;
const MAX_LIVES = 5;
const INTRO_MS = 2400;
const CLEAR_MS = 2800;
const SOS_MS = 6000;
const SOLO_RESPAWN_MS = 1200;
const SHIELD_MS = 1600;
const CONFUSED_MS = 6000;
const PLATE_MS = 6000;
const SHRINK_WARN_MS = 3000;
const ENEMY_EVERY = { patrol: 2, chaser: 3, boss: 3, meteor: 2 };

// The simulation only runs on the host (or alone in solo). The guest never
// simulates; it draws the snapshots the host sends, so the two screens can
// never disagree about who ate what.
export function createGame(playerCount, startLevel = 0) {
  const coop = playerCount > 1;
  const gateMs = coop ? 9000 : 12000;
  const game = {
    levelIndex: startLevel,
    level: null,
    walls: null,
    ring: 0,
    shrinkMs: 0,
    snakes: Array.from({ length: playerCount }, (_, id) => ({ id })),
    fruits: [],
    enemies: [],
    plateMs: [],
    gateMs: 0,
    eaten: 0,
    score: 0,
    lives: START_LIVES,
    timeMs: 0,
    tick: 0,
    phase: "intro",
    phaseMs: INTRO_MS,
    events: [],
  };

  const cfg = () => game.level.cfg;
  const at = (x, y) => y * COLS + x;
  const xy = (cell) => [cell % COLS, Math.floor(cell / COLS)];
  const random = (n) => Math.floor(Math.random() * n);
  const alive = () => game.snakes.filter((s) => s.alive);
  const emit = (name) => game.events.push(name);

  function loadLevel(index) {
    game.levelIndex = index;
    game.level = buildLevel(index);
    game.walls = new Set(game.level.walls);
    game.ring = 0;
    game.shrinkMs = cfg().shrink ?? 0;
    game.enemies = game.level.enemies.map((e) => ({ ...e }));
    game.fruits = [];
    game.plateMs = game.level.plates.map(() => 0);
    game.gateMs = 0;
    game.eaten = 0;
    game.timeMs = (cfg().time ?? 0) * 1000;
    game.phase = "intro";
    game.phaseMs = INTRO_MS;
    for (const snake of game.snakes) respawn(snake, false);
  }

  function respawn(snake, announce = true) {
    const spawn = game.level.spawns[snake.id];
    Object.assign(snake, {
      body: [at(spawn.x, spawn.y), at(spawn.x, spawn.y + 1), at(spawn.x, spawn.y + 2)],
      dir: spawn.dir,
      queue: [],
      alive: true,
      grow: 0,
      sos: null,
      out: false,
      shieldMs: SHIELD_MS,
      confusedMs: 0,
    });
    if (announce) emit("revive");
  }

  function kill(snake, rescueCell) {
    snake.alive = false;
    snake.body = [];
    const rescuable = coop && rescueCell !== null && alive().length > 0;
    snake.sos = { cell: rescuable ? rescueCell : null, ms: rescuable ? SOS_MS : SOLO_RESPAWN_MS };
    emit("crash");
  }

  const gateOpen = () => game.gateMs > 0;

  function enemyCovers(enemy, cell) {
    const [x, y] = xy(cell);
    return x >= enemy.x && x < enemy.x + enemy.size && y >= enemy.y && y < enemy.y + enemy.size;
  }

  function blocked(cell, snake) {
    if (game.walls.has(cell) || game.level.bombs.has(cell)) return true;
    if (!gateOpen() && game.level.gates.includes(cell)) return true;
    const tailMoves = snake.grow === 0;
    const own = snake.body.indexOf(cell);
    if (own !== -1 && !(tailMoves && own === snake.body.length - 1)) return true;
    return snake.shieldMs <= 0 && game.enemies.some((e) => enemyCovers(e, cell));
  }

  function portalExit(cell) {
    for (const [a, b] of game.level.portals) {
      if (cell === a) return b;
      if (cell === b) return a;
    }
    return cell;
  }

  function moveSnake(snake) {
    const next = snake.queue.shift();
    if (next && next !== OPPOSITE[snake.dir]) snake.dir = next;

    const head = snake.body[0];
    const [dx, dy] = DIRS[snake.dir];
    let [x, y] = xy(head);
    x += dx;
    y += dy;
    if (cfg().wrap) {
      x = (x + COLS) % COLS;
      y = (y + ROWS) % ROWS;
    } else if (x < 0 || y < 0 || x >= COLS || y >= ROWS) {
      return kill(snake, head);
    }

    const cell = portalExit(at(x, y));
    if (cell !== at(x, y)) emit("portal");
    if (blocked(cell, snake)) return kill(snake, head);

    snake.body.unshift(cell);
    if (snake.grow > 0) snake.grow--;
    else snake.body.pop();

    eat(snake, cell);
    for (const other of game.snakes) {
      if (other !== snake && other.sos?.cell === cell) {
        respawn(other);
        game.score += 25;
        emit("rescue");
      }
    }
  }

  function eat(snake, cell) {
    const i = game.fruits.findIndex((f) => f.cell === cell);
    if (i === -1) return;
    const [fruit] = game.fruits.splice(i, 1);
    if (fruit.kind === "apple") {
      game.eaten += 1;
      game.score += 10;
      snake.grow += 1;
      emit("eat");
    } else if (fruit.kind === "gold") {
      game.eaten += 3;
      game.score += 30;
      snake.grow += 2;
      emit("gold");
    } else if (fruit.kind === "mushroom") {
      snake.confusedMs = CONFUSED_MS;
      snake.queue = [];
      emit("shroom");
    } else if (fruit.kind === "heart") {
      game.lives = Math.min(game.lives + 1, MAX_LIVES);
      emit("heart");
    }
  }

  function hitSnakes(cells) {
    for (const snake of alive()) {
      if (snake.shieldMs > 0) continue;
      const hit = snake.body.findIndex((c) => cells.includes(c));
      if (hit === 0) kill(snake, null);
      else if (hit > 0) {
        snake.body.length = hit;
        emit("cut");
      }
    }
  }

  function enemyCells(enemy) {
    const cells = [];
    for (let dy = 0; dy < enemy.size; dy++) for (let dx = 0; dx < enemy.size; dx++) cells.push(at(enemy.x + dx, enemy.y + dy));
    return cells;
  }

  function nearestHead(enemy) {
    let best = null;
    let bestDist = Infinity;
    for (const snake of alive()) {
      const [hx, hy] = xy(snake.body[0]);
      const dist = Math.abs(hx - enemy.x) + Math.abs(hy - enemy.y);
      if (dist < bestDist) [best, bestDist] = [[hx, hy], dist];
    }
    return best;
  }

  function moveEnemies() {
    if (cfg().meteors && game.tick % cfg().meteors === 0) {
      game.enemies.push({ kind: "meteor", x: 1 + random(COLS - 2), y: 0, size: 1 });
    }

    for (const enemy of game.enemies) {
      if (game.tick % ENEMY_EVERY[enemy.kind] !== 0) continue;

      if (enemy.kind === "meteor") {
        enemy.y += 1;
      } else if (enemy.kind === "patrol") {
        const free = (x, y) =>
          x >= 0 && y >= 0 && x < COLS && y < ROWS && !game.walls.has(at(x, y)) && !game.level.bombs.has(at(x, y));
        if (!free(enemy.x + enemy.dx, enemy.y + enemy.dy)) {
          enemy.dx = -enemy.dx;
          enemy.dy = -enemy.dy;
        }
        if (free(enemy.x + enemy.dx, enemy.y + enemy.dy)) {
          enemy.x += enemy.dx;
          enemy.y += enemy.dy;
        }
      } else {
        // Ghosts and the dragon fly over walls, so they only need a target.
        const target = nearestHead(enemy);
        if (!target) continue;
        const centre = (enemy.size - 1) / 2;
        const dx = target[0] - (enemy.x + centre);
        const dy = target[1] - (enemy.y + centre);
        if (Math.abs(dx) >= Math.abs(dy)) enemy.x += Math.sign(dx);
        else enemy.y += Math.sign(dy);
        const min = enemy.kind === "boss" ? 1 : 0;
        const maxX = COLS - enemy.size - min;
        const maxY = ROWS - enemy.size - min;
        enemy.x = Math.max(min, Math.min(maxX, enemy.x));
        enemy.y = Math.max(min, Math.min(maxY, enemy.y));
      }
      hitSnakes(enemyCells(enemy));
    }
    game.enemies = game.enemies.filter((e) => e.y < ROWS);
  }

  function occupied(cell) {
    if (game.walls.has(cell) || game.level.bombs.has(cell)) return true;
    if (game.level.gates.includes(cell) || game.level.plates.includes(cell)) return true;
    if (game.level.portals.some(([a, b]) => a === cell || b === cell)) return true;
    if (game.fruits.some((f) => f.cell === cell)) return true;
    if (game.snakes.some((s) => s.body.includes(cell) || s.sos?.cell === cell)) return true;
    return game.enemies.some((e) => enemyCovers(e, cell));
  }

  function spawnFruit(kind, ttl = 0) {
    const zone = kind === "apple" || kind === "gold" ? game.level.zone : null;
    const inner = game.ring + 1;
    for (let attempt = 0; attempt < 300; attempt++) {
      const x = zone ? zone.x1 + random(zone.x2 - zone.x1 + 1) : inner + random(COLS - inner * 2);
      const y = zone ? zone.y1 + random(zone.y2 - zone.y1 + 1) : inner + random(ROWS - inner * 2);
      const cell = at(x, y);
      if (!occupied(cell)) return game.fruits.push({ cell, kind, ttl });
    }
  }

  function updateFruits(dt) {
    for (const fruit of game.fruits) if (fruit.ttl) fruit.ttl -= dt;
    game.fruits = game.fruits.filter((f) => !f.ttl || f.ttl > 0);

    const count = (kind) => game.fruits.filter((f) => f.kind === kind).length;
    const apples = coop ? 2 : 1;
    for (let n = count("apple"); n < apples; n++) spawnFruit("apple");
    if (cfg().gold && !count("gold") && game.tick % 45 === 0) spawnFruit("gold", 6500);
    if (cfg().mushrooms && !count("mushroom") && game.tick % 30 === 0) spawnFruit("mushroom", 9000);
    if (cfg().hearts && game.lives < MAX_LIVES && !count("heart") && Math.random() < 0.004) spawnFruit("heart", 7000);
  }

  function updatePlates(dt) {
    const { plates, gates } = game.level;
    if (!plates.length) return;
    plates.forEach((plate, i) => {
      const pressed = alive().some((s) => s.body.includes(plate));
      game.plateMs[i] = pressed ? PLATE_MS : Math.max(0, game.plateMs[i] - dt);
    });
    const needed = coop ? plates.length : 1;
    const active = game.plateMs.filter((ms) => ms > 0).length;
    const wasOpen = gateOpen();
    if (active >= needed) game.gateMs = gateMs;
    else game.gateMs = Math.max(0, game.gateMs - dt);
    // Never shut the gate on a snake that is halfway through it.
    if (!gateOpen() && game.snakes.some((s) => s.body.some((c) => gates.includes(c)))) game.gateMs = 1;
    if (!wasOpen && gateOpen()) emit("gate");
  }

  function updateShrink(dt) {
    if (!cfg().shrink || game.ring >= 3) return;
    game.shrinkMs -= dt;
    if (game.shrinkMs > 0) return;
    game.ring += 1;
    game.shrinkMs = cfg().shrink;
    const cells = ringCells(game.ring);
    for (const cell of cells) game.walls.add(cell);
    game.fruits = game.fruits.filter((f) => !cells.includes(f.cell));
    hitSnakes(cells);
    emit("shrink");
  }

  function updateDead(dt) {
    for (const snake of game.snakes) {
      if (snake.alive || !snake.sos) continue;
      if (snake.sos.cell !== null && !alive().length) snake.sos.cell = null;
      snake.sos.ms -= dt;
      if (snake.sos.ms > 0) continue;
      if (game.lives > 0) {
        game.lives -= 1;
        respawn(snake);
      } else {
        snake.sos = null;
        snake.out = true;
      }
    }
  }

  function step() {
    game.events = [];
    const dt = cfg().speed;
    game.tick += 1;

    if (game.phase === "intro") {
      game.phaseMs -= dt;
      if (game.phaseMs <= 0) game.phase = "play";
      return;
    }
    if (game.phase === "clear") {
      game.phaseMs -= dt;
      if (game.phaseMs > 0) return;
      if (game.levelIndex === LEVELS.length - 1) {
        game.phase = "won";
        emit("won");
      } else loadLevel(game.levelIndex + 1);
      return;
    }
    if (game.phase !== "play") return;

    for (const snake of alive()) {
      snake.shieldMs -= dt;
      snake.confusedMs -= dt;
      moveSnake(snake);
    }
    moveEnemies();
    updateShrink(dt);
    updateDead(dt);
    updateFruits(dt);
    updatePlates(dt);

    if (cfg().time) {
      game.timeMs -= dt;
      if (game.timeMs <= 0) {
        emit("timeup");
        if (game.lives > 0) {
          game.lives -= 1;
          loadLevel(game.levelIndex);
        } else endGame();
        return;
      }
    }

    if (game.eaten >= cfg().goal) {
      game.phase = "clear";
      game.phaseMs = CLEAR_MS;
      game.score += 100 + game.lives * 20;
      emit("clear");
    } else if (game.snakes.every((s) => s.out)) {
      endGame();
    }
  }

  function endGame() {
    game.phase = "over";
    emit("over");
  }

  function input(id, dir) {
    const snake = game.snakes[id];
    if (!snake?.alive || !DIRECTIONS.includes(dir)) return;
    if (snake.confusedMs > 0) dir = OPPOSITE[dir];
    const last = snake.queue.length ? snake.queue[snake.queue.length - 1] : snake.dir;
    if (dir === last || dir === OPPOSITE[last] || snake.queue.length >= 3) return;
    snake.queue.push(dir);
  }

  function restart(levelIndex = game.levelIndex) {
    game.lives = START_LIVES;
    game.score = 0;
    loadLevel(levelIndex);
  }

  function snapshot() {
    return {
      lv: game.levelIndex,
      ring: game.ring,
      rw: Boolean(cfg().shrink) && game.ring < 3 && game.shrinkMs <= SHRINK_WARN_MS,
      ph: game.phase,
      go: gateOpen(),
      pl: game.plateMs.map((ms) => ms > 0),
      e: game.eaten,
      sc: game.score,
      li: game.lives,
      tm: game.timeMs,
      sn: game.snakes.map((s) => ({
        b: s.body,
        d: s.dir,
        a: s.alive,
        so: s.sos && s.sos.cell !== null ? [s.sos.cell, s.sos.ms] : null,
        sh: s.shieldMs > 0,
        cf: s.confusedMs > 0,
      })),
      f: game.fruits.map((f) => [f.cell, f.kind]),
      en: game.enemies.map((e) => [e.kind, e.x, e.y]),
      ev: game.events,
    };
  }

  loadLevel(startLevel);
  return { step, input, restart, snapshot, get speed() { return cfg().speed; }, get phase() { return game.phase; } };
}
