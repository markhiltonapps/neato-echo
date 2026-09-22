// Pure title helpers, kept free of store/Vite imports so they stay unit-testable.

// Titles a fresh recording keeps until renamed. Anything else is a deliberate
// name (a calendar subject, a manual rename) and must never be overwritten.
const DEFAULT_RECORDING_TITLES = new Set([
  "",
  "new note",
  "untitled note",
  "untitled",
  "new recording",
]);

export function isDefaultRecordingTitle(title?: string | null): boolean {
  return DEFAULT_RECORDING_TITLES.has((title ?? "").trim().toLowerCase());
}

// Offline fallback: the transcript's first non-empty line, capped to a short
// phrase. Not as clean as an LLM title, but always better than "Untitled Note".
export function deriveTitleFromText(text: string): string {
  const line =
    (text || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s.length > 0) || "";
  if (!line) return "";
  const words = line.split(/\s+/).slice(0, 8).join(" ");
  const trimmed = words.replace(/[\s.,;:!?"'“”‘’\-–—]+$/u, "");
  return trimmed.length > 60 ? `${trimmed.slice(0, 57).trimEnd()}…` : trimmed;
}
