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
  farmLoop,
  loadGraphWorkflows,
} from "../../cli/lib/farm/runner.js";
import type { FarmDeps } from "../../cli/lib/farm/runner.js";
import type { NodeExecutor } from "../../cli/lib/workflow/executors/types.js";
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

// ─── No-executor + fan-out structured skips ──────────────────────────────────

describe("structured skips", () => {
  test("a node type with no executor skips with reason no-executor; on_fail does NOT fire", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      // t2i has no registered executor; on_fail halt MUST NOT fire for a skip.
      node("img", "t2i", { params: { model: "x", provider: "y" }, on_fail: "halt" }),
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

  test("fan-out is a structured not-yet-supported skip", async () => {
    seedWorkspace();
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("fan", "fan-out", { params: {} }),
    ]);
    const outcome = await fireTick(WS, "wf", graph, noSleep);
    expect(outcome.status).toBe("complete");
    const skip = readEvents(outcome.runId).find((e) => e.kind === "node-skipped" && e.node === "fan");
    expect(String(skip?.reason)).toContain("fan-out-not-supported");
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
