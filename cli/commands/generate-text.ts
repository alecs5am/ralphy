import type { Command } from "commander";
import { getCommandContext } from "../lib/context-state.js";
import { DomainError } from "../lib/errors/domain.js";
import { generationInput } from "../lib/generation-input.js";
import { out } from "../lib/output.js";
import { resolveConnector } from "../lib/providers/registry.js";
import type { CallLLMResult } from "../lib/providers/types.js";
import { finishRun, finishRunAttempt, projectRunFailure, startRun, startRunAttempt } from "../lib/store/runs.js";

/** Text follows the same captured credential scope and durable attempt ledger as media. */
export async function generateText(input: { model: string; prompt: string; provider?: string; signal?: AbortSignal }) {
  const context = getCommandContext();
  if (!context) throw new DomainError("E_INPUT_INVALID", undefined, { field: "workspace", detail: "Choose a workspace or project for text generation", verb: "generate text" });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/.test(input.model) || !input.prompt.trim() || input.prompt.length > 100_000 || input.prompt.includes("\0")) {
    throw new DomainError("E_INPUT_INVALID", undefined, { field: "prompt", detail: "Choose a model and provide text instructions under 100,000 characters", verb: "generate text" });
  }
  input.signal?.throwIfAborted();
  const connector = resolveConnector("text", input.provider);
  const run = startRun({ workspaceId: context.workspaceId, ...(context.projectId ? { projectId: context.projectId } : {}), ...(context.kind === "session" ? { agentSessionId: context.sessionId } : {}), kind: "generate.text", label: "Text generation" });
  const attempt = startRunAttempt({ runId: run.id, provider: connector.id, model: input.model, request: generationInput([{ role: "prompt", value: input.prompt }], []) });
  let result: CallLLMResult;
  try {
    result = await connector.callLLM!({ model: input.model, messages: [{ role: "user", content: input.prompt }], maxTokens: 8192, noRetry: true, signal: input.signal });
    input.signal?.throwIfAborted();
    if (typeof result.text !== "string" || !result.text.trim() || result.text.length > 100_000) throw new Error("The text model returned empty or oversized content");
  } catch (error) {
    const projected = projectRunFailure(error, { provider: connector.id });
    const state = input.signal?.aborted ? "cancelled" : "failed";
    finishRunAttempt(attempt.id, { state, error: projected });
    finishRun(run.id, { state, error: projected });
    throw projected;
  }
  const reported = (result.raw as { usage?: { cost?: unknown } } | null)?.usage?.cost;
  const costUsd = typeof reported === "number" && Number.isFinite(reported) && reported >= 0 ? reported : null;
  finishRunAttempt(attempt.id, { state: "succeeded", response: { characters: result.text.length, latencyMs: result.latencyMs }, costUsd });
  finishRun(run.id, { state: "succeeded" });
  return { text: result.text, runId: run.id, model: result.model, provider: connector.id, costUsd };
}

export function registerGenerateText(cmd: Command) {
  cmd.command("text")
    .description("Generate text with the scoped connector, recording one attempt without automatic retries. Cost remains unknown unless the provider reports it.")
    .requiredOption("--model <id>", "Text model ID")
    .option("--provider <id>", "Text provider connector", "openrouter")
    .requiredOption("--stdin", "Read text instructions from stdin (up to 100,000 characters)")
    .option("--no-retry", "Text requests are never automatically resubmitted")
    .action(async (opts: { model: string; provider: string }) => {
      let prompt = "";
      process.stdin.setEncoding("utf8");
      for await (const chunk of process.stdin) {
        prompt += chunk.toString("utf8");
        if (prompt.length > 100_000) throw new DomainError("E_INPUT_INVALID", undefined, { field: "prompt", detail: "Text instructions exceed 100,000 characters", verb: "generate text" });
      }
      const controller = new AbortController();
      const cancel = () => controller.abort(new Error("Text request stopped locally; the provider may still complete it"));
      process.once("SIGTERM", cancel); process.once("SIGINT", cancel);
      try { out(await generateText({ ...opts, prompt, signal: controller.signal })); }
      finally { process.removeListener("SIGTERM", cancel); process.removeListener("SIGINT", cancel); }
    });
}
