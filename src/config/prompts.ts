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
  list_meetings:
    "For questions spanning multiple meetings or a time period ('meetings last week', 'summarize yesterday's meetings'), convert the phrasing to start/end YYYY-MM-DD in local time (same date twice for one day) using the current date below. Prefer each meeting's saved summary, else its transcript excerpt. Works even when no specific meeting is open.",
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
    "Check the user's schedule or upcoming events. Each event has startLocal/endLocal already converted to local time (DST-correct) — quote those verbatim; never recompute times from the raw start/end fields.",
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
      prompt += "\n\nYou have access to tools. " + toolLines.join(" ");
    }
    if (
      availableTools.includes("get_calendar_availability") ||
      availableTools.includes("list_meetings")
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
