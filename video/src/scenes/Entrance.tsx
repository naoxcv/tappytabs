import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Agent } from "../characters/Agent";
import { ACCENT, AgentName, ART, CAST, PIVOT } from "../characters/data";
import { ActorScript, computePoses, Placement } from "../characters/pose";
import { ROW, TABLE } from "../layouts";
import { bump, clamp, ease, mix, quad, sp, Spring, Vec } from "../motion/motion";
import { COLORS, VIDEO } from "../theme";
import { Chip } from "../ui/Chip";
import { Headline } from "../ui/Headline";

export const ENTRANCE_FRAMES = 330;

type Entry = {
  peekAt: number;
  show: number; // px of the agent above the bottom edge, measured from its eye line
  peekSpring: Spring;
  riseAt: number;
  swoopAt: number;
  ctrl: Vec; // swoop curve control point
};

// Arrival order: tomato, mushroom, then bok choy, garlic, and chef cat last.
const ENTER: Record<AgentName, Entry> = {
  tomato: { peekAt: 30, show: 86, peekSpring: { damping: 11, stiffness: 120 }, riseAt: 184, swoopAt: 205, ctrl: { x: 640, y: 560 } },
  mushroom: { peekAt: 58, show: 175, peekSpring: { damping: 22, stiffness: 55 }, riseAt: 188, swoopAt: 224, ctrl: { x: 1100, y: 760 } },
  bokchoy: { peekAt: 120, show: 110, peekSpring: { damping: 10, stiffness: 170 }, riseAt: 180, swoopAt: 218, ctrl: { x: 500, y: 760 } },
  garlic: { peekAt: 132, show: 104, peekSpring: { damping: 8, stiffness: 180 }, riseAt: 192, swoopAt: 212, ctrl: { x: 1300, y: 560 } },
  cat: { peekAt: 146, show: 165, peekSpring: { damping: 13, stiffness: 90 }, riseAt: 196, swoopAt: 236, ctrl: { x: 1250, y: 320 } },
};

const SWOOP: Spring = { damping: 13, stiffness: 80, duration: 46 };
const RISE: Spring = { damping: 12, stiffness: 140 };

const entrancePath =
  (name: AgentName) =>
  (f: number): Placement => {
    const e = ENTER[name];
    const row = ROW[name];
    const table = TABLE[name];
    const w = sp(f, e.swoopAt, SWOOP);
    const size = mix(row.size, table.size, clamp(w, 0, 1));
    const hiddenY = VIDEO.height + row.size * 0.85;
    const peekY = VIDEO.height - e.show + (PIVOT.y - ART[name].eyeLine) * (row.size / 1024);
    let y = mix(hiddenY, peekY, sp(f, e.peekAt, e.peekSpring));
    y = mix(y, row.y, sp(f, e.riseAt + 5, RISE)) + 16 * bump(f, e.riseAt, 10);
    const p = quad(row, e.ctrl, table, w);
    return { x: p.x, y: p.y + (y - row.y), size };
  };

const up = { dir: { x: 0.05, y: -1 } };
const SCRIPTS: Record<AgentName, ActorScript> = {
  tomato: {
    path: entrancePath("tomato"),
    looks: [[0, up], [90, "mushroom"], [128, "bokchoy"], [150, "cat"], [205, "travel"], [250, "cat"], [314, { at: { x: 960, y: 700 } }]],
    tilts: [[0, 0], [90, 7], [124, 0]],
    lifts: [[0, 0], [272, -14], [284, 0]],
    blinks: [64, 104, 111],
  },
  mushroom: {
    path: entrancePath("mushroom"),
    looks: [[0, { dir: { x: -0.2, y: -0.9 } }], [93, "tomato"], [126, "bokchoy"], [154, "cat"], [224, "travel"], [266, "cat"], [312, "tomato"]],
    tilts: [[0, 0], [95, -5], [126, 0]],
    lifts: [[0, 0], [282, -12], [294, 0]],
    nods: [104],
    blinks: [140],
  },
  bokchoy: {
    path: entrancePath("bokchoy"),
    looks: [[0, { dir: { x: -0.8, y: -0.6 } }], [131, { dir: { x: 0.9, y: -0.4 } }], [142, "tomato"], [156, "cat"], [218, "travel"], [262, "cat"], [313, "tomato"]],
    tilts: [[0, 0], [130, -6], [142, 4], [160, 0]],
    lifts: [[0, 0], [292, -12], [304, 0]],
    nods: [270],
  },
  garlic: {
    path: entrancePath("garlic"),
    looks: [[0, { dir: { x: -1, y: -0.2 } }], [139, { dir: { x: 1, y: -0.2 } }], [145, { dir: { x: -0.9, y: 0 } }], [152, "cat"], [212, "travel"], [256, "cat"], [315, "tomato"]],
    tilts: [[0, 0], [150, 5], [170, 0]],
    nods: [262],
    blinks: [158, 165],
  },
  cat: {
    path: entrancePath("cat"),
    looks: [[0, { dir: { x: -0.6, y: -0.5 } }], [162, "mushroom"], [172, "tomato"], [236, "travel"], [276, { dir: { x: 0, y: 0.7 } }], [312, "tomato"]],
    hops: [{ at: 284, height: 48 }],
    slowBlinks: [298],
  },
};

const CHIPS: { owner: AgentName; label: string; at: number; place: (p: Placement) => Vec; origin: "left" | "right" | "bottom" }[] = [
  { owner: "tomato", label: "Loves spicy", at: 272, origin: "left", place: (p) => ({ x: p.x + p.size * 0.36, y: p.y - p.size * 0.36 }) },
  { owner: "mushroom", label: "Something to share", at: 282, origin: "bottom", place: (p) => ({ x: p.x + p.size * 0.12, y: p.y - p.size * 0.8 }) },
  { owner: "bokchoy", label: "No shellfish", at: 292, origin: "bottom", place: (p) => ({ x: p.x - p.size * 0.1, y: p.y - p.size * 0.85 }) },
];
const CHIPS_OUT = 314;

export const Entrance: React.FC = () => {
  const frame = useCurrentFrame();
  const poses = computePoses(frame, SCRIPTS);
  const headIn = ease(frame, 10, 26);
  const headOut = ease(frame, 165, 20);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <Headline
        text="Different tastes. One table."
        y={330 + 18 * (1 - headIn) - 24 * headOut}
        opacity={headIn * (1 - headOut)}
      />
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0 }}>
        {CAST.map((n) => (
          <Agent key={n} id={`entrance-${n}`} name={n} pose={poses[n]!} />
        ))}
      </svg>
      {CHIPS.map((c) => {
        const pose = poses[c.owner]!;
        const pos = c.place(pose);
        const progress = ease(frame, c.at, 9) * (1 - ease(frame, CHIPS_OUT, 12));
        return progress > 0 ? (
          <Chip key={c.label} label={c.label} accent={ACCENT[c.owner]} x={pos.x} y={pos.y} progress={progress} origin={c.origin} />
        ) : null;
      })}
    </AbsoluteFill>
  );
};
