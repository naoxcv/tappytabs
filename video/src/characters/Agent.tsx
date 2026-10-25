import React from "react";
import { ART, AgentName, PERSONALITY, PIVOT } from "./data";

export type Pose = {
  x: number; // feet position in frame px
  y: number;
  size: number; // rendered width of the 1024 viewBox
  rot: number; // deg, around the feet
  sx: number;
  sy: number;
  lookX: number; // -1..1
  lookY: number;
  blink: number; // 0 open .. 1 closed
  opacity?: number;
};

// Video eyes read smaller than the demo cards, so travel is boosted.
const EYE_TRAVEL = 1.8;

/** One character as an SVG group. Eyes are cut out of the base layer by a mask, as in the demo. */
export const Agent: React.FC<{ name: AgentName; pose: Pose; id: string }> = ({ name, pose, id }) => {
  const art = ART[name];
  const er = PERSONALITY[name].er * EYE_TRAVEL;
  const s = pose.size / 1024;
  const eyeSy = 1 - 0.92 * pose.blink;
  const maskId = `eyes-${id}`;
  return (
    <g
      opacity={pose.opacity ?? 1}
      transform={`translate(${pose.x} ${pose.y}) rotate(${pose.rot}) scale(${s * pose.sx} ${s * pose.sy}) translate(${-PIVOT.x} ${-PIVOT.y})`}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-200} y={-200} width={1424} height={1424}>
          <rect x={-200} y={-200} width={1424} height={1424} fill="#fff" />
          {art.eyes.map((e, i) => (
            <path
              key={i}
              d={e.d}
              fill="#000"
              transform={`translate(${pose.lookX * er} ${pose.lookY * er * 0.8}) translate(${e.cx} ${e.cy}) scale(${1 + (1 - eyeSy) * 0.18} ${eyeSy}) translate(${-e.cx} ${-e.cy})`}
            />
          ))}
        </mask>
      </defs>
      {art.layers.map((l, i) => (
        <path key={i} d={l.d} fill={l.fill} fillRule="evenodd" mask={i === 0 ? `url(#${maskId})` : undefined} />
      ))}
    </g>
  );
};
