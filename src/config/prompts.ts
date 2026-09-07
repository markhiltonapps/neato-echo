import { resolvePrompt } from "./prompts/index";

export {
  resolvePrompt,
  getDefaultPromptText,
  appendDictionarySuffix,
  appendScreenContextSuffix,
  wrapCleanupTranscript,
} from "./prompts/index";
export { PROMPT_KINDS, PROMPT_KIND_LIST, type PromptKind } from "./prompts/registry";
export { detectAgentName } from "./agentDetection";

export function getCleanupSystemPrompt(
  agentName: string | null,
  customDictionary?: string[],
  language?: string,
  uiLanguage?: string
): string {
  return resolvePrompt("cleanup", { agentName, language, customDictionary, uiLanguage });
}

export function getWordBoost(customDictionary?: string[]): string[] {
  if (!customDictionary || customDictionary.length === 0) return [];
  return customDictionary.filter((w) => w.trim());
}

// Kept deliberately terse: this whole block rides in the system prompt and is
// re-processed on every turn (and every tool round). On a local model that
// prompt-processing time is the bulk of the latency, so brevity here is speed.
// Trim wording, not the correctness-critical directives (calendar verbatim
// times, availability facts are authoritative).
const TOOL_INSTRUCTIONS: Record<string, string> = {
  search_notes: "Search the user's past notes and meetings before answering from memory.",
  list_recorded_meetings:
    "The user's own RECORDED meetings — past calls they captured in this app, with transcripts and summaries. Use ONLY for recorded/past meetings, e.g. 'summarize the meetings I recorded yesterday', 'recap last week's calls'. Do NOT use it for the user's calendar or schedule (upcoming/scheduled meetings) — that is get_calendar_events. Convert phrasing to start/end YYYY-MM-DD in local time (same date twice for one day) using the current date below; prefer each meeting's saved summary, else its transcript excerpt.",
  get_note:
    "Fetch a note's full content by ID — use the current note's ID from context if given, else search_notes first.",
  create_note:
    "Create a note when asked to write or draft one. If it belongs in a folder, call list_folders first and reuse a fitting existing folder (tolerant of case/plurals/typos); only name a new folder when none fits.",
  update_note:
    "Modify an existing note's title, content, or folder — use the current note's ID from context if given, else search_notes first. When moving to a folder, reuse a fitting one via list_folders.",
  list_folders:
    "List folders before create_note/update_note so you reuse a fitting folder instead of duplicating one.",
  web_search: "Use for current events or facts you're unsure of.",
  copy_to_clipboard: "Use when asked to copy something to the clipboard.",
  get_calendar_events:
    "The user's CALENDAR / SCHEDULE — upcoming and scheduled meetings and events. ALWAYS use this (never list_recorded_meetings) for any question about what is on the schedule: 'what meetings do I have today/tomorrow/this week', \"what's on my calendar\", 'my next meeting'. Each event has startLocal/endLocal already converted to local time (DST-correct) — quote those verbatim; never recompute times from the raw start/end fields.",
  get_calendar_availability:
    "Use when the user asks when they're free. Pass timezone-aware RFC3339 start/end, deriving each date's offset from the IANA zone (account for DST). Treat returned slots as authoritative — use them exactly; never recalculate, merge, or invent. For a broad multi-day request without hours, ask which hours per day, then call once per day. Describe results as 'no scheduled conflicts found', and never infer event details from availability.",
};

const twoDigits = (value: number): string => String(value).padStart(2, "0");

function formatLocalRfc3339(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${offsetSign}${twoDigits(Math.floor(absoluteOffset / 60))}:${twoDigits(absoluteOffset % 60)}`;
  return (
    `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}` +
    `T${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}:${twoDigits(date.getSeconds())}${offset}`
  );
}

function getLocalCalendarContext(): string {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return `Current local date and time: ${formatLocalRfc3339(now)}. IANA time zone: ${timeZone}.`;
}

export function getAgentSystemPrompt(availableTools?: string[], noteContext?: string): string {
  let prompt = resolvePrompt("chatAgent", { agentName: null });

  if (availableTools && availableTools.length > 0) {
    const toolLines = availableTools.map((name) => TOOL_INSTRUCTIONS[name]).filter(Boolean);
    if (toolLines.length > 0) {
      // Small local models otherwise refuse with "I can't access your calendar
      // / personal data" instead of calling the tool. These tools read the
      // user's OWN data, which they've connected and authorized.
      prompt +=
        "\n\nYou have tools that read the user's own notes, recorded meetings, and connected " +
        "calendar — their own data, which they have connected and authorized you to use. Never " +
        "say you cannot access their calendar, schedule, notes, or personal data: when a question " +
        "needs any of it, call the appropriate tool instead of refusing or guessing. " +
        toolLines.join(" ");
    }
    if (
      availableTools.includes("get_calendar_availability") ||
      availableTools.includes("list_recorded_meetings")
    ) {
      prompt += "\n\n" + getLocalCalendarContext();
    }
  }

  if (noteContext) {
    prompt +=
      "\n\nBelow are notes from the user's library that may be relevant. " +
      "Reference them naturally if they help answer the question.\n\n" +
      noteContext;
  }

  return prompt;
}
