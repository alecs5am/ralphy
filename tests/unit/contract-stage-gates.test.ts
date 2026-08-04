// Stage-gate stop-condition tests (#472).
//
// `deriveStopConditions` (via `evaluateContract`) emits a `stage-gate-unmet`
// stop at the phase a workspace stage-gate maps to whenever an owned criterion's
// latest `workspace-eval.json` verdict is `fail` (or `warn` → advisory). The map
// is config-driven from the workspace rubric (#468 schema + #472 `stageGates`),
// NOT hardcoded — these fixtures author a generic two-gate rubric.
//
// Coverage:
//   • backward-compat: a project with NO workspace rubric → no stage-gate stop,
//     and the existing stops are unchanged.
//   • a fail verdict on an owned criterion → a `stage-gate-unmet` block at the
//     mapped phase, detail names the stage + failing criterion.
//   • an all-pass scorecard → no stage-gate stop.
//   • severity honored: a `warn`-severity gate → a warn stop even on a fail.
//   • a warn verdict (clean fails) → an advisory warn stop.
//   • no workspace-eval.json yet → no stage-gate stop (can't gate a missing eval).
//
// Build fixtures on a tmp root (mirrors the seedProject pattern in
// workspace-eval.test.ts). NO LLM. English-only-on-disk.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  ensureDomainContractProject,
  setDomainContractDocumentStage,
  setDomainContractStage,
} from "../helpers/domain-contract";
import { evaluateContract } from "../../cli/lib/contract";
import { workspaceDir } from "../../cli/lib/paths";
import { saveWorkspaceEvaluators } from "../../cli/lib/workspace-evaluators";

const WS = "fog";
const PROJECT = "fog-472";

let tmp: TmpRoot;

/** The project dir under the workspace (the layout deriveStopConditions reads). */
function projDir(): string {
  return path.join(workspaceDir(WS), "projects", PROJECT);
}

/** Seed a render-stage project (so existing stops fire) + register it to the workspace. */
function seedRenderStageProject(opts: { evaluators?: Record<string, unknown> } = {}) {
  const wsDir = workspaceDir(WS);
  const dir = projDir();
  ensureDomainContractProject(tmp.dir, PROJECT, "video", WS);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(wsDir, "workspace.json"), JSON.stringify({ slug: WS }));
  if (opts.evaluators) {
    saveWorkspaceEvaluators(WS, opts.evaluators);
  }
  // A full required artifact set so the contract reaches eval-territory and the
  // pre-existing stops (user-approval / native-gate) are deterministic.
  for (const f of [
    "BRIEF.md",
    "PRODUCTION_PLAN.md",
    "scenario.json",
    "prompts.json",
    "asset-manifest.json",
  ]) {
    fs.writeFileSync(path.join(dir, f), "{}");
  }
  fs.mkdirSync(path.join(dir, "render"), { recursive: true });
  fs.writeFileSync(path.join(dir, "render", "final.mp4"), "fakevideo");
  for (const stage of ["intake", "production-plan", "scenario", "prompts", "assets", "render"]) {
    setDomainContractStage(tmp.dir, PROJECT, stage, "complete", WS);
  }
  return dir;
}

/** Write the latest workspace-eval scorecard with the given criterion verdicts. */
function writeWorkspaceEval(criteria: Array<{ id: string; verdict: string }>) {
  const body = {
    schemaVersion: "1.0",
    workspace: WS,
    projectId: PROJECT,
    criteria: criteria.map((c) => ({ ...c, score: null, findings: [] })),
    overall: { verdict: "repair", score: null, summary: "x" },
  };
  fs.writeFileSync(
    path.join(projDir(), "workspace-eval.json"),
    JSON.stringify(body),
  );
  setDomainContractDocumentStage(tmp.dir, PROJECT, "workspace-eval", body, "complete", "video", WS);
}

/** A generic two-gate rubric (no universe literals): scenario + montage stages. */
const RUBRIC = {
  criteria: [
    { id: "scenario-fidelity", label: "SF", category: "narrative", check: "vision" },
    { id: "material-density", label: "MD", category: "pacing", check: "deterministic" },
    { id: "edit-correctness", label: "EC", category: "pacing", check: "deterministic" },
  ],
  stageGates: [
    { stage: "scenario", phase: "scenario", criteria: ["scenario-fidelity"] },
    {
      stage: "montage",
      phase: "eval",
      criteria: ["material-density", "edit-correctness"],
    },
  ],
};

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-contract-stagegate-472");
});

afterEach(() => {
  tmp.cleanup();
});

describe("deriveStopConditions — stage gates (#472)", () => {
  test("backward-compat: no workspace rubric → no stage-gate stop, existing stops unchanged", () => {
    // Seed WITHOUT an evaluators.json — the early-return path.
    seedRenderStageProject();
    const r = evaluateContract(PROJECT);
    const stageStops = r.stopConditions.filter((s) => s.id === "stage-gate-unmet");
    expect(stageStops).toHaveLength(0);
    // The pre-existing native-gate stop still fires (render present, no eval).
    expect(r.stopConditions.some((s) => s.id === "native-gate-required")).toBe(true);
  });

  test("a rubric but no workspace-eval.json yet → no stage-gate stop (can't gate a missing eval)", () => {
    seedRenderStageProject({ evaluators: RUBRIC });
    // No writeWorkspaceEval() call.
    const r = evaluateContract(PROJECT);
    expect(r.stopConditions.some((s) => s.id === "stage-gate-unmet")).toBe(false);
  });

  test("a fail on an owned criterion → a stage-gate block at the mapped phase", () => {
    seedRenderStageProject({ evaluators: RUBRIC });
    writeWorkspaceEval([
      { id: "scenario-fidelity", verdict: "fail" },
      { id: "material-density", verdict: "pass" },
      { id: "edit-correctness", verdict: "pass" },
    ]);
    const r = evaluateContract(PROJECT);
    const stops = r.stopConditions.filter((s) => s.id === "stage-gate-unmet");
    expect(stops).toHaveLength(1);
    expect(stops[0].phase).toBe("scenario");
    expect(stops[0].severity).toBe("block");
    expect(stops[0].detail).toContain("scenario");
    expect(stops[0].detail).toContain("scenario-fidelity");
  });

  test("an all-pass scorecard → no stage-gate stop", () => {
    seedRenderStageProject({ evaluators: RUBRIC });
    writeWorkspaceEval([
      { id: "scenario-fidelity", verdict: "pass" },
      { id: "material-density", verdict: "pass" },
      { id: "edit-correctness", verdict: "pass" },
    ]);
    const r = evaluateContract(PROJECT);
    expect(r.stopConditions.some((s) => s.id === "stage-gate-unmet")).toBe(false);
  });

  test("a fail on ANY owned criterion of a multi-criterion gate blocks that gate", () => {
    seedRenderStageProject({ evaluators: RUBRIC });
    writeWorkspaceEval([
      { id: "scenario-fidelity", verdict: "pass" },
      { id: "material-density", verdict: "pass" },
      { id: "edit-correctness", verdict: "fail" },
    ]);
    const r = evaluateContract(PROJECT);
    const stops = r.stopConditions.filter((s) => s.id === "stage-gate-unmet");
    expect(stops).toHaveLength(1);
    expect(stops[0].phase).toBe("eval");
    expect(stops[0].detail).toContain("edit-correctness");
    expect(stops[0].detail).not.toContain("material-density");
  });

  test("severity honored: a warn-severity gate emits a warn stop even on a fail", () => {
    seedRenderStageProject({
      evaluators: {
        criteria: RUBRIC.criteria,
        stageGates: [
          {
            stage: "scenario",
            phase: "scenario",
            criteria: ["scenario-fidelity"],
            severity: "warn",
          },
        ],
      },
    });
    writeWorkspaceEval([{ id: "scenario-fidelity", verdict: "fail" }]);
    const r = evaluateContract(PROJECT);
    const stops = r.stopConditions.filter((s) => s.id === "stage-gate-unmet");
    expect(stops).toHaveLength(1);
    expect(stops[0].severity).toBe("warn");
  });

  test("a warn verdict (no fail) on an owned criterion → an advisory warn stop", () => {
    seedRenderStageProject({ evaluators: RUBRIC });
    writeWorkspaceEval([
      { id: "scenario-fidelity", verdict: "warn" },
      { id: "material-density", verdict: "pass" },
      { id: "edit-correctness", verdict: "pass" },
    ]);
    const r = evaluateContract(PROJECT);
    const stops = r.stopConditions.filter((s) => s.id === "stage-gate-unmet");
    expect(stops).toHaveLength(1);
    expect(stops[0].phase).toBe("scenario");
    // A warn verdict is advisory regardless of the gate's (block) severity.
    expect(stops[0].severity).toBe("warn");
    expect(stops[0].detail).toContain("WARNED");
  });

  test("a na verdict on an owned criterion → no stop (na/pass never gate)", () => {
    seedRenderStageProject({ evaluators: RUBRIC });
    writeWorkspaceEval([
      { id: "scenario-fidelity", verdict: "na" },
      { id: "material-density", verdict: "pass" },
      { id: "edit-correctness", verdict: "pass" },
    ]);
    const r = evaluateContract(PROJECT);
    expect(r.stopConditions.some((s) => s.id === "stage-gate-unmet")).toBe(false);
  });
});
