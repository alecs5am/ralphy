// Unit production lifecycle resume model + stop conditions (#414).
//
// The canonical lifecycle (docs/playbooks/unit-lifecycle.md) is backed by the
// #406 production contract (`CONTRACT_PHASES`) extended with the research (#416)
// and council (#415) phases. `evaluateContract()` (alias `lifecycleStatus()`)
// is the machine-readable resume model: currentPhase / nextPhase / nextStep /
// stopConditions / polished. These tests drive a fixture project through the
// COMPLETE phase path and assert the cursor advances correctly, then assert the
// two load-bearing stop conditions: the #411 native-video gate (a keyframe eval
// must NOT make the Unit "polished") and the #412/#413 unsupported-mode stop.
//
// English-only-on-disk: every fixture slug / filename / string is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  ensureDomainContractProject,
  setDomainContractDocumentStage,
  setDomainContractStage,
} from "../helpers/domain-contract";
import {
  evaluateContract,
  lifecycleStatus,
  CONTRACT_PHASES,
} from "../../cli/lib/contract";
import { projectDir, root } from "../../cli/lib/paths";

const PROJECT = "lifecycle-fixture-414";

let tmp: TmpRoot;

/** Write a project-relative file (mkdir -p the parent). */
function writeArtifact(rel: string, contents = "x") {
  ensureDomainContractProject(root(), PROJECT);
  const abs = path.join(projectDir(PROJECT), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
  const stage = {
    "BRIEF.md": "intake",
    "PRODUCTION_PLAN.md": "production-plan",
    "scenario.json": "scenario",
    "prompts.json": "prompts",
    "asset-manifest.json": "assets",
    "render/final.mp4": "render",
    "eval.json": "eval",
    "artifacts/refs/research-facts.json": "research",
    "STYLE_LOCK.md": "style-lock",
    "council-preflight.json": "council-preflight",
    "repair-plan.json": "repair",
    "council-polish.json": "council-polish",
    "units/main/unit.json": "unit",
    "postmortem/lessons.md": "postmortem",
  }[rel];
  if (stage === "eval") {
    setDomainContractDocumentStage(root(), PROJECT, stage, JSON.parse(contents));
  } else if (stage !== undefined) {
    setDomainContractStage(root(), PROJECT, stage);
  }
}

/** Write a production-plan.json with the given fields. */
function writePlan(fields: Record<string, unknown>) {
  writeArtifact("production-plan.json", JSON.stringify(fields));
  setDomainContractDocumentStage(
    root(),
    PROJECT,
    "production-plan",
    fields,
    Array.isArray(fields.bypasses) && fields.bypasses.some((value) => String(value).startsWith("skip:production-plan"))
      ? "complete"
      : "awaiting-approval",
  );
}

/** Write an eval.json with a gate + scoring shape (the EvalReport subset we read). */
function writeEval(opts: {
  shipReady?: boolean;
  nativeVideo?: boolean;
  mode?: string;
  verdict?: string;
}) {
  writeArtifact(
    "eval.json",
    JSON.stringify({
      gate: {
        mode: opts.mode ?? "native-video",
        nativeVideo: opts.nativeVideo ?? true,
        shipReady: opts.shipReady ?? false,
      },
      scoring: { verdict: opts.verdict ?? "pass" },
    }),
  );
}

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-lifecycle-414");
  ensureDomainContractProject(root(), PROJECT);
  fs.mkdirSync(projectDir(PROJECT), { recursive: true });
});

afterEach(() => {
  tmp.cleanup();
});

describe("extended CONTRACT_PHASES (#414 superset)", () => {
  test("the three landed phases are inserted in the right positions", () => {
    const ids = CONTRACT_PHASES.map((p) => p.id);
    // research (#416) BEFORE style-lock.
    expect(ids.indexOf("research")).toBeGreaterThan(ids.indexOf("reference-gate"));
    expect(ids.indexOf("research")).toBeLessThan(ids.indexOf("style-lock"));
    // council-preflight (#415) AFTER production-plan, BEFORE scenario.
    expect(ids.indexOf("council-preflight")).toBeGreaterThan(ids.indexOf("production-plan"));
    expect(ids.indexOf("council-preflight")).toBeLessThan(ids.indexOf("scenario"));
    // council-polish (#415) AFTER eval, BEFORE unit.
    expect(ids.indexOf("council-polish")).toBeGreaterThan(ids.indexOf("eval"));
    expect(ids.indexOf("council-polish")).toBeLessThan(ids.indexOf("unit"));
  });

  test("the three new phases are optional (not required against the fs)", () => {
    for (const id of ["research", "council-preflight", "council-polish"]) {
      const phase = CONTRACT_PHASES.find((p) => p.id === id)!;
      expect(phase.required).toBe(false);
    }
  });

  test("lifecycleStatus is the same backbone as evaluateContract (no fork)", () => {
    writeArtifact("BRIEF.md");
    const a = evaluateContract(PROJECT);
    const b = lifecycleStatus(PROJECT);
    expect(b.phases.map((p) => p.id)).toEqual(a.phases.map((p) => p.id));
    expect(b.currentPhase).toBe(a.currentPhase);
  });
});

describe("resume model — complete state-transition path", () => {
  // Advances the fixture one phase at a time and asserts the resume cursor
  // (currentPhase / nextPhase) tracks the deepest landed artifact.
  test("currentPhase / nextPhase advance through the full lifecycle", () => {
    // Empty project (pre-intake). No artifact-bearing phase is satisfied yet, so
    // currentPhase is null; the resume cursor points at the first missing
    // artifact-bearing phase (intake).
    let r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBeNull();
    expect(r.nextPhase).toBe("intake"); // first missing artifact-bearing phase
    expect(r.nextStep).toContain("intake");
    expect(r.polished).toBeNull();

    // 1. intake → BRIEF.md. Next is the production plan (research/style-lock are
    //    optional, so they aren't the *required* cursor — but the resume cursor
    //    nextPhase points at the first missing ARTIFACT-bearing phase: research).
    writeArtifact("BRIEF.md");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("intake");
    expect(r.nextPhase).toBe("research");

    // 2. research → research-facts.json. Next missing artifact is the style lock.
    writeArtifact("artifacts/refs/research-facts.json", "{}");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("research");
    expect(r.nextPhase).toBe("style-lock");

    // 3. style-lock → STYLE_LOCK.md. Next is the production plan.
    writeArtifact("STYLE_LOCK.md");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("style-lock");
    expect(r.nextPhase).toBe("production-plan");

    // 4. production-plan → PRODUCTION_PLAN.md (+ a supported-mode plan json, no
    //    refs required so no reference stop). Next missing is council-preflight.
    writeArtifact("PRODUCTION_PLAN.md");
    writePlan({ contentMode: { mode: "ugc-review" }, estimate: { wallClockMin: 12 }, requiredRefs: [], bypasses: [] });
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("production-plan");
    expect(r.nextPhase).toBe("council-preflight");
    // wait-for-go gate is open (plan written, no assets) → user-approval-needed.
    expect(r.stopConditions.map((s) => s.id)).toContain("user-approval-needed");

    // 5. council-preflight → council-preflight.json. Next is scenario.
    writeArtifact("council-preflight.json", "{}");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("council-preflight");
    expect(r.nextPhase).toBe("scenario");

    // 6. scenario → scenario.json. Next is prompts.
    writeArtifact("scenario.json", "{}");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("scenario");
    expect(r.nextPhase).toBe("prompts");

    // 7. prompts → prompts.json. Next is assets.
    writeArtifact("prompts.json", "{}");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("prompts");
    expect(r.nextPhase).toBe("assets");

    // 8. assets → asset-manifest.json. Now the spend gate closes (assets started).
    writeArtifact("asset-manifest.json", "{}");
    writeArtifact("artifacts/images/scene-01.png");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("assets");
    expect(r.nextPhase).toBe("render");
    expect(r.stopConditions.map((s) => s.id)).not.toContain("user-approval-needed");

    // 9. render → render/final.mp4. No eval yet → native-gate-required fires,
    //    polished is false (a render exists but the native gate has not passed).
    writeArtifact("render/final.mp4");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("render");
    expect(r.nextPhase).toBe("eval");
    expect(r.polished).toBe(false);
    expect(r.stopConditions.map((s) => s.id)).toContain("native-gate-required");

    // 10. eval → eval.json (native-video, ship-ready). Native gate passes →
    //     polished true, native-gate-required clears. The next missing
    //     artifact-bearing phase is repair (optional, sits before council-polish).
    writeEval({ shipReady: true, nativeVideo: true, mode: "native-video", verdict: "pass" });
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("eval");
    expect(r.nextPhase).toBe("repair");
    expect(r.polished).toBe(true);
    expect(r.stopConditions.map((s) => s.id)).not.toContain("native-gate-required");
    expect(r.complete).toBe(true); // all REQUIRED artifacts present

    // 11. repair → repair-plan.json. Next is council-polish.
    writeArtifact("repair-plan.json", "{}");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("repair");
    expect(r.nextPhase).toBe("council-polish");

    // 12. council-polish → council-polish.json. Next is unit.
    writeArtifact("council-polish.json", "{}");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("council-polish");
    expect(r.nextPhase).toBe("unit");

    // 13. unit → units/<slug>/unit.json. Next is postmortem.
    writeArtifact("units/main/unit.json", "{}");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("unit");
    expect(r.nextPhase).toBe("postmortem");

    // 14. postmortem → postmortem/. Lifecycle fully complete.
    writeArtifact("postmortem/lessons.md");
    r = evaluateContract(PROJECT);
    expect(r.currentPhase).toBe("postmortem");
    expect(r.nextPhase).toBeNull();
    expect(r.nextStep).toContain("complete");
    expect(r.stopConditions).toEqual([]);
    expect(r.polished).toBe(true);
  });
});

describe("native-video gate stop (#411)", () => {
  // A keyframe eval is a diagnostic — it must NOT let the Unit be "polished".
  function seedThroughRender() {
    for (const f of [
      "BRIEF.md",
      "PRODUCTION_PLAN.md",
      "scenario.json",
      "prompts.json",
      "asset-manifest.json",
    ]) {
      writeArtifact(f, "{}");
    }
    writePlan({ contentMode: { mode: "ugc-review" }, estimate: { wallClockMin: 12 }, requiredRefs: [], bypasses: ["skip:production-plan: user said fire it"] });
    writeArtifact("render/final.mp4");
  }

  test("keyframe eval does NOT make the unit polished — native-gate-required fires", () => {
    seedThroughRender();
    // A keyframe gate forces shipReady false (cli/lib/eval/gate.ts), so polished
    // must be false and the unit-phase stop must fire even with a 'pass' score.
    writeEval({ shipReady: false, nativeVideo: false, mode: "keyframe", verdict: "pass" });
    const r = evaluateContract(PROJECT);
    expect(r.polished).toBe(false);
    const stop = r.stopConditions.find((s) => s.id === "native-gate-required")!;
    expect(stop).toBeDefined();
    expect(stop.phase).toBe("unit");
    expect(stop.severity).toBe("block");
    expect(stop.detail).toContain("native-video");
  });

  test("native-video ship-ready eval makes the unit polished — no native stop", () => {
    seedThroughRender();
    writeEval({ shipReady: true, nativeVideo: true, mode: "native-video", verdict: "pass" });
    const r = evaluateContract(PROJECT);
    expect(r.polished).toBe(true);
    expect(r.stopConditions.map((s) => s.id)).not.toContain("native-gate-required");
  });

  test("a failed eval verdict fires quality-gate-failed", () => {
    seedThroughRender();
    writeEval({ shipReady: false, nativeVideo: true, mode: "native-video", verdict: "fail" });
    const r = evaluateContract(PROJECT);
    expect(r.polished).toBe(false);
    expect(r.stopConditions.map((s) => s.id)).toContain("quality-gate-failed");
  });

  test("an explicit user-approved bypass makes the unit polished without a native pass", () => {
    seedThroughRender();
    // Plan logs a gate-bypass; even a keyframe eval then counts as polished.
    writePlan({ contentMode: { mode: "ugc-review" }, estimate: { wallClockMin: 12 }, requiredRefs: [], bypasses: ["gate-bypass: client approved the cut as-is"] });
    writeEval({ shipReady: false, nativeVideo: false, mode: "keyframe", verdict: "pass" });
    const r = evaluateContract(PROJECT);
    expect(r.polished).toBe(true);
    expect(r.stopConditions.map((s) => s.id)).not.toContain("native-gate-required");
  });
});

describe("unsupported-mode stop (#412/#413)", () => {
  test("a plan recording an unsupported content mode fires mode-unsupported", () => {
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    // As of #436 every registry mode is supported, so the unsupported path is
    // driven by a mode string that is NOT in the registry (isModeSupported
    // returns false for any unknown mode) — the same block the guard fires for a
    // future mode added at supported: false.
    writePlan({ contentMode: { mode: "not-a-real-mode" }, estimate: { wallClockMin: 5 }, requiredRefs: [], bypasses: [] });
    const r = evaluateContract(PROJECT);
    const stop = r.stopConditions.find((s) => s.id === "mode-unsupported")!;
    expect(stop).toBeDefined();
    expect(stop.phase).toBe("content-mode");
    expect(stop.severity).toBe("block");
    expect(stop.detail).toContain("not-a-real-mode");
  });

  test("a supported content mode does NOT fire mode-unsupported", () => {
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    writePlan({ contentMode: { mode: "ugc-review" }, estimate: { wallClockMin: 12 }, requiredRefs: [], bypasses: [] });
    const r = evaluateContract(PROJECT);
    expect(r.stopConditions.map((s) => s.id)).not.toContain("mode-unsupported");
  });
});

describe("reference + estimate stops", () => {
  test("required refs with no refs on disk and no consent fires reference-required", () => {
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    writePlan({ contentMode: { mode: "ugc-review" }, estimate: { wallClockMin: 12 }, requiredRefs: ["product reference image"], bypasses: [] });
    const r = evaluateContract(PROJECT);
    const stop = r.stopConditions.find((s) => s.id === "reference-required")!;
    expect(stop).toBeDefined();
    expect(stop.phase).toBe("reference-gate");
    expect(stop.severity).toBe("block");
  });

  test("required refs satisfied by a logged --no-ref-consent clears the stop", () => {
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    writePlan({ contentMode: { mode: "ugc-review" }, estimate: { wallClockMin: 12 }, requiredRefs: ["product reference image"], bypasses: ["no-ref-consent: generic no-name product"] });
    const r = evaluateContract(PROJECT);
    expect(r.stopConditions.map((s) => s.id)).not.toContain("reference-required");
  });

  test("an over-target wall-clock estimate fires estimate-exceeds-target (warn)", () => {
    writeArtifact("BRIEF.md");
    writeArtifact("PRODUCTION_PLAN.md");
    // 40 min > 1.5 × 20-min single-video target.
    writePlan({ contentMode: { mode: "ugc-review" }, estimate: { wallClockMin: 40 }, requiredRefs: [], bypasses: ["skip:production-plan: go"] });
    const r = evaluateContract(PROJECT);
    const stop = r.stopConditions.find((s) => s.id === "estimate-exceeds-target")!;
    expect(stop).toBeDefined();
    expect(stop.severity).toBe("warn");
  });
});
