// Clustering policy for the diarization paths (upload/batch and meeting
// post-processing). Kept free of electron imports so the rules stay
// unit-testable (pattern: cloudChunkPolicy).

// sherpa-onnx's cluster threshold is a cosine distance: two clusters merge when
// their distance is below it, so a HIGHER threshold merges more speakers into
// one. Merges are unrecoverable (you cannot split a fused speaker back apart),
// while over-splitting is cheaply cleaned up downstream by dropNegligibleClusters
// and capSpeakerClusters — so we bias low and split readily.
const DEFAULT_CLUSTER_THRESHOLD = 0.5;

// A single speaker's embeddings drift over a long recording, so agglomerative
// clustering can over-split one person into many clusters (a 73-minute voice
// memo once produced 46 "speakers"). That is the ONLY case where merging more
// aggressively is correct. Rather than raise the threshold for every long
// recording — which merged the distinct voices of a long multi-person meeting
// into one — we keep the low base and re-cluster at this higher threshold only
// when we actually observe an implausible over-split (see shouldRetryForOversplit).
const OVERSPLIT_CLUSTER_THRESHOLD = 0.7;

// A cluster with under a second of total speech is embedding noise, not a
// person — and the character-proportional merge hands every surviving cluster
// at least one sentence, so each blip becomes a phantom [Speaker N].
const MIN_CLUSTER_TOTAL_SECONDS = 1;

// The over-split retry only makes sense on long audio with no pinned count:
// short recordings do not drift, and an explicit speaker count already forces
// the right number of clusters (the threshold is ignored when num-clusters is
// set). More substantial clusters than this on a long recording is the signal
// that one speaker fragmented rather than that many people spoke.
const OVERSPLIT_RETRY_MIN_SECONDS = 25 * 60;
const OVERSPLIT_SUBSTANTIAL_CLUSTER_CEILING = 6;

function resolveClusterThreshold(requestedThreshold) {
  if (requestedThreshold == null || requestedThreshold === "") return DEFAULT_CLUSTER_THRESHOLD;
  const parsedThreshold = Number(requestedThreshold);
  if (!Number.isFinite(parsedThreshold)) return DEFAULT_CLUSTER_THRESHOLD;
  return Math.min(1, Math.max(0, parsedThreshold));
}

function countSubstantialClusters(segments, minTotalSeconds = MIN_CLUSTER_TOTAL_SECONDS) {
  if (!segments?.length) return 0;
  const totals = new Map();
  for (const s of segments) {
    totals.set(s.speaker, (totals.get(s.speaker) || 0) + (s.end - s.start));
  }
  let count = 0;
  for (const total of totals.values()) {
    if (total >= minTotalSeconds) count += 1;
  }
  return count;
}

// Decide whether a first-pass diarization at DEFAULT_CLUSTER_THRESHOLD looks
// like one speaker fragmented across many clusters (long audio, no pinned
// count, implausibly many substantial clusters) and should be re-clustered at
// OVERSPLIT_CLUSTER_THRESHOLD. Returns false for meetings and short clips, so
// their distinct speakers are never merged just because a recording ran long.
function shouldRetryForOversplit({ segments, durationSeconds, hasExplicitCount } = {}) {
  if (hasExplicitCount) return false;
  if (!Number.isFinite(durationSeconds) || durationSeconds < OVERSPLIT_RETRY_MIN_SECONDS) {
    return false;
  }
  return countSubstantialClusters(segments) > OVERSPLIT_SUBSTANTIAL_CLUSTER_CEILING;
}

function dropNegligibleClusters(segments, minTotalSeconds = MIN_CLUSTER_TOTAL_SECONDS) {
  if (!segments?.length) return segments;
  const totals = new Map();
  for (const s of segments) {
    totals.set(s.speaker, (totals.get(s.speaker) || 0) + (s.end - s.start));
  }
  const keep = new Set(
    [...totals].filter(([, total]) => total >= minTotalSeconds).map(([speaker]) => speaker)
  );
  if (keep.size === 0 || keep.size === totals.size) return segments;
  return segments.filter((s) => keep.has(s.speaker));
}

module.exports = {
  DEFAULT_CLUSTER_THRESHOLD,
  OVERSPLIT_CLUSTER_THRESHOLD,
  OVERSPLIT_RETRY_MIN_SECONDS,
  OVERSPLIT_SUBSTANTIAL_CLUSTER_CEILING,
  MIN_CLUSTER_TOTAL_SECONDS,
  resolveClusterThreshold,
  countSubstantialClusters,
  shouldRetryForOversplit,
  dropNegligibleClusters,
};
