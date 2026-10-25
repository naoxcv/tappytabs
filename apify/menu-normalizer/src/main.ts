// Owner: Role 4. TappyTabs menu-normalizer Actor (published to the Apify Store).
// Input:  { items: [{ name, description?, ingredients?, price?, category? }] }
// Output: one dataset row per item, exactly convex/menu.ts `normalizedItem`.
// Pipeline: keyword pass (deterministic) → bounded Bitdeer tag pass (add/raise only) → push.
import { Actor, log } from "apify";
import OpenAI from "openai";
import { isCompleteLlmTags, isMissingPrice, keywordPass, mergeLlm, parsePrice, type LlmTags, type RawItem } from "./normalize.js";
import { TAG_SYSTEM, tagUser } from "./tagPrompt.js";
import { tagBatches, type IndexedItem } from "./tagBatches.js";

type Input = { items: RawItem[]; batchSize?: number };

await Actor.init();
const input = (await Actor.getInput<Input>()) ?? { items: [] };
const items = (input.items ?? []).filter((i) => i && typeof i.name === "string" && i.name.trim());
log.info(`Normalizing ${items.length} items`);

const apiKey = process.env.BITDEER_API_KEY;
const model = process.env.BITDEER_MODEL;
const client = apiKey && model ? new OpenAI({ apiKey, baseURL: "https://api-inference.bitdeer.ai/v1", maxRetries: 1 }) : null;
if (!client) throw new Error("BITDEER_API_KEY/BITDEER_MODEL are required for a complete demo menu");
const knownPrices = items.filter((item) => (parsePrice(item.price).cents ?? 0) > 0);
const knownCurrencies = [...new Set(knownPrices.map((item) => parsePrice(item.price).currency).filter((currency) => currency !== undefined))];
const estimatedCurrency = knownCurrencies.length === 1 ? knownCurrencies[0] : undefined;

async function callTags(batch: IndexedItem[], timeoutMs: number): Promise<(LlmTags & { index: number })[]> {
  // Give the model batch-local indexes, then translate them back to source indexes.
  // Models commonly restart numbering at zero for each independent batch.
  const requestBatch = batch.map(({ item }, index) => ({ index, item }));
  const needsPrice = batch.some(({ item }) => isMissingPrice(item.price));
  const missingCategories = new Set(batch.filter(({ item }) => isMissingPrice(item.price))
    .map(({ item }) => item.category?.toLowerCase().trim()).filter((category): category is string => !!category));
  const priceExamples = needsPrice
    ? [...knownPrices].sort((a, b) => Number(missingCategories.has(b.category?.toLowerCase().trim() ?? "")) - Number(missingCategories.has(a.category?.toLowerCase().trim() ?? ""))).slice(0, 6)
    : [];
  const res = await client!.chat.completions.create({
    model: model!,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [{ role: "system", content: TAG_SYSTEM }, { role: "user", content: tagUser(requestBatch, priceExamples) }],
  }, { timeout: timeoutMs, maxRetries: 0 });
  const parsed: unknown = JSON.parse(res.choices[0]?.message?.content ?? "{}");
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { items?: unknown }).items)) throw new Error("Tag response has no items array");
  return (parsed as { items: unknown[] }).items.filter((row): row is LlmTags & { index: number } => {
    if (!row || typeof row !== "object" || !Number.isInteger((row as { index?: unknown }).index)) return false;
    const index = (row as { index: number }).index;
    if (index < 0 || index >= requestBatch.length || !isCompleteLlmTags(row)) return false;
    return !isMissingPrice(requestBatch[index].item.price) ||
      (Number.isInteger(row.estimatedPriceCents) && row.estimatedPriceCents! > 0 && row.estimatedPriceCents! <= 20_000);
  });
}

const size = Math.max(1, Math.min(8, Math.floor(input.batchSize ?? 4)));
const tags = await tagBatches(items.map((item, index) => ({ index, item })), size, callTags, {
  maxConcurrent: 3, requestTimeoutMs: 120_000,
  onFailure: (message) => log.warning(message),
});

const rows = items.map((raw, i) => {
  const base = keywordPass(raw, i);
  const normalized = mergeLlm(base, tags.get(i) ?? null, isMissingPrice(raw.price));
  return normalized.priceCents > 0 && !normalized.priceVerified && estimatedCurrency
    ? { ...normalized, currency: estimatedCurrency } : normalized;
});
const incomplete = rows.filter((row) => row.tagStatus !== "tagged" || (row.priceCents === 0 && !row.priceVerified));
if (incomplete.length) throw new Error(`Normalizer could not complete ${incomplete.length}/${rows.length} item(s); no partial menu was published`);
await Actor.pushData(rows);
log.info(`Done: ${rows.filter((r) => r.tagStatus === "tagged").length}/${rows.length} tagged`);
log.info(`Estimated prices for ${rows.filter((r) => r.priceCents > 0 && !r.priceVerified).length}/${rows.length} items`);
await Actor.exit();
