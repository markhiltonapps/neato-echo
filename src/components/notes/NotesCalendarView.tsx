import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, FileText, Mic } from "lucide-react";
import type { NoteItem } from "../../types/electron";
import { cn } from "../lib/utils";

interface NotesCalendarViewProps {
  onOpenNote: (noteId: number) => void;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const noteTime = (n: NoteItem) => new Date(n.created_at || n.updated_at || 0).getTime();

/**
 * A month calendar of recorded notes/meetings. Days with recordings are marked;
 * clicking one lists that day's notes (click to open). Reads every note once so
 * it can place them by date regardless of which folders are loaded in the tree.
 */
export default function NotesCalendarView({ onOpenNote }: NotesCalendarViewProps) {
  const { t, i18n } = useTranslation();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<string>(() => dayKey(new Date()));

  useEffect(() => {
    let cancelled = false;
    void window.electronAPI
      .getNotes?.(null, 9999, null)
      .then((res) => {
        if (!cancelled) setNotes(res ?? []);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const notesByDay = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    for (const n of notes) {
      const raw = n.created_at || n.updated_at;
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      const list = map.get(key);
      if (list) list.push(n);
      else map.set(key, [n]);
    }
    return map;
  }, [notes]);

  const weeks = useMemo(() => {
    const first = new Date(viewMonth);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    const out: Date[][] = [];
    for (let w = 0; w < 6; w++) {
      const row: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const cell = new Date(gridStart);
        cell.setDate(gridStart.getDate() + w * 7 + d);
        row.push(cell);
      }
      out.push(row);
    }
    return out;
  }, [viewMonth]);

  const weekdayLabels = useMemo(() => {
    // Localized short weekday names, Sun→Sat.
    const base = new Date(2023, 0, 1); // a Sunday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(i18n.language, { weekday: "short" });
    });
  }, [i18n.language]);

  const todayKey = dayKey(new Date());
  const monthLabel = viewMonth.toLocaleDateString(i18n.language, { month: "long", year: "numeric" });
  const selectedNotes = useMemo(
    () => (notesByDay.get(selectedDay) ?? []).slice().sort((a, b) => noteTime(b) - noteTime(a)),
    [notesByDay, selectedDay]
  );

  const shiftMonth = (delta: number) => {
    setViewMonth((m) => {
      const next = new Date(m);
      next.setMonth(m.getMonth() + delta);
      return next;
    });
  };

  const selectedDate = (() => {
    const [y, mo, da] = selectedDay.split("-").map(Number);
    return new Date(y, mo - 1, da);
  })();

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-w-0 p-5">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="font-brand text-sm font-bold uppercase tracking-[0.1em] text-foreground">
            {monthLabel}
          </h2>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => shiftMonth(-1)}
              aria-label={t("notesCalendar.prevMonth")}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                const d = new Date();
                d.setDate(1);
                d.setHours(0, 0, 0, 0);
                setViewMonth(d);
                setSelectedDay(dayKey(new Date()));
              }}
              className="font-brand text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 h-7 rounded-md border border-border/50 dark:border-white/10 text-foreground/70 hover:bg-foreground/5"
            >
              {t("notesCalendar.today")}
            </button>
            <button
              onClick={() => shiftMonth(1)}
              aria-label={t("notesCalendar.nextMonth")}
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {weekdayLabels.map((w) => (
            <div
              key={w}
              className="font-brand text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50 text-center py-1"
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-rows-6 gap-1 flex-1 min-h-0">
          {weeks.map((row, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {row.map((cell) => {
                const key = dayKey(cell);
                const inMonth = cell.getMonth() === viewMonth.getMonth();
                const dayNotes = notesByDay.get(key) ?? [];
                const isToday = key === todayKey;
                const isSelected = key === selectedDay;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(key)}
                    className={cn(
                      "relative flex flex-col items-start rounded-lg border p-1.5 text-left transition-colors min-h-14",
                      isSelected
                        ? "border-brand-teal/50 bg-brand-teal-soft"
                        : "border-border/40 dark:border-white/6 hover:bg-foreground/[0.03]",
                      !inMonth && "opacity-35"
                    )}
                  >
                    <span
                      className={cn(
                        "font-brand text-[11px] tabular-nums leading-none",
                        isToday
                          ? "text-brand-teal font-bold"
                          : isSelected
                            ? "text-foreground"
                            : "text-foreground/60"
                      )}
                    >
                      {cell.getDate()}
                    </span>
                    {dayNotes.length > 0 && (
                      <span className="mt-auto inline-flex items-center gap-1 text-[10px] text-brand-warm font-medium">
                        <Mic size={9} />
                        {dayNotes.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="w-72 shrink-0 border-l border-border/15 dark:border-white/6 flex flex-col min-h-0">
        <div className="px-4 py-3 border-b border-border/15 dark:border-white/6">
          <p className="font-brand text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
            {selectedDate.toLocaleDateString(i18n.language, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <p className="text-[11px] text-muted-foreground/50 mt-0.5">
            {t("notesCalendar.count", { count: selectedNotes.length })}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {selectedNotes.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground/45">
              {t("notesCalendar.empty")}
            </div>
          ) : (
            selectedNotes.map((n) => (
              <button
                key={n.id}
                onClick={() => onOpenNote(n.id)}
                className="flex items-center gap-2 w-full px-2.5 h-8 rounded-md text-left text-foreground/70 hover:bg-foreground/5 hover:text-foreground transition-colors"
              >
                <FileText size={13} className="shrink-0 text-foreground/30" />
                <span className="text-xs truncate flex-1">{n.title || t("notes.list.untitled")}</span>
                <span className="font-brand text-[10px] tabular-nums text-foreground/30 shrink-0">
                  {new Date(n.created_at || n.updated_at || 0).toLocaleTimeString(i18n.language, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
