// Readable-transcript helpers shared by mobile and (eventually) desktop.
//
// Desktop meeting notes store the transcript as a JSON array of short ASR
// segments (one clause each, with speaker/source/timestamp). Rendering that raw
// reads as a wall of JSON or a run-on block, so this parses the segments and
// groups them into speaker-labeled paragraphs — the same rules the desktop's
// transcriptReadingFormat.js uses. Phone recordings store plain text, which is
// left untouched (parseTranscriptSegments returns null for it).

export interface TranscriptSegment {
  text: string;
  source?: string; // "mic" | "system"
  speaker?: string; // "you" | "speaker_0" | ...
  speakerName?: string;
  speakerIsPlaceholder?: boolean;
  timestamp?: number;
}

export interface TranscriptParagraph {
  label: string;
  text: string;
  isSelf: boolean;
}

// Parse a stored transcript string into segments, or null when it is plain text.
// A valid segment array is a non-empty JSON array whose items are objects with a
// `text` field.
export function parseTranscriptSegments(
  raw: string | null | undefined
): TranscriptSegment[] | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s.startsWith("[")) return null;
  try {
    const parsed = JSON.parse(s);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((x) => x && typeof x === "object" && typeof x.text === "string")
    ) {
      return parsed as TranscriptSegment[];
    }
  } catch {
    // Not JSON — treat as plain text.
  }
  return null;
}

const DEFAULT_GAP_SECONDS = 2.5;
const DEFAULT_SOFT_CHAR_LIMIT = 320;

function endsSentence(text: string): boolean {
  return /[.!?]["'”’)\]]?\s*$/.test((text || "").trimEnd());
}

// Speaker label precedence, mirroring the desktop's resolveLlmSpeakerLabel:
// mic/"you" → the note owner; explicit name → that name; "speaker_N" → "Speaker N+1";
// otherwise "Them". No i18n/mapping deps so it stays portable.
export function resolveSpeakerLabel(
  seg: TranscriptSegment,
  selfName: string
): { label: string; isSelf: boolean } {
  if (seg.source === "mic" || seg.speaker === "you") return { label: selfName, isSelf: true };
  const name = seg.speakerName?.trim();
  if (name) return { label: name, isSelf: false };
  if (seg.speaker && seg.speaker.startsWith("speaker_")) {
    const n = Number.parseInt(seg.speaker.replace("speaker_", ""), 10);
    if (!Number.isNaN(n)) return { label: `Speaker ${n + 1}`, isSelf: false };
  }
  return { label: "Them", isSelf: false };
}

export interface GroupOptions {
  selfName?: string;
  gapSeconds?: number;
  softCharLimit?: number;
}

// Group clause-sized segments into speaker-labeled paragraphs. A new paragraph
// starts when the speaker changes, after a noticeable pause, or when a single
// speaker's paragraph has grown long and ended a sentence.
export function groupTranscriptForReading(
  segments: TranscriptSegment[],
  opts: GroupOptions = {}
): TranscriptParagraph[] {
  const selfName = opts.selfName ?? "You";
  const gapSeconds = opts.gapSeconds ?? DEFAULT_GAP_SECONDS;
  const softCharLimit = opts.softCharLimit ?? DEFAULT_SOFT_CHAR_LIMIT;
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const out: TranscriptParagraph[] = [];
  let cur: { label: string; text: string; isSelf: boolean; last: number | null } | null = null;
  const flush = () => {
    if (cur && cur.text.trim()) out.push({ label: cur.label, text: cur.text.trim(), isSelf: cur.isSelf });
    cur = null;
  };

  for (const seg of segments) {
    const text = (seg?.text || "").trim();
    if (!text) continue;
    const { label, isSelf } = resolveSpeakerLabel(seg, selfName);
    const ts = typeof seg?.timestamp === "number" ? seg.timestamp : null;

    if (cur) {
      const speakerChanged = label !== cur.label;
      const gap = ts !== null && cur.last !== null && ts - cur.last >= gapSeconds;
      const longEnough = cur.text.length >= softCharLimit && endsSentence(cur.text);
      if (speakerChanged || gap || longEnough) flush();
    }

    if (!cur) cur = { label, text, isSelf, last: ts };
    else {
      cur.text = `${cur.text} ${text}`.replace(/\s+/g, " ");
      cur.last = ts;
    }
  }
  flush();
  return out;
}

// Flat string form ("Label: text" paragraphs separated by a blank line) for copy,
// export, or feeding an LLM.
export function formatTranscriptForReading(
  segments: TranscriptSegment[],
  opts: GroupOptions = {}
): string {
  return groupTranscriptForReading(segments, opts)
    .map((p) => `${p.label}: ${p.text}`)
    .join("\n\n");
}
