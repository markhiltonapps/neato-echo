const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/noteChatContext.ts");

test("includes id, title, date and readable transcript", async () => {
  const { buildNoteChatContext } = await load();
  const out = buildNoteChatContext({
    noteId: 42,
    folderId: 3,
    title: "Roadmap sync",
    createdAt: "2026-09-05 10:00:00",
    noteType: "meeting",
    content: "",
    transcript: "You: Let's start.\nDana: Sounds good.",
  });
  assert.match(out, /Note ID: 42/);
  assert.match(out, /Folder ID: 3/);
  assert.match(out, /Title: Roadmap sync/);
  assert.match(out, /Date: 2026-09-05 10:00:00/);
  assert.match(out, /Transcript:\nYou: Let's start\.\nDana: Sounds good\./);
});

test("falls back to a meaningful title for an untitled meeting", async () => {
  const { buildNoteChatContext } = await load();
  const out = buildNoteChatContext({
    noteId: 7,
    folderId: null,
    title: "   ",
    createdAt: "2026-09-05 10:00:00",
    noteType: "meeting",
    content: "",
    transcript: "You: hi",
  });
  assert.match(out, /Title: Untitled meeting/);
  assert.doesNotMatch(out, /Folder ID/);
});

test("omits empty content and empty transcript sections", async () => {
  const { buildNoteChatContext } = await load();
  const out = buildNoteChatContext({
    noteId: 1,
    folderId: null,
    title: "Note",
    content: "   ",
    transcript: "",
  });
  assert.doesNotMatch(out, /Content:/);
  assert.doesNotMatch(out, /Transcript/);
});

test("does NOT embed raw JSON — that is the caller's job to format first", async () => {
  const { buildNoteChatContext } = await load();
  // The builder trusts the caller passes readable text; this test documents
  // that contract by showing a readable line survives verbatim.
  const out = buildNoteChatContext({
    noteId: 1,
    folderId: null,
    title: "M",
    content: "meeting notes here",
    transcript: "Alex: We shipped it.",
  });
  assert.match(out, /Content:\nmeeting notes here/);
  assert.match(out, /Alex: We shipped it\./);
});

test("caps an over-long transcript head+tail with a middle marker", async () => {
  const { buildNoteChatContext, capTranscript, MAX_TRANSCRIPT_CONTEXT_CHARS } = await load();
  const head = "INTRO ".repeat(5000); // ~30k
  const tail = "OUTRO ".repeat(5000); // ~30k
  const long = head + tail; // ~60k > cap
  const { text, truncated } = capTranscript(long);
  assert.equal(truncated, true);
  assert.ok(text.length <= MAX_TRANSCRIPT_CONTEXT_CHARS);
  assert.match(text, /middle of transcript trimmed/);
  assert.ok(text.startsWith("INTRO"));
  assert.ok(text.trimEnd().endsWith("OUTRO"));

  const ctx = buildNoteChatContext({
    noteId: 1,
    folderId: null,
    title: "Long meeting",
    noteType: "meeting",
    content: "",
    transcript: long,
  });
  assert.match(ctx, /Transcript \(trimmed for length\):/);
});

test("short transcript is not truncated", async () => {
  const { capTranscript } = await load();
  const { text, truncated } = capTranscript("short");
  assert.equal(truncated, false);
  assert.equal(text, "short");
});
