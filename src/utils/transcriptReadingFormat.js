// Formats meeting transcript segments into a readable, paragraphed transcript
// for display and for copy/export. The stored segments are short ASR chunks
// (often one clause each), so rendering them raw reads as one run-on block —
// especially when every chunk is the same speaker. This groups them into
// paragraphs and labels each speaker turn.
//
// A new paragraph starts when:
//   - the speaker changes,
//   - there's a noticeable pause between chunks (a natural break), or
//   - the current paragraph has grown long and the last chunk ended a sentence
//     (so a single long monologue still breaks into readable paragraphs).
//
// `resolveLabel(segment)` is injected so this stays free of i18n/app deps and
// unit-testable. Returns a string with paragraphs separated by a blank line,
// each prefixed with its speaker label once.

const DEFAULT_GAP_SECONDS = 2.5;
const DEFAULT_SOFT_CHAR_LIMIT = 320;

function endsSentence(text) {
  return /[.!?]["'”’)\]]?\s*$/.test((text || "").trimEnd());
}

/**
 * @param {Array<{text:string,timestamp?:number}>} segments
 * @param {{ resolveLabel: (segment:any)=>string, gapSeconds?:number, softCharLimit?:number }} opts
 * @returns {string}
 */
function formatTranscriptForReading(segments, opts) {
  const resolveLabel = opts?.resolveLabel;
  const gapSeconds = opts?.gapSeconds ?? DEFAULT_GAP_SECONDS;
  const softCharLimit = opts?.softCharLimit ?? DEFAULT_SOFT_CHAR_LIMIT;
  if (!Array.isArray(segments) || segments.length === 0 || typeof resolveLabel !== "function") {
    return "";
  }

  const paragraphs = [];
  let current = null; // { label, text, lastTimestamp }

  const flush = () => {
    if (current && current.text.trim()) {
      paragraphs.push(`${current.label}: ${current.text.trim()}`);
    }
    current = null;
  };

  for (const seg of segments) {
    const text = (seg?.text || "").trim();
    if (!text) continue;
    const label = resolveLabel(seg) || "";
    const ts = typeof seg?.timestamp === "number" ? seg.timestamp : null;

    if (current) {
      const speakerChanged = label !== current.label;
      const gap =
        ts !== null && current.lastTimestamp !== null && ts - current.lastTimestamp >= gapSeconds;
      const longEnough = current.text.length >= softCharLimit && endsSentence(current.text);
      if (speakerChanged || gap || longEnough) flush();
    }

    if (!current) {
      current = { label, text, lastTimestamp: ts };
    } else {
      // Join within a paragraph; the ASR chunks are clause-sized, so a space
      // keeps sentences intact without doubling punctuation.
      current.text = `${current.text} ${text}`.replace(/\s+/g, " ");
      current.lastTimestamp = ts;
    }
  }
  flush();

  return paragraphs.join("\n\n");
}

module.exports = { formatTranscriptForReading, endsSentence };
