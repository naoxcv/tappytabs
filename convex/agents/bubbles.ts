// Owner: Role 3. PURE. Template copy used by fallbacks, and the one bubble that must never come from a model:
// the allergy drop bubble (allergy claims must be exact).
import { BUBBLE_MAX_CHARS } from "../shared/enums";
import type { MenuItemLite, UserLite } from "../shared/types";
import { ALLERGEN_LABEL, dietOk, levelFor, type Safety } from "./safety";

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function clip(text: string, max = BUBBLE_MAX_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

export function reasonFor(item: MenuItemLite, user: UserLite): string {
  const tags = new Set(item.tags.map((t) => t.toLowerCase()));
  const like = user.likes.find((l) => tags.has(l.toLowerCase()));
  if (like) return `Matches ${first(user.name)}'s love of ${like}`;
  if (item.cuisine && user.cuisines.some((c) => c.toLowerCase() === item.cuisine!.toLowerCase())) {
    return `${first(user.name)} enjoys ${item.cuisine} food`;
  }
  if (item.isDrink) return "Goes well with the meal";
  return "A safe, popular pick";
}

export function openingBubble(user: UserLite, topMain?: string, topShared?: string): string {
  const n = first(user.name);
  if (topMain && topShared) return `${n} is eyeing the ${topMain}. Anyone up for sharing ${topShared}?`;
  if (topMain) return `${n} is leaning toward the ${topMain}.`;
  return `${n} is still looking. Not much here fits ${n}'s needs.`;
}

export function voteBubble(user: UserLite, yesNames: string[]): string {
  const n = first(user.name);
  if (yesNames.length === 0) return `${n} will pass on the shared dishes.`;
  if (yesNames.length === 1) return `${n} votes for the ${yesNames[0]}.`;
  return `${n} is happy with ${yesNames.slice(0, -1).join(", ")} and ${yesNames.at(-1)}.`;
}

export function summaryTemplate(shared: string[], mainsCount: number): string {
  if (shared.length === 0) return `Got it: ${mainsCount} mains coming up, nothing shared that's safe for everyone.`;
  return `Great, ${shared.join(" and ")} for the table, plus everyone's mains. Check your phones!`;
}

/**
 * "Maya's allergic to shellfish, so no paella for the table."
 * Built only from the safety check, so the allergen named is always one the diner actually listed.
 */
export function dropBubbleText(item: MenuItemLite, failed: { user: UserLite; safety: Safety }[]): string {
  const parts: string[] = [];
  const diets: string[] = [];
  for (const { user } of failed) {
    const hit = user.allergies.find((a) => levelFor(item, a) !== "not_detected");
    if (hit) parts.push(`${first(user.name)}'s allergic to ${ALLERGEN_LABEL[hit]}`);
    else {
      const d = user.diet.find((x) => !dietOk(item, x));
      if (d) diets.push(`${first(user.name)}'s ${d.replace("_", " ")}`);
    }
  }
  // Lead with allergies (exact claims); mention diets only when no allergy is involved. Max 2 names.
  const who = (parts.length ? parts : diets).slice(0, 2);
  if (who.length === 0) return clip(`No ${item.name} for the table this time.`);
  const list = who.length === 1 ? who[0] : `${who.slice(0, -1).join(", ")} and ${who.at(-1)}`;
  return clip(`${list}, so no ${item.name} for the table.`);
}

export const topUpBubble = (item: MenuItemLite) => clip(`How about the ${item.name} for the table? It works for everyone.`);
