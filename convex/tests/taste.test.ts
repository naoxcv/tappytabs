import { describe, expect, test } from "vitest";
import { PAIRS, tasteFit, tasteFromAnswers } from "../agents/taste";
import { item, user } from "./fixtures";
import { fallbackVote, projectedOrderPriceScore, rankItems, scoreContext, scoreItem } from "../agents/ranking";

describe("pair interpretation", () => {
  test("old card answers do not map onto revised comparisons", () => {
    expect(tasteFromAnswers([{ pairId: "chicken_texture", choice: "a" }])).toEqual([]);
  });

  test.each(PAIRS)("$id changes only $contrast", (pair) => {
    const a = tasteFromAnswers([{ pairId: pair.id, choice: "a" }]);
    const b = tasteFromAnswers([{ pairId: pair.id, choice: "b" }]);
    expect(a).toHaveLength(1);
    expect(a[0].contrast).toBe(pair.contrast);
    expect(a[0].value).toBe(-1);
    expect(b[0].value).toBe(1);
  });

  test("both and neither create no aversion; a correction survives recomputation", () => {
    const answers = [{ pairId: PAIRS[0].id, choice: "a" as const }];
    expect(tasteFromAnswers([{ pairId: PAIRS[0].id, choice: "neither" }])[0]).toMatchObject({ value: 0, confidence: 0.1 });
    expect(tasteFromAnswers([{ pairId: PAIRS[0].id, choice: "both" }])[0].value).toBe(0);
    expect(tasteFromAnswers(answers, [{ contrast: "texture", value: null }])).toEqual([]);
    expect(tasteFromAnswers(answers, [{ contrast: "texture", value: 1 }])[0].value).toBe(1);
  });

  test("opposite diners rank the same menu differently", () => {
    const crisp = item({ name: "Crisp chicken", tags: [], priceCents: 1500, taste: [{ contrast: "texture", value: -1, evidence: "stated", detail: "crisp" }] });
    const tender = item({ name: "Tender chicken", tags: [], priceCents: 1500, taste: [{ contrast: "texture", value: 1, evidence: "stated", detail: "tender" }] });
    const menu = [crisp, tender];
    const ctx = scoreContext(menu);
    const first = user({ name: "A", taste: tasteFromAnswers([{ pairId: PAIRS[0].id, choice: "a" }]) });
    const second = user({ name: "B", taste: tasteFromAnswers([{ pairId: PAIRS[0].id, choice: "b" }]) });
    expect(rankItems(menu, (i) => scoreItem(i, first, "normal", ctx))[0].name).toBe("Crisp chicken");
    expect(rankItems(menu, (i) => scoreItem(i, second, "normal", ctx))[0].name).toBe("Tender chicken");
    expect(tasteFit(first.taste, tender.taste)).toBeLessThan(0);
  });

  test("projected price includes drinks and shared cost per diner only when verified", () => {
    const main = item({ name: "Main", priceCents: 2000 });
    const drink = item({ name: "Drink", category: "drinks", isDrink: true, priceCents: 700 });
    const shared = item({ name: "Shared", category: "shareables", shareable: true, priceCents: 1000 });
    const ctx = { medianByRole: { main: 1800, drink: 500, shared: 800 } };
    const diner = user({ name: "Value", priceSensitivity: "a_lot" });
    expect(projectedOrderPriceScore(main, drink, [shared], diner, ctx)).toBe(-1);
    expect(projectedOrderPriceScore({ ...main, priceVerified: false }, drink, [shared], diner, ctx)).toBe(0);
  });

  test("opposite diners disagree on safe shared plates", () => {
    const crisp = item({ name: "Crisp sprouts", category: "shareables", shareable: true, taste: [{ contrast: "texture", value: -1, evidence: "stated", detail: "crisp" }] });
    const tender = item({ name: "Tender sprouts", category: "shareables", shareable: true, taste: [{ contrast: "texture", value: 1, evidence: "stated", detail: "tender" }] });
    const a = user({ name: "A", taste: tasteFromAnswers([{ pairId: PAIRS[0].id, choice: "a" }]) });
    const b = user({ name: "B", taste: tasteFromAnswers([{ pairId: PAIRS[0].id, choice: "b" }]) });
    expect(fallbackVote([crisp, tender], a, "normal", [crisp, tender]).yes).toEqual([crisp._id]);
    expect(fallbackVote([crisp, tender], b, "normal", [crisp, tender]).yes).toEqual([tender._id]);
  });
});
