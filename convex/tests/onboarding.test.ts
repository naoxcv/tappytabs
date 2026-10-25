import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { normalizerPrice, publishedPriceVerified, withEstimatedPrices } from "../lib/normalizerPrice";

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
  test("passes unknown zero prices to the normalizer as missing, including older client payloads", () => {
    expect(normalizerPrice({ priceCents: 0, priceVerified: false })).toEqual({});
    expect(normalizerPrice({ priceCents: 0 })).toEqual({});
    expect(normalizerPrice({ priceCents: 0, priceVerified: true })).toEqual({ price: "$0.00" });
    expect(normalizerPrice({ priceCents: 1450, priceVerified: false })).toEqual({ price: "$14.50" });
    expect(publishedPriceVerified({ priceCents: 1650, priceVerified: false }, { priceCents: 1650, priceVerified: true })).toBe(false);
    expect(publishedPriceVerified({ priceCents: 0 }, { priceCents: 1650, priceVerified: false })).toBe(false);
  });

  test("accepts only matching, unverified actor price estimates", () => {
    const raw = [{ name: "Pasta", price: 0 }, { name: "Tea", price: "$4.00" }];
    expect(withEstimatedPrices(raw, [
      { name: "Pasta", menuOrder: 0, priceCents: 1650, priceVerified: false },
      { name: "Tea", menuOrder: 1, priceCents: 500, priceVerified: false },
    ])).toEqual([{ name: "Pasta", price: 0, estimatedPriceCents: 1650 }, raw[1]]);
    expect(withEstimatedPrices(raw, [{ name: "Wrong dish", menuOrder: 0, priceCents: 1650, priceVerified: false }])).toEqual(raw);
  });

  test("can skip onboarding into the checked-in demo menu", async () => {
    const t = testBackend();
    await t.mutation(api.onboarding.createOrGet, { deviceId: "demo-owner", displayName: "Restaurant" });
    const restaurantId = await t.mutation(api.onboarding.skipToDemo, { deviceId: "demo-owner" });
    const restaurant = await t.query(api.onboarding.getOwned, { deviceId: "demo-owner" });
    expect(restaurant?._id).toBe(restaurantId);
    expect(restaurant?.menuSource).toBe("seed");
    expect(restaurant?.onboardingStatus).toBe("ready");
    expect((await t.query(api.menu.status, { restaurantId }))?.itemCount).toBeGreaterThan(0);
    expect((await t.query(api.onboarding.me, { deviceId: "demo-owner" }))?.onboardingId).toBeTruthy();
  });

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

  test("converts a scraper result into an iOS-decodable review draft", async () => {
    const t = testBackend();
    await t.mutation(api.onboarding.createOrGet, { deviceId: "owner-device", displayName: "Owner" });
    const onboardingId = await t.mutation(api.onboarding.createDraft, {
      deviceId: "owner-device", name: "Tappy Cafe", address: candidate.address,
    });
    const rawItems = [
      { name: "Rice Bowl", description: "Seasonal vegetables", price: 14.5, category: "Mains" },
      { name: "Iced Tea", price: "$4.00", category: "Drinks" },
      { name: "Pasta", price: 0, estimatedPriceCents: 1650, category: "Mains" },
    ];

    await t.mutation(internal.onboarding.saveUrlResult, {
      deviceId: "owner-device",
      onboardingId,
      actorRunId: "run-123",
      result: { ...candidate, sourceUrl: "https://tappy.example/menu", rawItems },
    });

    const draft = await t.query(api.onboarding.getDraft, { deviceId: "owner-device", onboardingId });
    expect(draft?.rawItems).toEqual([
      { name: "Rice Bowl", description: "Seasonal vegetables", price: "14.5", category: "Mains" },
      { name: "Iced Tea", description: "", price: "$4.00", category: "Drinks" },
      { name: "Pasta", description: "", price: "0", category: "Mains" },
    ]);
    expect(draft?.editedItems).toEqual([
      expect.objectContaining({ name: "Rice Bowl", priceCents: 1450, tagStatus: "untagged", menuOrder: 0 }),
      expect.objectContaining({ name: "Iced Tea", priceCents: 400, tagStatus: "untagged", menuOrder: 1 }),
      expect.objectContaining({ name: "Pasta", priceCents: 1650, priceVerified: false, menuOrder: 2 }),
    ]);
    expect((await t.query(api.onboarding.getStatus, { deviceId: "owner-device", onboardingId }))?.status).toBe("review_required");
  });

  test("search selection uses the stored candidate menu when the iOS client sends only identity fields", async () => {
    const t = testBackend();
    await t.mutation(api.onboarding.createOrGet, { deviceId: "owner-device", displayName: "Owner" });
    const onboardingId = await t.mutation(api.onboarding.createDraft, {
      deviceId: "owner-device", name: "Tappy Cafe", address: candidate.address,
    });
    await t.mutation(internal.onboarding.saveSearchResults, {
      deviceId: "owner-device", onboardingId,
      candidates: [{ ...candidate, sourceUrl: "https://tappy.example/menu", rawItems: [{ name: "Pasta", price: 0, estimatedPriceCents: 1650 }] }],
    });
    await t.mutation(api.onboarding.selectCandidate, {
      deviceId: "owner-device", onboardingId,
      candidate: { name: candidate.name, address: candidate.address, sourceUrl: "https://tappy.example/menu" },
    });
    const draft = await t.query(api.onboarding.getDraft, { deviceId: "owner-device", onboardingId });
    expect(draft?.editedItems[0]).toEqual(expect.objectContaining({ name: "Pasta", priceCents: 1650, priceVerified: false }));
    expect((await t.query(api.onboarding.getStatus, { deviceId: "owner-device", onboardingId }))?.status).toBe("review_required");
  });

  test("a completed URL scrape prefills zero prices from the normalizer before review", async () => {
    const t = testBackend();
    await t.mutation(api.onboarding.createOrGet, { deviceId: "owner-device", displayName: "Owner" });
    const onboardingId = await t.mutation(api.onboarding.createDraft, {
      deviceId: "owner-device", name: "Tappy Cafe", address: candidate.address,
    });
    vi.stubEnv("APIFY_TOKEN", "test-token");
    vi.stubEnv("APIFY_NORMALIZER_ACTOR", "test/menu-normalizer");
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (request: string, init?: RequestInit) => {
      requests.push(request);
      const payload = request.includes("/actor-runs/")
        ? { data: { status: "SUCCEEDED", defaultDatasetId: "dataset-1" } }
        : request.includes("/datasets/")
          ? [{ success: true, restaurant: { name: "Tappy Cafe", address: candidate.address, url: "https://tappy.example/menu" },
              menu: { categories: [{ name: "Mains", items: Array.from({ length: 5 }, (_, index) => ({ name: `Dish ${index}`, price: index === 0 ? 0 : 12 })) }] } }]
          : [{ name: "Dish 0", menuOrder: 0, priceCents: 1550, priceVerified: false }];
      if (init?.body) expect(JSON.parse(String(init.body)).items[0].price).toBe("0");
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    try {
      await t.action(internal.onboarding.pollActorRun, {
        onboardingId, deviceId: "owner-device", actorRunId: "run-1", mode: "url", deadline: Date.now() + 60_000,
      });
      const draft = await t.query(api.onboarding.getDraft, { deviceId: "owner-device", onboardingId });
      expect(draft?.editedItems[0]).toEqual(expect.objectContaining({ name: "Dish 0", priceCents: 1550, priceVerified: false }));
      expect(requests.some((url) => url.includes("run-sync-get-dataset-items"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });

  test("publishing estimates unknown zero prices and preserves estimate provenance", async () => {
    const t = testBackend();
    await t.mutation(api.onboarding.createOrGet, { deviceId: "owner-device", displayName: "Owner" });
    const onboardingId = await t.mutation(api.onboarding.createDraft, {
      deviceId: "owner-device", name: "Tappy Cafe", address: candidate.address,
    });
    vi.stubEnv("APIFY_TOKEN", "test-token");
    vi.stubEnv("APIFY_NORMALIZER_ACTOR", "test/menu-normalizer");
    vi.stubGlobal("fetch", async (_request: string, init?: RequestInit) => {
      const input = JSON.parse(String(init?.body));
      expect(input.items[0].price).toBeUndefined();
      expect(input.items[1].price).toBe("$16.50");
      return new Response(JSON.stringify([
        { ...normalizedItem, name: "Pasta", priceCents: 1550, priceVerified: false, menuOrder: 0 },
        { ...normalizedItem, name: "Pizza", priceCents: 1650, priceVerified: true, menuOrder: 1 },
      ]), { status: 200 });
    });
    try {
      const result = await t.action(api.onboarding.publish, {
        deviceId: "owner-device", onboardingId,
        items: [{ ...normalizedItem, name: "Pasta", priceCents: 0, menuOrder: 0 },
          { ...normalizedItem, name: "Pizza", priceCents: 1650, priceVerified: false, menuOrder: 1 }],
      });
      const menu = await t.query(api.menu.list, { restaurantId: (await t.query(api.onboarding.getOwned, { deviceId: "owner-device" }))!._id });
      expect(result.versionId).toBeTruthy();
      expect(menu.map((item) => [item.name, item.priceCents, item.priceVerified])).toEqual([
        ["Pasta", 1550, false], ["Pizza", 1650, false],
      ]);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
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
    expect((await t.query(api.onboarding.getDraft, { deviceId: "owner-device", onboardingId }))?.errorMessage).toContain("Menu normalizer is not configured");
  });
});
