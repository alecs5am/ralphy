// `buildRepairPlan` + `classifyFindingOwner` + `ralphy project repair-plan`
// tests (#409 — the deterministic eval-to-repair core).
//
// The fixer reads eval output and turns it into an ordered, owner-classified
// RepairPlan the agent presents BEFORE any paid regeneration. These tests
// assert the deterministic guarantees the fixer's approval gate rests on:
//   (a) owner mapping per category (style/ai-artifacts → art-director,
//       structure/hook → scenarist, audio/captions/format → editor, unknown →
//       editor),
//   (b) priority order (fail before warn before info),
//   (c) deep-vision what_to_redo is the preferred source when present,
//   (d) every plan item is born approvalState="pending" (no auto-approve),
//   (e) the CLI verb writes repair-plan.json with ZERO model calls.
//
// English-only-on-disk discipline: every fixture slug / message is plain
// English; no Cyrillic, no real-creator tokens.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  buildRepairPlan,
  classifyFindingOwner,
  isUnknownCategory,
  type DeepVisionFile,
} from "../../cli/lib/repair";
import { parseRepairPlan } from "../../cli/lib/schemas/repair-plan";
import type { EvalReport, Finding, Verdict } from "../../cli/lib/eval/types";
import { projectDir } from "../../cli/lib/paths";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const PROJECT = "repair-fixture-409";

// ─── Fixture builders ─────────────────────────────────────────────────────────

let _idCounter = 0;
function finding(partial: Partial<Finding> & { category: string; severity: Finding["severity"] }): Finding {
  _idCounter += 1;
  return {
    id: partial.id ?? `F${_idCounter}`,
    category: partial.category,
    severity: partial.severity,
    sceneIndex: partial.sceneIndex ?? null,
    timestampSec: partial.timestampSec ?? null,
    message: partial.message ?? `issue in ${partial.category}`,
    fixHint: partial.fixHint ?? "do the fix",
    fixCommand: partial.fixCommand ?? null,
  };
}

function evalReport(findings: Finding[], verdict: Verdict): EvalReport {
  return {
    schemaVersion: "1.0",
    gate: {
      mode: "native-video",
      nativeVideo: true,
      explicitCheapMode: false,
      shipReady: verdict === "pass",
      reason: "test fixture",
    },
    meta: {
      video: "render/final.mp4",
      projectId: PROJECT,
      template: null,
      evaluatedAt: "2026-06-14T00:00:00.000Z",
      durationSec: 30,
      resolution: { w: 1080, h: 1920 },
      fps: 30,
      codec: { video: "h264", audio: "aac" },
      bitrateKbps: 5000,
    },
    declared: null,
    structure: {
      scenes: [],
      sceneCount: 0,
      avgSceneDurationSec: 0,
      minSceneDurationSec: 0,
      maxSceneDurationSec: 0,
      hookZone: { durationSec: 3, sceneCount: 0, transcript: "", wordCount: 0 },
    },
    audio: {
      integratedLufs: -16,
      truePeakDb: -1.5,
      loudnessRangeLu: 8,
      deadAirSegments: [],
      voicePresentPct: 80,
    },
    captions: { available: true, wordCount: 60, wordsPerSecond: 2, densityWarn: false },
    vision: { sceneFindings: [] },
    findings,
    scoring: {
      weights: { info: 1, warn: 6, fail: 18 },
      penalties: { info: 0, warn: 0, fail: 0 },
      score: 80,
      verdict,
    },
  };
}

const NOW = "2026-06-14T12:00:00.000Z";

// ─── (a) owner mapping ──────────────────────────────────────────────────────

describe("classifyFindingOwner — deterministic category → owner map", () => {
  test("style / register / aesthetic / brief / vision → art-director", () => {
    expect(classifyFindingOwner("style.register-mismatch")).toBe("art-director");
    expect(classifyFindingOwner("style.rule-violation")).toBe("art-director");
    expect(classifyFindingOwner("style.aesthetic-mechanism-missing")).toBe("art-director");
    expect(classifyFindingOwner("style.timing-hook-first-3s")).toBe("art-director");
    expect(classifyFindingOwner("brief.intent-drift")).toBe("art-director");
    expect(classifyFindingOwner("vision.ai-artifacts")).toBe("art-director");
    expect(classifyFindingOwner("vision.text")).toBe("art-director");
    expect(classifyFindingOwner("vision.composition")).toBe("art-director");
    expect(classifyFindingOwner("vision.brand")).toBe("art-director");
    expect(classifyFindingOwner("vision.quality")).toBe("art-director");
  });

  test("structure / hook / duration → scenarist", () => {
    expect(classifyFindingOwner("structure.duration-drift")).toBe("scenarist");
    expect(classifyFindingOwner("structure.hook-zone-empty")).toBe("scenarist");
    expect(classifyFindingOwner("structure.hook-zone-static")).toBe("scenarist");
    expect(classifyFindingOwner("structure.hook-zone-thin-vo")).toBe("scenarist");
  });

  test("audio / captions / format → editor", () => {
    expect(classifyFindingOwner("audio.loudness")).toBe("editor");
    expect(classifyFindingOwner("audio.true-peak")).toBe("editor");
    expect(classifyFindingOwner("audio.dead-air")).toBe("editor");
    expect(classifyFindingOwner("captions.thin")).toBe("editor");
    expect(classifyFindingOwner("captions.dense")).toBe("editor");
    expect(classifyFindingOwner("captions.missing")).toBe("editor");
    expect(classifyFindingOwner("format.aspect-ratio")).toBe("editor");
    expect(classifyFindingOwner("format.resolution")).toBe("editor");
    expect(classifyFindingOwner("format.fps")).toBe("editor");
  });

  test("unknown category defaults to editor + is flagged unknown", () => {
    expect(classifyFindingOwner("totally.new-thing")).toBe("editor");
    expect(isUnknownCategory("totally.new-thing")).toBe(true);
    expect(isUnknownCategory("audio.loudness")).toBe(false);
  });
});

// ─── (b) priority order + (d) approvalState ─────────────────────────────────

describe("buildRepairPlan — fail-heavy eval", () => {
  beforeEach(() => {
    _idCounter = 0;
  });

  test("priority orders fail before warn before info", () => {
    const report = evalReport(
      [
        finding({ category: "captions.thin", severity: "info", id: "F-info" }),
        finding({ category: "audio.loudness", severity: "fail", id: "F-fail" }),
        finding({ category: "structure.hook-zone-static", severity: "warn", id: "F-warn" }),
      ],
      "fail",
    );
    const plan = buildRepairPlan(report, null, { now: NOW });

    // Sorted by severity rank: fail (priority 1), warn (2), info (3).
    expect(plan.items.map((i) => i.findingId)).toEqual(["F-fail", "F-warn", "F-info"]);
    expect(plan.items.map((i) => i.priority)).toEqual([1, 2, 3]);
    expect(plan.items.map((i) => i.severity)).toEqual(["fail", "warn", "info"]);
  });

  test("every item is born approvalState=pending (no auto-approve)", () => {
    const report = evalReport(
      [
        finding({ category: "style.register-mismatch", severity: "fail" }),
        finding({ category: "audio.dead-air", severity: "warn" }),
      ],
      "fail",
    );
    const plan = buildRepairPlan(report, null, { now: NOW });
    expect(plan.items.length).toBe(2);
    expect(plan.items.every((i) => i.approvalState === "pending")).toBe(true);
  });

  test("owner classification flows into the plan + byOwner index", () => {
    const report = evalReport(
      [
        finding({ category: "style.register-mismatch", severity: "fail", id: "art" }),
        finding({ category: "structure.duration-drift", severity: "warn", id: "scen" }),
        finding({ category: "audio.loudness", severity: "warn", id: "edit" }),
      ],
      "fail",
    );
    const plan = buildRepairPlan(report, null, { now: NOW });
    const byId = Object.fromEntries(plan.items.map((i) => [i.findingId, i.owner]));
    expect(byId["art"]).toBe("art-director");
    expect(byId["scen"]).toBe("scenarist");
    expect(byId["edit"]).toBe("editor");
    expect(plan.byOwner["art-director"]).toContain("art");
    expect(plan.byOwner["scenarist"]).toContain("scen");
    expect(plan.byOwner["editor"]).toContain("edit");
  });

  test("plan validates against the Zod schema", () => {
    const report = evalReport([finding({ category: "audio.loudness", severity: "fail" })], "fail");
    const plan = buildRepairPlan(report, null, { now: NOW });
    expect(() => parseRepairPlan(plan)).not.toThrow();
    expect(plan.sourceVerdict).toBe("fail");
    expect(plan.projectId).toBe(PROJECT);
  });
});

describe("buildRepairPlan — warn-only eval", () => {
  beforeEach(() => {
    _idCounter = 0;
  });

  test("warn-only plan: no fail items, all warns ranked first", () => {
    const report = evalReport(
      [
        finding({ category: "captions.dense", severity: "warn", id: "w1" }),
        finding({ category: "captions.missing", severity: "info", id: "i1" }),
      ],
      "warn",
    );
    const plan = buildRepairPlan(report, null, { now: NOW });
    expect(plan.sourceVerdict).toBe("warn");
    expect(plan.items.some((i) => i.severity === "fail")).toBe(false);
    expect(plan.items[0].severity).toBe("warn");
    expect(plan.items[0].priority).toBe(1);
  });

  test("empty findings → empty plan, still valid", () => {
    const report = evalReport([], "pass");
    const plan = buildRepairPlan(report, null, { now: NOW });
    expect(plan.items).toEqual([]);
    expect(plan.totalCostEstimate).toBe(0);
    expect(() => parseRepairPlan(plan)).not.toThrow();
  });
});

// ─── (c) deep-vision preferred ──────────────────────────────────────────────

describe("buildRepairPlan — deep-vision what_to_redo preferred", () => {
  beforeEach(() => {
    _idCounter = 0;
  });

  const deep: DeepVisionFile = {
    model: "google/gemini-3.1-pro-preview",
    parsed: {
      overall_verdict: "fail",
      what_to_redo: [
        {
          priority: 2,
          target: "audio",
          action: "Re-mix the VO bed",
          rationale: "the music ducks too hard at 5s",
        },
        {
          priority: 1,
          target: "start-frame",
          action: "Re-anchor scene-01 in the correct register",
          rationale: "register reads as studio, brief asked for handheld",
        },
      ],
    },
    raw: "{}",
  };

  test("deep-vision is the source when what_to_redo is present", () => {
    // The eval findings here are deliberately different so we can tell which
    // source won — the plan must come from the deep-vision redos.
    const report = evalReport(
      [finding({ category: "format.fps", severity: "warn", id: "from-findings" })],
      "fail",
    );
    const plan = buildRepairPlan(report, deep, { now: NOW });
    expect(plan.sourcePreferred).toBe("deep-vision");
    expect(plan.items.every((i) => i.source === "deep-vision")).toBe(true);
    // The findings[] item must NOT appear.
    expect(plan.items.some((i) => i.findingId === "from-findings")).toBe(false);
  });

  test("deep-vision priority 1 floats above priority 2; owners map from target", () => {
    const report = evalReport([], "fail");
    const plan = buildRepairPlan(report, deep, { now: NOW });
    // priority-1 (start-frame, fail) sorts before priority-2 (audio, warn).
    expect(plan.items[0].targetSlotOrFile).toBe("start-frame");
    expect(plan.items[0].severity).toBe("fail");
    expect(plan.items[0].owner).toBe("art-director");
    expect(plan.items[1].targetSlotOrFile).toBe("audio");
    expect(plan.items[1].severity).toBe("warn");
    expect(plan.items[1].owner).toBe("editor");
    // Still no auto-approve.
    expect(plan.items.every((i) => i.approvalState === "pending")).toBe(true);
  });

  test("falls back to findings when what_to_redo is empty", () => {
    const report = evalReport([finding({ category: "audio.loudness", severity: "fail", id: "fb" })], "fail");
    const emptyDeep: DeepVisionFile = { parsed: { what_to_redo: [] } };
    const plan = buildRepairPlan(report, emptyDeep, { now: NOW });
    expect(plan.sourcePreferred).toBe("findings");
    expect(plan.items[0].findingId).toBe("fb");
  });
});

// ─── (e) CLI smoke — zero model calls ───────────────────────────────────────

describe("ralphy project repair-plan <id> (CLI smoke, no model calls)", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-repair-409");
    fs.mkdirSync(projectDir(PROJECT), { recursive: true });
    const regPath = path.join(tmp.dir, ".ralphy", "registry.json");
    fs.writeFileSync(
      regPath,
      JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Repair Fixture", workspace: "default" } } }),
    );
  });

  afterEach(() => {
    tmp.cleanup();
  });

  function writeArtifact(rel: string, contents: string) {
    const abs = path.join(projectDir(PROJECT), rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  }

  test("writes repair-plan.json + REPAIR_PLAN.md from eval.json, no API keys needed", () => {
    _idCounter = 0;
    const report = evalReport(
      [
        finding({ category: "style.register-mismatch", severity: "fail", id: "F1" }),
        finding({ category: "audio.loudness", severity: "warn", id: "F2" }),
      ],
      "fail",
    );
    writeArtifact("eval.json", JSON.stringify(report));

    // Deliberately strip provider keys: a deterministic plan must not need them.
    const env = { ...process.env };
    delete env.OPENROUTER_API_KEY;
    delete env.ELEVENLABS_API_KEY;

    const r = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "--json", "project", "repair-plan", PROJECT],
      { cwd: tmp.dir, encoding: "utf8", env },
    );
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.project).toBe(PROJECT);
    expect(json.plan.items.length).toBe(2);
    expect(json.plan.items[0].severity).toBe("fail");
    expect(json.plan.items.every((i: any) => i.approvalState === "pending")).toBe(true);

    // Files landed on disk.
    const planJson = path.join(projectDir(PROJECT), "repair-plan.json");
    const planMd = path.join(projectDir(PROJECT), "REPAIR_PLAN.md");
    expect(fs.existsSync(planJson)).toBe(true);
    expect(fs.existsSync(planMd)).toBe(true);

    // No generations.jsonl row → no model call happened.
    const genLog = path.join(projectDir(PROJECT), "logs", "generations.jsonl");
    expect(fs.existsSync(genLog)).toBe(false);
  });

  test("re-running auto-versions the prior plan (append-only)", () => {
    _idCounter = 0;
    const report = evalReport([finding({ category: "audio.loudness", severity: "fail" })], "fail");
    writeArtifact("eval.json", JSON.stringify(report));

    const run = () =>
      spawnSync("bun", ["run", CLI, "--cwd", tmp.dir, "--json", "project", "repair-plan", PROJECT], {
        cwd: tmp.dir,
        encoding: "utf8",
        env: { ...process.env },
      });
    expect(run().status).toBe(0);
    const second = run();
    expect(second.status).toBe(0);
    const json = JSON.parse(second.stdout);
    // The first plan was archived, not overwritten.
    expect(json.artifacts.archivedJson).toBeTruthy();
    expect(fs.existsSync(path.join(projectDir(PROJECT), "repair-plan.v1.json"))).toBe(true);
  });

  test("missing eval.json → E_NOT_FOUND, no files written", () => {
    const r = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "--json", "project", "repair-plan", PROJECT],
      { cwd: tmp.dir, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).not.toBe(0);
    expect(fs.existsSync(path.join(projectDir(PROJECT), "repair-plan.json"))).toBe(false);
  });
});
