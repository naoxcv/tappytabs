// Nearby Interaction discovery tokens travel over the existing Convex connection.
// Multipeer is used only to advertise the party ID; no MCSession is established.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { fail } from "./shared/errors";
import { getParty, requireHost, requireUser } from "./lib/guards";

const lifetimeMs = 30_000;

// Compatibility for phones built before nearby-only discovery. These no longer
// publish or discover tables globally; table selection comes from Multipeer.
export const advertise = mutation({
  args: { partyId: v.id("parties"), hostDeviceId: v.string() },
  handler: async (ctx, { partyId, hostDeviceId }): Promise<void> => {
    const party = await getParty(ctx, partyId);
    requireHost(party, hostDeviceId);
  },
});

export const discover = query({
  args: {},
  handler: async (): Promise<Id<"parties"> | null> => null,
});

function checkToken(token: string) {
  if (!token || token.length > 16_384) fail("INVALID", "Invalid Nearby Interaction token");
}

export const announce = mutation({
  args: {
    partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string(),
    attemptId: v.string(), dinerToken: v.string(),
  },
  handler: async (ctx, a): Promise<void> => {
    await requireUser(ctx, a.userId, a.deviceId);
    const party = await getParty(ctx, a.partyId);
    if (party.status !== "checkin") fail("BAD_STATUS", "Table is no longer checking in");
    if (!a.attemptId || a.attemptId.length > 100) fail("INVALID", "Invalid attempt ID");
    checkToken(a.dinerToken);
    const exits = await ctx.db.query("tapExits")
      .withIndex("by_party_user", q => q.eq("partyId", a.partyId).eq("userId", a.userId)).collect();
    for (const exit of exits) await ctx.db.delete(exit._id);
    const old = await ctx.db.query("tapSessions")
      .withIndex("by_party_user", q => q.eq("partyId", a.partyId).eq("userId", a.userId)).collect();
    for (const row of old) await ctx.db.delete(row._id);
    await ctx.db.insert("tapSessions", {
      partyId: a.partyId, userId: a.userId, attemptId: a.attemptId,
      dinerToken: a.dinerToken, expiresAt: Date.now() + lifetimeMs,
    });
  },
});

export const pending = query({
  args: { partyId: v.id("parties"), hostDeviceId: v.string() },
  handler: async (ctx, { partyId, hostDeviceId }): Promise<{ userId: Id<"users">; attemptId: string; dinerToken: string }[]> => {
    const party = await getParty(ctx, partyId);
    requireHost(party, hostDeviceId);
    if (party.status !== "checkin") return [];
    const rows = await ctx.db.query("tapSessions").withIndex("by_party", q => q.eq("partyId", partyId)).collect();
    return rows.filter(row => row.expiresAt > Date.now() && !row.hostToken && !row.rejection)
      .map(row => ({ userId: row.userId, attemptId: row.attemptId, dinerToken: row.dinerToken }));
  },
});

export const respond = mutation({
  args: {
    partyId: v.id("parties"), userId: v.id("users"), hostDeviceId: v.string(),
    attemptId: v.string(), hostToken: v.string(),
  },
  handler: async (ctx, a): Promise<void> => {
    const party = await getParty(ctx, a.partyId);
    requireHost(party, a.hostDeviceId);
    if (party.status !== "checkin") fail("BAD_STATUS", "Table is no longer checking in");
    checkToken(a.hostToken);
    const row = await ctx.db.query("tapSessions")
      .withIndex("by_party_user", q => q.eq("partyId", a.partyId).eq("userId", a.userId)).unique();
    if (!row || row.attemptId !== a.attemptId || row.expiresAt <= Date.now()) return;
    await ctx.db.patch(row._id, { hostToken: a.hostToken });
  },
});

export const session = query({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string() },
  handler: async (ctx, { partyId, userId, deviceId }): Promise<{ attemptId: string; hostToken: string | null; rejection: string | null } | null> => {
    await requireUser(ctx, userId, deviceId);
    const row = await ctx.db.query("tapSessions")
      .withIndex("by_party_user", q => q.eq("partyId", partyId).eq("userId", userId)).unique();
    if (!row || row.expiresAt <= Date.now()) return null;
    return { attemptId: row.attemptId, hostToken: row.hostToken ?? null, rejection: row.rejection ?? null };
  },
});

export const reject = mutation({
  args: {
    partyId: v.id("parties"), userId: v.id("users"), hostDeviceId: v.string(),
    attemptId: v.string(), reason: v.string(),
  },
  handler: async (ctx, a): Promise<void> => {
    requireHost(await getParty(ctx, a.partyId), a.hostDeviceId);
    const row = await ctx.db.query("tapSessions")
      .withIndex("by_party_user", q => q.eq("partyId", a.partyId).eq("userId", a.userId)).unique();
    if (row?.attemptId === a.attemptId) {
      await ctx.db.patch(row._id, { rejection: a.reason.slice(0, 200), expiresAt: Date.now() + lifetimeMs });
    }
  },
});
