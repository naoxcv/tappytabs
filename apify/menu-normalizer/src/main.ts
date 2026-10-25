// Owner: Role 4. TappyTabs menu-normalizer Actor (published to the Apify Store).
// Input:  { items: [{ name, description?, ingredients?, price?, category? }] }
// Output: one dataset row per item, exactly convex/menu.ts `normalizedItem`.
// Pipeline: keyword pass (deterministic) → bounded Bitdeer tag pass (add/raise only) → push.
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
  // Give the model batch-local indexes, then translate them back to source indexes.
  // Models commonly restart numbering at zero for each independent batch.
  const requestBatch = batch.map(({ item }, index) => ({ index, item }));
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await client.chat.completions.create({
        model: model!,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: TAG_SYSTEM }, { role: "user", content: tagUser(requestBatch) }],
      }, { timeout: 20_000, maxRetries: 0 });
      const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { items?: (LlmTags & { index: number })[] };
      for (const row of parsed.items ?? []) {
        if (!Number.isInteger(row.index)) continue;
        const sourceIndex = batch[row.index]?.index ?? (batch.some((entry) => entry.index === row.index) ? row.index : undefined);
        if (sourceIndex !== undefined) out.set(sourceIndex, row);
      }
      const missing = batch.filter(({ index }) => !out.has(index)).map(({ index }) => index);
      if (missing.length) log.warning(`tag response missing ${missing.length}/${batch.length} item(s), source indices: ${missing.join(", ")}`);
      return out;
    } catch (e) {
      log.warning(`tag batch attempt ${attempt}/2 failed: ${String(e)}`);
      if (attempt === 2) return out;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  return out;
}

const size = Math.max(1, Math.min(50, Math.floor(input.batchSize ?? 8)));
const batches: { index: number; item: RawItem }[][] = [];
for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size).map((item, j) => ({ index: i + j, item })));
// Keep concurrency below the provider rate limit and leave enough time for
// the synchronous Apify request. Failed batches still produce keyword-only rows.
const maxConcurrent = 3;
const tagged = new Array<Map<number, LlmTags>>(batches.length);
let nextBatch = 0;
let failedBatches = 0;
async function worker() {
  while (true) {
    const batchIndex = nextBatch++;
    if (batchIndex >= batches.length) return;
    const result = await tagBatch(batches[batchIndex]);
    tagged[batchIndex] = result;
    if (client && result.size === 0) failedBatches++;
  }
}
await Promise.all(Array.from({ length: Math.min(maxConcurrent, batches.length) }, worker));
const tags = new Map<number, LlmTags>(tagged.flatMap((m) => m ? [...m.entries()] : []));

const rows = items.map((raw, i) => mergeLlm(keywordPass(raw, i), tags.get(i) ?? null));
await Actor.pushData(rows);
log.info(`Done: ${rows.filter((r) => r.tagStatus === "tagged").length}/${rows.length} tagged`);
if (failedBatches) log.warning(`Completed with ${failedBatches}/${batches.length} failed or empty tagging batch(es); emitted keyword-only rows`);
await Actor.exit();
