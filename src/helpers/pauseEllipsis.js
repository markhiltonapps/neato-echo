// Speech models (Whisper, Parakeet) are trained heavily on subtitles, so they
// emit an ellipsis wherever the speaker paused mid-sentence ("using... our
// app"). The LLM cleanup prompt is told to drop these, but it does so
// unreliably and does not run at all on the no-cleanup ("skip") path. This
// deterministic pass removes a mid-sentence pause ellipsis — two-or-more dots
// or the "…" character flanked by real characters on the same line — and joins
// the words with a single space, so the cleanup model never sees it and raw
// dictation comes out clean too.
//
// Left alone on purpose: a trailing ellipsis ("I'll think about it..."), a
// leading one, or one right before a line break. Those are the cases a speaker
// is most likely to have intended, and a single period ("Mr. Smith", "3.14")
// never matches because a run of two-or-more dots is required.
const PAUSE_ELLIPSIS = /([^\s.…])[^\S\r\n]*(?:\.{2,}|…)+[^\S\r\n]*(?=[^\s.…])/gu;

export function stripPauseEllipses(text) {
  if (typeof text !== "string" || !text) return text;
  return text.replace(PAUSE_ELLIPSIS, "$1 ");
}
