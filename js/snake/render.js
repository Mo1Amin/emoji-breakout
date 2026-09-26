import { COLS, LEVELS, ROWS, buildLevel, ringCells } from "./levels.js";
import { fitCanvas } from "../ui.js";

export const SNAKE_COLORS = ["#3ddc84", "#ffb13d"];
const PORTAL_COLORS = ["#8f7bff", "#ff6fae"];
const FRUITS = ["🍎", "🍊", "🍇", "🍓", "🍉", "🍒", "🍑", "🍍", "🥝", "🍋"];
const ITEM_EMOJI = { gold: "🌟", mushroom: "🍄", heart: "❤️" };
const ENEMY_EMOJI = { patrol: "👾", chaser: "👻", boss: "🐲", meteor: "☄️" };
const EYE_OFFSET = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const SOS_MS = 6000;

export function createRenderer(canvas) {
  let ctx;
  let cell = 20;
  let dpr = 1;
  let theme = {};
  const sprites = new Map();
  const shade = document.createElement("canvas");
  let level = null;
  let walls = null;
  let wallsKey = "";

  function resize(cellSize) {
    cell = cellSize;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx = fitCanvas(canvas, COLS * cell, ROWS * cell);
    shade.width = canvas.width;
    shade.height = canvas.height;
    sprites.clear();
    readTheme();
  }

  function readTheme() {
    const css = getComputedStyle(document.documentElement);
    theme = {
      dark: css.colorScheme !== "light",
      surface: css.getPropertyValue("--surface").trim(),
      text: css.getPropertyValue("--text").trim(),
      muted: css.getPropertyValue("--muted").trim(),
      accent: css.getPropertyValue("--accent").trim(),
      danger: css.getPropertyValue("--danger").trim(),
      font: css.getPropertyValue("--font").trim(),
    };
  }

  function sprite(emoji, size) {
    const key = `${emoji}|${size}`;
    let image = sprites.get(key);
    if (!image) {
      image = document.createElement("canvas");
      image.width = image.height = Math.ceil(size * dpr);
      const g = image.getContext("2d");
      g.scale(dpr, dpr);
      g.font = `${size * 0.82}px ${EMOJI_FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(emoji, size / 2, size / 2 + size * 0.06);
      sprites.set(key, image);
    }
    return image;
  }

  function drawEmoji(emoji, cx, cy, size) {
    const rounded = Math.round(size);
    ctx.drawImage(sprite(emoji, rounded), cx - rounded / 2, cy - rounded / 2, rounded, rounded);
  }

  const cx = (c) => (c % COLS) * cell + cell / 2;
  const cy = (c) => Math.floor(c / COLS) * cell + cell / 2;

  function syncLevel(snap) {
    const key = `${snap.lv}:${snap.ring}`;
    if (key === wallsKey) return;
    if (!level || level.index !== snap.lv) level = buildLevel(snap.lv);
    walls = new Set(level.walls);
    for (let ring = 1; ring <= snap.ring; ring++) for (const c of ringCells(ring)) walls.add(c);
    wallsKey = key;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  }

  function drawFloor() {
    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, COLS * cell, ROWS * cell);
    ctx.fillStyle = theme.dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.03)";
    for (let y = 0; y < ROWS; y++) for (let x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);

    if (level.zone) {
      const { x1, y1, x2, y2 } = level.zone;
      ctx.fillStyle = theme.dark ? "rgba(255,200,61,0.07)" : "rgba(255,170,0,0.1)";
      ctx.fillRect(x1 * cell, y1 * cell, (x2 - x1 + 1) * cell, (y2 - y1 + 1) * cell);
    }
  }

  function drawWalls(snap, now) {
    const hue = (snap.lv * 47 + 200) % 360;
    ctx.fillStyle = theme.dark ? `hsl(${hue} 16% 27%)` : `hsl(${hue} 22% 80%)`;
    const pad = Math.max(1, cell * 0.06);
    for (const c of walls) roundRect((c % COLS) * cell + pad, Math.floor(c / COLS) * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.22);

    if (snap.rw) {
      ctx.fillStyle = theme.danger;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(now / 90);
      for (const c of ringCells(snap.ring + 1)) roundRect((c % COLS) * cell + pad, Math.floor(c / COLS) * cell + pad, cell - pad * 2, cell - pad * 2, cell * 0.22);
      ctx.globalAlpha = 1;
    }

    for (const c of level.gates) {
      const x = (c % COLS) * cell;
      const y = Math.floor(c / COLS) * cell;
      if (snap.go) {
        ctx.strokeStyle = theme.accent;
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = theme.accent;
        for (let i = 0; i < 3; i++) roundRect(x + cell * (0.14 + i * 0.28), y + 1, cell * 0.16, cell - 2, 2);
      }
    }

    level.plates.forEach((c, i) => {
      const active = snap.pl[i];
      ctx.fillStyle = active ? theme.accent : theme.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.arc(cx(c), cy(c), cell * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (!active) drawEmoji("🔘", cx(c), cy(c), cell * 0.7);
    });
  }

  function drawPortals(now) {
    level.portals.forEach((pair, i) => {
      for (const c of pair) {
        ctx.save();
        ctx.translate(cx(c), cy(c));
        ctx.rotate((now / 600) * (i % 2 ? -1 : 1));
        ctx.strokeStyle = PORTAL_COLORS[i % PORTAL_COLORS.length];
        ctx.lineWidth = cell * 0.14;
        ctx.setLineDash([cell * 0.3, cell * 0.18]);
        ctx.beginPath();
        ctx.arc(0, 0, cell * 0.38, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
    ctx.setLineDash([]);
  }

  function drawItems(snap, now) {
    for (const c of level.bombs) drawEmoji("💣", cx(c), cy(c), cell * 1.05);
    const fruit = FRUITS[snap.lv % FRUITS.length];
    snap.f.forEach(([c, kind], i) => {
      const bob = 1 + 0.07 * Math.sin(now / 180 + i);
      drawEmoji(kind === "apple" ? fruit : ITEM_EMOJI[kind], cx(c), cy(c), cell * 1.1 * bob);
    });

    for (const s of snap.sn) {
      if (!s.so) continue;
      const [c, ms] = s.so;
      const pulse = 0.5 + 0.5 * Math.sin(now / 140);
      ctx.strokeStyle = theme.danger;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.35 + 0.4 * pulse;
      ctx.beginPath();
      ctx.arc(cx(c), cy(c), cell * (0.75 + 0.25 * pulse), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx(c), cy(c), cell * 0.62, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * ms) / SOS_MS);
      ctx.stroke();
      drawEmoji("🆘", cx(c), cy(c), cell * 0.95);
    }
  }

  function snakePoints(body, prevBody, alpha) {
    return body.map((c, i) => {
      const x = cx(c);
      const y = cy(c);
      if (!prevBody?.length) return [x, y];
      const p = prevBody[Math.min(i, prevBody.length - 1)];
      const px = cx(p);
      const py = cy(p);
      if (Math.abs(px - x) + Math.abs(py - y) > cell * 1.5) return [x, y];
      return [px + (x - px) * alpha, py + (y - py) * alpha];
    });
  }

  function strokeBody(points, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach(([x, y], i) => {
      const prev = points[i - 1];
      if (!prev || Math.abs(prev[0] - x) + Math.abs(prev[1] - y) > cell * 1.5) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (points.length === 1) ctx.lineTo(points[0][0] + 0.01, points[0][1]);
    ctx.stroke();
  }

  function drawSnakes(snap, prev, alpha, now, me) {
    snap.sn.forEach((s, k) => {
      if (!s.a || !s.b.length) return;
      const points = snakePoints(s.b, prev?.sn[k]?.a ? prev.sn[k].b : null, alpha);
      const color = SNAKE_COLORS[k];
      if (s.sh && Math.floor(now / 110) % 2) ctx.globalAlpha = 0.45;

      strokeBody(points, cell * 0.78, theme.dark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)");
      strokeBody(points, cell * 0.66, color);

      const [hx, hy] = points[0];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(hx, hy, cell * 0.44, 0, Math.PI * 2);
      ctx.fill();

      const [dx, dy] = EYE_OFFSET[s.d];
      for (const side of [-1, 1]) {
        const ex = hx + dx * cell * 0.14 + dy * side * cell * 0.18;
        const ey = hy + dy * cell * 0.14 - dx * side * cell * 0.18;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(ex, ey, cell * 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(ex + dx * cell * 0.05, ey + dy * cell * 0.05, cell * 0.065, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (s.cf) {
        ctx.save();
        ctx.translate(hx, hy - cell * 0.7);
        ctx.rotate(now / 200);
        drawEmoji("💫", 0, 0, cell * 0.8);
        ctx.restore();
      }
      if (me === k && snap.ph === "intro" && snap.sn.length > 1) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(hx, hy, cell * (0.8 + 0.15 * Math.sin(now / 120)), 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  function drawEnemies(snap, prev, alpha) {
    snap.en.forEach(([kind, x, y], i) => {
      let fx = x;
      let fy = y;
      const before = prev?.en[i];
      if (before && before[0] === kind && Math.abs(before[1] - x) + Math.abs(before[2] - y) <= 1) {
        fx = before[1] + (x - before[1]) * alpha;
        fy = before[2] + (y - before[2]) * alpha;
      }
      const size = kind === "boss" ? 2 : 1;
      drawEmoji(ENEMY_EMOJI[kind], (fx + size / 2) * cell, (fy + size / 2) * cell, cell * size * 1.12);
    });
  }

  function drawDarkness(snap, radius) {
    const g = shade.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, COLS * cell, ROWS * cell);
    g.fillStyle = theme.dark ? "rgba(4,5,9,0.96)" : "rgba(20,18,30,0.93)";
    g.fillRect(0, 0, COLS * cell, ROWS * cell);
    g.globalCompositeOperation = "destination-out";
    for (const s of snap.sn) {
      if (!s.a || !s.b.length) continue;
      const x = cx(s.b[0]);
      const y = cy(s.b[0]);
      const r = radius * cell;
      const light = g.createRadialGradient(x, y, r * 0.35, x, y, r);
      light.addColorStop(0, "rgba(0,0,0,1)");
      light.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = light;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.drawImage(shade, 0, 0, COLS * cell, ROWS * cell);
  }

  function drawBanner({ emoji, title, sub }) {
    const w = COLS * cell;
    const h = ROWS * cell;
    ctx.fillStyle = theme.dark ? "rgba(13,14,18,0.72)" : "rgba(245,242,234,0.78)";
    ctx.fillRect(0, 0, w, h);
    drawEmoji(emoji, w / 2, h / 2 - cell * 3, cell * 3.4);
    ctx.fillStyle = theme.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(cell * 1.35)}px ${theme.font}`;
    ctx.fillText(title, w / 2, h / 2 + cell * 0.4, w - cell * 2);
    if (sub) {
      ctx.fillStyle = theme.muted;
      ctx.font = `600 ${Math.round(cell * 0.78)}px ${theme.font}`;
      wrapText(sub, w / 2, h / 2 + cell * 1.9, w - cell * 3, cell * 1.05);
    }
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = word;
        y += lineHeight;
      } else line = test;
    }
    ctx.fillText(line, x, y);
  }

  function draw(snap, prev, alpha, { me = 0, banner = null } = {}) {
    if (!ctx) return;
    const now = performance.now();
    syncLevel(snap);
    drawFloor();
    drawWalls(snap, now);
    drawPortals(now);
    drawItems(snap, now);
    drawSnakes(snap, prev?.lv === snap.lv ? prev : null, alpha, now, me);
    drawEnemies(snap, prev?.lv === snap.lv ? prev : null, alpha);
    const dark = LEVELS[snap.lv].dark;
    if (dark && snap.ph === "play") drawDarkness(snap, dark);
    if (banner) drawBanner(banner);
  }

  return { resize, draw, readTheme };
}
