import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, AudioLines, Check, MousePointer2 } from "lucide-react";
import { useModelDownload } from "../../hooks/useModelDownload";
import { useSettingsStore } from "../../stores/settingsStore";
import { getParakeetModelInfo, modelRegistry } from "../../models/ModelRegistry";
import { SETUP_CARD_CLASS, StepPrimaryAction, StepSecondaryAction } from "./ProviderSetupStep";
import { forgetPendingLocalModel, rememberPendingLocalModel } from "./pendingLocalModels";

import {
  AUTO_SUMMARY_PROVIDER,
  pickAutoLocalModels,
  type AutoLocalModelPicks,
} from "./autoLocalModels";

type RowStatus = "checking" | "waiting" | "downloading" | "installing" | "ready" | "failed";

function summaryModelBytes(modelId: string) {
  return modelRegistry.getModel(modelId)?.model.sizeBytes ?? 2_700_000_000;
}

function speechModelBytes(modelId: string) {
  return (getParakeetModelInfo(modelId)?.sizeMb ?? 650) * 1_000_000;
}

export function AutoLocalSetupStep({
  onReadinessChange,
  onProceed,
  onSkip,
  onAdvanced,
}: {
  onReadinessChange: (ready: boolean) => void;
  onProceed: () => void;
  onSkip: () => void;
  onAdvanced: () => void;
}) {
  const { t } = useTranslation();
  const store = useSettingsStore();
  const [picks, setPicks] = useState<AutoLocalModelPicks | null>(null);
  const [memoryGb, setMemoryGb] = useState<number | null>(null);
  const [speechStatus, setSpeechStatus] = useState<RowStatus>("checking");
  const [summaryStatus, setSummaryStatus] = useState<RowStatus>("checking");
  const startedRef = useRef(false);

  const speechDownload = useModelDownload({ modelType: "parakeet" });
  const summaryDownload = useModelDownload({ modelType: "llm" });
  // The hooks are recreated on every render; the effects below only need the
  // latest instance, not a dependency that restarts them.
  const speechDownloadRef = useRef(speechDownload);
  speechDownloadRef.current = speechDownload;
  const summaryDownloadRef = useRef(summaryDownload);
  summaryDownloadRef.current = summaryDownload;

  const applySpeech = useCallback(
    (modelId: string) => {
      store.setLocalTranscriptionProvider("nvidia");
      store.setParakeetModel(modelId);
      // Load the engine now so the first dictation is instant; starting it
      // also persists the provider so every later launch pre-warms it.
      void window.electronAPI?.parakeetServerStart?.(modelId)?.catch(() => {});
      forgetPendingLocalModel("dictation", modelId);
      setSpeechStatus("ready");
    },
    [store]
  );

  const applySummary = useCallback(
    (modelId: string) => {
      store.setChatAgentMode("local");
      store.setChatAgentProvider(AUTO_SUMMARY_PROVIDER);
      store.setChatAgentModel(modelId);
      forgetPendingLocalModel("assistant", modelId);
      setSummaryStatus("ready");
    },
    [store]
  );

  const startSummary = useCallback(
    (modelId: string) => {
      setSummaryStatus("downloading");
      rememberPendingLocalModel("assistant", { provider: AUTO_SUMMARY_PROVIDER, modelId });
      void summaryDownloadRef.current.downloadModel(modelId, applySummary);
    },
    [applySummary]
  );

  const startSpeech = useCallback(
    (modelId: string) => {
      setSpeechStatus("downloading");
      rememberPendingLocalModel("dictation", { provider: "nvidia", modelId });
      void speechDownloadRef.current.downloadModel(modelId, applySpeech);
    },
    [applySpeech]
  );

  // Decide, check disk, and kick off whatever is missing — once.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    (async () => {
      const [memory, parakeet, llm] = await Promise.all([
        window.electronAPI?.getSystemMemoryGb?.()?.catch(() => null) ?? Promise.resolve(null),
        window.electronAPI?.listParakeetModels?.().catch(() => undefined),
        window.electronAPI?.modelGetAll?.().catch(() => undefined),
      ]);
      if (cancelled) return;
      const saved = useSettingsStore.getState();
      const language =
        saved.preferredLanguage && saved.preferredLanguage !== "auto"
          ? saved.preferredLanguage
          : navigator.language || "en";
      const memoryValue = typeof memory === "number" && Number.isFinite(memory) ? memory : null;
      const decided = pickAutoLocalModels({ language, memoryGb: memoryValue });
      setMemoryGb(memoryValue);
      setPicks(decided);

      const speechReady = (parakeet?.models ?? []).some(
        (model) => model.model === decided.speechModelId && model.downloaded
      );
      const summaryReady = (llm ?? []).some(
        (model) => model.id === decided.summaryModelId && model.isDownloaded
      );

      if (speechReady) applySpeech(decided.speechModelId);
      if (summaryReady) applySummary(decided.summaryModelId);

      // Both downloads start at once: they use separate download managers, and
      // starting the summary model only after speech finished meant a user who
      // left this screen early never got a summary model at all. Both are also
      // remembered as pending right away, so the background tray finishes and
      // activates them if the user moves on.
      if (!speechReady) startSpeech(decided.speechModelId);
      if (!summaryReady) startSummary(decided.summaryModelId);
    })();
    return () => {
      cancelled = true;
    };
  }, [applySpeech, applySummary, startSpeech, startSummary]);

  useEffect(() => {
    if (speechDownload.downloadError && speechStatus === "downloading") setSpeechStatus("failed");
  }, [speechDownload.downloadError, speechStatus]);
  useEffect(() => {
    if (summaryDownload.downloadError && summaryStatus === "downloading")
      setSummaryStatus("failed");
  }, [summaryDownload.downloadError, summaryStatus]);

  const allReady = speechStatus === "ready" && summaryStatus === "ready";
  useEffect(() => {
    onReadinessChange(allReady);
  }, [allReady, onReadinessChange]);

  const anyDownloading =
    speechStatus === "downloading" ||
    speechStatus === "installing" ||
    summaryStatus === "downloading" ||
    summaryStatus === "installing";
  const anyFailed = speechStatus === "failed" || summaryStatus === "failed";

  const overallPercent = useMemo(() => {
    if (!picks) return 0;
    const speechBytes = speechModelBytes(picks.speechModelId);
    const summaryBytes = summaryModelBytes(picks.summaryModelId);
    const total = speechBytes + summaryBytes;
    const fraction = (status: RowStatus, percentage: number) =>
      status === "ready" ? 1 : status === "downloading" || status === "installing" ? Math.min(1, percentage / 100) : 0;
    const done =
      speechBytes * fraction(speechStatus, speechDownload.downloadProgress.percentage) +
      summaryBytes * fraction(summaryStatus, summaryDownload.downloadProgress.percentage);
    return Math.round((done / total) * 100);
  }, [picks, speechStatus, summaryStatus, speechDownload.downloadProgress.percentage, summaryDownload.downloadProgress.percentage]);

  const readyCount = (speechStatus === "ready" ? 1 : 0) + (summaryStatus === "ready" ? 1 : 0);

  const retry = () => {
    if (!picks) return;
    if (speechStatus === "failed") startSpeech(picks.speechModelId);
    else if (summaryStatus === "failed") startSummary(picks.summaryModelId);
  };

  const statusLabel = (status: RowStatus, percentage: number, installing: boolean) => {
    switch (status) {
      case "ready":
        return t("onboarding.rehaul.localAuto.statusReady");
      case "failed":
        return t("onboarding.rehaul.localAuto.statusFailed");
      case "downloading":
      case "installing":
        return installing
          ? t("onboarding.rehaul.localAuto.statusInstalling")
          : t("onboarding.rehaul.localAuto.statusDownloading", { percent: Math.round(percentage) });
      default:
        return t("onboarding.rehaul.localAuto.statusWaiting");
    }
  };

  const speechName = picks ? (getParakeetModelInfo(picks.speechModelId)?.name ?? picks.speechModelId) : "";
  const summaryName = picks ? (modelRegistry.getModel(picks.summaryModelId)?.model.name ?? picks.summaryModelId) : "";

  const row = (
    icon: ReactNode,
    label: string,
    detail: string,
    modelName: string,
    status: RowStatus,
    percentage: number,
    installing: boolean
  ) => (
    <div className="flex items-center gap-3 px-1 py-3">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--onboarding-control-border)] ${
          status === "ready"
            ? "bg-[var(--onboarding-accent)] text-[var(--onboarding-accent-foreground)]"
            : "bg-[var(--onboarding-surface-secondary)] text-[var(--onboarding-text-primary)]"
        }`}
      >
        {status === "ready" ? <Check className="size-4" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[var(--onboarding-text-primary)]">{label}</span>
        <span className="mt-0.5 block text-xs leading-[1.35] text-[var(--onboarding-text-secondary)]">
          {detail}
          {modelName ? ` · ${modelName}` : ""}
        </span>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
          status === "failed"
            ? "bg-[color-mix(in_srgb,#ef4444_15%,transparent)] text-[#ef4444]"
            : status === "ready"
              ? "text-[var(--onboarding-accent)]"
              : "bg-[var(--onboarding-surface-secondary)] text-[var(--onboarding-text-secondary)]"
        }`}
      >
        {statusLabel(status, percentage, installing)}
      </span>
    </div>
  );

  return (
    <section className={`${SETUP_CARD_CLASS} mt-6`}>
      <div className="divide-y divide-[var(--onboarding-control-border)] rounded-2xl border border-[var(--onboarding-control-border)] bg-[var(--onboarding-surface-secondary)] px-2">
        {row(
          <AudioLines className="size-4" />,
          t("onboarding.rehaul.localAuto.speechLabel"),
          t("onboarding.rehaul.localAuto.speechDetail"),
          speechName,
          speechStatus,
          speechDownload.downloadProgress.percentage,
          speechDownload.isInstalling
        )}
        {row(
          <MousePointer2 className="size-4" />,
          t("onboarding.rehaul.localAuto.summaryLabel"),
          t("onboarding.rehaul.localAuto.summaryDetail"),
          summaryName,
          summaryStatus,
          summaryDownload.downloadProgress.percentage,
          summaryDownload.isInstalling
        )}
      </div>

      <div className="mt-4">
        <div
          className="h-2 overflow-hidden rounded-full bg-[var(--onboarding-surface-tertiary)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={overallPercent}
        >
          <div
            className="h-full rounded-full bg-[var(--onboarding-accent)] transition-[width] duration-500 ease-out"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-[var(--onboarding-text-secondary)]">
          {allReady
            ? t("onboarding.rehaul.localAuto.allReady")
            : t("onboarding.rehaul.localAuto.overall", { done: readyCount, total: 2 })}
        </p>
        {picks?.smallMemory && memoryGb !== null && (
          <p className="mt-2 text-center text-xs leading-[1.4] text-[var(--onboarding-text-tertiary)]">
            {t("onboarding.rehaul.localAuto.memoryNote", { gb: Math.round(memoryGb) })}
          </p>
        )}
        {anyFailed && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[#ef4444]">
            <AlertCircle className="size-3.5" />
            {speechDownload.downloadError || summaryDownload.downloadError}
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        {allReady ? (
          <StepPrimaryAction onClick={onProceed}>
            {t("onboarding.rehaul.localAuto.finish")}
          </StepPrimaryAction>
        ) : anyFailed ? (
          <StepPrimaryAction onClick={retry}>{t("onboarding.rehaul.localAuto.retry")}</StepPrimaryAction>
        ) : (
          // Disabled primary while downloading: the obvious button must not be
          // the one that leaves the screen, or people click it by reflex and
          // land on Home wondering where the models went.
          <StepPrimaryAction onClick={() => undefined} disabled>
            {t("onboarding.rehaul.localAuto.downloadingButton", { percent: overallPercent })}
          </StepPrimaryAction>
        )}
        <div className="mt-1 flex items-center justify-center gap-3 text-xs text-[var(--onboarding-text-tertiary)]">
          {!allReady && !anyFailed && (
            <button
              type="button"
              onClick={onSkip}
              className="underline-offset-2 hover:text-[var(--onboarding-text-secondary)] hover:underline"
            >
              {t("onboarding.rehaul.localAuto.continueInBackground")}
            </button>
          )}
          <button
            type="button"
            onClick={onAdvanced}
            className="underline-offset-2 hover:text-[var(--onboarding-text-secondary)] hover:underline"
          >
            {t("onboarding.rehaul.localAuto.advanced")}
          </button>
        </div>
      </div>
    </section>
  );
}
