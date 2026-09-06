const test = require("node:test");
const assert = require("node:assert");
const { createLivePreviewCleaner } = require("../../src/helpers/livePreviewCleaner");

const tick = () => new Promise((r) => setTimeout(r, 0));

test("shows raw immediately, then swaps in cleaned settled text", async () => {
  const displays = [];
  const cleaner = createLivePreviewCleaner({
    minSettledChars: 1,
    clean: async (settled) => settled.toUpperCase(),
    onDisplay: (d) => displays.push(d),
  });

  cleaner.setRaw("hello there. still going");
  // Raw shown synchronously (no cleaned cache yet).
  assert.equal(displays[displays.length - 1], "hello there. still going");

  await tick(); // let the async clean resolve + re-render
  // Settled sentence cleaned; tail stays raw.
  assert.equal(displays[displays.length - 1], "HELLO THERE. still going");
});

test("only one cleanup runs at a time; catches up after it resolves", async () => {
  const cleanCalls = [];
  let resolveFirst;
  const cleaner = createLivePreviewCleaner({
    minSettledChars: 1,
    clean: (settled) => {
      cleanCalls.push(settled);
      // First call hangs until we release it; later calls resolve immediately.
      if (cleanCalls.length === 1) return new Promise((res) => (resolveFirst = res));
      return Promise.resolve(settled.toUpperCase());
    },
    onDisplay: () => {},
  });

  cleaner.setRaw("one. two"); // settled "one." -> starts clean #1 (hangs)
  cleaner.setRaw("one. two. three"); // settled grew, but clean is in-flight -> no 2nd call yet
  assert.equal(cleanCalls.length, 1);

  resolveFirst("ONE."); // release the first cleanup
  await tick();
  await tick();
  // After the first resolves, it re-evaluates and cleans the new settled text.
  assert.equal(cleanCalls.length, 2);
  assert.equal(cleanCalls[1], "one. two.");
});

test("does not clean below minSettledChars", async () => {
  const cleanCalls = [];
  const cleaner = createLivePreviewCleaner({
    minSettledChars: 20,
    clean: async (s) => {
      cleanCalls.push(s);
      return s.toUpperCase();
    },
    onDisplay: () => {},
  });
  cleaner.setRaw("Hi. more"); // settled "Hi." is < 20 chars
  await tick();
  assert.equal(cleanCalls.length, 0);
});

test("cleanup failure falls back to raw display", async () => {
  const displays = [];
  const cleaner = createLivePreviewCleaner({
    minSettledChars: 1,
    clean: async () => {
      throw new Error("model unreachable");
    },
    onDisplay: (d) => displays.push(d),
  });
  cleaner.setRaw("hello there. going on");
  await tick();
  assert.equal(displays[displays.length - 1], "hello there. going on");
});

test("appendRaw accumulates chunked deltas", async () => {
  const displays = [];
  const cleaner = createLivePreviewCleaner({
    minSettledChars: 1,
    clean: async (s) => s.toUpperCase(),
    onDisplay: (d) => displays.push(d),
  });
  cleaner.appendRaw("first sentence.");
  cleaner.appendRaw("second part");
  assert.equal(cleaner.getRaw(), "first sentence. second part");
  await tick();
  assert.equal(displays[displays.length - 1], "FIRST SENTENCE. second part");
});

test("reset clears raw and cache", async () => {
  const displays = [];
  const cleaner = createLivePreviewCleaner({
    minSettledChars: 1,
    clean: async (s) => s.toUpperCase(),
    onDisplay: (d) => displays.push(d),
  });
  cleaner.setRaw("done sentence. tail");
  await tick();
  cleaner.reset();
  assert.equal(cleaner.getRaw(), "");
  cleaner.setRaw("fresh start here");
  assert.equal(displays[displays.length - 1], "fresh start here");
});

test("dispose stops applying late results", async () => {
  const displays = [];
  let resolveClean;
  const cleaner = createLivePreviewCleaner({
    minSettledChars: 1,
    clean: () => new Promise((res) => (resolveClean = res)),
    onDisplay: (d) => displays.push(d),
  });
  cleaner.setRaw("hello there. tail");
  const countBefore = displays.length;
  cleaner.dispose();
  resolveClean("HELLO THERE.");
  await tick();
  // No new display pushed after dispose.
  assert.equal(displays.length, countBefore);
});
