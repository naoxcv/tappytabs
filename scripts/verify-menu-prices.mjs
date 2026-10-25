// Usage: npm run menu:verify-prices -- path/to/reviewed-current-menu.json
// The input must be transcribed from the restaurant's current menu and reviewed by a human.
import { readFileSync, writeFileSync } from "node:fs";
import { parsePrice } from "../apify/menu-normalizer/dist/normalize.js";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Provide a reviewed current-menu JSON file.");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
if (!source.restaurantName || source.restaurantName === "Tappy Kitchen (demo)" || !/^https:\/\//.test(source.sourceUrl ?? "")) {
  throw new Error("A real restaurant name and current menu HTTPS URL are required.");
}
if (!Number.isFinite(Date.parse(source.checkedAt)) || Date.now() - Date.parse(source.checkedAt) > 7 * 86400000) {
  throw new Error("checkedAt must be a date within the past seven days.");
}
const rowsPath = "convex/fixtures/normalized-menu.json";
const rows = JSON.parse(readFileSync(rowsPath, "utf8"));
const reviewed = new Map((source.items ?? []).map((item) => [item.name, item]));
const failures = [];
for (const row of rows) {
  const sourceItem = reviewed.get(row.name);
  const parsed = parsePrice(sourceItem?.price);
  if (parsed.cents === null || parsed.cents !== row.priceCents || parsed.currency !== (row.currency ?? "USD")) {
    failures.push(row.name);
  }
}
if (failures.length) throw new Error(`Price verification failed for: ${failures.join(", ")}. Snapshot unchanged.`);
for (const row of rows) row.priceVerified = true;
writeFileSync(rowsPath, `${JSON.stringify(rows, null, 2)}\n`);
writeFileSync("convex/fixtures/price-verification.json", `${JSON.stringify({
  restaurantName: source.restaurantName, sourceUrl: source.sourceUrl, checkedAt: source.checkedAt,
  verifiedItemCount: rows.length,
}, null, 2)}\n`);
process.stdout.write(`Verified ${rows.length} exact prices against ${source.sourceUrl}.\n`);
