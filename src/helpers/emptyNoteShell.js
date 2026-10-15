// Pure predicate: is a note an abandoned EMPTY SHELL that is safe to sweep?
//
// Background: notes are created speculatively — a meeting note is committed the moment
// you click "Join / Take notes" (or on auto-record), and "New note" / "New recording"
// commit a note before any text/recording exists. If no recording or typing ever
// follows, an empty shell is left behind and nothing cleans it up. (Investigation
// 2026-10-09: 35% of meeting notes were empty calendar shells.)
//
// A shell has no transcript, no content, and no enhanced content. Guards so we NEVER
// delete real data:
//   - never sweep uploads or shared/published notes
//   - never sweep a note that has an attached source_file (uploaded audio pending STT)
//   - a PERSONAL note qualifies only if it was never edited after creation
//     (updated_at === created_at) — so a personal note the user opened, titled, or
//     touched is protected. Meeting shells get an updated_at bump from their calendar
//     link at creation time, so meeting notes rely on the content-empty test alone
//     (a meeting note with typed manual notes has non-empty content and is protected).
//
// Authored as CommonJS `.js` because it is consumed by the main-process
// database.js/meeting code (require) and unit-tested with require — matching the
// main-process helper convention (vs. the ESM renderer seams).

const isBlank = (value) => value == null || String(value).trim() === "";

/**
 * @param {{
 *   note_type?: string, deleted_at?: unknown, is_shared?: unknown,
 *   source_file?: unknown, transcript?: unknown, content?: unknown,
 *   enhanced_content?: unknown, created_at?: unknown, updated_at?: unknown
 * }} note
 * @returns {boolean}
 */
function isEmptyShellNote(note) {
  if (!note) return false;
  if (note.deleted_at) return false;
  if (note.is_shared) return false;
  if (!isBlank(note.source_file)) return false;
  if (note.note_type !== "meeting" && note.note_type !== "personal") return false;
  if (!isBlank(note.transcript)) return false;
  if (!isBlank(note.content)) return false;
  if (!isBlank(note.enhanced_content)) return false;
  if (note.note_type === "personal") {
    // Protect any personal note touched after creation (titled/edited/opened+saved).
    if (note.created_at && note.updated_at && note.updated_at !== note.created_at) {
      return false;
    }
  }
  return true;
}

module.exports = { isEmptyShellNote, isBlank };
