// Owner: Role 4. The negotiation workflow: draft (parallel) → pool + drop bubbles → vote (parallel) → settle → commit.
// Role 3's steps are black boxes that never throw. A 30 s rescue commits fallback agents if anything hangs.
import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { TIMING, type Hunger } from "./shared/enums";
import { agentDraftV, agentVoteV, planV, type AgentDraft, type AgentVote, type MenuItemLite, type Plan, type UserLite } from "./shared/types";
import { membersOf, menuOf, usersOf } from "./lib/guards";
import { postBubble } from "./messages";
import { dropBubbleText, summaryTemplate, topUpBubble } from "./agents/bubbles";
import { fallbackDraft, fallbackVote } from "./agents/ranking";
import { buildPlan, poolForParty, sharedTarget, tally } from "./agents/rules";
import { isSafeFor, safeSet } from "./agents/safety";

export const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: { maxParallelism: 10 },
});

/** Called from parties.setHunger once every diner has chosen. */
export async function startNegotiation(ctx: MutationCtx, partyId: Id<"parties">, epoch: number) {
  await workflow.start(ctx, internal.negotiation.negotiate, { partyId, epoch });
  await ctx.scheduler.runAfter(TIMING.rescueAfterMs, internal.negotiation.rescue, { partyId, epoch });
}

export const negotiate = workflow
  .define({ args: { partyId: v.id("parties"), epoch: v.number() } })
  .handler(async (step, { partyId, epoch }): Promise<void> => {
    const { userIds } = await step.runQuery(internal.negotiation.load, { partyId });
    const drafts: AgentDraft[] = await Promise.all(
      userIds.map((userId) => step.runAction(internal.agents.steps.draftStep, { partyId, userId })),
    );
    const { pooled, live } = await step.runMutation(internal.negotiation.poolAndPost, { partyId, epoch, drafts });
    if (!live) return;
    const votes: AgentVote[] = await Promise.all(
      userIds.map((userId) => step.runAction(internal.agents.steps.voteStep, { partyId, userId, pooled, drafts })),
    );
    await step.runMutation(internal.negotiation.postVotes, { partyId, epoch, votes });
    const plan: Plan = await step.runAction(internal.agents.steps.settleStep, { partyId, pooled, drafts, votes });
    await step.runMutation(internal.negotiation.commit, { partyId, epoch, drafts, plan });
  });

export const load = internalQuery({
  args: { partyId: v.id("parties") },
  handler: async (ctx, { partyId }): Promise<{ userIds: Id<"users">[] }> => {
    const members = await membersOf(ctx, partyId);
    return { userIds: members.sort((a, b) => a.joinedAt - b.joinedAt).map((m) => m.userId) };
  },
});

/** Everything Role 3's steps read. Shapes are the pure MenuItemLite / UserLite types. */
export type PartyContext = {
  restaurantName: string;
  users: UserLite[];
  hungers: Record<string, Hunger>;
  menu: MenuItemLite[];
};

export const context = internalQuery({
  args: { partyId: v.id("parties") },
  handler: async (ctx, { partyId }): Promise<PartyContext> => {
    const party = await ctx.db.get(partyId);
    if (!party) throw new Error("party not found");
    const members = await membersOf(ctx, partyId);
    const users = await usersOf(ctx, members);
    const restaurant = await ctx.db.get(party.restaurantId);
    const hungers: Record<string, Hunger> = {};
    for (const m of members) hungers[m.userId] = m.hunger ?? "normal";
    return {
      restaurantName: restaurant?.name ?? "the restaurant",
      users: users as UserLite[],
      hungers,
      menu: (await menuOf(ctx, party.restaurantId)) as MenuItemLite[],
    };
  },
});

async function isLive(ctx: MutationCtx, partyId: Id<"parties">, epoch: number) {
  const p = await ctx.db.get(partyId);
  return !!p && p.epoch === epoch && p.status === "negotiating" && !p.committedAt;
}

/** Opening bubbles, then pool shared proposals and drop any that are unsafe for someone (with an exact bubble). */
export const poolAndPost = internalMutation({
  args: { partyId: v.id("parties"), epoch: v.number(), drafts: v.array(agentDraftV) },
  handler: async (ctx, { partyId, epoch, drafts }): Promise<{ pooled: string[]; live: boolean }> => {
    if (!(await isLive(ctx, partyId, epoch))) return { pooled: [], live: false };
    const party = (await ctx.db.get(partyId))!;
    const users = await usersOf(ctx, await membersOf(ctx, partyId));
    const menu = await menuOf(ctx, party.restaurantId);
    for (const d of drafts) await postBubble(ctx, partyId, d.userId as Id<"users">, d.bubble);
    const { pooled, drops, topUps } = poolForParty(drafts, menu, users);
    for (const d of drops) await postBubble(ctx, partyId, undefined, dropBubbleText(d.item, d.failed));
    for (const item of topUps) await postBubble(ctx, partyId, undefined, topUpBubble(item));
    return { pooled, live: true };
  },
});

export const postVotes = internalMutation({
  args: { partyId: v.id("parties"), epoch: v.number(), votes: v.array(agentVoteV) },
  handler: async (ctx, { partyId, epoch, votes }) => {
    if (!(await isLive(ctx, partyId, epoch))) return;
    for (const vote of votes) await postBubble(ctx, partyId, vote.userId as Id<"users">, vote.bubble);
  },
});

/** Idempotent: the first commit wins (workflow or rescue); later ones are ignored. */
export const commit = internalMutation({
  args: { partyId: v.id("parties"), epoch: v.number(), drafts: v.array(agentDraftV), plan: planV },
  handler: async (ctx, { partyId, epoch, drafts, plan }) => {
    if (!(await isLive(ctx, partyId, epoch))) return;
    const party = (await ctx.db.get(partyId))!;
    const users = await usersOf(ctx, await membersOf(ctx, partyId));
    const menu = await menuOf(ctx, party.restaurantId);
    const byId = new Map(menu.map((m) => [m._id as string, m]));

    for (const user of users) {
      const draft = drafts.find((d) => d.userId === user._id) ?? fallbackDraft(menu, user, "normal");
      // Defense in depth: re-check every candidate before a phone can show it.
      const allowed = new Map(safeSet(menu, user).map((i) => [i._id as string, i]));
      let rank = 1;
      for (const m of draft.mains) {
        const item = allowed.get(m.itemId);
        if (!item) continue;
        await ctx.db.insert("candidates", {
          partyId, userId: user._id, itemId: item._id, rank: rank++, reason: m.reason, isDrink: false, askServer: item.askServer,
        });
      }
      const drink = draft.drink && allowed.get(draft.drink.itemId);
      if (draft.drink && drink) {
        await ctx.db.insert("candidates", {
          partyId, userId: user._id, itemId: drink._id, rank: 0, reason: draft.drink.reason, isDrink: true, askServer: drink.askServer,
        });
      }
    }
    for (const s of plan.shared) {
      const item = byId.get(s.itemId);
      const sharers = users.filter((u) => s.sharedBy.includes(u._id));
      if (!item || sharers.length === 0 || !isSafeFor(item, sharers, sharers.length > 1 ? "shared" : "personal").safe) continue;
      await ctx.db.insert("orderLines", {
        partyId, itemId: item._id, qty: s.qty, kind: "shared", sharedBy: sharers.map((u) => u._id), addedBy: "agent",
      });
    }
    const showAt = await postBubble(ctx, partyId, undefined, plan.summaryBubble);
    await ctx.db.patch(partyId, { committedAt: Date.now() });
    await ctx.scheduler.runAt(showAt + 1_500, internal.parties.advance, { partyId, epoch });
  },
});

/** 30 s after start: if nothing committed, run the whole negotiation with fallback agents and commit. */
export const rescue = internalAction({
  args: { partyId: v.id("parties"), epoch: v.number() },
  handler: async (ctx, { partyId, epoch }): Promise<void> => {
    const c: PartyContext = await ctx.runQuery(internal.negotiation.context, { partyId });
    const drafts = c.users.map((u) => fallbackDraft(c.menu, u, c.hungers[u._id] ?? "normal"));
    const { pooled, live } = await ctx.runMutation(internal.negotiation.poolAndPost, { partyId, epoch, drafts });
    if (!live) return;
    const pooledItems = c.menu.filter((m) => pooled.includes(m._id));
    const votes = c.users.map((u) => fallbackVote(pooledItems, u, c.hungers[u._id] ?? "normal", c.menu));
    const chosen = tally(pooled, votes, c.menu, sharedTarget(c.users.map((u) => c.hungers[u._id] ?? "normal")));
    const partial = buildPlan(drafts, chosen, c.menu, c.users);
    const names = partial.shared.map((s) => c.menu.find((m) => m._id === s.itemId)?.name ?? "a dish");
    const plan: Plan = { ...partial, summaryBubble: summaryTemplate(names, partial.mains.length), fallback: true };
    await ctx.runMutation(internal.negotiation.commit, { partyId, epoch, drafts, plan });
  },
});
