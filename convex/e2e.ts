// Owner: Role 4. Full happy path with no client: `npm run e2e` (WIPES the deployment's app data first).
// Milestone 2 check: create → join ×4 → setHunger ×4 → (workflow) → pick ×4 → confirm ×4 → placed.
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { HUNGERS } from "./shared/enums";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(ctx: ActionCtx, partyId: Id<"parties">, status: string, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const p = await ctx.runQuery(api.parties.current, { partyId });
    if (p?.status === status) return p;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${status}`);
}

type E2EResult = {
  ok: boolean; partyId: Id<"parties">; negotiationMs: number; totalMs: number;
  lines: string[]; total: number; bubbles: string[];
  recommendations: {
    diner: string;
    mains: { rank: number; dish: string; reason: string; askServer: boolean }[];
    drink: { dish: string; reason: string; askServer: boolean } | null;
  }[];
  sharedDishes: { dish: string; sharedBy: string[] }[];
};

export const happyPath = internalAction({
  args: {},
  handler: async (ctx): Promise<E2EResult> => {
    const t0 = Date.now();
    const { restaurantId, userIds, hostDeviceId }: { restaurantId: Id<"restaurants">; userIds: Id<"users">[]; hostDeviceId: string } =
      await ctx.runMutation(internal.seed.base, {});
    const { partyId }: { partyId: Id<"parties"> } = await ctx.runMutation(api.parties.create, { restaurantId, size: 4, hostDeviceId });
    for (const userId of userIds) await ctx.runMutation(api.parties.join, { partyId, userId, via: "sim", hostDeviceId });
    const again = await ctx.runMutation(api.parties.join, { partyId, userId: userIds[0], via: "sim", hostDeviceId });
    if (again.result !== "already") throw new Error("double tap joined twice");
    for (const [i, userId] of userIds.entries()) {
      await ctx.runMutation(api.parties.setHunger, { partyId, userId, deviceId: `demo-diner-${i + 1}`, hunger: HUNGERS[i % 3] });
    }
    const tNeg = Date.now();
    await waitFor(ctx, partyId, "pick", 60_000);
    const negotiationMs = Date.now() - tNeg;
    const recommendations: E2EResult["recommendations"] = [];
    const dinerNames = new Map<string, string>();
    for (const [i, userId] of userIds.entries()) {
      const cands = await ctx.runQuery(api.orders.candidates, { partyId, userId });
      const user = await ctx.runQuery(internal.users.get, { userId });
      const diner = user?.name ?? `Diner ${i + 1}`;
      dinerNames.set(userId, diner);
      const mains = cands.filter((c) => !c.isDrink);
      const drink = cands.find((c) => c.isDrink);
      recommendations.push({
        diner,
        mains: mains.map((c) => ({ rank: c.rank, dish: c.name, reason: c.reason, askServer: c.askServer })),
        drink: drink ? { dish: drink.name, reason: drink.reason, askServer: drink.askServer } : null,
      });
      const top = mains[0];
      if (!top) throw new Error(`no candidates for diner ${i + 1}`);
      await ctx.runMutation(api.orders.pick, { partyId, userId, deviceId: `demo-diner-${i + 1}`, itemId: top.itemId });
    }
    await waitFor(ctx, partyId, "confirm", 5_000);
    for (const [i, userId] of userIds.entries()) {
      await ctx.runMutation(api.orders.confirm, { partyId, userId, deviceId: `demo-diner-${i + 1}` });
    }
    await waitFor(ctx, partyId, "placed", 5_000);
    const { lines, totals } = await ctx.runQuery(api.orders.lines, { partyId });
    const shares = Object.values(totals.perUser as Record<string, number>).reduce((a, b) => a + b, 0);
    if (shares !== totals.total) throw new Error(`shares ${shares} != total ${totals.total}`);
    const bubbles = (await ctx.runQuery(api.messages.list, { partyId })).messages.map((m) => m.text);
    const sharedDishes = lines
      .filter((line) => line.kind === "shared")
      .map((line) => ({ dish: line.name, sharedBy: line.sharedBy.map((id) => dinerNames.get(id) ?? "Someone") }));
    return {
      ok: true, partyId, negotiationMs, totalMs: Date.now() - t0,
      lines: lines.map((l) => l.name), total: totals.total, bubbles, recommendations, sharedDishes,
    };
  },
});
