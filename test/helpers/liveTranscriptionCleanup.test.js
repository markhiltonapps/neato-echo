const test = require("node:test");
const assert = require("node:assert");
const {
  splitSettledAndTail,
  composeLivePreview,
  planLivePreview,
} = require("../../src/helpers/liveTranscriptionCleanup");

test("splitSettledAndTail: no sentence yet is all tail", () => {
  assert.deepEqual(splitSettledAndTail("hello there this is"), {
    settled: "",
    tail: "hello there this is",
  });
});

test("splitSettledAndTail: one complete sentence plus an in-progress tail", () => {
  assert.deepEqual(splitSettledAndTail("Hello there. Now I am talking"), {
    settled: "Hello there.",
    tail: "Now I am talking",
  });
});

test("splitSettledAndTail: multiple sentences settle, last fragment is tail", () => {
  assert.deepEqual(
    splitSettledAndTail("First point. Second point! A third one? and the rest"),
    { settled: "First point. Second point! A third one?", tail: "and the rest" }
  );
});

test("splitSettledAndTail: a completed sentence with no trailing text has empty tail", () => {
  assert.deepEqual(splitSettledAndTail("All done here. "), {
    settled: "All done here.",
    tail: "",
  });
});

test("splitSettledAndTail: trailing quote/bracket after the terminator still settles", () => {
  assert.deepEqual(splitSettledAndTail('He said "go." Then left'), {
    settled: 'He said "go."',
    tail: "Then left",
  });
});

test("splitSettledAndTail: empty / non-string input is safe", () => {
  assert.deepEqual(splitSettledAndTail(""), { settled: "", tail: "" });
  assert.deepEqual(splitSettledAndTail(undefined), { settled: "", tail: "" });
});

test("splitSettledAndTail: a decimal mid-number is not a boundary (no following space)", () => {
  // "3.5" has no whitespace after the dot, so it stays in the tail.
  assert.deepEqual(splitSettledAndTail("the value is 3.5 and rising"), {
    settled: "",
    tail: "the value is 3.5 and rising",
  });
});

test("composeLivePreview: joins settled and tail with a single space", () => {
  assert.equal(composeLivePreview("Hello there.", "now talking"), "Hello there. now talking");
  assert.equal(composeLivePreview("Only settled.", ""), "Only settled.");
  assert.equal(composeLivePreview("", "only tail"), "only tail");
  assert.equal(composeLivePreview("", ""), "");
});

test("planLivePreview: first sentence completes -> should clean, display raw until cleaned", () => {
  const plan = planLivePreview("Hello there. now talking", { settledRaw: "", settledClean: "" });
  assert.equal(plan.settled, "Hello there.");
  assert.equal(plan.tail, "now talking");
  assert.equal(plan.shouldClean, true);
  // No cached clean yet, so raw settled is shown alongside the raw tail.
  assert.equal(plan.display, "Hello there. now talking");
});

test("planLivePreview: uses cached cleaned settled when settled raw is unchanged", () => {
  const cache = { settledRaw: "hello there.", settledClean: "Hello there." };
  const plan = planLivePreview("hello there. still going", cache);
  assert.equal(plan.shouldClean, false); // settled unchanged -> no re-clean
  assert.equal(plan.display, "Hello there. still going"); // cleaned settled + raw tail
});

test("planLivePreview: a new settled sentence triggers another clean and shows raw meanwhile", () => {
  const cache = { settledRaw: "hello there.", settledClean: "Hello there." };
  const plan = planLivePreview("hello there. second sentence done. tail", cache);
  assert.equal(plan.settled, "hello there. second sentence done.");
  assert.equal(plan.shouldClean, true);
  // Settled raw changed, so the cached clean no longer matches -> show raw settled.
  assert.equal(plan.display, "hello there. second sentence done. tail");
});

test("planLivePreview: pure tail (no settled) never asks to clean", () => {
  const plan = planLivePreview("just starting to speak", { settledRaw: "", settledClean: "" });
  assert.equal(plan.shouldClean, false);
  assert.equal(plan.display, "just starting to speak");
});
