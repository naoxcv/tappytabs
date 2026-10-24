// Owner: Role 3. Diner agent's opening draft. Model: Bitdeer (fast), Claude as backup.
import { z } from "zod";
import type { Hunger } from "../../shared/enums";
import type { AgentDraft, UserLite } from "../../shared/types";
import { clip } from "../bubbles";
import { COMMON_RULES, tag } from "../models/provider";
import { PERSONALITY_TONE } from "../personalities";
import type { SafeItem } from "../safety";

export const draftSchema = z.object({
  // Claude structured outputs does not support JSON Schema maxItems; repairDraft enforces the cap.
  mains: z.array(z.object({ itemId: z.string(), reason: z.string() })),
  drink: z.object({ itemId: z.string(), reason: z.string() }).nullable(),
  sharedProposals: z.array(z.string()),
});

const menuRow = (i: SafeItem) => ({
  id: i._id, name: i.name, category: i.category, price: `$${(i.priceCents / 100).toFixed(2)}`,
  description: i.description, tags: i.tags, askServer: i.askServer,
});

export function draftPrompt(args: {
  user: UserLite; hunger: Hunger; mains: SafeItem[]; drinks: SafeItem[]; shared: SafeItem[];
}) {
  const { user } = args;
  const system = [
    `You are ${user.name}'s personal dining agent at a group dinner.`,
    PERSONALITY_TONE[user.personality ?? "adventurous"],
    "Pick up to 3 ranked mains and 1 drink for your diner, and propose 0–2 dishes for the whole table to share.",
    "Prefer items without askServer. Give a one-line reason per pick (max 60 chars).",
    "The candidate list is ordered by a code-based fit score; use that order as your default and only depart from it for a clear preference reason.",
    "The server writes the opening bubble from your selected dishes, so focus on ranking candidates and concise reasons.",
    COMMON_RULES,
  ].join("\n");
  const user_ = [
    tag("profile", {
      name: user.name, likes: user.likes, dislikes: user.dislikes, cuisines: user.cuisines,
      spiceTolerance: user.spice, hunger: args.hunger,
    }),
    tag("candidates", args.mains.map(menuRow)),
    tag("drinks", args.drinks.map(menuRow)),
    tag("shared_candidates", args.shared.map(menuRow)),
  ].join("\n");
  return { system, user: user_ };
}

/** Drop unknown ids, dedupe, then fill gaps from the deterministic draft. Never trusts the model's ids. */
export function repairDraft(
  raw: z.infer<typeof draftSchema>,
  allowed: { mains: Set<string>; drinks: Set<string>; shared: Set<string> },
  fallback: AgentDraft,
): AgentDraft {
  const mains: AgentDraft["mains"] = [];
  for (const m of raw.mains.slice(0, 3)) {
    if (allowed.mains.has(m.itemId) && !mains.some((x) => x.itemId === m.itemId)) {
      mains.push({ itemId: m.itemId, reason: clip(m.reason, 80) });
    }
  }
  for (const m of fallback.mains) {
    if (mains.length >= 3) break;
    if (!mains.some((x) => x.itemId === m.itemId)) mains.push(m);
  }
  const drink = raw.drink && allowed.drinks.has(raw.drink.itemId)
    ? { itemId: raw.drink.itemId, reason: clip(raw.drink.reason, 80) }
    : fallback.drink;
  const shared = [...new Set(raw.sharedProposals.slice(0, 2).filter((id) => allowed.shared.has(id)))];
  const usedModel = mains.some((m) => allowed.mains.has(m.itemId) && raw.mains.some((r) => r.itemId === m.itemId));
  return {
    userId: fallback.userId,
    mains: mains.slice(0, 3),
    drink,
    sharedProposals: shared.length ? shared : fallback.sharedProposals,
    bubble: fallback.bubble,
    fallback: !usedModel,
  };
}
