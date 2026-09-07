import { useTranslation } from "react-i18next";
import { Loader2, Check, X, FileText } from "lucide-react";
import { cn } from "../lib/utils";
import { useUploadJobStore, clearUploadJob } from "../../stores/uploadJobStore";
import { useLiveEta } from "../../hooks/useLiveEta";
import { formatEtaLabel } from "../../utils/formatEta";

interface TranscriptionJobIndicatorProps {
  // Open the finished note in the notes view.
  onOpenNote: (noteId: number, folderId: number | null) => void;
  // Hidden on the Upload view itself, which shows the same job inline.
  suppressed?: boolean;
}

/**
 * A small, always-mounted card that surfaces the detached upload transcription
 * from any tab: live progress + ETA while it runs, then a one-click path to the
 * finished note. This is what makes background transcription visible — the user
 * can leave the Upload tab and still see the work and its result.
 */
export default function TranscriptionJobIndicator({
  onOpenNote,
  suppressed,
}: TranscriptionJobIndicatorProps) {
  const { t } = useTranslation();
  const job = useUploadJobStore((s) => s.job);
  const liveEta = useLiveEta(job?.status === "transcribing" ? job.etaSeconds : null);

  if (!job || suppressed) return null;

  const isTranscribing = job.status === "transcribing";
  const isComplete = job.status === "complete";
  const isError = job.status === "error";

  return (
    <div
      className="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)]"
      style={{ animation: "float-up 0.25s ease-out" }}
      role="status"
      aria-live="polite"
    >
      <div className="rounded-xl border border-border bg-background/95 backdrop-blur shadow-lg px-3.5 py-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
              isComplete && "bg-emerald-500/15 text-emerald-500",
              isError && "bg-destructive/15 text-destructive",
              isTranscribing && "bg-primary/15 text-primary"
            )}
          >
            {isTranscribing && <Loader2 className="h-4 w-4 animate-spin" />}
            {isComplete && <Check className="h-4 w-4" />}
            {isError && <X className="h-4 w-4" />}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground/80">
              {isTranscribing && t("notes.upload.indicator.transcribing")}
              {isComplete && t("notes.upload.indicator.ready")}
              {isError && t("notes.upload.transcriptionFailed")}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-foreground/45">
              {isComplete ? job.noteTitle || job.fileName : job.fileName}
            </p>

            {isTranscribing && (
              <>
                <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
                  <div
                    className="h-full rounded-full bg-primary/60 transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.min(job.progress, 100)}%` }}
                  />
                </div>
                {liveEta !== null && (
                  <p className="mt-1 text-[11px] font-medium text-primary/70">
                    {formatEtaLabel(t, liveEta)}
                  </p>
                )}
              </>
            )}

            {isComplete && (
              <button
                type="button"
                onClick={() => {
                  if (job.noteId != null) onOpenNote(job.noteId, job.folderId);
                  clearUploadJob();
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
              >
                <FileText className="h-3 w-3" />
                {t("notes.upload.indicator.openNote")}
              </button>
            )}
          </div>

          {!isTranscribing && (
            <button
              type="button"
              onClick={clearUploadJob}
              aria-label={t("common.dismiss")}
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-foreground/30 hover:text-foreground/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
