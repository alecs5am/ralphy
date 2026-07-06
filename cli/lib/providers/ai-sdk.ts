// AI SDK provider layer — the ONLY file allowed to import the `ai` npm package
// and its provider adapters (AGENTS.md invariant #1 as amended by the D-01
// carve-out, docs/architecture/farm-node-graph.md, #496). Enforced by
// tests/unit/agents-md-invariants.test.ts: any other source file importing
// `ai`, an `ai/*` subpath, or `@openrouter/ai-sdk-provider` fails CI.
//
// Boundary (D-04, #499): this layer serves the workflow-graph LLM nodes ONLY
// (generate-text / generate-object / agent-loop — cli/lib/workflow/executors/).
// Every existing verb stays on `callLLM()` (registry.ts); no migration of
// callLLM() call sites. Model traffic still flows through the OpenRouter key —
// the adapter is a local library, no Vercel host, no Vercel key.
//
// Test seam: every wrapper accepts an optional `modelFactory` so unit tests
// inject a mock LanguageModel with ZERO network. Tests never import `ai`
// directly — they build mocks via `mockLanguageModel()` below (which wraps
// `ai/test`'s MockLanguageModelV3 inside the allowlisted file).

import {
  generateText,
  generateObject,
  jsonSchema,
  stepCountIs,
  tool,
  NoObjectGeneratedError,
} from "ai";
import type { LanguageModel, LanguageModelUsage, ProviderMetadata, ToolSet } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { requireProviderKey } from "./shared.js";

// Type re-exports so consumers (executors, tests) never import "ai" directly.
export type { LanguageModel, ToolSet } from "ai";

/** Maps a model id to a bound LanguageModel. The injection seam for tests. */
export type ModelFactory = (modelId: string) => LanguageModel;

/** Flattened token usage, per attempt (from the SDK's usage object). */
export interface SdkUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** One model call attempt — the unit the caller logs to generations.jsonl. */
export interface SdkAttempt {
  model: string;
  /** 1-indexed across the whole cascade (fallbacks + validation retries). */
  attempt: number;
  status: "ok" | "error";
  error?: string;
  latencyMs: number;
  usage?: SdkUsage;
  /** USD, when the provider reports it (OpenRouter usage accounting). */
  costUsd?: number;
}

export interface SdkCallOpts {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  /** Tried in order after `model` on any call error (terminal cascade). */
  fallbackModels?: string[];
  /** Test seam — defaults to the OpenRouter adapter. */
  modelFactory?: ModelFactory;
  /** Called once per attempt (success AND failure) — the gen-log hook. */
  onAttempt?: (a: SdkAttempt) => void | Promise<void>;
}

export interface SdkTextResult {
  text: string;
  /** The model that actually produced the result (after any fallback). */
  model: string;
  usage: SdkUsage;
  costUsd?: number;
  attempts: number;
  /** agent-loop only: number of loop steps taken. */
  steps?: number;
}

export interface SdkObjectResult extends Omit<SdkTextResult, "text"> {
  object: unknown;
}

const OPENROUTER = {
  envVar: "OPENROUTER_API_KEY",
  label: "OpenRouter",
  signupUrl: "https://openrouter.ai/keys",
} as const;

/** Default factory: OpenRouter chat models with usage accounting enabled. */
function openrouterModelFactory(): ModelFactory {
  requireProviderKey(OPENROUTER);
  const provider = createOpenRouter({ apiKey: process.env[OPENROUTER.envVar] });
  // usage.include=true → the response carries token counts AND cost in USD,
  // which the executors persist to generations.jsonl.
  return (modelId) => provider.chat(modelId, { usage: { include: true } });
}

function toUsage(u: LanguageModelUsage | undefined): SdkUsage {
  if (!u) return {};
  return { inputTokens: u.inputTokens, outputTokens: u.outputTokens, totalTokens: u.totalTokens };
}

/** OpenRouter usage accounting: providerMetadata.openrouter.usage.cost (USD). */
function orCost(meta: ProviderMetadata | undefined): number | undefined {
  const usage = (meta as Record<string, Record<string, unknown>> | undefined)?.openrouter?.usage;
  const cost = (usage as Record<string, unknown> | undefined)?.cost;
  return typeof cost === "number" ? cost : undefined;
}

/**
 * Model cascade: run `call` against `model`, then each fallback, until one
 * succeeds. Every attempt (ok or error) is reported through `onAttempt`.
 * `retrySameModel(err)` > 0 grants bounded same-model retries for that error
 * class (generate-object validation failures) before moving down the cascade.
 */
async function cascade<T extends { usage: SdkUsage; costUsd?: number }>(
  opts: SdkCallOpts,
  call: (model: LanguageModel) => Promise<T>,
  retrySameModel: (err: unknown) => number = () => 0,
): Promise<T & { model: string; attempts: number }> {
  const factory = opts.modelFactory ?? openrouterModelFactory();
  const models = [opts.model, ...(opts.fallbackModels ?? [])];
  let attempt = 0;
  let lastError: unknown;
  for (const modelId of models) {
    let sameModelBudget: number | undefined;
    for (;;) {
      attempt += 1;
      const t0 = Date.now();
      try {
        const res = await call(factory(modelId));
        await opts.onAttempt?.({
          model: modelId,
          attempt,
          status: "ok",
          latencyMs: Date.now() - t0,
          usage: res.usage,
          costUsd: res.costUsd,
        });
        return { ...res, model: modelId, attempts: attempt };
      } catch (err) {
        lastError = err;
        await opts.onAttempt?.({
          model: modelId,
          attempt,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
          latencyMs: Date.now() - t0,
        });
        sameModelBudget ??= retrySameModel(err);
        if (retrySameModel(err) > 0 && sameModelBudget > 0) {
          sameModelBudget -= 1;
          continue; // validation-class failure — retry the same model
        }
        break; // next model in the cascade
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Single bounded completion (the `generate-text` node). */
export async function sdkGenerateText(opts: SdkCallOpts): Promise<SdkTextResult> {
  return cascade(opts, async (model) => {
    const res = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
    });
    return { text: res.text, usage: toUsage(res.totalUsage), costUsd: orCost(res.providerMetadata) };
  });
}

/**
 * Structured-output completion (the `generate-object` node). `schema` is a
 * plain JSON-schema object (passed to the SDK's jsonSchema() helper). A
 * validation failure (NoObjectGeneratedError) retries the SAME model up to
 * `validationRetries` times (default 2) before falling down the cascade.
 */
export async function sdkGenerateObject(
  opts: SdkCallOpts & { schema: Record<string, unknown>; validationRetries?: number },
): Promise<SdkObjectResult> {
  const retries = opts.validationRetries ?? 2;
  return cascade(
    opts,
    async (model) => {
      const res = await generateObject({
        model,
        system: opts.system,
        prompt: opts.prompt,
        temperature: opts.temperature,
        maxOutputTokens: opts.maxTokens,
        schema: jsonSchema(opts.schema),
      });
      return {
        object: res.object as unknown,
        usage: toUsage(res.usage),
        costUsd: orCost(res.providerMetadata),
      };
    },
    (err) => (NoObjectGeneratedError.isInstance(err) ? retries : 0),
  );
}

/**
 * Bounded multi-step tool-calling loop (the `agent-loop` node). Tools are the
 * caller's whitelisted subset (built via defineSdkTool); an empty set is a
 * plain completion. The step cap is enforced by the SDK's stopWhen primitive.
 */
export async function sdkAgentLoop(
  opts: SdkCallOpts & { tools?: ToolSet; maxSteps?: number },
): Promise<SdkTextResult> {
  const maxSteps = opts.maxSteps ?? 8;
  return cascade(opts, async (model) => {
    const res = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
      tools: opts.tools,
      stopWhen: stepCountIs(maxSteps),
    });
    return {
      text: res.text,
      steps: res.steps.length,
      usage: toUsage(res.totalUsage),
      costUsd: orCost(res.providerMetadata),
    };
  });
}

// ── Tool + mock construction (kept here so callers never import `ai`) ────────

export interface SdkToolSpec {
  description: string;
  /** Plain JSON-schema object for the tool input. */
  inputSchema: Record<string, unknown>;
  execute: (input: unknown) => Promise<unknown> | unknown;
}

/** Build an SDK tool from a JSON-schema spec (agent-loop whitelist entries). */
export function defineSdkTool(spec: SdkToolSpec): ToolSet[string] {
  return tool({
    description: spec.description,
    inputSchema: jsonSchema<unknown>(spec.inputSchema),
    execute: spec.execute,
  }) as ToolSet[string];
}

export type MockStep =
  | { kind: "text"; text: string }
  | { kind: "tool-call"; toolName: string; input?: unknown }
  | { kind: "error"; message: string };

export interface MockModelHandle {
  model: LanguageModel;
  /** Mutated per call: call count + the serialized prompt of each call. */
  stats: { calls: number; prompts: string[] };
}

/**
 * Zero-network mock LanguageModel for unit tests. Consumes `steps` one per
 * call; with `repeatLast` the final step repeats forever (agent-loop caps).
 */
export function mockLanguageModel(
  steps: MockStep[],
  opts: { modelId?: string; repeatLast?: boolean } = {},
): MockModelHandle {
  const stats: MockModelHandle["stats"] = { calls: 0, prompts: [] };
  const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: 5, text: 5, reasoning: undefined },
  };
  const model = new MockLanguageModelV3({
    modelId: opts.modelId ?? "mock/model",
    doGenerate: async (options) => {
      const i = stats.calls;
      stats.calls += 1;
      stats.prompts.push(JSON.stringify(options.prompt));
      const step = opts.repeatLast ? steps[Math.min(i, steps.length - 1)] : steps[i];
      if (!step) throw new Error(`mock model exhausted after ${steps.length} steps`);
      if (step.kind === "error") throw new Error(step.message);
      if (step.kind === "tool-call") {
        return {
          content: [
            {
              type: "tool-call" as const,
              toolCallId: `call-${i}`,
              toolName: step.toolName,
              input: JSON.stringify(step.input ?? {}),
            },
          ],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
          warnings: [],
        };
      }
      return {
        content: [{ type: "text" as const, text: step.text }],
        finishReason: { unified: "stop" as const, raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
  return { model: model as LanguageModel, stats };
}
