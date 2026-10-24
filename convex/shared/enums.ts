// CONTRACT (milestone 1). Co-owned by Role 3 and Role 4.
// Changing anything here after milestone 1 needs a thumbs-up from every role that consumes it.
import { v } from "convex/values";

export const ALLERGENS = [
  "milk", "egg", "fish", "shellfish", "tree_nut", "peanut",
  "wheat", "soy", "sesame", "gluten",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const DIETS = ["vegetarian", "vegan", "halal", "no_pork"] as const;
export type Diet = (typeof DIETS)[number];

export const HUNGERS = ["snack", "normal", "starving"] as const;
export type Hunger = (typeof HUNGERS)[number];
export const HUNGER_WEIGHT: Record<Hunger, number> = { snack: 0.5, normal: 1, starving: 1.5 };

export const STATUSES = ["checkin", "hunger", "negotiating", "pick", "confirm", "placed"] as const;
export type Status = (typeof STATUSES)[number];

export const ALLERGEN_LEVELS = ["contains", "may_contain", "not_detected"] as const;
export type AllergenLevel = (typeof ALLERGEN_LEVELS)[number];

export const PERSONALITIES = ["adventurous", "picky", "budget_minded"] as const;
export type Personality = (typeof PERSONALITIES)[number];

/** "tagged": the normalizer read the item. "untagged": it could not, so agents never recommend it. */
export const TAG_STATUSES = ["tagged", "untagged"] as const;
export type TagStatus = (typeof TAG_STATUSES)[number];

export const JOIN_VIA = ["uwb", "qr", "sim"] as const;
export type JoinVia = (typeof JOIN_VIA)[number];

export const allergenV = v.union(...ALLERGENS.map((a) => v.literal(a)));
export const dietV = v.union(...DIETS.map((d) => v.literal(d)));
export const hungerV = v.union(...HUNGERS.map((h) => v.literal(h)));
export const statusV = v.union(...STATUSES.map((s) => v.literal(s)));
export const levelV = v.union(...ALLERGEN_LEVELS.map((l) => v.literal(l)));
export const personalityV = v.union(...PERSONALITIES.map((p) => v.literal(p)));
export const tagStatusV = v.union(...TAG_STATUSES.map((t) => v.literal(t)));
export const joinViaV = v.union(...JOIN_VIA.map((j) => v.literal(j)));

/** Timing constants shared by the backend and documented for the clients. */
export const TIMING = {
  stepTimeoutMs: 8_000,
  rescueAfterMs: 30_000,
  ingestTimeoutMs: 20_000,
  bubbleGapMs: 1_800,
  firstBubbleDelayMs: 250,
  bubbleEndHoldMs: 1_500,
  pickWindowMs: 45_000,
  confirmWindowMs: 45_000,
} as const;

export const BUBBLE_MAX_CHARS = 120;
