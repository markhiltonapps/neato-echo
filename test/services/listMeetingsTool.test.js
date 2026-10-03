const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/services/tools/listMeetingsTool.ts");

function stub(notes, calls = []) {
  global.window = {
    electronAPI: {
      listMeetingsByDate: async (start, end, limit) => {
        calls.push({ start, end, limit });
        return notes;
      },
    },
  };
}

const segJSON = (segs) => JSON.stringify(segs);

test("prefers the saved summary and drops the transcript excerpt when present", async () => {
  const { listMeetingsTool } = await load();
  stub([
    {
      id: 7,
      title: "Roadmap sync",
      created_at: "2026-09-05 10:00:00",
      audio_duration_seconds: 1800,
      enhanced_content: "We agreed to ship 1.1.10 next week.",
      transcript: segJSON([{ text: "hello", source: "mic" }]),
    },
  ]);

  const result = await listMeetingsTool.execute({ start: "2026-09-05", end: "2026-09-05" });

  assert.equal(result.success, true);
  const [row] = result.data;
  assert.equal(row.id, 7);
  assert.equal(row.title, "Roadmap sync");
  assert.equal(row.durationSeconds, 1800);
  assert.equal(row.summary, "We agreed to ship 1.1.10 next week.");
  assert.equal(row.transcriptExcerpt, null);
  assert.match(result.displayText, /Found 1 meeting between 2026-09-05 and 2026-09-05/);
});

test("builds a labeled transcript excerpt when there is no summary", async () => {
  const { listMeetingsTool } = await load();
  stub([
    {
      id: 8,
      title: "Untitled",
      created_at: "2026-09-05 11:00:00",
      audio_duration_seconds: null,
      enhanced_content: null,
      transcript: segJSON([
        { text: "Let's start.", source: "mic" },
        { text: "Sounds good.", source: "system", speaker: "speaker_0", speakerName: "Dana" },
      ]),
    },
  ]);

  const result = await listMeetingsTool.execute({});

  const [row] = result.data;
  assert.equal(row.summary, null);
  assert.equal(row.transcriptExcerpt, "You: Let's start.\nDana: Sounds good.");
});

test("passes the range through and rejects malformed dates", async () => {
  const { listMeetingsTool } = await load();
  const calls = [];
  stub([], calls);

  await listMeetingsTool.execute({ start: "2026-09-01", end: "2026-09-07", limit: 10 });
  assert.deepEqual(calls[0], { start: "2026-09-01", end: "2026-09-07", limit: 10 });

  const bad = await listMeetingsTool.execute({ start: "yesterday" });
  assert.equal(bad.success, false);
  assert.match(bad.displayText, /Invalid start date/);
});

test("empty range reports zero meetings without erroring", async () => {
  const { listMeetingsTool } = await load();
  stub([]);
  const result = await listMeetingsTool.execute({ start: "2026-01-01", end: "2026-01-01" });
  assert.equal(result.success, true);
  assert.deepEqual(result.data, []);
  assert.match(result.displayText, /Found 0 meetings/);
});
