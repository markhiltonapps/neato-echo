const { planLivePreview } = require("./liveTranscriptionCleanup");

// Stateful controller for sentence-settled live-preview cleanup.
//
// Feed it the raw accumulated transcript (setRaw for full-text streams,
// appendRaw for chunked deltas). It shows a polished-behind / raw-at-the-tip
// preview: completed sentences are cleaned once by the injected async `clean`
// (the same dictationCleanup model the final transcript uses) and cached, while
// the sentence still being spoken stays raw so the user never waits. Only one
// cleanup runs at a time; when it returns, the latest raw is re-evaluated so it
// catches up. Cleanup never blocks display — raw always shows immediately, so a
// slow or failing model degrades to the current raw preview rather than freezing.
//
// `clean` and `onDisplay` are injected so this stays free of app/service deps
// and unit-testable. All timing is driven by the caller's raw updates plus the
// completion of the in-flight cleanup; there is no internal timer.
function createLivePreviewCleaner({ clean, onDisplay, minSettledChars = 12 }) {
  let raw = "";
  let cache = { settledRaw: "", settledClean: "" };
  let inFlight = false;
  let disposed = false;

  function render() {
    if (disposed) return;
    const plan = planLivePreview(raw, cache, minSettledChars);
    onDisplay(plan.display);
    if (plan.shouldClean && !inFlight) startClean(plan.settled);
  }

  function startClean(settled) {
    inFlight = true;
    // Invoke clean() synchronously so it starts immediately; wrap so a sync
    // throw is handled by the same catch as an async rejection.
    let cleaned = "";
    let pending;
    try {
      pending = Promise.resolve(clean(settled));
    } catch (err) {
      pending = Promise.reject(err);
    }
    pending
      .then((result) => {
        if (typeof result === "string" && result.trim()) cleaned = result.trim();
      })
      .catch(() => {
        // Cleanup failed (model unreachable, cancelled, etc.) — keep showing raw.
      })
      .finally(() => {
        inFlight = false;
        // Record this settled text as attempted even on failure/empty, so the
        // same input is never re-cleaned in a tight loop; a later, longer
        // settled string differs and triggers a fresh attempt. On failure
        // cleaned stays "", which planLivePreview shows as raw settled text.
        cache = { settledRaw: settled, settledClean: cleaned };
        // Re-evaluate against whatever raw text arrived while we were cleaning,
        // so a newly-completed sentence gets cleaned next.
        if (!disposed) render();
      });
  }

  return {
    /** Replace the raw transcript (full-text streaming models). */
    setRaw(value) {
      raw = typeof value === "string" ? value : "";
      render();
    },
    /** Append a raw chunk (buffered/chunked offline preview). */
    appendRaw(chunk) {
      const value = typeof chunk === "string" ? chunk.trim() : "";
      if (!value) return;
      raw = raw ? `${raw} ${value}` : value;
      render();
    },
    /** Current raw accumulation (so callers can keep their own bookkeeping). */
    getRaw() {
      return raw;
    },
    /** Clear between dictations; keeps the instance reusable. */
    reset() {
      raw = "";
      cache = { settledRaw: "", settledClean: "" };
      inFlight = false;
    },
    /** Permanently stop applying results (component unmount). */
    dispose() {
      disposed = true;
    },
  };
}

module.exports = { createLivePreviewCleaner };
