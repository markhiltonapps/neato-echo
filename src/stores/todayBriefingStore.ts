import { create } from "zustand";
import type { CalendarEvent } from "../types/calendar";
import reasoningService from "../services/ReasoningService";
import {
  getSettings,
  selectResolvedNoteFormatting,
  selectIsCloudNoteFormattingMode,
} from "./settingsStore";
import { buildNoteFormattingOverrides } from "../helpers/noteFormattingOverrides";

/**
 * A short, per-meeting "prep line" for today's calendar, generated once per day
 * from the user's own past notes and meetings. Runs on the noteFormatting scope
 * (the same local model that writes summaries) and degrades to an agenda-only
 * card when no model is configured or generation fails — it never blocks Home.
 */

export type BriefingStatus = "idle" | "loading" | "ready" | "error";

interface TodayBriefingState {
  signature: string | null;
  status: BriefingStatus;
  preps: Record<string, string>;
}

export const useTodayBriefingStore = create<TodayBriefingState>()(() => ({
  signature: null,
  status: "idle",
  preps: {},
}));

const MAX_MEETINGS = 6;
const MAX_RELATED_PER_MEETING = 2;
const MAX_SNIPPET_CHARS = 240;
const MAX_PREP_WORDS = 18;

let inFlight = false;

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Today's timed events, soonest first (all-day events are skipped — no prep). */
export function todaysEvents(events: CalendarEvent[]): CalendarEvent[] {
  const now = new Date();
  const key = localDateKey(now);
  return events
    .filter((e) => !e.is_all_day && e.start_time)
    .filter((e) => localDateKey(new Date(e.start_time)) === key)
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
}

function signatureFor(events: CalendarEvent[]): string {
  return localDateKey(new Date()) + "|" + events.map((e) => `${e.id}@${e.start_time}`).join(",");
}

function clampWords(text: string, maxWords: number): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ");
  return words.length <= maxWords ? words.join(" ") : words.slice(0, maxWords).join(" ") + "…";
}

// Lenient: the local model sometimes wraps the array in prose or a code fence.
function parsePrepArray(raw: string): Array<{ id?: string; prep?: string }> {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const SYSTEM_PROMPT =
  "You help someone prepare for their day. For each meeting, write ONE short, specific " +
  "prep line (max 18 words) grounded in the related notes provided; if nothing useful is " +
  "known, give a brief neutral prep. Do not invent facts. Return ONLY a JSON array of " +
  '{"id","prep"} objects — no other text.';

export async function ensureTodayBriefing(events: CalendarEvent[]): Promise<void> {
  const today = todaysEvents(events).slice(0, MAX_MEETINGS);
  if (today.length === 0) {
    useTodayBriefingStore.setState({ signature: null, status: "idle", preps: {} });
    return;
  }

  const signature = signatureFor(today);
  const current = useTodayBriefingStore.getState();
  if (current.signature === signature && current.status !== "error") return;
  if (inFlight) return;

  const settings = getSettings();
  const noteFormatting = selectResolvedNoteFormatting(settings);
  const isCloudMode = selectIsCloudNoteFormattingMode(settings);
  // No model wired for this scope (common for users who upgraded before the
  // scope was seeded): show the agenda without prep lines.
  if (!noteFormatting.model && !isCloudMode) {
    useTodayBriefingStore.setState({ signature, status: "error", preps: {} });
    return;
  }

  inFlight = true;
  useTodayBriefingStore.setState({ signature, status: "loading", preps: {} });

  try {
    const meetings = await Promise.all(
      today.map(async (event) => {
        const title = event.summary || "Untitled meeting";
        let related: string[] = [];
        try {
          const notes = (await window.electronAPI.searchNotes?.(title, MAX_RELATED_PER_MEETING)) ?? [];
          related = notes
            .map((n) => {
              const body = (n.enhanced_content || n.content || n.transcript || "").trim();
              return body ? `${n.title}: ${body.slice(0, MAX_SNIPPET_CHARS)}` : n.title;
            })
            .filter(Boolean);
        } catch {
          related = [];
        }
        return { id: event.id, title, related };
      })
    );

    const modelId = noteFormatting.model;
    const overrides = buildNoteFormattingOverrides(noteFormatting, isCloudMode);
    const raw = await reasoningService.processText(JSON.stringify(meetings), modelId, null, {
      systemPrompt: SYSTEM_PROMPT,
      temperature: 0.3,
      disableThinking: settings.noteFormattingDisableThinking,
      ...overrides,
    });

    // A newer day/agenda superseded this run while it was in flight.
    if (useTodayBriefingStore.getState().signature !== signature) return;

    const preps: Record<string, string> = {};
    for (const item of parsePrepArray(raw)) {
      if (item && typeof item.id === "string" && typeof item.prep === "string" && item.prep.trim()) {
        preps[item.id] = clampWords(item.prep, MAX_PREP_WORDS);
      }
    }
    useTodayBriefingStore.setState({
      signature,
      status: Object.keys(preps).length > 0 ? "ready" : "error",
      preps,
    });
  } catch {
    if (useTodayBriefingStore.getState().signature === signature) {
      useTodayBriefingStore.setState({ status: "error" });
    }
  } finally {
    inFlight = false;
  }
}
