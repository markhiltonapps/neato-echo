// Pure, unit-testable planning for map-reduce summarization of long transcripts.
//
// The bundled local model (llama-server) runs with a fixed, fairly small context
// window, so a long meeting transcript cannot be summarized in one shot (see the
// 400 "exceeds the available context size" error). This module decides how to slice
// a transcript so each piece — plus the system prompt and room for the answer — fits
// the window. The orchestration (actually calling the model and combining the pieces)
// lives in the renderer; this file stays free of imports so it can be tested with
// `node --test`.
//
// Authored as ESM `.js` (not `.ts`) so the test runner can import it directly, matching
// dictationRouting.js and the other pure renderer seams.

// Mirrors SERVER_CONTEXT_SIZE in modelManagerBridge.js — the ceiling the local
// llama-server is launched with. Restated here to keep this module import-free.
export const LOCAL_SERVER_CTX_TOKENS = 16384;

// Transcripts are token-dense (speaker labels, timestamps, names, numbers), so a low
// chars-per-token estimate makes us under-fill the window rather than overflow it.
const CHARS_PER_TOKEN = 3.5;

/** Rough token count for `text`. Deliberately conservative (over-estimates tokens). */
export function estimateTokens(text) {
  return Math.ceil((text ? text.length : 0) / CHARS_PER_TOKEN);
}

/**
 * How many tokens of transcript can ride along with a given system prompt, leaving
 * room for the model's reply and a safety margin.
 * @param {{ctxTokens:number, systemTokens:number, completionReserveTokens?:number, safetyTokens?:number}} b
 */
export function inputBudgetTokens(b) {
  const completion = b.completionReserveTokens ?? 1536;
  const safety = b.safetyTokens ?? 512;
  // Never go below a floor, or a huge system prompt could yield a zero/negative budget
  // and an infinite split.
  return Math.max(512, b.ctxTokens - b.systemTokens - completion - safety);
}

/**
 * Plan how to slice `content` to fit the budget. Splits on line boundaries first so
 * speaker turns stay intact; a single line that alone exceeds the budget is hard-split.
 * @returns {{needsChunking:boolean, chunks:string[]}}
 */
export function planSummaryChunks(content, budget) {
  const text = content || "";
  const budgetTokens = inputBudgetTokens(budget);
  if (estimateTokens(text) <= budgetTokens) {
    return { needsChunking: false, chunks: text ? [text] : [] };
  }

  const maxChars = Math.max(1, Math.floor(budgetTokens * CHARS_PER_TOKEN));
  const chunks = [];
  let current = "";

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = "";
  };

  for (const line of text.split("\n")) {
    if (line.length > maxChars) {
      // A single over-long line (e.g. an unbroken paragraph): flush what we have,
      // then hard-split the line by characters.
      flush();
      for (let i = 0; i < line.length; i += maxChars) {
        chunks.push(line.slice(i, i + maxChars));
      }
      continue;
    }
    // +1 for the newline we re-insert.
    if (current && current.length + 1 + line.length > maxChars) flush();
    current += current ? "\n" + line : line;
  }
  flush();

  return { needsChunking: chunks.length > 1, chunks };
}
