import type { LlmTags, RawItem } from "./normalize.js";

export type IndexedItem = { index: number; item: RawItem };
type TaggedRow = LlmTags & { index: number };
type Call = (batch: IndexedItem[], timeoutMs: number) => Promise<TaggedRow[]>;

/** Retry only unresolved items, shrinking timed-out batches without exceeding provider concurrency. */
export async function tagBatches(
  items: IndexedItem[], batchSize: number, call: Call,
  options: { maxConcurrent?: number; requestTimeoutMs?: number; onFailure?: (message: string) => void } = {},
): Promise<Map<number, LlmTags>> {
  const requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  const queue: { items: IndexedItem[]; singletonRetry: boolean }[] = [];
  for (let i = 0; i < items.length; i += batchSize) queue.push({ items: items.slice(i, i + batchSize), singletonRetry: false });
  const tagged = new Map<number, LlmTags>();

  function retry(unresolved: IndexedItem[], singletonRetry: boolean) {
    if (!unresolved.length) return;
    if (unresolved.length === 1) {
      if (!singletonRetry) queue.push({ items: unresolved, singletonRetry: true });
      return;
    }
    const midpoint = Math.ceil(unresolved.length / 2);
    queue.push({ items: unresolved.slice(0, midpoint), singletonRetry: false });
    queue.push({ items: unresolved.slice(midpoint), singletonRetry: false });
  }

  async function worker() {
    while (queue.length) {
      const task = queue.shift()!;
      try {
        const response = await call(task.items, requestTimeoutMs);
        for (const row of response) {
          if (!row || !Number.isInteger(row.index) || row.index < 0 || row.index >= task.items.length) continue;
          const sourceIndex = task.items[row.index].index;
          if (Object.keys(row).some((key) => key !== "index")) tagged.set(sourceIndex, row);
        }
        const missing = task.items.filter(({ index }) => !tagged.has(index));
        if (missing.length) options.onFailure?.(`Tag response omitted ${missing.length}/${task.items.length} item(s); retrying smaller groups`);
        retry(missing, task.singletonRetry);
      } catch (error) {
        options.onFailure?.(`Tag request for ${task.items.length} item(s) failed: ${String(error)}; retrying smaller groups`);
        retry(task.items, task.singletonRetry);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(options.maxConcurrent ?? 3, queue.length) }, worker));
  return tagged;
}
