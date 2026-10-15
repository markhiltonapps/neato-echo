const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../packages/core/src/dateFilter.ts");

// Fixed "now": 2026-09-25 15:00 local.
const NOW = new Date(2026, 8, 25, 15, 0, 0).getTime();
const at = (y, m, d, h = 12) => new Date(y, m, d, h).getTime();

test("isInRange: all always true", async () => {
  const { isInRange } = await load();
  assert.equal(isInRange(0, "all", NOW), true);
  assert.equal(isInRange(NOW, "all", NOW), true);
});

test("isInRange: today = since local midnight", async () => {
  const { isInRange } = await load();
  assert.equal(isInRange(at(2026, 8, 25, 0), "today", NOW), true); // this morning
  assert.equal(isInRange(at(2026, 8, 25, 14), "today", NOW), true);
  assert.equal(isInRange(at(2026, 8, 24, 23), "today", NOW), false); // yesterday night
});

test("isInRange: week = last 7 days", async () => {
  const { isInRange } = await load();
  assert.equal(isInRange(at(2026, 8, 20), "week", NOW), true); // 5 days ago
  assert.equal(isInRange(at(2026, 8, 17), "week", NOW), false); // 8 days ago
});

test("isInRange: month = last 30 days", async () => {
  const { isInRange } = await load();
  assert.equal(isInRange(at(2026, 8, 1), "month", NOW), true); // 24 days ago
  assert.equal(isInRange(at(2026, 7, 20), "month", NOW), false); // ~36 days ago
});

test("DATE_RANGES exposes the four options in order", async () => {
  const { DATE_RANGES } = await load();
  assert.deepEqual(
    DATE_RANGES.map((r) => r.key),
    ["all", "today", "week", "month"]
  );
});

test("dateBucket: buckets by recency", async () => {
  const { dateBucket } = await load();
  assert.equal(dateBucket(at(2026, 8, 25, 9), NOW), "Today");
  assert.equal(dateBucket(at(2026, 8, 22), NOW), "This week"); // 3 days ago
  assert.equal(dateBucket(at(2026, 8, 5), NOW), "This month"); // ~20 days ago
  assert.equal(dateBucket(at(2026, 6, 1), NOW), "Earlier"); // months ago
});

test("customSummaryStyle builds a non-builtin style with persona", async () => {
  const { customSummaryStyle, SUMMARY_PERSONA } = await import(
    "../../packages/core/src/summaryStyles.ts"
  );
  const s = customSummaryStyle("cust-1", "  Trade show  ", "  List every booth visitor and their ask.  ");
  assert.equal(s.key, "cust-1");
  assert.equal(s.label, "Trade show");
  assert.equal(s.builtin, false);
  assert.equal(s.prompt, SUMMARY_PERSONA + "List every booth visitor and their ask.");
  // empty label falls back
  assert.equal(customSummaryStyle("k", "  ", "do x").label, "Custom");
});
