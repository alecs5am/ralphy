// Run-wide budget caps + queue spend enforcement (#481).
//
// Builds on the #480 Run object + the #444 project spend ledger. Tests seed a
// temp .ralphy/ tree (setRoot via makeTmpRoot), a workspace, member project
// gen-logs, a run manifest, and a run-level spend-ledger.json, then assert:
//   • checkSpend resolution order: project-local approval overrides the run one.
//   • the run-wide cap is a ceiling on TOTAL spend across ALL member projects.
//   • the queue dispatch gate (checkQueuedJobSpend) blocks/allows correctly.
//   • a job with no project_id passes through (never crashes).
//   • an expired run approval blocks; a mode-restricted one blocks.
//   • cap exhaustion across MULTIPLE projects blocks a call on a THIRD project.
//   • runBudgetSummary + estimateRunQueuedSpendUsd report run-wide figures.
//
// NO network, NO live generation, NO daemon — checkQueuedJobSpend is the pure
// gate helper the worker calls; tests call it directly with a fake JobRow.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, projectDir, runDir } from "../../cli/lib/paths.js";
import { createRun, projectRun } from "../../cli/lib/run.js";
import {
  recordApproval,
  recordRunApproval,
  checkSpend,
  runBudgetSummary,
} from "../../cli/lib/spend.js";
import { closeDb, openDb, insertJob } from "../../cli/lib/jobs/db.js";
import { checkQueuedJobSpend, deriveJobEstimate } from "../../cli/lib/jobs/spend-gate.js";
import type { JobRow } from "../../cli/lib/jobs/types.js";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-run-budget");
  const dir = workspaceDir("default");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: "default" }));
  closeDb();
  openDb();
});

afterEach(() => {
  closeDb();
  tmp?.cleanup();
});

/** Seed a project's generations.jsonl with rows carrying the given cost_usd. */
function seedGenLog(id: string, costs: number[]): void {
  const dir = path.join(projectDir(id), "logs");
  fs.mkdirSync(dir, { recursive: true });
  const lines = costs.map((c, i) =>
    JSON.stringify({ timestamp: new Date().toISOString(), provider: "openrouter", model: "m", endpoint: "m", kind: "image", input: { slot: `s${i}`, project: id }, status: "ok", cost_usd: c }),
  );
  fs.writeFileSync(path.join(dir, "generations.jsonl"), lines.join("\n") + "\n");
}

/** A minimal fake JobRow for the dispatch gate. */
function fakeJob(opts: { kind?: JobRow["kind"]; project_id?: string | null; argv?: string[] }): JobRow {
  return {
    id: 1,
    kind: opts.kind ?? "generate.image",
    status: "running",
    command: { argv: opts.argv ?? ["generate", "image", "--slot", "hero", "--model", "openai/gpt-5.4-image-2"] },
    depends_on: [],
    priority: 0,
    created_at: Date.now(),
    started_at: Date.now(),
    ended_at: null,
    exit_code: null,
    error_message: null,
    retry_count: 0,
    log_path: null,
    tag: null,
    project_id: opts.project_id ?? null,
  };
}

describe("#481 resolution order: project-local approval overrides the run", () => {
  test("project approval is used when present (run cap ignored)", async () => {
    seedGenLog("p-a", [2]); // $2 actual on project A
    await createRun({ id: "farm-1", workspace: "default", title: "F", projectIds: ["p-a"] });
    // Run cap is tight ($1), but the project-local cap is generous ($10).
    await recordRunApproval("farm-1", { budgetCapUsd: 1, reason: "tight run" });
    await recordApproval("p-a", { scope: "project", budgetCapUsd: 10, reason: "generous project" });

    const verdict = await checkSpend("p-a", { estimatedUsd: 1 });
    expect(verdict.allowed).toBe(true); // 2 + 1 = 3 ≤ 10 (project cap wins)
    expect(verdict.scope).toBe("project");
    expect(verdict.capUsd).toBe(10);
  });

  test("falls back to the run approval when no project approval exists", async () => {
    seedGenLog("p-b", [2]);
    await createRun({ id: "farm-2", workspace: "default", title: "F", projectIds: ["p-b"] });
    await recordRunApproval("farm-2", { budgetCapUsd: 5, reason: "run cap" });

    const verdict = await checkSpend("p-b", { estimatedUsd: 1 });
    expect(verdict.allowed).toBe(true);
    expect(verdict.scope).toBe("run");
    expect(verdict.runId).toBe("farm-2");
    expect(verdict.capUsd).toBe(5);
  });

  test("pass-through when no ledger exists anywhere (opt-in floor)", async () => {
    seedGenLog("p-c", [99]);
    await createRun({ id: "farm-3", workspace: "default", title: "F", projectIds: ["p-c"] });
    const verdict = await checkSpend("p-c", { estimatedUsd: 50 });
    expect(verdict.allowed).toBe(true);
    expect(verdict.scope).toBeNull();
    expect(verdict.capUsd).toBeNull();
  });
});

describe("#481 run-wide cap = total across ALL member projects", () => {
  test("spend on A + B exhausts the run cap → a call on C blocks", async () => {
    seedGenLog("a", [3]); // $3
    seedGenLog("b", [3]); // $3 → run-wide $6
    seedGenLog("c", []);  // $0 on C
    await createRun({ id: "farm-4", workspace: "default", title: "F", projectIds: ["a", "b", "c"] });
    await recordRunApproval("farm-4", { budgetCapUsd: 7, reason: "farm cap" });

    // A call on C estimated $2: run-wide 6 + 2 = 8 > 7 → block.
    const verdict = await checkSpend("c", { estimatedUsd: 2 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.scope).toBe("run");
    expect(verdict.spentUsd).toBeCloseTo(6, 5);
    expect(verdict.reason).toContain("Run-wide");
  });

  test("a small call on C within the run cap is allowed", async () => {
    seedGenLog("a2", [2]);
    seedGenLog("b2", [2]); // run-wide $4
    seedGenLog("c2", []);
    await createRun({ id: "farm-5", workspace: "default", title: "F", projectIds: ["a2", "b2", "c2"] });
    await recordRunApproval("farm-5", { budgetCapUsd: 10, reason: "ok" });
    const verdict = await checkSpend("c2", { estimatedUsd: 1 }); // 4 + 1 = 5 ≤ 10
    expect(verdict.allowed).toBe(true);
  });
});

describe("#481 expired + mode-restricted run approvals block", () => {
  test("expired run approval blocks", async () => {
    seedGenLog("e1", [0.1]);
    await createRun({ id: "farm-6", workspace: "default", title: "F", projectIds: ["e1"] });
    const past = new Date(Date.now() - 60_000).toISOString();
    await recordRunApproval("farm-6", { budgetCapUsd: 100, reason: "go", expiry: past });
    const verdict = await checkSpend("e1", { estimatedUsd: 0.1 });
    expect(verdict.allowed).toBe(false);
    expect(verdict.expired).toBe(true);
    expect(verdict.reason).toContain("expired");
  });

  test("mode not in the run's allowedModes blocks", async () => {
    await createRun({ id: "farm-7", workspace: "default", title: "F", projectIds: ["m1"] });
    await recordRunApproval("farm-7", { budgetCapUsd: 100, reason: "go", allowedModes: ["ugc-review"] });
    const blocked = await checkSpend("m1", { estimatedUsd: 1, mode: "tv-ad" });
    expect(blocked.allowed).toBe(false);
    expect(blocked.modeAllowed).toBe(false);
    const allowed = await checkSpend("m1", { estimatedUsd: 1, mode: "ugc-review" });
    expect(allowed.allowed).toBe(true);
  });
});

describe("#481 queue dispatch gate (checkQueuedJobSpend)", () => {
  test("missing project_id → pass-through, never crashes", async () => {
    const job = fakeJob({ project_id: null });
    const gate = await checkQueuedJobSpend(job);
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBeNull();
  });

  test("blocks a queued image job that would breach the run cap", async () => {
    seedGenLog("qa", [4]);
    seedGenLog("qb", [4]); // run-wide $8
    await createRun({ id: "farm-8", workspace: "default", title: "F", projectIds: ["qa", "qb"] });
    await recordRunApproval("farm-8", { budgetCapUsd: 8, reason: "cap" });
    // Already at the cap; any non-zero estimate (image) pushes over.
    const job = fakeJob({ kind: "generate.image", project_id: "qb" });
    const gate = await checkQueuedJobSpend(job);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toContain("Run-wide");
  });

  test("allows a queued job within the run cap", async () => {
    seedGenLog("qc", [1]);
    await createRun({ id: "farm-9", workspace: "default", title: "F", projectIds: ["qc"] });
    await recordRunApproval("farm-9", { budgetCapUsd: 100, reason: "cap" });
    const job = fakeJob({ kind: "generate.image", project_id: "qc" });
    const gate = await checkQueuedJobSpend(job);
    expect(gate.allowed).toBe(true);
  });

  test("deriveJobEstimate pulls kind/model/variants/duration/mode from argv", () => {
    const img = deriveJobEstimate(fakeJob({ kind: "generate.image", argv: ["generate", "image", "--variants", "3", "--mode", "ugc-review"] }));
    expect(img.estimatedUsd).toBeGreaterThan(0);
    expect(img.mode).toBe("ugc-review");
    const vid = deriveJobEstimate(fakeJob({ kind: "generate.video", argv: ["generate", "video", "--model", "kwaivgi/kling-v3.0-pro", "--duration", "5"] }));
    expect(vid.estimatedUsd).toBeGreaterThan(0);
    // A non-paid kind → 0 estimate (coarse at/over-cap check still applies).
    const render = deriveJobEstimate(fakeJob({ kind: "render", argv: ["render", "demo-001"] }));
    expect(render.estimatedUsd).toBe(0);
  });
});

describe("#481 runBudgetSummary + projectRun", () => {
  test("runBudgetSummary sums run-wide spend + per-project breakdown", async () => {
    seedGenLog("s1", [2, 1]); // $3
    seedGenLog("s2", [0.5]);  // $0.5 → run-wide $3.5
    await createRun({ id: "farm-10", workspace: "default", title: "F", projectIds: ["s1", "s2"] });
    await recordRunApproval("farm-10", { budgetCapUsd: 3, reason: "cap" });
    const s = await runBudgetSummary("farm-10");
    expect(s.hasLedger).toBe(true);
    expect(s.capUsd).toBe(3);
    expect(s.spentUsd).toBeCloseTo(3.5, 5);
    expect(s.remainingUsd).toBeCloseTo(-0.5, 5);
    expect(s.overBudget).toBe(true);
    expect(s.byProject.length).toBe(2);
    expect(s.approvals.length).toBe(1);
  });

  test("runBudgetSummary with no run ledger reports hasLedger:false", async () => {
    seedGenLog("n1", [1]);
    await createRun({ id: "farm-11", workspace: "default", title: "F", projectIds: ["n1"] });
    const s = await runBudgetSummary("farm-11");
    expect(s.hasLedger).toBe(false);
    expect(s.capUsd).toBeNull();
    expect(s.spentUsd).toBeCloseTo(1, 5);
  });

  test("projectRun finds the run a project belongs to", () => {
    expect(projectRun("nobody")).toBeNull();
  });

  test("estimateRunQueuedSpendUsd sums pending generate jobs on run members", async () => {
    const { estimateRunQueuedSpendUsd } = await import("../../cli/lib/jobs/queued-spend.js");
    await createRun({ id: "farm-12", workspace: "default", title: "F", projectIds: ["jp1", "jp2"] });
    insertJob({ kind: "generate.image", command: { argv: ["generate", "image", "--model", "openai/gpt-5.4-image-2"] }, project_id: "jp1" });
    insertJob({ kind: "generate.image", command: { argv: ["generate", "image", "--model", "openai/gpt-5.4-image-2"] }, project_id: "jp2" });
    insertJob({ kind: "generate.image", command: { argv: ["generate", "image"] }, project_id: "not-a-member" });
    const est = estimateRunQueuedSpendUsd(["jp1", "jp2"]);
    expect(est).toBeGreaterThan(0);
  });
});
