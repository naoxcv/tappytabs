// Owner: Role 4. Demo data. Run with `npm run seed` (base) or `npm run seed:negotiated` / `seed:placed`.
//   base:        wipes app tables; writes the restaurant, menu snapshot and 4 personas
//   negotiated:  base + a 4-person party already at `pick` (candidates, shared lines, bubbles), no models called
//   placed:      negotiated + everyone picked rank-1 and confirmed → `placed`
// Fixed ids for mocks: host deviceId "demo-restaurant", diner deviceIds "demo-diner-1".."demo-diner-4".
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { DEMO_HOST_DEVICE, DEMO_RESTAURANT, SEED_MENU, SEED_USERS } from "./seedData";
import { postBubble } from "./messages";
import { fallbackDraft, fallbackVote } from "./agents/ranking";
import { buildPlan, poolForParty, sharedTarget, tally } from "./agents/rules";
import { summaryTemplate } from "./agents/bubbles";
import { fallbackConversation } from "./agents/prompts/summaryBubble";
import { menuOf, usersOf, membersOf } from "./lib/guards";

const TABLES = ["agentLogs", "messages", "candidates", "orderLines", "tapSessions", "tapHosts", "tapClaims", "tapExits", "members", "parties", "menuItems", "restaurants", "users"] as const;

async function wipe(ctx: MutationCtx) {
  for (const t of TABLES) for (const row of await ctx.db.query(t).collect()) await ctx.db.delete(row._id);
}

async function writeBase(ctx: MutationCtx) {
  await wipe(ctx);
  const restaurantId = await ctx.db.insert("restaurants", { ...DEMO_RESTAURANT, menuSource: "seed" });
  for (const item of SEED_MENU) await ctx.db.insert("menuItems", { restaurantId, ...item });
  const userIds: Id<"users">[] = [];
  for (const u of SEED_USERS) {
    userIds.push(await ctx.db.insert("users", {
      ...u, allergies: [...u.allergies], diet: [...u.diet], likes: [...u.likes], dislikes: [...u.dislikes],
      cuisines: [...u.cuisines], dislikedCuisines: [...u.dislikedCuisines], likedCategories: [...u.likedCategories],
    }));
  }
  return { restaurantId, userIds };
}

export const base = internalMutation({
  args: {},
  handler: async (ctx) => {
    const { restaurantId, userIds } = await writeBase(ctx);
    return { restaurantId, userIds, hostDeviceId: DEMO_HOST_DEVICE };
  },
});

/** Runs the deterministic negotiation inline (same pure code as the workflow's fallback path). */
async function negotiateInline(ctx: MutationCtx, partyId: Id<"parties">, restaurantId: Id<"restaurants">) {
  const users = await usersOf(ctx, await membersOf(ctx, partyId));
  const menu = await menuOf(ctx, restaurantId);
  const drafts = users.map((u) => fallbackDraft(menu, u, "normal"));
  const { pooled, drops, topUps } = poolForParty(drafts, menu, users);
  const pooledItems = menu.filter((m) => pooled.includes(m._id));
  const votes = users.map((u) => fallbackVote(pooledItems, u, "normal", menu));
  const chosen = tally(pooled, votes, menu, sharedTarget(users.map(() => "normal" as const)));
  const plan = buildPlan(drafts, chosen, menu, users);
  const names = plan.shared.map((s) => menu.find((m) => m._id === s.itemId)?.name ?? "a dish");
  const transcriptContext = {
    styleSeed: partyId,
    restaurant: DEMO_RESTAURANT.name,
    users,
    menu,
    drafts: drafts.map(({ userId, sharedProposals }) => ({ userId, sharedProposals })),
    votes,
    pooled,
    plan,
    drops,
    topUps,
  };
  const conversation = fallbackConversation(
    transcriptContext,
    summaryTemplate(names, plan.mains.length),
  );
  for (const d of drafts) {
    let rank = 1;
    for (const m of d.mains) {
      await ctx.db.insert("candidates", { partyId, userId: d.userId as Id<"users">, itemId: m.itemId as Id<"menuItems">, rank: rank++, reason: m.reason, isDrink: false, askServer: false });
    }
    if (d.drink) {
      await ctx.db.insert("candidates", { partyId, userId: d.userId as Id<"users">, itemId: d.drink.itemId as Id<"menuItems">, rank: 0, reason: d.drink.reason, isDrink: true, askServer: false });
    }
  }
  for (const s of plan.shared) {
    await ctx.db.insert("orderLines", { partyId, itemId: s.itemId as Id<"menuItems">, qty: 1, kind: "shared", sharedBy: s.sharedBy as Id<"users">[], addedBy: "agent" });
  }
  for (const message of conversation.conversation) {
    await postBubble(ctx, partyId, message.speakerId as Id<"users"> | undefined, message.text);
  }
  await postBubble(ctx, partyId, undefined, conversation.summaryBubble);
  return drafts;
}

export const scenario = internalMutation({
  args: { scenario: v.union(v.literal("negotiated"), v.literal("placed")) },
  handler: async (ctx, { scenario }) => {
    const { restaurantId, userIds } = await writeBase(ctx);
    const now = Date.now();
    const partyId = await ctx.db.insert("parties", {
      restaurantId, hostDeviceId: DEMO_HOST_DEVICE, size: userIds.length, status: "pick", joinCode: "DEMO42", epoch: 0,
      negotiationStartedAt: now, committedAt: now, pickDeadline: now + 10 * 60_000,
    });
    for (const [i, userId] of userIds.entries()) {
      await ctx.db.insert("members", { partyId, userId, joinedVia: "sim", joinedAt: now + i, hunger: "normal" });
    }
    const drafts = await negotiateInline(ctx, partyId, restaurantId);
    if (scenario === "placed") {
      for (const m of await membersOf(ctx, partyId)) {
        const d = drafts.find((x) => x.userId === m.userId)!;
        const main = d.mains[0];
        if (main) await ctx.db.insert("orderLines", { partyId, itemId: main.itemId as Id<"menuItems">, qty: 1, kind: "main", sharedBy: [m.userId], addedBy: "agent" });
        if (d.drink) await ctx.db.insert("orderLines", { partyId, itemId: d.drink.itemId as Id<"menuItems">, qty: 1, kind: "drink", sharedBy: [m.userId], addedBy: "agent" });
        await ctx.db.patch(m._id, { pickedItemId: main?.itemId as Id<"menuItems"> | undefined, confirmedAt: now });
      }
      await ctx.db.patch(partyId, { status: "placed", placedAt: now });
    }
    return { partyId, restaurantId, userIds, hostDeviceId: DEMO_HOST_DEVICE, joinCode: "DEMO42" };
  },
});
