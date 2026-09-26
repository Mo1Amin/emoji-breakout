// Two-player rooms over WebRTC. PeerJS's public broker only introduces the
// two browsers; after that the game traffic goes phone to phone, which is
// what lets the arcade stay a static site on GitHub Pages.
const PEERJS_URL = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PING_EVERY = 2000;
const DEAD_AFTER = 7000;

let peerLib;

function loadPeerJs() {
  peerLib ??= new Promise((resolve, reject) => {
    if (window.Peer) return resolve(window.Peer);
    const script = document.createElement("script");
    script.src = PEERJS_URL;
    script.onload = () => resolve(window.Peer);
    script.onerror = () => {
      peerLib = null;
      reject(new Error("network"));
    };
    document.head.append(script);
  });
  return peerLib;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function peerId(game, code) {
  return `emoji-arcade-${game}-${code}`.toLowerCase();
}

export function normalizeCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

export class Room {
  constructor(peer, isHost, code) {
    this.peer = peer;
    this.isHost = isHost;
    this.code = code;
    this.conn = null;
    this.handlers = new Map();
    this.lastSeen = 0;
    this.closed = false;
  }

  on(type, fn) {
    this.handlers.set(type, fn);
    return this;
  }

  emit(type, data) {
    this.handlers.get(type)?.(data);
  }

  send(message) {
    if (this.conn?.open) this.conn.send(message);
  }

  attach(conn) {
    this.conn = conn;
    this.lastSeen = Date.now();
    conn.on("data", (message) => {
      this.lastSeen = Date.now();
      if (message?.t !== "ping") this.emit("message", message);
    });
    conn.on("close", () => this.drop());
    conn.on("error", () => this.drop());
    // Data channels often go quiet instead of closing when a phone locks or
    // switches networks, so a missing heartbeat counts as a disconnect.
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastSeen > DEAD_AFTER) this.drop();
      else this.send({ t: "ping" });
    }, PING_EVERY);
  }

  drop() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    this.emit("close");
    this.destroy();
  }

  leave() {
    this.closed = true;
    this.destroy();
  }

  destroy() {
    clearInterval(this.heartbeat);
    try {
      this.conn?.close();
      this.peer?.destroy();
    } catch {}
  }

  static async host(game, onReady) {
    const Peer = await loadPeerJs();

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const peer = new Peer(peerId(game, code));
      const result = await new Promise((resolve) => {
        peer.on("open", () => resolve("open"));
        peer.on("error", (err) => resolve(err.type));
      });
      if (result === "unavailable-id") {
        peer.destroy();
        continue;
      }
      if (result !== "open") {
        peer.destroy();
        throw new Error(result === "browser-incompatible" ? "unsupported" : "network");
      }

      const room = new Room(peer, true, code);
      onReady?.(room);
      peer.on("disconnected", () => {
        if (!room.conn && !room.closed) peer.reconnect();
      });
      return new Promise((resolve) => {
        peer.on("connection", (conn) => {
          if (room.conn) {
            conn.on("open", () => {
              conn.send({ t: "full" });
              setTimeout(() => conn.close(), 300);
            });
            return;
          }
          conn.on("open", () => {
            room.attach(conn);
            resolve(room);
          });
        });
      });
    }
    throw new Error("network");
  }

  static async join(game, code) {
    const Peer = await loadPeerJs();
    const peer = new Peer();

    return new Promise((resolve, reject) => {
      const fail = (reason) => {
        clearTimeout(timer);
        peer.destroy();
        reject(new Error(reason));
      };
      const timer = setTimeout(() => fail("timeout"), 15000);

      peer.on("error", (err) => fail(err.type === "peer-unavailable" ? "noRoom" : "network"));
      peer.on("open", () => {
        const conn = peer.connect(peerId(game, code), { reliable: true, serialization: "json" });
        conn.on("open", () => {
          clearTimeout(timer);
          const room = new Room(peer, false, code);
          room.attach(conn);
          resolve(room);
        });
        conn.on("data", (message) => {
          if (message?.t === "full") fail("full");
        });
      });
    });
  }
}
