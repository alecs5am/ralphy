// Per-stage auto-repair loop tests (#473).
//
// Exercises `runStageRepairLoop` via the INJECTABLE seams (no real render / no
// LLM / no spend), plus one DEFAULT-path test that seeds a tmp project with a
// workspace-eval.json carrying findings whose categories map to editor (free)
// vs art-director (paid) owners, to prove the real free/paid partition.
//
// NO live LLM / network. English-only-on-disk.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { runStageRepairLoop, type StageEvalResult } from "../../cli/lib/eval/stage-loop";
import type { Finding } from "../../cli/lib/eval/types";
import type { RepairItem } from "../../cli/lib/schemas/repair-plan";
import { workspaceDir } from "../../cli/lib/paths";

const WS = "fog";
const PROJECT = "fog-473";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-stage-loop-473");
});

afterEach(() => {
  tmp.cleanup();
});

/** A generic single-stage rubric (no universe literals): a "montage" stage. */
const RUBRIC = {
  criteria: [
    { id: "material-density", label: "MD", category: "pacing", check: "deterministic" },
    { id: "edit-correctness", label: "EC", category: "pacing", check: "deterministic" },
  ],
  stageGates: [
    { stage: "montage", phase: "eval", criteria: ["material-density", "edit-correctness"] },
  ],
};

/** Seed a workspace with the given evaluator config + register the project. */
function seedProject(evaluators: Record<string, unknown> = RUBRIC) {
  const wsDir = workspaceDir(WS);
  const projDir = path.join(wsDir, "projects", PROJECT);
  fs.mkdirSync(path.join(projDir, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(wsDir, "workspace.json"), JSON.stringify({ slug: WS }));
  fs.writeFileSync(path.join(wsDir, "evaluators.json"), JSON.stringify(evaluators));
  fs.writeFileSync(path.join(projDir, "BRIEF.md"), "# brief\n");
  fs.mkdirSync(path.join(tmp.dir, ".ralphy"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify({
      brands: {},
      personas: {},
      refs: {},
      templates: {},
      batches: {},
      projects: { [PROJECT]: { id: PROJECT, workspace: WS } },
    }),
  );
  return { wsDir, projDir };
}

/** Build a Finding with the given category/severity (the rest is boilerplate). */
function finding(category: string, severity: Finding["severity"]): Finding {
  return {
    id: `F-${category}`,
    category,
    severity,
    sceneIndex: null,
    timestampSec: null,
    message: `${category} issue`,
    fixHint: "fix it",
    fixCommand: null,
  };
}

/** A canned StageEvalResult from a category→verdict spec. */
function evalResult(
  spec: Array<{ id: string; verdict: "pass" | "warn" | "fail" | "na"; findings?: Finding[] }>,
): StageEvalResult {
  return { criteria: spec.map((s) => ({ ...s, findings: s.findings ?? [] })) };
}

describe("runStageRepairLoop — injectable seams (#473)", () => {
  test("passes on iteration 1 → ship, 0 autoFixed, applier never called", async () => {
    seedProject();
    let applierCalls = 0;
    const r = await runStageRepairLoop(PROJECT, "montage", {
      evalStage: async () =>
        evalResult([
          { id: "material-density", verdict: "pass" },
          { id: "edit-correctness", verdict: "pass" },
        ]),
      applyFix: async () => {
        applierCalls += 1;
        return { applied: true };
      },
    });
    expect(r.verdict).toBe("ship");
    expect(r.iterations).toBe(1);
    expect(r.autoFixed).toHaveLength(0);
    expect(applierCalls).toBe(0);
    expect(r.phase).toBe("eval");
    expect(r.stage).toBe("montage");
  });

  test("free fix: fail then pass + applier applies → 2 iterations, autoFixed, ship", async () => {
    seedProject();
    let evalCalls = 0;
    const r = await runStageRepairLoop(PROJECT, "montage", {
      evalStage: async () => {
        evalCalls += 1;
        return evalCalls === 1
          ? evalResult([
              // editor-owned category (audio.*) → free (cost 0).
              { id: "edit-correctness", verdict: "fail", findings: [finding("audio.loudness", "fail")] },
              { id: "material-density", verdict: "pass" },
            ])
          : evalResult([
              { id: "edit-correctness", verdict: "pass" },
              { id: "material-density", verdict: "pass" },
            ]);
      },
      applyFix: async () => ({ applied: true }),
    });
    expect(r.iterations).toBe(2);
    expect(r.autoFixed.length).toBeGreaterThan(0);
    expect(r.verdict).toBe("ship");
  });

  test("paid fix + batchApproved:false → STOPS, paid pending, applier not called on paid", async () => {
    seedProject();
    let applierCalls = 0;
    const r = await runStageRepairLoop(PROJECT, "montage", {
      evalStage: async () =>
        evalResult([
          // art-director-owned category (style.*) → paid (cost > 0).
          { id: "material-density", verdict: "fail", findings: [finding("style.register-mismatch", "fail")] },
          { id: "edit-correctness", verdict: "pass" },
        ]),
      applyFix: async () => {
        applierCalls += 1;
        return { applied: true };
      },
    });
    expect(r.pendingPaidActions.length).toBeGreaterThan(0);
    expect(r.pendingPaidActions.every((it: RepairItem) => it.costEstimate > 0)).toBe(true);
    expect(applierCalls).toBe(0); // gate short-circuits before any apply.
    // worst owned verdict is fail → blocked.
    expect(r.verdict).toBe("blocked");
    expect(r.iterations).toBe(1);
  });

  test("paid fix (warn) + batchApproved:false → needs-user-decision", async () => {
    seedProject();
    const r = await runStageRepairLoop(PROJECT, "montage", {
      evalStage: async () =>
        evalResult([
          { id: "material-density", verdict: "warn", findings: [finding("style.composition", "warn")] },
          { id: "edit-correctness", verdict: "pass" },
        ]),
    });
    expect(r.verdict).toBe("needs-user-decision");
    expect(r.pendingPaidActions.length).toBeGreaterThan(0);
  });

  test("budget exhaustion: always fail + always applied + budget 2 → exactly 2 iterations, not ship", async () => {
    seedProject();
    let evalCalls = 0;
    const r = await runStageRepairLoop(PROJECT, "montage", {
      retryBudget: 2,
      evalStage: async () => {
        evalCalls += 1;
        return evalResult([
          { id: "edit-correctness", verdict: "fail", findings: [finding("captions.thin", "fail")] },
          { id: "material-density", verdict: "pass" },
        ]);
      },
      applyFix: async () => ({ applied: true }),
    });
    expect(r.iterations).toBe(2);
    expect(evalCalls).toBe(2);
    expect(r.verdict).not.toBe("ship");
    expect(r.verdict).toBe("blocked");
    expect(r.autoFixed.length).toBeGreaterThan(0);
  });

  test("nothing appliable (default no-op applier) → stops with residual actions, not ship", async () => {
    seedProject();
    const r = await runStageRepairLoop(PROJECT, "montage", {
      evalStage: async () =>
        evalResult([
          { id: "edit-correctness", verdict: "warn", findings: [finding("audio.dead-air", "warn")] },
          { id: "material-density", verdict: "pass" },
        ]),
      // no applyFix → default no-op returns { applied: false }.
    });
    expect(r.verdict).toBe("repair");
    expect(r.iterations).toBe(1);
    expect(r.pendingFreeActions.length).toBeGreaterThan(0);
    expect(r.autoFixed).toHaveLength(0);
  });

  test("no stage gate configured for stageId → graceful needs-user-decision, no throw", async () => {
    seedProject();
    const r = await runStageRepairLoop(PROJECT, "no-such-stage", {
      evalStage: async () => evalResult([]),
    });
    expect(r.verdict).toBe("needs-user-decision");
    expect(r.phase).toBeNull();
    expect(r.iterations).toBe(0);
    expect(r.reason).toContain("no stage gate configured");
    expect(r.reason).toContain("no-such-stage");
  });

  test("no rubric at all → graceful needs-user-decision, no throw", async () => {
    seedProject({ criteria: [] }); // no stageGates key.
    const r = await runStageRepairLoop(PROJECT, "montage", {
      evalStage: async () => evalResult([]),
    });
    expect(r.verdict).toBe("needs-user-decision");
    expect(r.reason).toContain("no stage gate configured");
  });

  test("matches a gate by phase when no stage matches the id", async () => {
    seedProject();
    // "eval" is the gate's phase (not its stage "montage").
    const r = await runStageRepairLoop(PROJECT, "eval", {
      evalStage: async () =>
        evalResult([
          { id: "material-density", verdict: "pass" },
          { id: "edit-correctness", verdict: "pass" },
        ]),
    });
    expect(r.verdict).toBe("ship");
    expect(r.stage).toBe("montage"); // resolved gate's stage label.
    expect(r.phase).toBe("eval");
  });

  test("batchApproved:true applies paid items (delegated to the applier)", async () => {
    seedProject();
    const seen: RepairItem[] = [];
    let evalCalls = 0;
    const r = await runStageRepairLoop(PROJECT, "montage", {
      batchApproved: true,
      evalStage: async () => {
        evalCalls += 1;
        return evalCalls === 1
          ? evalResult([
              { id: "material-density", verdict: "fail", findings: [finding("style.register-mismatch", "fail")] },
              { id: "edit-correctness", verdict: "pass" },
            ])
          : evalResult([
              { id: "material-density", verdict: "pass" },
              { id: "edit-correctness", verdict: "pass" },
            ]);
      },
      applyFix: async (item) => {
        seen.push(item);
        return { applied: true };
      },
    });
    // The paid (style.*) item WAS handed to the applier under batch approval.
    expect(seen.some((it) => it.costEstimate > 0)).toBe(true);
    expect(r.verdict).toBe("ship");
    expect(r.iterations).toBe(2);
  });
});

// ─── DEFAULT-path partition: real runWorkspaceEval + real buildRepairPlan ─────────

describe("runStageRepairLoop — default eval path free/paid partition (#473)", () => {
  test("seeded workspace-eval findings partition by owner (editor=free, art-director=paid)", async () => {
    // A rubric whose stage owns one deterministic criterion. We use the DEFAULT
    // evalStage (runWorkspaceEval) by NOT injecting one — its real findings drive
    // the real buildRepairPlan free/paid split. The seeded validator emits one
    // editor (audio.*) finding and one art-director (style.*) finding so the
    // partition is non-trivial.
    const { registerWorkspaceValidator } = await import(
      "../../cli/lib/eval/workspace-evaluators"
    );
    registerWorkspaceValidator("mixed-owners-473", () => [
      finding("audio.loudness", "warn"), // editor → free (cost 0)
      finding("style.register-mismatch", "warn"), // art-director → paid (cost > 0)
    ]);

    seedProject({
      criteria: [
        {
          id: "mixed",
          label: "Mixed",
          category: "x",
          check: "deterministic",
          severity: "warn",
          validatorId: "mixed-owners-473",
        },
      ],
      stageGates: [{ stage: "montage", phase: "eval", criteria: ["mixed"] }],
    });

    // No injected evalStage → default runWorkspaceEval path. No applier → no-op,
    // so the loop stops and hands back the partitioned actions.
    const r = await runStageRepairLoop(PROJECT, "montage");

    // The criterion warns → not all-clear → a plan is built from real findings.
    // editor finding → free (pending free); art-director finding → paid (pending).
    expect(r.pendingFreeActions.some((it) => it.category === "audio.loudness" && it.costEstimate === 0)).toBe(true);
    expect(
      r.pendingPaidActions.some((it) => it.category === "style.register-mismatch" && it.costEstimate > 0),
    ).toBe(true);
    // A paid item present + default (not batch-approved) → stops for the user.
    expect(r.verdict).toBe("needs-user-decision");
  });
});
