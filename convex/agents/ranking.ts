// Owner: Role 3. PURE. Deterministic scoring and the fallback agent used whenever a model fails.
import type { Hunger } from "../shared/enums";
import type { AgentDraft, AgentVote, MenuItemLite, UserLite } from "../shared/types";
import { safeSet, sharedSafeSet, type SafeItem } from "./safety";
import { clipBubbleWords, openingBubble, reasonFor, voteBubble } from "./bubbles";

export type ScoreContext = { medianPriceCents: number };

const NOT_MAIN = /(dessert|side|sauce|extra|add[- ]?on|kids|condiment)/i;
export const isMainLike = (item: MenuItemLite) => !item.isDrink && !NOT_MAIN.test(item.category);

/** Plates the table shares before mains (not desserts or sides). */
export const isSharePlate = (item: MenuItemLite) => item.shareable && !item.isDrink && !/(dessert|side)/i.test(item.category);

/** Personal mains: real mains first; shareable plates only if fewer than 3 mains are safe. */
export function mainPool<T extends MenuItemLite>(items: T[]): T[] {
  const mains = items.filter((i) => isMainLike(i) && !i.shareable);
  return mains.length >= 3 ? mains : items.filter(isMainLike);
}

export function scoreContext(menu: MenuItemLite[]): ScoreContext {
  const prices = menu.filter((m) => !m.isDrink).map((m) => m.priceCents).sort((a, b) => a - b);
  const medianPriceCents = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
  return { medianPriceCents };
}

/**
 * Weights (tune with the 4 seeded profiles; keep them here, not in prompts):
 *  +3 per liked tag, +2 per liked cuisine, −4 per disliked tag/cuisine, −2 per spice level above tolerance,
 *  +1 shareable when starving, budget-minded gets ±2 points per $5 from median price, +2 for an unliked category for
 *  adventurous, −2 askServer for picky, −5 askServer for everyone (clean items always rank first).
 */
export function scoreItem(
  item: MenuItemLite & { askServer?: boolean },
  user: UserLite,
  hunger: Hunger,
  ctx: ScoreContext,
): number {
  let s = 0;
  const tags = new Set(item.tags.map((t) => t.toLowerCase()));
  for (const like of user.likes) if (tags.has(like.toLowerCase())) s += 3;
  for (const dislike of user.dislikes) if (tags.has(dislike.toLowerCase())) s -= 4;
  if (item.cuisine) {
    const cuisine = item.cuisine.toLowerCase();
    if (user.cuisines.some((liked) => liked.toLowerCase() === cuisine)) s += 2;
    if (user.dislikedCuisines?.some((disliked) => disliked.toLowerCase() === cuisine)) s -= 4;
  }
  if (item.spice > user.spice) s -= 2 * (item.spice - user.spice);
  if (hunger === "starving" && item.shareable) s += 1;
  if (user.personality === "budget_minded") {
    s += Math.round(((ctx.medianPriceCents - item.priceCents) * 2) / 500);
  }
  if (user.personality === "adventurous" && !user.likes.some((l) => tags.has(l.toLowerCase()))) s += 2;
  if (item.askServer) s -= user.personality === "picky" ? 7 : 5;
  return s;
}

/** Sort best first; ties: lower price, then menu order. */
export function rankItems<T extends MenuItemLite>(items: T[], score: (i: T) => number): T[] {
  return items
    .map((item) => ({ item, s: score(item) }))
    .sort((a, b) => b.s - a.s || a.item.priceCents - b.item.priceCents || a.item.menuOrder - b.item.menuOrder)
    .map((x) => x.item);
}

/** The deterministic agent. Also the shape every model draft must be repaired toward. */
export function fallbackDraft(
  menu: MenuItemLite[],
  user: UserLite,
  hunger: Hunger,
): AgentDraft {
  const ctx = scoreContext(menu);
  const mine = safeSet(menu, user);
  const score = (i: SafeItem) => scoreItem(i, user, hunger, ctx);
  const mains = rankItems(mainPool(mine), score).slice(0, 3);
  const drink = rankItems(mine.filter((i) => i.isDrink), score)[0];
  // Proposals only need to be clean for *this* diner; pooling then drops any that are unsafe for someone else,
  // which is what produces the "Maya's allergic to shellfish, so no paella" bubble.
  const shared = rankItems(sharedSafeSet(menu, [user]).filter(isSharePlate), score).slice(0, 2);
  return {
    userId: user._id,
    mains: mains.map((m) => ({ itemId: m._id, reason: reasonFor(m, user) })),
    drink: drink ? { itemId: drink._id, reason: reasonFor(drink, user) } : null,
    sharedProposals: shared.map((s) => s._id),
    bubble: clipBubbleWords(openingBubble(user, mains[0]?.name, shared[0]?.name), 6, 55),
    fallback: true,
  };
}

/** Votes yes on every pooled dish this user scores ≥ 0, and always on at least their favourite. */
export function fallbackVote(pooled: MenuItemLite[], user: UserLite, hunger: Hunger, menu: MenuItemLite[]): AgentVote {
  const ctx = scoreContext(menu);
  const ranked = rankItems(pooled, (i) => scoreItem(i, user, hunger, ctx));
  const yes = ranked.filter((i) => scoreItem(i, user, hunger, ctx) >= 0).map((i) => i._id);
  if (yes.length === 0 && ranked[0]) yes.push(ranked[0]._id);
  const names = yes.map((id) => pooled.find((p) => p._id === id)!.name);
  return { userId: user._id, yes, bubble: clipBubbleWords(voteBubble(user, names), 6, 55), fallback: true };
}
