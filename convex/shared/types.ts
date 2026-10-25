// CONTRACT (milestone 1). Co-owned by Role 3 and Role 4.
// Pure agent code (convex/agents) works on these plain shapes, never on Convex ctx or Doc types,
// so it stays unit-testable. Convex docs satisfy them structurally (Id<...> is a string).
import { v } from "convex/values";
import type { Allergen, AllergenLevel, Diet, Personality, TagStatus } from "./enums";
import type { DishContrast, PairAnswer, TasteCorrection, TastePreference } from "../agents/taste";

export type MenuItemLite = {
  _id: string;
  name: string;
  category: string;
  cuisine?: string;
  tags: string[];
  description: string;
  priceCents: number;
  allergens: { allergen: Allergen; level: AllergenLevel }[];
  diet: Diet[];
  spice: number;
  isDrink: boolean;
  shareable: boolean;
  menuOrder: number;
  tagStatus: TagStatus;
  taste?: DishContrast[];
  priceVerified?: boolean;
  currency?: string;
};

export type UserLite = {
  _id: string;
  name: string;
  allergies: Allergen[];
  diet: Diet[];
  spice: number;
  likes: string[];
  dislikes: string[];
  ingredientLikes?: string[];
  ingredientAvoids?: string[];
  cuisines: string[];
  dislikedCuisines?: string[];
  personality?: Personality;
  pairAnswers?: PairAnswer[];
  tasteCorrections?: TasteCorrection[];
  taste?: TastePreference[];
  priceSensitivity?: "a_lot" | "somewhat" | "not_much";
  familiarity?: "familiar" | "open";
};

/** Role 3 returns these from draftStep; Role 4 pools and stores them. */
export type AgentDraft = {
  userId: string;
  mains: { itemId: string; reason: string }[]; // up to 3, ranked best first
  drink: { itemId: string; reason: string } | null;
  sharedProposals: string[]; // 0–2 item ids
  bubble: string; // ≤ 120 chars
  fallback: boolean;
};

export type AgentVote = {
  userId: string;
  yes: string[]; // subset of the pooled ids
  bubble: string;
  fallback: boolean;
};

export type ConversationMessage = {
  speakerId: string | null; // null = restaurant host
  kind: "proposal" | "reaction" | "safety";
  itemIds: string[];
  text: string;
};

export type Plan = {
  mains: { userId: string; itemId: string }[]; // each agent's rank-1, for the summary card
  shared: { itemId: string; qty: number; sharedBy: string[] }[];
  conversation: ConversationMessage[];
  summaryBubble: string;
  fallback: boolean;
};

export type FollowUpQuestion = { id: string; question: string; options: string[] };
export type FollowUpAnswer = { id: string; question: string; answer: string };

/** Profile as collected by onboarding, before it is saved. */
export type DraftProfile = {
  name: string;
  allergies: Allergen[];
  diet: Diet[];
  spice: number;
  likes: string[];
  dislikes: string[];
  ingredientLikes?: string[];
  ingredientAvoids?: string[];
  cuisines: string[];
  dislikedCuisines?: string[];
  likedCategories?: string[];
  pairAnswers?: PairAnswer[];
  tasteCorrections?: TasteCorrection[];
  priceSensitivity?: "a_lot" | "somewhat" | "not_much";
  familiarity?: "familiar" | "open";
};

// ---- Validators mirroring the types above (workflow step args/returns) ----

const pick = v.object({ itemId: v.string(), reason: v.string() });

export const agentDraftV = v.object({
  userId: v.string(),
  mains: v.array(pick),
  drink: v.union(pick, v.null()),
  sharedProposals: v.array(v.string()),
  bubble: v.string(),
  fallback: v.boolean(),
});

export const agentVoteV = v.object({
  userId: v.string(),
  yes: v.array(v.string()),
  bubble: v.string(),
  fallback: v.boolean(),
});

export const planV = v.object({
  mains: v.array(v.object({ userId: v.string(), itemId: v.string() })),
  shared: v.array(v.object({ itemId: v.string(), qty: v.number(), sharedBy: v.array(v.string()) })),
  conversation: v.array(v.object({
    speakerId: v.union(v.string(), v.null()),
    kind: v.union(v.literal("proposal"), v.literal("reaction"), v.literal("safety")),
    itemIds: v.array(v.string()),
    text: v.string(),
  })),
  summaryBubble: v.string(),
  fallback: v.boolean(),
});

export const followUpQuestionV = v.object({
  id: v.string(),
  question: v.string(),
  options: v.array(v.string()),
});

export const followUpAnswerV = v.object({ id: v.string(), question: v.string(), answer: v.string() });
