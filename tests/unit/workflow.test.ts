// #478 Phase 1 — workflow schema + default-derivation + load/gate-validation.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, workflowsDir } from "../../cli/lib/paths.js";
import { parseWorkflow } from "../../cli/lib/schemas/workflow.js";
import {
  deriveDefaultWorkflow,
  loadWorkflow,
  workflowPath,
  evaluateWorkflow,
} from "../../cli/lib/workflow.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

/** Seed <root>/.ralphy/workspaces/<slug>/{workspace.json,[evaluators.json]}. */
function seedWorkspace(slug: string, evaluators?: unknown): string {
  tmp = makeTmpRoot("ralphy-workflow");
  const dir = workspaceDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug }));
  if (evaluators) {
    fs.writeFileSync(path.join(dir, "evaluators.json"), JSON.stringify(evaluators));
  }
  return dir;
}

const SILENT_HILL_EVALS = {
  version: "1.0",
  criteria: [
    { id: "material-density", label: "x", category: "production", check: "deterministic" },
    { id: "edit-correctness", label: "x", category: "editing", check: "deterministic" },
    { id: "insta-metric-fit", label: "x", category: "performance", check: "deterministic" },
    { id: "scenario-fidelity", label: "x", category: "scenario", check: "vision" },
    { id: "character-design-cohesion", label: "x", category: "style", check: "vision" },
    { id: "location-consistency", label: "x", category: "style", check: "vision" },
  ],
  stageGates: [
    { stage: "location/cast", phase: "style-lock", criteria: ["character-design-cohesion", "location-consistency"], severity: "block" },
    { stage: "scenario", phase: "scenario", criteria: ["scenario-fidelity"], severity: "block" },
    { stage: "anchors", phase: "assets", criteria: ["character-design-cohesion", "location-consistency"], severity: "block" },
    { stage: "montage", phase: "eval", criteria: ["material-density", "edit-correctness", "insta-metric-fit"], severity: "block" },
  ],
};

describe("workflow schema", () => {
  test("fills defaults and round-trips", () => {
    const wf = parseWorkflow({ name: "x", steps: [{ id: "s", phase: "scenario", engine: "llm" }] });
    expect(wf.version).toBe("1.0");
    const step = wf.steps[0];
    expect(step.mode).toBe("approve");
    expect(step.variants).toBe(1);
    expect(step.gate).toEqual([]);
    expect(step.repair.retryBudget).toBe(2);
  });

  test("rejects a step pinned to a non-contract phase", () => {
    expect(() =>
      parseWorkflow({ name: "x", steps: [{ id: "s", phase: "not-a-phase", engine: "llm" }] }),
    ).toThrow();
  });
});

describe("deriveDefaultWorkflow", () => {
  test("no evaluators → the 6 core phases in contract order, no gates", () => {
    seedWorkspace("plain");
    const wf = deriveDefaultWorkflow("plain");
    expect(wf.steps.map((s) => s.phase)).toEqual([
      "intake",
      "style-lock",
      "scenario",
      "assets",
      "render",
      "eval",
    ]);
    expect(wf.steps.every((s) => s.gate.length === 0)).toBe(true);
    // Default video universe: assets generate video.
    expect(wf.steps.find((s) => s.phase === "assets")!.engine).toBe("generate.video");
    // Creative phases stop for approval; render auto-advances.
    expect(wf.steps.find((s) => s.phase === "scenario")!.mode).toBe("approve");
    expect(wf.steps.find((s) => s.phase === "render")!.mode).toBe("auto");
  });

  test("image content mode flips the assets engine to generate.image", () => {
    seedWorkspace("pics");
    const wf = deriveDefaultWorkflow("pics", "social-carousel");
    expect(wf.steps.find((s) => s.phase === "assets")!.engine).toBe("generate.image");
  });

  test("stageGates attach as step gates with approve mode; render precedes eval", () => {
    seedWorkspace("silent-hill", SILENT_HILL_EVALS);
    const wf = deriveDefaultWorkflow("silent-hill");
    const byPhase = Object.fromEntries(wf.steps.map((s) => [s.phase, s]));
    expect(byPhase["scenario"].gate).toEqual(["scenario-fidelity"]);
    expect(byPhase["eval"].gate).toEqual(["material-density", "edit-correctness", "insta-metric-fit"]);
    expect(byPhase["assets"].mode).toBe("approve");
    const renderIdx = wf.steps.findIndex((s) => s.phase === "render");
    const evalIdx = wf.steps.findIndex((s) => s.phase === "eval");
    expect(renderIdx).toBeLessThan(evalIdx);
  });
});

describe("loadWorkflow gate validation", () => {
  test("loads a scaffolded workflow and round-trips its steps", async () => {
    seedWorkspace("silent-hill", SILENT_HILL_EVALS);
    const wf = deriveDefaultWorkflow("silent-hill");
    fs.mkdirSync(workflowsDir("silent-hill"), { recursive: true });
    fs.writeFileSync(workflowPath("silent-hill", "episode"), JSON.stringify(wf));
    const loaded = await loadWorkflow("silent-hill", "episode");
    expect(loaded.steps.map((s) => s.phase)).toEqual(wf.steps.map((s) => s.phase));
  });

  test("throws when a step gates on an unknown criterion", async () => {
    seedWorkspace("silent-hill", SILENT_HILL_EVALS);
    fs.mkdirSync(workflowsDir("silent-hill"), { recursive: true });
    fs.writeFileSync(
      workflowPath("silent-hill", "broken"),
      JSON.stringify({ name: "broken", steps: [{ id: "s", phase: "eval", engine: "eval", gate: ["does-not-exist"] }] }),
    );
    await expect(loadWorkflow("silent-hill", "broken")).rejects.toThrow(/unknown criterion/);
  });
});

describe("evaluateWorkflow status ledger", () => {
  // Seed <root>/.ralphy/workspaces/sh/{evaluators.json,workflows/episode.json} +
  // a project under it with the given files. Returns the project id.
  function seedProject(files: Record<string, string>, scorecard?: unknown): string {
    seedWorkspace("sh", SILENT_HILL_EVALS);
    fs.mkdirSync(workflowsDir("sh"), { recursive: true });
    fs.writeFileSync(workflowPath("sh", "episode"), JSON.stringify(deriveDefaultWorkflow("sh")));
    const proj = path.join(workspaceDir("sh"), "projects", "ep-001");
    fs.mkdirSync(proj, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      const dest = path.join(proj, name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
    }
    if (scorecard) fs.writeFileSync(path.join(proj, "workspace-eval.json"), JSON.stringify(scorecard));
    return "ep-001";
  }

  test("only BRIEF.md → intake done, parks waiting at the gated style-lock step", async () => {
    const id = seedProject({ "BRIEF.md": "# brief\n" });
    const ev = await evaluateWorkflow(id);
    const byId = Object.fromEntries(ev.steps.map((s) => [s.id, s]));
    expect(byId["intake"].status).toBe("done");
    expect(ev.currentStep).toBe("style-lock");
    expect(byId["style-lock"].status).toBe("waiting");
    expect(byId["style-lock"].gateVerdict).toBe("na");
    expect(ev.awaitingApproval).toBe(true);
    expect(ev.complete).toBe(false);
  });

  test("a passing gate verdict clears the step and advances the cursor", async () => {
    const id = seedProject(
      { "BRIEF.md": "# b\n", "STYLE_LOCK.md": "# lock\n" },
      { criteria: [{ id: "character-design-cohesion", verdict: "pass" }, { id: "location-consistency", verdict: "pass" }] },
    );
    const ev = await evaluateWorkflow(id);
    const byId = Object.fromEntries(ev.steps.map((s) => [s.id, s]));
    expect(byId["style-lock"].status).toBe("done");
    expect(ev.currentStep).toBe("scenario");
  });

  test("a failing gate verdict blocks the step", async () => {
    const id = seedProject(
      { "BRIEF.md": "# b\n", "STYLE_LOCK.md": "# lock\n", "scenario.json": "{}" },
      {
        criteria: [
          { id: "character-design-cohesion", verdict: "pass" },
          { id: "location-consistency", verdict: "pass" },
          { id: "scenario-fidelity", verdict: "fail" },
        ],
      },
    );
    const ev = await evaluateWorkflow(id);
    const byId = Object.fromEntries(ev.steps.map((s) => [s.id, s]));
    expect(byId["scenario"].status).toBe("blocked");
    expect(ev.awaitingApproval).toBe(false);
    expect(ev.nextAction).toMatch(/BLOCKED/);
  });
});
