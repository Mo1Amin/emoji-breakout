import { load, save } from "./storage.js";

let muted = load("arcade.muted", false);
let audio;

const clips = {
  start: "sounds/start.wav",
  levelUp: "sounds/fun.wav",
  fail: "sounds/fail.wav",
  turbo: "sounds/fire.wav",
  bloom: "sounds/rr.wav",
};

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = value;
  save("arcade.muted", muted);
}

export function playClip(name, volume = 0.6) {
  if (muted) return;
  const clip = new Audio(clips[name]);
  clip.volume = volume;
  clip.play().catch(() => {});
}

// Short synthesized blips for events that fire many times a second, where
// starting a new <audio> element each time would stutter on phones.
export function blip(freq, duration = 0.08, type = "square", volume = 0.06) {
  if (muted) return;
  audio ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audio.state === "suspended") audio.resume();
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  const now = audio.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export const sfx = {
  eat: () => blip(520, 0.09, "triangle", 0.12),
  gold: () => (blip(660, 0.08, "triangle", 0.12), setTimeout(() => blip(990, 0.12, "triangle", 0.12), 70)),
  hit: () => blip(220, 0.05, "square", 0.05),
  brick: () => blip(440 + Math.random() * 200, 0.06, "square", 0.05),
  power: () => blip(780, 0.15, "sine", 0.12),
  crash: () => blip(110, 0.3, "sawtooth", 0.08),
  flip: () => blip(360, 0.05, "sine", 0.08),
  match: () => blip(700, 0.12, "triangle", 0.1),
  drop: () => blip(300, 0.07, "triangle", 0.1),
  revive: () => (blip(440, 0.1, "sine", 0.12), setTimeout(() => blip(880, 0.18, "sine", 0.12), 90)),
};
