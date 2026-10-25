import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { fail } from "./shared/errors";

// Avoid a TypeScript circular initializer: generated API types include this module.
const onboardingApi: any = (internal as any).onboarding;

const candidateV = v.object({
  name: v.string(), address: v.string(), mapsUrl: v.optional(v.string()), googlePlaceId: v.optional(v.string()),
  websiteUrl: v.optional(v.string()), phone: v.optional(v.string()), hours: v.optional(v.array(v.string())),
  rating: v.optional(v.number()), distance: v.optional(v.number()), matchScore: v.optional(v.number()), rawPayload: v.optional(v.any()),
});
const rawItemV = v.object({ name: v.string(), description: v.optional(v.string()), price: v.optional(v.union(v.string(), v.number())), category: v.optional(v.string()), imageUrl: v.optional(v.string()) });
const editedItemV = v.object({
  name: v.string(), category: v.string(), cuisine: v.optional(v.string()), tags: v.array(v.string()), description: v.string(),
  priceCents: v.number(), allergens: v.array(v.any()), diet: v.array(v.string()), spice: v.number(), isDrink: v.boolean(),
  shareable: v.boolean(), menuOrder: v.number(), tagStatus: v.union(v.literal("tagged"), v.literal("untagged")), imageUrl: v.optional(v.string()),
});

type Ctx = { db: any };
async function account(ctx: Ctx, deviceId: string) {
  const row = await ctx.db.query("restaurantAccounts").withIndex("by_device", (q: any) => q.eq("deviceId", deviceId)).unique();
  if (!row || row.status !== "active") fail("NOT_FOUND", "Restaurant account not found");
  return row;
}
async function owned(ctx: Ctx, deviceId: string, restaurantId: Id<"restaurants">) {
  const a = await account(ctx, deviceId);
  const r = await ctx.db.get(restaurantId);
  if (!r || r.ownerAccountId !== a._id) fail("NOT_HOST", "Only the owning device can modify this restaurant");
  return { a, r };
}
async function onboarding(ctx: Ctx, deviceId: string, onboardingId: Id<"restaurantOnboardings">) {
  const a = await account(ctx, deviceId);
  const row = await ctx.db.get(onboardingId);
  if (!row || row.ownerAccountId !== a._id) fail("NOT_HOST", "Only the owning device can modify this onboarding");
  return { a, row };
}

export const createOrGet = mutation({
  args: { deviceId: v.string(), displayName: v.string() },
  handler: async (ctx, { deviceId, displayName }) => {
    const existing = await ctx.db.query("restaurantAccounts").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique();
    const now = Date.now();
    if (existing) { await ctx.db.patch(existing._id, { lastSeenAt: now }); return existing._id; }
    return ctx.db.insert("restaurantAccounts", { deviceId, displayName, createdAt: now, lastSeenAt: now, status: "active" });
  },
});

export const me = query({ args: { deviceId: v.string() }, handler: async (ctx, { deviceId }) => {
  const a = await ctx.db.query("restaurantAccounts").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique();
  if (!a) return null;
  const restaurant = await ctx.db.query("restaurants").filter((q) => q.eq(q.field("ownerAccountId"), a._id)).first();
  return { ...a, restaurantId: restaurant?._id ?? null };
} });

export const createDraft = mutation({
  args: { deviceId: v.string(), name: v.string(), address: v.string() },
  handler: async (ctx, { deviceId, name, address }) => {
    const a = await account(ctx, deviceId);
    const existing = await ctx.db.query("restaurants").filter((q) => q.eq(q.field("ownerAccountId"), a._id)).first();
    if (existing) fail("INVALID", "This device already has a restaurant account");
    const restaurantId = await ctx.db.insert("restaurants", { ownerAccountId: a._id, name, address, menuSource: "seed", onboardingStatus: "created" });
    const now = Date.now();
    return ctx.db.insert("restaurantOnboardings", { ownerAccountId: a._id, restaurantId, submittedName: name, submittedAddress: address, status: "created", candidates: [], createdAt: now, updatedAt: now });
  },
});

export const getOwned = query({ args: { deviceId: v.string() }, handler: async (ctx, { deviceId }) => {
  const a = await account(ctx, deviceId);
  return ctx.db.query("restaurants").filter((q) => q.eq(q.field("ownerAccountId"), a._id)).first();
} });

export const submitDetails = mutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), name: v.string(), address: v.string() }, handler: async (ctx, args) => {
  const { row } = await onboarding(ctx, args.deviceId, args.onboardingId); const now = Date.now();
  await ctx.db.patch(args.onboardingId, { submittedName: args.name, submittedAddress: args.address, status: "details_submitted", updatedAt: now, errorMessage: undefined });
  if (row.restaurantId) await ctx.db.patch(row.restaurantId, { name: args.name, address: args.address, onboardingStatus: "details_submitted" });
  return args.onboardingId;
} });

export const getStatus = query({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings") }, handler: async (ctx, args) => { await onboarding(ctx, args.deviceId, args.onboardingId); return ctx.db.get(args.onboardingId); } });
export const listCandidates = query({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings") }, handler: async (ctx, args) => { const { row } = await onboarding(ctx, args.deviceId, args.onboardingId); return row.candidates; } });

export const resolveGoogleMaps = action({
  args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings") },
  handler: async (ctx, args) => {
    await ctx.runMutation(onboardingApi.setStatus, { deviceId: args.deviceId, onboardingId: args.onboardingId, status: "finding_restaurant" });
    const actor = process.env.APIFY_GOOGLE_MAPS_ACTOR;
    if (!actor || !process.env.APIFY_TOKEN) return ctx.runMutation(onboardingApi.setStatus, { deviceId: args.deviceId, onboardingId: args.onboardingId, status: "manual_review", errorMessage: "Google Maps search is not configured" });
    try {
      const row = await ctx.runQuery(onboardingApi.getForAction, { onboardingId: args.onboardingId });
      const response = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor.replace("/", "~"))}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}&timeout=60`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ searchStringsArray: [`${row.submittedName} ${row.submittedAddress}`], maxCrawledPlaces: 5, includeWebResults: true }) });
      if (!response.ok) throw new Error(`Google Maps Actor HTTP ${response.status}`);
      const payload = await response.json();
      const candidates = (Array.isArray(payload) ? payload : []).slice(0, 5).map((x: any) => JSON.parse(JSON.stringify({ name: x.title ?? x.name ?? "", address: x.address ?? x.addressObj?.street ?? "", mapsUrl: x.url ?? x.googleMapsUrl, googlePlaceId: x.placeId, websiteUrl: x.website ?? x.websiteUrl, phone: x.phone, hours: Array.isArray(x.openingHours) ? x.openingHours : undefined, rating: typeof x.rating === "number" ? x.rating : undefined, distance: typeof x.distance === "number" ? x.distance : undefined, matchScore: 0, rawPayload: x }))).filter((x: any) => x.name && x.address);
      return ctx.runMutation(onboardingApi.saveCandidates, { deviceId: args.deviceId, onboardingId: args.onboardingId, candidates });
    } catch (e) { return ctx.runMutation(onboardingApi.setStatus, { deviceId: args.deviceId, onboardingId: args.onboardingId, status: "manual_review", errorMessage: String(e) }); }
  },
});

export const selectCandidate = mutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), candidate: candidateV }, handler: async (ctx, args) => { const { row } = await onboarding(ctx, args.deviceId, args.onboardingId); if (!row.candidates.some((x: any) => x.mapsUrl === args.candidate.mapsUrl && x.name === args.candidate.name)) fail("INVALID", "Candidate is not part of this onboarding"); const now = Date.now(); if (row.restaurantId) await ctx.db.patch(row.restaurantId, { name: args.candidate.name, address: args.candidate.address, mapsUrl: args.candidate.mapsUrl, googlePlaceId: args.candidate.googlePlaceId, googleMapsName: args.candidate.name, phone: args.candidate.phone, websiteUrl: args.candidate.websiteUrl, hours: args.candidate.hours, rating: args.candidate.rating, onboardingStatus: "restaurant_confirmed" }); await ctx.db.patch(args.onboardingId, { selectedCandidate: args.candidate, status: "restaurant_confirmed", updatedAt: now }); return args.onboardingId; } });

export const scrapeMenu = action({
  args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), menuUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(onboardingApi.getForAction, { onboardingId: args.onboardingId });
    if (!row || row.ownerAccountId !== (await ctx.runQuery(onboardingApi.accountId, { deviceId: args.deviceId }))) throw new Error("Only the owning device can scrape this onboarding");
    const candidate: any = row.selectedCandidate ?? {};
    const url = args.menuUrl ?? candidate.websiteUrl;
    await ctx.runMutation(onboardingApi.setStatus, { deviceId: args.deviceId, onboardingId: args.onboardingId, status: "scraping_menu" });
    try {
      const actor = process.env.APIFY_SCRAPER_ACTOR;
      if (!actor || !process.env.APIFY_TOKEN || !url) throw new Error("No menu URL or scraper is configured");
      const response = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor.replace("/", "~"))}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}&timeout=60`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ googleMapsUrl: candidate.mapsUrl, menuUrl: url, restaurantName: row.submittedName, maxRequestsPerCrawl: 10 }) });
      if (!response.ok) throw new Error(`Menu scraper HTTP ${response.status}`);
      const payload = await response.json(); const items = (Array.isArray(payload) ? payload : []).map((x: any) => ({ name: x.name ?? x.title ?? x.itemName, description: x.description ?? "", price: x.price ?? x.priceText, category: x.category ?? x.section, ...(typeof (x.imageUrl ?? x.image ?? x.photoUrl) === "string" ? { imageUrl: x.imageUrl ?? x.image ?? x.photoUrl } : {}) })).filter((x: any) => typeof x.name === "string" && x.name.trim());
      if (!items.length) throw new Error("Menu scraper returned no usable items");
      return ctx.runMutation(onboardingApi.saveScrapedDraft, { deviceId: args.deviceId, onboardingId: args.onboardingId, items, scraperRunId: response.headers.get("x-apify-run-id") ?? undefined });
    } catch (e) { await ctx.runMutation(onboardingApi.setStatus, { deviceId: args.deviceId, onboardingId: args.onboardingId, status: "manual_review", errorMessage: String(e) }); return { status: "manual_review", errorMessage: String(e) }; }
  },
});

export const updateDraft = mutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), items: v.array(editedItemV) }, handler: async (ctx, args) => { const { row } = await onboarding(ctx, args.deviceId, args.onboardingId); if (!row.restaurantId) fail("INVALID", "Restaurant has not been created"); const draft = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", args.onboardingId)).unique(); const now = Date.now(); if (draft) await ctx.db.patch(draft._id, { editedItems: args.items, updatedAt: now, status: "draft" }); else await ctx.db.insert("menuDrafts", { onboardingId: args.onboardingId, restaurantId: row.restaurantId, source: "manual", rawItems: args.items, editedItems: args.items, status: "draft", createdAt: now, updatedAt: now }); await ctx.db.patch(args.onboardingId, { status: "review_required", updatedAt: now }); return args.onboardingId; } });
export const getDraft = query({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings") }, handler: async (ctx, args) => { await onboarding(ctx, args.deviceId, args.onboardingId); return ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", args.onboardingId)).unique(); } });

export const setStatus = internalMutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), status: v.union(v.literal("finding_restaurant"), v.literal("candidates_ready"), v.literal("manual_review"), v.literal("scraping_menu"), v.literal("review_required"), v.literal("normalizing"), v.literal("normalization_failed")), errorMessage: v.optional(v.string()) }, handler: async (ctx, args) => { await onboarding(ctx, args.deviceId, args.onboardingId); await ctx.db.patch(args.onboardingId, { status: args.status, errorMessage: args.errorMessage, updatedAt: Date.now() }); return args.status; } });
export const getForAction = internalQuery({ args: { onboardingId: v.id("restaurantOnboardings") }, handler: async (ctx, { onboardingId }) => { const row = await ctx.db.get(onboardingId); if (!row) throw new Error("Onboarding not found"); return row; } });
export const saveCandidates = internalMutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), candidates: v.array(candidateV) }, handler: async (ctx, args) => { await onboarding(ctx, args.deviceId, args.onboardingId); await ctx.db.patch(args.onboardingId, { candidates: args.candidates, status: args.candidates.length ? "candidates_ready" : "match_failed", updatedAt: Date.now(), errorMessage: args.candidates.length ? undefined : "No matching restaurants found" }); return args.candidates; } });
export const saveScrapedDraft = internalMutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), items: v.array(rawItemV), scraperRunId: v.optional(v.string()) }, handler: async (ctx, args) => { const { row } = await onboarding(ctx, args.deviceId, args.onboardingId); if (!row.restaurantId) throw new Error("Restaurant has not been created"); const now = Date.now(); const existing = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", args.onboardingId)).unique(); const values = { rawItems: args.items, editedItems: args.items, source: "scraped" as const, updatedAt: now, status: "draft" as const }; if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("menuDrafts", { onboardingId: args.onboardingId, restaurantId: row.restaurantId, createdAt: now, ...values }); await ctx.db.patch(args.onboardingId, { status: "review_required", scraperRunId: args.scraperRunId, updatedAt: now }); await ctx.db.patch(row.restaurantId, { onboardingStatus: "review_required", lastScrapedAt: now, scraperRunId: args.scraperRunId }); return { status: "review_required", itemCount: args.items.length }; } });

export const publish = action({
  args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), items: v.array(editedItemV) },
  handler: async (ctx, args) => {
    const row = await ctx.runQuery(onboardingApi.getForAction, { onboardingId: args.onboardingId });
    if (!row || row.ownerAccountId !== (await ctx.runQuery(onboardingApi.accountId, { deviceId: args.deviceId }))) throw new Error("Only the owning device can publish this onboarding");
    if (!row.restaurantId) throw new Error("Restaurant has not been created");
    await ctx.runMutation(onboardingApi.beginPublish, { onboardingId: args.onboardingId, items: args.items });
    const actor = process.env.APIFY_NORMALIZER_ACTOR;
    try {
      if (!actor || !process.env.APIFY_TOKEN) throw new Error("Menu normalizer is not configured");
      const response = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor.replace("/", "~"))}/run-sync-get-dataset-items?token=${process.env.APIFY_TOKEN}&timeout=60`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: args.items, batchSize: 8 }) });
      if (!response.ok) throw new Error(`Menu normalizer HTTP ${response.status}`);
      const normalized = await response.json();
      if (!Array.isArray(normalized) || normalized.length === 0) throw new Error("Normalizer returned no valid items");
      return await ctx.runMutation(onboardingApi.activateVersion, { onboardingId: args.onboardingId, restaurantId: row.restaurantId, sourceItems: args.items, items: normalized, normalizerRunId: response.headers.get("x-apify-run-id") ?? undefined });
    } catch (e) {
      await ctx.runMutation(onboardingApi.failPublish, { onboardingId: args.onboardingId, errorMessage: String(e) });
      throw e;
    }
  },
});

export const accountId = internalQuery({ args: { deviceId: v.string() }, handler: async (ctx, { deviceId }) => (await account(ctx, deviceId))._id });
export const beginPublish = internalMutation({ args: { onboardingId: v.id("restaurantOnboardings"), items: v.array(editedItemV) }, handler: async (ctx, { onboardingId, items }) => { const draft = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", onboardingId)).unique(); const now = Date.now(); if (draft) await ctx.db.patch(draft._id, { editedItems: items, status: "publishing", updatedAt: now }); else { const row = await ctx.db.get(onboardingId); if (!row?.restaurantId) throw new Error("Restaurant has not been created"); await ctx.db.insert("menuDrafts", { onboardingId, restaurantId: row.restaurantId, source: "manual", rawItems: items, editedItems: items, status: "publishing", createdAt: now, updatedAt: now }); } await ctx.db.patch(onboardingId, { status: "normalizing", updatedAt: now }); } });
export const failPublish = internalMutation({ args: { onboardingId: v.id("restaurantOnboardings"), errorMessage: v.string() }, handler: async (ctx, { onboardingId, errorMessage }) => { const draft = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", onboardingId)).unique(); if (draft) await ctx.db.patch(draft._id, { status: "failed", updatedAt: Date.now() }); await ctx.db.patch(onboardingId, { status: "normalization_failed", errorMessage, updatedAt: Date.now() }); } });
export const activateVersion = internalMutation({ args: { onboardingId: v.id("restaurantOnboardings"), restaurantId: v.id("restaurants"), sourceItems: v.array(editedItemV), items: v.array(v.any()), normalizerRunId: v.optional(v.string()) }, handler: async (ctx, args) => { const previous = await ctx.db.get(args.restaurantId); const versions = await ctx.db.query("restaurantMenuVersions").withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId)).collect(); const now = Date.now(); const versionId = await ctx.db.insert("restaurantMenuVersions", { restaurantId: args.restaurantId, version: versions.length + 1, status: "active", source: "manual", normalizerRunId: args.normalizerRunId, createdAt: now, publishedAt: now }); for (const old of versions.filter((v: any) => v.status === "active")) await ctx.db.patch(old._id, { status: "historical" }); for (const item of args.items) await ctx.db.insert("menuItems", { restaurantId: args.restaurantId, menuVersionId: versionId, ...item }); await ctx.db.patch(args.restaurantId, { activeMenuVersionId: versionId, onboardingStatus: "ready", lastNormalizedAt: now, normalizerRunId: args.normalizerRunId }); const draft = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", args.onboardingId)).unique(); if (draft) await ctx.db.patch(draft._id, { status: "published", updatedAt: now }); await ctx.db.patch(args.onboardingId, { status: "ready", updatedAt: now, errorMessage: undefined }); return { versionId, previousVersionId: previous?.activeMenuVersionId ?? null }; } });
