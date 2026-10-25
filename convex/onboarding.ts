import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { fail } from "./shared/errors";
import { normalizedItem } from "./menu";
import { DEMO_MENUS } from "./seedData";
import { normalizerPrice, publishedPriceVerified, scrapedPriceCents } from "./lib/normalizerPrice";

const api: any = (internal as any).onboarding;
const candidateV = v.object({ name: v.string(), address: v.string(), sourceUrl: v.optional(v.string()), confidence: v.optional(v.string()), extractionConfidence: v.optional(v.string()), categories: v.optional(v.array(v.string())), rawItems: v.optional(v.array(v.any())), rawPayload: v.optional(v.any()), mapsUrl: v.optional(v.string()), googlePlaceId: v.optional(v.string()), websiteUrl: v.optional(v.string()), phone: v.optional(v.string()), hours: v.optional(v.array(v.string())), rating: v.optional(v.number()), distance: v.optional(v.number()), matchScore: v.optional(v.number()) });
const rawItemV = v.object({ name: v.string(), description: v.optional(v.string()), price: v.optional(v.union(v.string(), v.number())), category: v.optional(v.string()), imageUrl: v.optional(v.string()) });
const editedItemV = v.object({ name: v.string(), category: v.string(), cuisine: v.optional(v.string()), tags: v.array(v.string()), description: v.string(), priceCents: v.number(), priceVerified: v.optional(v.boolean()), allergens: v.array(v.any()), diet: v.array(v.string()), spice: v.number(), isDrink: v.boolean(), shareable: v.boolean(), menuOrder: v.number(), tagStatus: v.union(v.literal("tagged"), v.literal("untagged")), imageUrl: v.optional(v.string()) });
const modeV = v.union(v.literal("url"), v.literal("search"));
const statusV = v.union(v.literal("finding_restaurant"), v.literal("candidates_ready"), v.literal("manual_review"), v.literal("scraping_menu"), v.literal("review_required"), v.literal("normalizing"), v.literal("normalization_failed"), v.literal("awaiting_source"), v.literal("scraping_url"), v.literal("scraping_search"), v.literal("search_results_ready"), v.literal("scrape_failed"));
type Ctx = { db: any };
async function account(ctx: Ctx, deviceId: string) { const row = await ctx.db.query("restaurantAccounts").withIndex("by_device", (q: any) => q.eq("deviceId", deviceId)).unique(); if (!row || row.status !== "active") fail("NOT_FOUND", "Restaurant account not found"); return row; }
async function own(ctx: Ctx, deviceId: string, onboardingId: Id<"restaurantOnboardings">) { const a = await account(ctx, deviceId); const row = await ctx.db.get(onboardingId); if (!row || row.ownerAccountId !== a._id) fail("NOT_HOST", "Only the owning device can modify this onboarding"); return { a, row }; }

export const createOrGet = mutation({ args: { deviceId: v.string(), displayName: v.string() }, handler: async (ctx, { deviceId, displayName }) => { const existing = await ctx.db.query("restaurantAccounts").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique(); const now = Date.now(); if (existing) { await ctx.db.patch(existing._id, { lastSeenAt: now }); return existing._id; } return ctx.db.insert("restaurantAccounts", { deviceId, displayName, createdAt: now, lastSeenAt: now, status: "active" }); } });
export const me = query({ args: { deviceId: v.string() }, handler: async (ctx, { deviceId }) => { const a = await ctx.db.query("restaurantAccounts").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique(); if (!a) return null; const restaurant = await ctx.db.query("restaurants").filter((q) => q.eq(q.field("ownerAccountId"), a._id)).first(); const onboarding = await ctx.db.query("restaurantOnboardings").withIndex("by_owner", (q) => q.eq("ownerAccountId", a._id)).order("desc").first(); return { ...a, restaurantId: restaurant?._id ?? null, activeMenuVersionId: restaurant?.activeMenuVersionId ?? null, onboardingId: onboarding?._id ?? null }; } });
export const createDraft = mutation({ args: { deviceId: v.string(), name: v.string(), address: v.string() }, handler: async (ctx, { deviceId, name, address }) => { const a = await account(ctx, deviceId); if (await ctx.db.query("restaurants").filter((q) => q.eq(q.field("ownerAccountId"), a._id)).first()) fail("INVALID", "This device already has a restaurant account"); const restaurantId = await ctx.db.insert("restaurants", { ownerAccountId: a._id, name, address, menuSource: "seed", onboardingStatus: "awaiting_source" }); const now = Date.now(); return ctx.db.insert("restaurantOnboardings", { ownerAccountId: a._id, restaurantId, submittedName: name, submittedAddress: address, status: "awaiting_source", candidates: [], createdAt: now, updatedAt: now }); } });
/** Creates a pre-scraping demo restaurant and activates one of the checked-in menu snapshots. */
export const skipToDemo = mutation({
  args: { deviceId: v.string(), menu: v.optional(v.union(v.literal("tappy"), v.literal("flourWater"))) },
  handler: async (ctx, { deviceId, menu }) => {
    const demo = DEMO_MENUS[menu ?? "tappy"];
    const a = await account(ctx, deviceId);
    const existing = await ctx.db.query("restaurants").filter((q) => q.eq(q.field("ownerAccountId"), a._id)).first();
    if (existing?.activeMenuVersionId && existing.onboardingStatus === "ready" && existing.name === demo.name) return existing._id;

    const now = Date.now();
    const restaurantId = existing?._id ?? await ctx.db.insert("restaurants", {
      ownerAccountId: a._id,
      name: demo.name,
      address: demo.address,
      menuSource: "seed",
      onboardingStatus: "ready",
    });
    const versions = await ctx.db.query("restaurantMenuVersions").withIndex("by_restaurant", (q) => q.eq("restaurantId", restaurantId)).collect();
    for (const version of versions.filter((row) => row.status === "active")) await ctx.db.patch(version._id, { status: "historical" });
    const versionId = await ctx.db.insert("restaurantMenuVersions", {
      restaurantId, version: versions.length + 1, status: "active", source: "manual", createdAt: now, publishedAt: now,
    });
    for (const item of demo.items) await ctx.db.insert("menuItems", { restaurantId, menuVersionId: versionId, ...item });
    await ctx.db.patch(restaurantId, { name: demo.name, address: demo.address, menuSource: "seed", onboardingStatus: "ready", activeMenuVersionId: versionId, lastNormalizedAt: now });

    const onboarding = await ctx.db.query("restaurantOnboardings").withIndex("by_owner", (q) => q.eq("ownerAccountId", a._id)).order("desc").first();
    if (onboarding) await ctx.db.patch(onboarding._id, { restaurantId, status: "ready", updatedAt: now, errorMessage: undefined });
    else await ctx.db.insert("restaurantOnboardings", { ownerAccountId: a._id, restaurantId, submittedName: demo.name, submittedAddress: demo.address, status: "ready", candidates: [], createdAt: now, updatedAt: now });
    return restaurantId;
  },
});
export const getOwned = query({ args: { deviceId: v.string() }, handler: async (ctx, { deviceId }) => { const a = await account(ctx, deviceId); return ctx.db.query("restaurants").filter((q) => q.eq(q.field("ownerAccountId"), a._id)).first(); } });
export const submitDetails = mutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), name: v.string(), address: v.string() }, handler: async (ctx, args) => { const { row } = await own(ctx, args.deviceId, args.onboardingId); const now = Date.now(); await ctx.db.patch(args.onboardingId, { submittedName: args.name, submittedAddress: args.address, status: "awaiting_source", updatedAt: now, errorMessage: undefined }); if (row.restaurantId) await ctx.db.patch(row.restaurantId, { name: args.name, address: args.address, onboardingStatus: "awaiting_source" }); return args.onboardingId; } });
export const getStatus = query({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings") }, handler: async (ctx, args) => { await own(ctx, args.deviceId, args.onboardingId); return ctx.db.get(args.onboardingId); } });
export const listCandidates = query({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings") }, handler: async (ctx, args) => (await own(ctx, args.deviceId, args.onboardingId)).row.candidates });

function apifyPath(id: string, resource: "acts" | "actor-tasks", suffix: string) { return `https://api.apify.com/v2/${resource}/${encodeURIComponent(id.replace("/", "~"))}/${suffix}`; }
function actorPath(actor: string, suffix: string) { return apifyPath(actor, "acts", suffix); }
function menuItems(payload: any): any[] { const menu = payload?.menu ?? payload?.data?.menu ?? payload; const categories = Array.isArray(menu?.categories) ? menu.categories : []; const direct = Array.isArray(menu?.items) ? menu.items.map((x: any) => ({ ...x, category: x.category ?? x.section })) : []; const nested = categories.flatMap((c: any) => Array.isArray(c.items) ? c.items.map((x: any) => ({ ...x, category: x.category ?? c.name })) : []); return [...direct, ...nested].map((x: any) => ({ name: x.name ?? x.title ?? x.itemName, description: x.description ?? "", price: x.price ?? x.priceText, category: x.category ?? x.section ?? "Other", imageUrl: x.imageUrl ?? x.image ?? x.photoUrl })).filter((x: any) => typeof x.name === "string" && x.name.trim()); }
function mapResult(payload: any, fallbackUrl?: string) { const items = menuItems(payload); const restaurant = payload?.restaurant ?? payload?.business ?? payload; const extractionConfidence = typeof payload?.extractionConfidence === "string" ? payload.extractionConfidence : payload?.extractionConfidence?.confidence ?? payload?.menu?.extractionConfidence?.confidence; const categories = Array.isArray(payload?.menu?.categories) ? payload.menu.categories.map((x: any) => x.name).filter(Boolean) : []; return { name: restaurant?.name ?? restaurant?.title ?? payload?.restaurantName ?? payload?.name ?? "", address: restaurant?.address ?? payload?.serperAddress ?? payload?.address ?? payload?.requestLocation ?? "", sourceUrl: restaurant?.sourceUrl ?? restaurant?.url ?? restaurant?.website ?? payload?.url ?? payload?.menuUrl ?? fallbackUrl, confidence: payload?.confidence ?? restaurant?.confidence, extractionConfidence, categories, rawItems: items, rawPayload: payload }; }
function usable(x: any) { return x && x.rawPayload?.success === true && x.name && x.sourceUrl && x.categories.length > 0 && x.rawItems.length >= 5 && x.confidence !== "low" && x.extractionConfidence !== "low"; }
function editableItems(rawItems: any[]): any[] {
  return rawItems.map((item, index) => {
    const scraped = scrapedPriceCents(item.price);
    return {
      name: String(item.name),
      category: String(item.category ?? "Other"),
      tags: [],
      description: String(item.description ?? ""),
      priceCents: scraped,
      priceVerified: scraped > 0,
      allergens: [],
      diet: [],
      spice: 0,
      isDrink: false,
      shareable: false,
      menuOrder: index,
      tagStatus: "untagged",
      ...(typeof item.imageUrl === "string" && /^https?:\/\//i.test(item.imageUrl) ? { imageUrl: item.imageUrl } : {}),
    };
  });
}
function rawItemsForClient(rawItems: any[]): any[] {
  return rawItems.map((item) => ({
    name: String(item.name),
    description: typeof item.description === "string" ? item.description : "",
    ...(item.price !== undefined && item.price !== null ? { price: String(item.price) } : {}),
    category: typeof item.category === "string" ? item.category : "Other",
    ...(typeof item.imageUrl === "string" ? { imageUrl: item.imageUrl } : {}),
  }));
}
async function startActor(ctx: any, args: any) { const task = args.mode === "url" ? process.env.APIFY_SCRAPER_URL_TASK : process.env.APIFY_SCRAPER_SEARCH_TASK; const token = process.env.APIFY_TOKEN; if (!task || !token) throw new Error(`${args.mode === "url" ? "APIFY_SCRAPER_URL_TASK" : "APIFY_SCRAPER_SEARCH_TASK"} and APIFY_TOKEN are required`); const input = args.mode === "url" ? { mode: "url", url: args.url, location: args.location, freshness: "med_cache" } : { mode: "search", query: args.query, location: args.location, freshness: "med_cache", maxResults: 3 }; const response = await fetch(`${apifyPath(task, "actor-tasks", "runs")}?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }); if (!response.ok) throw new Error(`Scraper Task HTTP ${response.status}`); const run: any = (await response.json()).data; if (!run?.id) throw new Error("Scraper Task did not return a run id"); await ctx.runMutation(api.recordActorRun, { deviceId: args.deviceId, onboardingId: args.onboardingId, mode: args.mode, actorRunId: run.id, sourceUrl: args.url, searchQuery: args.query, searchLocation: args.location }); await ctx.scheduler.runAfter(15000, api.pollActorRun, { onboardingId: args.onboardingId, deviceId: args.deviceId, actorRunId: run.id, mode: args.mode, deadline: Date.now() + (args.mode === "url" ? 4 : 8) * 60 * 1000 }); return { status: args.mode === "url" ? "scraping_url" : "scraping_search", actorRunId: run.id }; }
export const startUrlImport = action({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), url: v.string(), location: v.optional(v.string()) }, handler: async (ctx, args) => { try { return await startActor(ctx, { ...args, mode: "url" }); } catch (e) { await ctx.runMutation(api.failScrape, { onboardingId: args.onboardingId, errorMessage: String(e) }); return { status: "scrape_failed", errorMessage: String(e) }; } } });
export const startSearch = action({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), query: v.string(), location: v.string() }, handler: async (ctx, args) => { try { return await startActor(ctx, { ...args, mode: "search" }); } catch (e) { await ctx.runMutation(api.failScrape, { onboardingId: args.onboardingId, errorMessage: String(e) }); return { status: "scrape_failed", errorMessage: String(e) }; } } });
export const recordActorRun = internalMutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), mode: modeV, actorRunId: v.string(), sourceUrl: v.optional(v.string()), searchQuery: v.optional(v.string()), searchLocation: v.optional(v.string()) }, handler: async (ctx, args) => { await own(ctx, args.deviceId, args.onboardingId); await ctx.db.patch(args.onboardingId, { acquisitionMode: args.mode, actorRunId: args.actorRunId, sourceUrl: args.sourceUrl, searchQuery: args.searchQuery, searchLocation: args.searchLocation, status: args.mode === "url" ? "scraping_url" : "scraping_search", updatedAt: Date.now(), errorMessage: undefined }); } });
export const failScrape = internalMutation({ args: { onboardingId: v.id("restaurantOnboardings"), errorMessage: v.string() }, handler: async (ctx, args) => { await ctx.db.patch(args.onboardingId, { status: "scrape_failed", errorMessage: args.errorMessage, updatedAt: Date.now() }); } });
export const pollActorRun = internalAction({
  args: { onboardingId: v.id("restaurantOnboardings"), deviceId: v.string(), actorRunId: v.string(), mode: modeV, deadline: v.number() },
  handler: async (ctx, args) => {
    const token = process.env.APIFY_TOKEN;
    if (!token) return ctx.runMutation(api.failScrape, { onboardingId: args.onboardingId, errorMessage: "APIFY_TOKEN is not configured" });
    try {
      const response = await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(args.actorRunId)}?token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(`Scraper run HTTP ${response.status}`);
      const run: any = (await response.json()).data;
      const status = String(run.status ?? "");
      if (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
        if (Date.now() >= args.deadline) return ctx.runMutation(api.failScrape, { onboardingId: args.onboardingId, errorMessage: "Scraper Task timed out" });
        await ctx.scheduler.runAfter(15000, api.pollActorRun, args);
        return;
      }
      if (status !== "SUCCEEDED" || !run.defaultDatasetId) return ctx.runMutation(api.failScrape, { onboardingId: args.onboardingId, errorMessage: `Scraper Task finished with ${status}` });
      const data = await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&token=${encodeURIComponent(token)}`);
      if (!data.ok) throw new Error(`Scraper dataset HTTP ${data.status}`);
      const payload: any = await data.json();
      const onboarding: any = await ctx.runQuery(api.getForAction, { onboardingId: args.onboardingId });
      const results = (Array.isArray(payload) ? payload : []).map((x: any) => mapResult(x, onboarding?.sourceUrl)).filter(usable);
      // Missing prices stay at zero for review; the async publish normalizer estimates them.
      if (args.mode === "search") return ctx.runMutation(api.saveSearchResults, { onboardingId: args.onboardingId, deviceId: args.deviceId, candidates: results.slice(0, 3) });
      const result = results[0];
      if (!result) return ctx.runMutation(api.failScrape, { onboardingId: args.onboardingId, errorMessage: "No usable menu found. Enter a menu URL or request manual review." });
      return ctx.runMutation(api.saveUrlResult, { onboardingId: args.onboardingId, deviceId: args.deviceId, result, actorRunId: args.actorRunId });
    } catch (error) {
      return ctx.runMutation(api.failScrape, { onboardingId: args.onboardingId, errorMessage: String(error) });
    }
  },
});
export const saveSearchResults = internalMutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), candidates: v.array(candidateV) }, handler: async (ctx, args) => { await own(ctx, args.deviceId, args.onboardingId); await ctx.db.patch(args.onboardingId, { candidates: args.candidates, status: args.candidates.length ? "search_results_ready" : "match_failed", updatedAt: Date.now(), errorMessage: args.candidates.length ? undefined : "No usable menus found" }); return args.candidates; } });
// Compatibility reader for pre-POC fixtures. New code uses saveSearchResults.
export const saveCandidates = internalMutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), candidates: v.array(candidateV) }, handler: async (ctx, args) => { await own(ctx, args.deviceId, args.onboardingId); await ctx.db.patch(args.onboardingId, { candidates: args.candidates, status: args.candidates.length ? "candidates_ready" : "match_failed", updatedAt: Date.now() }); return args.candidates; } });
async function createDraftFromResult(ctx: any, onboardingId: Id<"restaurantOnboardings">, restaurantId: Id<"restaurants">, result: any, now: number, actorRunId?: string) { const existing = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q: any) => q.eq("onboardingId", onboardingId)).unique(); const values = { rawItems: rawItemsForClient(result.rawItems), editedItems: editableItems(result.rawItems), source: "scraped" as const, updatedAt: now, status: "draft" as const }; if (existing) await ctx.db.patch(existing._id, values); else await ctx.db.insert("menuDrafts", { onboardingId, restaurantId, createdAt: now, ...values }); await ctx.db.patch(onboardingId, { status: "review_required", sourceUrl: result.sourceUrl, actorRunId, updatedAt: now }); return { status: "review_required", itemCount: result.rawItems.length }; }
export const saveUrlResult = internalMutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), result: candidateV, actorRunId: v.string() }, handler: async (ctx, args) => { const { row } = await own(ctx, args.deviceId, args.onboardingId); if (!row.restaurantId) throw new Error("Restaurant has not been created"); const now = Date.now(); await ctx.db.patch(row.restaurantId, { name: args.result.name, address: args.result.address, sourceUrl: args.result.sourceUrl, onboardingStatus: "review_required", menuSource: "apify", scraperRunId: args.actorRunId }); return createDraftFromResult(ctx, args.onboardingId, row.restaurantId, args.result, now, args.actorRunId); } });
export const selectCandidate = mutation({
  args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), candidate: candidateV },
  handler: async (ctx, args) => {
    const { row } = await own(ctx, args.deviceId, args.onboardingId);
    const selected = row.candidates.find((candidate: any) =>
      candidate.name === args.candidate.name &&
      (candidate.sourceUrl ?? candidate.mapsUrl) === (args.candidate.sourceUrl ?? args.candidate.mapsUrl));
    if (!selected) fail("INVALID", "Candidate is not part of this onboarding");
    if (!row.restaurantId) fail("INVALID", "Restaurant has not been created");
    const now = Date.now();
    const legacy = selected.mapsUrl ? { mapsUrl: selected.mapsUrl, googlePlaceId: selected.googlePlaceId, googleMapsName: selected.name } : {};
    const hasMenu = !!selected.rawItems?.length;
    await ctx.db.patch(row.restaurantId, { name: selected.name, address: selected.address, sourceUrl: selected.sourceUrl, onboardingStatus: hasMenu ? "review_required" : "restaurant_confirmed", menuSource: "apify", ...legacy });
    await ctx.db.patch(args.onboardingId, { selectedCandidate: args.candidate, status: hasMenu ? "review_required" : "restaurant_confirmed", sourceUrl: selected.sourceUrl, updatedAt: now });
    if (hasMenu) return createDraftFromResult(ctx, args.onboardingId, row.restaurantId, selected, now, row.actorRunId);
    return args.onboardingId;
  },
});
export const updateDraft = mutation({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), items: v.array(editedItemV) }, handler: async (ctx, args) => { const { row } = await own(ctx, args.deviceId, args.onboardingId); if (!row.restaurantId) fail("INVALID", "Restaurant has not been created"); const draft = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", args.onboardingId)).unique(); const now = Date.now(); if (draft) await ctx.db.patch(draft._id, { editedItems: args.items, updatedAt: now, status: "draft" }); else await ctx.db.insert("menuDrafts", { onboardingId: args.onboardingId, restaurantId: row.restaurantId, source: "manual", rawItems: args.items, editedItems: args.items, status: "draft", createdAt: now, updatedAt: now }); await ctx.db.patch(args.onboardingId, { status: "review_required", updatedAt: now }); return args.onboardingId; } });
export const getDraft = query({ args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings") }, handler: async (ctx, args) => { await own(ctx, args.deviceId, args.onboardingId); return ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", args.onboardingId)).unique(); } });
export const publish = action({
  args: { deviceId: v.string(), onboardingId: v.id("restaurantOnboardings"), items: v.array(editedItemV) },
  handler: async (ctx, args) => {
    const row: any = await ctx.runQuery(api.getForAction, { onboardingId: args.onboardingId });
    if (!row || row.ownerAccountId !== (await ctx.runQuery(api.accountId, { deviceId: args.deviceId }))) throw new Error("Only the owning device can publish this onboarding");
    if (!row.restaurantId) throw new Error("Restaurant has not been created");
    await ctx.runMutation(api.beginPublish, { onboardingId: args.onboardingId, items: args.items });
    try {
      const actor = process.env.APIFY_NORMALIZER_ACTOR;
      const token = process.env.APIFY_TOKEN;
      if (!actor || !token) throw new Error("Menu normalizer is not configured");
      const response = await fetch(`${actorPath(actor, "runs")}?token=${encodeURIComponent(token)}&timeout=1800`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: args.items.map((item: any) => ({
            name: item.name,
            description: item.description,
            category: item.category,
            // Match the published Actor input schema: prices are documented
            // as strings, and image URLs are restored from the draft locally.
            ...normalizerPrice(item),
          })),
          batchSize: 4,
        }),
      });
      if (!response.ok) {
        const body = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
        throw new Error(`Normalizer start failed: httpStatus=${response.status}; body=${body || "<empty>"}`);
      }
      const run: any = (await response.json()).data;
      if (typeof run?.id !== "string") throw new Error("Normalizer did not return a run ID");
      const runId = run.id;
      await ctx.runMutation(api.recordNormalizerRun, { onboardingId: args.onboardingId, runId });
      await ctx.scheduler.runAfter(10_000, internal.onboarding.pollNormalizerRun, { onboardingId: args.onboardingId, runId });
      return { status: "normalizing", normalizerRunId: runId };
    } catch (e) {
      await ctx.runMutation(api.failPublish, { onboardingId: args.onboardingId, errorMessage: String(e) });
      throw e;
    }
  },
});
export const pollNormalizerRun = internalAction({
  args: { onboardingId: v.id("restaurantOnboardings"), runId: v.string() },
  handler: async (ctx, { onboardingId, runId }) => {
    const row: any = await ctx.runQuery(api.getForAction, { onboardingId });
    if (row.status !== "normalizing" || row.normalizerRunId !== runId || !row.restaurantId) return;
    const token = process.env.APIFY_TOKEN;
    if (!token) {
      await ctx.runMutation(api.failPublish, { onboardingId, runId, errorMessage: "APIFY_TOKEN is not configured" });
      return;
    }
    try {
      const response = await fetch(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(`Normalizer run HTTP ${response.status}`);
      const run: any = (await response.json()).data;
      const status = String(run?.status ?? "");
      if (status === "READY" || status === "RUNNING") {
        await ctx.scheduler.runAfter(10_000, internal.onboarding.pollNormalizerRun, { onboardingId, runId });
        return;
      }
      if (status !== "SUCCEEDED" || !run?.defaultDatasetId) {
        throw new Error(`Normalizer run ${runId} finished with ${status || "unknown status"}`);
      }
      const dataset = await fetch(`https://api.apify.com/v2/datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&token=${encodeURIComponent(token)}`);
      if (!dataset.ok) throw new Error(`Normalizer dataset HTTP ${dataset.status}`);
      const returnedItems: unknown = await dataset.json();
      const draft: any = await ctx.runQuery(api.getPublishDraft, { onboardingId });
      const originalItems: any[] = draft?.editedItems ?? [];
      if (!Array.isArray(returnedItems) || !originalItems.length || returnedItems.length !== originalItems.length) {
        throw new Error(`Normalizer returned ${Array.isArray(returnedItems) ? returnedItems.length : 0}/${originalItems.length} dishes; the previous menu was kept`);
      }
      const validItems = returnedItems.map((item: any, index: number) => {
        const source = originalItems[index];
        if (item?.name?.trim() !== source.name.trim() || item?.menuOrder !== index) {
          throw new Error(`Normalizer dish ${index + 1} does not match the saved draft`);
        }
        const priceCents = item.priceCents ?? 0;
        const parsed = normalizedItem.safeParse({
          ...item,
          priceCents,
          priceVerified: publishedPriceVerified(source, { priceCents, priceVerified: item.priceVerified }),
          ...(typeof source.imageUrl === "string" ? { imageUrl: source.imageUrl } : {}),
        });
        if (!parsed.success) throw new Error(`Normalizer dish ${index + 1} is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}`);
        if (parsed.data.tagStatus !== "tagged" || (parsed.data.priceCents === 0 && !parsed.data.priceVerified)) {
          throw new Error(`Normalizer did not finish dish ${index + 1} (${parsed.data.name}); the previous menu was kept`);
        }
        return parsed.data;
      });
      await ctx.runMutation(api.activateVersion, { onboardingId, restaurantId: row.restaurantId, items: validItems, normalizerRunId: runId });
    } catch (error) {
      await ctx.runMutation(api.failPublish, { onboardingId, runId, errorMessage: String(error) });
    }
  },
});
export const accountId = internalQuery({ args: { deviceId: v.string() }, handler: async (ctx, { deviceId }) => (await account(ctx, deviceId))._id });
export const getForAction = internalQuery({ args: { onboardingId: v.id("restaurantOnboardings") }, handler: async (ctx, { onboardingId }) => { const row = await ctx.db.get(onboardingId); if (!row) throw new Error("Onboarding not found"); return row; } });
export const getPublishDraft = internalQuery({
  args: { onboardingId: v.id("restaurantOnboardings") },
  handler: async (ctx, { onboardingId }) => ctx.db.query("menuDrafts")
    .withIndex("by_onboarding", (q) => q.eq("onboardingId", onboardingId)).unique(),
});
export const beginPublish = internalMutation({
  args: { onboardingId: v.id("restaurantOnboardings"), items: v.array(editedItemV) },
  handler: async (ctx, { onboardingId, items }) => {
    const draft = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", onboardingId)).unique();
    const now = Date.now();
    if (draft) await ctx.db.patch(draft._id, { editedItems: items, status: "publishing", updatedAt: now });
    else {
      const row = await ctx.db.get(onboardingId);
      if (!row?.restaurantId) throw new Error("Restaurant has not been created");
      await ctx.db.insert("menuDrafts", { onboardingId, restaurantId: row.restaurantId, source: "manual", rawItems: items, editedItems: items, status: "publishing", createdAt: now, updatedAt: now });
    }
    await ctx.db.patch(onboardingId, { status: "normalizing", normalizerRunId: undefined, updatedAt: now });
  },
});
export const recordNormalizerRun = internalMutation({
  args: { onboardingId: v.id("restaurantOnboardings"), runId: v.string() },
  handler: async (ctx, { onboardingId, runId }) => {
    const row = await ctx.db.get(onboardingId);
    if (!row || row.status !== "normalizing") throw new Error("Onboarding is no longer normalizing");
    await ctx.db.patch(onboardingId, { normalizerRunId: runId, updatedAt: Date.now() });
  },
});
export const failPublish = internalMutation({
  args: { onboardingId: v.id("restaurantOnboardings"), errorMessage: v.string(), runId: v.optional(v.string()) },
  handler: async (ctx, { onboardingId, errorMessage, runId }) => {
    const row = await ctx.db.get(onboardingId);
    if (!row || (runId && row.normalizerRunId !== runId)) return;
    const draft = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", onboardingId)).unique();
    if (draft) await ctx.db.patch(draft._id, { status: "failed", errorMessage, updatedAt: Date.now() });
    await ctx.db.patch(onboardingId, { status: "normalization_failed", errorMessage, updatedAt: Date.now() });
  },
});
export const activateVersion = internalMutation({
  args: { onboardingId: v.id("restaurantOnboardings"), restaurantId: v.id("restaurants"), items: v.array(v.any()), normalizerRunId: v.string() },
  handler: async (ctx, args) => {
    const onboarding = await ctx.db.get(args.onboardingId);
    if (!onboarding || onboarding.status !== "normalizing" || onboarding.normalizerRunId !== args.normalizerRunId || onboarding.restaurantId !== args.restaurantId) return null;
    if (!args.items.length || args.items.some((item: any) => item.tagStatus !== "tagged" || (item.priceCents === 0 && !item.priceVerified))) {
      throw new Error("A complete tagged menu is required before activation");
    }
    const previous = await ctx.db.get(args.restaurantId);
    const draft = await ctx.db.query("menuDrafts").withIndex("by_onboarding", (q) => q.eq("onboardingId", args.onboardingId)).unique();
    const versions = await ctx.db.query("restaurantMenuVersions").withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId)).collect();
    const now = Date.now();
    const versionId = await ctx.db.insert("restaurantMenuVersions", { restaurantId: args.restaurantId, version: versions.length + 1, status: "active", source: draft?.source ?? "manual", normalizerRunId: args.normalizerRunId, createdAt: now, publishedAt: now });
    for (const old of versions.filter((x) => x.status === "active")) await ctx.db.patch(old._id, { status: "historical" });
    for (const item of args.items) await ctx.db.insert("menuItems", { restaurantId: args.restaurantId, menuVersionId: versionId, ...item });
    await ctx.db.patch(args.restaurantId, { activeMenuVersionId: versionId, onboardingStatus: "ready", lastNormalizedAt: now, normalizerRunId: args.normalizerRunId });
    if (draft) await ctx.db.patch(draft._id, { status: "published", updatedAt: now });
    await ctx.db.patch(args.onboardingId, { status: "ready", errorMessage: undefined, updatedAt: now });
    return { versionId, previousVersionId: previous?.activeMenuVersionId ?? null };
  },
});
