import { applyTranslations, getLang, setLang, t } from "./i18n.js";
import { isMuted, setMuted } from "./sfx.js";

const soundOn =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const soundOff =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>';
const backIcon =
  '<svg class="flip-rtl" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18 9 12l6-6"/></svg>';

export function initChrome() {
  applyTranslations();

  for (const btn of document.querySelectorAll('[data-action="sound"]')) {
    const paint = () => {
      btn.innerHTML = isMuted() ? soundOff : soundOn;
      btn.setAttribute("aria-label", t(isMuted() ? "unmute" : "mute"));
    };
    paint();
    btn.addEventListener("click", () => {
      setMuted(!isMuted());
      paint();
    });
  }

  for (const btn of document.querySelectorAll('[data-action="lang"]')) {
    const paint = () => {
      btn.textContent = getLang() === "ar" ? "EN" : "ع";
      btn.setAttribute("aria-label", t("switchLang"));
    };
    paint();
    btn.addEventListener("click", () => {
      setLang(getLang() === "ar" ? "en" : "ar");
      paint();
    });
  }

  for (const link of document.querySelectorAll("[data-back]")) link.innerHTML = backIcon;
}

export function toast(message) {
  document.querySelector(".toast")?.remove();
  const node = el("div", "toast", message);
  node.setAttribute("role", "status");
  document.body.append(node);
  setTimeout(() => node.remove(), 2500);
}

export function showOverlay(overlay, { emoji, eyebrow, title, text, actions }) {
  overlay.innerHTML = "";
  const card = el("div", "card");
  if (emoji) card.append(el("div", "big-emoji", emoji));
  if (eyebrow) card.append(el("div", "eyebrow", eyebrow));
  card.append(el("h2", "", title));
  if (text) card.append(el("p", "", text));
  const row = el("div", "actions");
  for (const action of actions) {
    const btn = el("button", `btn btn-block${action.primary ? " btn-primary" : ""}`, action.label);
    btn.addEventListener("click", action.onClick);
    row.append(btn);
  }
  card.append(row);
  overlay.append(card);
  overlay.hidden = false;
  row.querySelector(".btn-primary")?.focus({ preventScroll: true });
}

export function hideOverlay(overlay) {
  overlay.hidden = true;
  overlay.innerHTML = "";
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function isTouch() {
  return window.matchMedia("(pointer: coarse)").matches;
}

// Canvas games cannot use CSS variables directly, so they read the resolved
// colours and re-read them when the system theme flips.
export function readTheme() {
  const css = getComputedStyle(document.body);
  const value = (name) => css.getPropertyValue(name).trim();
  return {
    dark: css.colorScheme !== "light",
    surface: value("--surface"),
    surface2: value("--surface-2"),
    line: value("--line"),
    text: value("--text"),
    muted: value("--muted"),
    accent: value("--accent"),
    danger: value("--danger"),
    game: value("--game"),
    font: value("--font"),
  };
}

export function onThemeChange(fn) {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", fn);
}

// Canvas backing store sized to the device pixel ratio so emoji stay sharp.
export function fitCanvas(canvas, width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
