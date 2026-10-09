import { create } from "zustand";
import {
  transcribeFileWithSpeakers,
  type FileTranscriptionConfig,
  type DiarizationSettings,
} from "../services/fileTranscription";
import { saveUploadNote, uploadTitleFallback } from "../services/uploadNotes";
import { transcriptionErrorKey } from "../components/notes/shared";
import { getSettings } from "./settingsStore";
import { isTranscriptionContextAllowed } from "./policyRules";
import { usePolicyStore } from "./policyStore";

/**
 * A single upload's transcription, run detached from React. Selecting the file
 * and (for URLs) downloading it stay in the Upload view because they are short
 * and the user is watching; the transcription — which for a long recording is a
 * multi-minute wait — runs here so switching tabs no longer cancels it. The
 * finished note is saved by this runner, and a global indicator plus the Upload
 * view both render from this store, so progress and ETA are visible anywhere.
 */

export type UploadJobStatus = "transcribing" | "complete" | "error";

export interface UploadJobError {
  // An i18n key under notes.upload.*, when the failure maps to one.
  key?: string;
  // A raw provider/runtime message otherwise.
  message?: string;
}

export interface UploadJob {
  id: string;
  status: UploadJobStatus;
  fileName: string;
  fromUrl: boolean;
  // 0..100 for the bar. Real once segment counts are known, simulated before.
  progress: number;
  chunkProgress: { chunksTotal: number; chunksCompleted: number } | null;
  // Live estimate of seconds remaining; null until it can be estimated.
  etaSeconds: number | null;
  result: string | null;
  noteId: number | null;
  noteTitle: string | null;
  partialWarning: { failed: number; total: number } | null;
  diarizationWarning: boolean;
  error: UploadJobError | null;
  folderId: number | null;
}

interface UploadJobStoreState {
  job: UploadJob | null;
}

export const useUploadJobStore = create<UploadJobStoreState>()(() => ({
  job: null,
}));

export interface StartUploadJobParams {
  filePath: string;
  fileName: string;
  fromUrl: boolean;
  durationSeconds: number | null;
  // Deleted once transcription settles; nothing else owns a URL download's temp.
  tempPath?: string | null;
  transcription: FileTranscriptionConfig;
  diarization: DiarizationSettings;
  folderId: number | null;
  // File notes get an AI-generated title; URL notes keep the video title.
  generateTitle: (text: string) => Promise<string | null>;
}

// Bumping the run id soft-cancels a job; the backend also gets a true abort via
// cancel-upload-transcription. Either way a stale run's late result is dropped.
let runId = 0;
let activeRequestId: string | null = null;
let simulateTimer: ReturnType<typeof setInterval> | null = null;
let progressCleanup: (() => void) | null = null;

function patch(updates: Partial<UploadJob>): void {
  useUploadJobStore.setState((s) => (s.job ? { job: { ...s.job, ...updates } } : s));
}

function stopSimulateTimer(): void {
  if (simulateTimer) {
    clearInterval(simulateTimer);
    simulateTimer = null;
  }
}

function teardownProgress(): void {
  stopSimulateTimer();
  if (progressCleanup) {
    progressCleanup();
    progressCleanup = null;
  }
}

/** True while a job occupies the store and hasn't finished. */
export function isUploadJobActive(): boolean {
  return useUploadJobStore.getState().job?.status === "transcribing";
}

export function clearUploadJob(): void {
  runId++;
  teardownProgress();
  activeRequestId = null;
  useUploadJobStore.setState({ job: null });
}

export function cancelUploadJob(): void {
  runId++;
  teardownProgress();
  if (activeRequestId) {
    window.electronAPI.cancelUploadTranscription?.(activeRequestId);
    activeRequestId = null;
  }
  useUploadJobStore.setState({ job: null });
}

export function startUploadJob(params: StartUploadJobParams): void {
  if (isUploadJobActive()) return;
  if (!isTranscriptionContextAllowed(usePolicyStore.getState(), getSettings(), "upload")) return;

  // A prior job's timer/subscription is cleared on settle, but tear down again
  // so a new job can never inherit a stale one.
  teardownProgress();
  const run = ++runId;
  const id = crypto.randomUUID();
  const requestId = id;
  activeRequestId = requestId;
  const startedAt = Date.now();

  useUploadJobStore.setState({
    job: {
      id,
      status: "transcribing",
      fileName: params.fileName,
      fromUrl: params.fromUrl,
      progress: 0,
      chunkProgress: null,
      etaSeconds: null,
      result: null,
      noteId: null,
      noteTitle: null,
      partialWarning: null,
      diarizationWarning: false,
      error: null,
      folderId: params.folderId,
    },
  });

  // Segment/chunk events give real progress + ETA (local Parakeet reports per
  // segment, cloud per chunk). Before the first event arrives — and for engines
  // that don't report — a gentle crawl keeps the bar alive without implying a
  // known position; it stops the moment a real event lands.
  simulateTimer = setInterval(() => {
    if (run !== runId) return;
    const job = useUploadJobStore.getState().job;
    if (!job || job.chunkProgress) return;
    if (job.progress >= 90) {
      stopSimulateTimer();
      return;
    }
    patch({ progress: job.progress + Math.random() * 6 });
  }, 500);

  progressCleanup =
    window.electronAPI.onUploadTranscriptionProgress?.((data) => {
      if (run !== runId) return;
      if (!data || data.chunksTotal <= 0) return;
      stopSimulateTimer();
      const fraction = data.chunksCompleted / data.chunksTotal;
      const elapsed = (Date.now() - startedAt) / 1000;
      // Only estimate once a segment has actually completed, or the first
      // estimate divides by ~0 and shows an absurd time.
      const etaSeconds =
        fraction > 0 && fraction < 1 ? Math.round((elapsed * (1 - fraction)) / fraction) : null;
      patch({
        chunkProgress: { chunksTotal: data.chunksTotal, chunksCompleted: data.chunksCompleted },
        // Hold at 99 until the note is actually saved.
        progress: Math.min(fraction * 100, 99),
        etaSeconds,
      });
    }) ?? null;

  void (async () => {
    try {
      const res = await transcribeFileWithSpeakers(
        params.filePath,
        params.transcription,
        params.diarization,
        params.durationSeconds,
        { requestId, timestamps: true }
      ).finally(() => {
        if (activeRequestId === requestId) activeRequestId = null;
      });

      if (run !== runId) return;
      teardownProgress();

      if (!res.success || !res.text) {
        patch({
          status: "error",
          error: { key: transcriptionErrorKey(res) || undefined, message: res.error },
          etaSeconds: null,
        });
        return;
      }

      const title = params.fromUrl
        ? params.fileName
        : (await params.generateTitle(res.text)) || uploadTitleFallback(res.text, params.fileName);
      if (run !== runId) return;

      const noteRes = await saveUploadNote({
        title,
        text: res.text,
        sourceName: params.fileName,
        folderId: params.folderId,
        diarization: params.diarization,
        durationSeconds: res.durationSeconds,
        segments: res.segments,
      });
      if (run !== runId) return;

      if (noteRes.success && noteRes.note) {
        patch({
          status: "complete",
          progress: 100,
          etaSeconds: 0,
          result: res.text,
          noteId: noteRes.note.id,
          noteTitle: title,
          partialWarning:
            res.failedChunks && res.totalChunks
              ? { failed: res.failedChunks, total: res.totalChunks }
              : null,
          diarizationWarning: !!res.diarizationWarning,
        });
      } else {
        patch({ status: "error", error: { key: "saveFailed" }, etaSeconds: null });
      }
    } catch (err) {
      if (run !== runId) return;
      teardownProgress();
      patch({
        status: "error",
        error: {
          key: transcriptionErrorKey(err) || undefined,
          message: err instanceof Error ? err.message : undefined,
        },
        etaSeconds: null,
      });
    } finally {
      // Nothing else owns a URL download's temp file once transcription settles.
      if (params.tempPath) window.electronAPI.deleteTempFile(params.tempPath);
    }
  })();
}
