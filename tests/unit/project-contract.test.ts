// `evaluateContract` tests (#406).
//
// The pure `evaluateContract(projectId)` is the readable half of the agent
// production contract (`docs/playbooks/agent-production-contract.md`). It
// inspects a project dir on disk and reports per-phase satisfied/missing +
// nextRecommendedAction. These tests build fixture project dirs at five
// lifecycle stages and assert the ledger reports the right phases at each.
//
// English-only-on-disk discipline: every fixture slug / filename is plain
// English; no Cyrillic, no real-creator tokens.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { evaluateContract, CONTRACT_PHASES } from "../../cli/lib/contract";
import { projectDir } from "../../cli/lib/paths";

const PROJECT = "contract-fixture-406";

let tmp: TmpRoot;

/** Write a project-relative file (mkdir -p the parent). */
function writeArtifact(rel: string, contents = "x") {
  const abs = path.join(projectDir(PROJECT), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
}

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-contract-406");
  // Bare project dir — no artifacts yet (the "draft" pre-intake state).
  fs.mkdirSync(projectDir(PROJECT), { recursive: true });
});

afterEach(() => {
  tmp.cleanup();
});

describe("evaluateContract — phase ledger", () => {
  test("empty project dir: nothing required is satisfied; next action is intake", () => {
    const r = evaluateContract(PROJECT);
    expect(r.project).toBe(PROJECT);
    expect(r.complete).toBe(false);
    // BRIEF.md is the first required artifact.
    expect(r.missingRequired[0]).toBe("BRIEF.md");
    expect(r.nextRecommendedAction).toContain("intake");
    // Agent-driven phases (artifact: null) report satisfied even on empty dir.
    const mode = r.phases.find((p) => p.id === "content-mode")!;
    expect(mode.artifact).toBeNull();
    expect(mode.satisfied).toBe(true);
    expect(mode.required).toBe(false);
  });

  test("phase ids + order match CONTRACT_PHASES", () => {
    const r = evaluateContract(PROJECT);
    expect(r.phases.map((p) => p.id)).toEqual(CONTRACT_PHASES.map((p) => p.id));
  });

  test("draft (BRIEF only): intake satisfied, next is production plan", () => {
    writeArtifact("BRIEF.md", "# brief\nlang: EN\n");
    const r = evaluateContract(PROJECT);
    const intake = r.phases.find((p) => p.id === "intake")!;
    expect(intake.present).toBe(true);
    expect(intake.satisfied).toBe(true);
    expect(r.missingRequired).not.toContain("BRIEF.md");
    expect(r.missingRequired[0]).toBe("PRODUCTION_PLAN.md");
    expect(r.nextRecommendedAction).toContain("PRODUCTION_PLAN.md");
  });

  test("scenario stage: scenario.json present → next is prompts", () => {
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    writeArtifact("scenario.json", JSON.stringify({ scenes: {} }));
    const r = evaluateContract(PROJECT);
    const scenario = r.phases.find((p) => p.id === "scenario")!;
    expect(scenario.satisfied).toBe(true);
    expect(r.missingRequired[0]).toBe("prompts.json");
    expect(r.nextRecommendedAction).toContain("prompts.json");
  });

  test("assets stage: manifest + artifacts present → next is render", () => {
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    writeArtifact("scenario.json", "{}");
    writeArtifact("prompts.json", "{}");
    writeArtifact("asset-manifest.json", JSON.stringify({ slots: {} }));
    writeArtifact("artifacts/images/scene-01.png");
    const r = evaluateContract(PROJECT);
    const assets = r.phases.find((p) => p.id === "assets")!;
    expect(assets.satisfied).toBe(true);
    expect(r.missingRequired[0]).toBe("render/final.mp4");
    expect(r.nextRecommendedAction).toContain("render");
  });

  test("render stage: render/final.mp4 present → next is eval", () => {
    for (const f of ["BRIEF.md", "PRODUCTION_PLAN.md", "scenario.json", "prompts.json", "asset-manifest.json"]) {
      writeArtifact(f, "{}");
    }
    writeArtifact("render/final.mp4");
    const r = evaluateContract(PROJECT);
    const render = r.phases.find((p) => p.id === "render")!;
    expect(render.satisfied).toBe(true);
    expect(r.complete).toBe(false);
    expect(r.missingRequired).toEqual(["eval.json"]);
    expect(r.nextRecommendedAction).toContain("eval");
  });

  test("evaluated stage: eval.json present → all required satisfied, complete", () => {
    for (const f of ["BRIEF.md", "PRODUCTION_PLAN.md", "scenario.json", "prompts.json", "asset-manifest.json"]) {
      writeArtifact(f, "{}");
    }
    writeArtifact("render/final.mp4");
    writeArtifact("eval.json", JSON.stringify({ verdict: "ok" }));
    const r = evaluateContract(PROJECT);
    expect(r.missingRequired).toEqual([]);
    expect(r.complete).toBe(true);
    // All REQUIRED satisfied (complete=true), but optional artifact-bearing
    // phases are still absent → next action points at the first optional gap,
    // which is the earliest such phase in order. After #414 that is the research
    // bootstrap (research-facts.json), which precedes the style lock.
    expect(r.nextRecommendedAction).toContain("Optional next");
    expect(r.nextRecommendedAction).toContain("research-facts.json");
  });

  test("fully complete incl. optional unit + postmortem → 'Contract complete'", () => {
    for (const f of ["BRIEF.md", "PRODUCTION_PLAN.md", "scenario.json", "prompts.json", "asset-manifest.json"]) {
      writeArtifact(f, "{}");
    }
    writeArtifact("render/final.mp4");
    writeArtifact("eval.json", "{}");
    // Every optional artifact-bearing phase present too (incl. the #414/#416/#415
    // additions: research bootstrap + the preflight/polish councils).
    writeArtifact("artifacts/refs/research-facts.json", "{}");
    writeArtifact("STYLE_LOCK.md");
    writeArtifact("council-preflight.json", "{}");
    writeArtifact("repair-plan.json", "{}");
    writeArtifact("council-polish.json", "{}");
    writeArtifact("units/main/unit.json", "{}");
    writeArtifact("postmortem/lessons.md");
    const r = evaluateContract(PROJECT);
    expect(r.complete).toBe(true);
    expect(r.nextRecommendedAction).toContain("Contract complete");
  });

  test("image-pack shape relaxes the scenario requirement", () => {
    // image-pack probe: a selected/ dir and NO render/ dir.
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    fs.mkdirSync(path.join(projectDir(PROJECT), "selected"), { recursive: true });
    const r = evaluateContract(PROJECT);
    expect(r.kind).toBe("image-pack");
    const scenario = r.phases.find((p) => p.id === "scenario")!;
    expect(scenario.required).toBe(false);
    // scenario.json must NOT block the next required step for an image-pack.
    expect(r.missingRequired).not.toContain("scenario.json");
    expect(r.missingRequired[0]).toBe("prompts.json");
  });

  test("non-existent project dir is safe (all artifact phases missing)", () => {
    const r = evaluateContract("does-not-exist-999");
    expect(r.complete).toBe(false);
    expect(r.missingRequired).toContain("BRIEF.md");
  });
});

describe("filesystem production contract boundary", () => {
  test("emits the contract ledger for a fixture project", () => {
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    writeArtifact("scenario.json", "{}");

    const ledger = evaluateContract(PROJECT);
    expect(ledger.project).toBe(PROJECT);
    expect(ledger.phases.map((phase) => phase.id)).toEqual(
      CONTRACT_PHASES.map((phase) => phase.id),
    );
    expect(ledger.missingRequired[0]).toBe("prompts.json");
    expect(ledger.nextRecommendedAction).toContain("prompts.json");
  });
});
