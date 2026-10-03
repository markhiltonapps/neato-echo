import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mic, Volume2, RefreshCw } from "lucide-react";
import { useSettings } from "../../hooks/useSettings";
import { useMeetingRecordingStore } from "../../stores/meetingRecordingStore";
import { cn } from "../lib/utils";

// A live meter bar (0–1 level). sqrt curve makes quiet speech visible, matching the pill.
function Meter({ level }: { level: number }) {
  const bars = 12;
  return (
    <div className="flex items-end gap-[2px] h-5 flex-1">
      {Array.from({ length: bars }, (_, i) => {
        const phase = 0.65 + 0.35 * Math.sin(i * 1.3);
        const h = Math.max(8, Math.min(100, Math.sqrt(level) * 190 * phase));
        const active = level > 0.015 && i / bars < Math.sqrt(level) * 2.2;
        return (
          <div
            key={i}
            className={cn(
              "w-full rounded-full origin-bottom transition-[height] duration-75",
              active ? "bg-primary/70" : "bg-foreground/12 dark:bg-white/12"
            )}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * In-meeting audio panel: shows the selected microphone (editable) and live level meters
 * for both the mic and the system audio (remote participants), plus a plain-language
 * health line so users can see at a glance whether each side is actually being captured.
 * Reads existing store levels + mic settings — it does not change the capture pipeline.
 */
export default function MeetingDevicePanel() {
  const { t } = useTranslation();
  const {
    microphoneSelectionMode,
    selectedMicDeviceId,
    setMicrophoneSelectionMode,
    setSelectedMicDevice,
  } = useSettings();

  const micLevel = useMeetingRecordingStore((s) => s.currentMicLevel);
  const systemLevel = useMeetingRecordingStore((s) => s.currentSystemLevel);
  const systemSilent = useMeetingRecordingStore((s) => s.systemAudioSilentWarning);

  const [devices, setDevices] = useState<{ deviceId: string; label: string }[]>([]);

  const loadDevices = useCallback(async () => {
    try {
      let all = await navigator.mediaDevices.enumerateDevices();
      if (!all.some((d) => d.kind === "audioinput" && d.label)) {
        // Labels are hidden until permission is granted; unlock them once.
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((tr) => tr.stop());
        all = await navigator.mediaDevices.enumerateDevices();
      }
      setDevices(
        all
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
      );
    } catch {
      // enumeration blocked — leave the list as-is (System default still works)
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
  }, [loadDevices]);

  const micValue = microphoneSelectionMode === "specific" ? selectedMicDeviceId : "system";
  const onMicChange = (value: string) => {
    if (value === "system") {
      setMicrophoneSelectionMode("system");
    } else {
      const dev = devices.find((d) => d.deviceId === value);
      setMicrophoneSelectionMode("specific");
      setSelectedMicDevice(value, dev?.label ?? "");
    }
  };

  // System-audio health: latched-silent > flat > receiving.
  const systemHealth = systemSilent
    ? { text: t("notes.audioPanel.systemNoSignal"), tone: "bad" as const }
    : systemLevel > 0.02
      ? { text: t("notes.audioPanel.systemReceiving"), tone: "good" as const }
      : { text: t("notes.audioPanel.systemListening"), tone: "idle" as const };

  return (
    <div className="w-72 p-3 space-y-3">
      {/* Microphone */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/70">
          <Mic size={12} />
          {t("notes.audioPanel.microphone")}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={micValue}
            onChange={(e) => onMicChange(e.target.value)}
            className="min-w-0 flex-1 h-7 rounded-md border border-border bg-input px-2 text-[12px] text-foreground"
          >
            <option value="system">{t("notes.audioPanel.systemDefaultMic")}</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadDevices()}
            title={t("notes.audioPanel.refresh")}
            className="shrink-0 grid place-items-center w-7 h-7 rounded-md border border-border text-foreground/50 hover:text-foreground hover:bg-foreground/5"
          >
            <RefreshCw size={12} />
          </button>
        </div>
        <Meter level={micLevel} />
      </div>

      {/* System audio */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground/70">
          <Volume2 size={12} />
          {t("notes.audioPanel.systemAudio")}
        </div>
        <Meter level={systemLevel} />
        <p
          className={cn(
            "text-[11px] leading-snug",
            systemHealth.tone === "bad"
              ? "text-destructive"
              : systemHealth.tone === "good"
                ? "text-primary"
                : "text-foreground/45"
          )}
        >
          {systemHealth.text}
        </p>
        {systemHealth.tone === "bad" && (
          <p className="text-[10.5px] leading-snug text-foreground/45">
            {t("notes.audioPanel.systemHint")}
          </p>
        )}
      </div>
    </div>
  );
}
