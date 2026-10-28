const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/pauseEllipsis.js");

test("drops a mid-sentence pause ellipsis and joins the words", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(
    stripPauseEllipses("Amanda's been using... our app to record"),
    "Amanda's been using our app to record"
  );
});

test("handles the real-world Amanda report across several pauses", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(
    stripPauseEllipses("you can see how... Again I paused, and it's... messing up"),
    "you can see how Again I paused, and it's messing up"
  );
});

test("collapses the unicode ellipsis character", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(stripPauseEllipses("wait… what was that"), "wait what was that");
});

test("normalizes surrounding spaces to a single space", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(stripPauseEllipses("using ...  our app"), "using our app");
  assert.equal(stripPauseEllipses("using...our app"), "using our app");
});

test("keeps a trailing ellipsis the speaker likely intended", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(stripPauseEllipses("I'll think about it..."), "I'll think about it...");
  assert.equal(stripPauseEllipses("I'll think about it…"), "I'll think about it…");
});

test("keeps a leading ellipsis", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(stripPauseEllipses("...and then we left"), "...and then we left");
});

test("keeps an ellipsis before a line break", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(stripPauseEllipses("first line...\nsecond line"), "first line...\nsecond line");
});

test("leaves a single period untouched", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(stripPauseEllipses("Meet Mr. Smith at noon."), "Meet Mr. Smith at noon.");
  assert.equal(stripPauseEllipses("It costs 3.14 dollars"), "It costs 3.14 dollars");
});

test("passes non-string and empty input through unchanged", async () => {
  const { stripPauseEllipses } = await load();
  assert.equal(stripPauseEllipses(""), "");
  assert.equal(stripPauseEllipses(null), null);
  assert.equal(stripPauseEllipses(undefined), undefined);
});
