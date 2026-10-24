// Owner: Role 4. TappyTabs menu-normalizer Actor (published to the Apify Store).
// Input:  { items: [{ name, description?, ingredients?, price?, category? }] }
// Output: one dataset row per item, exactly convex/menu.ts `normalizedItem`.
// Pipeline: keyword pass (deterministic) → Bitdeer tag pass in batches of 20 (add/raise only) → push.
import { Actor, log } from "apify";
import OpenAI from "openai";
import { keywordPass, mergeLlm, type LlmTags, type RawItem } from "./normalize.js";
import { TAG_SYSTEM, tagUser } from "./tagPrompt.js";

type Input = { items: RawItem[]; batchSize?: number };

await Actor.init();
const input = (await Actor.getInput<Input>()) ?? { items: [] };
const items = (input.items ?? []).filter((i) => i && typeof i.name === "string" && i.name.trim());
log.info(`Normalizing ${items.length} items`);

const apiKey = process.env.BITDEER_API_KEY;
const model = process.env.BITDEER_MODEL;
const client = apiKey && model ? new OpenAI({ apiKey, baseURL: "https://api-inference.bitdeer.ai/v1", maxRetries: 1 }) : null;
if (!client) log.warning("BITDEER_API_KEY/BITDEER_MODEL not set: keyword-only tags, everything else may_contain");

async function tagBatch(batch: { index: number; item: RawItem }[]): Promise<Map<number, LlmTags>> {
  const out = new Map<number, LlmTags>();
  if (!client) return out;
  try {
    const res = await client.chat.completions.create({
      model: model!,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: TAG_SYSTEM }, { role: "user", content: tagUser(batch) }],
    }, { timeout: 12_000 });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { items?: (LlmTags & { index: number })[] };
    for (const row of parsed.items ?? []) if (typeof row.index === "number") out.set(row.index, row);
  } catch (e) {
    log.warning(`tag batch failed: ${String(e)}`);
  }
  return out;
}

const size = Math.max(1, Math.min(50, Math.floor(input.batchSize ?? 20)));
const batches: { index: number; item: RawItem }[][] = [];
for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size).map((item, j) => ({ index: i + j, item })));
const tagged = await Promise.all(batches.map(tagBatch));
const tags = new Map<number, LlmTags>(tagged.flatMap((m) => [...m.entries()]));

const rows = items.map((raw, i) => mergeLlm(keywordPass(raw, i), tags.get(i) ?? null));
await Actor.pushData(rows);
log.info(`Done: ${rows.filter((r) => r.tagStatus === "tagged").length}/${rows.length} tagged`);
await Actor.exit();
