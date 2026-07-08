// Golden-set quality-regression gate (#535).
//
// Mirrors the #523 mocked-executor discipline: the candidate graph runs headless
// through the synthetic executors (buildSyntheticExecutors, reused by
// runGoldenGate) and scoring uses the workspace evaluators' DETERMINISTIC path
// (noVision). ZERO paid generation, ZERO model calls, ZERO network — every score
// here comes from a registered deterministic validator whose finding count this
// test controls. The candidate graph is the committed farm fixture pipeline.
//
// English-only on disk.

import { describe, test, expect, afterEach, beforeAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir } from "../../cli/lib/paths.js";
import { parseWorkflowGraph, type WorkflowGraph } from "../../cli/lib/schemas/workflow.js";
import { registerWorkspaceValidator } from "../../cli/lib/eval/workspace-evaluators.js";
import type { Finding } from "../../cli/lib/eval/types.js";
import {
  runGoldenGate,
  readGoldenSet,
  writeGoldenSet,
  hasGoldenBaseline,
  goldenDir,
  goldenSetPath,
  GoldenSetSchema,
} from "../../cli/lib/golden.js";

const FIXTURE = path.resolve(import.meta.dir, "../fixtures/farm");

// A deterministic validator whose warn-finding count is controlled per test →
// score = 100 - 6*warns. Registered ONCE; the count is flipped between the
// baseline capture and the candidate run.
let candidateWarns = 0;
beforeAll(() => {
  registerWorkspaceValidator("golden-test-check", (): Finding[] => {
    return Array.from({ length: candidateWarns }, (_v, i) => ({
      id: `GT${i}`,
      category: "test.golden",
      severity: "warn" as const,
      sceneIndex: null,
      timestampSec: null,
      message: `synthetic warn ${i}`,
      fixHint: "n/a",
      fixCommand: null,
    }));
  });
});

let tmp: TmpRoot | undefined;
afterEach(() => {
  tmp?.cleanup();
  tmp = undefined;
});

/** Seed a workspace with the fixture graph + a deterministic-only evaluators config. */
function seedWorkspace(ws: string): WorkflowGraph {
  const dir = workspaceDir(ws);
  fs.mkdirSync(path.join(dir, "workflows"), { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug: ws }) + "\n");
  fs.copyFileSync(path.join(FIXTURE, "pipeline.json"), path.join(dir, "workflows", "cand.json"));
  fs.writeFileSync(
    path.join(dir, "evaluators.json"),
    JSON.stringify({
      version: "1.0",
      criteria: [
        {
          id: "det-crit",
          label: "Deterministic golden criterion",
          category: "style",
          check: "deterministic",
          validatorId: "golden-test-check",
          severity: "warn",
          threshold: {},
        },
        {
          id: "vis-crit",
          label: "Vision golden criterion",
          category: "style",
          check: "vision",
          rubricPrompt: "judge the vibe",
          severity: "warn",
          threshold: {},
        },
      ],
    }),
  );
  return parseWorkflowGraph(JSON.parse(fs.readFileSync(path.join(dir, "workflows", "cand.json"), "utf8")));
}

/** Set a baseline with an explicit det-crit score (bypasses a capture run). */
function setBaseline(ws: string, detScore: number): void {
  const set = readGoldenSet(ws);
  writeGoldenSet(ws, {
    ...set,
    items: set.items.length > 0 ? set.items : [{ id: "g1", unitType: "ugc-review", input: { brief: "x" } }],
    baseline: { "det-crit": { score: detScore, verdict: "pass" } },
    bundleVersion: "1.0.0",
    capturedAt: new Date().toISOString(),
  });
}

describe("golden gate (#535)", () => {
  test("no golden set → gate reports skipped (baselinePresent false, ok true)", async () => {
    tmp = makeTmpRoot("golden-none");
    const graph = seedWorkspace("ws-none");
    const result = await runGoldenGate("ws-none", [graph]);
    expect(hasGoldenBaseline("ws-none")).toBe(false);
    expect(result.baselinePresent).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain("regression gate skipped");
  });

  test("regression beyond tolerance → ok false with a per-criterion delta", async () => {
    tmp = makeTmpRoot("golden-regress");
    const graph = seedWorkspace("ws-reg");
    setBaseline("ws-reg", 94); // baseline det-crit = 94 (as if 1 warn)
    candidateWarns = 3; // candidate scores 100 - 18 = 82 → delta -12 < -5
    const result = await runGoldenGate("ws-reg", [graph]);
    expect(result.ok).toBe(false);
    expect(result.regressions).toHaveLength(1);
    const d = result.deltas.find((x) => x.criterionId === "det-crit")!;
    expect(d.scoring).toBe("deterministic");
    expect(d.baselineScore).toBe(94);
    expect(d.candidateScore).toBe(82);
    expect(d.delta).toBe(-12);
    expect(d.regressed).toBe(true);
  });

  test("within tolerance → ok true, no regression", async () => {
    tmp = makeTmpRoot("golden-tol");
    const graph = seedWorkspace("ws-tol");
    setBaseline("ws-tol", 94);
    candidateWarns = 1; // candidate 94 → delta 0, within tolerance
    const result = await runGoldenGate("ws-tol", [graph]);
    expect(result.ok).toBe(true);
    expect(result.regressions).toHaveLength(0);
    expect(result.deltas.find((x) => x.criterionId === "det-crit")!.delta).toBe(0);
  });

  test("improvement → improved true (all deltas >= 0, at least one > 0)", async () => {
    tmp = makeTmpRoot("golden-improve");
    const graph = seedWorkspace("ws-imp");
    setBaseline("ws-imp", 82); // baseline lower
    candidateWarns = 0; // candidate 100 → delta +18
    const result = await runGoldenGate("ws-imp", [graph]);
    expect(result.ok).toBe(true);
    expect(result.improved).toBe(true);
    expect(result.candidateBaseline["det-crit"]!.score).toBe(100);
  });

  test("vision criterion is deferred-needs-real, never auto-scored/spent", async () => {
    tmp = makeTmpRoot("golden-vision");
    const graph = seedWorkspace("ws-vis");
    setBaseline("ws-vis", 94);
    candidateWarns = 1;
    const result = await runGoldenGate("ws-vis", [graph]);
    const vis = result.deltas.find((x) => x.criterionId === "vis-crit")!;
    expect(vis.scoring).toBe("deferred-needs-real");
    expect(vis.candidateScore).toBeNull();
    expect(vis.delta).toBeNull();
    expect(vis.regressed).toBe(false);
    expect(vis.estimatedCostNote).toContain("deep-vision");
    // The vision criterion carries no candidate score to promote.
    expect(result.candidateBaseline["vis-crit"]).toBeUndefined();
  });

  test("refreshing the baseline archives the prior copy append-only", () => {
    tmp = makeTmpRoot("golden-archive");
    seedWorkspace("ws-arch");
    setBaseline("ws-arch", 82); // first baseline
    setBaseline("ws-arch", 94); // second → archives the first to baseline.v2.json
    const archived = path.join(goldenDir("ws-arch"), "baseline.v2.json");
    expect(fs.existsSync(archived)).toBe(true);
    const prior = JSON.parse(fs.readFileSync(archived, "utf8"));
    expect(prior.baseline["det-crit"].score).toBe(82);
    // The live baseline is the new one.
    expect(readGoldenSet("ws-arch").baseline!["det-crit"]!.score).toBe(94);
  });

  test("the golden run leaves the real workspace tree untouched (ephemeral scratch)", async () => {
    tmp = makeTmpRoot("golden-clean");
    const graph = seedWorkspace("ws-clean");
    setBaseline("ws-clean", 94);
    candidateWarns = 1;
    await runGoldenGate("ws-clean", [graph]);
    // No project / run dirs leaked into the live workspace.
    expect(fs.existsSync(path.join(workspaceDir("ws-clean"), "projects"))).toBe(false);
    expect(fs.existsSync(path.join(workspaceDir("ws-clean"), "runs"))).toBe(false);
    // The golden set file itself is the only golden/ artifact.
    expect(fs.existsSync(goldenSetPath("ws-clean"))).toBe(true);
  });

  test("GoldenSet schema round-trips an empty set", () => {
    const empty = GoldenSetSchema.parse({});
    expect(empty.items).toEqual([]);
    expect(empty.baseline).toBeNull();
    expect(empty.bundleVersion).toBeNull();
  });
});
