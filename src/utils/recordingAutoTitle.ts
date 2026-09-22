import { getSettings } from "../stores/settingsStore";
import { isDefaultRecordingTitle, deriveTitleFromText } from "./recordingTitleText";
import logger from "./logger";

export { isDefaultRecordingTitle, deriveTitleFromText } from "./recordingTitleText";

/**
 * Auto-name a freshly stopped recording whose title is still a default, so the
 * notes list doesn't fill with "Untitled Note". Derives the title from the
 * transcript's opening line — deliberately offline and synchronous-fast: an LLM
 * call here would hang the fire-and-forget path on a slow/unreachable model, and
 * LLM-quality titling already happens through the "Generate Notes" enhancement
 * flow. Never throws, and never overwrites a real (user- or calendar-set) title.
 */
export async function autoTitleRecording(
  noteId: number | null | undefined,
  transcriptText: string,
  currentTitle?: string | null
): Promise<void> {
  try {
    if (noteId == null) return;
    if (!getSettings().autoGenerateNoteTitle) return;
    const text = (transcriptText || "").trim();
    if (!text) return;

    // Read the live title so a rename made during recording is never clobbered;
    // fall back to the title captured at record start if the read fails.
    let liveTitle = currentTitle ?? null;
    try {
      const note = await window.electronAPI?.getNote?.(noteId);
      if (note && typeof note.title === "string") liveTitle = note.title;
    } catch {
      // Keep the captured title.
    }
    if (!isDefaultRecordingTitle(liveTitle)) return;

    const title = deriveTitleFromText(text);
    if (!title) return;

    await window.electronAPI?.updateNote?.(noteId, { title });
  } catch (err) {
    logger.warn("Recording auto-title failed", err);
  }
}
