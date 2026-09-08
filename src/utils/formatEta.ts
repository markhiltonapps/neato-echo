/**
 * Rounds a jittery raw ETA (seconds) into a calm, human label: whole minutes
 * from ~a minute up, 5-second steps below that. Kept out of components so the
 * always-mounted transcription indicator and the lazy Upload view can share it
 * without pulling one into the other's bundle.
 */
export function formatEtaLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  etaSeconds: number
): string {
  if (etaSeconds >= 55) {
    return t("notes.upload.etaMinutes", { minutes: Math.round(etaSeconds / 60) });
  }
  const seconds = Math.max(5, Math.round(etaSeconds / 5) * 5);
  return t("notes.upload.etaSeconds", { seconds });
}

/** "0:42" / "2:05" elapsed clock. */
export function formatElapsedClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Soft remaining-time label for unstreamed enhancement: a rough countdown from
 * the estimate, falling back to "wrapping up" once the estimate is spent so a
 * slow run never shows a stuck or negative ETA.
 */
export function formatEnhanceRemaining(
  t: (key: string, options?: Record<string, unknown>) => string,
  elapsedSeconds: number,
  estimatedSeconds: number | undefined
): string {
  if (!estimatedSeconds || elapsedSeconds >= estimatedSeconds - 3) {
    return t("notes.enhance.almostDone");
  }
  return formatEtaLabel(t, estimatedSeconds - elapsedSeconds);
}
