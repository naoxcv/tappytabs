import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/!(*.test).ts");
async function setup() {
  const t = convexTest(schema, modules);
  const seeded = await t.mutation(internal.seed.base, {});
  const { partyId } = await t.mutation(api.parties.create, {
    restaurantId: seeded.restaurantId, size: 4, hostDeviceId: seeded.hostDeviceId,
  });
  return { t, ...seeded, partyId, userId: seeded.userIds[0], deviceId: "demo-diner-1" };
}
async function errorCode(promise: Promise<unknown>) {
  try { await promise; return null; } catch (error: any) { return error?.data?.code ?? String(error); }
}

describe("tap token exchange", () => {
  test("table IDs are never discovered through Convex", async () => {
    const { t, partyId, hostDeviceId } = await setup();
    expect(await t.query(api.tap.discover, {})).toBeNull();
    expect(await errorCode(t.mutation(api.tap.advertise, { partyId, hostDeviceId: "other" }))).toBe("NOT_HOST");
    await t.mutation(api.tap.advertise, { partyId, hostDeviceId });
    expect(await t.query(api.tap.discover, {})).toBeNull();
  });
  test("the first UWB host claim wins across nearby tables", async () => {
    const { t, partyId, userId, hostDeviceId, restaurantId } = await setup();
    const other = await t.mutation(api.parties.create, { restaurantId, size: 4, hostDeviceId: "other-host" });
    await t.mutation(api.parties.join, { partyId, userId, via: "uwb", hostDeviceId });
    expect(await errorCode(t.mutation(api.parties.join, {
      partyId: other.partyId, userId, via: "uwb", hostDeviceId: "other-host",
    }))).toBe("BAD_STATUS");
    await t.mutation(api.parties.reset, { partyId, hostDeviceId });
    expect((await t.mutation(api.parties.join, {
      partyId: other.partyId, userId, via: "uwb", hostDeviceId: "other-host",
    })).result).toBe("joined");
  });
  test("QR and UWB joins cannot put a diner in two active tables", async () => {
    const { t, partyId, userId, deviceId, hostDeviceId, restaurantId } = await setup();
    const other = await t.mutation(api.parties.create, { restaurantId, size: 4, hostDeviceId: "other-host" });
    await t.mutation(api.parties.join, { partyId, userId, via: "qr", deviceId });
    expect(await errorCode(t.mutation(api.parties.join, {
      partyId: other.partyId, userId, via: "uwb", hostDeviceId: "other-host",
    }))).toBe("BAD_STATUS");
    expect((await t.query(api.parties.current, { partyId }))?.members).toHaveLength(1);
    expect((await t.query(api.parties.current, { partyId: other.partyId }))?.members).toHaveLength(0);
    await t.mutation(api.parties.leave, { partyId, userId, deviceId });
    await t.mutation(api.parties.join, { partyId: other.partyId, userId, via: "uwb", hostDeviceId: "other-host" });
    expect(await errorCode(t.mutation(api.parties.join, {
      partyId, userId, via: "qr", deviceId,
    }))).toBe("BAD_STATUS");
  });
  test("competing QR and UWB joins leave only one active membership", async () => {
    const { t, partyId, userId, deviceId, restaurantId } = await setup();
    const other = await t.mutation(api.parties.create, { restaurantId, size: 4, hostDeviceId: "other-host" });
    const results = await Promise.allSettled([
      t.mutation(api.parties.join, { partyId, userId, via: "qr", deviceId }),
      t.mutation(api.parties.join, { partyId: other.partyId, userId, via: "uwb", hostDeviceId: "other-host" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const memberships = [
      ...(await t.query(api.parties.current, { partyId }))!.members,
      ...(await t.query(api.parties.current, { partyId: other.partyId }))!.members,
    ];
    expect(memberships.filter(member => member.userId === userId)).toHaveLength(1);
  });
  test("leaving check-in removes membership, token, and tap claim", async () => {
    const { t, partyId, userId, deviceId, hostDeviceId, restaurantId } = await setup();
    const other = await t.mutation(api.parties.create, { restaurantId, size: 4, hostDeviceId: "other-host" });
    await t.mutation(api.tap.announce, { partyId, userId, deviceId, attemptId: "a", dinerToken: "token" });
    await t.mutation(api.parties.join, { partyId, userId, via: "uwb", hostDeviceId });
    expect(await errorCode(t.mutation(api.parties.leave, { partyId, userId, deviceId: "other" }))).toBe("NOT_MEMBER");
    await t.mutation(api.parties.leave, { partyId, userId, deviceId });
    expect((await t.query(api.parties.current, { partyId }))?.members).toHaveLength(0);
    expect(await t.query(api.parties.forUser, { userId })).toBeNull();
    expect(await t.query(api.tap.session, { partyId, userId, deviceId })).toBeNull();
    expect(await errorCode(t.mutation(api.parties.join, { partyId, userId, via: "uwb", hostDeviceId }))).toBe("BAD_STATUS");
    expect((await t.mutation(api.parties.join, {
      partyId: other.partyId, userId, via: "uwb", hostDeviceId: "other-host",
    })).result).toBe("joined");
  });
  test("fresh token exchange permits a deliberate tap back into the same table", async () => {
    const { t, partyId, userId, deviceId, hostDeviceId } = await setup();
    await t.mutation(api.parties.join, { partyId, userId, via: "uwb", hostDeviceId });
    await t.mutation(api.parties.leave, { partyId, userId, deviceId });
    await t.mutation(api.tap.announce, { partyId, userId, deviceId, attemptId: "fresh", dinerToken: "token" });
    expect((await t.mutation(api.parties.join, { partyId, userId, via: "uwb", hostDeviceId })).result).toBe("joined");
  });
  test("leaving after check-in has advanced does not silently remove a diner", async () => {
    const { t, partyId, userId, deviceId, hostDeviceId, userIds } = await setup();
    await t.mutation(api.parties.join, { partyId, userId, via: "uwb", hostDeviceId });
    await t.mutation(api.parties.join, { partyId, userId: userIds[1], via: "uwb", hostDeviceId });
    await t.mutation(api.parties.startWithFewer, { partyId, hostDeviceId });
    expect(await errorCode(t.mutation(api.parties.leave, { partyId, userId, deviceId }))).toBe("BAD_STATUS");
    expect((await t.query(api.parties.current, { partyId }))?.members.some(m => m.userId === userId)).toBe(true);
  });
  test("only the diner's device can announce; only the host can read and respond", async () => {
    const { t, partyId, userId, deviceId, hostDeviceId } = await setup();
    expect(await errorCode(t.mutation(api.tap.announce, {
      partyId, userId, deviceId: "other", attemptId: "a", dinerToken: "diner-token",
    }))).toBe("NOT_MEMBER");
    await t.mutation(api.tap.announce, { partyId, userId, deviceId, attemptId: "a", dinerToken: "diner-token" });
    expect(await errorCode(t.query(api.tap.pending, { partyId, hostDeviceId: "other" }))).toBe("NOT_HOST");
    expect(await t.query(api.tap.pending, { partyId, hostDeviceId })).toEqual([
      { userId, attemptId: "a", dinerToken: "diner-token" },
    ]);
    expect(await errorCode(t.mutation(api.tap.respond, {
      partyId, userId, hostDeviceId: "other", attemptId: "a", hostToken: "host-token",
    }))).toBe("NOT_HOST");
    await t.mutation(api.tap.respond, { partyId, userId, hostDeviceId, attemptId: "a", hostToken: "host-token" });
    expect(await t.query(api.tap.session, { partyId, userId, deviceId })).toEqual({
      attemptId: "a", hostToken: "host-token", rejection: null,
    });
    expect(await t.query(api.tap.pending, { partyId, hostDeviceId })).toEqual([]);
    await t.mutation(api.tap.reject, { partyId, userId, hostDeviceId, attemptId: "a", reason: "Table is full" });
    expect((await t.query(api.tap.session, { partyId, userId, deviceId }))?.rejection).toBe("Table is full");
  });

  test("a retry replaces the previous attempt and stale replies cannot bind it", async () => {
    const { t, partyId, userId, deviceId, hostDeviceId } = await setup();
    await t.mutation(api.tap.announce, { partyId, userId, deviceId, attemptId: "old", dinerToken: "old-token" });
    await t.mutation(api.tap.announce, { partyId, userId, deviceId, attemptId: "new", dinerToken: "new-token" });
    await t.mutation(api.tap.respond, { partyId, userId, hostDeviceId, attemptId: "old", hostToken: "stale" });
    expect(await t.query(api.tap.session, { partyId, userId, deviceId })).toEqual({
      attemptId: "new", hostToken: null, rejection: null,
    });
    await t.mutation(api.tap.respond, { partyId, userId, hostDeviceId, attemptId: "new", hostToken: "fresh" });
    expect((await t.query(api.tap.session, { partyId, userId, deviceId }))?.hostToken).toBe("fresh");
    await t.mutation(api.parties.reset, { partyId, hostDeviceId });
    expect(await t.query(api.tap.session, { partyId, userId, deviceId })).toBeNull();
  });
});
