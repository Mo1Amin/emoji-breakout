import { t } from "./i18n.js";
import { Room, normalizeCode } from "./room.js";
import { el, toast } from "./ui.js";

// Resolves with how the player chose to play:
//   { mode: <local choice id> } or { mode: "host" | "guest", room }
export function openLobby({ game, localChoices }) {
  return new Promise((resolve) => {
    const backdrop = el("div", "sheet-backdrop");
    const sheet = el("div", "sheet");
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    backdrop.append(sheet);
    document.body.append(backdrop);

    let pendingRoom = null;
    let cancelled = false;

    const finish = (result) => {
      backdrop.remove();
      history.replaceState(null, "", location.pathname);
      resolve(result);
    };

    const render = (...children) => {
      sheet.innerHTML = "";
      sheet.append(el("div", "grip"), ...children);
    };

    const choice = (ico, title, hint, onClick) => {
      const btn = el("button", "choice");
      const icon = el("span", "ico", ico);
      const text = el("span");
      text.append(el("b", "", title), el("small", "", hint));
      btn.append(icon, text);
      btn.addEventListener("click", onClick);
      return btn;
    };

    const backButton = () => {
      const btn = el("button", "btn btn-block", t("lobby.back"));
      btn.addEventListener("click", () => {
        cancelled = true;
        pendingRoom?.leave();
        pendingRoom = null;
        showPick();
      });
      return btn;
    };

    function showPick() {
      cancelled = false;
      const title = el("h2", "", t("lobby.title"));
      const list = localChoices.map((c) => choice(c.ico, c.title, c.hint, () => finish({ mode: c.id })));
      render(
        title,
        ...list,
        choice("📡", t("lobby.host"), t("lobby.hostHint"), showHost),
        choice("🔑", t("lobby.join"), t("lobby.joinHint"), () => showJoin()),
      );
      list[0]?.focus();
    }

    function showHost() {
      cancelled = false;
      const code = el("div", "code-display", "····");
      const share = el("button", "btn btn-primary btn-block", t("lobby.share"));
      share.disabled = true;
      const status = el("div", "waiting");
      status.append(el("span", "", t("lobby.creating")), dots());
      render(el("h2", "", t("lobby.hostTitle")), el("p", "", t("lobby.hostText")), code, share, status, backButton());

      Room.host(game, (room) => {
        if (cancelled) return room.leave();
        pendingRoom = room;
        code.textContent = room.code;
        share.disabled = false;
        status.firstChild.textContent = t("lobby.waiting");
        share.onclick = () => shareRoom(room.code);
      })
        .then((room) => {
          if (cancelled) return room.leave();
          pendingRoom = null;
          finish({ mode: "host", room });
        })
        .catch((err) => {
          if (cancelled) return;
          status.innerHTML = "";
          status.append(el("span", "", t(`lobby.err.${err.message}`)));
        });
    }

    function showJoin(prefill = "") {
      cancelled = false;
      const input = el("input", "code-input");
      input.maxLength = 4;
      input.autocomplete = "off";
      input.autocapitalize = "characters";
      input.spellcheck = false;
      input.inputMode = "text";
      input.setAttribute("aria-label", t("lobby.codeLabel"));
      input.value = prefill;
      const go = el("button", "btn btn-primary btn-block", t("lobby.connect"));
      const status = el("div", "waiting");

      const connect = () => {
        const value = normalizeCode(input.value);
        if (value.length !== 4) {
          status.textContent = t("lobby.err.short");
          return input.focus();
        }
        go.disabled = true;
        input.disabled = true;
        status.innerHTML = "";
        status.append(el("span", "", t("lobby.connecting")), dots());
        Room.join(game, value)
          .then((room) => {
            if (cancelled) return room.leave();
            finish({ mode: "guest", room });
          })
          .catch((err) => {
            if (cancelled) return;
            go.disabled = false;
            input.disabled = false;
            status.textContent = t(`lobby.err.${err.message}`);
          });
      };

      input.addEventListener("input", () => (input.value = normalizeCode(input.value)));
      input.addEventListener("keydown", (e) => e.key === "Enter" && connect());
      go.addEventListener("click", connect);
      render(el("h2", "", t("lobby.joinTitle")), el("p", "", t("lobby.joinText")), input, go, status, backButton());
      if (prefill.length === 4) connect();
      else input.focus();
    }

    const linkCode = normalizeCode(new URLSearchParams(location.search).get("room") ?? "");
    if (linkCode.length === 4) showJoin(linkCode);
    else showPick();
  });
}

function dots() {
  const wrap = el("span", "dots");
  wrap.append(el("i"), el("i"), el("i"));
  return wrap;
}

async function shareRoom(code) {
  const url = `${location.origin}${location.pathname}?room=${code}`;
  const text = t("lobby.shareText", { code });
  if (navigator.share) {
    try {
      await navigator.share({ title: document.title, text, url });
      return;
    } catch (err) {
      if (err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast(t("lobby.copied"));
  } catch {
    toast(code);
  }
}
