// `ralphy workspace eval <project>` runner + engine + scorecard tests (#469).
//
// Covers:
//   (a) deriveOverallVerdict — the #427-vocab mapping in isolation
//       (fail → blocked, warn → repair, required-na → needs-user-decision,
//       all-pass → ship).
//   (b) runWorkspaceEval in-process — the `na` path (unregistered validatorId)
//       and a REGISTERED deterministic validator path, plus vision-skip when
//       --no-vision / no video. NO LLM call (deterministic-only configs).
//   (c) a CLI subprocess smoke: `bun run cli/index.ts workspace eval <fixture>`
//       writes workspace-eval.json with the right shape + a #427-vocab verdict,
//       with NO model call.
//
// No live LLM / network anywhere. English-only-on-disk.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  deriveOverallVerdict,
  runWorkspaceEval,
  registerWorkspaceValidator,
  resolveCriterionRubric,
  type WorkspaceValidator,
} from "../../cli/lib/eval/workspace-evaluators";
import { registerBuiltinWorkspaceValidators } from "../../cli/lib/eval/workspace-criteria";
import { workspaceDir } from "../../cli/lib/paths";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-ws-eval-469");
});

afterEach(() => {
  tmp.cleanup();
});

// Seed a workspace + a registered project with the given evaluator config.
function seedProject(opts: {
  workspace: string;
  projectId: string;
  evaluators: Record<string, unknown>;
}) {
  const wsDir = workspaceDir(opts.workspace);
  const projDir = path.join(wsDir, "projects", opts.projectId);
  fs.mkdirSync(path.join(projDir, "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(wsDir, "workspace.json"),
    JSON.stringify({ slug: opts.workspace }),
  );
  fs.writeFileSync(
    path.join(wsDir, "evaluators.json"),
    JSON.stringify(opts.evaluators),
  );
  fs.writeFileSync(path.join(projDir, "BRIEF.md"), "# brief\n");
  // Register the project so id → workspace resolves.
  const reg = {
    brands: {},
    personas: {},
    refs: {},
    templates: {},
    batches: {},
    projects: {
      [opts.projectId]: { id: opts.projectId, workspace: opts.workspace },
    },
  };
  fs.mkdirSync(path.join(tmp.dir, ".ralphy"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp.dir, ".ralphy", "registry.json"),
    JSON.stringify(reg),
  );
  return { wsDir, projDir };
}

// ─── (a) deriveOverallVerdict — #427 vocab mapping ──────────────────────────────

describe("deriveOverallVerdict — #427 readiness vocab", () => {
  test("any fail → blocked", () => {
    expect(
      deriveOverallVerdict([
        { verdict: "pass", severity: "warn" },
        { verdict: "fail", severity: "fail" },
        { verdict: "warn", severity: "warn" },
      ]),
    ).toBe("blocked");
  });

  test("a warn (no fail) → repair", () => {
    expect(
      deriveOverallVerdict([
        { verdict: "pass", severity: "warn" },
        { verdict: "warn", severity: "warn" },
      ]),
    ).toBe("repair");
  });

  test("a REQUIRED (severity fail) na, no warn/fail → needs-user-decision", () => {
    expect(
      deriveOverallVerdict([
        { verdict: "pass", severity: "warn" },
        { verdict: "na", severity: "fail" },
      ]),
    ).toBe("needs-user-decision");
  });

  test("an ADVISORY (severity warn) na does not block → ship", () => {
    expect(
      deriveOverallVerdict([
        { verdict: "pass", severity: "warn" },
        { verdict: "na", severity: "warn" },
      ]),
    ).toBe("ship");
  });

  test("all pass → ship", () => {
    expect(
      deriveOverallVerdict([
        { verdict: "pass", severity: "fail" },
        { verdict: "pass", severity: "warn" },
      ]),
    ).toBe("ship");
  });
});

// ─── (b) runWorkspaceEval — in-process, no LLM ──────────────────────────────────

describe("runWorkspaceEval — engine (no LLM)", () => {
  test("an unregistered validatorId takes the na path (info finding, no throw)", async () => {
    seedProject({
      workspace: "fog",
      projectId: "fog-001",
      evaluators: {
        criteria: [
          {
            id: "freeze-on-fork",
            label: "Decision freeze present",
            category: "pacing",
            check: "deterministic",
            severity: "fail",
            validatorId: "freeze-detect-not-yet-real",
          },
        ],
      },
    });

    const result = await runWorkspaceEval("fog-001");
    expect(result.schemaVersion).toBe("1.0");
    expect(result.workspace).toBe("fog");
    expect(result.criteria).toHaveLength(1);
    const c = result.criteria[0];
    expect(c.verdict).toBe("na");
    expect(c.score).toBeNull();
    expect(c.findings[0].category).toBe("workspace.validator-missing");
    expect(c.findings[0].severity).toBe("info");
    expect(c.findings[0].message).toContain("freeze-detect-not-yet-real");
    // A required (severity fail) criterion left na → needs-user-decision.
    expect(result.overall.verdict).toBe("needs-user-decision");
    expect(["ship", "repair", "needs-user-decision", "blocked"]).toContain(
      result.overall.verdict,
    );
  });

  test("a registered validator runs and its findings drive the verdict", async () => {
    const failing: WorkspaceValidator = () => [
      {
        id: "X1",
        category: "workspace.test",
        severity: "fail",
        sceneIndex: null,
        timestampSec: null,
        message: "test failure",
        fixHint: "fix it",
        fixCommand: null,
      },
    ];
    registerWorkspaceValidator("test-failing-validator", failing);

    seedProject({
      workspace: "fog2",
      projectId: "fog2-001",
      evaluators: {
        criteria: [
          {
            id: "c1",
            label: "C1",
            category: "x",
            check: "deterministic",
            severity: "fail",
            validatorId: "test-failing-validator",
          },
        ],
      },
    });

    const result = await runWorkspaceEval("fog2-001");
    expect(result.criteria[0].verdict).toBe("fail");
    expect(result.criteria[0].score).toBeLessThan(100);
    expect(result.overall.verdict).toBe("blocked");
  });

  test("vision criteria are skipped (na) with --no-vision, no model call", async () => {
    seedProject({
      workspace: "fog3",
      projectId: "fog3-001",
      evaluators: {
        criteria: [
          {
            id: "v1",
            label: "On-register fog",
            category: "style",
            check: "vision",
            severity: "warn",
            rubricPrompt: "Score the fog register.",
          },
        ],
      },
    });

    const result = await runWorkspaceEval("fog3-001", { noVision: true });
    expect(result.criteria[0].verdict).toBe("na");
    expect(result.video).toBeNull();
    // An advisory (warn) vision criterion left na → ship.
    expect(result.overall.verdict).toBe("ship");
  });

  test("an empty rubric scores nothing and ships", async () => {
    seedProject({
      workspace: "plain",
      projectId: "plain-001",
      evaluators: { criteria: [] },
    });
    const result = await runWorkspaceEval("plain-001");
    expect(result.criteria).toHaveLength(0);
    expect(result.overall.verdict).toBe("ship");
    expect(result.overall.score).toBeNull();
  });
});

// ─── (b2) resolveCriterionRubric — precedence inline > file > builtin > label (#477) ──

describe("resolveCriterionRubric — rubric resolution precedence (#477)", () => {
  test("inline rubricPrompt wins over a file and a builtin", () => {
    registerBuiltinWorkspaceValidators();
    const wsDir = workspaceDir("rb-ws");
    fs.mkdirSync(path.join(wsDir, "rubrics"), { recursive: true });
    fs.writeFileSync(path.join(wsDir, "rubrics", "scenario.md"), "# FILE RUBRIC\n");
    const r = resolveCriterionRubric(
      {
        rubricPrompt: "INLINE RUBRIC",
        rubricFile: "rubrics/scenario.md",
        validatorId: "scenario-fidelity",
      },
      "rb-ws",
    );
    expect(r).toBe("INLINE RUBRIC");
  });

  test("rubricFile content wins over a builtin when there is no inline prompt", () => {
    registerBuiltinWorkspaceValidators();
    const wsDir = workspaceDir("rb-ws2");
    fs.mkdirSync(path.join(wsDir, "rubrics"), { recursive: true });
    fs.writeFileSync(path.join(wsDir, "rubrics", "characters.md"), "# FROM FILE: characters\n");
    const r = resolveCriterionRubric(
      { rubricFile: "rubrics/characters.md", validatorId: "character-design-cohesion" },
      "rb-ws2",
    );
    expect(r).toBe("# FROM FILE: characters\n");
  });

  test("a missing/empty rubricFile falls through to the registered builtin (#470)", () => {
    registerBuiltinWorkspaceValidators();
    // No file written; the builtin fragment should win.
    const r = resolveCriterionRubric(
      { rubricFile: "rubrics/does-not-exist.md", validatorId: "location-consistency" },
      "rb-ws3",
    );
    expect(r).toContain("LOCATION CONSISTENCY");
  });

  test("nothing matches → null (caller judges by the label)", () => {
    const r = resolveCriterionRubric(
      { validatorId: "no-such-builtin" },
      "rb-ws4",
    );
    expect(r).toBeNull();
  });
});

// ─── (b3) criteria subset filter + merge over prior (#477) ──────────────────────

describe("runWorkspaceEval — criteria subset filter + merge (#477)", () => {
  const failing: WorkspaceValidator = () => [
    {
      id: "F1",
      category: "workspace.test",
      severity: "fail",
      sceneIndex: null,
      timestampSec: null,
      message: "deliberate failure",
      fixHint: "fix it",
      fixCommand: null,
    },
  ];
  const passing: WorkspaceValidator = () => [];

  function seedTwoCriteria(workspace: string, projectId: string) {
    registerWorkspaceValidator("ws477-failing", failing);
    registerWorkspaceValidator("ws477-passing", passing);
    seedProject({
      workspace,
      projectId,
      evaluators: {
        criteria: [
          { id: "a", label: "A", category: "x", check: "deterministic", severity: "warn", validatorId: "ws477-failing" },
          { id: "b", label: "B", category: "y", check: "deterministic", severity: "warn", validatorId: "ws477-passing" },
        ],
      },
    });
  }

  test("a subset run with NO prior scorecard returns ONLY the named criterion", async () => {
    seedTwoCriteria("sub1", "sub1-001");
    const result = await runWorkspaceEval("sub1-001", { criteria: ["a"] });
    expect(result.criteria.map((c) => c.id)).toEqual(["a"]);
    expect(result.overall.summary).toContain("not run");
  });

  test("an unknown criterion id is ignored + noted, never throws", async () => {
    seedTwoCriteria("sub2", "sub2-001");
    const result = await runWorkspaceEval("sub2-001", { criteria: ["a", "ghost"] });
    expect(result.criteria.map((c) => c.id)).toEqual(["a"]);
    expect(result.overall.summary).toContain("ghost");
  });

  test("a subset run merges fresh results over the prior scorecard + recomputes overall", async () => {
    const { projDir } = (() => {
      seedTwoCriteria("sub3", "sub3-001");
      return { projDir: path.join(workspaceDir("sub3"), "projects", "sub3-001") };
    })();

    // Full run first: "a" fails → blocked.
    const full = await runWorkspaceEval("sub3-001");
    expect(full.criteria.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(full.overall.verdict).toBe("blocked");
    // Persist it as the prior scorecard (the CLI normally does this).
    fs.writeFileSync(path.join(projDir, "workspace-eval.json"), JSON.stringify(full));

    // Now swap "a" to passing and re-run ONLY "a". The merge must keep "b" and
    // recompute overall over both → ship (both now pass).
    registerWorkspaceValidator("ws477-failing", passing);
    const merged = await runWorkspaceEval("sub3-001", { criteria: ["a"] });
    expect(merged.criteria.map((c) => c.id).sort()).toEqual(["a", "b"]);
    expect(merged.criteria.find((c) => c.id === "a")!.verdict).not.toBe("fail");
    expect(merged.overall.verdict).toBe("ship");
    expect(merged.overall.summary).toContain("merged");
  });
});

// ─── (c) CLI subprocess smoke — writes workspace-eval.json, no LLM ──────────────

describe("ralphy workspace eval <project> — CLI smoke", () => {
  test("writes workspace-eval.json with the right shape + a #427-vocab verdict", () => {
    // Build the fixture on a fresh tmp root the CHILD process will resolve via
    // --cwd (the in-process setRoot from makeTmpRoot only binds this process).
    const childRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ws-eval-cli-"));
    try {
      const wsDir = path.join(childRoot, ".ralphy", "workspaces", "fog", "projects", "fog-cli-001");
      fs.mkdirSync(path.join(wsDir, "artifacts"), { recursive: true });
      const wsRoot = path.join(childRoot, ".ralphy", "workspaces", "fog");
      fs.writeFileSync(path.join(wsRoot, "workspace.json"), JSON.stringify({ slug: "fog" }));
      fs.writeFileSync(
        path.join(wsRoot, "evaluators.json"),
        JSON.stringify({
          criteria: [
            {
              id: "freeze-on-fork",
              label: "Decision freeze present",
              category: "pacing",
              check: "deterministic",
              severity: "warn",
              validatorId: "not-registered-yet",
            },
          ],
        }),
      );
      fs.writeFileSync(path.join(wsDir, "BRIEF.md"), "# brief\n");
      fs.writeFileSync(
        path.join(childRoot, ".ralphy", "registry.json"),
        JSON.stringify({
          brands: {},
          personas: {},
          refs: {},
          templates: {},
          batches: {},
          projects: { "fog-cli-001": { id: "fog-cli-001", workspace: "fog" } },
        }),
      );

      const r = spawnSync(
        "bun",
        ["run", CLI, "--cwd", childRoot, "workspace", "eval", "fog-cli-001", "--no-vision"],
        { cwd: childRoot, encoding: "utf8", env: { ...process.env } },
      );

      expect(r.status).toBe(0);
      const json = JSON.parse(r.stdout);
      expect(json.workspace).toBe("fog");
      expect(json.projectId).toBe("fog-cli-001");
      expect(json.criteria).toBe(1);
      expect(["ship", "repair", "needs-user-decision", "blocked"]).toContain(json.verdict);

      // The scorecard landed on disk with the mirrored v1.0 envelope.
      const scorecardPath = path.join(wsDir, "workspace-eval.json");
      expect(fs.existsSync(scorecardPath)).toBe(true);
      const scorecard = JSON.parse(fs.readFileSync(scorecardPath, "utf8"));
      expect(scorecard.schemaVersion).toBe("1.0");
      expect(scorecard.criteria[0].id).toBe("freeze-on-fork");
      expect(scorecard.criteria[0].verdict).toBe("na");
      expect(scorecard.overall.verdict).toBe(json.verdict);
      expect(fs.existsSync(path.join(wsDir, "workspace-eval-report.md"))).toBe(true);
    } finally {
      fs.rmSync(childRoot, { recursive: true, force: true });
    }
  });

  test("--criterion runs ONLY the named criterion and merges over the prior scorecard (#477)", () => {
    const childRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-ws-eval-crit-"));
    try {
      const projDir = path.join(childRoot, ".ralphy", "workspaces", "fog", "projects", "fog-crit-001");
      fs.mkdirSync(path.join(projDir, "artifacts"), { recursive: true });
      const wsRoot = path.join(childRoot, ".ralphy", "workspaces", "fog");
      fs.writeFileSync(path.join(wsRoot, "workspace.json"), JSON.stringify({ slug: "fog" }));
      // Two registered deterministic builtins → no LLM call.
      fs.writeFileSync(
        path.join(wsRoot, "evaluators.json"),
        JSON.stringify({
          criteria: [
            { id: "md", label: "Material density", category: "density", check: "deterministic", severity: "warn", validatorId: "material-density" },
            { id: "ec", label: "Edit correctness", category: "edit", check: "deterministic", severity: "warn", validatorId: "edit-correctness" },
          ],
        }),
      );
      fs.writeFileSync(path.join(projDir, "BRIEF.md"), "# brief\n");
      // A minimal composition so the deterministic checks have a file to parse.
      fs.writeFileSync(path.join(projDir, "index.html"), "<!doctype html><html><body></body></html>");
      fs.writeFileSync(
        path.join(childRoot, ".ralphy", "registry.json"),
        JSON.stringify({
          brands: {}, personas: {}, refs: {}, templates: {}, batches: {},
          projects: { "fog-crit-001": { id: "fog-crit-001", workspace: "fog" } },
        }),
      );

      const run = (extra: string[]) =>
        spawnSync(
          "bun",
          ["run", CLI, "--cwd", childRoot, "workspace", "eval", "fog-crit-001", "--no-vision", ...extra],
          { cwd: childRoot, encoding: "utf8", env: { ...process.env } },
        );

      // Full run first → 2 criteria on disk.
      const full = run([]);
      expect(full.status).toBe(0);
      expect(JSON.parse(full.stdout).criteria).toBe(2);

      // Now re-run ONLY "ec". The merge must keep "md" too (full set persisted).
      const subset = run(["--criterion", "ec"]);
      expect(subset.status).toBe(0);
      const json = JSON.parse(subset.stdout);
      expect(json.criteria).toBe(2); // merged over the prior 2-criterion scorecard
      expect(json.summary).toContain("ec");
      expect(json.summary).toContain("merged");

      const scorecard = JSON.parse(fs.readFileSync(path.join(projDir, "workspace-eval.json"), "utf8"));
      expect(scorecard.criteria.map((c: { id: string }) => c.id).sort()).toEqual(["ec", "md"]);
    } finally {
      fs.rmSync(childRoot, { recursive: true, force: true });
    }
  });
});
