// Owner: Role 4 (wiring). Role 3 owns the brains in agents/profile.ts.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { allergenV, dietV, personalityV, type Personality } from "./shared/enums";
import { fail } from "./shared/errors";
import { followUpAnswerV, type FollowUpQuestion } from "./shared/types";
import { followupsFor, summarize as summarizeProfile } from "./agents/profile";
import { personalityFrom } from "./agents/personalities";
import { logTo } from "./agents/steps";

const profileFields = {
  name: v.string(),
  allergies: v.array(allergenV),
  diet: v.array(dietV),
  spice: v.number(),
  likes: v.array(v.string()),
  dislikes: v.array(v.string()),
  cuisines: v.array(v.string()),
  likedCategories: v.optional(v.array(v.string())),
  avatarId: v.string(),
};

/** Create or update the profile for this device. Returns the user id the app saves as `tt.userId`. */
export const upsert = mutation({
  args: { deviceId: v.string(), ...profileFields },
  handler: async (ctx, args): Promise<Id<"users">> => {
    if (!args.name.trim()) fail("INVALID", "Name is required");
    const existing = await ctx.db.query("users").withIndex("by_device", (q) => q.eq("deviceId", args.deviceId)).unique();
    const fields = { ...args, name: args.name.trim(), spice: Math.max(0, Math.min(4, args.spice)) };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return ctx.db.insert("users", fields);
  },
});

export const me = query({
  args: { deviceId: v.string() },
  handler: async (ctx, { deviceId }): Promise<Doc<"users"> | null> =>
    ctx.db.query("users").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique(),
});

/** 0–3 multiple-choice questions from Claude. The app skips the step if this takes over 4 s. */
export const followups = action({
  args: { draft: v.object({ ...profileFields, avatarId: v.optional(v.string()) }) },
  handler: async (ctx, { draft }): Promise<FollowUpQuestion[]> => followupsFor(draft, logTo(ctx)),
});

/** Summary + personality, also saved on the user. Personality is deterministic (personalityFrom). */
export const summarize = action({
  args: { userId: v.id("users"), answers: v.optional(v.array(followUpAnswerV)) },
  handler: async (ctx, { userId, answers }): Promise<{ profileSummary: string; personality: Personality }> => {
    const user = await ctx.runQuery(internal.users.get, { userId });
    if (!user) fail("NOT_FOUND", "User not found");
    const personality = personalityFrom(user, answers ?? []);
    const profileSummary = await summarizeProfile({ ...user, personality }, logTo(ctx, undefined, userId));
    await ctx.runMutation(internal.users.saveSummary, { userId, profileSummary, personality });
    return { profileSummary, personality };
  },
});

export const get = internalQuery({
  args: { userId: v.id("users") },
  handler: (ctx, { userId }) => ctx.db.get(userId),
});

export const saveSummary = internalMutation({
  args: {
    userId: v.id("users"),
    profileSummary: v.string(),
    personality: personalityV,
  },
  handler: async (ctx, { userId, ...rest }) => ctx.db.patch(userId, rest),
});
