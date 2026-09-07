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
