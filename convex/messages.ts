// Owner: Role 4. Speech bubbles. The server owns order and timing (showAt); clients reveal on their own clock.
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import { TIMING } from "./shared/enums";
import { splitBubbleText } from "./agents/bubbles";

/** Post one bubble, paced 2.5 s after the previous one. Dedupes on (party, speaker, text) so retries are harmless. */
export async function postBubble(
  ctx: MutationCtx,
  partyId: Id<"parties">,
  fromUserId: Id<"users"> | undefined,
  text: string,
): Promise<number> {
  const bodies = splitBubbleText(text);
  if (bodies.length === 0) return Date.now();
  const existing = await ctx.db
    .query("messages")
    .withIndex("by_party_showAt", (q) => q.eq("partyId", partyId))
    .collect();
  let last = existing.at(-1);
  let finalShowAt = Date.now();
  for (const body of bodies) {
    const dup = existing.find((m) => m.fromUserId === fromUserId && m.text === body);
    if (dup) {
      finalShowAt = dup.showAt;
      continue;
    }
    const now = Date.now();
    const showAt = last ? Math.max(now, last.showAt + TIMING.bubbleGapMs) : now + TIMING.firstBubbleDelayMs;
    const _id = await ctx.db.insert("messages", { partyId, fromUserId, text: body, showAt });
    last = { _id, partyId, fromUserId, text: body, showAt, _creationTime: now };
    existing.push(last);
    finalShowAt = showAt;
  }
  return finalShowAt;
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
