// Owner: Role 3. PURE. The agent's suggested swap when a diner removes a dish in stage 2.
import type { Hunger } from "../shared/enums";
import type { MenuItemLite, UserLite } from "../shared/types";
import { reasonFor } from "./bubbles";
import { rankItems, scoreContext, scoreItem } from "./ranking";
import { safeSet } from "./safety";

/** Highest-scoring item in the same category, recommendable for this user, not already in the order. */
export function substituteFor(
  removed: MenuItemLite,
  user: UserLite,
  menu: MenuItemLite[],
  inOrder: string[],
  hunger: Hunger = "normal",
): { item: MenuItemLite & { askServer: boolean }; reason: string } | null {
  const ctx = scoreContext(menu);
  const exclude = new Set([...inOrder, removed._id]);
  const pool = safeSet(menu, user).filter(
    (i) => i.category === removed.category && i.isDrink === removed.isDrink && !exclude.has(i._id),
  );
  const best = rankItems(pool, (i) => scoreItem(i, user, hunger, ctx))[0];
  if (!best) return null;
  return { item: best, reason: reasonFor(best, user) };
}
