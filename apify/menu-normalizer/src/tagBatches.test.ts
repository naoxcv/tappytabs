import { test } from "node:test";
import assert from "node:assert/strict";
import { tagBatches } from "./tagBatches.js";

const items = Array.from({ length: 8 }, (_, index) => ({ index, item: { name: `Dish ${index}` } }));

test("timed-out batches shrink until every item is tagged", async () => {
  const sizes: number[] = [];
  let active = 0;
  let peak = 0;
  const tagged = await tagBatches(items, 8, async (batch) => {
    active++;
    peak = Math.max(peak, active);
    sizes.push(batch.length);
    try {
      if (batch.length > 2) throw new Error("timeout");
      return batch.map((_, index) => ({ index, tags: ["food"] }));
    } finally {
      active--;
    }
  }, { maxConcurrent: 3, budgetMs: 5_000 });
  assert.equal(tagged.size, 8);
  assert.deepEqual(sizes, [8, 4, 4, 2, 2, 2, 2]);
  assert.ok(peak <= 3);
});

test("partial responses retry only omitted items", async () => {
  const requested: number[][] = [];
  const tagged = await tagBatches(items.slice(0, 3), 3, async (batch) => {
    requested.push(batch.map(({ index }) => index));
    return batch.filter(({ index }) => index !== 1 || batch.length === 1)
      .map(({ index }) => ({ index: batch.findIndex((entry) => entry.index === index), tags: ["food"] }));
  }, { budgetMs: 5_000 });
  assert.equal(tagged.size, 3);
  assert.deepEqual(requested, [[0, 1, 2], [1]]);
});

test("provider concurrency stays bounded across initial batches", async () => {
  let active = 0;
  let peak = 0;
  const tagged = await tagBatches(items, 1, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return [{ index: 0, tags: ["food"] }];
  }, { maxConcurrent: 3, budgetMs: 5_000 });
  assert.equal(tagged.size, 8);
  assert.equal(peak, 3);
});

test("expired tagging budget returns remaining items to keyword fallback", async () => {
  let called = false;
  const tagged = await tagBatches(items, 8, async () => { called = true; return []; }, { budgetMs: 1 });
  assert.equal(called, false);
  assert.equal(tagged.size, 0);
});
