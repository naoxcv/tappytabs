// Owner: Role 4. Menu pipeline: Apify store scraper → our menu-normalizer Actor → validated upsert into menuItems.
// The seeded snapshot (seed.ts) is always there, so a failed or slow ingest never blocks the demo.
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
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
const normalizedItem = z.object({
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
});
export type NormalizedItem = z.infer<typeof normalizedItem>;

type RawItem = { name: string; description?: string; price?: string | number; category?: string };

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
    if (typeof name === "string" && (x.price !== undefined || x.description !== undefined)) {
      out.push({ name, description: x.description ?? "", price: x.price ?? x.priceText, category: x.category ?? x.section ?? category });
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
export const ingest = action({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, { restaurantId }): Promise<{ count: number; source: "apify" | "seed"; apifyRunId: string | null; note: string }> => {
    const r = await ctx.runQuery(internal.menu.getRestaurant, { restaurantId });
    const token = process.env.APIFY_TOKEN;
    const normalizer = process.env.APIFY_NORMALIZER_ACTOR; // e.g. "yourname/menu-normalizer"
    const scraper = process.env.APIFY_SCRAPER_ACTOR; // e.g. a Google Maps menu scraper from the Apify Store
    const keep = (note: string) => ({ count: r?.itemCount ?? 0, source: "seed" as const, apifyRunId: null, note });
    if (!r) return keep("restaurant not found");
    if (!token || !normalizer) return keep("APIFY_TOKEN / APIFY_NORMALIZER_ACTOR not set; using seeded menu");
    const deadline = Date.now() + TIMING.ingestTimeoutMs;
    try {
      let raw: RawItem[] = RAW_MENU;
      let note = "normalized the hand-written source menu";
      if (scraper && r.mapsUrl) {
        const scraped = await runActor(scraper, { startUrls: [{ url: r.mapsUrl }], maxItems: 200 }, token, Math.max(3_000, deadline - Date.now() - 8_000));
        const mapped = mapScraperOutput(scraped.items);
        if (mapped.length >= 5) { raw = mapped; note = `scraped ${mapped.length} items`; }
      }
      const run = await runActor(normalizer, { items: raw }, token, Math.max(3_000, deadline - Date.now()));
      const items: NormalizedItem[] = [];
      for (const row of run.items) {
        const parsed = normalizedItem.safeParse(row);
        if (parsed.success) items.push(parsed.data);
      }
      if (items.length < 5) return keep(`normalizer returned ${items.length} valid items; kept existing menu`);
      const count = await ctx.runMutation(internal.menu.upsertItems, { restaurantId, items, apifyRunId: run.runId });
      return { count, source: "apify", apifyRunId: run.runId ?? null, note };
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

/** Upsert by (restaurantId, name). Never deletes: open parties keep valid item ids. */
export const upsertItems = internalMutation({
  args: { restaurantId: v.id("restaurants"), items: v.array(v.any()), apifyRunId: v.optional(v.string()) },
  handler: async (ctx, { restaurantId, items, apifyRunId }): Promise<number> => {
    for (const raw of items) {
      const item = normalizedItem.parse(raw);
      const existing = await ctx.db
        .query("menuItems")
        .withIndex("by_restaurant_name", (q) => q.eq("restaurantId", restaurantId).eq("name", item.name))
        .unique();
      if (existing) await ctx.db.patch(existing._id, item);
      else await ctx.db.insert("menuItems", { restaurantId, ...item });
    }
    await ctx.db.patch(restaurantId, { menuSource: "apify", apifyRunId, fetchedAt: Date.now() });
    return items.length;
  },
});

