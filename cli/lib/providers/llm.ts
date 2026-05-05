// Unified LLM provider — picks Vercel AI Gateway → OpenRouter → OpenAI
// based on which env keys are set. All three speak OpenAI Chat Completions.
//
// Why this exists: scripts (find-viral-moments, face-bbox, scenarist helpers)
// used to hardcode OpenRouter. Now they call callLLM() and degrade gracefully
// across providers — one less reason to require all keys at once.
//
// Usage:
//   import { callLLM } from "../lib/providers/llm.js";
//   const { text } = await callLLM({
//     messages: [{ role: "user", content: "Hello" }],
//     model: "google/gemini-2.5-flash",  // optional
//     jsonMode: true,                    // optional
//     projectId: "my-proj-001",          // optional, for cost logging
//   });

import { logGeneration, type Provider } from "../gen-log.js";
import { hasCapability } from "../capabilities.js";

export type LLMProvider = "vercel" | "openrouter" | "openai";

export type ProviderConfig = {
  provider: LLMProvider;
  baseURL: string;
  apiKey: string;
  defaultModel: string;
};

export function resolveLLMProvider(): ProviderConfig {
  if (hasCapability("llm-vercel")) {
    return {
      provider: "vercel",
      baseURL: "https://ai-gateway.vercel.sh/v1",
      apiKey: process.env.VERCEL_AI_GATEWAY_KEY!,
      defaultModel: "google/gemini-2.5-flash",
    };
  }
  if (hasCapability("llm-openrouter")) {
    return {
      provider: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY!,
      defaultModel: "google/gemini-2.5-flash",
    };
  }
  if (hasCapability("llm-openai")) {
    return {
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: process.env.OPENAI_API_KEY!,
      defaultModel: "gpt-4o-mini",
    };
  }
  throw new Error(
    `No LLM provider configured. Set one of:\n` +
      `  VERCEL_AI_GATEWAY_KEY  (recommended — unified gateway)\n` +
      `  OPENROUTER_API_KEY\n` +
      `  OPENAI_API_KEY\n` +
      `Run "ralphy setup" to configure interactively.`,
  );
}

export type LLMContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

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
      provider: cfg.provider as Provider,
      endpoint: opts.endpoint ?? `${cfg.provider}/chat-completions`,
      kind: "text",
      input: { model, messages: opts.messages.length },
      output: { bytes: text.length },
      status: "ok",
      latency_ms: latencyMs,
    });
  }

  return { text, raw: json, provider: cfg.provider, model, latencyMs };
}
