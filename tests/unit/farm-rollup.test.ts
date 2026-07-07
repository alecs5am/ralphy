// Farm metrics rollup (#518) — rollup math over fixture journals + graceful
// degrade on a partial (workflow-less) journal. ZERO network, all on-disk.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, runDir, workflowsDir } from "../../cli/lib/paths.js";
import { buildFarmReport, digestSummary } from "../../cli/lib/farm/rollup.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const WS = "test";

function seedWorkspace(): void {
  tmp = makeTmpRoot("ralphy-rollup");
  fs.mkdirSync(workspaceDir(WS), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir(WS), "workspace.json"), JSON.stringify({ slug: WS }));
}

/** Write a graph workflow so the rollup can classify node ids → types. */
function seedWorkflow(name: string, nodes: Array<{ id: string; type: string }>): void {
  fs.mkdirSync(workflowsDir(WS), { recursive: true });
  fs.writeFileSync(
    path.join(workflowsDir(WS), `${name}.json`),
    JSON.stringify({
      version: "2.0",
      name,
      nodes: nodes.map((n) => ({ ...n, in: {}, params: {}, retry: { max: 0, backoff: "exponential" }, on_fail: "halt", cache: "none", emit: true })),
    }),
  );
}

/** Write a run's journal from event rows (ts auto-stamped if absent). */
function seedRun(runId: string, events: Array<Record<string, unknown>>): void {
  fs.mkdirSync(runDir(WS, runId), { recursive: true });
  fs.writeFileSync(
    path.join(runDir(WS, runId), "run-events.jsonl"),
    events.map((e) => JSON.stringify({ ts: "2026-07-06T00:00:00.000Z", ...e })).join("\n") + "\n",
  );
}

describe("buildFarmReport — rollup math", () => {
  test("counts ticks/units/spend, spend-per-unit and spend-per-tick", () => {
    seedWorkspace();
    seedWorkflow("wf", [
      { id: "gen", type: "ralphy-generate" },
      { id: "unit", type: "ralphy-unit" },
      { id: "gate", type: "approval" },
      { id: "pub", type: "publish" },
    ]);
    seedRun("farm-wf-1", [
      { kind: "farm-tick", workflow: "wf" },
      { kind: "node-completed", node: "gen", costUsd: 0.5 },
      { kind: "node-completed", node: "unit" },
      { kind: "node-completed", node: "gate" },
      { kind: "node-completed", node: "pub" },
    ]);
    seedRun("farm-wf-2", [
      { kind: "farm-tick", workflow: "wf" },
      { kind: "node-completed", node: "gen", costUsd: 1.5 },
      { kind: "node-completed", node: "unit" },
    ]);

    const r = buildFarmReport(WS);
    expect(r.totals.ticks).toBe(2);
    expect(r.totals.runs).toBe(2);
    expect(r.totals.unitsProduced).toBe(2); // two ralphy-unit completions
    expect(r.totals.unitsGated).toBe(1);
    expect(r.totals.unitsPublished).toBe(1);
    expect(r.totals.spendUsd).toBe(2);
    expect(r.spendPerUnit).toBe(1); // 2 / 2
    expect(r.spendPerTick).toBe(1); // 2 / 2
    expect(r.partial).toBe(false);
  });

  test("failure / reroute / cache-hit rates + cache saved", () => {
    seedWorkspace();
    seedWorkflow("wf", [{ id: "gen", type: "ralphy-generate" }]);
    seedRun("farm-wf-1", [
      { kind: "node-started", node: "gen" },
      { kind: "node-failed", node: "gen", attempt: 1, costUsd: 0.2 },
      { kind: "node-completed", node: "gen", costUsd: 0.3 },
      { kind: "node-routed", node: "gen", target: "other" },
      { kind: "node-cached", node: "gen", costSavedUsd: 0.4 },
      { kind: "node-quarantined", node: "gen", errorClass: "content" },
    ]);
    const r = buildFarmReport(WS);
    // executions = completed(1) + failed(1) + quarantined(1) = 3
    expect(r.rates.nodeExecutions).toBe(3);
    expect(r.rates.nodeFailures).toBe(1);
    expect(r.rates.failureRate).toBe(Number((1 / 3).toFixed(4)));
    expect(r.rates.nodeReroutes).toBe(1);
    expect(r.rates.rerouteRate).toBe(Number((1 / 3).toFixed(4)));
    expect(r.rates.nodeQuarantines).toBe(1);
    expect(r.totals.cacheHits).toBe(1);
    expect(r.totals.cacheSavedUsd).toBe(0.4);
    // cacheHitRate = hits / (completions + hits) = 1 / (1 + 1)
    expect(r.rates.cacheHitRate).toBe(0.5);
    // realized spend = 0.2 (failed attempt) + 0.3 (completion) = 0.5
    expect(r.totals.spendUsd).toBe(0.5);
  });

  test("median node duration + median approval latency", () => {
    seedWorkspace();
    seedWorkflow("wf", [
      { id: "gen", type: "ralphy-generate" },
      { id: "gate", type: "approval" },
    ]);
    seedRun("farm-wf-1", [
      { kind: "node-started", node: "gen", ts: "2026-07-06T00:00:00.000Z" },
      { kind: "node-completed", node: "gen", ts: "2026-07-06T00:00:02.000Z" }, // 2000ms
      { kind: "run-parked", node: "gate", ts: "2026-07-06T00:00:03.000Z" },
      { kind: "node-completed", node: "gate", ts: "2026-07-06T00:05:03.000Z" }, // +300000ms latency
    ]);
    const r = buildFarmReport(WS);
    expect(r.durations.medianNodeMs).toBe(2000);
    expect(r.durations.nodeDurationSamples).toBe(1);
    expect(r.durations.medianApprovalLatencyMs).toBe(300000);
    expect(r.durations.approvalLatencySamples).toBe(1);
  });

  test("--since window filters events out", () => {
    seedWorkspace();
    seedWorkflow("wf", [{ id: "unit", type: "ralphy-unit" }]);
    seedRun("farm-wf-1", [
      { kind: "node-completed", node: "unit", ts: "2026-06-01T00:00:00.000Z" },
      { kind: "node-completed", node: "unit", ts: "2026-07-10T00:00:00.000Z" },
    ]);
    const r = buildFarmReport(WS, { since: "2026-07-01" });
    expect(r.totals.unitsProduced).toBe(1); // only the July event survives
    expect(r.since).toBe("2026-07-01");
  });
});

describe("buildFarmReport — graceful degrade on partial journals", () => {
  test("torn final line is skipped, not thrown", () => {
    seedWorkspace();
    seedWorkflow("wf", [{ id: "unit", type: "ralphy-unit" }]);
    fs.mkdirSync(runDir(WS, "farm-wf-1"), { recursive: true });
    fs.writeFileSync(
      path.join(runDir(WS, "farm-wf-1"), "run-events.jsonl"),
      `${JSON.stringify({ ts: "2026-07-06T00:00:00Z", kind: "node-completed", node: "unit" })}\n{"kind":"node-comp`, // torn
    );
    const r = buildFarmReport(WS);
    expect(r.totals.unitsProduced).toBe(1);
  });

  test("missing workflow → completions still count but unit types unclassified + partial flag", () => {
    seedWorkspace(); // NO workflow seeded
    seedRun("farm-wf-1", [
      { kind: "farm-tick" },
      { kind: "node-completed", node: "unit", costUsd: 0.7 },
    ]);
    const r = buildFarmReport(WS);
    expect(r.partial).toBe(true);
    expect(r.totals.ticks).toBe(1);
    expect(r.totals.spendUsd).toBe(0.7);
    expect(r.totals.unitsProduced).toBe(0); // no workflow → cannot attribute
    expect(r.rates.nodeExecutions).toBe(1);
  });
});

describe("digestSummary mirrors the report", () => {
  test("title + body reflect the report totals; needsYou surfaces", () => {
    seedWorkspace();
    seedWorkflow("wf", [
      { id: "unit", type: "ralphy-unit" },
      { id: "pub", type: "publish" },
    ]);
    seedRun("farm-wf-1", [
      { kind: "farm-tick" },
      { kind: "node-completed", node: "unit", costUsd: 2 },
      { kind: "node-completed", node: "pub" },
    ]);
    const report = buildFarmReport(WS);
    const digest = digestSummary(report, 3);
    expect(digest.title).toContain('Farm "test"');
    expect(digest.title).toContain("1 produced");
    expect(digest.title).toContain("1 published");
    expect(digest.title).toContain("$2.00 spent");
    expect(digest.title).toContain("3 needs you");
    expect(digest.body).toContain("Needs you: 3");
    // The digest carries the SAME report object (mirrors farm report).
    expect(digest.data.report).toEqual(report);
  });
});
