import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Agent } from "../characters/Agent";
import { AgentName, CAST } from "../characters/data";
import { ActorScript, computePoses, LookTarget, Placement } from "../characters/pose";
import { LINEUP, ORDER } from "../layouts";
import { ease, mix, quad, sp } from "../motion/motion";
import { DINER_AGENTS, DINERS, DISH_COUNT, dollars, TABLE_TOTAL_CENTS } from "../story";
import { COLORS, FONTS, VIDEO } from "../theme";
import { CheckBadge } from "../ui/CheckBadge";
import { Faces } from "../ui/Face";
import { GroupOrderPanel, PANEL } from "../ui/GroupOrderPanel";
import { Headline } from "../ui/Headline";
import { CONVERSATION_FRAMES } from "./Conversation";
import { DECISION_FRAMES, headCheck, panelState } from "./Decision";
import { ENTRANCE_FRAMES } from "./Entrance";

export const CLOSING_FRAMES = 210;
const CLOCK = ENTRANCE_FRAMES + CONVERSATION_FRAMES + DECISION_FRAMES;
const COLLAPSE_AT = 8;
const CARD_OUT_AT = 84;
const TITLE_AT = 100;
const forward: LookTarget = { dir: { x: 0, y: 0.15 } };
const upward: LookTarget = { dir: { x: 0, y: -0.55 } };

const toLineup =
  (n: AgentName, start: number) =>
  (f: number): Placement => {
    const a = ORDER[n];
    const b = LINEUP[n];
    const w = sp(f, start, { damping: 14, stiffness: 90, duration: 36 });
    const p = quad(a, { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 260 }, b, w);
    return { ...p, size: mix(a.size, b.size, Math.min(1, w)) };
  };

const SCRIPTS: Record<AgentName, ActorScript> = {
  bokchoy: { path: toLineup("bokchoy", 24), looks: [[0, "tomato"], [24, "travel"], [64, upward], [122, forward]] },
  tomato: {
    path: toLineup("tomato", 30),
    looks: [[0, "bokchoy"], [30, "travel"], [70, upward], [124, forward], [150, "garlic"], [170, forward]],
    hops: [{ at: 182, height: 30 }],
  },
  mushroom: { path: toLineup("mushroom", 36), looks: [[0, "garlic"], [36, "travel"], [76, upward], [126, forward]], nods: [176] },
  garlic: {
    path: toLineup("garlic", 42),
    looks: [[0, "mushroom"], [42, "travel"], [82, upward], [128, forward], [152, "tomato"], [170, forward]],
    blinks: [158, 165],
  },
  // Chef cat joins last and takes the centre spot.
  cat: {
    path: toLineup("cat", 56),
    looks: [[0, { at: { x: PANEL.x + PANEL.w / 2, y: PANEL.y + PANEL.h / 2 } }], [56, "travel"], [96, upward], [130, forward]],
    hops: [{ at: 98, height: 36 }],
    slowBlinks: [190],
  },
};

const OrderConfirmed: React.FC<{ y: number; opacity: number; scale: number }> = ({ y, opacity, scale }) => (
  <div
    style={{
      position: "absolute",
      left: 960,
      top: y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity,
      display: "flex",
      alignItems: "center",
      gap: 26,
      padding: "30px 38px",
      borderRadius: 16,
      background: COLORS.bgRaised,
      border: `2px solid ${COLORS.creamLine}`,
      boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
      color: COLORS.cream,
      fontFamily: FONTS.body,
      whiteSpace: "nowrap",
    }}
  >
    <div style={{ position: "relative", width: 72, height: 72 }}>
      <CheckBadge x={36} y={36} size={72} progress={1} />
    </div>
    <div>
      <div style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 48 }}>Order confirmed</div>
      <div style={{ fontSize: 24, color: COLORS.creamMuted, marginTop: 4 }}>
        {DISH_COUNT} dishes · Table total {dollars(TABLE_TOTAL_CENTS)} · Sent to the restaurant
      </div>
    </div>
    <Faces names={DINER_AGENTS} id="closing-card" px={46} />
  </div>
);

export const Closing: React.FC = () => {
  const frame = useCurrentFrame();
  const poses = computePoses(frame, SCRIPTS, CLOCK);
  const last = panelState(DECISION_FRAMES - 1);
  const collapse = ease(frame, COLLAPSE_AT, 24);
  const cardOut = ease(frame, CARD_OUT_AT, 18);
  const title = ease(frame, TITLE_AT, 24);
  const tagline = ease(frame, TITLE_AT + 14, 24);
  const badges = 1 - ease(frame, 14, 12);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <Headline text={"Your tastes. Everyone’s choice."} y={118} opacity={1 - ease(frame, 0, 18)} size={80} />
      {collapse < 1 ? (
        <div style={{ position: "absolute", inset: 0, opacity: 1 - collapse, transform: `scale(${1 - 0.3 * collapse})`, transformOrigin: "960px 520px" }}>
          <GroupOrderPanel s={last} />
        </div>
      ) : null}
      {collapse > 0 && cardOut < 1 ? (
        <OrderConfirmed y={500 - 60 * cardOut} opacity={collapse * (1 - cardOut)} scale={0.85 + 0.15 * collapse} />
      ) : null}
      <Headline text="TappyTabs" y={455 + 16 * (1 - title)} opacity={title} size={150} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 585 + 12 * (1 - tagline),
          textAlign: "center",
          opacity: tagline,
          color: COLORS.cream,
          fontFamily: FONTS.body,
          fontWeight: 500,
          fontSize: 44,
        }}
      >
        Tap in. Let your agents talk.
      </div>
      <svg width={VIDEO.width} height={VIDEO.height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {CAST.map((n) => (
          <Agent key={n} id={`close-${n}`} name={n} pose={poses[n]!} />
        ))}
      </svg>
      {DINERS.map((d) => {
        const at = headCheck(d.agent, poses[d.agent]!);
        return <CheckBadge key={d.name} x={at.x} y={at.y} progress={badges} />;
      })}
    </AbsoluteFill>
  );
};
