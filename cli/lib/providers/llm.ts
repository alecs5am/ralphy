// Unified LLM provider — OpenRouter only in v2.
//
// History: this module used to fan out across Vercel AI Gateway / OpenRouter /
// OpenAI. Sprint 2 consolidated to a single provider so users only need one key
// (OPENROUTER_API_KEY). All previous fallbacks were removed; the function shape
// is preserved so consumers (find-viral-moments, scenarist helpers, etc.) keep
// working without edits.
//
// Usage:
//   import { callLLM } from "../lib/providers/llm.js";
//   const { text } = await callLLM({
//     messages: [{ role: "user", content: "Hello" }],
//     model: "google/gemini-2.5-flash",  // optional
//     jsonMode: true,                    // optional
//     projectId: "my-proj-001",          // optional, for cost logging
//   });

import { logGeneration } from "../gen-log.js";
import { hasCapability } from "../capabilities.js";

export type LLMProvider = "openrouter";

export type ProviderConfig = {
  provider: LLMProvider;
  baseURL: string;
  apiKey: string;
  defaultModel: string;
};

export function resolveLLMProvider(): ProviderConfig {
  if (!hasCapability("llm-openrouter")) {
    throw new Error(
      `OPENROUTER_API_KEY is not set.\n` +
        `Get a key at https://openrouter.ai/keys and run "ralphy setup".`,
    );
  }
  return {
    provider: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
    defaultModel: "google/gemini-2.5-flash",
  };
}

export type LLMContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string | LLMContent[];
};

export type CallLLMOptions = {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  /** Project ID for log line. Skipped if undefined. */
  projectId?: string;
  /** Endpoint label for the log line. */
  endpoint?: string;
};

export type CallLLMResult = {
  text: string;
  raw: unknown;
  provider: LLMProvider;
  model: string;
  latencyMs: number;
};

export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
  const cfg = resolveLLMProvider();
  const model = opts.model ?? cfg.defaultModel;
  const t0 = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.3,
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const resp = await fetch(`${cfg.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`${cfg.provider} ${resp.status}: ${errText.slice(0, 500)}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";

  if (opts.projectId) {
    await logGeneration(opts.projectId, {
      provider: "openrouter",
      endpoint: opts.endpoint ?? "openrouter/chat-completions",
      kind: "text",
      input: { model, messages: opts.messages.length },
      output: { bytes: text.length },
      status: "ok",
      latency_ms: latencyMs,
    });
  }

  return { text, raw: json, provider: "openrouter", model, latencyMs };
}
