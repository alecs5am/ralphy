// LLM node executors (#499): generate-text / generate-object / agent-loop.
//
// All model traffic goes through the AI SDK layer (../../providers/ai-sdk.ts —
// the D-01 allowlisted file); this module never imports `ai`. Every SDK
// attempt is appended to the run/gen log (model, tokens, cost) via ctx.log,
// and every node output lands as an append-only artifact (existing files are
// auto-archived to .vN, invariant #14).

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { protectExistingAsset } from "../../providers/shared.js";
import {
  sdkGenerateText,
  sdkGenerateObject,
  sdkAgentLoop,
  type SdkAttempt,
  type ToolSet,
} from "../../providers/ai-sdk.js";
import type { ExecutorContext, NodeExecutor } from "./types.js";
import { NodeExecutionError } from "./types.js";
import type { WorkflowNode } from "../../schemas/workflow.js";

/** Mirrors callLLM's default (cli/lib/providers/llm.ts). */
const DEFAULT_TEXT_MODEL = "google/gemini-2.5-flash";

/**
 * Fill `{{slot}}` placeholders from the given values. Objects/arrays are
 * JSON-stringified; a missing or null slot throws (a mis-wired graph fails
 * loudly, not with a half-empty prompt).
 */
export function interpolatePrompt(template: string, slots: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, name: string) => {
    const v = slots[name];
    if (v == null) {
      throw new NodeExecutionError(
        "unfilled-slot",
        `prompt slot {{${name}}} has no value (wire an in-port or set params.${name})`,
      );
    }
    return typeof v === "string" ? v : JSON.stringify(v);
  });
}

/** Read `ref` as a file (absolute or workspace-relative) when it exists, else return it as inline text. */
async function readMaybeFileRef(ref: string, ctx: ExecutorContext): Promise<string> {
  for (const candidate of [ref, path.join(ctx.workspaceDir, ref)]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return fs.readFile(candidate, "utf8");
    }
  }
  return ref;
}

/** Resolve params.prompt (file ref or inline) and interpolate {{slots}} from params + in-port values. */
export async function resolveNodePrompt(node: WorkflowNode, ctx: ExecutorContext): Promise<string> {
  const raw = node.params.prompt;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new NodeExecutionError("prompt-missing", `node "${node.id}" (${node.type}) has no params.prompt`);
  }
  const template = await readMaybeFileRef(raw, ctx);
  // In-port values win over same-named params — ports are the wired signal.
  return interpolatePrompt(template, { ...node.params, ...ctx.inputs });
}

/** Append-only artifact write: an existing file is auto-archived to .vN first. */
export async function writeNodeArtifact(
  ctx: ExecutorContext,
  filename: string,
  content: string,
): Promise<string> {
  const dest = path.join(ctx.artifactsDir, filename);
  await fs.mkdir(ctx.artifactsDir, { recursive: true });
  await protectExistingAsset(dest, false);
  await fs.writeFile(dest, content, "utf8");
  return dest;
}

/** Per-attempt gen-log hook: one row per SDK call, tokens + cost included. */
export function attemptLogger(node: WorkflowNode, ctx: ExecutorContext) {
  return async (a: SdkAttempt): Promise<void> => {
    if (a.costUsd) ctx.reportCost(a.costUsd);
    await ctx.log({
      provider: (node.params.provider as string | undefined) ?? "openrouter",
      model: a.model,
      endpoint: a.model,
      kind: "text",
      input: { node: node.id, slot: node.id, project: ctx.projectId, usage: a.usage },
      status: a.status,
      error: a.error,
      latency_ms: a.latencyMs,
      cost_usd: a.costUsd,
      attempt: a.attempt,
      note: `workflow node ${node.id} (${node.type})`,
    });
  };
}

type LlmParams = {
  model?: string;
  system?: string;
  temperature?: number;
  max_tokens?: number;
  fallback_models?: string[];
  schema?: string;
  tools?: string[];
  max_steps?: number;
};

function baseOpts(node: WorkflowNode, ctx: ExecutorContext, prompt: string) {
  const p = node.params as LlmParams;
  return {
    model: p.model ?? DEFAULT_TEXT_MODEL,
    prompt,
    system: p.system,
    temperature: p.temperature,
    maxTokens: p.max_tokens,
    fallbackModels: p.fallback_models,
    modelFactory: ctx.modelFactory,
    onAttempt: attemptLogger(node, ctx),
  };
}

/** `generate-text` — single bounded completion, fallback_models cascade. */
export const generateTextExecutor: NodeExecutor = async (node, ctx) => {
  const prompt = await resolveNodePrompt(node, ctx);
  const res = await sdkGenerateText(baseOpts(node, ctx, prompt));
  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.txt`, res.text);
  return { output: res.text, artifactPath };
};

/** `generate-object` — mandatory structured output; schema is a JSON-schema file ref. */
export const generateObjectExecutor: NodeExecutor = async (node, ctx) => {
  const schemaRef = (node.params as LlmParams).schema;
  if (typeof schemaRef !== "string" || schemaRef.length === 0) {
    throw new NodeExecutionError(
      "schema-missing",
      `generate-object node "${node.id}" requires params.schema (a JSON-schema file ref)`,
    );
  }
  const schemaText = await readMaybeFileRef(schemaRef, ctx);
  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(schemaText) as Record<string, unknown>;
  } catch {
    throw new NodeExecutionError(
      "schema-unreadable",
      `generate-object node "${node.id}": params.schema "${schemaRef}" is not a readable JSON-schema file`,
    );
  }
  const prompt = await resolveNodePrompt(node, ctx);
  const res = await sdkGenerateObject({ ...baseOpts(node, ctx, prompt), schema });
  const artifactPath = await writeNodeArtifact(
    ctx,
    `${node.id}.json`,
    JSON.stringify(res.object, null, 2),
  );
  return { output: res.object, artifactPath };
};

/** `agent-loop` — bounded multi-step tool loop; tools come from the ctx whitelist. */
export const agentLoopExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as LlmParams;
  const tools: Record<string, unknown> = {};
  for (const name of p.tools ?? []) {
    const t = ctx.tools?.[name];
    if (!t) {
      throw new NodeExecutionError(
        "tool-not-whitelisted",
        `agent-loop node "${node.id}" requests tool "${name}" which the run does not expose`,
      );
    }
    tools[name] = t;
  }
  const prompt = await resolveNodePrompt(node, ctx);
  const res = await sdkAgentLoop({
    ...baseOpts(node, ctx, prompt),
    tools: tools as ToolSet,
    maxSteps: p.max_steps,
  });
  const artifactPath = await writeNodeArtifact(ctx, `${node.id}.txt`, res.text);
  return { output: res.text, artifactPath };
};
