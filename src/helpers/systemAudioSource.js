// Pure resolver for the meeting "system audio source" override.
//
// By default ("auto") meeting system audio is captured by the platform helper (Windows
// WASAPI process-loopback, macOS tap, Linux portal) with an automatic Chromium-loopback
// fallback. But that helper can silently capture nothing on some setups (it activates
// "successfully" yet the stream is silent, so the auto fallback never triggers and the
// meter stays flat). This override lets the user force a capture path that works:
//   - "screen": capture what's playing via Chromium getDisplayMedia (share a screen/window
//     with audio) — the universal fallback, works even when the native helper is silent.
//   - "device": capture a chosen audio INPUT (e.g. "Stereo Mix" or a virtual cable) via
//     getUserMedia.
// Both are handled in the renderer and fed through the same loopback path; the main process
// skips the native helper so it can't double-capture.
//
// Authored as ESM `.js` (not `.ts`) so `node --test` can import it directly, matching the
// other pure renderer seams (dictationRouting.js, summaryChunking.js).

export const SYSTEM_AUDIO_SOURCE_MODE_KEY = "systemAudioSourceMode";
export const SYSTEM_AUDIO_SOURCE_ID_KEY = "systemAudioSourceId";
export const SYSTEM_AUDIO_SOURCE_LABEL_KEY = "systemAudioSourceLabel";

/**
 * Resolve the chosen source from a key→value getter (e.g. localStorage.getItem).
 * Always returns a well-formed object; unknown/blank modes resolve to "auto", and a
 * "device" mode with no device id falls back to "auto" (nothing to capture).
 * @param {(key: string) => (string | null | undefined)} get
 * @returns {{ mode: "auto" | "screen" | "device", deviceId: string | null }}
 */
export function resolveSystemAudioSource(get) {
  const mode = get(SYSTEM_AUDIO_SOURCE_MODE_KEY);
  if (mode === "screen") return { mode: "screen", deviceId: null };
  if (mode === "device") {
    const deviceId = get(SYSTEM_AUDIO_SOURCE_ID_KEY) || "";
    return deviceId ? { mode: "device", deviceId } : { mode: "auto", deviceId: null };
  }
  return { mode: "auto", deviceId: null };
}

/** True when the user forced a renderer-captured source (main must skip the native helper). */
export function systemAudioSourceForcesRenderer(resolved) {
  return resolved.mode === "screen" || resolved.mode === "device";
}
