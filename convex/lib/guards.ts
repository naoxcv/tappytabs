// Owner: Role 4. Shared checks every public function runs before it touches data.
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Status } from "../shared/enums";
import { fail } from "../shared/errors";
import type { MenuItemLite, UserLite } from "../shared/types";

export async function getParty(ctx: QueryCtx, partyId: Id<"parties">): Promise<Doc<"parties">> {
  const party = await ctx.db.get(partyId);
  if (!party) fail("NOT_FOUND", "Party not found");
  return party;
}

export function requireStatus(party: Doc<"parties">, ...allowed: Status[]): void {
  if (!allowed.includes(party.status)) {
    fail("BAD_STATUS", `Party is ${party.status}, expected ${allowed.join(" or ")}`);
  }
}

export function requireHost(party: Doc<"parties">, hostDeviceId: string): void {
  if (party.hostDeviceId !== hostDeviceId) fail("NOT_HOST", "Only the restaurant phone can do that");
}

/** No login: a diner proves who they are with the deviceId their profile was created on. */
export async function requireUser(ctx: QueryCtx, userId: Id<"users">, deviceId: string): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) fail("NOT_FOUND", "User not found");
  if (user.deviceId !== deviceId) fail("NOT_MEMBER", "This profile belongs to another device");
  return user;
}

export async function findMember(ctx: QueryCtx, partyId: Id<"parties">, userId: Id<"users">) {
  return ctx.db
    .query("members")
    .withIndex("by_party_user", (q) => q.eq("partyId", partyId).eq("userId", userId))
    .unique();
}

export async function requireMember(ctx: QueryCtx, partyId: Id<"parties">, userId: Id<"users">): Promise<Doc<"members">> {
  const m = await findMember(ctx, partyId, userId);
  if (!m) fail("NOT_MEMBER", "You are not at this table");
  return m;
}

export async function membersOf(ctx: QueryCtx, partyId: Id<"parties">): Promise<Doc<"members">[]> {
  return ctx.db.query("members").withIndex("by_party", (q) => q.eq("partyId", partyId)).collect();
}

export async function usersOf(ctx: QueryCtx, members: Doc<"members">[]): Promise<Doc<"users">[]> {
  const users = await Promise.all(members.map((m) => ctx.db.get(m.userId)));
  return users.filter((u): u is Doc<"users"> => u !== null);
}

export async function menuOf(ctx: QueryCtx, restaurantId: Id<"restaurants">): Promise<Doc<"menuItems">[]> {
  const items = await ctx.db.query("menuItems").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect();
  return items.sort((a, b) => a.menuOrder - b.menuOrder);
}

export async function linesOf(ctx: QueryCtx, partyId: Id<"parties">): Promise<Doc<"orderLines">[]> {
  return ctx.db.query("orderLines").withIndex("by_party", (q) => q.eq("partyId", partyId)).collect();
}

// Docs already satisfy the pure shapes; these just make the intent explicit at call sites.
export const lite = {
  user: (u: Doc<"users">): UserLite => u,
  item: (i: Doc<"menuItems">): MenuItemLite => i,
};
