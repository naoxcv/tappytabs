import { Easing, interpolate, random, spring, SpringConfig } from "remotion";
import { VIDEO } from "../theme";

export type Vec = { x: number; y: number };
export type Spring = Partial<SpringConfig> & { duration?: number };

/** 0→1 spring that starts at `start`. Pure function of the frame. */
export const sp = (frame: number, start: number, cfg: Spring = {}) => {
  const { duration, ...config } = cfg;
  return spring({ frame: frame - start, fps: VIDEO.fps, config, durationInFrames: duration });
};

/** Value that springs from key to key; each key adds its delta with its own spring. */
export const springTrack = (frame: number, keys: [number, number][], cfg: Spring = {}) =>
  keys.reduce((acc, [f, v], i) => (i === 0 ? v : acc + (v - keys[i - 1][1]) * sp(frame, f, cfg)), 0);

/** Eased 0→1 over [start, start + dur], clamped. Used for type and UI. */
export const ease = (frame: number, start: number, dur: number, easing = Easing.inOut(Easing.cubic)) =>
  interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

/** Half-sine bump: 0 → 1 → 0 across [start, start + dur]. */
export const bump = (frame: number, start: number, dur: number) => {
  const t = (frame - start) / dur;
  return t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t);
};

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Quadratic Bézier; t may overshoot past 1 from springs and extrapolates along the end tangent. */
export const quad = (a: Vec, c: Vec, b: Vec, t: number): Vec => {
  if (t > 1) {
    const e = quad(a, c, b, 1);
    return { x: e.x + (b.x - c.x) * 2 * (t - 1), y: e.y + (b.y - c.y) * 2 * (t - 1) };
  }
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
};

/** Deterministic blink start frames from a seed, plus any scripted ones. */
export const blinkSchedule = (
  seed: string,
  intervalSec: [number, number],
  doubleChance: number,
  totalFrames: number,
  scripted: number[] = [],
) => {
  const out = [...scripted];
  let f = Math.round(random(`${seed}-first`) * intervalSec[0] * VIDEO.fps) + 12;
  for (let i = 0; f < totalFrames; i++) {
    if (!scripted.some((s) => Math.abs(s - f) < 20)) {
      out.push(f);
      if (random(`${seed}-dbl-${i}`) < doubleChance) out.push(f + 7);
    }
    f += Math.round(mix(intervalSec[0], intervalSec[1], random(`${seed}-gap-${i}`)) * VIDEO.fps);
  }
  return out;
};

export const blinkAt = (frame: number, starts: number[], dur = 5) =>
  starts.reduce((m, s) => Math.max(m, bump(frame, s, dur)), 0);
