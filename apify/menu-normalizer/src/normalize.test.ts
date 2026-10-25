import { test } from "node:test";
import assert from "node:assert/strict";
import { inferTaste, keywordPass, mergeLlm, parsePrice, parsePriceCents } from "./normalize.js";

const level = (item: ReturnType<typeof keywordPass>, a: string) => item.allergens.find((x) => x.allergen === a)!.level;

test("prices", () => {
  assert.equal(parsePriceCents("$12.50"), 1250);
  assert.equal(parsePriceCents("12,5 €"), 1250);
  assert.equal(parsePriceCents(6.5), 650);
  assert.equal(parsePriceCents(18), 1800);
  assert.equal(parsePriceCents(1800), null); // unknown unit, never reinterpret as cents
  assert.equal(parsePriceCents(undefined), null);
  assert.equal(parsePriceCents("$12–$16"), null);
  assert.equal(parsePriceCents("market price"), null);
  assert.deepEqual(parsePrice("€12,50"), { cents: 1250, currency: "EUR" });
  assert.equal(parsePriceCents("$12 / $16"), null);
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

test("dish traits distinguish direct wording from preparation inferences", () => {
  assert.deepEqual(inferTaste("rice with fried egg"), []);
  assert.deepEqual(inferTaste("crispy grilled chicken"), [
    { contrast: "texture", value: -1, evidence: "stated", detail: "crispy" },
    { contrast: "char", value: 1, evidence: "inferred", detail: "grilled" },
  ]);
});
