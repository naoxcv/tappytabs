import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/!(*.test).ts");

function testBackend() {
  return convexTest(schema, modules);
}

const candidate = {
  name: "The Tappy Cafe",
  address: "123 Main Street, San Jose, CA 95113",
  mapsUrl: "https://maps.google.com/?cid=123",
  googlePlaceId: "place-123",
  websiteUrl: "https://tappy.example/menu",
  phone: "+1 408 555 0100",
  hours: ["Mon-Sun: 8:00 AM-9:00 PM"],
  rating: 4.7,
  distance: 0.2,
  matchScore: 0.98,
  rawPayload: { placeId: "place-123" },
};

const normalizedItem = {
  name: "Rice Bowl",
  category: "mains",
  tags: [],
  description: "Steamed rice with seasonal vegetables",
  priceCents: 1400,
  allergens: [],
  diet: [],
  spice: 0,
  isDrink: false,
  shareable: false,
  menuOrder: 1,
  tagStatus: "tagged" as const,
};

async function errorCode(promise: Promise<unknown>) {
  try {
    await promise;
    return null;
  } catch (error: any) {
    return error?.data?.code ?? String(error);
  }
}

describe("restaurant onboarding", () => {
  test("creates one account per device and one restaurant draft per account", async () => {
    const t = testBackend();
    const accountId = await t.mutation(api.onboarding.createOrGet, { deviceId: "restaurant-device", displayName: "Tappy Cafe" });
    expect(await t.mutation(api.onboarding.createOrGet, { deviceId: "restaurant-device", displayName: "Updated Name" })).toBe(accountId);

    const onboardingId = await t.mutation(api.onboarding.createDraft, {
      deviceId: "restaurant-device", name: "The Tappy Cafe", address: candidate.address,
    });
    expect(onboardingId).toBeTruthy();
    expect(await errorCode(t.mutation(api.onboarding.createDraft, {
      deviceId: "restaurant-device", name: "Another Cafe", address: "456 Side Street",
    }))).toBe("INVALID");
  });

  test("persists candidates and requires the owner to select one", async () => {
    const t = testBackend();
    await t.mutation(api.onboarding.createOrGet, { deviceId: "owner-device", displayName: "Owner" });
    await t.mutation(api.onboarding.createOrGet, { deviceId: "other-device", displayName: "Other" });
    const onboardingId = await t.mutation(api.onboarding.createDraft, {
      deviceId: "owner-device", name: "Tappy Cafe", address: candidate.address,
    });
    await t.mutation(internal.onboarding.saveCandidates, {
      deviceId: "owner-device", onboardingId, candidates: [candidate],
    });

    expect(await t.query(api.onboarding.listCandidates, { deviceId: "owner-device", onboardingId })).toEqual([candidate]);
    expect(await errorCode(t.mutation(api.onboarding.selectCandidate, {
      deviceId: "other-device", onboardingId, candidate,
    }))).toBe("NOT_HOST");

    await t.mutation(api.onboarding.selectCandidate, { deviceId: "owner-device", onboardingId, candidate });
    expect((await t.query(api.onboarding.getStatus, { deviceId: "owner-device", onboardingId }))?.status).toBe("restaurant_confirmed");
    expect((await t.query(api.onboarding.getOwned, { deviceId: "owner-device" }))?.googlePlaceId).toBe("place-123");
  });

  test("stores owner-edited menu drafts and exposes them only to the owner", async () => {
    const t = testBackend();
    await t.mutation(api.onboarding.createOrGet, { deviceId: "owner-device", displayName: "Owner" });
    await t.mutation(api.onboarding.createOrGet, { deviceId: "other-device", displayName: "Other" });
    const onboardingId = await t.mutation(api.onboarding.createDraft, {
      deviceId: "owner-device", name: "Tappy Cafe", address: candidate.address,
    });
    await t.mutation(api.onboarding.updateDraft, {
      deviceId: "owner-device", onboardingId,
      items: [{ ...normalizedItem, name: "Owner Edited Rice Bowl", priceCents: 1600 }],
    });

    expect((await t.query(api.onboarding.getDraft, { deviceId: "owner-device", onboardingId }))?.editedItems).toEqual([
      { ...normalizedItem, name: "Owner Edited Rice Bowl", priceCents: 1600 },
    ]);
    expect(await errorCode(t.query(api.onboarding.getDraft, { deviceId: "other-device", onboardingId }))).toBe("NOT_HOST");
  });

  test("normalization failure preserves the previous active menu", async () => {
    const t = testBackend();
    const seeded = await t.mutation(internal.seed.base, {});
    await t.mutation(api.onboarding.createOrGet, { deviceId: "owner-device", displayName: "Owner" });
    const onboardingId = await t.mutation(api.onboarding.createDraft, {
      deviceId: "owner-device", name: "New Restaurant", address: candidate.address,
    });
    await t.mutation(api.onboarding.updateDraft, {
      deviceId: "owner-device", onboardingId, items: [normalizedItem],
    });

    expect(await errorCode(t.action(api.onboarding.publish, {
      deviceId: "owner-device", onboardingId, items: [normalizedItem],
    }))).not.toBeNull();
    expect((await t.query(api.onboarding.getStatus, { deviceId: "owner-device", onboardingId }))?.status).toBe("normalization_failed");
    expect((await t.query(api.menu.status, { restaurantId: seeded.restaurantId }))?.itemCount).toBeGreaterThan(0);
    expect((await t.query(api.onboarding.getDraft, { deviceId: "owner-device", onboardingId }))?.status).toBe("failed");
  });
});
