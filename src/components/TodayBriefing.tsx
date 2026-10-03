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
    <div className="max-w-3xl mx-auto w-full mb-4">
      <div className="relative overflow-hidden rounded-2xl border border-border/70 dark:border-white/8 p-5 pb-1.5 bg-gradient-to-b from-brand-teal-soft to-transparent shadow-[0_22px_55px_-34px_rgba(0,0,0,0.55)]">
        <div className="relative mb-3.5 flex items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-brand-warm-2 to-brand-warm text-white shadow-[0_8px_18px_-8px_var(--color-brand-warm)]">
            <Sparkles size={15} />
          </span>
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            {t("home.briefing.title")}
          </h2>
          <span className="font-brand rounded-md border border-brand-teal/25 bg-brand-teal-soft px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.14em] text-brand-teal">
            {t("home.briefing.meetingCount", { count: today.length })}
          </span>
          {isLoadingPreps && (
            <Loader2 size={13} className="ml-auto animate-spin text-muted-foreground/50" />
          )}
        </div>

        <ul>
          {today.map((event, i) => {
            const joinUrl = getMeetingJoinUrl(event);
            const prep = preps[event.id];
            const isNext = i === nextIndex;
            return (
              <li
                key={event.id}
                className="relative grid grid-cols-[62px_1fr_auto] items-center gap-4 rounded-xl py-3 pl-4 pr-1.5 transition-colors hover:bg-foreground/[0.035] dark:hover:bg-white/[0.03]"
              >
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-3 top-0 h-px bg-border/60 dark:bg-white/[0.06]"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-1 top-3.5 bottom-3.5 w-[2px] rounded-full",
                    isNext
                      ? "bg-brand-teal shadow-[0_0_10px_var(--color-brand-teal)]"
                      : "bg-border dark:bg-white/15"
                  )}
                />
                <span
                  className={cn(
                    "font-brand text-[13px] font-bold tabular-nums tracking-tight",
                    isNext ? "text-brand-teal" : "text-foreground/70"
                  )}
                >
                  {formatTime(i18n.language, event.start_time)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-tight text-foreground">
                      {event.summary || t("upcoming.untitledEvent")}
                    </p>
                    {isNext && (
                      <span className="font-brand shrink-0 rounded-full border border-brand-teal/40 px-2 py-[3px] text-[9px] font-bold uppercase tracking-[0.14em] text-brand-teal">
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
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-gradient-to-b from-brand-warm-2 to-brand-warm px-3 py-1.5 text-[12px] font-semibold text-white shadow-[0_8px_18px_-10px_var(--color-brand-warm)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-warm/40"
                      >
                        <Video size={12} />
                        {t("home.briefing.join")}
                      </button>
                    )}
                  </div>
                  {prep ? (
                    <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{prep}</p>
                  ) : isLoadingPreps ? (
                    <div className="mt-1.5 h-2 w-2/3 animate-pulse rounded bg-brand-teal/15" />
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
