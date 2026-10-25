import { test } from "node:test";
import assert from "node:assert/strict";
import { inferTaste, isCompleteLlmTags, isMissingPrice, keywordPass, mergeLlm, parsePrice, parsePriceCents } from "./normalize.js";
import { tagUser } from "./tagPrompt.js";

const level = (item: ReturnType<typeof keywordPass>, a: string) => item.allergens.find((x) => x.allergen === a)!.level;

test("prices", () => {
  assert.equal(parsePriceCents("$12.50"), 1250);
  assert.equal(parsePriceCents("12,5 €"), 1250);
  assert.equal(parsePriceCents(6.5), 650);
  assert.equal(parsePriceCents(18), 1800);
  assert.equal(parsePriceCents(1800), null); // unknown unit, never reinterpret as cents
  assert.equal(parsePriceCents(undefined), null);
  assert.equal(parsePriceCents(0), null);
  assert.equal(parsePriceCents("0"), null);
  assert.equal(isMissingPrice("0.00"), true);
  assert.equal(isMissingPrice("market price"), false);
  assert.equal(isMissingPrice("$0.00"), false);
  assert.equal(parsePriceCents("$12–$16"), null);
  assert.equal(parsePriceCents("market price"), null);
  assert.deepEqual(parsePrice("€12,50"), { cents: 1250, currency: "EUR" });
  assert.equal(parsePriceCents("$12 / $16"), null);
});

test("normalized rows keep unknown prices schema-valid", () => {
  const unknown = keywordPass({ name: "Market Fish", price: "market price" }, 0);
  assert.equal(unknown.priceCents, 0);
  assert.equal(unknown.priceVerified, false);

  const known = keywordPass({ name: "House Tea", price: "$0.00" }, 1);
  assert.equal(known.priceCents, 0);
  assert.equal(known.priceVerified, true);
});

test("LLM estimates only replace missing or scraper-zero prices and stay unverified", () => {
  const missing = keywordPass({ name: "Pasta", price: 0 }, 0);
  const estimated = mergeLlm(missing, { estimatedPriceCents: 1650 }, isMissingPrice(0));
  assert.equal(estimated.priceCents, 1650);
  assert.equal(estimated.priceVerified, false);
  assert.equal(mergeLlm(missing, { estimatedPriceCents: -100 }, true).priceCents, 0);
  assert.equal(mergeLlm(missing, { estimatedPriceCents: 1.5 }, true).priceCents, 0);
  assert.equal(mergeLlm(missing, { estimatedPriceCents: 50_000 }, true).priceCents, 0);
  assert.equal(mergeLlm(missing, null).priceCents, 0);
  assert.equal(mergeLlm(keywordPass({ name: "Fish", price: "market price" }, 3), { estimatedPriceCents: 1650 }, isMissingPrice("market price")).priceCents, 0);

  const known = keywordPass({ name: "Pasta", price: "$18.00" }, 1);
  assert.equal(mergeLlm(known, { estimatedPriceCents: 1650 }).priceCents, 1800);
  assert.equal(mergeLlm(known, { estimatedPriceCents: 1650 }).priceVerified, true);
  const free = keywordPass({ name: "Water", price: "$0.00" }, 2);
  assert.equal(mergeLlm(free, { estimatedPriceCents: 300 }).priceCents, 0);
});

test("price prompt includes menu reference prices and identifies missing prices", () => {
  const prompt = tagUser([{ index: 0, item: { name: "Pasta", price: 0, category: "Mains" } }],
    [{ name: "Pizza", price: "$19.00", category: "Mains" }]);
  assert.match(prompt, /"name":"Pizza","category":"Mains","price":"\$19.00"/);
  assert.match(prompt, /"name":"Pasta"[^\n]*"price":null/);
  assert.match(tagUser([{ index: 0, item: { name: "Fish", price: "market price" } }]), /"price":"market price"/);
});

test("keyword pass finds allergens and fails diets closed", () => {
  const paella = keywordPass({ name: "Seafood Paella", description: "prawns, mussels" }, 0);
  assert.equal(level(paella, "shellfish"), "contains");
  assert.ok(!paella.diet.includes("vegetarian"));
  const padThai = keywordPass({ name: "Pad Thai", description: "Rice noodles, egg, crushed peanuts" }, 1);
  assert.equal(level(padThai, "peanut"), "contains");
  assert.equal(level(padThai, "wheat"), "not_detected"); // rice noodles
  const ingredientOnly = keywordPass({ name: "House special", ingredients: ["sesame oil", "soy sauce"] }, 2);
  assert.equal(level(ingredientOnly, "sesame"), "contains");
  assert.equal(level(ingredientOnly, "soy"), "contains");
});

test("LLM may only raise; no LLM → untagged, may_contain everywhere else", () => {
  const base = keywordPass({ name: "Pad Thai", description: "Rice noodles, egg, crushed peanuts" }, 0);
  const merged = mergeLlm(base, { allergens: { peanut: "not_detected", fish: "contains" }, tags: ["Noodles"] });
  assert.equal(level(merged, "peanut"), "contains");
  assert.equal(level(merged, "fish"), "contains");
  assert.equal(merged.tagStatus, "tagged");
  const unread = mergeLlm(base, null);
  assert.equal(unread.tagStatus, "untagged");
  assert.equal(level(unread, "milk"), "may_contain");
  assert.equal(level(unread, "peanut"), "contains");
});

test("a complete tag reply includes the safety and diet fields", () => {
  const complete = { allergens: {}, diet: [], tags: ["pasta"], spice: 0, isDrink: false, shareable: false };
  assert.equal(isCompleteLlmTags(complete), true);
  assert.equal(isCompleteLlmTags({ ...complete, diet: undefined }), false);
  assert.equal(isCompleteLlmTags({ ...complete, allergens: { milk: "unknown" } }), false);
});

test("dish traits distinguish direct wording from preparation inferences", () => {
  assert.deepEqual(inferTaste("rice with fried egg"), []);
  assert.deepEqual(inferTaste("crispy grilled chicken"), [
    { contrast: "texture", value: -1, evidence: "stated", detail: "crispy" },
    { contrast: "char", value: 1, evidence: "inferred", detail: "grilled" },
  ]);
});
