import type { RecordingMeta } from "./models";

// Compose the final summarize prompt from a style prompt + the transcript.
export function summarizePrompt(stylePrompt: string, transcript: string): string {
  return stylePrompt + "\n\nTranscript:\n\n" + transcript;
}

// Turn a plain-English scenario description into a robust summary instruction (custom styles).
export function authorCustomStylePrompt(description: string): string {
  return (
    "You are a prompt engineer. Turn the user's description of their recording scenario into a single, concise, " +
    "robust instruction for summarizing such a recording. Output ONLY the instruction — no preamble, no quotes.\n\n" +
    "Scenario: " +
    description
  );
}

export const titlePrompt = (summaryText: string): string =>
  "Give a concise 3–6 word title in Title Case for this meeting, capturing its main theme. " +
  "Reply with the title only — no quotes, no trailing punctuation, no preamble.\n\n" +
  summaryText;

// Build the shared LLM context from recordings that have notes (pure over metadata).
export function buildContext(recs: RecordingMeta[], perTranscriptChars = 2500, capChars = 40000): string {
  const blocks = recs
    .filter((r) => (r.summary && r.summary.trim()) || (r.transcript && r.transcript.trim()))
    .map((r) => {
      let b = `### ${r.name} — ${new Date(r.date).toLocaleString()}`;
      if (r.summary?.trim()) b += `\nSummary: ${r.summary.trim()}`;
      if (r.transcript?.trim()) b += `\nTranscript: ${r.transcript.trim().slice(0, perTranscriptChars)}`;
      return b;
    });
  let ctx = blocks.join("\n\n");
  if (ctx.length > capChars) ctx = ctx.slice(0, capChars) + "\n\n[Older recordings omitted for length.]";
  return ctx;
}

export const chatSystem = (context: string): string =>
  "You are Neddy, a helpful assistant that answers questions about the user's own recorded meetings and notes. " +
  "Use ONLY the recordings below. Reference the recording name when relevant. If the answer isn't in them, say you don't see it in the recordings.\n\n" +
  "=== RECORDINGS ===\n" +
  context;

export const insightsSystem = (context: string): string =>
  "You are Neddy, analyzing the user's own recorded meetings. Return concise markdown with exactly three sections: " +
  "'## Action items' — every open action/decision/follow-up aggregated across all recordings as a checklist, each with the recording name in parentheses (write 'None open.' if there are none); " +
  "'## Recurring themes' — topics that come up repeatedly, as short bullets; " +
  "'## Digest' — 2–3 sentences on what's been happening lately. " +
  "Keep every action item to a single concise line and never repeat the same clarification twice. Use only the recordings below.\n\n" +
  "=== RECORDINGS ===\n" +
  context;
