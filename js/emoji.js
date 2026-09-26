const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const MAX_CACHED = 600;
const bitmaps = new Map();

// Rasterising emoji text is slow enough to drop frames on phones, so each
// emoji is drawn once per device-pixel size and reused as a bitmap.
function bitmap(emoji, px) {
  const key = `${emoji}|${px}`;
  let image = bitmaps.get(key);
  if (!image) {
    if (bitmaps.size > MAX_CACHED) bitmaps.clear();
    image = document.createElement("canvas");
    image.width = image.height = px;
    const g = image.getContext("2d");
    g.font = `${px * 0.82}px ${EMOJI_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(emoji, px / 2, px / 2 + px * 0.06);
    bitmaps.set(key, image);
  }
  return image;
}

export function drawEmoji(ctx, emoji, x, y, size, angle = 0) {
  // hypot, not the raw a component: a canvas turned upside down (the hockey
  // guest's view) has a negative a, which would shrink every emoji to nothing.
  const { a, b } = ctx.getTransform();
  const px = Math.max(4, Math.round(size * Math.hypot(a, b)));
  const image = bitmap(emoji, px);
  if (!angle) return ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(image, -size / 2, -size / 2, size, size);
  ctx.restore();
}
