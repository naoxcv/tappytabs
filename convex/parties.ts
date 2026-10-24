// Owner: Role 4. Party lifecycle: checkin → hunger → negotiating → pick → confirm → placed.
// Every mutation checks status first (BAD_STATUS). Scheduled jobs carry `epoch` and exit quietly if it changed.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { hungerV, joinViaV, TIMING } from "./shared/enums";
import { fail } from "./shared/errors";
import { findMember, getParty, membersOf, requireHost, requireMember, requireStatus, requireUser } from "./lib/guards";
import { startNegotiation } from "./negotiation";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

async function newJoinCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    const clash = await ctx.db.query("parties").withIndex("by_joinCode", (q) => q.eq("joinCode", code)).first();
    if (!clash) return code;
  }
  fail("INVALID", "Could not allocate a join code");
}

export const create = mutation({
  args: { restaurantId: v.id("restaurants"), size: v.number(), hostDeviceId: v.string() },
  handler: async (ctx, { restaurantId, size, hostDeviceId }): Promise<{ partyId: Id<"parties">; joinCode: string }> => {
    if (!(await ctx.db.get(restaurantId))) fail("NOT_FOUND", "Restaurant not found");
    if (!Number.isInteger(size) || size < 2 || size > 6) fail("INVALID", "Party size must be 2–6");
    const joinCode = await newJoinCode(ctx);
    const partyId = await ctx.db.insert("parties", { restaurantId, hostDeviceId, size, status: "checkin", joinCode, epoch: 0 });
    return { partyId, joinCode };
  },
});

/**
 * Two callers:
 *  - via "uwb" or "sim": the RESTAURANT phone, after it detects a tap; passes hostDeviceId.
 *  - via "qr": the DINER phone after scanning; passes deviceId.
 * Serializable transaction: two simultaneous taps can never both take the last seat.
 */
export const join = mutation({
  args: {
    partyId: v.optional(v.id("parties")),
    joinCode: v.optional(v.string()),
    userId: v.id("users"),
    via: joinViaV,
    hostDeviceId: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, a): Promise<{ result: "joined" | "already"; partyId: Id<"parties"> }> => {
    let party: Doc<"parties"> | null = null;
    if (a.partyId) party = await ctx.db.get(a.partyId);
    else if (a.joinCode) {
      const code = a.joinCode.trim().toUpperCase();
      party = await ctx.db.query("parties").withIndex("by_joinCode", (q) => q.eq("joinCode", code)).first();
    }
    if (!party) fail("NOT_FOUND", "Table not found");
    if (a.via === "qr") {
      if (!a.deviceId) fail("INVALID", "deviceId required for QR join");
      await requireUser(ctx, a.userId, a.deviceId);
    } else {
      if (!a.hostDeviceId) fail("INVALID", "hostDeviceId required for tap join");
      requireHost(party, a.hostDeviceId);
      if (!(await ctx.db.get(a.userId))) fail("NOT_FOUND", "User not found");
    }
    if (await findMember(ctx, party._id, a.userId)) return { result: "already", partyId: party._id };
    const members = await membersOf(ctx, party._id);
    // A competing tap may observe the party after the last seat moved it to hunger.
    // Report FULL for that race; reserve BAD_STATUS for a party that still has seats.
    if (party.status !== "checkin") {
      if (members.length >= party.size) fail("FULL", "Table is full");
      requireStatus(party, "checkin");
    }
    if (members.length >= party.size) fail("FULL", "Table is full");
    await ctx.db.insert("members", { partyId: party._id, userId: a.userId, joinedVia: a.via, joinedAt: Date.now() });
    if (members.length + 1 === party.size) await ctx.db.patch(party._id, { status: "hunger" });
    return { result: "joined", partyId: party._id };
  },
});

/** Everything a screen needs to route and render the party. */
export const current = query({
  args: { partyId: v.id("parties") },
  handler: async (ctx, { partyId }) => {
    const party = await ctx.db.get(partyId);
    if (!party) return null;
    const restaurant = await ctx.db.get(party.restaurantId);
    const members = await membersOf(ctx, partyId);
    const rows = await Promise.all(
      members.sort((a, b) => a.joinedAt - b.joinedAt).map(async (m) => {
        const u = await ctx.db.get(m.userId);
        return {
          userId: m.userId,
          name: u?.name ?? "?",
          avatarId: u?.avatarId ?? "avatar_0",
          hunger: m.hunger ?? null,
          picked: !!m.pickedItemId,
          confirmed: !!m.confirmedAt,
        };
      }),
    );
    return {
      id: party._id,
      restaurantName: restaurant?.name ?? "",
      status: party.status,
      size: party.size,
      joinCode: party.joinCode,
      pickDeadline: party.pickDeadline ?? null,
      confirmDeadline: party.confirmDeadline ?? null,
      members: rows,
    };
  },
});

/** Restaurant phone relaunch: find the table this device is hosting. */
export const hosted = query({
  args: { hostDeviceId: v.string() },
  handler: async (ctx, { hostDeviceId }) => {
    const all = await ctx.db.query("parties").order("desc").take(20);
    const p = all.find((x) => x.hostDeviceId === hostDeviceId);
    return p ? { partyId: p._id, status: p.status } : null;
  },
});

/** Diner relaunch: the newest unfinished table this user is at. */
export const forUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const recent = await ctx.db.query("members").order("desc").take(50);
    for (const m of recent.filter((x) => x.userId === userId)) {
      const p = await ctx.db.get(m.partyId);
      if (p && p.status !== "placed") return { partyId: p._id, status: p.status };
    }
    return null;
  },
});

export const setHunger = mutation({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string(), hunger: hungerV },
  handler: async (ctx, { partyId, userId, deviceId, hunger }) => {
    await requireUser(ctx, userId, deviceId);
    const party = await getParty(ctx, partyId);
    requireStatus(party, "hunger");
    const me = await requireMember(ctx, partyId, userId);
    await ctx.db.patch(me._id, { hunger });
    const members = await membersOf(ctx, partyId);
    if (members.every((m) => (m._id === me._id ? true : !!m.hunger))) {
      await ctx.db.patch(partyId, { status: "negotiating", negotiationStartedAt: Date.now() });
      await startNegotiation(ctx, partyId, party.epoch);
    }
  },
});

export const startWithFewer = mutation({
  args: { partyId: v.id("parties"), hostDeviceId: v.string() },
  handler: async (ctx, { partyId, hostDeviceId }) => {
    const party = await getParty(ctx, partyId);
    requireHost(party, hostDeviceId);
    requireStatus(party, "checkin");
    const members = await membersOf(ctx, partyId);
    if (members.length < 2) fail("INVALID", "Need at least 2 diners");
    await ctx.db.patch(partyId, { size: members.length, status: "hunger" });
  },
});

/** Back to an empty check-in for the next demo run. New join code; stale timers become no-ops. */
export const reset = mutation({
  args: { partyId: v.id("parties"), hostDeviceId: v.string() },
  handler: async (ctx, { partyId, hostDeviceId }) => {
    const party = await getParty(ctx, partyId);
    requireHost(party, hostDeviceId);
    for (const table of ["members", "orderLines"] as const) {
      const rows = await ctx.db.query(table).withIndex("by_party", (q) => q.eq("partyId", partyId)).collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    const cands = await ctx.db.query("candidates").withIndex("by_party_user", (q) => q.eq("partyId", partyId)).collect();
    for (const r of cands) await ctx.db.delete(r._id);
    const msgs = await ctx.db.query("messages").withIndex("by_party_showAt", (q) => q.eq("partyId", partyId)).collect();
    for (const r of msgs) await ctx.db.delete(r._id);
    await ctx.db.replace(partyId, {
      restaurantId: party.restaurantId, hostDeviceId: party.hostDeviceId, size: party.size,
      status: "checkin", joinCode: await newJoinCode(ctx), epoch: party.epoch + 1,
    });
  },
});

/** Scheduled at the summary bubble's showAt: negotiating → pick, opens the 45 s pick window. */
export const advance = internalMutation({
  args: { partyId: v.id("parties"), epoch: v.number() },
  handler: async (ctx, { partyId, epoch }) => {
    const party = await ctx.db.get(partyId);
    if (!party || party.epoch !== epoch || party.status !== "negotiating") return;
    const pickDeadline = Date.now() + TIMING.pickWindowMs;
    await ctx.db.patch(partyId, { status: "pick", pickDeadline });
    await ctx.scheduler.runAt(pickDeadline, internal.orders.autoPick, { partyId, epoch });
  },
});
