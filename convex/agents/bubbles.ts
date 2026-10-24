// Owner: Role 3. PURE. Template copy used by fallbacks, and the one bubble that must never come from a model:
// the allergy drop bubble (allergy claims must be exact).
import { BUBBLE_MAX_CHARS } from "../shared/enums";
import type { MenuItemLite, UserLite } from "../shared/types";
import { ALLERGEN_LABEL, dietOk, levelFor, type Safety } from "./safety";

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const variant = (key: string, options: string[], preferredIndex?: number) => {
  if (preferredIndex !== undefined) return options[preferredIndex % options.length];
  let hash = 2_166_136_261;
  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return options[(hash >>> 0) % options.length];
};
const listNames = (names: string[]) => names.length < 2
  ? names[0] ?? ""
  : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export function clip(text: string, max = BUBBLE_MAX_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function sentenceChunks(sentence: string, max: number): string[] {
  const out: string[] = [];
  let rest = sentence.trim();
  while (rest.length > max) {
    const prefix = rest.slice(0, max + 1);
    const boundaries = [...prefix.matchAll(/(?:[;:]\s+|,\s*(?:and|but|so)\s+|\s+[—–-]\s+|\s+(?:and|but|so|while|because|then)\s+)/gi)];
    const boundary = boundaries.at(-1);
    let cut = boundary?.index ?? -1;
    let next = "";
    if (boundary) {
      const token = boundary[0];
      const conjunction = token.trim().match(/(?:and|but|so|while|because|then)$/i)?.[0];
      if (conjunction) {
        cut += token.lastIndexOf(conjunction);
        next = capitalize(rest.slice(cut).trim());
      } else {
        cut += token.length;
        next = capitalize(rest.slice(cut).trim());
      }
    } else {
      cut = prefix.lastIndexOf(" ");
      if (cut < 1) cut = max;
      next = capitalize(rest.slice(cut).trim());
    }
    const head = rest.slice(0, cut).trim().replace(/[,;:—–-]+$/, "");
    out.push(/[.!?]$/.test(head) ? head : `${head}.`);
    rest = next;
  }
  if (rest) out.push(/[.!?]$/.test(rest) ? rest : `${rest}.`);
  return out;
}

/** Keep complete sentences together; turn long clauses into short independent sentences. */
export function splitBubbleText(text: string, max = BUBBLE_MAX_CHARS): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized ? [normalized] : [];
  const sentences = normalized.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [normalized];
  return sentences.flatMap((sentence) => sentenceChunks(sentence, max));
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

export function openingBubble(user: UserLite, topMain?: string, topShared?: string, partyIndex?: number): string {
  const n = first(user.name);
  if (topMain && topShared) return variant(`${n}:${topMain}:${topShared}`, [
    `${n} is leaning toward ${topMain}, and thinks ${topShared} could be good to share.`,
    `${n} likes the look of ${topMain}; ${topShared} might be worth sharing too.`,
    `${n}'s pick is ${topMain}, with ${topShared} as a possible plate for the table.`,
  ], partyIndex);
  if (topMain) return variant(`${n}:${topMain}`, [
    `${n} is leaning toward ${topMain}.`,
    `${n} likes the look of ${topMain}.`,
    `${n}'s pick is ${topMain}.`,
  ], partyIndex);
  return variant(`${n}:no-main`, [
    `${n} hasn't found a main yet.`,
    `${n} is still weighing the menu.`,
  ], partyIndex);
}

export function voteBubble(user: UserLite, yesNames: string[]): string {
  const n = first(user.name);
  if (yesNames.length === 0) return variant(`${n}:pass`, [
    `${n} will pass on the shared dishes.`,
    `${n} isn't feeling the shared options this time.`,
    `${n} is sitting out the shared plates.`,
  ]);
  const picks = listNames(yesNames);
  return variant(`${n}:${picks}`, [
    `${n} gives ${picks} the green light.`,
    `${picks} gets ${n}'s vote.`,
    `${n} is happy to share ${picks}.`,
    `${n} would put ${picks} in the middle.`,
    `${n} is backing ${picks} for the table.`,
  ]);
}

export function summaryTemplate(shared: string[], mainsCount: number): string {
  const dishes = listNames(shared);
  const key = `${dishes}:${mainsCount}`;
  if (shared.length === 0) return variant(key, [
    `${mainsCount} mains are ready. Check your phones to choose yours!`,
    `Your mains are lined up; take a look at your phones to pick.`,
    `No shared plates made the cut, but your main is ready to choose on your phone.`,
  ]);
  return variant(key, [
    `${dishes} for the middle, plus ${mainsCount} mains. Check your phones to choose yours!`,
    `The table's sharing ${dishes}; your mains are ready on your phones.`,
    `Sharing ${dishes}, with a main for everyone. Take a look at your phones!`,
    `${dishes} are headed to the table. Choose your main on your phone!`,
  ]);
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

export const topUpBubble = (item: MenuItemLite) => clip(variant(item.name, [
  `${item.name} works for everyone; let's add it to the mix.`,
  `The whole table can share ${item.name}.`,
  `${item.name} is a good fit for everyone at the table.`,
]));
