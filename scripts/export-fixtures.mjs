// Owner: Role 4 (run), Role 1 (consume). Regenerates the iOS mock fixtures from a REAL backend so mocks can't drift
// from the API. WIPES the deployment's app data (it seeds). Usage:  node scripts/export-fixtures.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => l.split("=")),
);
const client = new ConvexHttpClient(env.CONVEX_URL);
const run = (fn, args = {}) => JSON.parse(execFileSync("npx", ["convex", "run", fn, JSON.stringify(args)], { encoding: "utf8" }));
const out = "ios/TappyTabs/Core/Mocks";
mkdirSync(out, { recursive: true });
const save = (name, data) => writeFileSync(`${out}/${name}.json`, JSON.stringify(data, null, 2) + "\n");

const s = run("seed:scenario", { scenario: "negotiated" });
const { partyId, userIds, restaurantId } = s;
const q = (name, args) => client.query(name, args);

save("ids", { ...s, deviceIds: userIds.map((_, i) => `demo-diner-${i + 1}`) });
save("restaurants", await q("menu:restaurants", {}));
save("menu_status", await q("menu:status", { restaurantId }));
save("messages", await q("messages:list", { partyId }));
const party = await q("parties:current", { partyId });
save("party_pick", party);
save("candidates", await q("orders:candidates", { partyId, userId: userIds[0] }));
save("lines_pick", await q("orders:lines", { partyId }));

for (const [i, userId] of userIds.entries()) {
  const cands = await q("orders:candidates", { partyId, userId });
  await client.mutation("orders:pick", { partyId, userId, deviceId: `demo-diner-${i + 1}`, itemId: cands.find((c) => !c.isDrink).itemId });
}
save("party_confirm", await q("parties:current", { partyId }));
save("lines_confirm", await q("orders:lines", { partyId }));
save("addable_personal", await q("orders:addable", { partyId, userId: userIds[0], shared: false }));
save("addable_shared", await q("orders:addable", { partyId, userId: userIds[0], shared: true }));
const lines = await q("orders:lines", { partyId });
const myMain = lines.lines.find((l) => l.kind === "main" && l.sharedBy[0] === userIds[0]);
save("remove_result", await client.mutation("orders:remove", { partyId, userId: userIds[0], deviceId: "demo-diner-1", lineId: myMain.lineId }));
const placed = run("seed:scenario", { scenario: "placed" });
save("party_placed", await q("parties:current", { partyId: placed.partyId }));
save("lines_placed", await q("orders:lines", { partyId: placed.partyId }));
console.log(`Wrote fixtures to ${out}. Note: the deployment now holds the 'placed' scenario; run 'npm run seed' to reset.`);
