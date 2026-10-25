import React from "react";
import { COLORS, FONTS } from "../theme";

/**
 * Cream bubble whose tail tip sits exactly on (x, y), the point just above or
 * beside the speaker, so the bubble stays anchored as the speaker moves.
 */
export const SpeechBubble: React.FC<{
  text: string;
  x: number;
  y: number;
  side: "top" | "right";
  shift?: number; // slide the bubble body sideways (px) while the tail stays put
  progress: number; // 0 hidden .. 1 shown (may overshoot slightly)
}> = ({ text, x, y, side, shift = 0, progress }) => {
  const top = side === "top";
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity: Math.min(1, progress * 1.6),
        transform: `scale(${0.7 + 0.3 * progress})`,
        transformOrigin: "0 0",
      }}
    >
      <div
        style={{
          position: "absolute",
          ...(top ? { left: 0, bottom: 22, transform: `translateX(calc(-50% + ${shift}px))` } : { left: 22, top: 0, transform: "translateY(-50%)" }),
          padding: "22px 34px",
          borderRadius: 34,
          background: COLORS.cream,
          color: COLORS.bg,
          fontFamily: FONTS.body,
          fontWeight: 600,
          fontSize: 36,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </div>
      <svg
        width={44}
        height={30}
        style={{
          position: "absolute",
          ...(top ? { left: -22, top: -30 } : { left: -8, top: -22, transform: "rotate(90deg)" }),
          overflow: "visible",
        }}
      >
        <path d="M0 0 L44 0 L22 28 Z" fill={COLORS.cream} />
      </svg>
    </div>
  );
};
