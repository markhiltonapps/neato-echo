const test = require("node:test");
const assert = require("node:assert");
const { formatTranscriptForReading, endsSentence } = require("../../src/utils/transcriptReadingFormat");

// Simple label resolver: mic -> "You", otherwise the speaker id.
const resolveLabel = (s) => (s.source === "mic" ? "You" : s.speaker || "Them");

test("empty / invalid input returns empty string", () => {
  assert.equal(formatTranscriptForReading([], { resolveLabel }), "");
  assert.equal(formatTranscriptForReading(null, { resolveLabel }), "");
  assert.equal(formatTranscriptForReading([{ text: "hi" }], {}), "");
});

test("new paragraph on speaker change, labeled once per turn", () => {
  const segs = [
    { text: "Hello everyone.", source: "mic", timestamp: 0 },
    { text: "Thanks for coming.", source: "mic", timestamp: 1 },
    { text: "Glad to be here.", source: "system", speaker: "speaker_0", timestamp: 2 },
  ];
  const out = formatTranscriptForReading(segs, { resolveLabel });
  assert.equal(out, "You: Hello everyone. Thanks for coming.\n\nspeaker_0: Glad to be here.");
});

test("same speaker with a long pause breaks into a new paragraph", () => {
  const segs = [
    { text: "First thought.", source: "system", speaker: "speaker_0", timestamp: 0 },
    { text: "Second thought after a pause.", source: "system", speaker: "speaker_0", timestamp: 10 },
  ];
  const out = formatTranscriptForReading(segs, { resolveLabel, gapSeconds: 2.5 });
  assert.equal(out, "speaker_0: First thought.\n\nspeaker_0: Second thought after a pause.");
});

test("same speaker, no pause, stays one paragraph", () => {
  const segs = [
    { text: "Part one", source: "system", speaker: "speaker_0", timestamp: 0 },
    { text: "part two.", source: "system", speaker: "speaker_0", timestamp: 0.5 },
  ];
  const out = formatTranscriptForReading(segs, { resolveLabel, gapSeconds: 2.5 });
  assert.equal(out, "speaker_0: Part one part two.");
});

test("a long single-speaker monologue breaks at sentence boundaries once past the soft limit", () => {
  const seg = (n) => ({
    text: `This is sentence number ${n} and it is reasonably wordy.`,
    source: "system",
    speaker: "speaker_0",
    timestamp: n, // 1s apart, under the gap threshold
  });
  const segs = [seg(1), seg(2), seg(3), seg(4), seg(5), seg(6), seg(7), seg(8)];
  const out = formatTranscriptForReading(segs, { resolveLabel, gapSeconds: 30, softCharLimit: 120 });
  const paras = out.split("\n\n");
  assert.ok(paras.length >= 2, `expected multiple paragraphs, got ${paras.length}`);
  assert.ok(paras.every((p) => p.startsWith("speaker_0: ")));
});

test("blank segments are skipped", () => {
  const segs = [
    { text: "  ", source: "mic", timestamp: 0 },
    { text: "Real line.", source: "mic", timestamp: 1 },
  ];
  assert.equal(formatTranscriptForReading(segs, { resolveLabel }), "You: Real line.");
});

test("endsSentence detects terminal punctuation", () => {
  assert.equal(endsSentence("Done."), true);
  assert.equal(endsSentence('He said "go."  '), true);
  assert.equal(endsSentence("not yet"), false);
});
