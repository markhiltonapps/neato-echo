// Pure request-body transform for suppressing thinking on the bundled
// llama-server. Kept separate from providers.ts (which pulls the AI SDK) so it
// stays unit-testable, and shared by the fetch wrapper there.
//
// Why this matters: the streaming chat path lets Qwen generate its full
// <think> chain-of-thought every turn and only strips the tags afterward. On a
// 2B that was ~1024 generated tokens (~32s) per round vs ~69 tokens (~2s) with
// thinking off — a ~14x per-round win, doubled across a tool call + answer.
// think:false and chat_template_kwargs.enable_thinking:false mirror the
// non-streaming inference() path and suppressThinking()'s "local" dialect.

export function injectLocalThinkingDisabled(bodyText: string): string {
  try {
    const body = JSON.parse(bodyText);
    body.chat_template_kwargs = { ...(body.chat_template_kwargs ?? {}), enable_thinking: false };
    body.think = false;
    return JSON.stringify(body);
  } catch {
    // Non-JSON body (shouldn't happen for chat completions) — leave untouched.
    return bodyText;
  }
}
