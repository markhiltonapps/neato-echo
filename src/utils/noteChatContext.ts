// Builds the context block the embedded note/meeting chat prepends to its
// system prompt. Two things here matter for correctness, and both were bugs:
//
//  1. The transcript must arrive as readable, speaker-labeled text — NOT the
//     raw serialized JSON segments. The JSON carried per-segment timestamps and
//     speaker metadata that ballooned the prompt (re-sent every turn), which
//     both slowed responses and overflowed smaller chat-model context windows,
//     surfacing to the user as a reply that errored out.
//  2. Meeting notes frequently have an empty title, so "Title: " told the model
//     nothing and it couldn't say which meeting it was in. A title fallback and
//     an explicit Date line make the current note identifiable every time.

export const MAX_TRANSCRIPT_CONTEXT_CHARS = 48000;

export interface NoteChatContextInput {
  noteId: number | null;
  folderId: number | null;
  title: string;
  /** ISO/local date string from the note row; identifies an untitled meeting. */
  createdAt?: string | null;
  noteType?: string | null;
  content: string;
  /** Readable, speaker-labeled transcript text — never raw JSON segments. */
  transcript?: string;
}

/**
 * Cap an over-long transcript by keeping the opening and the closing, eliding
 * the middle. A "bottom line this meeting" question needs the intro and the
 * wrap-up far more than the middle, so head+tail beats a plain head truncation.
 */
export function capTranscript(
  text: string,
  max = MAX_TRANSCRIPT_CONTEXT_CHARS
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const marker = "\n\n… [middle of transcript trimmed for length] …\n\n";
  const budget = Math.max(0, max - marker.length);
  const head = Math.floor(budget * 0.6);
  const tail = budget - head;
  return {
    text: text.slice(0, head).trimEnd() + marker + text.slice(text.length - tail).trimStart(),
    truncated: true,
  };
}

export function buildNoteChatContext(input: NoteChatContextInput): string {
  const { noteId, folderId, title, createdAt, noteType, content, transcript } = input;

  const displayTitle =
    title?.trim() || (noteType === "meeting" ? "Untitled meeting" : "Untitled note");

  const lines: string[] = [`Note ID: ${noteId}`];
  if (folderId != null) lines.push(`Folder ID: ${folderId}`);
  lines.push(`Title: ${displayTitle}`);
  if (createdAt) lines.push(`Date: ${createdAt}`);
  if (content?.trim()) lines.push(`Content:\n${content.trim()}`);

  if (transcript?.trim()) {
    const { text, truncated } = capTranscript(transcript.trim());
    lines.push(`\nTranscript${truncated ? " (trimmed for length)" : ""}:\n${text}`);
  }

  return lines.join("\n");
}
