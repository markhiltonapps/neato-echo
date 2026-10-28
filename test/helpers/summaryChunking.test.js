const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/summaryChunking.js");

test("estimateTokens is conservative (>= chars/4) and handles empty", async () => {
  const { estimateTokens } = await load();
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens(null), 0);
  // 350 chars / 3.5 = 100 tokens.
  assert.equal(estimateTokens("x".repeat(350)), 100);
});

test("inputBudgetTokens subtracts system + completion + safety, with a floor", async () => {
  const { inputBudgetTokens } = await load();
  assert.equal(
    inputBudgetTokens({ ctxTokens: 16384, systemTokens: 400 }),
    16384 - 400 - 1536 - 512
  );
  // A huge system prompt can't drive the budget negative.
  assert.equal(inputBudgetTokens({ ctxTokens: 2000, systemTokens: 100000 }), 512);
});

test("content that fits is a single pass, no chunking", async () => {
  const { planSummaryChunks } = await load();
  const content = "A short transcript line.\nAnother line.";
  const plan = planSummaryChunks(content, { ctxTokens: 16384, systemTokens: 400 });
  assert.equal(plan.needsChunking, false);
  assert.deepEqual(plan.chunks, [content]);
});

test("empty content yields no chunks and no chunking", async () => {
  const { planSummaryChunks } = await load();
  const plan = planSummaryChunks("", { ctxTokens: 16384, systemTokens: 400 });
  assert.equal(plan.needsChunking, false);
  assert.deepEqual(plan.chunks, []);
});

test("a long transcript splits into multiple chunks, each within budget", async () => {
  const { planSummaryChunks, estimateTokens, inputBudgetTokens } = await load();
  // ~30k tokens of transcript (the reported 2-hour meeting), small local window.
  const lines = [];
  for (let i = 0; i < 2000; i++) lines.push(`Speaker ${i % 4}: This is line number ${i} of the meeting.`);
  const content = lines.join("\n");

  const budget = { ctxTokens: 16384, systemTokens: 400 };
  const plan = planSummaryChunks(content, budget);
  const limit = inputBudgetTokens(budget);

  assert.equal(plan.needsChunking, true);
  assert.ok(plan.chunks.length > 1, "expected more than one chunk");
  for (const chunk of plan.chunks) {
    assert.ok(estimateTokens(chunk) <= limit, "every chunk must fit the input budget");
  }
  // No content is dropped (line-boundary splits preserve every line's text).
  const rejoined = plan.chunks.join("\n");
  assert.equal(rejoined.replace(/\n/g, ""), content.replace(/\n/g, ""));
});

test("splits on line boundaries, not mid-line, when lines fit", async () => {
  const { planSummaryChunks } = await load();
  const line = "word ".repeat(40).trim(); // ~200 chars, well under budget
  const content = Array.from({ length: 50 }, () => line).join("\n");
  // Tiny window to force several chunks.
  const plan = planSummaryChunks(content, { ctxTokens: 1024, systemTokens: 50 });
  assert.equal(plan.needsChunking, true);
  for (const chunk of plan.chunks) {
    for (const l of chunk.split("\n")) {
      assert.equal(l, line, "lines must not be cut mid-line");
    }
  }
});

test("a single over-long line is hard-split rather than lost", async () => {
  const { planSummaryChunks, estimateTokens, inputBudgetTokens } = await load();
  const budget = { ctxTokens: 1024, systemTokens: 50 };
  const limit = inputBudgetTokens(budget);
  const giant = "x".repeat(limit * 4 * 3); // far bigger than one chunk
  const plan = planSummaryChunks(giant, budget);
  assert.equal(plan.needsChunking, true);
  assert.ok(plan.chunks.length >= 3);
  for (const chunk of plan.chunks) {
    assert.ok(estimateTokens(chunk) <= limit);
  }
  assert.equal(plan.chunks.join(""), giant);
});
