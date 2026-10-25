import { random } from "remotion";
import { VIDEO } from "../theme";
import { blinkAt, blinkSchedule, bump, clamp, ease, springTrack, Spring, Vec } from "../motion/motion";
import { ART, AgentName, PERSONALITY, PIVOT } from "./data";
import type { Pose } from "./Agent";

export type Placement = { x: number; y: number; size: number };

/** Where an agent looks: another agent, a screen point, a direction, or along its own motion. */
export type LookTarget = AgentName | "travel" | { at: Vec } | { dir: Vec };

/**
 * Everything a scene scripts for one agent. Only `path` is required; the rest
 * layer on top of it: idle breathing/sway, velocity stretch, landing squash,
 * gaze, tilts, nods, hops and blinks, all derived from the frame.
 */
export type ActorScript = {
  path: (frame: number) => Placement;
  looks?: [number, LookTarget][];
  tilts?: [number, number][];
  lifts?: [number, number][];
  nods?: number[];
  hops?: { at: number; height?: number }[];
  blinks?: number[];
  slowBlinks?: number[];
  tiltSpring?: Spring;
  liftSpring?: Spring;
};

const GAZE_BLEND = 6;
const HOP_AIR = 13;

const eyePoint = (name: AgentName, p: Placement): Vec => ({
  x: p.x,
  y: p.y - (PIVOT.y - ART[name].eyeLine) * (p.size / 1024),
});

const norm = (v: Vec, reach: number): Vec => {
  const d = Math.hypot(v.x, v.y) || 1;
  const k = clamp(d / reach, 0.35, 1);
  return { x: (v.x / d) * k, y: (v.y / d) * k };
};

/** Hop offset (px, up is negative) and the squash/stretch that goes with it. */
const hopAt = (frame: number, at: number, height: number) => {
  const t = (frame - at) / HOP_AIR;
  const air = t > 0 && t < 1 ? 4 * t * (1 - t) : 0;
  const squash = 0.11 * bump(frame, at - 5, 6) + 0.13 * bump(frame, at + HOP_AIR - 1, 9);
  const stretch = t > 0 && t < 1 ? 0.08 * Math.abs(1 - 2 * t) * (t < 0.5 ? 1 : 0.6) : 0;
  return { dy: -height * air, def: stretch - squash };
};

export function computePoses(
  frame: number,
  scripts: Partial<Record<AgentName, ActorScript>>,
  /** Frame where this scene starts in the full video. Idle motion and random
   * blinks run on that global clock so scene hand-offs don't jump. */
  clock = 0,
): Partial<Record<AgentName, Pose>> {
  const names = Object.keys(scripts) as AgentName[];
  const placements = Object.fromEntries(names.map((n) => [n, scripts[n]!.path(frame)])) as Record<
    AgentName,
    Placement
  >;
  const out: Partial<Record<AgentName, Pose>> = {};

  for (const name of names) {
    const s = scripts[name]!;
    const p = PERSONALITY[name];
    const cur = placements[name];
    const prev = s.path(frame - 1);
    const prev2 = s.path(frame - 2);
    const vx = cur.x - prev.x;
    const vy = cur.y - prev.y;
    const speed = Math.hypot(vx, vy);
    const prevSpeed = Math.hypot(prev.x - prev2.x, prev.y - prev2.y);
    const sqScale = p.sq / 0.12;

    // Stretch with speed, squash when braking (landings, spring settles).
    let def = Math.min(0.1, speed * 0.0024) * sqScale - clamp((prevSpeed - speed) * 0.02, 0, 0.12) * sqScale;
    let dy = 0;

    for (const h of s.hops ?? []) {
      const r = hopAt(frame, h.at, h.height ?? 40);
      dy += r.dy;
      def += r.def * sqScale;
    }
    for (const n of s.nods ?? []) {
      const b = bump(frame, n, 10);
      dy += 7 * b;
      def -= 0.05 * b;
    }
    dy += s.lifts ? springTrack(frame, s.lifts, s.liftSpring ?? { damping: 12, stiffness: 140 }) : 0;
    def = clamp(def, -0.14, 0.14);

    // Gaze: blend from the previous look to the current one over a few frames.
    const eye = eyePoint(name, cur);
    const resolve = (t: LookTarget): Vec => {
      if (t === "travel") return speed > 1.5 ? norm({ x: vx, y: vy }, 20) : { x: 0, y: 0 };
      if (typeof t === "string") {
        const o = eyePoint(t, placements[t] ?? scripts[t]?.path(frame) ?? cur);
        return norm({ x: o.x - eye.x, y: o.y - eye.y }, 260);
      }
      if ("at" in t) return norm({ x: t.at.x - eye.x, y: t.at.y - eye.y }, 260);
      return t.dir;
    };
    let look: Vec = { x: 0, y: 0 };
    const looks = s.looks ?? [];
    for (let i = 0; i < looks.length; i++) {
      const [f, target] = looks[i];
      if (frame < f) break;
      const k = i === 0 && f <= 0 ? 1 : ease(frame, f, GAZE_BLEND);
      const v = resolve(target);
      look = { x: look.x + (v.x - look.x) * k, y: look.y + (v.y - look.y) * k };
    }

    const g = frame + clock;
    const scripted = [...(s.blinks ?? []), ...(s.slowBlinks ?? [])].map((b) => b + clock);
    const blinks = blinkSchedule(name, p.bk, p.db, g + 30, scripted);
    const blink = Math.max(blinkAt(g, blinks), blinkAt(frame, s.slowBlinks ?? [], 10));

    const t = g / VIDEO.fps + random(`${name}-phase`) * 6;
    const breathe = p.br * Math.sin(t * p.bs);
    const sway = p.sw * Math.sin(t * p.bs * 0.6);
    const tilt = s.tilts ? springTrack(frame, s.tilts, s.tiltSpring ?? { damping: 14, stiffness: 120 }) : 0;
    const lean = clamp(vx * 0.32, -12, 12);

    const sy = 1 + def + breathe;
    out[name] = {
      x: cur.x,
      y: cur.y + dy,
      size: cur.size,
      rot: sway + p.ln * look.x + tilt + lean,
      sx: 1 - def * 0.6 - breathe * 0.5,
      sy,
      lookX: look.x,
      lookY: look.y,
      blink,
    };
  }
  return out;
}
