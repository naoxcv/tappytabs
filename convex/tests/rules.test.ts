// Owner: Role 3. Ranking, negotiation rules, substitutes, personality.
import { describe, expect, test } from "vitest";
import { fallbackDraft, fallbackVote, scoreContext, scoreItem } from "../agents/ranking";
import { buildPlan, poolForParty, sharedTarget, tally } from "../agents/rules";
import { substituteFor } from "../agents/substitute";
import { personalityFrom } from "../agents/personalities";
import { isSafeFor } from "../agents/safety";
import { LEO, MAYA, MENU, PARTY, SAM, item, user } from "./fixtures";

describe("sharedTarget", () => {
  test.each([
    [["normal", "normal", "normal", "normal"], 2],
    [["snack", "snack"], 1],
    [["starving", "starving", "starving", "starving"], 3],
    [["snack"], 1],
  ] as const)("%j → %i", (hungers, n) => expect(sharedTarget([...hungers])).toBe(n));
});

describe("tally", () => {
  const a = item({ name: "A", priceCents: 1000, menuOrder: 2 });
  const b = item({ name: "B", priceCents: 800, menuOrder: 1 });
  const c = item({ name: "C", priceCents: 800, menuOrder: 0 });
  const menu = [a, b, c];
  test("most votes win", () => {
    const votes = [{ userId: "1", yes: [a._id], bubble: "", fallback: true }, { userId: "2", yes: [a._id, b._id], bubble: "", fallback: true }];
    expect(tally([a._id, b._id, c._id], votes, menu, 1)).toEqual([a._id]);
  });
  test("ties: lower price, then menu order; zero votes still deterministic", () => {
    expect(tally([a._id, b._id, c._id], [], menu, 2)).toEqual([c._id, b._id]);
  });
});

describe("fallbackDraft", () => {
  test("3 safe mains, a safe drink, shared proposals only clean for this diner", () => {
    for (const u of PARTY) {
      const d = fallbackDraft(MENU, u, "normal");
      expect(d.mains.length).toBeLessThanOrEqual(3);
      expect(d.fallback).toBe(true);
      for (const m of d.mains) expect(isSafeFor(MENU.find((i) => i._id === m.itemId)!, [u]).safe).toBe(true);
      if (d.drink) expect(MENU.find((i) => i._id === d.drink!.itemId)!.isDrink).toBe(true);
      for (const id of d.sharedProposals) expect(isSafeFor(MENU.find((i) => i._id === id)!, [u], "shared").safe).toBe(true);
      expect(d.bubble.length).toBeLessThanOrEqual(120);
    }
  });

  test("clean items outrank askServer items", () => {
    const ctx = scoreContext(MENU);
    const curry = { ...MENU.find((i) => i.name === "Tofu Curry")!, askServer: true };
    const bowl = { ...MENU.find((i) => i.name === "Rice Bowl")!, askServer: false };
    expect(scoreItem(bowl, LEO, "normal", ctx)).toBeGreaterThan(scoreItem(curry, LEO, "normal", ctx));
  });
});

describe("pooling", () => {
  test("drops the paella for Maya and keeps the pool clean for everyone", () => {
    const drafts = PARTY.map((u) => fallbackDraft(MENU, u, "normal"));
    drafts[3] = { ...drafts[3], sharedProposals: [MENU[0]._id] }; // Sam proposes paella
    const pool = poolForParty(drafts, MENU, PARTY);
    expect(pool.pooled).not.toContain(MENU[0]._id);
    expect(pool.drops[0].item.name).toBe("Seafood Paella");
    for (const id of pool.pooled) expect(isSafeFor(MENU.find((i) => i._id === id)!, PARTY, "shared").safe).toBe(true);
  });

  test("buildPlan shares a dish only with members it is clean for", () => {
    const fries = MENU.find((i) => i.name === "Fries")!;
    const plan = buildPlan([], [fries._id], MENU, [...PARTY, user({ name: "Mo", allergies: ["milk"] })]);
    expect(plan.shared[0].sharedBy).not.toContain("user_Mo");
  });
});

describe("fallbackVote", () => {
  test("only votes for pooled ids, at least one", () => {
    const pooled = MENU.filter((i) => i.name === "Edamame" || i.name === "Fries");
    const v = fallbackVote(pooled, MAYA, "normal", MENU);
    expect(v.yes.length).toBeGreaterThan(0);
    for (const id of v.yes) expect(pooled.map((p) => p._id)).toContain(id);
  });
});

describe("substituteFor", () => {
  test("same category, safe, not already ordered", () => {
    const pho = MENU.find((i) => i.name === "Beef Pho")!;
    const bowl = MENU.find((i) => i.name === "Rice Bowl")!;
    const sub = substituteFor(pho, SAM, MENU, [bowl._id]);
    expect(sub).not.toBeNull();
    expect(sub!.item.category).toBe("mains");
    expect(sub!.item._id).not.toBe(bowl._id);
    expect(isSafeFor(sub!.item, [SAM]).safe).toBe(true);
  });
});

describe("personalityFrom", () => {
  const base = { name: "X", allergies: [], diet: [], spice: 2, likes: ["a"], dislikes: [], cuisines: [] };
  test("price answer → budget_minded", () =>
    expect(personalityFrom(base, [{ id: "q", question: "?", answer: "Price" }])).toBe("budget_minded"));
  test("many liked categories → adventurous", () =>
    expect(personalityFrom({ ...base, likedCategories: ["a", "b", "c", "d"] }, [])).toBe("adventurous"));
  test("more dislikes → picky", () =>
    expect(personalityFrom({ ...base, dislikes: ["x", "y"] }, [])).toBe("picky"));
});
