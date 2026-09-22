const test = require("node:test");
const assert = require("node:assert/strict");
const { noteDurationSeconds, isShortRecordingDuration } = require("../../src/utils/noteDuration");

const seg = (timestamp) => ({ text: "x", source: "mic", timestamp });

test("prefers the stored audio_duration_seconds", () => {
  assert.equal(noteDurationSeconds({ audio_duration_seconds: 123, transcript: null }), 123);
  // Stored wins even when a transcript is present.
  assert.equal(
    noteDurationSeconds({
      audio_duration_seconds: 90,
      transcript: JSON.stringify([seg(0), seg(600)]),
    }),
    90
  );
});

test("derives seconds from relative-second timestamps", () => {
  const transcript = JSON.stringify([seg(0), seg(12), seg(184.4)]);
  assert.equal(noteDurationSeconds({ audio_duration_seconds: null, transcript }), 184);
});

test("derives seconds from epoch-millisecond timestamps", () => {
  const base = 1_726_000_000_000; // ~2024 in ms
  const transcript = JSON.stringify([seg(base), seg(base + 42_000), seg(base + 200_000)]);
  assert.equal(noteDurationSeconds({ audio_duration_seconds: null, transcript }), 200);
});

test("short-recording flag triggers under 5 minutes only", () => {
  assert.equal(isShortRecordingDuration(299), true);
  assert.equal(isShortRecordingDuration(300), false);
  assert.equal(isShortRecordingDuration(0), false);
  assert.equal(isShortRecordingDuration(null), false);
});

test("returns null when there is no reliable signal", () => {
  assert.equal(noteDurationSeconds({ audio_duration_seconds: null, transcript: null }), null);
  assert.equal(
    noteDurationSeconds({ audio_duration_seconds: null, transcript: "plain text" }),
    null
  );
  assert.equal(noteDurationSeconds({ audio_duration_seconds: null, transcript: "[]" }), null);
  // A single timestamp cannot bound a span.
  assert.equal(
    noteDurationSeconds({ audio_duration_seconds: null, transcript: JSON.stringify([seg(5)]) }),
    null
  );
  // Segments without timestamps.
  assert.equal(
    noteDurationSeconds({
      audio_duration_seconds: null,
      transcript: JSON.stringify([{ text: "a" }, { text: "b" }]),
    }),
    null
  );
});
