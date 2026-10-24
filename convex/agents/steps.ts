// Owner: Role 3. The three step actions Role 4's workflow calls (Shared contract §2).
// Rules: return within 8 s, NEVER throw. On any failure return the deterministic fallback with fallback: true.
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { PartyContext } from "../negotiation";
import { agentDraftV, agentVoteV, planV, type AgentDraft, type AgentVote, type Plan } from "../shared/types";
import { summaryTemplate } from "./bubbles";
import { callJson, type CallLog } from "./models/provider";
import { draftPrompt, draftSchema, repairDraft } from "./prompts/draft";
import { repairSummary, summaryPrompt, summarySchema } from "./prompts/summaryBubble";
import { repairVote, votePrompt, voteSchema } from "./prompts/vote";
import { fallbackDraft, fallbackVote, isSharePlate, mainPool } from "./ranking";
import { buildPlan, sharedTarget, tally } from "./rules";
import { safeSet, sharedSafeSet } from "./safety";

export const logTo = (ctx: ActionCtx, partyId?: Id<"parties">, userId?: Id<"users">) =>
  async (log: CallLog) => {
    try {
      await ctx.runMutation(internal.agentLogs.insert, { partyId, userId, ...log });
    } catch {
      /* logging must never break a step */
    }
  };

const emptyDraft = (userId: string): AgentDraft => ({
  userId, mains: [], drink: null, sharedProposals: [], bubble: "Still thinking…", fallback: true,
});

export const draftStep = internalAction({
  args: { partyId: v.id("parties"), userId: v.id("users") },
  returns: agentDraftV,
  handler: async (ctx, { partyId, userId }): Promise<AgentDraft> => {
    let fb = emptyDraft(userId);
    try {
      const c: PartyContext = await ctx.runQuery(internal.negotiation.context, { partyId });
      const user = c.users.find((u) => u._id === userId);
      if (!user) return fb;
      const hunger = c.hungers[userId] ?? "normal";
      fb = fallbackDraft(c.menu, user, hunger);
      const mine = safeSet(c.menu, user);
      const mains = mainPool(mine);
      const drinks = mine.filter((i) => i.isDrink);
      const shared = sharedSafeSet(c.menu, [user]).filter(isSharePlate); // pooling re-checks against the whole party
      const p = draftPrompt({ user, hunger, mains, drinks, shared });
      const r = await callJson({
        prompt: "draft", primary: "bitdeer", system: p.system, user: p.user, schema: draftSchema,
        onLog: logTo(ctx, partyId, userId),
      });
      if (!r) return fb;
      return repairDraft(r.data, {
        mains: new Set(mains.map((m) => m._id)),
        drinks: new Set(drinks.map((d) => d._id)),
        shared: new Set(shared.map((s) => s._id)),
      }, fb);
    } catch {
      return fb;
    }
  },
});

export const voteStep = internalAction({
  args: { partyId: v.id("parties"), userId: v.id("users"), pooled: v.array(v.string()), drafts: v.array(agentDraftV) },
  returns: agentVoteV,
  handler: async (ctx, { partyId, userId, pooled, drafts }): Promise<AgentVote> => {
    let fb: AgentVote = { userId, yes: [...pooled], bubble: "Sounds good to me.", fallback: true };
    try {
      const c: PartyContext = await ctx.runQuery(internal.negotiation.context, { partyId });
      const user = c.users.find((u) => u._id === userId);
      if (!user) return fb;
      const hunger = c.hungers[userId] ?? "normal";
      const pooledItems = c.menu.filter((m) => pooled.includes(m._id));
      fb = fallbackVote(pooledItems, user, hunger, c.menu);
      if (pooledItems.length === 0) return fb;
      const names = Object.fromEntries(c.users.map((u) => [u._id, u.name]));
      const p = votePrompt({ user, hunger, pooled: pooledItems, drafts, names });
      const r = await callJson({
        prompt: "vote", primary: "claude", system: p.system, user: p.user, schema: voteSchema,
        onLog: logTo(ctx, partyId, userId),
      });
      return r ? repairVote(r.data, new Set(pooled), fb) : fb;
    } catch {
      return fb;
    }
  },
});

export const settleStep = internalAction({
  args: { partyId: v.id("parties"), pooled: v.array(v.string()), drafts: v.array(agentDraftV), votes: v.array(agentVoteV) },
  returns: planV,
  handler: async (ctx, { partyId, pooled, drafts, votes }): Promise<Plan> => {
    const c: PartyContext = await ctx.runQuery(internal.negotiation.context, { partyId });
    const target = sharedTarget(c.users.map((u) => c.hungers[u._id] ?? "normal"));
    const chosen = tally(pooled, votes, c.menu, target);
    const plan = buildPlan(drafts, chosen, c.menu, c.users);
    const name = (id: string) => c.menu.find((m) => m._id === id)?.name ?? "a dish";
    const userName = (id: string) => c.users.find((u) => u._id === id)?.name ?? "someone";
    const template = summaryTemplate(plan.shared.map((s) => name(s.itemId)), plan.mains.length);
    try {
      const p = summaryPrompt({
        restaurant: c.restaurantName,
        shared: plan.shared.map((s) => ({ name: name(s.itemId), sharers: s.sharedBy.map(userName) })),
        mains: plan.mains.map((m) => ({ diner: userName(m.userId), dish: name(m.itemId) })),
      });
      const r = await callJson({
        prompt: "summaryBubble", primary: "bitdeer", system: p.system, user: p.user, schema: summarySchema,
        onLog: logTo(ctx, partyId),
      });
      return { ...plan, summaryBubble: r ? repairSummary(r.data, template) : template, fallback: !r };
    } catch {
      return { ...plan, summaryBubble: template, fallback: true };
    }
  },
});
