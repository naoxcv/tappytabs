// Owner: Role 4. Speech bubbles. The server owns order and timing (showAt); clients reveal on their own clock.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { TIMING } from "./shared/enums";
import { clip } from "./agents/bubbles";

/** Post one bubble, paced 2.5 s after the previous one. Dedupes on (party, speaker, text) so retries are harmless. */
export async function postBubble(
  ctx: MutationCtx,
  partyId: Id<"parties">,
  fromUserId: Id<"users"> | undefined,
  text: string,
): Promise<number> {
  const body = clip(text);
  const existing = await ctx.db
    .query("messages")
    .withIndex("by_party_showAt", (q) => q.eq("partyId", partyId))
    .collect();
  const dup = existing.find((m) => m.fromUserId === fromUserId && m.text === body);
  if (dup) return dup.showAt;
  const now = Date.now();
  const last = existing.at(-1);
  const showAt = last ? Math.max(now, last.showAt + TIMING.bubbleGapMs) : now + TIMING.firstBubbleDelayMs;
  await ctx.db.insert("messages", { partyId, fromUserId, text: body, showAt });
  return showAt;
}

export const insertPaced = internalMutation({
  args: { partyId: v.id("parties"), fromUserId: v.optional(v.id("users")), text: v.string() },
  handler: (ctx, a) => postBubble(ctx, a.partyId, a.fromUserId, a.text),
});

export const list = query({
  args: { partyId: v.id("parties") },
  handler: async (ctx, { partyId }) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_party_showAt", (q) => q.eq("partyId", partyId))
      .collect();
    return {
      serverNow: Date.now(),
      messages: messages.map((m) => ({ id: m._id, fromUserId: m.fromUserId ?? null, text: m.text, showAt: m.showAt })),
    };
  },
});
