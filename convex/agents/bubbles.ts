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
export function clip(text: string, max = BUBBLE_MAX_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const boundary = cut.lastIndexOf(" ");
  return t.slice(0, boundary > 0 ? boundary : max).trimEnd();
}

/** Keep generated chat bubbles short without cutting a word in half. */
export function clipBubbleWords(text: string, maxWords = 8, maxChars = 80): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  if (words.length <= maxWords && normalized.length <= maxChars) {
    return normalized.replace(/(?:…|\.{3,})+$/, "").trimEnd();
  }
  const kept: string[] = [];
  for (const word of words) {
    if (kept.length >= maxWords) break;
    const candidate = [...kept, word].join(" ");
    if (candidate.length > maxChars) break;
    kept.push(word);
  }
  if (kept.length === 0) return "";
  const shortened = kept.join(" ");
  const sentenceEnds = [...shortened.matchAll(/[.!?](?=\s|$)/g)];
  const sentenceEnd = sentenceEnds.at(-1);
  if (sentenceEnd?.index !== undefined) return shortened.slice(0, sentenceEnd.index + 1).trimEnd();
  return shortened
    .replace(/\s+(?:and|but|or|so|because|with|to|for|of|in|on|at|a|an|the|my|your|our|their|this|that)$/i, "")
    .replace(/(?:…|\.{3,})+$/, "")
    .trimEnd();
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
  const key = `${first(user.name)}:${topMain ?? ""}:${topShared ?? ""}`;
  if (topMain && topShared) return variant(key, [
    `Thoughts on ${topShared}?`,
    `Let's share ${topShared}!`,
    `I'd try ${topShared}.`,
  ], partyIndex);
  if (topMain) return variant(key, [
    `I'm ready to eat!`,
    `Thoughts on ${topMain}?`,
    `That sounds tasty!`,
  ], partyIndex);
  return variant(key, [
    `Still looking for my pick.`,
    `I haven't picked yet.`,
  ], partyIndex);
}

export function voteBubble(user: UserLite, yesNames: string[]): string {
  const key = `${first(user.name)}:${yesNames.join(":")}`;
  if (yesNames.length === 0) return variant(key, [
    `I'll pass on this.`,
    `Not for me!`,
    `Maybe something else?`,
  ]);
  return variant(key, [
    `I'm down!`,
    `Yum!`,
    `Sounds good!`,
  ]);
}

export function summaryTemplate(shared: string[], _mainsCount: number): string {
  if (shared.length === 0) return `Pick your main on your phone!`;
  return `We picked our shared plates. Pick your main on your phone!`;
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
  if (who.length === 0) return clip(`No ${item.name} this time.`);
  const list = who.length === 1 ? who[0] : `${who.slice(0, -1).join(", ")} and ${who.at(-1)}`;
  return clip(`${list}.`);
}

export const topUpBubble = (item: MenuItemLite) => clip(variant(item.name, [
  `Thoughts on ${item.name}?`,
  `Should we share ${item.name}?`,
  `${item.name}?`,
]));
