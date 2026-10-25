// Owner: Role 3. PURE. Deterministic scoring and the fallback agent used whenever a model fails.
import type { Hunger } from "../shared/enums";
import type { AgentDraft, AgentVote, MenuItemLite, UserLite } from "../shared/types";
import { safeSet, sharedSafeSet, type SafeItem } from "./safety";
import { clipBubbleWords, openingBubble, reasonFor, voteBubble } from "./bubbles";
import { tasteFit } from "./taste";

export type ScoreContext = { medianByRole: Record<"main" | "drink" | "shared", number | null> };

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
  const median = (items: MenuItemLite[]) => {
    const prices = items.filter((m) => m.priceVerified && m.priceCents !== null).map((m) => m.priceCents!)
      .sort((a, b) => a - b);
    return prices.length ? prices[Math.floor(prices.length / 2)] : null;
  };
  return { medianByRole: {
    main: median(menu.filter((m) => isMainLike(m) && !m.shareable)),
    drink: median(menu.filter((m) => m.isDrink)),
    shared: median(menu.filter(isSharePlate)),
  } };
}

/** Estimate the diner's whole order: one main, optional drink, and half of each shared plate. */
export function projectedOrderPriceScore(
  main: MenuItemLite, drink: MenuItemLite | null, shared: MenuItemLite[], user: UserLite, ctx: ScoreContext,
): number {
  const sensitivity = user.priceSensitivity === "a_lot" ? 1 : user.priceSensitivity === "somewhat" || (!user.priceSensitivity && user.personality === "budget_minded") ? 0.5 : 0;
  if (!sensitivity || ![main, ...(drink ? [drink] : []), ...shared].every((i) => i.priceVerified)) return 0;
  const { main: mainMedian, drink: drinkMedian, shared: sharedMedian } = ctx.medianByRole;
  if (mainMedian === null || (drink && drinkMedian === null) || (shared.length && sharedMedian === null)) return 0;
  const actual = main.priceCents + (drink?.priceCents ?? 0) + shared.reduce((n, i) => n + i.priceCents / 2, 0);
  const expected = mainMedian + (drink ? drinkMedian! : 0) + shared.length * (sharedMedian ?? 0) / 2;
  return Math.max(-2, Math.min(2, (expected - actual) / 500 * sensitivity));
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
  const dishWords = `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
  for (const like of user.ingredientLikes ?? []) if (like.trim() && dishWords.includes(like.toLowerCase())) s += 2;
  for (const avoid of user.ingredientAvoids ?? []) if (avoid.trim() && dishWords.includes(avoid.toLowerCase())) s -= 4;
  if (item.cuisine) {
    const cuisine = item.cuisine.toLowerCase();
    if (user.cuisines.some((liked) => liked.toLowerCase() === cuisine)) s += 2;
    if (user.dislikedCuisines?.some((disliked) => disliked.toLowerCase() === cuisine)) s -= 4;
  }
  if (item.spice > user.spice) s -= 2 * (item.spice - user.spice);
  s += tasteFit(user.taste, item.taste);
  const role = item.isDrink ? "drink" : isSharePlate(item) ? "shared" : "main";
  const median = ctx.medianByRole[role];
  if (item.priceVerified && item.priceCents !== null && median !== null) {
    const sensitivity = user.priceSensitivity === "a_lot" ? 1 : user.priceSensitivity === "somewhat" || (!user.priceSensitivity && user.personality === "budget_minded") ? 0.5 : 0;
    const participantCost = role === "shared" ? item.priceCents / 2 : item.priceCents;
    const comparableMedian = role === "shared" ? median / 2 : median;
    s += Math.max(-2, Math.min(2, (comparableMedian - participantCost) / 500 * sensitivity));
  }
  if (user.familiarity === "open" && !user.likes.some((l) => tags.has(l.toLowerCase()))) s += 0.5;
  if (item.askServer) s -= user.personality === "picky" ? 7 : 5;
  return s;
}

/** Sort best first; ties: lower price, then menu order. */
export function rankItems<T extends MenuItemLite>(items: T[], score: (i: T) => number): T[] {
  return items
    .map((item) => ({ item, s: score(item) }))
    .sort((a, b) => b.s - a.s || (a.item.priceVerified && b.item.priceVerified ? a.item.priceCents - b.item.priceCents : 0) || a.item.menuOrder - b.item.menuOrder)
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
  const drink = rankItems(mine.filter((i) => i.isDrink), score)[0];
  // Proposals only need to be clean for *this* diner; pooling then drops any that are unsafe for someone else,
  // which is what produces the "Maya's allergic to shellfish, so no paella" bubble.
  const shared = rankItems(sharedSafeSet(menu, [user]).filter(isSharePlate), score).slice(0, 2);
  const mains = rankItems(mainPool(mine), (m) => score(m) + projectedOrderPriceScore(m, drink ?? null, shared, user, ctx)).slice(0, 3);
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
