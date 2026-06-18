// Per-workspace custom-evaluator framework tests (#468).
//
// Covers:
//   (a) schema — a valid config parses; a missing `version` gets the default;
//       an invalid `check` value rejects; `threshold` accepts number/string/
//       object/boolean; `severity` defaults to warn.
//   (b) loader — null when neither file exists; parses a sibling evaluators.json;
//       parses the workspace.json.evaluators fallback (sibling wins over it);
//       a malformed config returns null (does not throw).
//   (c) discoverStyleLock — the #468 workspace fallback: a project with no
//       local STYLE_LOCK.md falls back to its workspace's; a project-local lock
//       still wins when present.
//
// No live LLM / network. English-only-on-disk.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  parseWorkspaceEvaluators,
  WorkspaceEvaluatorsConfigSchema,
} from "../../cli/lib/schemas/workspace-evaluators";
import { loadWorkspaceEvaluators } from "../../cli/lib/workspace-evaluators";
import { discoverStyleLock } from "../../cli/lib/style-lock";
import { workspaceDir } from "../../cli/lib/paths";

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-ws-evaluators-468");
});

afterEach(() => {
  tmp.cleanup();
});

// ─── (a) schema ───────────────────────────────────────────────────────────────

describe("parseWorkspaceEvaluators — schema", () => {
  test("a valid config parses, with all criterion fields", () => {
    const cfg = parseWorkspaceEvaluators({
      version: "1.0",
      criteria: [
        {
          id: "plate-opacity",
          label: "Caption plate opacity",
          category: "captions",
          check: "deterministic",
          severity: "fail",
          threshold: { max: 0.6 },
          validatorId: "plate-opacity-check",
        },
        {
          id: "on-register-fog",
          label: "Fog stays on-register",
          category: "style",
          check: "vision",
          threshold: 0.9,
          rubricPrompt: "Score whether the fog matches the universe register.",
          benchmarkRef: "fog-reference",
        },
      ],
      benchmarks: { "fog-reference": { frames: ["a.png"] } },
    });
    expect(cfg.criteria).toHaveLength(2);
    expect(cfg.criteria[0].severity).toBe("fail");
    expect(cfg.criteria[1].check).toBe("vision");
    expect(cfg.benchmarks?.["fog-reference"]).toBeDefined();
  });

  test("missing `version` gets the default '1.0'", () => {
    const cfg = parseWorkspaceEvaluators({ criteria: [] });
    expect(cfg.version).toBe("1.0");
  });

  test("missing `severity` defaults to warn; missing `threshold` defaults to {}", () => {
    const cfg = parseWorkspaceEvaluators({
      criteria: [
        { id: "c1", label: "C1", category: "pacing", check: "deterministic" },
      ],
    });
    expect(cfg.criteria[0].severity).toBe("warn");
    expect(cfg.criteria[0].threshold).toEqual({});
  });

  test("threshold accepts number | string | boolean | object", () => {
    const variants = [1.7, "9:16", true, { min: 3 }];
    for (const threshold of variants) {
      const cfg = parseWorkspaceEvaluators({
        criteria: [
          { id: "c", label: "C", category: "x", check: "deterministic", threshold },
        ],
      });
      expect(cfg.criteria[0].threshold).toEqual(threshold);
    }
  });

  test("an invalid `check` value rejects", () => {
    expect(() =>
      parseWorkspaceEvaluators({
        criteria: [{ id: "c", label: "C", category: "x", check: "magic" }],
      }),
    ).toThrow();
  });

  test("empty {} parses to a defaulted config (best-effort partial still parses)", () => {
    const cfg = WorkspaceEvaluatorsConfigSchema.parse({});
    expect(cfg.version).toBe("1.0");
    expect(cfg.criteria).toEqual([]);
  });

  // ─── stageGates (#472) ──────────────────────────────────────────────────────

  test("a config with stageGates parses; severity defaults to block", () => {
    const cfg = parseWorkspaceEvaluators({
      criteria: [
        { id: "scenario-fidelity", label: "SF", category: "narrative", check: "vision" },
        { id: "material-density", label: "MD", category: "pacing", check: "deterministic" },
      ],
      stageGates: [
        { stage: "scenario", phase: "scenario", criteria: ["scenario-fidelity"] },
        {
          stage: "montage",
          phase: "eval",
          criteria: ["material-density"],
          severity: "warn",
        },
      ],
    });
    expect(cfg.stageGates).toHaveLength(2);
    // Default severity is block.
    expect(cfg.stageGates![0].severity).toBe("block");
    expect(cfg.stageGates![0].phase).toBe("scenario");
    // Explicit severity honored.
    expect(cfg.stageGates![1].severity).toBe("warn");
  });

  test("stageGates is optional — a config without it parses (undefined)", () => {
    const cfg = parseWorkspaceEvaluators({ criteria: [] });
    expect(cfg.stageGates).toBeUndefined();
  });

  test("a stageGate with a phase that is not a CONTRACT_PHASES id rejects", () => {
    expect(() =>
      parseWorkspaceEvaluators({
        criteria: [],
        stageGates: [
          { stage: "bad", phase: "not-a-real-phase", criteria: ["x"] },
        ],
      }),
    ).toThrow();
  });

  test("a malformed stageGate shape rejects (criteria must be an array)", () => {
    expect(() =>
      parseWorkspaceEvaluators({
        criteria: [],
        stageGates: [{ stage: "s", phase: "scenario", criteria: "scenario-fidelity" }],
      }),
    ).toThrow();
  });
});

// ─── (b) loader ─────────────────────────────────────────────────────────────

describe("loadWorkspaceEvaluators — resolution", () => {
  function seedWorkspace(slug: string, manifest: Record<string, unknown> = { slug }) {
    const dir = workspaceDir(slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify(manifest));
    return dir;
  }

  test("returns null when neither file exists", async () => {
    expect(await loadWorkspaceEvaluators("nope")).toBeNull();
  });

  test("returns null when the workspace exists but has no evaluators", async () => {
    seedWorkspace("plain");
    expect(await loadWorkspaceEvaluators("plain")).toBeNull();
  });

  test("parses a sibling evaluators.json", async () => {
    const dir = seedWorkspace("ws1");
    fs.writeFileSync(
      path.join(dir, "evaluators.json"),
      JSON.stringify({
        criteria: [{ id: "c1", label: "C1", category: "pacing", check: "deterministic" }],
      }),
    );
    const cfg = await loadWorkspaceEvaluators("ws1");
    expect(cfg).not.toBeNull();
    expect(cfg!.criteria[0].id).toBe("c1");
    expect(cfg!.version).toBe("1.0");
  });

  test("falls back to the workspace.json.evaluators key", async () => {
    seedWorkspace("ws2", {
      slug: "ws2",
      evaluators: {
        version: "1.0",
        criteria: [{ id: "embedded", label: "E", category: "style", check: "vision" }],
      },
    });
    const cfg = await loadWorkspaceEvaluators("ws2");
    expect(cfg).not.toBeNull();
    expect(cfg!.criteria[0].id).toBe("embedded");
  });

  test("the sibling evaluators.json wins over the workspace.json key", async () => {
    const dir = seedWorkspace("ws3", {
      slug: "ws3",
      evaluators: { criteria: [{ id: "embedded", label: "E", category: "x", check: "vision" }] },
    });
    fs.writeFileSync(
      path.join(dir, "evaluators.json"),
      JSON.stringify({ criteria: [{ id: "sibling", label: "S", category: "x", check: "deterministic" }] }),
    );
    const cfg = await loadWorkspaceEvaluators("ws3");
    expect(cfg!.criteria[0].id).toBe("sibling");
  });

  test("a malformed config returns null (does not throw / crash)", async () => {
    const dir = seedWorkspace("ws4");
    fs.writeFileSync(
      path.join(dir, "evaluators.json"),
      JSON.stringify({ criteria: [{ id: "bad", label: "B", category: "x", check: "not-a-mode" }] }),
    );
    expect(await loadWorkspaceEvaluators("ws4")).toBeNull();
  });
});

// ─── (c) discoverStyleLock — workspace fallback (#468) ─────────────────────────

describe("discoverStyleLock — workspace STYLE_LOCK.md fallback", () => {
  // Build <tmp>/workspaces/ws1/{workspace.json, [STYLE_LOCK.md], projects/p1/...}.
  function seedTree(opts: { workspaceLock: boolean; projectLock: boolean }) {
    const wsRoot = path.join(tmp.dir, "workspaces", "ws1");
    const projRoot = path.join(wsRoot, "projects", "p1");
    fs.mkdirSync(path.join(projRoot, "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(wsRoot, "workspace.json"), JSON.stringify({ slug: "ws1" }));
    // The project needs a root marker so the project-pass recognizes it.
    fs.writeFileSync(path.join(projRoot, "BRIEF.md"), "# brief\n");
    if (opts.workspaceLock) {
      fs.writeFileSync(path.join(wsRoot, "STYLE_LOCK.md"), "# workspace lock\n");
    }
    if (opts.projectLock) {
      fs.writeFileSync(path.join(projRoot, "STYLE_LOCK.md"), "# project lock\n");
    }
    const renderPath = path.join(projRoot, "render", "final.mp4");
    fs.mkdirSync(path.dirname(renderPath), { recursive: true });
    fs.writeFileSync(renderPath, "fakevideo");
    return { wsRoot, projRoot, renderPath };
  }

  test("falls back to the workspace STYLE_LOCK.md when the project has none", () => {
    const { wsRoot, renderPath } = seedTree({ workspaceLock: true, projectLock: false });
    expect(discoverStyleLock(renderPath)).toBe(path.join(wsRoot, "STYLE_LOCK.md"));
  });

  test("the project-local STYLE_LOCK.md still wins when present", () => {
    const { projRoot, renderPath } = seedTree({ workspaceLock: true, projectLock: true });
    expect(discoverStyleLock(renderPath)).toBe(path.join(projRoot, "STYLE_LOCK.md"));
  });

  test("returns null when neither project nor workspace carries a lock", () => {
    const { renderPath } = seedTree({ workspaceLock: false, projectLock: false });
    expect(discoverStyleLock(renderPath)).toBeNull();
  });
});
