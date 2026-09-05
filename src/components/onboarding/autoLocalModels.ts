/**
 * The models the local-first edition installs without asking. Parakeet TDT
 * is the speech model for everyone: best local accuracy and punctuation,
 * 25 languages, and it decodes files quickly. The streaming Nemotron model
 * (live word-by-word text, English only) stays available in Settings for
 * people who prefer it. Qwen 3.5 4B writes the summaries; the 2B build is
 * the fallback for PCs short on memory.
 *
 * Pure and Electron-free so it can be unit-tested; the onboarding step and the
 * background tray consume it.
 */
export const AUTO_SPEECH_MODEL = "parakeet-tdt-0.6b-v3";
export const STREAMING_SPEECH_MODEL_EN = "nemotron-speech-streaming-en-0.6b";
export const AUTO_SUMMARY_MODEL = "qwen3.5-4b-q4_k_m";
export const AUTO_SUMMARY_MODEL_SMALL = "qwen3.5-2b-q4_k_m";
export const AUTO_SUMMARY_PROVIDER = "qwen";
export const SMALL_MEMORY_GB = 8;

export interface AutoLocalModelPicks {
  speechModelId: string;
  summaryModelId: string;
  englishOnly: boolean;
  smallMemory: boolean;
}

/** One speech model for all; memory → summary model. `englishOnly` is kept
 * for callers that tailor copy to the language. */
export function pickAutoLocalModels({
  language,
  memoryGb,
}: {
  language: string;
  memoryGb: number | null;
}): AutoLocalModelPicks {
  const englishOnly = /^en\b/i.test(language.trim());
  const smallMemory = memoryGb !== null && memoryGb > 0 && memoryGb < SMALL_MEMORY_GB;
  return {
    speechModelId: AUTO_SPEECH_MODEL,
    summaryModelId: smallMemory ? AUTO_SUMMARY_MODEL_SMALL : AUTO_SUMMARY_MODEL,
    englishOnly,
    smallMemory,
  };
}
