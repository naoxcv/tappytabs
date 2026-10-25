import React from "react";
import { COLORS, FONTS } from "../theme";

export const Headline: React.FC<{ text: string; y: number; opacity: number; size?: number }> = ({
  text,
  y,
  opacity,
  size = 92,
}) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: y,
      transform: "translateY(-50%)",
      textAlign: "center",
      opacity,
      color: COLORS.cream,
      fontFamily: FONTS.heading,
      fontWeight: 800,
      fontSize: size,
      letterSpacing: -1.5,
    }}
  >
    {text}
  </div>
);
