import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { Loader2, FileText } from "lucide-react";
import { useActionProcessingStore, selectActiveAction } from "../../stores/actionProcessingStore";
import { useElapsedSeconds } from "../../hooks/useElapsedSeconds";
import { formatElapsedClock, formatEnhanceRemaining } from "../../utils/formatEta";

interface NoteEnhanceIndicatorProps {
  onOpenNote: (noteId: number) => void;
  // The note currently open in the notes view, if any — the card is hidden for
  // it since that view already shows the in-progress state inline.
  viewingNoteId?: number | null;
}

/**
 * A small card shown while a note is being enhanced in the background, so the
 * work is visible from any tab (previously the only signal was a faded button
 * on the note itself). Enhancement already survives navigation; this just makes
 * it legible. Completion updates the note in place and errors toast, so this
 * only needs to cover the in-progress state.
 */
export default function NoteEnhanceIndicator({
  onOpenNote,
  viewingNoteId,
}: NoteEnhanceIndicatorProps) {
  const { t } = useTranslation();
  // selectActiveAction returns a fresh object; without a shallow-equal wrapper
  // that reads as a new snapshot every render and loops (React #185).
  const active = useActionProcessingStore(useShallow(selectActiveAction));
  const elapsed = useElapsedSeconds(active?.startedAt ?? null);

  if (!active) return null;
  if (viewingNoteId != null && viewingNoteId === active.noteId) return null;

  return (
    <div
      className="w-72 max-w-[calc(100vw-2rem)]"
      style={{ animation: "float-up 0.25s ease-out" }}
      role="status"
      aria-live="polite"
    >
      <div className="rounded-xl border border-border bg-background/95 backdrop-blur shadow-lg px-3.5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground/80">
              {active.actionName || t("notes.enhance.working")}
            </p>
            <p className="mt-0.5 text-[11px] text-foreground/45 tabular-nums">
              {formatEnhanceRemaining(t, elapsed, active.estimatedSeconds)} ·{" "}
              {formatElapsedClock(elapsed)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenNote(active.noteId)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
          >
            <FileText className="h-3 w-3" />
            {t("notes.enhance.viewNote")}
          </button>
        </div>
      </div>
    </div>
  );
}
