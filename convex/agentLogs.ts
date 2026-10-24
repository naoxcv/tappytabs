// Owner: Role 4 (table), Role 3 (writes). Every model call, for debugging and as sponsor-track evidence.
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const insert = internalMutation({
  args: {
    partyId: v.optional(v.id("parties")),
    userId: v.optional(v.id("users")),
    prompt: v.string(),
    provider: v.string(),
    model: v.string(),
    latencyMs: v.number(),
    fallback: v.boolean(),
    error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    await ctx.db.insert("agentLogs", a);
  },
});

/** Debug only: the last 50 model calls, newest first. */
export const recent = query({
  args: {},
  handler: async (ctx) => ctx.db.query("agentLogs").order("desc").take(50),
});
