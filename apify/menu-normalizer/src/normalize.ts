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
  /** Unknown prices are 0; estimated prices are positive but remain unverified. */
  priceCents: number;
  allergens: { allergen: Allergen; level: Level }[];
  diet: Diet[];
  spice: number;
  isDrink: boolean;
  shareable: boolean;
  menuOrder: number;
  tagStatus: "tagged" | "untagged";
  taste: { contrast: string; value: number; evidence: "stated" | "inferred"; detail: string }[];
  priceVerified: boolean;
  currency?: string;
};

/** LLM tag output per item (validated in main.ts). May only add or raise. */
export type LlmTags = {
  estimatedPriceCents?: number;
  allergens?: Partial<Record<Allergen, Level>>;
  diet?: Diet[];
  tags?: string[];
  cuisine?: string;
  spice?: number;
  isDrink?: boolean;
  shareable?: boolean;
  taste?: { contrast: string; value: number; detail: string }[];
};

/** A model reply must contain the fields used to decide whether an item is fully tagged. */
export function isCompleteLlmTags(value: unknown): value is LlmTags {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (!row.allergens || typeof row.allergens !== "object" || Array.isArray(row.allergens)) return false;
  const allergens = row.allergens as Record<string, unknown>;
  if (!Object.entries(allergens).every(([name, level]) =>
    ALLERGENS.includes(name as Allergen) && (level === "contains" || level === "may_contain"))) return false;
  return Array.isArray(row.diet) && row.diet.every((diet) => ["vegetarian", "vegan", "halal", "no_pork"].includes(diet)) &&
    Array.isArray(row.tags) && row.tags.every((tag) => typeof tag === "string") &&
    Number.isInteger(row.spice) && Number(row.spice) >= 0 && Number(row.spice) <= 4 &&
    typeof row.isDrink === "boolean" && typeof row.shareable === "boolean";
}

const RANK: Record<Level, number> = { not_detected: 0, may_contain: 1, contains: 2 };
const raise = (a: Level, b: Level): Level => (RANK[b] > RANK[a] ? b : a);

export function parsePrice(price: RawItem["price"]): { cents: number | null; currency?: string } {
  if (typeof price === "number") return Number.isFinite(price) && price > 0 && price <= 200 ? { cents: Math.round(price * 100) } : { cents: null };
  const source = String(price ?? "").trim();
  if (!source || /^0+(?:[.,]0{1,2})?$/.test(source) || /\b(from|starting|market|varies|ask)\b|[-–]\s*[$€£]?\d/i.test(source)) return { cents: null };
  const symbols = [...source.matchAll(/[$€£]/g)].map((m) => m[0]);
  const codes = [...source.matchAll(/\b(?:USD|EUR|GBP|CAD|AUD)\b/gi)].map((m) => m[0].toUpperCase());
  const currencies = [...new Set([...symbols.map((s) => ({ "$": "USD", "€": "EUR", "£": "GBP" })[s]), ...codes])];
  if (currencies.length > 1) return { cents: null };
  const cleaned = source.replace(/[$€£]|\b(?:USD|EUR|GBP|CAD|AUD)\b/gi, "").trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(cleaned)) return { cents: null };
  return { cents: Math.round(Number(cleaned.replace(",", ".")) * 100), currency: currencies[0] };
}

export const parsePriceCents = (price: RawItem["price"]): number | null => parsePrice(price).cents;

/** Scrapers use bare zero for a failed lookup; a currency-marked zero can be an intentional free item. */
export function isMissingPrice(price: RawItem["price"]): boolean {
  return price === null || price === undefined ||
    (typeof price === "number" && price === 0) ||
    (typeof price === "string" && (!price.trim() || /^0+(?:[.,]0{1,2})?$/.test(price.trim())));
}

/** Only annotate traits directly supported by menu wording. Missing traits stay unknown. */
export function inferTaste(text: string): NormalizedItem["taste"] {
  const rules: [string, number, "stated" | "inferred", RegExp][] = [
    ["texture", -1, "stated", /\b(crisp|crispy|crunchy)\b/i], ["texture", 1, "stated", /\b(tender|soft)\b/i],
    ["texture", 1, "inferred", /\bbraised\b/i],
    ["richness", -1, "stated", /\b(light|lean)\b/i], ["richness", 1, "stated", /\b(creamy|rich)\b/i],
    ["richness", 1, "inferred", /\b(butter|cheesy)\b/i],
    ["brightness", 1, "stated", /\b(tangy|bright)\b/i], ["brightness", 1, "inferred", /\b(lemon|lime|citrus|vinegar)\b/i],
    ["brothiness", 1, "stated", /\b(broth|soup)\b/i], ["brothiness", -1, "stated", /\b(dry.fried)\b/i],
    ["boldness", 1, "stated", /\b(bold|boldly seasoned)\b/i], ["boldness", -1, "stated", /\b(simply seasoned)\b/i],
    ["boldness", 1, "inferred", /\b(spiced|garlic|gochujang)\b/i],
    ["char", -1, "stated", /\b(fresh herb|basil|cilantro|parsley)\b/i], ["char", 1, "stated", /\b(smoky|smoked|charred)\b/i],
    ["char", 1, "inferred", /\bgrilled\b/i],
  ];
  return rules.flatMap(([contrast, value, evidence, pattern]) => {
    const match = text.match(pattern);
    return match ? [{ contrast, value, evidence, detail: match[0] }] : [];
  }).filter((trait, index, all) =>
    !all.some((other) => other.contrast === trait.contrast && other.value !== trait.value) &&
    !all.slice(0, index).some((other) => other.contrast === trait.contrast));
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
  const parsedPrice = parsePrice(raw.price);
  return {
    name: raw.name.trim(),
    category,
    tags: [],
    description: (raw.description ?? "").trim(),
    priceCents: parsedPrice.cents ?? 0,
    currency: parsedPrice.currency,
    priceVerified: parsedPrice.cents !== null,
    taste: inferTaste(text),
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
export function mergeLlm(base: NormalizedItem, llm: LlmTags | null, allowPriceEstimate = false): NormalizedItem {
  if (!llm) return markUnreadable(base);
  const allergens = base.allergens.map(({ allergen, level }) => ({
    allergen, level: raise(level, llm.allergens?.[allergen] ?? "not_detected"),
  }));
  const diet = llm.diet ? base.diet.filter((d) => llm.diet!.includes(d)).concat(
    llm.diet.includes("halal") && !base.diet.includes("halal") ? ["halal" as Diet] : [],
  ) : base.diet;
  return {
    ...base,
    priceCents: allowPriceEstimate && !base.priceVerified && base.priceCents === 0 &&
      Number.isInteger(llm.estimatedPriceCents) && llm.estimatedPriceCents! > 0 && llm.estimatedPriceCents! <= 20_000
      ? llm.estimatedPriceCents! : base.priceCents,
    taste: [
      ...base.taste,
      ...(Array.isArray(llm.taste) ? llm.taste : []).filter((t) =>
        ["texture", "richness", "brightness", "brothiness", "boldness", "char"].includes(t.contrast) &&
        Number.isFinite(t.value) && Math.abs(t.value) <= 1 && !!t.detail?.trim() &&
        !base.taste.some((existing) => existing.contrast === t.contrast),
      ).map((t) => ({ ...t, evidence: "inferred" as const })),
    ],
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
