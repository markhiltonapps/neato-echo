/**
 * The models the local-first edition installs without asking. Streaming
 * Nemotron shows words while the user is still talking but only understands
 * English; Parakeet TDT covers the other languages. Qwen 3.5 4B writes the
 * summaries; the 2B build is the fallback for PCs short on memory.
 *
 * Pure and Electron-free so it can be unit-tested; the onboarding step and the
 * background tray consume it.
 */
export const AUTO_SPEECH_MODEL_EN = "nemotron-speech-streaming-en-0.6b";
export const AUTO_SPEECH_MODEL_MULTILINGUAL = "parakeet-tdt-0.6b-v3";
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

/** Language → speech model, memory → summary model. */
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
    speechModelId: englishOnly ? AUTO_SPEECH_MODEL_EN : AUTO_SPEECH_MODEL_MULTILINGUAL,
    summaryModelId: smallMemory ? AUTO_SUMMARY_MODEL_SMALL : AUTO_SUMMARY_MODEL,
    englishOnly,
    smallMemory,
  };
}
