const test = require("node:test");
const assert = require("node:assert/strict");
const { isEmptyShellNote } = require("../../src/helpers/emptyNoteShell");

const base = {
  note_type: "meeting",
  deleted_at: null,
  is_shared: 0,
  source_file: null,
  transcript: null,
  content: "",
  enhanced_content: null,
  created_at: "2026-10-06 19:40:09",
  updated_at: "2026-10-06 19:40:12", // meeting shells get an updated_at bump from the calendar link
};

test("empty calendar meeting shell is swept (even with a title/updated_at bump)", () => {
  assert.equal(isEmptyShellNote({ ...base }), true);
});

test("meeting note with a transcript is kept", () => {
  assert.equal(isEmptyShellNote({ ...base, transcript: "Alice: hi" }), false);
});

test("meeting note with typed manual content is kept", () => {
  assert.equal(isEmptyShellNote({ ...base, content: "my notes" }), false);
});

test("meeting note with enhanced content is kept", () => {
  assert.equal(isEmptyShellNote({ ...base, enhanced_content: "## Summary" }), false);
});

test("whitespace-only fields still count as empty", () => {
  assert.equal(isEmptyShellNote({ ...base, content: "   ", transcript: "\n" }), true);
});

test("empty personal 'Untitled Note' (never edited) is swept", () => {
  const n = {
    ...base,
    note_type: "personal",
    created_at: "2026-10-06 19:40:09",
    updated_at: "2026-10-06 19:40:09", // never touched
  };
  assert.equal(isEmptyShellNote(n), true);
});

test("personal note edited after creation is protected (updated_at advanced)", () => {
  const n = {
    ...base,
    note_type: "personal",
    created_at: "2026-10-06 19:40:09",
    updated_at: "2026-10-06 19:45:00", // user opened/titled it
  };
  assert.equal(isEmptyShellNote(n), false);
});

test("uploads, shared notes, and notes with audio files are never swept", () => {
  assert.equal(isEmptyShellNote({ ...base, note_type: "upload" }), false);
  assert.equal(isEmptyShellNote({ ...base, is_shared: 1 }), false);
  assert.equal(isEmptyShellNote({ ...base, source_file: "/tmp/rec.wav" }), false);
});

test("already-deleted and null notes are not swept", () => {
  assert.equal(isEmptyShellNote({ ...base, deleted_at: "2026-10-06 20:00:00" }), false);
  assert.equal(isEmptyShellNote(null), false);
  assert.equal(isEmptyShellNote(undefined), false);
});
