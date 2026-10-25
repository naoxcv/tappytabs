// Owner: Role 4. Pure normalization: raw scraped rows → TappyTabs menuItems (minus restaurantId).
// Output contract = convex/menu.ts `normalizedItem`. Keep the two in sync.
import { ALLERGENS, DRINK_CATEGORIES, MEAT_KEYWORDS, PORK_KEYWORDS, SHAREABLE_CATEGORIES, keywordHits, type Allergen } from "./keywords.js";

export type RawItem = { name: string; description?: string; ingredients?: string[]; price?: string | number; category?: string };
export type Level = "contains" | "may_contain" | "not_detected";
export type Diet = "vegetarian" | "vegan" | "halal" | "no_pork";

export type NormalizedItem = {
  name: string;
  category: string;
  cuisine?: string;
  tags: string[];
  description: string;
  priceCents: number;
  allergens: { allergen: Allergen; level: Level }[];
  diet: Diet[];
  spice: number;
  isDrink: boolean;
  shareable: boolean;
  menuOrder: number;
  tagStatus: "tagged" | "untagged";
};

/** LLM tag output per item (validated in main.ts). May only add or raise. */
export type LlmTags = {
  allergens?: Partial<Record<Allergen, Level>>;
  diet?: Diet[];
  tags?: string[];
  cuisine?: string;
  spice?: number;
  isDrink?: boolean;
  shareable?: boolean;
};

const RANK: Record<Level, number> = { not_detected: 0, may_contain: 1, contains: 2 };
const raise = (a: Level, b: Level): Level => (RANK[b] > RANK[a] ? b : a);

export function parsePriceCents(price: RawItem["price"]): number {
  if (typeof price === "number") return price > 200 ? Math.round(price) : Math.round(price * 100);
  const m = String(price ?? "").replace(",", ".").match(/(\d+(?:\.\d{1,2})?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : 0;
}

/** Deterministic first pass. Without an LLM result, the item stays usable but conservative. */
export function keywordPass(raw: RawItem, index: number): NormalizedItem {
  const text = `${raw.name} ${raw.description ?? ""} ${(raw.ingredients ?? []).join(" ")}`;
  const hits = keywordHits(text);
  const lower = text.toLowerCase();
  const category = (raw.category ?? "mains").toLowerCase().trim() || "mains";
  const isDrink = DRINK_CATEGORIES.test(category);
  const hasMeat = MEAT_KEYWORDS.some((k) => lower.includes(k)) || hits.has("fish") || hits.has("shellfish");
  const hasPork = PORK_KEYWORDS.some((k) => lower.includes(k));
  const diet: Diet[] = [];
  if (!hasMeat) diet.push("vegetarian");
  if (!hasMeat && !hits.has("milk") && !hits.has("egg") && !/honey/.test(lower)) diet.push("vegan");
  if (!hasPork) diet.push("no_pork");
  // halal is never inferred from keywords (we can't know how meat was sourced); vegetarian implies it at check time.
  return {
    name: raw.name.trim(),
    category,
    tags: [],
    description: (raw.description ?? "").trim(),
    priceCents: parsePriceCents(raw.price),
    allergens: ALLERGENS.map((allergen) => ({ allergen, level: hits.has(allergen) ? "contains" : "not_detected" })),
    diet,
    spice: /(spicy|chili|chilli|gochujang|sriracha|jalape|hot )/.test(lower) ? 2 : 0,
    isDrink,
    shareable: !isDrink && SHAREABLE_CATEGORIES.test(category),
    menuOrder: index,
    tagStatus: "untagged",
  };
}

/** Merge the LLM pass in: allergens may only go up; diets are intersected (both must agree) so they can only get stricter. */
export function mergeLlm(base: NormalizedItem, llm: LlmTags | null): NormalizedItem {
  if (!llm) return markUnreadable(base);
  const allergens = base.allergens.map(({ allergen, level }) => ({
    allergen, level: raise(level, llm.allergens?.[allergen] ?? "not_detected"),
  }));
  const diet = llm.diet ? base.diet.filter((d) => llm.diet!.includes(d)).concat(
    llm.diet.includes("halal") && !base.diet.includes("halal") ? ["halal" as Diet] : [],
  ) : base.diet;
  return {
    ...base,
    allergens,
    diet: [...new Set(diet)],
    tags: (llm.tags ?? []).map((t) => t.toLowerCase()).slice(0, 6),
    cuisine: llm.cuisine ?? base.cuisine,
    spice: Math.max(base.spice, Math.min(4, Math.max(0, Math.round(llm.spice ?? 0)))),
    isDrink: base.isDrink || !!llm.isDrink,
    shareable: llm.shareable ?? base.shareable,
    tagStatus: "tagged",
  };
}

/** No LLM result: every allergen we didn't positively detect becomes may_contain; agents won't recommend it. */
export function markUnreadable(base: NormalizedItem): NormalizedItem {
  return {
    ...base,
    allergens: base.allergens.map((a) => ({ ...a, level: a.level === "contains" ? "contains" : "may_contain" })),
    tagStatus: "untagged",
  };
}
