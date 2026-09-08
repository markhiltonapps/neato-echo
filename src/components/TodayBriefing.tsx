import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Video, Loader2 } from "lucide-react";
import type { CalendarEvent } from "../types/calendar";
import { cn } from "./lib/utils";
import { getMeetingJoinUrl } from "../helpers/meetingJoinUrl";
import { useTodayBriefingStore, ensureTodayBriefing, todaysEvents } from "../stores/todayBriefingStore";

interface TodayBriefingProps {
  events: CalendarEvent[];
  isConnected: boolean;
}

function openJoinUrl(url: string) {
  window.electronAPI?.openExternal?.(url);
}

function formatTime(locale: string, iso: string): string {
  return new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/**
 * A "prepare for your day" card at the top of Home: today's meetings with a
 * short, AI-written prep line each (grounded in past notes), the next one
 * highlighted with a Join button. Renders nothing when no calendar is connected
 * or nothing is scheduled today; the prep lines fill in when ready and are
 * simply omitted if no model is configured.
 */
export default function TodayBriefing({ events, isConnected }: TodayBriefingProps) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => todaysEvents(events), [events]);
  const { preps, status } = useTodayBriefingStore();

  useEffect(() => {
    if (today.length > 0) void ensureTodayBriefing(events);
    // events identity changes when the calendar re-syncs; today is derived.
  }, [events, today.length]);

  if (!isConnected || today.length === 0) return null;

  const now = Date.now();
  const nextIndex = today.findIndex((e) => new Date(e.end_time).getTime() > now);
  const isLoadingPreps = status === "loading";

  return (
    <div className="max-w-3xl mx-auto w-full mb-3">
      <div className="rounded-xl border border-border bg-gradient-to-b from-primary/[0.04] to-transparent p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={15} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">{t("home.briefing.title")}</h2>
          <span className="text-xs text-muted-foreground">
            {t("home.briefing.meetingCount", { count: today.length })}
          </span>
          {isLoadingPreps && (
            <Loader2 size={12} className="ml-auto animate-spin text-muted-foreground/50" />
          )}
        </div>

        <ul className="space-y-2.5">
          {today.map((event, i) => {
            const joinUrl = getMeetingJoinUrl(event);
            const prep = preps[event.id];
            const isNext = i === nextIndex;
            return (
              <li
                key={event.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border-l-2 py-1 pl-3",
                  isNext ? "border-primary/60" : "border-border"
                )}
              >
                <span className="w-14 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {formatTime(i18n.language, event.start_time)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                      {event.summary || t("upcoming.untitledEvent")}
                    </p>
                    {isNext && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {t("home.briefing.next")}
                      </span>
                    )}
                    {joinUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          openJoinUrl(joinUrl);
                          window.electronAPI?.joinCalendarMeeting?.(event.id);
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
                      >
                        <Video size={11} />
                        {t("home.briefing.join")}
                      </button>
                    )}
                  </div>
                  {prep ? (
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{prep}</p>
                  ) : isLoadingPreps ? (
                    <div className="mt-1.5 h-2 w-2/3 animate-pulse rounded bg-foreground/10" />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
