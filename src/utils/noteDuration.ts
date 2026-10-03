// Best-effort recording length in seconds for a note.
//
// Prefers the duration persisted on stop (since 1.1.35). For older recordings
// with no stored duration, it derives one from the transcript's timestamp span
// so the notes list can still flag short/accidental recordings. Stored segment
// timestamps are either epoch milliseconds (live finals) or relative seconds
// (after diarization normalization), so the magnitude decides the unit. Returns
// null when there is no reliable signal — better no badge than a wrong one.
export function noteDurationSeconds(note: {
  audio_duration_seconds?: number | null;
  transcript?: string | null;
}): number | null {
  if (note.audio_duration_seconds != null && note.audio_duration_seconds > 0) {
    return note.audio_duration_seconds;
  }

  const raw = note.transcript;
  if (!raw || raw[0] !== "[") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (const seg of parsed) {
    const t = (seg as { timestamp?: unknown })?.timestamp;
    if (typeof t === "number" && Number.isFinite(t)) {
      if (t < min) min = t;
      if (t > max) max = t;
      count += 1;
    }
  }
  if (count < 2) return null;

  const span = max - min;
  // Epoch-ms values are ~1.7e12; relative seconds for even a long meeting stay
  // well under 1e5, so this threshold separates the two units cleanly.
  const seconds = max > 1e10 ? span / 1000 : span;
  if (!(seconds > 0) || seconds > 24 * 3600) return null;
  return Math.round(seconds);
}

export function isShortRecordingDuration(seconds: number | null): boolean {
  return seconds != null && seconds > 0 && seconds < 5 * 60;
}
