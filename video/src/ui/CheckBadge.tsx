import React from "react";
import { COLORS } from "../theme";

/** Cream disc with a charcoal check; `progress` may overshoot for a springy pop. */
export const CheckBadge: React.FC<{ x: number; y: number; size?: number; progress: number }> = ({
  x,
  y,
  size = 56,
  progress,
}) =>
  progress <= 0.001 ? null : (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        transform: `scale(${progress})`,
        opacity: Math.min(1, progress * 2),
        overflow: "visible",
      }}
    >
      <circle cx={28} cy={28} r={28} fill={COLORS.cream} />
      <path
        d="M16 29 L24.5 37 L40 20"
        fill="none"
        stroke={COLORS.bg}
        strokeWidth={6}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={40}
        strokeDashoffset={40 * (1 - Math.min(1, progress))}
      />
    </svg>
  );
