// Owner: Role 3. Acceptance: zero allergen/diet violations across 500 randomized full negotiations
// (fallback agents, random users, random menus). Also checks a "hostile model" that proposes every id.
import { describe, expect, test } from "vitest";
import { ALLERGENS, DIETS, HUNGERS, type Allergen, type Diet } from "../shared/enums";
import type { AgentDraft, MenuItemLite, UserLite } from "../shared/types";
import { fallbackDraft, fallbackVote, mainPool } from "../agents/ranking";
import { buildPlan, poolForParty, sharedTarget, tally } from "../agents/rules";
import { isSafeFor, safeSet, sharedSafeSet } from "../agents/safety";
import { repairDraft } from "../agents/prompts/draft";

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

function randomMenu(r: () => number, n: number): MenuItemLite[] {
  const levels = ["contains", "may_contain", "not_detected", "not_detected", "not_detected"] as const;
  return Array.from({ length: n }, (_, i) => ({
    _id: `m${i}`, name: `Dish ${i}`, category: r() < 0.2 ? "drinks" : r() < 0.4 ? "shareables" : "mains",
    tags: [], description: "", priceCents: 500 + Math.floor(r() * 2500), menuOrder: i, spice: Math.floor(r() * 5),
    isDrink: false, shareable: r() < 0.4, tagStatus: (r() < 0.05 ? "untagged" : "tagged") as MenuItemLite["tagStatus"],
    allergens: ALLERGENS.filter(() => r() < 0.9).map((allergen) => ({ allergen, level: levels[Math.floor(r() * levels.length)] })),
    diet: DIETS.filter(() => r() < 0.4),
  })).map((m) => ({ ...m, isDrink: m.category === "drinks", shareable: m.category === "drinks" ? false : m.shareable }));
}

function randomUser(r: () => number, i: number): UserLite {
  return {
    _id: `u${i}`, name: `User${i}`, spice: Math.floor(r() * 5), likes: [], dislikes: [], cuisines: [],
    allergies: ALLERGENS.filter(() => r() < 0.15) as Allergen[],
    diet: (r() < 0.25 ? [DIETS[Math.floor(r() * DIETS.length)]] : []) as Diet[],
  };
}

describe("randomized safety (500 runs)", () => {
  test("no violation in candidates, shared plan, or repaired model drafts", () => {
    const r = rng(42);
    let checks = 0;
    for (let run = 0; run < 500; run++) {
      const menu = randomMenu(r, 15 + Math.floor(r() * 25));
      const users = Array.from({ length: 2 + Math.floor(r() * 5) }, (_, i) => randomUser(r, i));
      const hungers = users.map(() => HUNGERS[Math.floor(r() * 3)]);
      const drafts: AgentDraft[] = users.map((u, i) => {
        const fb = fallbackDraft(menu, u, hungers[i]);
        // A hostile/buggy model that returns every id on the menu must be repaired back to safety.
        const mine = safeSet(menu, u);
        const hostile = {
          mains: menu.map((m) => ({ itemId: m._id, reason: "trust me" })).slice(0, 3),
          drink: { itemId: menu[0]._id, reason: "" },
          sharedProposals: menu.map((m) => m._id),
        };
        return repairDraft(hostile, {
          mains: new Set(mainPool(mine).map((m) => m._id)),
          drinks: new Set(mine.filter((m) => m.isDrink).map((m) => m._id)),
          shared: new Set(sharedSafeSet(menu, [u]).map((m) => m._id)),
        }, fb);
      });
      drafts.forEach((d, i) => {
        for (const m of d.mains) { expect(isSafeFor(menu.find((x) => x._id === m.itemId)!, [users[i]]).safe).toBe(true); checks++; }
        if (d.drink) { expect(isSafeFor(menu.find((x) => x._id === d.drink!.itemId)!, [users[i]]).safe).toBe(true); checks++; }
        expect(d.bubble.length).toBeLessThanOrEqual(120);
      });
      const { pooled } = poolForParty(drafts, menu, users);
      for (const id of pooled) { expect(isSafeFor(menu.find((x) => x._id === id)!, users, "shared").safe).toBe(true); checks++; }
      const pooledItems = menu.filter((m) => pooled.includes(m._id));
      const votes = users.map((u, i) => fallbackVote(pooledItems, u, hungers[i], menu));
      const plan = buildPlan(drafts, tally(pooled, votes, menu, sharedTarget(hungers)), menu, users);
      for (const s of plan.shared) {
        const sharers = users.filter((u) => s.sharedBy.includes(u._id));
        expect(isSafeFor(menu.find((x) => x._id === s.itemId)!, sharers, "shared").safe).toBe(true);
        checks++;
      }
    }
    expect(checks).toBeGreaterThan(1000);
  });
});
