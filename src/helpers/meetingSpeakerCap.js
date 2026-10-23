// Pure policy for how many speakers the LIVE meeting identifier may cluster on the
// far-side (system-audio) channel. The local microphone is always labeled "you" and is
// never fed to the identifier, so this caps only the remote participants.
//
// The subtlety this encodes: when the number of people on the call is actually KNOWN —
// the user set it with the stepper (`explicit`), or it was derived from the note / calendar
// roster (`countKnown`) — we reserve one slot for the local "you" and cap the far side at
// `count - 1`. But when the count is NOT known, we must NOT fall back to the default of 2
// and cap the far side at 1: that silently force-folds every remote voice onto a single
// speaker, which is exactly the bug where a 3-person ad-hoc call came out with the two
// remote people merged. With no real signal we let the identifier cluster up to the model
// max, so multi-person calls separate on their own; a genuine 1:1 call still resolves to a
// single far-side voice because only one distinct voice is ever heard.
function farSideSpeakerCap(
  { explicit = false, countKnown = false, expectedCount } = {},
  { defaultCount, maxCount } = {}
) {
  const max = Number.isFinite(maxCount) ? maxCount : 8;
  const fallback = Number.isFinite(defaultCount) ? defaultCount : 2;
  if (explicit === true || countKnown === true) {
    const total = Math.min(expectedCount || fallback, max);
    return Math.max(1, total - 1);
  }
  // Count unknown: auto-separate up to the model max rather than collapsing to one voice.
  return Math.max(1, max - 1);
}

module.exports = { farSideSpeakerCap };
