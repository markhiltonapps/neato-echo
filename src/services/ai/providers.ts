import { createOpenAI } from "@ai-sdk/openai";
import { createGroq } from "@ai-sdk/groq";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { getTinfoilLanguageModel } from "./tinfoilClient";
import { API_ENDPOINTS } from "../../config/constants";
import { injectLocalThinkingDisabled } from "./localThinkingBody";

// Renderer-side AI SDK factory. Cloud + local only — enterprise providers
// (bedrock/azure/vertex) run in the main process via the
// `process-enterprise-reasoning` IPC because their SDKs depend on Node-only
// APIs (fs, process, AWS credential chain) that don't work in the browser.
// See `src/helpers/enterpriseAiProviders.js` for the main-process counterpart.

// OpenRouter's reasoning control is a top-level request field the AI SDK
// can't emit — inject it at the fetch boundary.
const withDisabledReasoning: typeof fetch = (input, init) => {
  if (typeof init?.body === "string") {
    try {
      const body = JSON.parse(init.body);
      body.reasoning = { enabled: false };
      init = { ...init, body: JSON.stringify(body) };
    } catch {}
  }
  return fetch(input, init);
};

// llama-server + Qwen: without this the model generates its full <think>
// chain-of-thought on every turn (twice per tool question) and the app only
// strips the tags afterward — so the user waits through hidden reasoning they
// never see. Suppress generation at the request boundary, the same way the
// non-streaming inference() path does (llamaServer.js). The AI SDK can't emit
// these fields, so inject them at fetch. think:false and chat_template_kwargs
// mirror suppressThinking()'s "local" dialect.
const withLocalThinkingDisabled: typeof fetch = (input, init) => {
  if (typeof init?.body === "string") {
    init = { ...init, body: injectLocalThinkingDisabled(init.body) };
  }
  return fetch(input, init);
};

export async function getAIModel(
  provider: string,
  model: string,
  apiKey: string,
  baseURL?: string,
  opts?: { disableThinking?: boolean }
): Promise<LanguageModel> {
  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey })(model);
    case "groq":
      return createGroq({ apiKey })(model);
    case "anthropic":
      // The assistant panel runs in the pill window, which keeps Chromium's
      // default webSecurity (the deleted agent overlay disabled it). Anthropic
      // only answers browser-origin requests that opt in with this header;
      // the dictation path avoids the issue by going through IPC.
      return createAnthropic({
        apiKey,
        headers: { "anthropic-dangerous-direct-browser-access": "true" },
      })(model);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(model);
    case "tinfoil":
      return getTinfoilLanguageModel(apiKey, model);
    case "corti":
      // Corti's gateway is Chat Completions-compatible, not the OpenAI Responses API.
      return createOpenAI({ apiKey, baseURL: API_ENDPOINTS.CORTI_MODELS_BASE }).chat(model);
    case "custom":
      // Custom OpenAI-compatible servers implement Chat Completions, not the Responses API.
      return createOpenAI({ apiKey, baseURL }).chat(model);
    case "openrouter":
      // OpenRouter implements Chat Completions, not the OpenAI Responses API.
      return createOpenAI({
        apiKey,
        baseURL,
        ...(opts?.disableThinking ? { fetch: withDisabledReasoning } : {}),
      }).chat(model);
    case "local":
      return createOpenAI({
        apiKey: apiKey || "no-key",
        baseURL,
        ...(opts?.disableThinking ? { fetch: withLocalThinkingDisabled } : {}),
      }).chat(model);
    default:
      throw new Error(`Unsupported AI SDK provider for renderer: ${provider}`);
  }
}
