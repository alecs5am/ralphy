// Dead-letter quarantine + class-aware retry + targeted re-execution (#519).
// Same seams as farm-runner.test.ts: ZERO network, no real sleeps, paid nodes
// mocked via deps.executorOverrides.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir } from "../../cli/lib/paths.js";
import { recordRunApproval } from "../../cli/lib/spend.js";
import { createRun } from "../../cli/lib/run.js";
import {
  fireTick,
  executeGraphRun,
  retryNode,
  downstreamDependents,
} from "../../cli/lib/farm/runner.js";
import type { FarmDeps } from "../../cli/lib/farm/runner.js";
import { listDeadLetters, appendResolution, deadLetterPath } from "../../cli/lib/farm/dead-letter.js";
import type { NodeExecutor } from "../../cli/lib/workflow/executors/types.js";
import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-dead-letter");
  const dir = workspaceDir(WS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: WS }));
}

function node(id: string, type: WorkflowNodeType, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return {
    id,
    type,
    in: {},
    params: {},
    retry: { max: 0, backoff: "exponential" },
    on_fail: "halt",
    cache: "none",
    emit: true,
    ...over,
  };
}

function graphOf(nodes: WorkflowNode[], name = "wf"): WorkflowGraph {
  return { version: "2.0", name, nodes };
}

function readEvents(runId: string): Array<Record<string, unknown>> {
  return fs
    .readFileSync(path.join(runDir(WS, runId), "run-events.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

const noSleep: FarmDeps = { sleep: async () => {} };

// ─── Class-aware retry policy ────────────────────────────────────────────────

describe("class-aware retry (#519)", () => {
  test("permanent filter class skips remaining retries — one attempt, straight to quarantine", async () => {
    seedWorkspace();
    let calls = 0;
    const blocked: NodeExecutor = async () => {
      calls++;
      throw new Error("IMAGE_SAFETY: the generated image was blocked by the safety filter");
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x" }, retry: { max: 3, backoff: "none" }, on_fail: "skip" }),
      node("independent", "template-string", { params: { prompt: "ok" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-text": blocked } });

    // safety-output is permanent: NO second attempt despite retry.max 3.
    expect(calls).toBe(1);
    const events = readEvents(outcome.runId);
    expect(events.filter((e) => e.kind === "node-failed" && e.node === "gen")).toHaveLength(1);
    // Quarantined, and the run still continued per on_fail (record, not control flow).
    const q = events.find((e) => e.kind === "node-quarantined");
    expect(q?.node).toBe("gen");
    expect(q?.errorClass).toBe("moderation");
    expect(q?.filterClass).toBe("safety-output");
    expect(q?.attempts).toBe(1);
    expect(outcome.status).toBe("complete");
    const dead = listDeadLetters(WS);
    expect(dead).toHaveLength(1);
    expect(dead[0]!.resolved).toBe(false);
  });

  test("unknown classification is treated transient: full retry envelope, then quarantine", async () => {
    seedWorkspace();
    let calls = 0;
    const weird: NodeExecutor = async (_n, ctx) => {
      calls++;
      ctx.reportCost(0.25);
      throw new Error("zorble flux desynchronized"); // matches no taxonomy rule
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x" }, retry: { max: 1, backoff: "none" }, on_fail: "skip" }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-text": weird } });

    expect(calls).toBe(2); // retry.max 1 → two attempts (unknown = transient)
    expect(outcome.status).toBe("complete");
    const dead = listDeadLetters(WS);
    expect(dead).toHaveLength(1);
    expect(dead[0]!.attempts).toBe(2);
    expect(dead[0]!.errorClass).toBe("provider-semantic"); // the conservative unmatched fallback
    expect(dead[0]!.costSpentUsd).toBe(0.5); // realized spend across both failed attempts
  });

  test("quarantine entry carries the full re-execution + explanation shape", async () => {
    seedWorkspace();
    const boom: NodeExecutor = async (_n, ctx) => {
      ctx.reportCost(0.1);
      throw new Error("Related to copyright: output resembles a known character");
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x", model: "bytedance/seedance-2.0" }, on_fail: "skip" }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-text": boom } });

    const [entry] = listDeadLetters(WS);
    expect(entry).toBeDefined();
    expect(entry!.run).toBe(outcome.runId);
    expect(entry!.node).toBe("gen");
    expect(entry!.inputsHash).toMatch(/^[0-9a-f]{64}$/); // the #513 recipe hash
    expect(entry!.errorClass).toBe("moderation");
    expect(entry!.filterClass).toBe("copyright");
    expect(entry!.attempts).toBe(1);
    expect(entry!.costSpentUsd).toBe(0.1);
    expect(entry!.providerPayloadExcerpt).toContain("Related to copyright");
    expect(entry!.nextActionHint.length).toBeGreaterThan(0);
    expect(Number.isFinite(Date.parse(entry!.ts))).toBe(true);
    // The store is the per-workspace JSONL under farm/.
    expect(deadLetterPath(WS)).toContain(path.join("workspaces", WS, "farm", "dead-letter.jsonl"));
  });

  test("branch-scoped failures carry the branch index", async () => {
    seedWorkspace();
    const seed: NodeExecutor = async () => ({ output: ["alpha", "beta"] });
    const work: NodeExecutor = async (_n, ctx) => {
      if (ctx.inputs.item === "beta") throw new Error("nsfw content flagged");
      return { output: `made:${ctx.inputs.item}` };
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("seed", "generate-object", { params: { prompt: "x" } }),
      node("fan", "fan-out", { in: { items: "seed.out" } }),
      node("work", "generate-text", { in: { item: "fan.out" }, params: { prompt: "y" }, on_fail: "skip" }),
    ]);
    await fireTick(WS, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": seed, "generate-text": work },
    });
    const [entry] = listDeadLetters(WS);
    expect(entry!.node).toBe("work");
    expect(entry!.branch).toBe(1);
    expect(entry!.filterClass).toBe("safety-input");
  });
});

// ─── Targeted retry ──────────────────────────────────────────────────────────

describe("farm retry (#519)", () => {
  test("re-executes only the node + downstream dependents against journaled inputs", async () => {
    seedWorkspace();
    const calls: Record<string, number> = {};
    let fixed = false;
    const exec: NodeExecutor = async (n) => {
      calls[n.id] = (calls[n.id] ?? 0) + 1;
      if (n.id === "b" && !fixed) throw new Error("zorble flux desynchronized");
      return { output: `${n.id}-out` };
    };
    // tick -> a -> b -> c, plus an independent d (not downstream of b).
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("a", "generate-text", { params: { prompt: "a" } }),
      node("b", "generate-text", { in: { x: "a.out" }, params: { prompt: "b" }, on_fail: "skip" }),
      node("c", "generate-text", { in: { x: "b.out" }, params: { prompt: "c" } }),
      node("d", "generate-text", { params: { prompt: "d" } }),
    ]);
    expect(downstreamDependents(graph, "b")).toEqual(["c"]);

    const run1 = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-text": exec } });
    expect(run1.status).toBe("complete"); // b skipped per on_fail, c cascaded
    expect(calls).toEqual({ a: 1, b: 1, d: 1 });
    expect(listDeadLetters(WS)).toHaveLength(1);

    fixed = true;
    const retry = await retryNode(WS, run1.runId, "wf", graph, "b", {
      ...noSleep,
      executorOverrides: { "generate-text": exec },
    });
    expect(retry.status).toBe("complete");
    expect(retry.invalidated).toEqual(["b", "c"]);
    // b + c re-executed; upstream a and unrelated d were NOT re-executed.
    expect(calls).toEqual({ a: 1, b: 2, c: 1, d: 1 });
    // The journal is append-only: invalidation events, then the new completions.
    const events = readEvents(run1.runId);
    expect(events.filter((e) => e.kind === "node-invalidated").map((e) => e.node)).toEqual(["b", "c"]);
    // Quarantine resolved via an appended resolution line — never a rewrite.
    expect(retry.quarantineResolved).toBe(true);
    expect(listDeadLetters(WS)).toHaveLength(0);
    expect(listDeadLetters(WS, { includeResolved: true })).toHaveLength(1);
    const rawLines = fs.readFileSync(deadLetterPath(WS), "utf8").split("\n").filter(Boolean);
    expect(rawLines).toHaveLength(2); // 1 quarantined + 1 resolved
  });

  test("respects the run spend ledger: over-cap retry halts pre-flight without re-executing", async () => {
    seedWorkspace();
    let calls = 0;
    let fixed = false;
    const paid: NodeExecutor = async (_n, ctx) => {
      calls++;
      ctx.reportCost(0.3);
      if (!fixed) throw new Error("zorble flux desynchronized");
      return { output: "paid" };
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x" }, on_fail: "skip" }),
    ]);
    await createRun({ id: "retry-capped", workspace: WS, title: "capped", workflow: "wf" });
    const run1 = await executeGraphRun(WS, "retry-capped", "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-text": paid },
    });
    expect(run1.status).toBe("complete"); // failed + skipped, $0.30 realized in the journal
    expect(calls).toBe(1);

    // Now a run approval with a cap BELOW the already-realized spend.
    await recordRunApproval("retry-capped", { budgetCapUsd: 0.2, reason: "tiny cap" });
    fixed = true;
    const retry = await retryNode(WS, "retry-capped", "wf", graph, "gen", {
      ...noSleep,
      executorOverrides: { "generate-text": paid },
    });
    expect(retry.status).toBe("halted-budget");
    expect(calls).toBe(1); // the pre-flight gate blocked the paid re-execution
    expect(retry.quarantineResolved).toBe(false);
    expect(listDeadLetters(WS)).toHaveLength(1); // still open
  });

  test("appendResolution is a no-op when nothing is open", () => {
    seedWorkspace();
    expect(appendResolution(WS, "no-such-run", "no-such-node")).toBe(0);
    expect(fs.existsSync(deadLetterPath(WS))).toBe(false);
  });
});
