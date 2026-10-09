const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldIgnoreMeetingStart,
  MEETING_START_DEBOUNCE_MS,
} = require("../../src/helpers/meetingStartGuard");

test("first start is never ignored (no prior start)", () => {
  assert.equal(shouldIgnoreMeetingStart(1000, null), false);
  assert.equal(shouldIgnoreMeetingStart(1000, undefined), false);
});

test("a second start within the debounce window is ignored (double dispatch / double press)", () => {
  const t0 = 10_000;
  assert.equal(shouldIgnoreMeetingStart(t0 + 5, t0), true); // two dispatch sources, ms apart
  assert.equal(shouldIgnoreMeetingStart(t0 + MEETING_START_DEBOUNCE_MS - 1, t0), true);
});

test("a start after the debounce window is allowed", () => {
  const t0 = 10_000;
  assert.equal(shouldIgnoreMeetingStart(t0 + MEETING_START_DEBOUNCE_MS, t0), false);
  assert.equal(shouldIgnoreMeetingStart(t0 + 5000, t0), false);
});
