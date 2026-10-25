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
import { conversationPrompt, conversationSchema, fallbackConversation, repairConversation } from "./prompts/summaryBubble";
import { repairVote, votePrompt, voteSchema } from "./prompts/vote";
import { fallbackDraft, fallbackVote, isSharePlate, mainPool, rankItems, scoreContext, scoreItem } from "./ranking";
import { buildPlan, poolForParty, sharedTarget, tally } from "./rules";
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
  userId, mains: [], drink: null, sharedProposals: [], bubble: "Thinking.", fallback: true,
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
      const scoreCtx = scoreContext(c.menu);
      const mains = rankItems(mainPool(mine), (item) => scoreItem(item, user, hunger, scoreCtx));
      const drinks = mine.filter((i) => i.isDrink);
      const shared = sharedSafeSet(c.menu, [user]).filter(isSharePlate); // pooling re-checks against the whole party
      const p = draftPrompt({ user, hunger, mains, drinks, shared });
      const r = await callJson({
        prompt: "draft", primary: "bitdeer", system: p.system, user: p.user, schema: draftSchema,
        onLog: logTo(ctx, partyId, userId),
      });
      if (!r) return fb;
      const repaired = repairDraft(r.data, {
        mains: new Set(mains.map((m) => m._id)),
        drinks: new Set(drinks.map((d) => d._id)),
        shared: new Set(shared.map((s) => s._id)),
      }, fb);
      if (user.priceSensitivity !== "a_lot" && (user.priceSensitivity || user.personality !== "budget_minded")) return repaired;

      // Keep the code-ranked value pick available and in first place for budget-minded diners.
      const preferred = fb.mains[0];
      const budgetMains = preferred && !repaired.mains.some((m) => m.itemId === preferred.itemId)
        ? [preferred, ...repaired.mains].slice(0, 3)
        : repaired.mains;
      const selected = budgetMains.flatMap((m) => {
        const item = mains.find((candidate) => candidate._id === m.itemId);
        return item ? [item] : [];
      });
      const scoreOrder = new Map(
        rankItems(selected, (item) => scoreItem(item, user, hunger, scoreCtx))
          .map((item, index) => [item._id, index]),
      );
      return {
        ...repaired,
        mains: [...budgetMains].sort((a, b) => (scoreOrder.get(a.itemId) ?? 99) - (scoreOrder.get(b.itemId) ?? 99)),
      };
    } catch {
      return fb;
    }
  },
});

export const voteStep = internalAction({
  args: { partyId: v.id("parties"), userId: v.id("users"), pooled: v.array(v.string()) },
  returns: agentVoteV,
  handler: async (ctx, { partyId, userId, pooled }): Promise<AgentVote> => {
    let fb: AgentVote = { userId, yes: [...pooled], bubble: "Sounds good to me.", fallback: true };
    try {
      const c: PartyContext = await ctx.runQuery(internal.negotiation.context, { partyId });
      const user = c.users.find((u) => u._id === userId);
      if (!user) return fb;
      const hunger = c.hungers[userId] ?? "normal";
      const pooledItems = c.menu.filter((m) => pooled.includes(m._id));
      fb = fallbackVote(pooledItems, user, hunger, c.menu);
      if (pooledItems.length === 0) return fb;
      const p = votePrompt({ user, hunger, pooled: pooledItems });
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
    const template = summaryTemplate(plan.shared.map((s) => name(s.itemId)), plan.mains.length);
    const pooling = poolForParty(drafts, c.menu, c.users);
    const transcriptContext = {
      styleSeed: partyId,
      restaurant: c.restaurantName,
      users: c.users,
      menu: c.menu,
      drafts: drafts.map(({ userId, sharedProposals }) => ({ userId, sharedProposals })),
      votes,
      pooled,
      plan,
      drops: pooling.drops,
      topUps: pooling.topUps,
    };
    const fallback = fallbackConversation(transcriptContext, template);
    try {
      const p = conversationPrompt(transcriptContext);
      const r = await callJson({
        prompt: "conversation", primary: "bitdeer", system: p.system, user: p.user, schema: conversationSchema,
        onLog: logTo(ctx, partyId),
      });
      const conversation = r ? repairConversation(r.data, transcriptContext, template) : fallback;
      return { ...plan, ...conversation, fallback: !r };
    } catch {
      return { ...plan, ...fallback, fallback: true };
    }
  },
});
