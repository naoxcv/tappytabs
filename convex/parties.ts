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
import { place, toConfirm } from "./orders";

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

async function clearPartyRun(ctx: MutationCtx, party: Doc<"parties">, preserveExits = false) {
  const partyId = party._id;
  for (const table of ["members", "orderLines", "tapSessions", "tapHosts"] as const) {
    const rows = await ctx.db.query(table).withIndex("by_party", q => q.eq("partyId", partyId)).collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  if (!preserveExits) {
    const exits = await ctx.db.query("tapExits").withIndex("by_party", q => q.eq("partyId", partyId)).collect();
    for (const exit of exits) await ctx.db.delete(exit._id);
  }
  const claims = await ctx.db.query("tapClaims").withIndex("by_party", q => q.eq("partyId", partyId)).collect();
  for (const claim of claims) await ctx.db.delete(claim._id);
  const candidates = await ctx.db.query("candidates").withIndex("by_party_user", q => q.eq("partyId", partyId)).collect();
  for (const candidate of candidates) await ctx.db.delete(candidate._id);
  const messages = await ctx.db.query("messages").withIndex("by_party_showAt", q => q.eq("partyId", partyId)).collect();
  for (const message of messages) await ctx.db.delete(message._id);
  await ctx.db.replace(partyId, {
    restaurantId: party.restaurantId, hostDeviceId: party.hostDeviceId, size: party.size,
    status: "checkin", joinCode: await newJoinCode(ctx), epoch: party.epoch + 1,
  });
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
    const memberships = await ctx.db.query("members")
      .withIndex("by_user", q => q.eq("userId", a.userId)).collect();
    for (const membership of memberships) {
      const otherParty = await ctx.db.get(membership.partyId);
      if (otherParty && otherParty.status !== "placed") fail("BAD_STATUS", "Diner already joined another table");
    }
    const members = await membersOf(ctx, party._id);
    // A competing tap may observe the party after the last seat moved it to hunger.
    // Report FULL for that race; reserve BAD_STATUS for a party that still has seats.
    if (party.status !== "checkin") {
      if (members.length >= party.size) fail("FULL", "Table is full");
      requireStatus(party, "checkin");
    }
    if (members.length >= party.size) fail("FULL", "Table is full");
    const exit = await ctx.db.query("tapExits")
      .withIndex("by_party_user", q => q.eq("partyId", party._id).eq("userId", a.userId)).first();
    if (a.via === "uwb" && exit && exit.expiresAt > Date.now()) fail("BAD_STATUS", "Diner left this table");
    const claims = await ctx.db.query("tapClaims").withIndex("by_user", q => q.eq("userId", a.userId)).collect();
    for (const claim of claims) {
      if (claim.expiresAt <= Date.now() || claim.partyId === party._id) continue;
      const claimedParty = await ctx.db.get(claim.partyId);
      if (claimedParty && claimedParty.status !== "placed") fail("BAD_STATUS", "Diner already joined another table");
    }
    for (const claim of claims) await ctx.db.delete(claim._id);
    await ctx.db.insert("tapClaims", { userId: a.userId, partyId: party._id, expiresAt: Date.now() + 300_000 });
    await ctx.db.insert("members", { partyId: party._id, userId: a.userId, joinedVia: a.via, joinedAt: Date.now() });
    if (members.length + 1 === party.size) await ctx.db.patch(party._id, { status: "hunger" });
    return { result: "joined", partyId: party._id };
  },
});

/** Remove a diner from any unfinished stage without keeping their order or blocking the remaining table. */
export const leave = mutation({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string() },
  handler: async (ctx, { partyId, userId, deviceId }): Promise<void> => {
    await requireUser(ctx, userId, deviceId);
    const party = await getParty(ctx, partyId);
    // The ticket has already been sent. Leaving this screen must not rewrite that order.
    if (party.status === "placed") return;
    const member = await findMember(ctx, partyId, userId);
    if (!member) return;
    await ctx.db.delete(member._id);
    const sessions = await ctx.db.query("tapSessions")
      .withIndex("by_party_user", q => q.eq("partyId", partyId).eq("userId", userId)).collect();
    for (const session of sessions) await ctx.db.delete(session._id);
    const claims = await ctx.db.query("tapClaims").withIndex("by_user", q => q.eq("userId", userId)).collect();
    for (const claim of claims) if (claim.partyId === partyId) await ctx.db.delete(claim._id);
    const oldExits = await ctx.db.query("tapExits")
      .withIndex("by_party_user", q => q.eq("partyId", partyId).eq("userId", userId)).collect();
    for (const exit of oldExits) await ctx.db.delete(exit._id);
    await ctx.db.insert("tapExits", { partyId, userId, expiresAt: Date.now() + 300_000 });

    const candidates = await ctx.db.query("candidates")
      .withIndex("by_party_user", q => q.eq("partyId", partyId).eq("userId", userId)).collect();
    for (const candidate of candidates) await ctx.db.delete(candidate._id);
    const lines = await ctx.db.query("orderLines").withIndex("by_party", q => q.eq("partyId", partyId)).collect();
    for (const line of lines) {
      if (!line.sharedBy.includes(userId)) continue;
      const remainingSharers = line.sharedBy.filter(id => id !== userId);
      if (remainingSharers.length === 0) await ctx.db.delete(line._id);
      else await ctx.db.patch(line._id, { sharedBy: remainingSharers });
    }

    const remaining = await membersOf(ctx, partyId);
    if (remaining.length === 0) {
      // An empty table is ready for another run. The epoch invalidates scheduled work.
      await clearPartyRun(ctx, party, true);
    } else if (party.status === "hunger" && remaining.every(m => m.hunger != null)) {
      await ctx.db.patch(partyId, { status: "negotiating", negotiationStartedAt: Date.now() });
      await startNegotiation(ctx, partyId, party.epoch);
    } else if (party.status === "negotiating") {
      // In-flight drafts may include the departed diner; start a fresh generation.
      const nextEpoch = party.epoch + 1;
      for (const table of ["messages", "candidates", "orderLines"] as const) {
        const rows = table === "messages"
          ? await ctx.db.query("messages").withIndex("by_party_showAt", q => q.eq("partyId", partyId)).collect()
          : table === "candidates"
            ? await ctx.db.query("candidates").withIndex("by_party_user", q => q.eq("partyId", partyId)).collect()
            : await ctx.db.query("orderLines").withIndex("by_party", q => q.eq("partyId", partyId)).collect();
        for (const row of rows) await ctx.db.delete(row._id);
      }
      await ctx.db.patch(partyId, { epoch: nextEpoch, committedAt: undefined, negotiationStartedAt: Date.now() });
      await startNegotiation(ctx, partyId, nextEpoch);
    } else if (party.status === "pick" && remaining.every(m => m.pickedItemId != null)) {
      await toConfirm(ctx, party);
    } else if (party.status === "confirm" && remaining.every(m => m.confirmedAt != null)) {
      await place(ctx, party);
    }
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
    const all = await ctx.db.query("parties").withIndex("by_hostDevice", q => q.eq("hostDeviceId", hostDeviceId)).order("desc").collect();
    const p = all.find((x) => x.status !== "placed");
    return p ? { partyId: p._id, status: p.status } : null;
  },
});

/** Diner relaunch: the newest unfinished table this user is at. */
export const forUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const memberships = await ctx.db.query("members").withIndex("by_user", q => q.eq("userId", userId)).order("desc").collect();
    for (const m of memberships) {
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
    await clearPartyRun(ctx, party);
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
