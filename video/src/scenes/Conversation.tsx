import React from "react";
import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { Agent } from "../characters/Agent";
import { AgentName, CAST } from "../characters/data";
import { ActorScript, computePoses, LookTarget, Placement } from "../characters/pose";
import { TABLE } from "../layouts";
import { ease, mix, sp, Vec } from "../motion/motion";
import { COLORS, VIDEO } from "../theme";
import { DishCard, DISHES } from "../ui/DishCard";
import { SpeechBubble } from "../ui/SpeechBubble";
import { ENTRANCE_FRAMES } from "./Entrance";

export const CONVERSATION_FRAMES = 360;

// Where the dish cards settle; Decision picks them up from here.
export const CARD_TARGETS: (Vec & { rot: number })[] = [
  { x: 690, y: 560, rot: -4 },
  { x: 960, y: 645, rot: 0 },
  { x: 1230, y: 560, rot: 4 },
];
const CARD_FROM: Vec = { x: 960, y: 400 };
/** Idle bob of a settled card; Decision continues it so the hand-off doesn't jump. */
export const cardFloat = (frame: number, i: number) => 4 * Math.sin((frame + i * 20) / 16);
const CARDS_AT = 296;
const SAFE_AT = [318, 330, 342];

const card = (i: number): LookTarget => ({ at: CARD_TARGETS[i] });
const seated = (n: AgentName) => () => TABLE[n];

// One speaker at a time; everyone else turns to them.
const SCRIPTS: Record<AgentName, ActorScript> = {
  tomato: {
    path: seated("tomato"),
    looks: [[0, { at: { x: 960, y: 700 } }], [16, "cat"], [52, "garlic"], [100, "mushroom"], [190, "bokchoy"], [280, "cat"], [318, card(0)]],
    lifts: [[0, 0], [8, -16], [95, 0]],
    tilts: [[0, 0], [8, 5], [95, 0], [212, -8], [250, 0]],
    hops: [{ at: 128, height: 36 }],
    blinks: [70],
  },
  mushroom: {
    path: seated("mushroom"),
    looks: [[0, "tomato"], [108, "tomato"], [142, "bokchoy"], [190, "bokchoy"], [280, "cat"], [322, card(1)]],
    lifts: [[0, 0], [100, -16], [185, 0]],
    tilts: [[0, 0], [30, -7], [80, 0], [100, -5], [185, 0]],
    nods: [244],
  },
  bokchoy: {
    path: seated("bokchoy"),
    looks: [[0, "tomato"], [100, "mushroom"], [196, "tomato"], [232, "garlic"], [282, "cat"], [314, card(0)], [326, card(1)], [338, card(2)]],
    lifts: [[0, 0], [190, -16], [275, 0]],
    tilts: [[0, 0], [190, 4], [275, 0]],
    nods: [350],
  },
  garlic: {
    path: seated("garlic"),
    looks: [[0, "tomato"], [100, "mushroom"], [190, "bokchoy"], [280, "cat"], [322, card(2)]],
    tilts: [[0, 0], [112, -5], [150, 0]],
    nods: [40, 54, 248],
    blinks: [200, 207],
  },
  cat: {
    path: seated("cat"),
    looks: [[0, "tomato"], [100, "mushroom"], [190, "bokchoy"], [292, { dir: { x: 0.2, y: 0.5 } }], [312, { dir: { x: 0, y: 1 } }]],
    lifts: [[0, 0], [280, -14], [336, 0]],
    hops: [{ at: 300, height: 52 }],
    slowBlinks: [134],
    nods: [238],
  },
};

const LINES: {
  who: AgentName;
  text: string;
  from: number;
  to: number;
  side: "top" | "right";
  anchor: (p: Placement) => Vec;
  shift?: number;
}[] = [
  { who: "tomato", text: "Something spicy for me.", from: 12, to: 92, side: "top", anchor: (p) => ({ x: p.x, y: p.y - p.size * 0.66 }) },
  { who: "mushroom", text: "And something we can share?", from: 104, to: 184, side: "top", shift: -120, anchor: (p) => ({ x: p.x, y: p.y - p.size * 0.72 }) },
  { who: "bokchoy", text: "Keep the shellfish allergy in mind.", from: 194, to: 274, side: "top", shift: 230, anchor: (p) => ({ x: p.x, y: p.y - p.size * 0.86 }) },
  { who: "cat", text: "I’ve got a plan.", from: 284, to: 346, side: "right", anchor: (p) => ({ x: p.x + p.size * 0.3, y: p.y - p.size * 0.45 }) },
];

export const Conversation: React.FC = () => {
  const frame = useCurrentFrame();
  const poses = computePoses(frame, SCRIPTS, ENTRANCE_FRAMES);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {DISHES.map((d, i) => {
        const t = ease(frame, CARDS_AT + i * 10, 24, Easing.out(Easing.cubic));
        if (t <= 0) return null;
        const to = CARD_TARGETS[i];
        const float = cardFloat(frame, i) * t;
        return (
          <div
            key={d.name}
            style={{
              position: "absolute",
              left: mix(CARD_FROM.x, to.x, t),
              top: mix(CARD_FROM.y, to.y, t) + float,
              opacity: Math.min(1, t * 2),
              transform: `translate(-50%, -50%) rotate(${to.rot * t}deg) scale(${0.5 + 0.5 * t})`,
            }}
          >
            <DishCard dish={d} id={`conv-card-${i}`} safe={ease(frame, SAFE_AT[i], 8)} />
          </div>
        );
      })}
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0 }}>
        {CAST.map((n) => (
          <Agent key={n} id={`conv-${n}`} name={n} pose={poses[n]!} />
        ))}
      </svg>
      {LINES.map((l) => {
        const progress = sp(frame, l.from, { damping: 14, stiffness: 170 }) * (1 - ease(frame, l.to, 8));
        if (progress <= 0.001) return null;
        const a = l.anchor(poses[l.who]!);
        return <SpeechBubble key={l.who} text={l.text} x={a.x} y={a.y} side={l.side} shift={l.shift} progress={progress} />;
      })}
    </AbsoluteFill>
  );
};
