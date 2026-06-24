// Generic OpenAI-compatible connector — the local / self-hosted escape hatch
// (#487). Ollama, vLLM, LiteLLM, and a private GPU cluster all expose an
// OpenAI-shaped `/v1/chat/completions`; one factory turns a user-declared
// `ProviderConfigEntry` into a `RalphyConnector` that hits THAT endpoint.
//
// INVARIANT #1 (AGENTS.md). This connector is REGISTERED, so it is allowed to
// hold a key and hit a host — but only the ones the user configured:
//   • The host is ONLY `entry.baseUrl` — no hardcoded openai.com / fal host.
//   • The key is read DYNAMICALLY via `process.env[entry.envVar]` — never a
//     literal banned env-var name. The config loader already rejected a banned
//     `envVar` (config.ts BANNED_ENV_VARS), so the only env vars this factory
//     can ever read are safe, user-declared names.

import { logGeneration } from "../gen-log.js";
import { withConcurrency } from "./concurrency.js";
import {
  retryTransient,
  TerminalProviderError,
  TransientPayloadError,
} from "./shared.js";
import type { ProviderConfigEntry } from "./config.js";
import type {
  RalphyConnector,
  CallLLMOptions,
  CallLLMResult,
} from "./types.js";

const DEFAULT_LLM_MODEL = "gpt-3.5-turbo"; // overridable per call / via judge config

/** POST `${baseUrl}/chat/completions`, or `${baseUrl}` if it already ends in it. */
function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

export function makeOpenAiCompatibleConnector(entry: ProviderConfigEntry): RalphyConnector {
  const id = entry.id;
  const label = entry.label ?? entry.id;
  // Sentinel when keyless — kept off the banned list and never read as a key.
  const envVar = entry.envVar ?? "(keyless)";
  const url = chatCompletionsUrl(entry.baseUrl);

  // available(): baseUrl is always set (validated). Keyless local is allowed;
  // when a key var is declared it must be present. Dynamic env read only.
  const available = (): boolean =>
    Boolean(entry.baseUrl) && (!entry.envVar || Boolean(process.env[entry.envVar]));

  async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
    const model = opts.model ?? DEFAULT_LLM_MODEL;
    const endpoint = opts.endpoint ?? `${id}/chat-completions`;
    const apiKey = entry.envVar ? process.env[entry.envVar] : undefined;

    const body: Record<string, unknown> = {
      model,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.3,
    };
    if (opts.jsonMode) body.response_format = { type: "json_object" };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    return retryTransient(
      async (attempt) => {
        const t0 = Date.now();
        const resp = await withConcurrency(id, model, "text", () =>
          fetch(url, { method: "POST", headers, body: JSON.stringify(body) }),
        );
        const latencyMs = Date.now() - t0;

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          const message = `${id} ${resp.status}: ${errText.slice(0, 500)}`;
          if (resp.status >= 400 && resp.status < 500) throw new TerminalProviderError(message);
          throw new Error(message);
        }

        const json = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }>;
        };
        const choice = json.choices?.[0];
        const text = choice?.message?.content ?? "";
        const finish = choice?.finish_reason ?? null;
        if ((finish === null || finish === undefined) && text.length === 0) {
          throw new TransientPayloadError(
            `${id} chat-completions returned empty content (finish_reason=${finish}) on ${model}.`,
          );
        }

        if (opts.projectId) {
          await logGeneration(opts.projectId, {
            provider: id,
            model,
            endpoint,
            kind: "text",
            input: { model, messages: opts.messages.length, slot: opts.slot, project: opts.projectId },
            output: { bytes: text.length },
            status: "ok",
            latency_ms: latencyMs,
            attempt,
          });
        }
        return { text, raw: json, provider: id, model, latencyMs };
      },
      { noRetry: opts.noRetry },
    );
  }

  return {
    id,
    label,
    envVar,
    signupUrl: entry.baseUrl,
    capabilities: entry.capabilities,
    available,
    // Only text is implemented this slice. A declared image/video capability
    // resolves to this connector but the matching generate* method is absent —
    // resolveConnector's `capabilities.includes` check still routes; the verb's
    // own `conn.generateImage?.()` call is a no-op until a future slice wires it.
    callLLM: entry.capabilities.includes("text") ? callLLM : undefined,
  };
}
