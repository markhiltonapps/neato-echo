import { create } from "zustand";

/**
 * Signals whether the Upload view is mid-download/transcription. The Upload
 * component's processing state is local to it, so switching tabs unmounts it
 * and loses the in-flight job. ControlPanel reads this flag to warn before
 * navigating away instead of silently discarding the work.
 */
interface UploadProcessingState {
  isProcessing: boolean;
  setUploadProcessing: (value: boolean) => void;
}

export const useUploadProcessingStore = create<UploadProcessingState>((set) => ({
  isProcessing: false,
  setUploadProcessing: (value) => set({ isProcessing: value }),
}));
