const test = require("node:test");
const assert = require("node:assert/strict");

const { farSideSpeakerCap } = require("../../src/helpers/meetingSpeakerCap");

const LIMITS = { defaultCount: 2, maxCount: 8 };

test("unknown count does NOT collapse the far side to one voice (regression: merged remote speakers)", () => {
  // No signal at all (the note-112 case): seeded default count of 2, not explicit, not
  // roster-derived. Must auto-separate instead of capping the far side at 1.
  assert.equal(farSideSpeakerCap({ expectedCount: 2 }, LIMITS), 7);
  assert.equal(farSideSpeakerCap({ expectedCount: 2, explicit: false, countKnown: false }, LIMITS), 7);
  assert.equal(farSideSpeakerCap({}, LIMITS), 7);
});

test("an explicit user count reserves the mic and caps the far side at count-1", () => {
  assert.equal(farSideSpeakerCap({ explicit: true, expectedCount: 3 }, LIMITS), 2); // 3 people -> 2 remote
  assert.equal(farSideSpeakerCap({ explicit: true, expectedCount: 2 }, LIMITS), 1); // 1:1
  assert.equal(farSideSpeakerCap({ explicit: true, expectedCount: 1 }, LIMITS), 1); // floor at 1
});

test("a roster/note-derived count (countKnown) is honored like an explicit one", () => {
  assert.equal(farSideSpeakerCap({ countKnown: true, expectedCount: 4 }, LIMITS), 3);
  assert.equal(farSideSpeakerCap({ countKnown: true, expectedCount: 2 }, LIMITS), 1);
});

test("a known count is clamped to the model max", () => {
  assert.equal(farSideSpeakerCap({ explicit: true, expectedCount: 99 }, LIMITS), 7); // min(99,8)-1
});

test("limits default sensibly when omitted", () => {
  assert.equal(farSideSpeakerCap({}), 7); // maxCount defaults to 8 -> 7
  assert.equal(farSideSpeakerCap({ explicit: true, expectedCount: 3 }), 2);
});
