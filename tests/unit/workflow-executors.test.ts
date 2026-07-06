// LLM node executors on the AI SDK (#499) — zero-network unit tests.
//
// Mock injection: tests never import `ai` — mocks come from
// mockLanguageModel() in cli/lib/providers/ai-sdk.ts (the D-01 allowlisted
// file) and are injected through the ExecutorContext.modelFactory seam.
// coding-agent tests use the resolveBinaryArgv seam (allowlist still applies)
// with real short-lived local processes.

import { describe, test, expect, beforeEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getExecutor,
  registeredExecutorTypes,
  NodeExecutionError,
  type ExecutorContext,
  type ExecutorLogEntry,
} from "../../cli/lib/workflow/executors/index.js";
import { interpolatePrompt } from "../../cli/lib/workflow/executors/llm.js";
import {
  mockLanguageModel,
  defineSdkTool,
  type ModelFactory,
} from "../../cli/lib/providers/ai-sdk.js";
import type { WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-exec-"));
});

type TestCtx = ExecutorContext & { logs: ExecutorLogEntry[]; costs: number[] };

function makeCtx(over: Partial<ExecutorContext> = {}): TestCtx {
  const logs: ExecutorLogEntry[] = [];
  const costs: number[] = [];
  return {
    workspace: "test",
    workspaceDir: dir,
    artifactsDir: path.join(dir, "artifacts"),
    inputs: {},
    log: async (e) => {
      logs.push(e);
    },
    reportCost: (u) => {
      costs.push(u);
    },
    logs,
    costs,
    ...over,
  };
}

function makeNode(
  type: WorkflowNodeType,
  params: Record<string, unknown>,
  id = "n1",
): WorkflowNode {
  return {
    id,
    type,
    in: {},
    params,
    retry: { max: 0, backoff: "exponential" },
    on_fail: "halt",
    cache: "none",
    emit: true,
  };
}

function run(node: WorkflowNode, ctx: ExecutorContext) {
  const exec = getExecutor(node.type);
  if (!exec) throw new Error(`no executor for ${node.type}`);
  return exec(node, ctx);
}

describe("executor registry", () => {
  test("the four LLM node types are registered", () => {
    const types = registeredExecutorTypes();
    for (const t of ["generate-text", "generate-object", "agent-loop", "coding-agent"]) {
      expect(types).toContain(t as WorkflowNodeType);
    }
  });
});

describe("prompt {{slot}} interpolation", () => {
  test("fills slots from values; objects are JSON-stringified", () => {
    const out = interpolatePrompt("Write about {{topic}} using {{facts}}.", {
      topic: "cats",
      facts: { count: 3 },
    });
    expect(out).toBe('Write about cats using {"count":3}.');
  });

  test("an unfilled slot throws a structured error", () => {
    expect(() => interpolatePrompt("Hi {{who}}", {})).toThrow(NodeExecutionError);
    expect(() => interpolatePrompt("Hi {{who}}", {})).toThrow(/\{\{who\}\}/);
  });
});

describe("generate-text executor", () => {
  test("resolves a prompt file ref, interpolates in-port values + params, writes an artifact, logs usage", async () => {
    fs.mkdirSync(path.join(dir, "prompts"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "prompts", "brief.txt"),
      "Write about {{topic}} for {{audience}}.",
    );
    const { model, stats } = mockLanguageModel([{ kind: "text", text: "generated copy" }]);
    const ctx = makeCtx({ inputs: { topic: "cats" }, modelFactory: () => model });
    const node = makeNode("generate-text", {
      model: "test/model",
      prompt: "prompts/brief.txt",
      audience: "developers",
    });

    const res = await run(node, ctx);

    expect(res.output).toBe("generated copy");
    expect(stats.prompts[0]).toContain("Write about cats for developers.");
    expect(fs.readFileSync(res.artifactPath!, "utf8")).toBe("generated copy");
    expect(ctx.logs).toHaveLength(1);
    expect(ctx.logs[0]).toMatchObject({ status: "ok", model: "test/model", provider: "openrouter" });
    expect((ctx.logs[0].input as { usage: { inputTokens: number } }).usage.inputTokens).toBe(10);
  });

  test("re-running the node versions the previous artifact instead of overwriting (append-only)", async () => {
    const factory: ModelFactory = () => mockLanguageModel([{ kind: "text", text: "v2 text" }]).model;
    const ctx = makeCtx({ modelFactory: factory });
    const node = makeNode("generate-text", { prompt: "inline prompt, no slots" });

    const first = await run(node, ctx);
    fs.writeFileSync(first.artifactPath!, "v1 text"); // pin distinct content
    const second = await run(node, ctx);

    expect(fs.readFileSync(second.artifactPath!, "utf8")).toBe("v2 text");
    const archived = path.join(ctx.artifactsDir, "n1.v1.txt");
    expect(fs.existsSync(archived)).toBe(true);
    expect(fs.readFileSync(archived, "utf8")).toBe("v1 text");
  });

  test("fallback_models cascade: a failing primary falls through to the fallback, both attempts logged", async () => {
    const handles = {
      "bad/model": mockLanguageModel([{ kind: "error", message: "provider says no" }]),
      "good/model": mockLanguageModel([{ kind: "text", text: "fallback wins" }]),
    };
    const requested: string[] = [];
    const factory: ModelFactory = (id) => {
      requested.push(id);
      return handles[id as keyof typeof handles].model;
    };
    const ctx = makeCtx({ modelFactory: factory });
    const node = makeNode("generate-text", {
      model: "bad/model",
      prompt: "hello",
      fallback_models: ["good/model"],
    });

    const res = await run(node, ctx);

    expect(res.output).toBe("fallback wins");
    expect(requested).toEqual(["bad/model", "good/model"]);
    expect(ctx.logs.map((l) => [l.model, l.status])).toEqual([
      ["bad/model", "error"],
      ["good/model", "ok"],
    ]);
    expect(ctx.logs[1].attempt).toBe(2);
  });

  test("exhausted cascade rethrows the last provider error", async () => {
    const factory: ModelFactory = () =>
      mockLanguageModel([{ kind: "error", message: "always down" }]).model;
    const ctx = makeCtx({ modelFactory: factory });
    const node = makeNode("generate-text", { model: "a/b", prompt: "x", fallback_models: ["c/d"] });
    await expect(run(node, ctx)).rejects.toThrow("always down");
    expect(ctx.logs).toHaveLength(2);
  });
});

describe("generate-object executor", () => {
  const schemaFile = () => {
    fs.mkdirSync(path.join(dir, "schemas"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "schemas", "fact.json"),
      JSON.stringify({
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      }),
    );
    return "schemas/fact.json";
  };

  test("retries the same model on a validation failure, then succeeds", async () => {
    const { model, stats } = mockLanguageModel([
      { kind: "text", text: "this is not json at all" },
      { kind: "text", text: '{"title":"clean"}' },
    ]);
    const ctx = makeCtx({ modelFactory: () => model });
    const node = makeNode("generate-object", {
      model: "test/model",
      prompt: "emit the fact",
      schema: schemaFile(),
    });

    const res = await run(node, ctx);

    expect(res.output).toEqual({ title: "clean" });
    expect(stats.calls).toBe(2);
    expect(ctx.logs.map((l) => l.status)).toEqual(["error", "ok"]);
    expect(JSON.parse(fs.readFileSync(res.artifactPath!, "utf8"))).toEqual({ title: "clean" });
  });

  test("missing params.schema is a structured error", async () => {
    const ctx = makeCtx({ modelFactory: () => mockLanguageModel([]).model });
    const node = makeNode("generate-object", { prompt: "x" });
    await expect(run(node, ctx)).rejects.toThrow(/requires params\.schema/);
  });
});

describe("agent-loop executor", () => {
  test("the step cap bounds a model that keeps tool-calling", async () => {
    const { model, stats } = mockLanguageModel(
      [{ kind: "tool-call", toolName: "echo", input: { v: "again" } }],
      { repeatLast: true },
    );
    const ctx = makeCtx({
      modelFactory: () => model,
      tools: {
        echo: defineSdkTool({
          description: "echoes its input",
          inputSchema: { type: "object", properties: { v: { type: "string" } } },
          execute: (input) => input,
        }),
      },
    });
    const node = makeNode("agent-loop", {
      model: "test/model",
      prompt: "loop forever",
      tools: ["echo"],
      max_steps: 3,
    });

    const res = await run(node, ctx);

    expect(stats.calls).toBe(3); // hard cap — the mock would loop forever
    expect(typeof res.output).toBe("string");
    expect(fs.existsSync(res.artifactPath!)).toBe(true);
  });

  test("a tool outside the ctx whitelist is rejected", async () => {
    const ctx = makeCtx({ modelFactory: () => mockLanguageModel([]).model, tools: {} });
    const node = makeNode("agent-loop", { prompt: "x", tools: ["shell"] });
    await expect(run(node, ctx)).rejects.toThrow(/not expose/);
  });

  test("an empty whitelist is a plain bounded completion", async () => {
    const { model, stats } = mockLanguageModel([{ kind: "text", text: "done" }]);
    const ctx = makeCtx({ modelFactory: () => model });
    const node = makeNode("agent-loop", { prompt: "just answer", max_steps: 4 });
    const res = await run(node, ctx);
    expect(res.output).toBe("done");
    expect(stats.calls).toBe(1);
  });
});

describe("coding-agent executor", () => {
  test("rejects a binary outside the exact allowlist with a structured error", async () => {
    const ctx = makeCtx();
    const node = makeNode("coding-agent", { binary: "bash", prompt: "rm nothing" });
    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("binary-not-allowed");
    expect((err as NodeExecutionError).message).toContain("claude, codex, gemini");
  });

  test("kills the process on timeout and still writes the transcript artifact", async () => {
    const ctx = makeCtx({ resolveBinaryArgv: () => ["/bin/sleep", "30"] });
    const node = makeNode("coding-agent", { binary: "claude", prompt: "hi", timeout: 250 });
    const t0 = Date.now();
    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(Date.now() - t0).toBeLessThan(5_000); // killed, not awaited to completion
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("timeout");
    const transcript = path.join(ctx.artifactsDir, "n1-transcript.txt");
    expect(fs.readFileSync(transcript, "utf8")).toContain("exit: timeout");
    expect(ctx.logs[0]).toMatchObject({ provider: "coding-agent", status: "error" });
  });

  test("non-zero exit throws (on_fail routing) with stdout/stderr captured", async () => {
    const ctx = makeCtx({
      resolveBinaryArgv: () => ["/bin/sh", "-c", "echo progress; echo boom >&2; exit 3"],
    });
    const node = makeNode("coding-agent", { binary: "codex", prompt: "hi" });
    const err = await run(node, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NodeExecutionError);
    expect((err as NodeExecutionError).code).toBe("nonzero-exit");
    const transcript = fs.readFileSync(path.join(ctx.artifactsDir, "n1-transcript.txt"), "utf8");
    expect(transcript).toContain("progress");
    expect(transcript).toContain("boom");
    expect(transcript).toContain("exit: 3");
  });

  test("a clean run returns stdout and logs an ok row with zero cost", async () => {
    const ctx = makeCtx({ resolveBinaryArgv: (_b, prompt) => ["/bin/echo", prompt] });
    fs.writeFileSync(path.join(dir, "task.md"), "Refactor {{target}} carefully");
    const node = makeNode("coding-agent", {
      binary: "gemini",
      prompt_file: "task.md",
    });
    const res = await run(node, { ...ctx, inputs: { target: "the parser" } });
    expect((res.output as string).trim()).toBe("Refactor the parser carefully");
    expect(ctx.logs[0]).toMatchObject({ status: "ok", cost_usd: 0, model: "gemini" });
  });
});
