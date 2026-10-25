import React from "react";
import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";
import { Agent } from "../characters/Agent";
import { AgentName, CAST } from "../characters/data";
import { ActorScript, computePoses, LookTarget, Placement } from "../characters/pose";
import { ORDER, TABLE } from "../layouts";
import { ease, mix, quad, sp, Vec } from "../motion/motion";
import { DINERS } from "../story";
import { COLORS, VIDEO } from "../theme";
import { CheckBadge } from "../ui/CheckBadge";
import { DishCard, DISHES } from "../ui/DishCard";
import { dinerRowCenter, GroupOrderPanel, PanelState, PANEL, tableRowCenter } from "../ui/GroupOrderPanel";
import { Headline } from "../ui/Headline";
import { CARD_TARGETS, cardFloat, CONVERSATION_FRAMES } from "./Conversation";
import { ENTRANCE_FRAMES } from "./Entrance";

export const DECISION_FRAMES = 240;
const CLOCK = ENTRANCE_FRAMES + CONVERSATION_FRAMES;

// Curry becomes Maya's line; edamame and fries become the shared lines.
const CARD_DEST = [dinerRowCenter(0), tableRowCenter(0), tableRowCenter(1)];
const HIGHLIGHT = [60, 80, 100, 120];
const CHECK = [150, 158, 166, 174];
const CONFIRMED_AT = 184;
const HEADLINE_AT = 178;
const PANEL_CENTER: Vec = { x: PANEL.x + PANEL.w / 2, y: PANEL.y + PANEL.h / 2 };

// Where each diner's own check pops: just above and right of its head.
const HEAD_TOP: Record<AgentName, number> = { tomato: 0.62, mushroom: 0.67, bokchoy: 0.8, garlic: 0.78, cat: 0.76 };
export const headCheck = (n: AgentName, p: Placement): Vec => ({ x: p.x + p.size * 0.2, y: p.y - p.size * (HEAD_TOP[n] + 0.06) });

const toOrder =
  (n: AgentName, start: number, ctrl?: Vec) =>
  (f: number): Placement => {
    const a = TABLE[n];
    const b = ORDER[n];
    const w = sp(f, start, { damping: 14, stiffness: 80, duration: 40 });
    const p = quad(a, ctrl ?? { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 140 }, b, w);
    return { ...p, size: mix(a.size, b.size, Math.min(1, w)) };
  };

const row = (i: number): LookTarget => ({ at: dinerRowCenter(i) });
const reviewLooks: [number, LookTarget][] = [[50, { at: PANEL_CENTER }], ...HIGHLIGHT.map((h, i): [number, LookTarget] => [h, row(i)]), [146, { at: PANEL_CENTER }]];

const diner = (n: AgentName, i: number, start: number, from: LookTarget, buddy: AgentName): ActorScript => ({
  path: toOrder(n, start),
  looks: [[0, from], [start + 2, "travel"], ...reviewLooks, [CHECK[i] + 12, buddy]],
  lifts: [[0, 0], [HIGHLIGHT[i], -14], [HIGHLIGHT[i] + 22, 0]],
  hops: [{ at: CHECK[i], height: 40 }],
});

const SCRIPTS: Record<AgentName, ActorScript> = {
  tomato: diner("tomato", 0, 4, { at: CARD_TARGETS[0] }, "bokchoy"),
  mushroom: diner("mushroom", 1, 12, { at: CARD_TARGETS[1] }, "garlic"),
  bokchoy: { ...diner("bokchoy", 2, 8, { at: CARD_TARGETS[2] }, "tomato"), nods: [200] },
  garlic: { ...diner("garlic", 3, 16, { at: CARD_TARGETS[2] }, "mushroom"), blinks: [196, 203] },
  cat: {
    // Arcs up and right, around the panel rather than across it.
    path: toOrder("cat", 20, { x: 1420, y: 230 }),
    looks: [[0, { dir: { x: 0, y: 1 } }], [22, "travel"], [58, { at: PANEL_CENTER }], [146, "tomato"], [158, "mushroom"], [166, "bokchoy"], [174, "garlic"], [190, { at: PANEL_CENTER }]],
    nods: [196],
    slowBlinks: [118],
  },
};

/** Panel and badge state for a frame; Closing reads the final one. */
export const panelState = (frame: number): PanelState => ({
  appear: ease(frame, 4, 24),
  tableIn: [ease(frame, 20, 10), ease(frame, 24, 10)],
  dinerIn: [ease(frame, 22, 10), ease(frame, 30, 10), ease(frame, 36, 10), ease(frame, 42, 10)],
  highlight: HIGHLIGHT.map((h) => ease(frame, h, 6) * (1 - ease(frame, h + 20, 6))),
  reason: HIGHLIGHT.map((h) => ease(frame, h, 8)),
  check: CHECK.map((c) => sp(frame, c, { damping: 10, stiffness: 180 })),
  confirmed: ease(frame, CONFIRMED_AT, 10),
});

export const Decision: React.FC = () => {
  const frame = useCurrentFrame();
  const poses = computePoses(frame, SCRIPTS, CLOCK);
  const cam = 1 + 0.1 * ease(frame, 50, 22) - 0.1 * ease(frame, 140, 26);
  const head = ease(frame, HEADLINE_AT, 22);
  const panel = panelState(frame);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: "960px 580px" }}>
        <GroupOrderPanel s={panel} />
        {DISHES.map((d, i) => {
          const t = ease(frame, i * 3, 26, Easing.inOut(Easing.cubic));
          const fade = 1 - ease(frame, 16 + i * 3, 12);
          if (fade <= 0) return null;
          const a = CARD_TARGETS[i];
          const b = CARD_DEST[i];
          return (
            <div
              key={d.name}
              style={{
                position: "absolute",
                left: mix(a.x, b.x, t),
                top: mix(a.y, b.y, t) + cardFloat(CONVERSATION_FRAMES + frame, i) * (1 - t),
                opacity: fade,
                transform: `translate(-50%, -50%) rotate(${a.rot * (1 - t)}deg) scale(${1 - 0.45 * t})`,
              }}
            >
              <DishCard dish={d} id={`dec-card-${i}`} safe={1} />
            </div>
          );
        })}
        <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          {CAST.map((n) => (
            <Agent key={n} id={`dec-${n}`} name={n} pose={poses[n]!} />
          ))}
        </svg>
        {DINERS.map((d, i) => {
          const at = headCheck(d.agent, poses[d.agent]!);
          return <CheckBadge key={d.name} x={at.x} y={at.y} progress={panel.check[i]} />;
        })}
      </AbsoluteFill>
      <Headline text={"Your tastes. Everyone\u2019s choice."} y={118 + 14 * (1 - head)} opacity={head} size={80} />
    </AbsoluteFill>
  );
};
