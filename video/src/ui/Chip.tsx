import React from "react";
import { COLORS, FONTS } from "../theme";

/** Preference chip, after the taste-profile tags: cream outline pill with the owner's accent dot. */
export const Chip: React.FC<{
  label: string;
  accent: string;
  x: number;
  y: number;
  progress: number; // 0 hidden .. 1 shown
  origin: "left" | "right" | "bottom";
}> = ({ label, accent, x, y, progress, origin }) => {
  const anchor = origin === "left" ? "0%" : origin === "right" ? "-100%" : "-50%";
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(${anchor}, -50%) scale(${0.86 + 0.14 * progress})`,
        transformOrigin: origin === "bottom" ? "50% 120%" : origin === "left" ? "0% 50%" : "100% 50%",
        opacity: progress,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 26px 14px 20px",
        borderRadius: 999,
        background: COLORS.bgRaised,
        border: `2px solid ${COLORS.creamLine}`,
        color: COLORS.cream,
        fontFamily: FONTS.body,
        fontWeight: 600,
        fontSize: 30,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 7, background: accent }} />
      {label}
    </div>
  );
};
