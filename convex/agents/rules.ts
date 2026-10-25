// Owner: Role 3. PURE. Negotiation rules: how many shared dishes, how votes settle, and plan building.
import { HUNGER_WEIGHT, type Hunger } from "../shared/enums";
import type { AgentDraft, AgentVote, MenuItemLite, Plan, UserLite } from "../shared/types";
import { isSafeFor, sharedSafeSet, type Safety } from "./safety";
import { isSharePlate, rankItems, scoreContext, scoreItem } from "./ranking";

/** snack 0.5, normal 1, starving 1.5 → max(1, round(sum / 2)). Four normal diners → 2 shared dishes. */
export function sharedTarget(hungers: Hunger[]): number {
  const sum = hungers.reduce((s, h) => s + HUNGER_WEIGHT[h], 0);
  return Math.max(1, Math.round(sum / 2));
}

/** Union of every draft's shared proposals, in first-seen order. */
export function poolProposals(drafts: AgentDraft[]): string[] {
  const seen = new Set<string>();
  for (const d of drafts) for (const id of d.sharedProposals) seen.add(id);
  return [...seen];
}

/** Count yes votes; take the top `target`. Ties: lower price, then menu order. Items with 0 votes still qualify. */
export function tally(pooled: string[], votes: AgentVote[], menu: MenuItemLite[], target: number): string[] {
  const byId = new Map(menu.map((m) => [m._id, m]));
  return pooled
    .filter((id) => byId.has(id))
    .map((id) => ({ id, n: votes.filter((v) => v.yes.includes(id)).length, item: byId.get(id)! }))
    .sort((a, b) => b.n - a.n || (a.item.priceVerified && b.item.priceVerified ? a.item.priceCents - b.item.priceCents : 0) || a.item.menuOrder - b.item.menuOrder)
    .slice(0, Math.max(0, target))
    .map((x) => x.id);
}

/** Settled plan. Each shared dish: qty 1, sharedBy = every member it is safe for in shared mode. */
export function buildPlan(
  drafts: AgentDraft[],
  chosenShared: string[],
  menu: MenuItemLite[],
  users: UserLite[],
): Omit<Plan, "conversation" | "summaryBubble" | "fallback"> {
  const byId = new Map(menu.map((m) => [m._id, m]));
  const shared = chosenShared
    .map((itemId) => {
      const item = byId.get(itemId)!;
      const sharedBy = users.filter((u) => isSafeFor(item, [u], "shared").safe).map((u) => u._id);
      return { itemId, qty: 1, sharedBy };
    })
    .filter((s) => s.sharedBy.length > 0);
  const mains = drafts.filter((d) => d.mains[0]).map((d) => ({ userId: d.userId, itemId: d.mains[0].itemId }));
  return { mains, shared };
}

export const MAX_DROP_BUBBLES = 2;
export const MIN_POOL = 2;

export type Pooling = {
  pooled: string[];
  /** Proposals dropped because they're unsafe for someone; allergy drops first, capped for pacing. */
  drops: { item: MenuItemLite; failed: { user: UserLite; safety: Safety }[] }[];
  /** Dishes the restaurant agent added because too few proposals survived. */
  topUps: MenuItemLite[];
};

/** Pool every draft's proposals, keep the ones clean for the whole table, top up to MIN_POOL. */
export function poolForParty(drafts: AgentDraft[], menu: MenuItemLite[], users: UserLite[]): Pooling {
  const clean = sharedSafeSet(menu, users).filter(isSharePlate);
  const okIds = new Set(clean.map((i) => i._id));
  const pooled: string[] = [];
  const drops: Pooling["drops"] = [];
  for (const id of poolProposals(drafts)) {
    const item = menu.find((m) => m._id === id);
    if (!item) continue;
    if (okIds.has(id)) pooled.push(id);
    else {
      const failed = users.map((user) => ({ user, safety: isSafeFor(item, [user], "shared") })).filter((f) => !f.safety.safe);
      drops.push({ item, failed });
    }
  }
  // Allergy drops make the best (and most honest) story; then the bigger dish.
  const allergyHits = (d: Pooling["drops"][number]) =>
    d.failed.filter((f) => f.safety.reasons.some((r) => r.includes("allergic"))).length;
  drops.sort((a, b) => allergyHits(b) - allergyHits(a) || (b.item.priceCents ?? 0) - (a.item.priceCents ?? 0));
  const topUps: MenuItemLite[] = [];
  if (pooled.length < MIN_POOL) {
    const ctx = scoreContext(menu);
    const ranked = rankItems(clean.filter((i) => !pooled.includes(i._id)), (i) =>
      users.reduce((sum, u) => sum + scoreItem(i, u, "normal", ctx), 0));
    for (const item of ranked.slice(0, MIN_POOL - pooled.length)) {
      pooled.push(item._id);
      topUps.push(item);
    }
  }
  return { pooled, drops: drops.slice(0, MAX_DROP_BUBBLES), topUps };
}
