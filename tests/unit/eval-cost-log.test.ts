// Eval model calls record their cost (#583).
//
// The #569 audit could measure eval latency but not dollars: eval LLM calls
// logged `generations.jsonl` rows without `cost_usd`. callLLM now asks the
// provider for usage, returns it, and writes `cost_usd` + `tokens` into the same
// row every other paid call uses, so cost per gate is a group-by on `endpoint`.
// The provider is stubbed through globalThis.fetch (no mock.module, #072); no
// network, no paid call.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { callLLM as openrouterCallLLM } from "../../cli/lib/providers/openrouter";
import { chatUsageFromResponse, usageLogFields } from "../../cli/lib/providers/shared";
import { deepVisionEvaluate } from "../../cli/lib/eval/deep-vision";
import { readGenerations, type GenerationEntry } from "../../cli/lib/gen-log";
import { evalGateForEndpoint, evalSpendByGate, summarizeEvalSpend } from "../../cli/lib/spend";

const PROJECT = "eval-cost-583";
const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
let tmp: TmpRoot;
let bodies: Array<Record<string, unknown>> = [];

type Reply = { usage?: unknown; headers?: Record<string, string>; content?: string };

function stubProvider(replies: Reply[]): void {
  let i = 0;
  bodies = [];
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    const r = replies[Math.min(i++, replies.length - 1)]!;
    return new Response(
      JSON.stringify({
        id: "gen-test",
        choices: [{ message: { content: r.content ?? '{"overall_verdict":"pass"}' }, finish_reason: "stop" }],
        ...(r.usage !== undefined ? { usage: r.usage } : {}),
      }),
      { status: 200, headers: { "content-type": "application/json", ...(r.headers ?? {}) } },
    );
  }) as typeof fetch;
}

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-eval-cost-583");
  process.env.OPENROUTER_API_KEY = "test-key";
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  tmp.cleanup();
});

const USAGE = { prompt_tokens: 51_000, completion_tokens: 1_200, total_tokens: 52_200, cost: 0.0731 };

describe("usage parsing", () => {
  test("tokens and billed cost from the response body", () => {
    expect(chatUsageFromResponse({ usage: USAGE })).toEqual({
      promptTokens: 51_000,
      completionTokens: 1_200,
      totalTokens: 52_200,
      costUsd: 0.0731,
    });
  });
  test("cost from the x-openrouter-cost header when the body has none", () => {
    const headers = new Headers({ "x-openrouter-cost": "0.0007" });
    expect(chatUsageFromResponse({ usage: { total_tokens: 900 } }, headers)).toEqual({ totalTokens: 900, costUsd: 0.0007 });
  });
  test("nothing usable → undefined, never an estimate", () => {
    expect(chatUsageFromResponse({})).toBeUndefined();
    expect(chatUsageFromResponse({ usage: { cost: "free" } })).toBeUndefined();
    expect(usageLogFields(undefined)).toEqual({});
  });
});

describe("callLLM records cost on the generations.jsonl row", () => {
  test("asks for usage, returns it, and logs cost_usd + tokens", async () => {
    stubProvider([{ usage: USAGE }]);
    const r = await openrouterCallLLM({
      messages: [{ role: "user", content: "judge" }],
      model: "google/gemini-3.1-pro-preview",
      projectId: PROJECT,
      endpoint: "eval/deep-vision/native-video",
      noRetry: true,
    });
    expect(bodies[0]!.usage).toEqual({ include: true });
    expect(r.usage?.costUsd).toBe(0.0731);
    expect(r.text).toBe('{"overall_verdict":"pass"}');

    const rows = await readGenerations(PROJECT);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cost_usd).toBe(0.0731);
    expect(rows[0]!.tokens).toEqual({ prompt: 51_000, completion: 1_200, total: 52_200 });
    expect(rows[0]!.endpoint).toBe("eval/deep-vision/native-video");
  });

  test("a response without usage logs no cost and leaves the result unchanged", async () => {
    stubProvider([{}]);
    const r = await openrouterCallLLM({
      messages: [{ role: "user", content: "hi" }],
      projectId: PROJECT,
      endpoint: "openrouter/eval-hook",
      noRetry: true,
    });
    expect(r.usage).toBeUndefined();
    const rows = await readGenerations(PROJECT);
    expect(rows[0]!.cost_usd).toBeUndefined();
    expect("tokens" in (rows[0] as object) && rows[0]!.tokens !== undefined).toBe(false);
  });
});

describe("an eval run records its cost", () => {
  test("the full-video pass logs the billed cost and surfaces it on the result", async () => {
    stubProvider([{ usage: USAGE }]);
    const video = path.join(tmp.dir, "clip.mp4");
    fs.writeFileSync(video, Buffer.alloc(2_048, 1));
    const r = await deepVisionEvaluate(video, { mode: "native-video", projectId: PROJECT });
    expect(r.costUsd).toBe(0.0731);
    expect(r.upload).toEqual({ proxied: false, originalBytes: 2_048, uploadBytes: 2_048 });
    const rows = await readGenerations(PROJECT);
    expect(rows.map((x) => [x.endpoint, x.cost_usd])).toEqual([["eval/deep-vision/native-video", 0.0731]]);
  });

  test("cost per gate sums across calls", async () => {
    stubProvider([
      { usage: USAGE },
      { usage: { total_tokens: 900 }, headers: { "x-openrouter-cost": "0.0007" } },
      { usage: { total_tokens: 800, cost: 0.0006 } },
      {},
    ]);
    for (const endpoint of ["eval/deep-vision/deep-style", "openrouter/eval-hook", "openrouter/eval-hook", "openrouter/eval-captions"]) {
      await openrouterCallLLM({ messages: [{ role: "user", content: "x" }], projectId: PROJECT, endpoint, noRetry: true });
    }
    const s = await evalSpendByGate(PROJECT);
    expect(s.byGate["deep-style"]).toEqual({ calls: 1, costUsd: 0.0731, uncostedCalls: 0, tokens: 52_200 });
    expect(s.byGate["first-frame-hook"]).toEqual({ calls: 2, costUsd: 0.0013, uncostedCalls: 0, tokens: 1_700 });
    expect(s.byGate["captions"]).toEqual({ calls: 1, costUsd: 0, uncostedCalls: 1, tokens: 0 });
    expect(s.totalUsd).toBe(0.0744);
  });
});

describe("endpoint → gate map", () => {
  test("every eval call site label resolves to a gate; generation rows do not", () => {
    expect(evalGateForEndpoint("eval/deep-vision/native-video")).toBe("native-video");
    expect(evalGateForEndpoint("openrouter/eval-vision")).toBe("keyframe");
    expect(evalGateForEndpoint("openrouter/eval-ocr")).toBe("ocr");
    expect(evalGateForEndpoint("openrouter/eval-fidelity")).toBe("product-fidelity");
    expect(evalGateForEndpoint("openrouter/eval-claims")).toBe("claims");
    expect(evalGateForEndpoint("eval/workspace-vision")).toBe("workspace-evaluators");
    expect(evalGateForEndpoint("council-polish-editor")).toBe("council");
    expect(evalGateForEndpoint("google/gemini-3-pro-image-preview")).toBeNull();
  });
  test("summarizeEvalSpend ignores non-eval rows", () => {
    const row = (endpoint: string, cost?: number): GenerationEntry => ({
      timestamp: "2026-10-28T00:00:00.000Z",
      provider: "openrouter",
      model: endpoint,
      endpoint,
      kind: "text",
      input: {},
      status: "ok",
      ...(cost !== undefined ? { cost_usd: cost } : {}),
    });
    const s = summarizeEvalSpend([row("google/gemini-3-pro-image-preview", 0.15), row("openrouter/eval-ocr", 0.001)]);
    expect(Object.keys(s.byGate)).toEqual(["ocr"]);
    expect(s.totalUsd).toBe(0.001);
  });
});
