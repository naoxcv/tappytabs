import React from "react";
import { DINER_AGENTS, DINERS, dollars, SHARED, TABLE_TOTAL_CENTS } from "../story";
import { COLORS, FONTS } from "../theme";
import { CheckBadge } from "./CheckBadge";
import { Faces } from "./Face";

// Fixed geometry so scenes can aim cards and gazes at individual rows.
export const PANEL = { x: 640, y: 225, w: 640, h: 705 };
const TABLE_ROW_TOP = [124, 184];
const DINER_ROW_TOP = [292, 372, 452, 532];
export const tableRowCenter = (i: number) => ({ x: PANEL.x + PANEL.w / 2, y: PANEL.y + TABLE_ROW_TOP[i] + 30 });
export const dinerRowCenter = (i: number) => ({ x: PANEL.x + PANEL.w / 2, y: PANEL.y + DINER_ROW_TOP[i] + 38 });

export type PanelState = {
  appear: number;
  tableIn: number[];
  dinerIn: number[];
  highlight: number[];
  reason: number[];
  check: number[];
  confirmed: number; // footer crossfade to "Everyone confirmed"
};

const label: React.CSSProperties = {
  position: "absolute",
  left: 28,
  fontSize: 19,
  fontWeight: 600,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: COLORS.creamMuted,
};

const Row: React.FC<{ top: number; height: number; t: number; hi?: number; children: React.ReactNode }> = ({
  top,
  height,
  t,
  hi = 0,
  children,
}) => (
  <div
    style={{
      position: "absolute",
      left: 14,
      right: 14,
      top,
      height,
      padding: "0 14px",
      borderRadius: 12,
      display: "flex",
      alignItems: "center",
      gap: 16,
      opacity: t,
      transform: `translateY(${10 * (1 - t)}px)`,
      background: `rgba(255, 245, 219, ${0.09 * hi})`,
    }}
  >
    {children}
  </div>
);

/** The app's group order (GroupOrderView): shared dishes, each diner's pick, table total. */
export const GroupOrderPanel: React.FC<{ s: PanelState }> = ({ s }) => (
  <div
    style={{
      position: "absolute",
      left: PANEL.x,
      top: PANEL.y,
      width: PANEL.w,
      height: PANEL.h,
      borderRadius: 16,
      background: COLORS.bgRaised,
      border: `2px solid ${COLORS.creamLine}`,
      boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
      color: COLORS.cream,
      fontFamily: FONTS.body,
      opacity: s.appear,
      transform: `scale(${0.96 + 0.04 * s.appear})`,
    }}
  >
    <div style={{ position: "absolute", left: 28, right: 28, top: 26, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <span style={{ fontFamily: FONTS.heading, fontWeight: 800, fontSize: 40 }}>Group order</span>
      <span style={{ fontSize: 20, color: COLORS.creamMuted }}>Tappy Kitchen</span>
    </div>
    <div style={{ ...label, top: 92 }}>For the table</div>
    {SHARED.map((d, i) => (
      <Row key={d.dish} top={TABLE_ROW_TOP[i]} height={60} t={s.tableIn[i]}>
        <span style={{ fontSize: 26, fontWeight: 600, flex: 1 }}>{d.dish}</span>
        <Faces names={DINER_AGENTS} id={`panel-shared-${i}`} px={34} />
        <span style={{ fontSize: 24, fontWeight: 700, width: 56, textAlign: "right" }}>{dollars(d.priceCents)}</span>
      </Row>
    ))}
    <div style={{ ...label, top: 258 }}>Everyone&rsquo;s picks</div>
    {DINERS.map((d, i) => (
      <Row key={d.name} top={DINER_ROW_TOP[i]} height={76} t={s.dinerIn[i]} hi={s.highlight[i]}>
        <Faces names={[d.agent]} id={`panel-diner-${i}`} px={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 600, whiteSpace: "nowrap" }}>
            <span style={{ color: COLORS.creamMuted, fontWeight: 500 }}>{d.name} · </span>
            {d.dish}
          </div>
          <div style={{ fontSize: 18, color: "#9fd39a", height: 24 * s.reason[i], opacity: s.reason[i], overflow: "hidden" }}>
            {d.reason}
          </div>
        </div>
        <span style={{ fontSize: 24, fontWeight: 700, width: 56, textAlign: "right" }}>{dollars(d.priceCents)}</span>
        <div style={{ position: "relative", width: 40, height: 40 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 20, border: `2px solid ${COLORS.creamLine}` }} />
          <CheckBadge x={20} y={20} size={40} progress={s.check[i]} />
        </div>
      </Row>
    ))}
    <div style={{ position: "absolute", left: 28, right: 28, top: 628, borderTop: `2px solid ${COLORS.creamLine}` }} />
    <div style={{ position: "absolute", left: 28, right: 28, top: 646, display: "flex", justifyContent: "space-between", fontSize: 26 }}>
      <span style={{ position: "relative" }}>
        <span style={{ opacity: 1 - s.confirmed, color: COLORS.creamMuted }}>Waiting for everyone to confirm</span>
        <span style={{ position: "absolute", left: 0, top: 0, opacity: s.confirmed, fontWeight: 700, whiteSpace: "nowrap" }}>Everyone confirmed</span>
      </span>
      <span style={{ fontWeight: 700 }}>Table total {dollars(TABLE_TOTAL_CENTS)}</span>
    </div>
  </div>
);
