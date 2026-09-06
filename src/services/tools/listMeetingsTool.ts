import type { ToolDefinition, ToolResult } from "./ToolRegistry";
import { parseTranscriptSegments } from "../../utils/parseTranscriptSegments";

// Per-meeting caps so a multi-meeting answer still fits the model's context.
const MAX_SUMMARY_LENGTH = 1200;
const MAX_TRANSCRIPT_EXCERPT = 1500;
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cross-meeting lookup by date. Backs questions like "summarize all my
 * meetings yesterday" — meetings are notes that carry a transcript, so this
 * returns one entry per meeting in the day range with the saved summary when
 * there is one, otherwise a transcript excerpt to summarize from.
 */
export const listMeetingsTool: ToolDefinition = {
  name: "list_meetings",
  description:
    "List the user's recorded meetings within a date range, newest first. Use this for questions that span multiple meetings, like 'what meetings did I have last week' or 'summarize all my meetings yesterday'. Dates are YYYY-MM-DD in the user's local time; omit both to get the most recent meetings. Returns each meeting's title, date, duration, saved summary (if any), and a transcript excerpt.",
  parameters: {
    type: "object",
    properties: {
      start: {
        type: "string",
        description:
          "Start of the range (inclusive), YYYY-MM-DD in local time. Omit to not bound the start.",
      },
      end: {
        type: "string",
        description:
          "End of the range (inclusive), YYYY-MM-DD in local time. Omit to not bound the end.",
      },
      limit: {
        type: "number",
        description: "Maximum meetings to return (default 25, max 100).",
      },
    },
    required: [],
    additionalProperties: false,
  },
  readOnly: true,

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const start = typeof args.start === "string" && args.start.trim() ? args.start.trim() : null;
    const end = typeof args.end === "string" && args.end.trim() ? args.end.trim() : null;
    const limit = typeof args.limit === "number" ? args.limit : undefined;

    for (const [label, value] of [
      ["start", start],
      ["end", end],
    ] as const) {
      if (value && !YYYY_MM_DD.test(value)) {
        return {
          success: false,
          data: null,
          displayText: `Invalid ${label} date "${value}". Use YYYY-MM-DD.`,
        };
      }
    }

    try {
      const notes = await window.electronAPI.listMeetingsByDate(start, end, limit);

      const results = notes.map((note) => {
        const summary = note.enhanced_content?.trim()
          ? note.enhanced_content.slice(0, MAX_SUMMARY_LENGTH)
          : null;
        return {
          id: note.id,
          title: note.title,
          date: note.created_at,
          durationSeconds: note.audio_duration_seconds ?? null,
          summary,
          // Give the model something to summarize from when no saved summary
          // exists; skip it when a summary is already present to save context.
          transcriptExcerpt: summary ? null : transcriptExcerpt(note.transcript),
        };
      });

      return {
        success: true,
        data: results,
        displayText: rangeSummary(results.length, start, end),
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        displayText: `Failed to list meetings: ${(error as Error).message}`,
      };
    }
  },
};

function transcriptExcerpt(raw: string | null): string | null {
  if (!raw) return null;
  const segments = parseTranscriptSegments(raw);
  if (segments.length === 0) return null;
  const lines: string[] = [];
  let total = 0;
  for (const s of segments) {
    const text = s.text?.trim();
    if (!text) continue;
    const label = s.source === "mic" || s.speaker === "you" ? "You" : s.speakerName || "Speaker";
    const line = `${label}: ${text}`;
    if (total + line.length > MAX_TRANSCRIPT_EXCERPT) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

function rangeSummary(count: number, start: string | null, end: string | null): string {
  const noun = `${count} meeting${count === 1 ? "" : "s"}`;
  if (start && end) return `Found ${noun} between ${start} and ${end}`;
  if (start) return `Found ${noun} on or after ${start}`;
  if (end) return `Found ${noun} on or before ${end}`;
  return `Found ${noun}`;
}
