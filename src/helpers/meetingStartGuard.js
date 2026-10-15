// Collapse rapid duplicate meeting-start triggers into one.
//
// The meeting hotkey is dispatched from TWO sources (the Electron globalShortcut
// callback and the native key-listener), so a single press can fire startManualMeeting
// twice, and a quick double-press does the same — each creating its own empty "New note"
// shell (observed: two shells ~4s apart). A short debounce on the last successful start
// collapses those into one. Pure so it can be unit-tested without the engine.

const MEETING_START_DEBOUNCE_MS = 1500;

/**
 * @param {number} nowMs
 * @param {number|null|undefined} lastStartMs  epoch ms of the last accepted start
 * @param {number} [debounceMs]
 * @returns {boolean} true if this start should be IGNORED (a start fired too recently)
 */
function shouldIgnoreMeetingStart(nowMs, lastStartMs, debounceMs = MEETING_START_DEBOUNCE_MS) {
  if (lastStartMs == null) return false;
  return nowMs - lastStartMs < debounceMs;
}

module.exports = { shouldIgnoreMeetingStart, MEETING_START_DEBOUNCE_MS };
