// Farm notification WIRING (#518) — the runner fires the notify hook on the
// needs-a-human journal events (run-parked / budget-halt / run-failed /
// node-quarantined), and a THROWING notifier never fails the run. ZERO network:
// notify is a mock, paid nodes are executor overrides.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, workflowsDir } from "../../cli/lib/paths.js";
import { fireTick, loadGraphWorkflows } from "../../cli/lib/farm/runner.js";
import type { FarmDeps } from "../../cli/lib/farm/runner.js";
import type { FarmNotification } from "../../cli/lib/farm/notify.js";
import type { NodeExecutor } from "../../cli/lib/workflow/executors/types.js";
import type { WorkflowGraph, WorkflowNode, WorkflowNodeType } from "../../cli/lib/schemas/workflow.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-notify-wire");
  fs.mkdirSync(workspaceDir(WS), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir(WS), "workspace.json"), JSON.stringify({ slug: WS }));
}

function node(id: string, type: WorkflowNodeType, over: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id, type, in: {}, params: {}, retry: { max: 0, backoff: "exponential" }, on_fail: "halt", cache: "none", emit: true, ...over };
}
function graphOf(nodes: WorkflowNode[], name = "wf"): WorkflowGraph {
  return { version: "2.0", name, nodes };
}

/** A notify mock that records every fired notification. */
function recordingNotify(): { deps: Pick<FarmDeps, "notify">; fired: FarmNotification[] } {
  const fired: FarmNotification[] = [];
  return {
    fired,
    deps: {
      notify: async (n) => {
        fired.push(n);
      },
    },
  };
}

const noSleep = { sleep: async () => {} };

describe("runner fires the notify hook", () => {
  test("run-parked fires a run-parked notification with a deep-link", async () => {
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
        ],
      }),
    );
    const { deps, fired } = recordingNotify();
    const wf = loadGraphWorkflows(WS)[0]!;
    const outcome = await fireTick(WS, "gated", wf.graph, { ...noSleep, ...deps });
    expect(outcome.status).toBe("parked-approval");
    const parked = fired.filter((n) => n.event === "run-parked");
    expect(parked).toHaveLength(1);
    expect(parked[0]!.node).toBe("ask");
    expect(parked[0]!.runId).toBe(outcome.runId);
    // Deep-link (no dashboard base configured → relative hash route).
    expect(parked[0]!.url).toBe(`/#${WS}/run/${outcome.runId}`);
  });

  test("budget-halt fires a budget-halt notification", async () => {
    seedWorkspace();
    const paid: NodeExecutor = async (_n, ctx) => {
      ctx.reportCost(1.0);
      return { output: "expensive" };
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { params: { prompt: "x" } }),
      node("guard", "budget-guard", { in: { x: "gen.out" }, params: { max_usd: 0.5 } }),
    ]);
    const { deps, fired } = recordingNotify();
    const outcome = await fireTick(WS, "wf", graph, {
      ...noSleep,
      ...deps,
      executorOverrides: { "generate-text": paid },
    });
    expect(outcome.status).toBe("halted-budget");
    expect(fired.filter((n) => n.event === "budget-halt")).toHaveLength(1);
  });

  test("run-failed fires a run-failed notification", async () => {
    seedWorkspace();
    const boom: NodeExecutor = async () => {
      throw new Error("kaboom");
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      node("gen", "generate-text", { in: { t: "tick.out" }, params: { prompt: "x" } }),
    ]);
    const { deps, fired } = recordingNotify();
    const outcome = await fireTick(WS, "wf", graph, {
      ...noSleep,
      ...deps,
      executorOverrides: { "generate-text": boom },
    });
    expect(outcome.status).toBe("halted-failure");
    expect(fired.filter((n) => n.event === "run-failed")).toHaveLength(1);
  });

  test("node-quarantined fires when retries exhaust and on_fail routes past it", async () => {
    seedWorkspace();
    const boom: NodeExecutor = async () => {
      throw new Error("provider 500");
    };
    const graph = graphOf([
      node("tick", "schedule", { params: { cron: "* * * * *" } }),
      // on_fail: skip so the run keeps going after the quarantine (quarantine is
      // a record, not control flow) — the notification still fires.
      node("gen", "generate-text", { in: { t: "tick.out" }, params: { prompt: "x" }, on_fail: "skip" }),
    ]);
    const { deps, fired } = recordingNotify();
    await fireTick(WS, "wf", graph, { ...noSleep, ...deps, executorOverrides: { "generate-text": boom } });
    expect(fired.filter((n) => n.event === "node-quarantined")).toHaveLength(1);
    expect(fired.find((n) => n.event === "node-quarantined")!.node).toBe("gen");
  });
});

describe("a throwing notifier never fails the run", () => {
  test("run still parks even though notify throws", async () => {
    seedWorkspace();
    fs.mkdirSync(workflowsDir(WS), { recursive: true });
    fs.writeFileSync(
      path.join(workflowsDir(WS), "gated.json"),
      JSON.stringify({
        version: "2.0",
        name: "gated",
        nodes: [
          { id: "tick", type: "schedule", params: { cron: "0 9 * * *" } },
          { id: "ask", type: "approval", params: { reason: "x" } },
        ],
      }),
    );
    const wf = loadGraphWorkflows(WS)[0]!;
    const outcome = await fireTick(WS, "gated", wf.graph, {
      ...noSleep,
      notify: async () => {
        throw new Error("notify blew up");
      },
    });
    // The run is unaffected by the notifier throwing.
    expect(outcome.status).toBe("parked-approval");
  });
});
