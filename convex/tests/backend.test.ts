/// <reference types="vite/client" />
// Owner: Role 4. Mutation tests against an in-memory Convex (convex-test). No network, no models.
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import workflowTest from "@convex-dev/workflow/test";
import { api, internal } from "../_generated/api";
import { mapScraperOutput } from "../menu";
import schema from "../schema";

const modules = import.meta.glob("../**/!(*.test).ts");

async function setup() {
  const t = convexTest(schema, modules);
  workflowTest.register(t, "workflow");
  const seeded = await t.mutation(internal.seed.base, {});
  const { partyId, joinCode } = await t.mutation(api.parties.create, {
    restaurantId: seeded.restaurantId, size: 4, hostDeviceId: seeded.hostDeviceId,
  });
  return { t, ...seeded, partyId, joinCode };
}

const code = async (p: Promise<unknown>) => {
  try { await p; return null; } catch (e: any) { return e?.data?.code ?? String(e); }
};

describe("parties:join", () => {
  test("join, already, full, and the last seat moves to hunger", async () => {
    const { t, partyId, userIds, hostDeviceId } = await setup();
    for (const userId of userIds.slice(0, 3)) {
      expect((await t.mutation(api.parties.join, { partyId, userId, via: "uwb", hostDeviceId })).result).toBe("joined");
    }
    expect((await t.mutation(api.parties.join, { partyId, userId: userIds[0], via: "uwb", hostDeviceId })).result).toBe("already");
    await t.mutation(api.parties.join, { partyId, userId: userIds[3], via: "uwb", hostDeviceId });
    expect((await t.query(api.parties.current, { partyId }))!.status).toBe("hunger");
    const extra = await t.mutation(api.users.upsert, {
      deviceId: "x", name: "Extra", allergies: [], diet: [], spice: 1, likes: [], dislikes: [], cuisines: [], avatarId: "avatar_5",
    });
    expect(await code(t.mutation(api.parties.join, { partyId, userId: extra, via: "uwb", hostDeviceId }))).toBe("FULL");
  });

  test("FULL when the table is full but still in checkin", async () => {
    const { t, restaurantId, userIds, hostDeviceId } = await setup();
    const { partyId } = await t.mutation(api.parties.create, { restaurantId, size: 2, hostDeviceId });
    await t.run(async (ctx) => {
      // force: 2 members already, status still checkin (e.g. racing taps)
      for (const userId of userIds.slice(0, 2)) await ctx.db.insert("members", { partyId, userId, joinedVia: "uwb", joinedAt: 0 });
    });
    expect(await code(t.mutation(api.parties.join, { partyId, userId: userIds[2], via: "uwb", hostDeviceId }))).toBe("FULL");
  });

  test("concurrent taps for the final seat allow one join and reject the other as FULL", async () => {
    const { t, restaurantId, userIds, hostDeviceId } = await setup();
    const { partyId } = await t.mutation(api.parties.create, { restaurantId, size: 2, hostDeviceId });
    await t.mutation(api.parties.join, { partyId, userId: userIds[0], via: "uwb", hostDeviceId });
    const attempts = await Promise.allSettled(userIds.slice(1, 3).map((userId) =>
      t.mutation(api.parties.join, { partyId, userId, via: "uwb", hostDeviceId }),
    ));
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected && (rejected.reason as any)?.data?.code).toBe("FULL");
    expect((await t.query(api.parties.current, { partyId }))!.members).toHaveLength(2);
  });

  test("tap join requires the host device; QR requires the diner's device", async () => {
    const { t, partyId, joinCode, userIds } = await setup();
    expect(await code(t.mutation(api.parties.join, { partyId, userId: userIds[0], via: "uwb", hostDeviceId: "nope" }))).toBe("NOT_HOST");
    expect(await code(t.mutation(api.parties.join, { joinCode, userId: userIds[0], via: "qr", deviceId: "nope" }))).toBe("NOT_MEMBER");
    expect((await t.mutation(api.parties.join, { joinCode: joinCode.toLowerCase(), userId: userIds[0], via: "qr", deviceId: "demo-diner-1" })).result).toBe("joined");
  });

  test("startWithFewer and reset", async () => {
    const { t, partyId, userIds, hostDeviceId } = await setup();
    await t.mutation(api.parties.join, { partyId, userId: userIds[0], via: "uwb", hostDeviceId });
    expect(await code(t.mutation(api.parties.startWithFewer, { partyId, hostDeviceId }))).toBe("INVALID");
    await t.mutation(api.parties.join, { partyId, userId: userIds[1], via: "uwb", hostDeviceId });
    await t.mutation(api.parties.startWithFewer, { partyId, hostDeviceId });
    const p = (await t.query(api.parties.current, { partyId }))!;
    expect(p.status).toBe("hunger");
    expect(p.size).toBe(2);
    await t.mutation(api.parties.reset, { partyId, hostDeviceId });
    const r = (await t.query(api.parties.current, { partyId }))!;
    expect(r.status).toBe("checkin");
    expect(r.members).toHaveLength(0);
    expect(r.joinCode).not.toBe(p.joinCode);
  });

  test("scheduled work from before reset is harmless", async () => {
    const t = convexTest(schema, modules);
    workflowTest.register(t, "workflow");
    const { partyId, hostDeviceId } = await t.mutation(internal.seed.scenario, { scenario: "negotiated" });
    await t.mutation(api.parties.reset, { partyId, hostDeviceId });
    await t.mutation(internal.parties.advance, { partyId, epoch: 0 });
    await t.mutation(internal.orders.autoPick, { partyId, epoch: 0 });
    await t.mutation(internal.orders.autoConfirm, { partyId, epoch: 0 });
    expect((await t.query(api.parties.current, { partyId }))!.status).toBe("checkin");
    expect((await t.query(api.orders.lines, { partyId })).lines).toHaveLength(0);
  });
});

describe("negotiation rescue", () => {
  test("last hunger choice starts the workflow and fallback path reaches placed", async () => {
    vi.useFakeTimers();
    try {
      const { t, partyId, userIds, hostDeviceId } = await setup();
      for (const userId of userIds) {
        await t.mutation(api.parties.join, { partyId, userId, via: "sim", hostDeviceId });
      }
      for (const [i, userId] of userIds.entries()) {
        await t.mutation(api.parties.setHunger, {
          partyId, userId, deviceId: `demo-diner-${i + 1}`, hunger: "normal",
        });
      }

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      expect((await t.query(api.parties.current, { partyId }))!.status).toBe("placed");
      expect((await t.query(api.messages.list, { partyId })).messages.length).toBeGreaterThan(0);
      expect((await t.query(api.orders.lines, { partyId })).lines.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("fallback rescue commits a live negotiating party idempotently", async () => {
    const t = convexTest(schema, modules);
    workflowTest.register(t, "workflow");
    const seeded = await t.mutation(internal.seed.base, {});
    const partyId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("parties", {
        restaurantId: seeded.restaurantId, hostDeviceId: seeded.hostDeviceId, size: 4,
        status: "negotiating", joinCode: "RESCUE", epoch: 0, negotiationStartedAt: Date.now(),
      });
      for (const [i, userId] of seeded.userIds.entries()) {
        await ctx.db.insert("members", { partyId: id, userId, joinedVia: "sim", joinedAt: Date.now() + i, hunger: "normal" });
      }
      return id;
    });

    await t.action(internal.negotiation.rescue, { partyId, epoch: 0 });
    await t.action(internal.negotiation.rescue, { partyId, epoch: 0 });

    const party = await t.run((ctx) => ctx.db.get(partyId));
    expect(party?.committedAt).toBeDefined();
    expect((await t.query(api.messages.list, { partyId })).messages.length).toBeGreaterThan(0);
    for (const userId of seeded.userIds) {
      expect((await t.query(api.orders.candidates, { partyId, userId })).length).toBeGreaterThan(0);
    }
  });
});

describe("orders", () => {
  test("negotiated scenario: pick, add (UNSAFE), remove with substitute, totals sum exactly, placed", async () => {
    const t = convexTest(schema, modules);
    workflowTest.register(t, "workflow");
    const s = await t.mutation(internal.seed.scenario, { scenario: "negotiated" });
    const { partyId, userIds } = s;
    for (const [i, userId] of userIds.entries()) {
      const cands = await t.query(api.orders.candidates, { partyId, userId });
      expect(cands.filter((c) => !c.isDrink).length).toBeGreaterThan(0);
      await t.mutation(api.orders.pick, { partyId, userId, deviceId: `demo-diner-${i + 1}`, itemId: cands.find((c) => !c.isDrink)!.itemId });
    }
    expect((await t.query(api.parties.current, { partyId }))!.status).toBe("confirm");

    // Maya (shellfish) can't add the paella, personally or for the table.
    const menu = await t.query(api.menu.list, { restaurantId: s.restaurantId });
    const paella = menu.find((m) => m.name === "Seafood Paella")!;
    expect(await code(t.mutation(api.orders.add, { partyId, userId: userIds[0], deviceId: "demo-diner-1", itemId: paella._id, shared: false }))).toBe("UNSAFE");
    // Sam (gluten) can't share the flatbread.
    const flat = menu.find((m) => m.name === "Margherita Flatbread")!;
    expect(await code(t.mutation(api.orders.add, { partyId, userId: userIds[1], deviceId: "demo-diner-2", itemId: flat._id, shared: true }))).toBe("UNSAFE");

    const { lines } = await t.query(api.orders.lines, { partyId });
    const mayaMain = lines.find((l) => l.kind === "main" && l.sharedBy[0] === userIds[0])!;
    const { substitute } = await t.mutation(api.orders.remove, { partyId, userId: userIds[0], deviceId: "demo-diner-1", lineId: mayaMain.lineId });
    expect(substitute).not.toBeNull();
    await t.mutation(api.orders.add, { partyId, userId: userIds[0], deviceId: "demo-diner-1", itemId: substitute!.itemId, shared: false });

    const { totals } = await t.query(api.orders.lines, { partyId });
    expect(Object.values(totals.perUser).reduce((a, b) => a + b, 0)).toBe(totals.total);

    for (const [i, userId] of userIds.entries()) {
      await t.mutation(api.orders.confirm, { partyId, userId, deviceId: `demo-diner-${i + 1}` });
    }
    expect((await t.query(api.parties.current, { partyId }))!.status).toBe("placed");
  });

  test("diner calls are bound to their device", async () => {
    const t = convexTest(schema, modules);
    workflowTest.register(t, "workflow");
    const { partyId, userIds } = await t.mutation(internal.seed.scenario, { scenario: "negotiated" });
    const cands = await t.query(api.orders.candidates, { partyId, userId: userIds[0] });
    expect(await code(t.mutation(api.orders.pick, { partyId, userId: userIds[0], deviceId: "demo-diner-2", itemId: cands[0].itemId }))).toBe("NOT_MEMBER");
  });

  test("removing a shared line removes only the caller and deletes it when the last sharer leaves", async () => {
    const t = convexTest(schema, modules);
    workflowTest.register(t, "workflow");
    const { partyId, restaurantId, userIds } = await t.mutation(internal.seed.scenario, { scenario: "negotiated" });
    for (const [i, userId] of userIds.entries()) {
      const cands = await t.query(api.orders.candidates, { partyId, userId });
      await t.mutation(api.orders.pick, { partyId, userId, deviceId: `demo-diner-${i + 1}`, itemId: cands.find((c) => !c.isDrink)!.itemId });
    }
    const menu = await t.query(api.menu.list, { restaurantId });
    const safeSharedItem = menu.find((item) => item.name === "Salted Edamame")!;
    const lineId = await t.mutation(api.orders.add, { partyId, userId: userIds[0], deviceId: "demo-diner-1", itemId: safeSharedItem._id, shared: true });
    for (const [i, userId] of userIds.entries()) {
      await t.mutation(api.orders.remove, { partyId, userId, deviceId: `demo-diner-${i + 1}`, lineId });
      const line = (await t.query(api.orders.lines, { partyId })).lines.find((candidate) => candidate.lineId === lineId);
      if (i < userIds.length - 1) expect(line?.sharedBy).toEqual(userIds.slice(i + 1));
      else expect(line).toBeUndefined();
    }
  });

  test("auto-pick and auto-confirm advance the party and final safety drops unsafe lines", async () => {
    const t = convexTest(schema, modules);
    workflowTest.register(t, "workflow");
    const { partyId, restaurantId, userIds } = await t.mutation(internal.seed.scenario, { scenario: "negotiated" });
    const menu = await t.query(api.menu.list, { restaurantId });
    const unsafeItem = menu.find((item) => item.name === "Seafood Paella")!;
    await t.run(async (ctx) => {
      await ctx.db.insert("orderLines", {
        partyId, itemId: unsafeItem._id, qty: 1, kind: "shared", sharedBy: [userIds[0]], addedBy: "agent",
      });
    });

    await t.mutation(internal.orders.autoPick, { partyId, epoch: 0 });
    expect((await t.query(api.parties.current, { partyId }))!.status).toBe("confirm");
    await t.mutation(internal.orders.autoConfirm, { partyId, epoch: 0 });
    expect((await t.query(api.parties.current, { partyId }))!.status).toBe("placed");
    expect((await t.query(api.orders.lines, { partyId })).lines.some((line) => line.itemId === unsafeItem._id)).toBe(false);
  });
});

describe("messages", () => {
  test("paced 2.5 s apart and deduped", async () => {
    const t = convexTest(schema, modules);
    workflowTest.register(t, "workflow");
    const { partyId } = await t.mutation(internal.seed.scenario, { scenario: "negotiated" });
    const before = (await t.query(api.messages.list, { partyId })).messages;
    await t.mutation(internal.messages.insertPaced, { partyId, text: before[0].text, fromUserId: before[0].fromUserId ?? undefined });
    const after = (await t.query(api.messages.list, { partyId })).messages;
    expect(after.length).toBe(before.length);
    for (let i = 1; i < after.length; i++) expect(after[i].showAt - after[i - 1].showAt).toBeGreaterThanOrEqual(2_500);
  });
});

describe("menu input mapping", () => {
  test("scraper ingredients are passed through to the normalizer input", () => {
    expect(mapScraperOutput([{ name: "Special", price: "$9", ingredients: "sesame; soy" }])).toEqual([
      { name: "Special", description: "", ingredients: ["sesame", "soy"], price: "$9", category: undefined },
    ]);
  });
});
