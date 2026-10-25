// Offline, repeatable annotation from menu wording. Review the resulting traits before a demo.
import { readFileSync, writeFileSync } from "node:fs";
import { inferTaste } from "../apify/menu-normalizer/dist/normalize.js";

const path = "convex/fixtures/normalized-menu.json";
const rows = JSON.parse(readFileSync(path, "utf8"));
for (const row of rows) {
  row.taste = inferTaste(`${row.name} ${row.description}`);
  row.priceVerified = false; // synthetic fixture; never present these as current restaurant prices
  row.currency = "USD";
}
writeFileSync(path, `${JSON.stringify(rows, null, 2)}\n`);
process.stdout.write(`Annotated ${rows.length} dishes; ${rows.filter((r) => r.taste.length).length} have wording-supported traits.\n`);
