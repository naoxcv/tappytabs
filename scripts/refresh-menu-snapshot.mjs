// Refreshes the checked fallback snapshot from a successful live Actor ingest.
// Usage: CONVEX_URL=https://...convex.cloud npm run menu:snapshot
import { writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import rawMenu from "../convex/fixtures/raw-menu.json" with { type: "json" };

const url = process.env.CONVEX_URL;
if (!url) throw new Error("Set CONVEX_URL to the Convex deployment that completed the live Actor ingest.");

const client = new ConvexHttpClient(url);
const restaurants = await client.query("menu:restaurants", {});
const restaurant = restaurants[0];
if (!restaurant) throw new Error("No restaurant found. Seed the deployment first.");

const status = await client.query("menu:status", { restaurantId: restaurant.id });
if (status?.source !== "apify") throw new Error(`Expected menu source 'apify', got '${status?.source ?? "missing"}'.`);

const rows = await client.query("menu:list", { restaurantId: restaurant.id });
if (rows.length < rawMenu.length) throw new Error(`Expected at least ${rawMenu.length} menu rows, got ${rows.length}.`);
const untagged = rows.filter((row) => row.tagStatus !== "tagged");
if (untagged.length) throw new Error(`${untagged.length} rows are untagged; configure Bitdeer and rerun before refreshing the fallback.`);

const snapshot = rows.map(({ name, category, cuisine, tags, description, priceCents, currency, priceVerified, taste, allergens, diet, spice, isDrink, shareable, menuOrder, tagStatus }) => ({
  name, category, cuisine, tags, description, priceCents, currency, priceVerified: priceVerified ?? false, taste: taste ?? [], allergens, diet, spice, isDrink, shareable, menuOrder, tagStatus,
}));
writeFileSync("convex/fixtures/normalized-menu.json", `${JSON.stringify(snapshot, null, 2)}\n`);
process.stdout.write(`Updated normalized fallback with ${snapshot.length} items from ${restaurant.name}.\n`);
