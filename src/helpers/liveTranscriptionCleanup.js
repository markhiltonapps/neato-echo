// Pure helpers for "sentence-settled" live-preview cleanup.
//
// The live dictation preview shows raw speech-model output, which reads rough
// (fragmented, unpunctuated) next to the final transcript that a cleanup model
// polishes at stop. To close that gap without the flicker and lag of cleaning
// every keystroke, we split the accumulated raw transcript into a *settled*
// part (complete sentences, safe to clean once) and a *tail* (the sentence
// still being spoken, kept raw for immediacy). Settled text is cleaned a
// sentence at a time and cached; the tail is appended raw. The display is
// therefore polished-behind + raw-at-the-tip.
//
// Everything here is pure and synchronous so it can be unit-tested; the async
// cleanup call and timing live in the renderer controller that consumes these.

// A sentence terminator (. ! ?), allowing a trailing quote/bracket, that is
// followed by whitespace — i.e. a boundary the speaker has clearly moved past.
const SETTLED_BOUNDARY = /[.!?]["'”’)\]]?(?=\s)/g;

/**
 * Split accumulated raw transcript into settled (complete sentences) and tail
 * (the in-progress sentence). If no sentence has been completed yet, everything
 * is tail so the user still sees their words immediately.
 * @param {string} raw
 * @returns {{ settled: string, tail: string }}
 */
function splitSettledAndTail(raw) {
  if (!raw || typeof raw !== "string") return { settled: "", tail: "" };
  let lastEnd = -1;
  SETTLED_BOUNDARY.lastIndex = 0;
  let match;
  while ((match = SETTLED_BOUNDARY.exec(raw)) !== null) {
    lastEnd = match.index + match[0].length;
    // Zero-width guard: the lookahead never consumes, but the punctuation class
    // always does, so lastIndex advances. This is belt-and-suspenders.
    if (SETTLED_BOUNDARY.lastIndex <= match.index) SETTLED_BOUNDARY.lastIndex = match.index + 1;
  }
  if (lastEnd <= 0) return { settled: "", tail: raw.trim() };
  return { settled: raw.slice(0, lastEnd).trim(), tail: raw.slice(lastEnd).trim() };
}

/**
 * Compose the preview shown to the user from the (possibly cleaned) settled
 * text and the raw tail.
 * @param {string} settled
 * @param {string} tail
 * @returns {string}
 */
function composeLivePreview(settled, tail) {
  const a = (settled || "").trim();
  const b = (tail || "").trim();
  if (a && b) return `${a} ${b}`;
  return a || b;
}

/**
 * Decide what to do on a new accumulated raw value, given what was last cleaned.
 * Returns the display to show now (using cached cleaned text where the settled
 * portion is unchanged) and whether a fresh cleanup of the settled text is
 * warranted (its settled portion grew past what we cleaned, and enough content
 * exists to be worth a model call).
 *
 * @param {string} raw accumulated raw transcript
 * @param {{ settledRaw: string, settledClean: string }} cache last cleaned pair
 * @param {number} [minSettledChars] don't bother cleaning shorter settled text
 * @returns {{ display: string, settled: string, tail: string, shouldClean: boolean }}
 */
function planLivePreview(raw, cache, minSettledChars = 1) {
  const { settled, tail } = splitSettledAndTail(raw);
  const cachedSettledRaw = cache?.settledRaw ?? "";
  const cachedSettledClean = cache?.settledClean ?? "";

  // Reuse the cached cleaned text only when the settled raw is exactly what we
  // cleaned; otherwise show raw settled until the new cleanup returns, so the
  // display never drops content or shows stale sentences.
  const settledForDisplay = settled === cachedSettledRaw && cachedSettledClean ? cachedSettledClean : settled;

  const shouldClean = settled.length >= minSettledChars && settled !== cachedSettledRaw;

  return {
    display: composeLivePreview(settledForDisplay, tail),
    settled,
    tail,
    shouldClean,
  };
}

module.exports = { splitSettledAndTail, composeLivePreview, planLivePreview };
