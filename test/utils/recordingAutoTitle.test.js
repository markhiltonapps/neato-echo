const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isDefaultRecordingTitle,
  deriveTitleFromText,
} = require("../../src/utils/recordingTitleText");

test("default recording titles are recognized case/space-insensitively", () => {
  for (const d of ["", "New note", "  new note ", "Untitled Note", "untitled", "New recording"]) {
    assert.equal(isDefaultRecordingTitle(d), true, `expected default: ${JSON.stringify(d)}`);
  }
  assert.equal(isDefaultRecordingTitle(null), true);
  assert.equal(isDefaultRecordingTitle(undefined), true);
});

test("a real title is never treated as default", () => {
  for (const real of ["Post-close review", "Q3 sync", "Notes about the thing"]) {
    assert.equal(isDefaultRecordingTitle(real), false, `expected real: ${real}`);
  }
});

test("deriveTitleFromText takes the first non-empty line, capped to a short phrase", () => {
  assert.equal(deriveTitleFromText("\n\n  Hello there team  \nsecond line"), "Hello there team");
  assert.equal(
    deriveTitleFromText("one two three four five six seven eight nine ten"),
    "one two three four five six seven eight"
  );
  assert.equal(
    deriveTitleFromText("Trailing punctuation should go..."),
    "Trailing punctuation should go"
  );
  assert.equal(deriveTitleFromText(""), "");
  assert.equal(deriveTitleFromText("   \n  "), "");
});

test("a very long single word/line is truncated with an ellipsis", () => {
  const long = "supercalifragilisticexpialidocioussupercalifragilisticexpialidociousmore";
  const out = deriveTitleFromText(long);
  assert.ok(out.length <= 61, `too long: ${out.length}`);
  assert.ok(out.endsWith("…"));
});
