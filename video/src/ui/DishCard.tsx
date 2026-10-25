import React from "react";
import { Img, staticFile } from "remotion";
import { AgentName } from "../characters/data";
import { COLORS, FONTS } from "../theme";
import { Faces } from "./Face";

export type Dish = {
  name: string;
  detail: string;
  priceCents: number;
  tag: "Spicy" | "To share";
  for: AgentName[];
};

// Sample dishes from the app's mock menu (ios/TappyTabs/Core/Mocks). None contain shellfish.
export const DISHES: Dish[] = [
  { name: "Tofu Green Curry", detail: "Coconut curry, jasmine rice", priceCents: 1700, tag: "Spicy", for: ["tomato"] },
  { name: "Salted Edamame", detail: "Sea salt, steamed", priceCents: 700, tag: "To share", for: ["tomato", "mushroom", "bokchoy", "garlic"] },
  { name: "Truffle Fries", detail: "Parmesan, herbs", priceCents: 900, tag: "To share", for: ["tomato", "mushroom", "bokchoy", "garlic"] },
];

export const CARD_W = 270;

/** Recommendation card: tag, dish, price, and the agents it's for. */
export const DishCard: React.FC<{
  dish: Dish;
  id: string;
  safe: number; // 0..1 reveal of the "No shellfish" check
}> = ({ dish, id, safe }) => (
  <div
    style={{
      width: CARD_W,
      padding: "16px 20px 14px",
      borderRadius: 16,
      background: COLORS.bgRaised,
      border: `2px solid ${COLORS.creamLine}`,
      color: COLORS.cream,
      fontFamily: FONTS.body,
      boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 17, fontWeight: 600, color: COLORS.creamMuted }}>
      {dish.tag === "Spicy" ? <Img src={staticFile("icons/spice.svg")} style={{ width: 30, height: 30, margin: -4 }} /> : null}
      {dish.tag}
    </div>
    <div style={{ fontFamily: FONTS.heading, fontWeight: 700, fontSize: 28, marginTop: 6, lineHeight: 1.1 }}>{dish.name}</div>
    <div style={{ fontSize: 17, color: COLORS.creamMuted, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dish.detail}</div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
      <Faces names={dish.for} id={id} />
      <div style={{ fontSize: 24, fontWeight: 700 }}>${(dish.priceCents / 100).toFixed(0)}</div>
    </div>
    <div
      style={{
        marginTop: 6 * safe,
        height: 28 * safe,
        opacity: safe,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 17,
        fontWeight: 600,
        color: "#9fd39a",
      }}
    >
      <span style={{ fontSize: 20 }}>✓</span> No shellfish
    </div>
  </div>
);
