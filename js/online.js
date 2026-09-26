import { t } from "./i18n.js";
import { showOverlay } from "./ui.js";

// Everything that arrives from the other phone is untrusted: anyone can open
// the console and send any JSON down the data channel. Games read message
// fields only through these checks, never by trusting a shape.
export const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
export const isNum = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
export const oneOf = (value, allowed) => allowed.includes(value);

export function bindRoom(room, { badge, overlay, onMessage, onClose, fallback }) {
  badge.hidden = false;
  badge.textContent = `${t("net.online")} · ${room.code}`;
  room.on("message", (message) => {
    if (message && typeof message === "object" && typeof message.t === "string") onMessage(message);
  });
  room.on("close", () => {
    badge.hidden = true;
    onClose?.();
    showOverlay(overlay, {
      emoji: "🔌",
      title: t("net.lost"),
      text: t("net.lostText"),
      actions: [{ label: fallback.label, primary: true, onClick: fallback.onClick }, homeAction()],
    });
  });
}

export function homeAction(room) {
  return {
    label: t("home"),
    onClick: () => {
      room?.leave();
      location.href = "./";
    },
  };
}
