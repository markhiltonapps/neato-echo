import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar, Mic, FileText, Hash, ChevronRight, AudioLines } from "lucide-react";
import UpcomingMeetings from "./UpcomingMeetings";
import { useUpcomingEvents } from "../hooks/useUpcomingEvents";
import { formatRelativeTime } from "../utils/dateFormatting";
import type { NoteItem, TranscriptionItem } from "../types/electron";

interface HomeDashboardProps {
  history: TranscriptionItem[];
  wordsUsed: number | null;
  onOpenDictation: () => void;
  onOpenNotes: () => void;
  onOpenNote: (noteId: number, folderId: number | null) => void;
  onOpenIntegrations: () => void;
}

function isRecording(note: NoteItem): boolean {
  return (
    note.note_type === "meeting" ||
    note.note_type === "upload" ||
    note.audio_duration_seconds != null
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-foreground/45 dark:text-foreground/35">
        <Icon size={13} />
        <span className="text-[11px] font-medium uppercase tracking-wide truncate">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="flex items-center gap-0.5 text-xs font-medium text-primary/70 transition-colors hover:text-primary"
        >
          {actionLabel}
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

export default function HomeDashboard({
  history,
  wordsUsed,
  onOpenDictation,
  onOpenNotes,
  onOpenNote,
  onOpenIntegrations,
}: HomeDashboardProps) {
  const { t } = useTranslation();
  const { events, isLoading: eventsLoading, isConnected } = useUpcomingEvents();

  const [recordings, setRecordings] = useState<NoteItem[]>([]);
  const [recordingCount, setRecordingCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void window.electronAPI
      ?.getNotes?.(null, 100, null, null)
      .then((notes) => {
        if (cancelled || !Array.isArray(notes)) return;
        const recs = notes
          .filter((n) => !n.deleted_at && isRecording(n))
          .sort(
            (a, b) =>
              new Date(b.created_at || b.updated_at || 0).getTime() -
              new Date(a.created_at || a.updated_at || 0).getTime()
          );
        setRecordingCount(recs.length);
        setRecordings(recs.slice(0, 5));
      })
      .catch(() => {
        /* best-effort; the dashboard still shows the rest */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recentNarrations = useMemo(
    () => (history || []).filter((h) => h.status !== "discarded").slice(0, 4),
    [history]
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-4">
      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={Calendar} label={t("home.dash.statUpcoming")} value={String(events.length)} />
        <StatTile icon={Mic} label={t("home.dash.statRecordings")} value={String(recordingCount)} />
        <StatTile
          icon={AudioLines}
          label={t("home.dash.statNarrations")}
          value={String((history || []).length)}
        />
        <StatTile
          icon={Hash}
          label={t("home.dash.statWords")}
          value={(wordsUsed ?? 0).toLocaleString()}
        />
      </div>

      {/* What's next — upcoming meetings */}
      <section>
        <SectionHeader title={t("home.dash.upcomingTitle")} />
        <UpcomingMeetings
          events={events}
          isLoading={eventsLoading}
          isConnected={isConnected}
          onConnectCalendar={onOpenIntegrations}
        />
      </section>

      {/* Recent recordings */}
      <section>
        <SectionHeader
          title={t("home.dash.recentRecordings")}
          actionLabel={t("home.dash.viewAll")}
          onAction={onOpenNotes}
        />
        {recordings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-foreground/40">
            {t("home.dash.noRecordings")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {recordings.map((note, i) => (
              <button
                key={note.id}
                onClick={() => onOpenNote(note.id, note.folder_id)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-foreground/4 dark:hover:bg-white/4 ${
                  i > 0 ? "border-t border-border/60" : ""
                }`}
              >
                <Mic size={14} className="shrink-0 text-foreground/30" />
                <span className="flex-1 truncate text-[13px] text-foreground/85">
                  {note.title || t("notes.list.untitled")}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-foreground/35">
                  {formatRelativeTime(note.created_at || note.updated_at, t)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Recent narrations preview */}
      <section>
        <SectionHeader
          title={t("home.dash.recentNarrations")}
          actionLabel={t("home.dash.viewAll")}
          onAction={onOpenDictation}
        />
        {recentNarrations.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-foreground/40">
            {t("home.dash.noNarrations")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {recentNarrations.map((item, i) => (
              <button
                key={item.id}
                onClick={onOpenDictation}
                className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-foreground/4 dark:hover:bg-white/4 ${
                  i > 0 ? "border-t border-border/60" : ""
                }`}
              >
                <FileText size={14} className="mt-0.5 shrink-0 text-foreground/30" />
                <span className="flex-1 truncate text-[13px] text-foreground/80">
                  {item.text || item.raw_text || ""}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-foreground/35">
                  {formatRelativeTime(item.created_at || item.timestamp, t)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
