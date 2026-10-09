const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../packages/core/src/transcript.ts");

test("parseTranscriptSegments: JSON segment array vs plain text vs junk", async () => {
  const { parseTranscriptSegments } = await load();
  const raw = JSON.stringify([
    { text: "hi", source: "mic", speaker: "you" },
    { text: "hello", source: "system", speaker: "speaker_0", speakerName: "Adil" },
  ]);
  const segs = parseTranscriptSegments(raw);
  assert.equal(segs?.length, 2);
  assert.equal(segs[1].speakerName, "Adil");

  // Plain-text phone transcript is not segments.
  assert.equal(parseTranscriptSegments("Just some spoken words."), null);
  // Empty array, non-array JSON, malformed JSON, and empty input all return null.
  assert.equal(parseTranscriptSegments("[]"), null);
  assert.equal(parseTranscriptSegments('{"text":"x"}'), null);
  assert.equal(parseTranscriptSegments("[not json"), null);
  assert.equal(parseTranscriptSegments(""), null);
  assert.equal(parseTranscriptSegments(null), null);
  // An array item without a string text field is rejected.
  assert.equal(parseTranscriptSegments('[{"foo":1}]'), null);
});

test("resolveSpeakerLabel: precedence mic/you -> name -> Speaker N -> Them", async () => {
  const { resolveSpeakerLabel } = await load();
  assert.deepEqual(resolveSpeakerLabel({ text: "", source: "mic" }, "You"), {
    label: "You",
    isSelf: true,
  });
  assert.deepEqual(resolveSpeakerLabel({ text: "", speaker: "you" }, "Mark"), {
    label: "Mark",
    isSelf: true,
  });
  assert.deepEqual(
    resolveSpeakerLabel({ text: "", source: "system", speaker: "speaker_2", speakerName: "Adil" }, "You"),
    { label: "Adil", isSelf: false }
  );
  // speaker_0 -> "Speaker 1" (1-indexed for humans).
  assert.deepEqual(
    resolveSpeakerLabel({ text: "", source: "system", speaker: "speaker_0" }, "You"),
    { label: "Speaker 1", isSelf: false }
  );
  assert.deepEqual(resolveSpeakerLabel({ text: "", source: "system" }, "You"), {
    label: "Them",
    isSelf: false,
  });
});

test("groupTranscriptForReading: merges same-speaker clauses, splits on speaker change", async () => {
  const { groupTranscriptForReading } = await load();
  const segs = [
    { text: "Testing one two three", source: "mic", speaker: "you", timestamp: 76 },
    { text: "Hey, Mar, good morning.", source: "system", speaker: "speaker_0", speakerName: "Adil", timestamp: 80 },
    { text: "Not bad, not bad.", source: "system", speaker: "speaker_0", speakerName: "Adil", timestamp: 81 },
    { text: "How's your day going?", source: "mic", speaker: "you", timestamp: 86 },
  ];
  const paras = groupTranscriptForReading(segs, { selfName: "You" });
  assert.equal(paras.length, 3);
  assert.deepEqual(paras[0], { label: "You", text: "Testing one two three", isSelf: true });
  // The two consecutive Adil clauses merge into one paragraph.
  assert.deepEqual(paras[1], { label: "Adil", text: "Hey, Mar, good morning. Not bad, not bad.", isSelf: false });
  assert.equal(paras[2].label, "You");
});

test("groupTranscriptForReading: a long pause splits the same speaker", async () => {
  const { groupTranscriptForReading } = await load();
  const segs = [
    { text: "First thought.", source: "mic", speaker: "you", timestamp: 10 },
    { text: "Much later thought.", source: "mic", speaker: "you", timestamp: 20 },
  ];
  const paras = groupTranscriptForReading(segs, { selfName: "You", gapSeconds: 2.5 });
  assert.equal(paras.length, 2);
});

test("formatTranscriptForReading: flat 'Label: text' paragraphs for share/export", async () => {
  const { formatTranscriptForReading } = await load();
  const segs = [
    { text: "Hello there.", source: "mic", speaker: "you", timestamp: 1 },
    { text: "General Kenobi.", source: "system", speaker: "speaker_0", speakerName: "Obi", timestamp: 5 },
  ];
  assert.equal(
    formatTranscriptForReading(segs, { selfName: "You" }),
    "You: Hello there.\n\nObi: General Kenobi."
  );
  assert.equal(formatTranscriptForReading([], { selfName: "You" }), "");
});
