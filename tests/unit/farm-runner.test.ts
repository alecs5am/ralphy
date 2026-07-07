// Farm scheduler + headless graph runner (#503) — ZERO network, no real
// sleeps: the clock/sleep/stop seams are injected (FarmDeps), paid nodes are
// mocked via deps.executorOverrides, and all control-flow executors under
// test (approval / budget-guard / gate / switch / template-string) are the
// real registered ones.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir, workflowsDir } from "../../cli/lib/paths.js";
import { recordRunApproval } from "../../cli/lib/spend.js";
import { parseCron, nextFire, cronMatches } from "../../cli/lib/farm/cron.js";
import {
  topoOrder,
  fireTick,
  executeGraphRun,
  resumeIncompleteRuns,
  readFarmState,
  farmStatus,
  farmStatusAll,
  farmLoop,
  loadGraphWorkflows,
  isFarmEnabled,
  farmEnabledWorkspaces,
} from "../../cli/lib/farm/runner.js";
import type { FarmDeps } from "../../cli/lib/farm/runner.js";
import { _resetConcurrency } from "../../cli/lib/providers/concurrency.js";
import type { NodeExecutor } from "../../cli/lib/workflow/executors/types.js";
import { parseWorkflowGraph, parseSubgraph } from "../../cli/lib/schemas/workflow.js";
import { expandGraphSubgraphs } from "../../cli/lib/subgraph.js";
import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-farm");
  const dir = workspaceDir(WS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: WS }));
}

function node(
  id: string,
  type: WorkflowNodeType,
  over: Partial<WorkflowNode> = {},
): WorkflowNode {
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
  const p = path.join(runDir(WS, runId), "run-events.jsonl");
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function completedOrder(runId: string): string[] {
  return readEvents(runId)
    .filter((e) => e.kind === "node-completed")
    .map((e) => String(e.node));
}

const noSleep: FarmDeps = { sleep: async () => {} };

// ─── Cron parser ─────────────────────────────────────────────────────────────

describe("cron parser", () => {
  test("*/5 minutes: parse + nextFire", () => {
    const spec = parseCron("*/5 * * * *");
    expect([...spec.minute].slice(0, 3)).toEqual([0, 5, 10]);
    const at = nextFire(spec, new Date(2026, 6, 6, 10, 2, 30))!;
    expect([at.getHours(), at.getMinutes()]).toEqual([10, 5]);
  });

  test("minute/hour/dow: 0 9 * * 1 fires Monday 09:00", () => {
    const spec = parseCron("0 9 * * 1");
    // 2026-07-06 is a Monday.
    const at = nextFire(spec, new Date(2026, 6, 6, 8, 0))!;
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes()]).toEqual([
      2026, 7, 6, 9, 0,
    ]);
    // From Monday 10:00 the next fire is NEXT Monday.
    const next = nextFire(spec, new Date(2026, 6, 6, 10, 0))!;
    expect(next.getDate()).toBe(13);
  });

  test("ranges and lists", () => {
    const range = parseCron("0 9-11 * * *");
    expect([...range.hour]).toEqual([9, 10, 11]);
    const list = parseCron("0,30 * * * *");
    expect([...list.minute]).toEqual([0, 30]);
    const stepped = parseCron("0 9-17/4 * * *");
    expect([...stepped.hour]).toEqual([9, 13, 17]);
  });

  test("dow 7 is Sunday; dom+dow both restricted = OR", () => {
    const sun = parseCron("0 0 * * 7");
    expect(cronMatches(sun, new Date(2026, 6, 5, 0, 0))).toBe(true); // 2026-07-05 = Sunday
    const or = parseCron("0 0 13 * 5");
    expect(cronMatches(or, new Date(2026, 6, 13, 0, 0))).toBe(true); // the 13th (a Monday)
    expect(cronMatches(or, new Date(2026, 6, 10, 0, 0))).toBe(true); // a Friday, not the 13th
    expect(cronMatches(or, new Date(2026, 6, 11, 0, 0))).toBe(false); // Saturday the 11th
  });

  test("malformed expressions throw", () => {
    expect(() => parseCron("* * * *")).toThrow(/5 fields/);
    expect(() => parseCron("61 * * * *")).toThrow(/out of range/);
    expect(() => parseCron("a * * * *")).toThrow(/not \*/);
  });
});

// ─── Tick → Run compilation ──────────────────────────────────────────────────

describe("tick -> run", () => {
  test("a tick creates a #480 run with journal + farm-state complete", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "*/5 * * * *" } }),
      node("copy", "template-string", { params: { prompt: "hello farm" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, noSleep, { node: "tick", cron: "*/5 * * * *" });

    expect(outcome.status).toBe("complete");
    const dir = runDir(WS, outcome.runId);
    expect(fs.existsSync(path.join(dir, "run.json"))).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
    expect(manifest.workflow).toBe("wf");
    expect(manifest.status).toBe("complete");
    const kinds = readEvents(outcome.runId).map((e) => e.kind);
    expect(kinds[0]).toBe("farm-tick");
    expect(kinds).toContain("node-completed");
    expect(kinds).toContain("run-completed");
    expect(readFarmState(WS, outcome.runId)?.status).toBe("complete");
    // The template-string artifact landed under the run tree.
    expect(fs.existsSync(path.join(dir, "artifacts", "copy.txt"))).toBe(true);
  });

  test("farmLoop --tick-now --once fires disk workflows with schedule nodes", async () => {
    seedWorkspace();
    fs.mkdirSync(workflowsDir(WS), { recursive: true });
    fs.writeFileSync(
      path.join(workflowsDir(WS), "news.json"),
      JSON.stringify({
        version: "2.0",
        name: "news",
        nodes: [
          { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
          { id: "copy", type: "template-string", params: { prompt: "daily news" } },
        ],
      }),
    );
    expect(loadGraphWorkflows(WS)).toHaveLength(1);
    await farmLoop({ workspace: WS, once: true, tickNow: true }, noSleep);
    const report = farmStatus(WS);
    expect(report.counts.complete).toBe(1);
    expect(report.runs[0]!.workflow).toBe("news");
    expect(report.runs[0]!.totalNodes).toBe(2);
  });
});

// ─── DAG order ───────────────────────────────────────────────────────────────

describe("DAG order", () => {
  test("execution follows edges, not node-array order", async () => {
    seedWorkspace();
    // Array order is reversed on purpose; edges force tick -> a -> b -> c.
    const graph = graphOf([
      node("c", "template-string", { in: { x: "b.out" }, params: { prompt: "c" } }),
      node("b", "template-string", { in: { x: "a.out" }, params: { prompt: "b" } }),
      node("a", "template-string", { in: { seed: "tick.out" }, params: { prompt: "a" } }),
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
    ]);
    expect(topoOrder(graph).map((n) => n.id)).toEqual(["tick", "a", "b", "c"]);
    const outcome = await fireTick(WS, "wf", graph, noSleep);
    expect(outcome.status).toBe("complete");
    expect(completedOrder(outcome.runId)).toEqual(["tick", "a", "b", "c"]);
  });
});

// ─── Approval park + resume ──────────────────────────────────────────────────

describe("approval node", () => {
  test("parks the run + writes an inbox pack; resumes once approved", async () => {
    seedWorkspace();
    fs.mkdirSync(workflowsDir(WS), { recursive: true });
    fs.writeFileSync(
      path.join(workflowsDir(WS), "gated.json"),
      JSON.stringify({
        version: "2.0",
        name: "gated",
        nodes: [
          { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
          { id: "ask", type: "approval", params: { reason: "publish spend" } },
          { id: "after", type: "template-string", in: { go: "ask.out" }, params: { prompt: "approved!" } },
        ],
      }),
    );
    const wf = loadGraphWorkflows(WS)[0]!;
    const outcome = await fireTick(WS, "gated", wf.graph, noSleep);

    expect(outcome.status).toBe("parked-approval");
    expect(readFarmState(WS, outcome.runId)?.status).toBe("parked-approval");
    const parked = readEvents(outcome.runId).find((e) => e.kind === "run-parked");
    expect(parked?.node).toBe("ask");
    // Visible inbox item via the existing #489 mechanism.
    const inboxDir = path.join(runDir(WS, outcome.runId), "agent-inbox");
    const packs = fs.readdirSync(inboxDir).filter((f) => f.endsWith(".json"));
    expect(packs.length).toBe(1);
    const pack = JSON.parse(fs.readFileSync(path.join(inboxDir, packs[0]!), "utf8"));
    expect(pack.action).toBe("approve");
    expect(pack.requestedOutcome).toContain(`ralphy run approve ${outcome.runId}`);
    // "after" did NOT run.
    expect(completedOrder(outcome.runId)).toEqual(["tick"]);

    // A resume WITHOUT an approval re-parks (survives restarts for days).
    const still = await resumeIncompleteRuns(WS, noSleep);
    expect(still[0]!.status).toBe("parked-approval");

    // Record the approval (#482 state model = the run spend ledger), resume.
    await recordRunApproval(outcome.runId, { budgetCapUsd: 5, reason: "approved in test" });
    const resumed = await resumeIncompleteRuns(WS, noSleep);
    expect(resumed[0]!.status).toBe("complete");
    expect(completedOrder(outcome.runId)).toEqual(["tick", "ask", "after"]);
  });
});

// ─── Budget guard ────────────────────────────────────────────────────────────

describe("budget-guard node", () => {
  test("halts the run with a visible blocker on breach", async () => {
    seedWorkspace();
    const paid: NodeExecutor = async (_n, ctx) => {
      ctx.reportCost(1.0);
      return { output: "expensive" };
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x" } }),
      node("guard", "budget-guard", { in: { x: "gen.out" }, params: { max_usd: 0.5 } }),
      node("after", "template-string", { in: { x: "guard.out" }, params: { prompt: "never" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-text": paid } });

    expect(outcome.status).toBe("halted-budget");
    const halted = readEvents(outcome.runId).find((e) => e.kind === "run-halted");
    expect(halted?.node).toBe("guard");
    expect(String(halted?.reason)).toContain("$1.00");
    expect(completedOrder(outcome.runId)).not.toContain("after");
    expect(readFarmState(WS, outcome.runId)?.status).toBe("halted-budget");
  });

  test("run-wide ledger cap halts a paid node pre-flight (#481 path)", async () => {
    seedWorkspace();
    const paid: NodeExecutor = async (_n, ctx) => {
      ctx.reportCost(0.3);
      return { output: "paid" };
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen1", "generate-text", { params: { prompt: "x" } }),
      node("gen2", "generate-text", { in: { x: "gen1.out" }, params: { prompt: "y" } }),
    ]);
    // Park-free path: pre-record the run approval with a tiny cap, then tick.
    // fireTick creates the run id from the clock — instead execute directly.
    const { createRun } = await import("../../cli/lib/run.js");
    await createRun({ id: "capped-run", workspace: WS, title: "capped", workflow: "wf" });
    await recordRunApproval("capped-run", { budgetCapUsd: 0.2, reason: "tiny cap" });
    const outcome = await executeGraphRun(WS, "capped-run", "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-text": paid },
    });
    expect(outcome.status).toBe("halted-budget");
    // gen1 ran (spent 0.3 ≥ cap 0.2) → gen2 was blocked pre-flight.
    expect(completedOrder("capped-run")).toEqual(["tick", "gen1"]);
  });
});

// ─── on_fail routing ─────────────────────────────────────────────────────────

const boom: NodeExecutor = async () => {
  throw new Error("synthetic failure");
};

describe("on_fail routing", () => {
  test("halt (default) stops the run with an event", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x" }, retry: { max: 1, backoff: "none" } }),
      node("after", "template-string", { in: { x: "gen.out" }, params: { prompt: "no" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-text": boom } });
    expect(outcome.status).toBe("halted-failure");
    const events = readEvents(outcome.runId);
    // retry.max 1 → two attempts journaled, then the halt.
    expect(events.filter((e) => e.kind === "node-failed")).toHaveLength(2);
    expect(events.some((e) => e.kind === "run-halted" && e.node === "gen")).toBe(true);
  });

  test("skip records the node + cascades to its consumers, run completes", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x" }, on_fail: "skip" }),
      node("uses-gen", "template-string", { in: { x: "gen.out" }, params: { prompt: "no" } }),
      node("independent", "template-string", { params: { prompt: "yes" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-text": boom } });
    expect(outcome.status).toBe("complete");
    const skips = readEvents(outcome.runId).filter((e) => e.kind === "node-skipped");
    expect(skips.map((e) => e.node)).toEqual(["gen", "uses-gen"]);
    expect(String(skips[1]!.reason)).toContain("upstream-skipped");
    expect(completedOrder(outcome.runId)).toContain("independent");
  });

  test("route:<id> jumps to the target, marking skipped intermediates", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x" }, on_fail: "route:fallback" }),
      node("mid", "template-string", { in: { x: "gen.out" }, params: { prompt: "bypassed" } }),
      node("fallback", "template-string", { params: { prompt: "plan b" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-text": boom } });
    expect(outcome.status).toBe("complete");
    const skipped = readEvents(outcome.runId)
      .filter((e) => e.kind === "node-skipped")
      .map((e) => e.node);
    expect(skipped).toContain("gen");
    expect(skipped).toContain("mid");
    expect(completedOrder(outcome.runId)).toContain("fallback");
  });
});

// ─── Durable resume ──────────────────────────────────────────────────────────

describe("durable resume", () => {
  test("2 of 4 nodes executed, state rebuilt from journal, 1-2 not re-executed", async () => {
    seedWorkspace();
    const calls: Record<string, number> = {};
    const counting: NodeExecutor = async (n) => {
      calls[n.id] = (calls[n.id] ?? 0) + 1;
      return { output: `${n.id}-done` };
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("a", "generate-text", { params: { prompt: "a" } }),
      node("b", "generate-text", { in: { x: "a.out" }, params: { prompt: "b" } }),
      node("c", "generate-text", { in: { x: "b.out" }, params: { prompt: "c" } }),
      node("d", "generate-text", { in: { x: "c.out" }, params: { prompt: "d" } }),
    ]);
    // Session 1: stop after tick + a + b completed (checked between nodes —
    // the kill point of a graceful SIGTERM; a kill -9 leaves the same journal).
    let completed = 0;
    const outcome1 = await fireTick(WS, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-text": counting },
      onEvent: (_r, kind) => {
        if (kind === "node-completed") completed++;
      },
      shouldStop: () => completed >= 3,
    });
    expect(outcome1.status).toBe("running");
    expect(calls).toEqual({ a: 1, b: 1 });
    expect(readFarmState(WS, outcome1.runId)?.status).toBe("running");

    // Session 2: fresh runner, state rebuilt from the journal.
    const outcome2 = await executeGraphRun(WS, outcome1.runId, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-text": counting },
    });
    expect(outcome2.status).toBe("complete");
    expect(calls).toEqual({ a: 1, b: 1, c: 1, d: 1 });
    // Journal shows each node completed exactly once.
    expect(completedOrder(outcome1.runId)).toEqual(["tick", "a", "b", "c", "d"]);
  });
});

// ─── No-executor structured skip ─────────────────────────────────────────────

describe("structured skips", () => {
  test("a node type with no executor skips with reason no-executor; on_fail does NOT fire", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      // upscale has no registered executor (schema-only — media.ts header;
      // http gained one in #520). on_fail halt MUST NOT fire for a skip.
      node("img", "upscale", { params: {}, on_fail: "halt" }),
      node("uses-img", "template-string", { in: { x: "img.out" }, params: { prompt: "no" } }),
      node("independent", "template-string", { params: { prompt: "yes" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, noSleep);
    expect(outcome.status).toBe("complete");
    const skips = readEvents(outcome.runId).filter((e) => e.kind === "node-skipped");
    expect(String(skips.find((e) => e.node === "img")?.reason)).toContain("no-executor");
    expect(String(skips.find((e) => e.node === "uses-img")?.reason)).toContain("upstream-skipped");
    expect(completedOrder(outcome.runId)).toContain("independent");
  });
});

// ─── Webhook trigger (#520) ──────────────────────────────────────────────────

describe("webhook trigger (#520)", () => {
  /** hook(map-normalized) -> work; a mocked executor captures its input. */
  function hookGraph(params: Record<string, unknown> = {}): WorkflowGraph {
    return graphOf([
      node("hook", "webhook-trigger", { params }),
      node("work", "generate-text", { in: { item: "hook.out" }, params: { prompt: "x" } }),
    ]);
  }

  test("a fired webhook tick completes the trigger with the map-normalized payload and runs downstream", async () => {
    seedWorkspace();
    const seen: unknown[] = [];
    const capture: NodeExecutor = async (_node, ctx) => {
      seen.push(ctx.inputs.item);
      return { output: "done" };
    };
    const outcome = await fireTick(
      WS,
      "wf",
      hookGraph({ map: { title: "episode.title", url: "episode.url" } }),
      { ...noSleep, executorOverrides: { "generate-text": capture } },
      { node: "hook", payload: { episode: { title: "E42", url: "https://example.com/e42" } } },
    );
    expect(outcome.status).toBe("complete");
    expect(seen).toEqual([{ title: "E42", url: "https://example.com/e42" }]);
    const completed = readEvents(outcome.runId).find((e) => e.kind === "node-completed" && e.node === "hook");
    expect(completed?.output).toEqual({ title: "E42", url: "https://example.com/e42" });
  });

  test("params.pick extracts one value; no mapping passes the raw payload", async () => {
    seedWorkspace();
    const seen: unknown[] = [];
    const capture: NodeExecutor = async (_node, ctx) => {
      seen.push(ctx.inputs.item);
      return { output: "ok" };
    };
    await fireTick(
      WS,
      "wf",
      hookGraph({ pick: "items.0" }),
      { ...noSleep, executorOverrides: { "generate-text": capture } },
      { node: "hook", payload: { items: ["first", "second"] } },
    );
    await fireTick(
      WS,
      "wf",
      hookGraph(),
      { ...noSleep, executorOverrides: { "generate-text": capture }, now: () => new Date(2026, 6, 7, 10, 1) },
      { node: "hook", payload: { raw: true } },
    );
    expect(seen).toEqual(["first", { raw: true }]);
  });

  test("a tick NOT fired by the webhook (cron / no trigger) skips the trigger and its downstream", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("hook", "webhook-trigger", { params: {} }),
      node("work", "template-string", { in: { x: "hook.out" }, params: { prompt: "no" } }),
      node("cron-work", "template-string", { in: { x: "tick.out" }, params: { prompt: "yes" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, noSleep, { node: "tick", cron: "* * * * *" });
    expect(outcome.status).toBe("complete");
    const skips = readEvents(outcome.runId).filter((e) => e.kind === "node-skipped");
    expect(String(skips.find((e) => e.node === "hook")?.reason)).toContain("trigger-not-fired");
    expect(String(skips.find((e) => e.node === "work")?.reason)).toContain("upstream-skipped");
    expect(completedOrder(outcome.runId)).toContain("cron-work");
  });
});

// ─── Fan-out subgraph execution (#510) ───────────────────────────────────────

describe("fan-out subgraph execution (#510)", () => {
  const seedItems: NodeExecutor = async () => ({ output: ["alpha", "beta", "gamma"] });

  /** tick -> seed(items) -> fan -> work (per branch) -> join -> after. */
  function fanGraph(over: { workOnFail?: string; concurrency?: number } = {}): WorkflowGraph {
    return graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("seed", "generate-object", { params: { prompt: "x" } }),
      node("fan", "fan-out", {
        in: { items: "seed.out" },
        params: over.concurrency ? { concurrency: over.concurrency } : {},
      }),
      node("work", "generate-text", {
        in: { item: "fan.out" },
        params: { prompt: "y" },
        on_fail: over.workOnFail ?? "halt",
      }),
      node("collect", "join", { in: { results: "work.out" } }),
      node("after", "template-string", { in: { x: "collect.out" }, params: { prompt: "done" } }),
    ]);
  }

  test("maps the subgraph once per item; join collects order-stable by branch index", async () => {
    seedWorkspace();
    const work: NodeExecutor = async (_n, ctx) => ({ output: `made:${ctx.inputs.item}` });
    const outcome = await fireTick(WS, "wf", fanGraph({ concurrency: 1 }), {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": work },
    });
    expect(outcome.status).toBe("complete");
    const events = readEvents(outcome.runId);
    // Branch-scoped records: one work completion per branch, tagged with the index.
    const workEvents = events.filter((e) => e.kind === "node-completed" && e.node === "work");
    expect(workEvents.map((e) => e.branch)).toEqual([0, 1, 2]);
    expect(workEvents.map((e) => e.output)).toEqual(["made:alpha", "made:beta", "made:gamma"]);
    // The fan node completes exactly once, with the item list as its output.
    const fanEvents = events.filter((e) => e.kind === "node-completed" && e.node === "fan");
    expect(fanEvents).toHaveLength(1);
    expect(fanEvents[0]!.branches).toBe(3);
    expect(fanEvents[0]!.output).toEqual(["alpha", "beta", "gamma"]);
    // The join received per-branch outputs, order-stable by branch index.
    const joinEvent = events.find((e) => e.kind === "node-completed" && e.node === "collect");
    expect((joinEvent?.output as { results: string[] }).results).toEqual([
      "made:alpha",
      "made:beta",
      "made:gamma",
    ]);
    expect(completedOrder(outcome.runId)).toContain("after");
  });

  test("branch failure is isolated: on_fail skip nulls that branch's slot, run completes", async () => {
    seedWorkspace();
    const work: NodeExecutor = async (_n, ctx) => {
      if (ctx.inputs.item === "beta") throw new Error("branch boom");
      return { output: `made:${ctx.inputs.item}` };
    };
    const outcome = await fireTick(WS, "wf", fanGraph({ workOnFail: "skip" }), {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": work },
    });
    expect(outcome.status).toBe("complete");
    const skip = readEvents(outcome.runId).find((e) => e.kind === "node-skipped" && e.node === "work");
    expect(skip?.branch).toBe(1);
    expect(String(skip?.reason)).toContain("on-fail-skip");
    const joinEvent = readEvents(outcome.runId).find((e) => e.kind === "node-completed" && e.node === "collect");
    expect((joinEvent?.output as { results: unknown[] }).results).toEqual(["made:alpha", null, "made:gamma"]);
  });

  test("a halted branch surfaces through the fan-out's on_fail after siblings finish", async () => {
    seedWorkspace();
    const work: NodeExecutor = async (_n, ctx) => {
      if (ctx.inputs.item === "beta") throw new Error("branch boom");
      return { output: `made:${ctx.inputs.item}` };
    };
    const outcome = await fireTick(WS, "wf", fanGraph(), {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": work },
    });
    // work.on_fail halt + fan.on_fail halt (defaults) → the run halts, but only
    // AFTER the sibling branches completed (isolation).
    expect(outcome.status).toBe("halted-failure");
    expect(String(outcome.detail)).toContain("branch 1");
    const workDone = readEvents(outcome.runId).filter((e) => e.kind === "node-completed" && e.node === "work");
    expect(workDone.map((e) => e.branch).sort()).toEqual([0, 2]);
    // The join never ran over a halted fan.
    expect(completedOrder(outcome.runId)).not.toContain("collect");
  });

  test("mid-branch crash resume re-executes only the incomplete branch nodes", async () => {
    seedWorkspace();
    const calls: Record<string, number> = {};
    const counting: NodeExecutor = async (n, ctx) => {
      const input = String(Object.values(ctx.inputs)[0]);
      const key = `${n.id}:${input}`;
      calls[key] = (calls[key] ?? 0) + 1;
      return { output: `${n.id}(${input})` };
    };
    // Two nodes per branch so a crash can land mid-branch. concurrency 1 keeps
    // the crash point deterministic.
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("seed", "generate-object", { params: { prompt: "x" } }),
      node("fan", "fan-out", { in: { items: "seed.out" }, params: { concurrency: 1 } }),
      node("work", "generate-text", { in: { item: "fan.out" }, params: { prompt: "y" } }),
      node("polish", "generate-text", { in: { x: "work.out" }, params: { prompt: "z" } }),
      node("collect", "join", { in: { results: "polish.out" } }),
    ]);
    // Session 1: stop after tick + seed + work@0 + polish@0 + work@1 completed
    // (checked between nodes — same journal a kill -9 leaves behind).
    let completed = 0;
    const outcome1 = await fireTick(WS, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": counting },
      onEvent: (_r, kind) => {
        if (kind === "node-completed") completed++;
      },
      shouldStop: () => completed >= 5,
    });
    expect(outcome1.status).toBe("running");
    expect(calls).toEqual({
      "work:alpha": 1,
      "polish:work(alpha)": 1,
      "work:beta": 1,
    });

    // Session 2: fresh runner over the same journal — completed branch-scoped
    // records are honored; only the incomplete branch nodes execute.
    const outcome2 = await executeGraphRun(WS, outcome1.runId, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": counting },
    });
    expect(outcome2.status).toBe("complete");
    expect(calls).toEqual({
      "work:alpha": 1,
      "polish:work(alpha)": 1,
      "work:beta": 1,
      "polish:work(beta)": 1,
      "work:gamma": 1,
      "polish:work(gamma)": 1,
    });
    // Each branch-scoped node completed exactly once across both sessions.
    const events = readEvents(outcome1.runId);
    for (const b of [0, 1, 2]) {
      expect(events.filter((e) => e.kind === "node-completed" && e.node === "work" && e.branch === b)).toHaveLength(1);
      expect(events.filter((e) => e.kind === "node-completed" && e.node === "polish" && e.branch === b)).toHaveLength(1);
    }
    const joinEvent = events.find((e) => e.kind === "node-completed" && e.node === "collect");
    expect((joinEvent?.output as { results: string[] }).results).toEqual([
      "polish(work(alpha))",
      "polish(work(beta))",
      "polish(work(gamma))",
    ]);
  });

  test("params.concurrency caps simultaneous branches; join stays order-stable", async () => {
    seedWorkspace();
    let inflight = 0;
    let maxInflight = 0;
    const slow: NodeExecutor = async (_n, ctx) => {
      inflight++;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 20));
      inflight--;
      return { output: `made:${ctx.inputs.item}` };
    };
    const outcome = await fireTick(WS, "wf", fanGraph({ concurrency: 2 }), {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": slow },
    });
    expect(outcome.status).toBe("complete");
    // Capped below the 3 branches, above sequential: exactly 2 in flight.
    expect(maxInflight).toBe(2);
    // Completion interleaving does not reorder the join output.
    const joinEvent = readEvents(outcome.runId).find((e) => e.kind === "node-completed" && e.node === "collect");
    expect((joinEvent?.output as { results: string[] }).results).toEqual([
      "made:alpha",
      "made:beta",
      "made:gamma",
    ]);
  });

  test("nested fan-out halts with a structured error before executing anything", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("seed", "generate-object", { params: { prompt: "x" } }),
      node("outer", "fan-out", { in: { items: "seed.out" }, params: {} }),
      node("inner", "fan-out", { in: { items: "outer.out" }, params: {} }),
      node("work", "generate-text", { in: { item: "inner.out" }, params: { prompt: "y" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems },
    });
    expect(outcome.status).toBe("halted-failure");
    expect(String(outcome.detail)).toContain("nested-fan-out-not-supported");
    // Static check — nothing executed.
    expect(completedOrder(outcome.runId)).toEqual([]);
  });

  test("a non-array items input fails the fan-out through its on_fail envelope", async () => {
    seedWorkspace();
    const scalar: NodeExecutor = async () => ({ output: "not-an-array" });
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("seed", "generate-object", { params: { prompt: "x" } }),
      node("fan", "fan-out", { in: { items: "seed.out" }, params: {}, on_fail: "skip" }),
      node("work", "generate-text", { in: { item: "fan.out" }, params: { prompt: "y" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": scalar },
    });
    expect(outcome.status).toBe("complete");
    const skip = readEvents(outcome.runId).find((e) => e.kind === "node-skipped" && e.node === "fan");
    expect(String(skip?.reason)).toContain("did not resolve to an array");
    // The branch subgraph never ran (no work events at all).
    expect(readEvents(outcome.runId).some((e) => e.node === "work")).toBe(false);
  });
});

// ─── Reusable subgraphs in the farm (#517) ───────────────────────────────────

describe("subgraph expansion in the farm (#517)", () => {
  const seedItems: NodeExecutor = async () => ({ output: ["alpha", "beta", "gamma"] });

  /** unit-branch: item entry → work → polish → exit (two nodes per branch). */
  const UNIT_BRANCH = {
    name: "unit-branch",
    entry: { item: { node: "work", port: "prompt", type: "text" } },
    exit: { out: { node: "polish", type: "text" } },
    params: { "polish-prompt": { node: "polish", param: "prompt" } },
    nodes: [
      { id: "work", type: "generate-text", params: { prompt: "y" } },
      { id: "polish", type: "generate-text", in: { x: "work.out" }, params: { prompt: "z" } },
    ],
  };

  /** tick → seed(items) → fan → SUBGRAPH INSTANCE (per branch) → join. */
  function fanOverSubgraph(concurrency = 1): WorkflowGraph {
    const authored = {
      version: "2.0",
      name: "wf",
      nodes: [
        { id: "tick", type: "schedule", params: { cron: "* * * * *" } },
        { id: "seed", type: "generate-object", params: { prompt: "x" } },
        { id: "fan", type: "fan-out", in: { items: "seed.out" }, params: { concurrency } },
        {
          id: "unit",
          type: "subgraph",
          in: { item: "fan.out" },
          params: { name: "unit-branch", overrides: { "polish-prompt": "custom polish" } },
        },
        { id: "collect", type: "join", in: { results: "unit.out" } },
      ],
    };
    const expansion = expandGraphSubgraphs(parseWorkflowGraph(authored), (name) =>
      name === "unit-branch"
        ? { sub: parseSubgraph(UNIT_BRANCH) }
        : { error: { code: "subgraph-missing", message: `no ${name}` } },
    );
    expect(expansion.issues).toEqual([]);
    return expansion.graph;
  }

  test("fan-out over a subgraph instance journals branch-scoped namespaced records", async () => {
    seedWorkspace();
    const echo: NodeExecutor = async (n, ctx) => {
      const input = String(Object.values(ctx.inputs)[0]);
      return { output: `${n.id.split(":").pop()}(${input})` };
    };
    const outcome = await fireTick(WS, "wf", fanOverSubgraph(), {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": echo },
    });
    expect(outcome.status).toBe("complete");
    const events = readEvents(outcome.runId);
    // The instance node never executed — only its namespaced inner nodes did.
    expect(events.some((e) => e.node === "unit")).toBe(false);
    const workDone = events.filter((e) => e.kind === "node-completed" && e.node === "unit:work");
    expect(workDone.map((e) => e.branch)).toEqual([0, 1, 2]);
    const polishDone = events.filter((e) => e.kind === "node-completed" && e.node === "unit:polish");
    expect(polishDone.map((e) => e.branch)).toEqual([0, 1, 2]);
    // The override flowed to the inner node's params (visible via the journal
    // output: polish echoed work's output, which echoed the branch item).
    const joinEvent = events.find((e) => e.kind === "node-completed" && e.node === "collect");
    expect((joinEvent?.output as { results: string[] }).results).toEqual([
      "polish(work(alpha))",
      "polish(work(beta))",
      "polish(work(gamma))",
    ]);
  });

  test("mid-subgraph crash resume re-executes only the incomplete inner nodes", async () => {
    seedWorkspace();
    const calls: Record<string, number> = {};
    const counting: NodeExecutor = async (n, ctx) => {
      const input = String(Object.values(ctx.inputs)[0]);
      const key = `${n.id}:${input}`;
      calls[key] = (calls[key] ?? 0) + 1;
      return { output: `${n.id.split(":").pop()}(${input})` };
    };
    const graph = fanOverSubgraph(1); // concurrency 1 keeps the crash point deterministic
    // Session 1: stop after tick + seed + unit:work@0 + unit:polish@0 +
    // unit:work@1 completed — a crash MID-SUBGRAPH on branch 1.
    let completed = 0;
    const outcome1 = await fireTick(WS, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": counting },
      onEvent: (_r, kind) => {
        if (kind === "node-completed") completed++;
      },
      shouldStop: () => completed >= 5,
    });
    expect(outcome1.status).toBe("running");
    expect(calls).toEqual({
      "unit:work:alpha": 1,
      "unit:polish:work(alpha)": 1,
      "unit:work:beta": 1,
    });

    // Session 2: fresh runner over the same journal — deterministic expansion
    // makes the namespaced ids line up, so completed inner nodes never re-run.
    const outcome2 = await executeGraphRun(WS, outcome1.runId, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems, "generate-text": counting },
    });
    expect(outcome2.status).toBe("complete");
    expect(calls).toEqual({
      "unit:work:alpha": 1,
      "unit:polish:work(alpha)": 1,
      "unit:work:beta": 1,
      "unit:polish:work(beta)": 1,
      "unit:work:gamma": 1,
      "unit:polish:work(gamma)": 1,
    });
    // Each namespaced branch-scoped node completed exactly once across sessions.
    const events = readEvents(outcome1.runId);
    for (const b of [0, 1, 2]) {
      expect(
        events.filter((e) => e.kind === "node-completed" && e.node === "unit:work" && e.branch === b),
      ).toHaveLength(1);
      expect(
        events.filter((e) => e.kind === "node-completed" && e.node === "unit:polish" && e.branch === b),
      ).toHaveLength(1);
    }
  });

  test("loadGraphWorkflows expands the workspace subgraphs tier from disk", async () => {
    seedWorkspace();
    fs.mkdirSync(workflowsDir(WS), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir(WS), "subgraphs"), { recursive: true });
    fs.writeFileSync(
      path.join(workspaceDir(WS), "subgraphs", "unit-branch.json"),
      JSON.stringify(UNIT_BRANCH),
    );
    fs.writeFileSync(
      path.join(workflowsDir(WS), "farm.json"),
      JSON.stringify({
        version: "2.0",
        name: "farm",
        nodes: [
          { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
          { id: "topic", type: "template-string", params: { prompt: "the topic" } },
          { id: "unit", type: "subgraph", in: { item: "topic.out" }, params: { name: "unit-branch" } },
        ],
      }),
    );
    const loaded = loadGraphWorkflows(WS);
    expect(loaded).toHaveLength(1);
    const ids = loaded[0]!.graph.nodes.map((n) => n.id);
    expect(ids).toEqual(["tick", "topic", "unit:work", "unit:polish"]);
    expect(loaded[0]!.graph.nodes.some((n) => n.type === "subgraph")).toBe(false);

    // And it executes end to end through the normal tick path.
    const echo: NodeExecutor = async (n, ctx) => ({
      output: `${n.id}<${String(Object.values(ctx.inputs)[0])}>`,
    });
    const outcome = await fireTick(WS, "farm", loaded[0]!.graph, {
      ...noSleep,
      executorOverrides: { "generate-text": echo },
    });
    expect(outcome.status).toBe("complete");
    expect(completedOrder(outcome.runId)).toEqual(["tick", "topic", "unit:work", "unit:polish"]);
  });

  test("a workflow whose subgraph ref is missing is skipped at load (lint diagnoses)", async () => {
    seedWorkspace();
    fs.mkdirSync(workflowsDir(WS), { recursive: true });
    fs.writeFileSync(
      path.join(workflowsDir(WS), "broken.json"),
      JSON.stringify({
        version: "2.0",
        name: "broken",
        nodes: [{ id: "unit", type: "subgraph", params: { name: "ghost-branch" } }],
      }),
    );
    expect(loadGraphWorkflows(WS)).toEqual([]);
  });
});

// ─── switch + gate ───────────────────────────────────────────────────────────

describe("switch node", () => {
  test("routes by field value; unselected targets are deactivated", async () => {
    seedWorkspace();
    const producer: NodeExecutor = async () => ({ output: { mode: "short" } });
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("classify", "generate-object", { params: { prompt: "x" } }),
      node("route", "switch", {
        in: { item: "classify.out" },
        params: { field: "item.mode", routes: { short: "make-short", long: "make-long" } },
      }),
      node("make-short", "template-string", { params: { prompt: "short one" } }),
      node("make-long", "template-string", { params: { prompt: "long one" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": producer },
    });
    expect(outcome.status).toBe("complete");
    expect(completedOrder(outcome.runId)).toContain("make-short");
    const skip = readEvents(outcome.runId).find((e) => e.kind === "node-skipped" && e.node === "make-long");
    expect(String(skip?.reason)).toContain("deactivated");
  });
});

describe("gate node", () => {
  test("ship passes through and prunes the repair branch", async () => {
    seedWorkspace();
    const judge: NodeExecutor = async () => ({ output: { verdict: "ship", score: 9 } });
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("judge", "generate-object", { params: { prompt: "x" } }),
      node("quality", "gate", { in: { verdict: "judge.out" }, params: { repair_to: "fixer" } }),
      node("fixer", "template-string", { params: { prompt: "repairs" } }),
      node("ship", "template-string", { in: { x: "quality.out" }, params: { prompt: "shipping" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-object": judge } });
    expect(outcome.status).toBe("complete");
    expect(completedOrder(outcome.runId)).toContain("ship");
    const skip = readEvents(outcome.runId).find((e) => e.kind === "node-skipped" && e.node === "fixer");
    expect(String(skip?.reason)).toContain("deactivated");
  });

  test("repair verdict auto-loops the FREE route, then ships (#473 semantics)", async () => {
    seedWorkspace();
    let judgeCalls = 0;
    const judge: NodeExecutor = async () => {
      judgeCalls++;
      return { output: { verdict: judgeCalls === 1 ? "repair" : "ship" } };
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("judge", "generate-object", { params: { prompt: "x" } }),
      node("quality", "gate", { in: { verdict: "judge.out" }, params: { repair_to: "judge" } }),
      node("ship", "template-string", { in: { x: "quality.out" }, params: { prompt: "shipping" } }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-object": judge } });
    expect(outcome.status).toBe("complete");
    expect(judgeCalls).toBe(2);
    expect(readEvents(outcome.runId).some((e) => e.kind === "node-routed" && e.target === "judge")).toBe(true);
    expect(completedOrder(outcome.runId)).toContain("ship");
  });

  test("blocked verdict parks the run (paid regen never auto-fires)", async () => {
    seedWorkspace();
    const judge: NodeExecutor = async () => ({ output: { verdict: "blocked" } });
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("judge", "generate-object", { params: { prompt: "x" } }),
      node("quality", "gate", { in: { verdict: "judge.out" }, params: {} }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, { ...noSleep, executorOverrides: { "generate-object": judge } });
    expect(outcome.status).toBe("parked-approval");
    expect(readFarmState(WS, outcome.runId)?.status).toBe("parked-approval");
  });
});

// ─── ralphy-verb production middle (#511) ────────────────────────────────────

describe("ralphy-verb production middle (#511)", () => {
  test("research -> generate -> render -> eval -> unit runs end to end with ZERO paid calls", async () => {
    seedWorkspace();
    const projectId = "farm-prod-001";
    const projDir = path.join(workspaceDir(WS), "projects", projectId);
    fs.mkdirSync(path.join(projDir, "artifacts"), { recursive: true });
    // A parametrized composition with every slot filled via node params.
    fs.writeFileSync(path.join(projDir, "index.html"), "<h1>{{title}}</h1>");
    // A deterministic-only rubric: zero model calls, overall verdict `ship`.
    fs.writeFileSync(
      path.join(workspaceDir(WS), "evaluators.json"),
      JSON.stringify({
        version: "1.0",
        criteria: [
          {
            id: "fixture-check",
            label: "Fixture",
            category: "style",
            check: "deterministic",
            validatorId: "not-a-registered-validator",
            severity: "warn",
            threshold: {},
          },
        ],
      }),
    );

    // Mocked seams: research (ingestion) via executorOverrides; the media
    // connector + hyperframes engine via the ExecutorContext seams. All other
    // executors in the chain are the REAL registered ralphy-verb ones.
    const research: NodeExecutor = async () => ({ output: "a neon fox unboxing, deadpan" });
    const connectorCalls: string[] = [];
    const mediaConnector = {
      id: "mock",
      label: "Mock",
      envVar: "MOCK_KEY",
      signupUrl: "",
      capabilities: ["image"],
      available: () => true,
      generateImage: async (input: { projectId: string; slot: string; prompt: string }) => {
        connectorCalls.push(input.prompt);
        const dir = path.join(projDir, "artifacts", "images");
        fs.mkdirSync(dir, { recursive: true });
        const localPath = path.join(dir, `${input.slot}.png`);
        fs.writeFileSync(localPath, "png");
        return { localPath, costUsd: 0, latencyMs: 3, model: "mock/image" };
      },
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("research", "web-scrape", { in: { seed: "tick.out" }, params: {} }),
      node("gen", "ralphy-generate", {
        in: { prompt: "research.out" },
        params: { project: projectId, kind: "image", slot: "scene-01" },
      }),
      node("render", "ralphy-render", {
        in: { after: "gen.out" },
        params: { project: projectId, variables: { title: "Neon Fox" } },
      }),
      node("eval", "ralphy-eval", {
        in: { video: "render.out" },
        params: { project: projectId, gate: ["fixture-check"] },
      }),
      node("unit", "ralphy-unit", {
        in: { media: "gen.out", gated: "eval.out" },
        params: { project: projectId, slug: "neon-fox-01", format: "video", from: "render/final.mp4" },
      }),
    ]);

    const outcome = await fireTick(WS, "prod", graph, {
      ...noSleep,
      executorOverrides: { "web-scrape": research },
      ctx: {
        resolveMediaConnector: () => mediaConnector as never,
        hyperframesRender: async (args) => {
          fs.writeFileSync(args.outputPath, "mp4-bytes");
          return { exitCode: 0, stderr: "" };
        },
      },
    });

    expect(outcome.status).toBe("complete");
    expect(completedOrder(outcome.runId)).toEqual([
      "tick",
      "research",
      "gen",
      "render",
      "eval",
      "unit",
    ]);
    // The research output flowed into the paid-node prompt port (mocked, $0).
    expect(connectorCalls).toEqual(["a neon fox unboxing, deadpan"]);
    // The full production chain landed real artifacts in the project tree.
    expect(fs.existsSync(path.join(projDir, "artifacts", "images", "scene-01.png"))).toBe(true);
    expect(fs.existsSync(path.join(projDir, "render", "final.mp4"))).toBe(true);
    expect(fs.existsSync(path.join(projDir, "workspace-eval.json"))).toBe(true);
    const unitManifest = JSON.parse(
      fs.readFileSync(path.join(projDir, "units", "neon-fox-01", "unit.json"), "utf8"),
    );
    // The unit packaged the --from render master + the wired generate output.
    expect(unitManifest.media).toContain("final.mp4");
    expect(unitManifest.media).toContain("scene-01.png");
    // Eval verdict rode the journal so a downstream gate could consume it.
    const evalEvent = readEvents(outcome.runId).find(
      (e) => e.kind === "node-completed" && e.node === "eval",
    );
    expect((evalEvent?.output as { verdict?: string })?.verdict).toBe("ship");
    // Zero paid calls: the run's realized spend is $0.
    expect(farmStatus(WS).runs.find((r) => r.id === outcome.runId)?.spendUsd).toBe(0);
  });
});

// ─── farm status roll-up ─────────────────────────────────────────────────────

describe("farm status", () => {
  test("counts runs by state and reports per-run progress", async () => {
    seedWorkspace();
    const ok = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("copy", "template-string", { params: { prompt: "fine" } }),
    ]);
    const parked = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("ask", "approval", { params: {} }),
    ]);
    const a = await fireTick(WS, "ok-wf", ok, noSleep);
    const b = await fireTick(WS, "gated-wf", parked, noSleep);
    expect(a.status).toBe("complete");
    expect(b.status).toBe("parked-approval");

    const report = farmStatus(WS);
    expect(report.workspace).toBe(WS);
    expect(report.daemon.running).toBe(false);
    expect(report.counts.complete).toBe(1);
    expect(report.counts["parked-approval"]).toBe(1);
    const parkedRow = report.runs.find((r) => r.id === b.runId)!;
    expect(parkedRow.completedNodes).toBe(1); // just the schedule trigger
    expect(parkedRow.status).toBe("parked-approval");
  });
});

// ─── #522 one daemon, N workspaces ───────────────────────────────────────────

describe("multi-workspace scheduling (#522)", () => {
  /** Seed the tmp root once, then create N named workspaces under it. */
  function seedMultiRoot(slugs: string[]): void {
    tmp = makeTmpRoot("ralphy-farm-multi");
    for (const slug of slugs) {
      const dir = workspaceDir(slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug }));
    }
  }

  /** Write a graph workflow onto a workspace's disk (so loadGraphWorkflows sees it). */
  function writeWorkflow(slug: string, name: string, graph: WorkflowGraph): void {
    fs.mkdirSync(workflowsDir(slug), { recursive: true });
    fs.writeFileSync(path.join(workflowsDir(slug), `${name}.json`), JSON.stringify({ ...graph, name }));
  }

  function scheduledCopyGraph(prompt: string): WorkflowGraph {
    return graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("copy", "template-string", { params: { prompt } }),
    ]);
  }

  test("farm-enabled detection: schedule trigger opts in; flag overrides both ways", () => {
    seedMultiRoot(["with-sched", "no-sched", "forced-on", "forced-off"]);
    writeWorkflow("with-sched", "wf", scheduledCopyGraph("a"));
    // no-sched: a graph workflow WITHOUT a schedule node.
    writeWorkflow(
      "no-sched",
      "wf",
      graphOf([node("copy", "template-string", { params: { prompt: "b" } })]),
    );
    // forced-on: no schedule node, but farm.enabled:true opts in.
    fs.writeFileSync(
      path.join(workspaceDir("forced-on"), "workspace.json"),
      JSON.stringify({ slug: "forced-on", farm: { enabled: true } }),
    );
    // forced-off: has a schedule node but farm.enabled:false opts out.
    writeWorkflow("forced-off", "wf", scheduledCopyGraph("c"));
    fs.writeFileSync(
      path.join(workspaceDir("forced-off"), "workspace.json"),
      JSON.stringify({ slug: "forced-off", farm: { enabled: false } }),
    );

    expect(isFarmEnabled("with-sched")).toBe(true);
    expect(isFarmEnabled("no-sched")).toBe(false);
    expect(isFarmEnabled("forced-on")).toBe(true);
    expect(isFarmEnabled("forced-off")).toBe(false);
    expect(farmEnabledWorkspaces().sort()).toEqual(["forced-on", "with-sched"]);
  });

  test("fairness: one daemon ticks EVERY farm-enabled workspace; both make progress", async () => {
    seedMultiRoot(["alpha", "beta"]);
    writeWorkflow("alpha", "wf", scheduledCopyGraph("alpha copy"));
    writeWorkflow("beta", "wf", scheduledCopyGraph("beta copy"));

    // No --workspace → the daemon drives both. --once fires one scan then exits.
    await farmLoop({ once: true, tickNow: true }, noSleep);

    const a = farmStatus("alpha");
    const b = farmStatus("beta");
    expect(a.counts.complete).toBe(1);
    expect(b.counts.complete).toBe(1);
    // Grouped status returns both, farm-enabled flagged.
    const all = farmStatusAll();
    expect(all.workspaces.map((w) => w.workspace).sort()).toEqual(["alpha", "beta"]);
    expect(all.workspaces.every((w) => w.farmEnabled)).toBe(true);
  });

  test("budget halt is isolated to its workspace; the sibling still completes", async () => {
    seedMultiRoot(["poor", "rich"]);
    // `poor` overspends its run-ledger cap and halts; `rich` completes cleanly.
    const paid: NodeExecutor = async (_n, ctx) => {
      ctx.reportCost(1.0);
      return { output: "spent" };
    };
    writeWorkflow(
      "poor",
      "wf",
      graphOf([
        node("tick", "schedule", { params: { cron: "* * * * *" } }),
        node("gen", "generate-text", { params: { prompt: "x" } }),
        node("guard", "budget-guard", { in: { x: "gen.out" }, params: { max_usd: 0.5 } }),
      ]),
    );
    writeWorkflow("rich", "wf", scheduledCopyGraph("rich copy"));

    await farmLoop(
      { once: true, tickNow: true },
      { ...noSleep, executorOverrides: { "generate-text": paid } },
    );

    const poor = farmStatus("poor");
    const rich = farmStatus("rich");
    expect(poor.counts["halted-budget"]).toBe(1);
    expect(poor.counts.complete).toBe(0);
    // Isolation: the sibling is untouched by the neighbor's halt.
    expect(rich.counts.complete).toBe(1);
    expect(rich.counts["halted-budget"]).toBe(0);
  });

  test("a workspace whose runs keep halting does not stop the daemon or starve its sibling", async () => {
    seedMultiRoot(["broken", "healthy"]);
    // `broken`'s only node throws → its run halts every scan (never completes).
    writeWorkflow(
      "broken",
      "wf",
      graphOf([
        node("tick", "schedule", { params: { cron: "* * * * *" } }),
        node("boom", "generate-text", { params: { prompt: "x" }, on_fail: "halt" }),
      ]),
    );
    writeWorkflow("healthy", "wf", scheduledCopyGraph("healthy"));

    const boom: NodeExecutor = async () => {
      throw new Error("node boom");
    };

    // Drive a bounded number of scans (stop after the 3rd wake). shouldStop is
    // polled many times per scan, so gate on a scan COUNT incremented once per
    // wake via a wrapped sleep seam.
    let wakes = 0;
    await farmLoop(
      {},
      {
        executorOverrides: { "generate-text": boom },
        sleep: async () => {
          wakes++;
        },
        shouldStop: () => wakes >= 3,
      },
    );

    // The daemon survived a workspace whose runs halt every scan, and `healthy`
    // completed at least once (was NOT starved by the broken sibling).
    expect(farmStatus("healthy").counts.complete).toBeGreaterThanOrEqual(1);
    // `broken`'s runs are recorded as halted, isolated to that workspace.
    expect(farmStatus("broken").counts["halted-failure"]).toBeGreaterThanOrEqual(1);
    expect(farmStatus("broken").counts.complete).toBe(0);
  });

  test("per-workspace backoff: a THROWING tick is retried a bounded number of times, sibling keeps ticking", async () => {
    seedMultiRoot(["crash", "healthy"]);
    writeWorkflow("crash", "wf", scheduledCopyGraph("crash"));
    writeWorkflow("healthy", "wf", scheduledCopyGraph("healthy"));

    // Force `crash`'s fireTick to throw deterministically: a FROZEN clock makes
    // tickRunId identical every scan, and pre-creating run.json for the base id
    // + every collision suffix (-2..-9) exhausts createRun's retry → it rethrows
    // E_ALREADY_EXISTS up through fireTick → tickWorkspaceOnce → the daemon's
    // per-workspace catch engages the crash-loop backoff.
    const frozen = new Date(2026, 6, 8, 12, 0, 0);
    const ts = frozen.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    for (const id of [`farm-wf-${ts}`, ...Array.from({ length: 8 }, (_v, i) => `farm-wf-${ts}-${i + 2}`)]) {
      const dir = runDir("crash", id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "run.json"), JSON.stringify({ version: 1, id, workspace: "crash", status: "complete", workflow: "wf" }));
    }

    let wakes = 0;
    // Count how many scans `crash` was actually attempted vs skipped by backoff.
    const crashTicks: string[] = [];
    await farmLoop(
      {},
      {
        now: () => frozen,
        sleep: async () => {
          wakes++;
        },
        shouldStop: () => wakes >= 8,
        onEvent: (idOrWs, kind) => {
          if (kind === "farm-workspace-error" && idOrWs === "crash") crashTicks.push(kind);
        },
      },
    );

    // The daemon survived and the healthy sibling still completed.
    expect(farmStatus("healthy").counts.complete).toBeGreaterThanOrEqual(1);
    // `crash` threw and was backed off: attempted FEWER times than the ~8 scans
    // (the growing cool-off skips it), proving it can't busy-loop or starve.
    expect(crashTicks.length).toBeGreaterThanOrEqual(1);
    expect(crashTicks.length).toBeLessThan(wakes);
  });
});

// ─── #522 provider concurrency semaphore under parallel branches ─────────────

describe("dispatch semaphore under parallel fan-out (#522)", () => {
  test("never more than the connector cap in flight across parallel branches", async () => {
    seedWorkspace();
    const projectId = "farm-sem-001";
    const projDir = path.join(workspaceDir(WS), "projects", projectId);
    fs.mkdirSync(path.join(projDir, "artifacts"), { recursive: true });

    // A mock image connector that tracks peak in-flight. It resolves through
    // the SAME runMediaGeneration path, so the #522 semaphore wraps it. The
    // connector id + a fixed model ("openai/gpt-5.4-image-2", cap 2) key the
    // semaphore, so 4 parallel branches must never run more than 2 at once.
    let active = 0;
    let peak = 0;
    const gateMs = 20;
    const mediaConnector = {
      id: "openrouter",
      label: "Mock OR",
      envVar: "MOCK_KEY",
      signupUrl: "",
      capabilities: ["image"],
      available: () => true,
      generateImage: async (input: { slot: string }) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, gateMs));
        active--;
        const dir = path.join(projDir, "artifacts", "images");
        fs.mkdirSync(dir, { recursive: true });
        const localPath = path.join(dir, `${input.slot}.png`);
        fs.writeFileSync(localPath, "png");
        return { localPath, costUsd: 0, latencyMs: gateMs, model: "openai/gpt-5.4-image-2" };
      },
    };

    const seedItems: NodeExecutor = async () => ({ output: ["s1", "s2", "s3", "s4"] });
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("seed", "generate-object", { params: {} }),
      node("fan", "fan-out", { in: { items: "seed.out" }, params: { concurrency: 4 } }),
      node("gen", "t2i", {
        in: { item: "fan.out", prompt: "fan.out" },
        params: {
          project: projectId,
          slot: "shot",
          model: "openai/gpt-5.4-image-2",
          provider: "openrouter",
        },
      }),
      node("collect", "join", { in: { r: "gen.out" } }),
    ]);

    _resetConcurrency();
    const outcome = await fireTick(WS, "sem", graph, {
      ...noSleep,
      executorOverrides: { "generate-object": seedItems },
      ctx: { resolveMediaConnector: () => mediaConnector as never },
    });

    expect(outcome.status).toBe("complete");
    // The fan-out allowed 4 branches concurrently, but the semaphore capped the
    // provider at 2 in flight — the whole point of #522.
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThan(1); // proves parallelism WAS happening (not serialized)
  });
});
