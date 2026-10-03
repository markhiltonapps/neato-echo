// Neato Echo: whether to offer a summary preset when a recording ends.
export const ASK_SUMMARY_AFTER_RECORDING_KEY = "askSummaryAfterRecording";

export function shouldAskForSummaryAfterRecording(): boolean {
  try {
    return localStorage.getItem(ASK_SUMMARY_AFTER_RECORDING_KEY) !== "false";
  } catch {
    return true;
  }
}
