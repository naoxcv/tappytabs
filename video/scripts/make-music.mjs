// Synthesizes the launch video's background music: a bright, bouncy, baby-sensory
// style loop (marimba lead, glockenspiel sparkle, plucky bass, kick/clap/shaker).
// Original and deterministic, so there is nothing to license. Writes public/audio/bgm.wav.
//
//   node scripts/make-music.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const SR = 44100;
const BPM = 120;
const BEAT = 60 / BPM; // 0.5 s = 15 video frames
const BAR = BEAT * 4; // 2 s
const DURATION = 38;
const N = SR * DURATION;
const L = new Float32Array(N);
const R = new Float32Array(N);

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Deterministic noise for the percussion.
let seed = 1;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 31 - 1;
};

function add(t0, len, pan, gain, fn) {
  const s0 = Math.floor(t0 * SR);
  const n = Math.floor(len * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n && s0 + i < N; i++) {
    const v = fn(i / SR);
    L[s0 + i] += v * gl;
    R[s0 + i] += v * gr;
  }
}

const attack = (t, a = 0.003) => Math.min(1, t / a);

// Wooden mallet: fundamental plus the marimba's 4x partial, quick decay.
const marimba = (t0, midi, gain = 0.32, pan = -0.25) => {
  const f = hz(midi);
  add(t0, 1.1, pan, gain, (t) =>
    attack(t) * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 5) + 0.35 * Math.sin(2 * Math.PI * f * 4 * t) * Math.exp(-t * 18)),
  );
};

// Glockenspiel: inharmonic metal partials, long shimmer.
const glock = (t0, midi, gain = 0.12, pan = 0.35) => {
  const f = hz(midi);
  add(t0, 2.2, pan, gain, (t) =>
    attack(t, 0.001) *
    (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2.2) +
      0.4 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 4) +
      0.2 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t * 7)),
  );
};

// Round, bouncy bass: sine plus a little 2nd harmonic, plucked envelope.
const bass = (t0, midi, gain = 0.42) => {
  const f = hz(midi);
  add(t0, 0.45, 0, gain, (t) =>
    attack(t, 0.005) * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t * 6),
  );
};

const kick = (t0, gain = 0.55) => {
  let ph = 0;
  add(t0, 0.3, 0, gain, (t) => {
    ph += (2 * Math.PI * (48 + 90 * Math.exp(-t * 30))) / SR;
    return Math.sin(ph) * Math.exp(-t * 11);
  });
};

// Clap: three quick noise bursts, band-limited with a one-pole filter.
const clap = (t0, gain = 0.2) => {
  let lp = 0;
  add(t0, 0.25, 0.1, gain, (t) => {
    lp += 0.45 * (noise() - lp);
    const bursts = [0, 0.012, 0.024].reduce((m, o) => m + (t >= o ? Math.exp(-(t - o) * 90) : 0), 0);
    return lp * (bursts * 0.5 + Math.exp(-t * 22));
  });
};

// Shaker: high-passed noise tick.
const shaker = (t0, gain = 0.07) => {
  let prev = 0;
  add(t0, 0.08, 0.45, gain, (t) => {
    const x = noise();
    const hp = x - prev;
    prev = x;
    return hp * attack(t, 0.008) * Math.exp(-t * 55);
  });
};

// Little upward "bloop" for the closing title.
const bloop = (t0, from, to, gain = 0.16) => {
  let ph = 0;
  add(t0, 0.28, 0, gain, (t) => {
    ph += (2 * Math.PI * hz(from + (to - from) * Math.min(1, t / 0.12))) / SR;
    return Math.sin(ph) * attack(t, 0.004) * Math.exp(-t * 9);
  });
};

// --- Harmony and melodies (MIDI, one entry per eighth note, null = rest) ---
const CHORDS = {
  C: [60, 64, 67],
  F: [65, 69, 72],
  G: [67, 71, 74],
  Am: [69, 72, 76],
};
const ROOT = { C: 36, F: 41, G: 43, Am: 45 };

const A = [
  ["C", [76, 79, 84, 79, 76, null, 79, null]],
  ["F", [77, 81, 84, 81, 77, null, 81, null]],
  ["G", [79, 83, 86, 83, 79, 81, 83, 86]],
  ["C", [84, null, 79, null, 84, null, null, null]],
];
const B = [
  ["Am", [81, null, 84, null, 88, null, 84, null]],
  ["F", [81, null, 77, null, 81, 84, 81, null]],
  ["C", [79, null, 76, null, 79, null, 84, null]],
  ["G", [83, null, 86, null, 83, 81, 79, null]],
];

// Bar plan, 2 s per bar, following the storyboard:
// 0-6 s intro while agents peek, 6-14 s groove for the gathering,
// 14-22 s softer B under the conversation, 22-30 s A with sparkle for the decision,
// 30-32 s B lift, 32-34 s turnaround, 34 s final cadence as the TappyTabs title lands.
const plan = [
  { chord: "C", part: "intro" },
  { chord: "F", part: "intro" },
  { chord: "G", part: "intro" },
  ...A.map(([chord, mel]) => ({ chord, mel, part: "groove" })),
  ...B.map(([chord, mel]) => ({ chord, mel, part: "soft" })),
  ...A.map(([chord, mel]) => ({ chord, mel, part: "sparkle" })),
  ...B.slice(0, 1).map(([chord, mel]) => ({ chord, mel, part: "sparkle" })),
  { chord: "G", part: "turn" },
  { chord: "C", part: "end" },
];

plan.forEach((bar, b) => {
  const t = b * BAR;
  const notes = CHORDS[bar.chord];
  const root = ROOT[bar.chord];
  const e = (i) => t + i * (BEAT / 2);

  if (bar.part === "intro") {
    // Twinkly broken chord, growing a little each bar.
    const arp = [0, 1, 2, 1, 0, 1, 2, 1].map((k, i) => notes[k] + 12 + (i >= 4 && b > 0 ? 12 * (k === 2) : 0));
    arp.forEach((m, i) => marimba(e(i), m, 0.18 + b * 0.04));
    if (b >= 1) for (let i = 0; i < 8; i++) shaker(e(i), 0.04);
    if (b === 2) [0, 2, 4, 6].forEach((i, k) => glock(e(4 + k), 84 + [0, 2, 4, 7][k], 0.08));
    return;
  }

  if (bar.part === "turn" || bar.part === "end") {
    if (bar.part === "turn") {
      [79, 81, 83, 86].forEach((m, i) => marimba(e(i * 2), m, 0.3));
      [0, 1, 2, 3].forEach((i) => kick(t + i * BEAT));
      [1, 3].forEach((i) => clap(t + i * BEAT));
      [0, 2].forEach((i) => bass(t + i * BEAT, root));
      [0, 1, 2, 3, 4, 5, 6, 7].forEach((i) => shaker(e(i)));
      bloop(e(7), 72, 84);
    } else {
      // Final C: one big hit, then a slow glock arpeggio ringing out under the title.
      kick(t);
      bass(t, 36, 0.5);
      [60, 64, 67, 72].forEach((m) => marimba(t, m, 0.22, 0));
      [84, 88, 91, 96].forEach((m, i) => glock(t + i * 0.25, m, 0.12));
      [0, 1, 2].forEach((k) => glock(t + 1.6 + k * 0.8, [79, 84, 88][k], 0.07));
      // Gentle lullaby taps keep the hold on the title alive until the fade.
      [2, 3, 4, 5, 6, 7].forEach((i) => {
        const ch = i < 4 ? CHORDS.C : i < 6 ? CHORDS.F : CHORDS.C;
        ch.forEach((m) => marimba(t + i * BEAT, m + 12, 0.09, 0));
        bass(t + i * BEAT, i < 4 || i > 5 ? 48 : 53, 0.16);
        shaker(t + i * BEAT + BEAT / 2, 0.035);
      });
      glock(t + 3.5, 96, 0.06);
    }
    return;
  }

  const soft = bar.part === "soft";
  // Melody.
  bar.mel.forEach((m, i) => m && marimba(e(i), m, soft ? 0.24 : 0.32));
  if (bar.part === "sparkle") bar.mel.forEach((m, i) => m && i % 2 === 0 && glock(e(i), m + 12, 0.07));
  // Offbeat chord stabs.
  [1, 3, 5, 7].forEach((i) => notes.forEach((m) => marimba(e(i), m, soft ? 0.05 : 0.07, 0.2)));
  // Bouncy octave bass.
  [0, 2, 4, 6].forEach((i, k) => bass(e(i), root + (k % 2 ? 12 : 0), soft ? 0.32 : 0.42));
  // Drums: four-on-the-floor softened in the conversation.
  [0, 1, 2, 3].forEach((i) => (!soft || i % 2 === 0) && kick(t + i * BEAT, soft ? 0.4 : 0.55));
  [1, 3].forEach((i) => clap(t + i * BEAT, soft ? 0.12 : 0.2));
  for (let i = 0; i < 8; i++) shaker(e(i), i % 2 ? 0.07 : 0.045);
});

// Short room: two feedback delays per channel, kept subtle.
function room(buf, d1, d2) {
  const a = Math.floor(d1 * SR);
  const b = Math.floor(d2 * SR);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] + (i >= a ? 0.28 * out[i - a] : 0) * 0.6 + (i >= b ? 0.22 * out[i - b] : 0) * 0.6;
  }
  for (let i = 0; i < buf.length; i++) buf[i] = 0.82 * buf[i] + 0.18 * out[i];
}
room(L, 0.043, 0.071);
room(R, 0.051, 0.083);

// Fade out the last second, normalize to -1 dBFS, write 16-bit stereo WAV.
let peak = 0;
for (let i = 0; i < N; i++) {
  const fade = Math.min(1, (N - i) / SR);
  L[i] *= fade;
  R[i] *= fade;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.89 / peak;
const data = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  data.writeInt16LE(Math.round(Math.tanh(L[i] * norm) * 32767), i * 4);
  data.writeInt16LE(Math.round(Math.tanh(R[i] * norm) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(SR, 24);
header.writeUInt32LE(SR * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(data.length, 40);
mkdirSync(new URL("../public/audio/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/audio/bgm.wav", import.meta.url), Buffer.concat([header, data]));
console.log(`bgm.wav: ${DURATION}s, ${plan.length} bars @ ${BPM} BPM, peak scaled ${norm.toFixed(2)}x`);
