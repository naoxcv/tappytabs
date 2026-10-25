// Owner: Role 4. Menu pipeline: Apify store scraper → our menu-normalizer Actor → validated upsert into menuItems.
// The seeded snapshot (seed.ts) is always there, so a failed or slow ingest never blocks the demo.
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { ALLERGENS, ALLERGEN_LEVELS, DIETS, TIMING } from "./shared/enums";
import { menuOf } from "./lib/guards";
import { RAW_MENU } from "./seedData";

export const restaurants = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("restaurants").collect()).map((r) => ({ id: r._id, name: r.name })),
});

export const status = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const r = await ctx.db.get(restaurantId);
    if (!r) return null;
    const items = await menuOf(ctx, restaurantId);
    return { name: r.name, source: r.menuSource, fetchedAt: r.fetchedAt ?? null, itemCount: items.length };
  },
});

/** Read-only menu for debugging and the onboarding card generator. */
export const list = query({
  args: { restaurantId: v.id("restaurants") },
  handler: (ctx, { restaurantId }) => menuOf(ctx, restaurantId),
});

// Exactly the menuItems fields minus restaurantId: the normalizer Actor's output contract.
export const normalizedItem = z.object({
  name: z.string().min(1),
  category: z.string(),
  cuisine: z.string().optional(),
  tags: z.array(z.string()),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  allergens: z.array(z.object({ allergen: z.enum(ALLERGENS), level: z.enum(ALLERGEN_LEVELS) })),
  diet: z.array(z.enum(DIETS)),
  spice: z.number().min(0).max(4),
  isDrink: z.boolean(),
  shareable: z.boolean(),
  menuOrder: z.number(),
  tagStatus: z.enum(["tagged", "untagged"]),
  imageUrl: z.string().url().optional(),
});
export type NormalizedItem = z.infer<typeof normalizedItem>;

type RawItem = { name: string; description?: string; ingredients?: string[]; price?: string | number; category?: string; imageUrl?: string };
const rawItemV = v.object({
  name: v.string(),
  description: v.optional(v.string()),
  ingredients: v.optional(v.array(v.string())),
  price: v.optional(v.union(v.string(), v.number())),
  category: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
});

async function runActor(actorId: string, input: unknown, token: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId.replace("/", "~"))}/run-sync-get-dataset-items` +
      `?token=${token}&timeout=${Math.floor(timeoutMs / 1000)}`;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Apify ${actorId} HTTP ${res.status}`);
    return { items: (await res.json()) as unknown[], runId: res.headers.get("x-apify-run-id") ?? undefined };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort mapping from a Google Maps / delivery-site scraper's dataset to RawItem.
 * TODO(Role 4): tighten this once the scraper is chosen (task log: "try candidate store scrapers").
 */
export function mapScraperOutput(rows: unknown[]): RawItem[] {
  const out: RawItem[] = [];
  const visit = (x: any, category?: string) => {
    if (!x || typeof x !== "object") return;
    if (Array.isArray(x)) return x.forEach((y) => visit(y, category));
    const name = x.name ?? x.title ?? x.itemName;
    if (typeof name === "string" && (x.price !== undefined || x.description !== undefined || x.ingredients !== undefined)) {
      const ingredients = Array.isArray(x.ingredients)
        ? x.ingredients.filter((value: unknown): value is string => typeof value === "string")
        : typeof x.ingredients === "string" ? x.ingredients.split(/[,;]/).map((value: string) => value.trim()).filter(Boolean) : undefined;
      const imageUrl = x.imageUrl ?? x.image ?? x.photoUrl;
      out.push({ name, description: x.description ?? "", ingredients, price: x.price ?? x.priceText, category: x.category ?? x.section ?? category,
        ...(typeof imageUrl === "string" && /^https:\/\//i.test(imageUrl) ? { imageUrl } : {}) });
      return;
    }
    for (const key of ["menu", "menuItems", "items", "sections", "categories", "dishes"]) {
      if (x[key]) visit(x[key], x.name ?? x.title ?? category);
    }
  };
  visit(rows);
  return out;
}

/** Fetch the live menu. Never throws for an Apify problem: returns what happened and keeps the existing items. */
const ingestArgs = {
  restaurantId: v.optional(v.id("restaurants")),
  menuUrl: v.optional(v.string()),
  restaurantName: v.optional(v.string()),
  items: v.optional(v.array(rawItemV)),
};

export const ingest = action({
  args: ingestArgs,
  handler: async (ctx, { restaurantId, menuUrl, restaurantName, items: suppliedItems }): Promise<{
    count: number; source: "apify" | "seed"; apifyRunId: string | null; note: string; restaurantId: Id<"restaurants"> | null;
  }> => {
    const r = restaurantId ? await ctx.runQuery(internal.menu.getRestaurant, { restaurantId }) : null;
    const token = process.env.APIFY_TOKEN;
    const normalizer = process.env.APIFY_NORMALIZER_ACTOR; // e.g. "yourname/menu-normalizer"
    const scraper = process.env.APIFY_SCRAPER_ACTOR; // e.g. a Google Maps menu scraper from the Apify Store
    const keep = (note: string) => ({ count: r?.itemCount ?? 0, source: "seed" as const, apifyRunId: null, note, restaurantId: restaurantId ?? null });
    if (restaurantId && !r) return keep("restaurant not found");
    if (!restaurantId && (!menuUrl?.trim() || !restaurantName?.trim())) {
      return keep("provide restaurantName and menuUrl to create a new restaurant menu");
    }
    if (!token || !normalizer) return keep("APIFY_TOKEN / APIFY_NORMALIZER_ACTOR not set; using seeded menu");
    const sourceUrl = menuUrl?.trim() || r?.mapsUrl;
    const sourceName = restaurantName?.trim() || r?.name;
    const deadline = Date.now() + TIMING.ingestTimeoutMs;
    try {
      let raw: RawItem[] = suppliedItems ?? RAW_MENU;
      let note = "normalized the hand-written source menu";
      if (!suppliedItems && sourceUrl) {
        if (!scraper) return keep("APIFY_SCRAPER_ACTOR not set; kept the existing menu");
        const scraped = await runActor(scraper, { startUrls: [{ url: sourceUrl }], maxRequestsPerCrawl: 200 }, token, Math.max(3_000, deadline - Date.now() - 8_000));
        const mapped = mapScraperOutput(scraped.items);
        if (mapped.length < 5) return keep(`scraper found ${mapped.length} menu items; kept the existing menu`);
        raw = mapped;
        note = `scraped ${mapped.length} items`;
      } else if (!suppliedItems && !restaurantId) {
        return keep("a menuUrl or items array is required to create a restaurant menu");
      }
      // Pass this explicitly: Apify may apply the deployed Actor schema's
      // default when the field is omitted, even if the Actor source default changed.
      const run = await runActor(normalizer, { items: raw, batchSize: 8 }, token, Math.max(3_000, deadline - Date.now()));
      const items: NormalizedItem[] = [];
      const imageByName = new Map(raw.filter((item) => item.imageUrl).map((item) => [item.name.trim().toLowerCase(), item.imageUrl!]));
      for (const row of run.items) {
        const parsed = normalizedItem.safeParse(row);
        if (parsed.success) items.push({ ...parsed.data, ...(imageByName.has(parsed.data.name.trim().toLowerCase())
          ? { imageUrl: imageByName.get(parsed.data.name.trim().toLowerCase()) } : {}) });
      }
      if (items.length < 5) return keep(`normalizer returned ${items.length} valid items; kept existing menu`);
      const targetRestaurantId = restaurantId ?? await ctx.runMutation(internal.menu.createRestaurant, {
        name: sourceName!, ...(sourceUrl ? { mapsUrl: sourceUrl } : {}),
      });
      const count = await ctx.runMutation(internal.menu.upsertItems, {
        restaurantId: targetRestaurantId, items, apifyRunId: run.runId,
        ...(menuUrl?.trim() ? { mapsUrl: menuUrl.trim() } : {}),
        ...(sourceName ? { restaurantName: sourceName } : {}),
      });
      return { count, source: "apify", apifyRunId: run.runId ?? null, note, restaurantId: targetRestaurantId };
    } catch (e) {
      return keep(`ingest failed: ${String(e)}; kept existing menu`);
    }
  },
});

export const getRestaurant = internalQuery({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }) => {
    const r = await ctx.db.get(restaurantId);
    return r && { ...r, itemCount: (await menuOf(ctx, restaurantId)).length };
  },
});

export const createRestaurant = internalMutation({
  args: { name: v.string(), mapsUrl: v.optional(v.string()) },
  handler: async (ctx, { name, mapsUrl }): Promise<Id<"restaurants">> =>
    ctx.db.insert("restaurants", { name, mapsUrl, menuSource: "seed" }),
});

/** Upsert by (restaurantId, name). Never deletes: open parties keep valid item ids. */
export const upsertItems = internalMutation({
  args: {
    restaurantId: v.id("restaurants"), items: v.array(v.any()), apifyRunId: v.optional(v.string()),
    mapsUrl: v.optional(v.string()), restaurantName: v.optional(v.string()),
  },
  handler: async (ctx, { restaurantId, items, apifyRunId, mapsUrl, restaurantName }): Promise<number> => {
    for (const raw of items) {
      const item = normalizedItem.parse(raw);
      const existing = await ctx.db
        .query("menuItems")
        .withIndex("by_restaurant_name", (q) => q.eq("restaurantId", restaurantId).eq("name", item.name))
        .unique();
      if (existing) {
        const changedPhoto = existing.imageUrl !== item.imageUrl && (!!existing.imageUrl || !!item.imageUrl);
        if (changedPhoto && existing.imageStorageId) await ctx.storage.delete(existing.imageStorageId);
        await ctx.db.patch(existing._id, {
          ...item,
          ...(!item.imageUrl && existing.imageUrl ? { imageUrl: existing.imageUrl } : {}),
          ...(changedPhoto ? { imageStorageId: undefined } : existing.imageStorageId ? { imageStorageId: existing.imageStorageId } : {}),
        });
      }
      else await ctx.db.insert("menuItems", { restaurantId, ...item });
    }
    await ctx.db.patch(restaurantId, {
      menuSource: "apify", apifyRunId, fetchedAt: Date.now(),
      ...(mapsUrl ? { mapsUrl } : {}),
      ...(restaurantName ? { name: restaurantName } : {}),
    });
    return items.length;
  },
});

