import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AudioLines, X } from "lucide-react";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { isControlPanelWindow } from "../../utils/windowContext";

/**
 * Persistent, hard-to-miss warning shown while a meeting is recording but only
 * the microphone is picking up sound — i.e. the other participants' audio isn't
 * being captured, so they won't be transcribed or separated into their own
 * speaker. The store latches `systemAudioSilentWarning` from the capture layer;
 * the transient toast alone was easy to miss during a live call, so this stays
 * up (top-center, below the recording pill) until the user acts or dismisses it.
 */
export default function MeetingSystemAudioWarningBanner() {
  const { t } = useTranslation();
  const isRecording = useMeetingRecordingStore((s) => s.isRecording);
  const warn = useMeetingRecordingStore((s) => s.systemAudioSilentWarning);
  const [dismissed, setDismissed] = useState(false);

  // A fresh recording earns a fresh warning.
  useEffect(() => {
    if (!isRecording) setDismissed(false);
  }, [isRecording]);

  if (!isRecording || !warn || dismissed || !isControlPanelWindow()) return null;

  return (
    <div className="fixed top-12 left-1/2 z-40 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2">
      <div
        className="rounded-xl border border-warning/30 bg-warning/[0.08] px-3.5 py-3 shadow-elevated backdrop-blur-xl"
        style={{ animation: "float-up 0.25s ease-out" }}
        role="alert"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-warning/15 text-warning">
            <AudioLines className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-foreground">
              {t("notes.meeting.systemAudioSilent.title")}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              {t("notes.meeting.systemAudioSilent.description")}
            </p>
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() =>
                  void (
                    window.electronAPI?.openSystemAudioSettings?.() ??
                    window.electronAPI?.openSoundInputSettings?.()
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning hover:bg-warning/20"
              >
                {t("notes.meeting.systemAudioSilent.openSettings")}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label={t("common.dismiss")}
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-foreground/30 hover:text-foreground/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
