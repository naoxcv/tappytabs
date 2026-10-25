// Owner: Role 4. Stage 1 (pick) and stage 2 (group order) plus totals.
// Every write that creates an order line runs isSafeFor first (UNSAFE on failure).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { TIMING } from "./shared/enums";
import { fail } from "./shared/errors";
import {
  getParty, linesOf, membersOf, menuOf, requireMember, requireStatus, requireUser, usersOf,
} from "./lib/guards";
import { addableSet, isSafeFor, modeForSharers } from "./agents/safety";
import { substituteFor } from "./agents/substitute";

async function candidateRows(ctx: QueryCtx, partyId: Id<"parties">, userId: Id<"users">) {
  return ctx.db.query("candidates").withIndex("by_party_user", (q) => q.eq("partyId", partyId).eq("userId", userId)).collect();
}

/** 3 mains (rank 1–3) + 1 drink (rank 0) for this diner. Empty until negotiation commits. */
export const candidates = query({
  args: { partyId: v.id("parties"), userId: v.id("users") },
  handler: async (ctx, { partyId, userId }) => {
    const rows = await candidateRows(ctx, partyId, userId);
    const out = await Promise.all(rows.map(async (c) => {
      const item = await ctx.db.get(c.itemId);
      const imageIsProcessed = !!item?.imageStorageId && item.imageProcessingVersion === 5;
      const storedImageUrl = item?.imageStorageId ? await ctx.storage.getUrl(item.imageStorageId) : null;
      return item && {
        itemId: c.itemId, name: item.name, description: item.description, priceCents: item.priceCents,
        reason: c.reason, rank: c.rank, isDrink: c.isDrink, askServer: c.askServer,
        imageUrl: imageIsProcessed ? storedImageUrl : item.imageUrl ?? storedImageUrl,
        sourceImageUrl: item.imageUrl ?? null,
        imageIsProcessed: imageIsProcessed || !item.imageUrl,
      };
    }));
    return out.filter((x) => x !== null).sort((a, b) => (a.isDrink ? 1 : 0) - (b.isDrink ? 1 : 0) || a.rank - b.rank);
  },
});

/** Allocate storage only for a current pick candidate with the exact source image URL. */
export const prepareDishImageUpload = mutation({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string(), itemId: v.id("menuItems"), imageUrl: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { partyId, userId, deviceId, itemId, imageUrl }) => {
    await requireUser(ctx, userId, deviceId);
    const party = await getParty(ctx, partyId);
    requireStatus(party, "pick");
    await requireMember(ctx, partyId, userId);
    const candidate = (await candidateRows(ctx, partyId, userId)).find((row) => row.itemId === itemId && !row.isDrink);
    if (!candidate) fail("INVALID", "That dish is not one of your agent's picks");
    const item = await ctx.db.get(itemId);
    if (!item || item.imageUrl !== imageUrl) fail("INVALID", "Dish photo changed");
    if (item.imageStorageId && item.imageProcessingVersion === 5) return null;
    return await ctx.storage.generateUploadUrl();
  },
});

/** Save the normalized dish image in shared storage; first successful upload wins. */
export const saveDishImage = mutation({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string(), itemId: v.id("menuItems"), imageUrl: v.string(), storageId: v.id("_storage") },
  returns: v.boolean(),
  handler: async (ctx, { partyId, userId, deviceId, itemId, imageUrl, storageId }) => {
    await requireUser(ctx, userId, deviceId);
    const party = await getParty(ctx, partyId);
    requireStatus(party, "pick");
    await requireMember(ctx, partyId, userId);
    const candidate = (await candidateRows(ctx, partyId, userId)).find((row) => row.itemId === itemId && !row.isDrink);
    const item = await ctx.db.get(itemId);
    if (!candidate || !item || item.imageUrl !== imageUrl || (item.imageStorageId && item.imageProcessingVersion === 5)) {
      await ctx.storage.delete(storageId);
      return false;
    }
    const previousStorageId = item.imageStorageId;
    await ctx.db.patch(itemId, { imageStorageId: storageId, imageProcessingVersion: 5 });
    if (previousStorageId) await ctx.storage.delete(previousStorageId);
    return true;
  },
});

async function writePick(ctx: MutationCtx, partyId: Id<"parties">, member: Doc<"members">, itemId: Id<"menuItems">) {
  const lines = await linesOf(ctx, partyId);
  for (const l of lines) {
    if (l.addedBy === "agent" && (l.kind === "main" || l.kind === "drink") && l.sharedBy.length === 1 && l.sharedBy[0] === member.userId) {
      await ctx.db.delete(l._id);
    }
  }
  await ctx.db.insert("orderLines", { partyId, itemId, qty: 1, kind: "main", sharedBy: [member.userId], addedBy: "agent" });
  const drink = (await candidateRows(ctx, partyId, member.userId)).find((c) => c.isDrink);
  if (drink) {
    await ctx.db.insert("orderLines", { partyId, itemId: drink.itemId, qty: 1, kind: "drink", sharedBy: [member.userId], addedBy: "agent" });
  }
  await ctx.db.patch(member._id, { pickedItemId: itemId });
}

export async function toConfirm(ctx: MutationCtx, party: Doc<"parties">) {
  const confirmDeadline = Date.now() + TIMING.confirmWindowMs;
  await ctx.db.patch(party._id, { status: "confirm", confirmDeadline });
  await ctx.scheduler.runAt(confirmDeadline, internal.orders.autoConfirm, { partyId: party._id, epoch: party.epoch });
}

export const pick = mutation({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string(), itemId: v.id("menuItems") },
  handler: async (ctx, { partyId, userId, deviceId, itemId }) => {
    const user = await requireUser(ctx, userId, deviceId);
    const party = await getParty(ctx, partyId);
    requireStatus(party, "pick");
    const member = await requireMember(ctx, partyId, userId);
    const cand = (await candidateRows(ctx, partyId, userId)).find((c) => c.itemId === itemId && !c.isDrink);
    if (!cand) fail("INVALID", "That dish is not one of your agent's picks");
    const item = await ctx.db.get(itemId);
    if (!item) fail("NOT_FOUND", "Dish not found");
    const s = isSafeFor(item, [user], "personal");
    if (!s.safe) fail("UNSAFE", "That dish isn't safe for you", s.reasons);
    await writePick(ctx, partyId, member, itemId);
    const members = await membersOf(ctx, partyId);
    if (members.every((m) => !!m.pickedItemId)) await toConfirm(ctx, party);
  },
});

/** Pick deadline: anyone who hasn't picked gets their agent's rank-1. */
export const autoPick = internalMutation({
  args: { partyId: v.id("parties"), epoch: v.number() },
  handler: async (ctx, { partyId, epoch }) => {
    const party = await ctx.db.get(partyId);
    if (!party || party.epoch !== epoch || party.status !== "pick") return;
    for (const m of await membersOf(ctx, partyId)) {
      if (m.pickedItemId) continue;
      const top = (await candidateRows(ctx, partyId, m.userId)).filter((c) => !c.isDrink).sort((a, b) => a.rank - b.rank)[0];
      if (top) await writePick(ctx, partyId, m, top.itemId);
    }
    await toConfirm(ctx, party);
  },
});

/** Lines joined to items, plus per-user shares. Integer cents; remainder cents go to the first sharer. */
export const lines = query({
  args: { partyId: v.id("parties") },
  handler: async (ctx, { partyId }) => {
    const rows = await linesOf(ctx, partyId);
    const perUser: Record<string, number> = {};
    let total = 0;
    const out = [];
    for (const l of rows) {
      const item = await ctx.db.get(l.itemId);
      if (!item) continue;
      const sharers = (await Promise.all(l.sharedBy.map((id) => ctx.db.get(id)))).filter((u): u is Doc<"users"> => !!u);
      const safety = isSafeFor(item, sharers, modeForSharers(sharers.length));
      const price = item.priceCents * l.qty;
      total += price;
      const n = Math.max(1, l.sharedBy.length);
      const share = Math.floor(price / n);
      l.sharedBy.forEach((uid, i) => {
        perUser[uid] = (perUser[uid] ?? 0) + share + (i === 0 ? price - share * n : 0);
      });
      out.push({
        lineId: l._id, itemId: l.itemId, name: item.name, qty: l.qty, priceCents: item.priceCents, kind: l.kind,
        sharedBy: l.sharedBy, addedBy: l.addedBy, askServer: safety.askServer || !safety.safe,
      });
    }
    out.sort((a, b) => (a.sharedBy.length > 1 ? 0 : 1) - (b.sharedBy.length > 1 ? 0 : 1));
    return { lines: out, totals: { perUser, total } };
  },
});

/** What the "Add" sheet lists. shared=true: food clean for every member. */
export const addable = query({
  args: { partyId: v.id("parties"), userId: v.id("users"), shared: v.boolean() },
  handler: async (ctx, { partyId, userId, shared }) => {
    const party = await ctx.db.get(partyId);
    const me = await ctx.db.get(userId);
    if (!party || !me) return [];
    const members = await usersOf(ctx, await membersOf(ctx, partyId));
    return addableSet(await menuOf(ctx, party.restaurantId), me, members, shared).map((i) => ({
      itemId: i._id, name: i.name, category: i.category, priceCents: i.priceCents, isDrink: i.isDrink, askServer: i.askServer,
    }));
  },
});

export const add = mutation({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string(), itemId: v.id("menuItems"), shared: v.boolean() },
  handler: async (ctx, { partyId, userId, deviceId, itemId, shared }): Promise<Id<"orderLines">> => {
    const me = await requireUser(ctx, userId, deviceId);
    const party = await getParty(ctx, partyId);
    requireStatus(party, "confirm");
    const member = await requireMember(ctx, partyId, userId);
    if (member.confirmedAt) fail("BAD_STATUS", "You already confirmed");
    const item = await ctx.db.get(itemId);
    if (!item) fail("NOT_FOUND", "Dish not found");
    const sharers = shared ? await usersOf(ctx, await membersOf(ctx, partyId)) : [me];
    const s = isSafeFor(item, sharers, shared ? "shared" : "personal");
    if (!s.safe) fail("UNSAFE", shared ? "Not safe for everyone at the table" : "That dish isn't safe for you", s.reasons);
    return ctx.db.insert("orderLines", {
      partyId, itemId, qty: 1, kind: shared ? "shared" : "extra", sharedBy: sharers.map((u) => u._id), addedBy: userId,
    });
  },
});

/** Personal line: delete. Shared line: leave it (delete when nobody is left). Returns the agent's substitute. */
export const remove = mutation({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string(), lineId: v.id("orderLines") },
  handler: async (ctx, { partyId, userId, deviceId, lineId }) => {
    const me = await requireUser(ctx, userId, deviceId);
    const party = await getParty(ctx, partyId);
    requireStatus(party, "confirm");
    const member = await requireMember(ctx, partyId, userId);
    if (member.confirmedAt) fail("BAD_STATUS", "You already confirmed");
    const line = await ctx.db.get(lineId);
    if (!line || line.partyId !== partyId) fail("NOT_FOUND", "Line not found");
    if (!line.sharedBy.includes(userId)) fail("NOT_MEMBER", "That isn't on your order");
    const removed = await ctx.db.get(line.itemId);
    const rest = line.sharedBy.filter((id) => id !== userId);
    if (rest.length === 0) await ctx.db.delete(lineId);
    else await ctx.db.patch(lineId, { sharedBy: rest });
    if (!removed) return { substitute: null };
    const inOrder = (await linesOf(ctx, partyId)).map((l) => l.itemId as string);
    const sub = substituteFor(removed, me, await menuOf(ctx, party.restaurantId), inOrder, member.hunger ?? "normal");
    return {
      substitute: sub && {
        itemId: sub.item._id as Id<"menuItems">, name: sub.item.name, priceCents: sub.item.priceCents,
        reason: sub.reason, askServer: sub.item.askServer,
      },
    };
  },
});

export async function place(ctx: MutationCtx, party: Doc<"parties">) {
  // Final gate: drop any line that no longer passes (e.g. menu re-tagged mid-party). Logged for the README.
  for (const l of await linesOf(ctx, party._id)) {
    const item = await ctx.db.get(l.itemId);
    const sharers = (await Promise.all(l.sharedBy.map((id) => ctx.db.get(id)))).filter((u): u is Doc<"users"> => !!u);
    if (!item || !isSafeFor(item, sharers, modeForSharers(sharers.length)).safe) {
      console.warn("place: dropped unsafe line", l._id, item?.name);
      await ctx.db.delete(l._id);
    }
  }
  await ctx.db.patch(party._id, { status: "placed", placedAt: Date.now() });
}

export const confirm = mutation({
  args: { partyId: v.id("parties"), userId: v.id("users"), deviceId: v.string() },
  handler: async (ctx, { partyId, userId, deviceId }) => {
    await requireUser(ctx, userId, deviceId);
    const party = await getParty(ctx, partyId);
    requireStatus(party, "confirm");
    const member = await requireMember(ctx, partyId, userId);
    if (!member.confirmedAt) await ctx.db.patch(member._id, { confirmedAt: Date.now() });
    const members = await membersOf(ctx, partyId);
    if (members.every((m) => !!m.confirmedAt)) await place(ctx, party);
  },
});

export const autoConfirm = internalMutation({
  args: { partyId: v.id("parties"), epoch: v.number() },
  handler: async (ctx, { partyId, epoch }) => {
    const party = await ctx.db.get(partyId);
    if (!party || party.epoch !== epoch || party.status !== "confirm") return;
    const now = Date.now();
    for (const m of await membersOf(ctx, partyId)) if (!m.confirmedAt) await ctx.db.patch(m._id, { confirmedAt: now });
    await place(ctx, party);
  },
});
