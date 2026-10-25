import React from "react";
import { Agent } from "../characters/Agent";
import { AgentName } from "../characters/data";

const still = { rot: 0, sx: 1, sy: 1, lookX: 0, lookY: 0, blink: 0 };

/** Small static agent faces in a row, overlapping like the app's avatar stacks. */
export const Faces: React.FC<{ names: AgentName[]; id: string; px?: number }> = ({ names, id, px = 40 }) => {
  const step = px * 0.75;
  const w = step * (names.length - 1) + px;
  return (
    <svg width={w} height={px} viewBox={`0 0 ${w} ${px}`} style={{ overflow: "visible", flexShrink: 0 }}>
      {names.map((n, i) => (
        <Agent key={n} id={`${id}-${n}`} name={n} pose={{ ...still, x: px / 2 + i * step, y: px * 0.95, size: px * 2.1 }} />
      ))}
    </svg>
  );
};
