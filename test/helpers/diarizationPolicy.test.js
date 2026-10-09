const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_CLUSTER_THRESHOLD,
  OVERSPLIT_CLUSTER_THRESHOLD,
  OVERSPLIT_RETRY_MIN_SECONDS,
  OVERSPLIT_SUBSTANTIAL_CLUSTER_CEILING,
  MIN_CLUSTER_TOTAL_SECONDS,
  resolveClusterThreshold,
  countSubstantialClusters,
  shouldRetryForOversplit,
  dropNegligibleClusters,
} = require("../../src/helpers/diarizationPolicy");

// Merges are unrecoverable while over-splitting is cleaned up downstream, so the
// base threshold is biased low (splits readily) and the higher threshold is only
// a fallback for the one-speaker-drifting case.
test("thresholds are ordered so the retry merges more than the base", () => {
  assert.ok(DEFAULT_CLUSTER_THRESHOLD > 0 && DEFAULT_CLUSTER_THRESHOLD < 1);
  assert.ok(OVERSPLIT_CLUSTER_THRESHOLD > DEFAULT_CLUSTER_THRESHOLD);
  assert.ok(OVERSPLIT_CLUSTER_THRESHOLD <= 1);
});

test("resolveClusterThreshold defaults, clamps bounds, and rejects non-finite values", () => {
  assert.equal(resolveClusterThreshold(null), DEFAULT_CLUSTER_THRESHOLD);
  assert.equal(resolveClusterThreshold(""), DEFAULT_CLUSTER_THRESHOLD);
  assert.equal(resolveClusterThreshold("not-a-number"), DEFAULT_CLUSTER_THRESHOLD);
  assert.equal(resolveClusterThreshold(Infinity), DEFAULT_CLUSTER_THRESHOLD);
  assert.equal(resolveClusterThreshold(0), 0);
  assert.equal(resolveClusterThreshold(2), 1);
  assert.equal(resolveClusterThreshold(-1), 0);
  assert.equal(resolveClusterThreshold(0.42), 0.42);
});

test("countSubstantialClusters ignores sub-second embedding noise", () => {
  const segments = [
    { start: 0, end: 30, speaker: "speaker_0" },
    { start: 31, end: 61, speaker: "speaker_1" },
    { start: 61, end: 61.3, speaker: "speaker_2" }, // 0.3s — noise, not a person
  ];
  assert.equal(countSubstantialClusters(segments), 2);
  assert.equal(countSubstantialClusters([]), 0);
  assert.equal(countSubstantialClusters(null), 0);
});

// The over-split retry must NOT fire for a normal multi-speaker meeting, or it
// would raise the threshold and merge the very voices the user wants separated.
test("a handful of speakers on long audio does not trigger the over-split retry", () => {
  const meeting = Array.from({ length: OVERSPLIT_SUBSTANTIAL_CLUSTER_CEILING }, (_, i) => ({
    start: i * 60,
    end: i * 60 + 55,
    speaker: `speaker_${i}`,
  }));
  assert.equal(
    shouldRetryForOversplit({
      segments: meeting,
      durationSeconds: OVERSPLIT_RETRY_MIN_SECONDS + 600,
      hasExplicitCount: false,
    }),
    false
  );
});

test("implausibly many speakers on long audio triggers the over-split retry", () => {
  const drifted = Array.from({ length: OVERSPLIT_SUBSTANTIAL_CLUSTER_CEILING + 4 }, (_, i) => ({
    start: i * 60,
    end: i * 60 + 55,
    speaker: `speaker_${i}`,
  }));
  assert.equal(
    shouldRetryForOversplit({
      segments: drifted,
      durationSeconds: OVERSPLIT_RETRY_MIN_SECONDS + 600,
      hasExplicitCount: false,
    }),
    true
  );
});

test("the over-split retry never fires on short audio or with a pinned count", () => {
  const many = Array.from({ length: OVERSPLIT_SUBSTANTIAL_CLUSTER_CEILING + 4 }, (_, i) => ({
    start: i * 60,
    end: i * 60 + 55,
    speaker: `speaker_${i}`,
  }));
  // Short recording: speakers do not drift, so a high count is real.
  assert.equal(
    shouldRetryForOversplit({ segments: many, durationSeconds: 300, hasExplicitCount: false }),
    false
  );
  // Explicit count already forces the right number of clusters.
  assert.equal(
    shouldRetryForOversplit({
      segments: many,
      durationSeconds: OVERSPLIT_RETRY_MIN_SECONDS + 600,
      hasExplicitCount: true,
    }),
    false
  );
  // Unknown duration cannot be judged as drift.
  assert.equal(
    shouldRetryForOversplit({ segments: many, durationSeconds: NaN, hasExplicitCount: false }),
    false
  );
});

// Every cluster — however tiny — wins at least one sentence in the character-
// proportional merge, so a stray blip becomes a phantom [Speaker N].
test("clusters below the minimum total speaking time are dropped", () => {
  const segments = [
    { start: 0, end: 30, speaker: "speaker_0" },
    { start: 30, end: 30.4, speaker: "speaker_7" },
    { start: 31, end: 60, speaker: "speaker_1" },
    { start: 60, end: 60.3, speaker: "speaker_7" },
  ];
  const kept = dropNegligibleClusters(segments);
  assert.deepEqual(
    kept.map((s) => s.speaker),
    ["speaker_0", "speaker_1"]
  );
});

test("a cluster whose short segments add up past the minimum survives", () => {
  const segments = [
    { start: 0, end: 30, speaker: "speaker_0" },
    { start: 30, end: 30.6, speaker: "speaker_1" },
    { start: 40, end: 40.6, speaker: "speaker_1" },
  ];
  assert.equal(dropNegligibleClusters(segments).length, 3);
});

test("dropping never empties the result or touches a clean input", () => {
  const allTiny = [
    { start: 0, end: 0.3, speaker: "speaker_0" },
    { start: 1, end: 1.2, speaker: "speaker_1" },
  ];
  assert.deepEqual(dropNegligibleClusters(allTiny), allTiny);

  const clean = [{ start: 0, end: 10, speaker: "speaker_0" }];
  assert.deepEqual(dropNegligibleClusters(clean), clean);
  assert.deepEqual(dropNegligibleClusters([]), []);
  assert.equal(dropNegligibleClusters(null), null);
});

test("minimum speaking time constant is sane", () => {
  assert.ok(MIN_CLUSTER_TOTAL_SECONDS >= 0.5 && MIN_CLUSTER_TOTAL_SECONDS <= 5);
});
