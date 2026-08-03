// Back-compat barrel for the LLM call surface.
//
// The OpenRouter chat-completions implementation moved into openrouter.ts; the
// provider-selection logic lives in registry.ts. `callLLM` here is the
// registry-routed entry point — callers hit whichever connector serves the
// `text` capability (selectable via `opts.provider`), not a hardcoded
// OpenRouter function. ~15 modules import `callLLM` from here; they keep working
// unchanged and gain provider-pluggability for free.
//
// Usage:
//   import { callLLM } from "../lib/providers/llm.js";
//   const { text } = await callLLM({ messages: [{ role: "user", content: "Hello" }] });

import { resolveConnector, callLLM } from "./registry.js";
import { credentialValue } from "./credentials.js";

export { callLLM };
export type {
  LLMContent,
  LLMMessage,
  CallLLMOptions,
  CallLLMResult,
} from "./types.js";

/** Provider id union — widened to string now that providers are pluggable. */
export type LLMProvider = string;

export type ProviderConfig = {
  provider: LLMProvider;
  baseURL: string;
  apiKey: string;
  defaultModel: string;
};

/**
 * Back-compat shim. Resolves the active `text` connector and reports an
 * OpenRouter-shaped config. Only `provider` is meaningful across connectors now
 * (the only field still consumed downstream — see face-bbox.ts). Throws cleanly
 * if no text provider is configured.
 */
export function resolveLLMProvider(): ProviderConfig {
  const conn = resolveConnector("text");
  return {
    provider: conn.id,
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: credentialValue(conn.id) ?? "",
    defaultModel: "google/gemini-2.5-flash",
  };
}
