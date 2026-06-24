// Workspace-scoped Run status derivation (#480).
//
// summarizeRun is PURE aggregation over member projects via the existing
// per-project helpers (evaluateContract / buildScorecard / budgetSummary). These
// fixtures seed a temp .ralphy/ tree, create a run, and assert the roll-up.
// NO network, NO model calls.
//
// Coverage:
//   1. status derivation from seeded project fixtures (phase / cost / quality /
//      winners / failures / nextAction).
//   2. missing-project degradation (a project id with no dir → missingProjects,
//      no throw).
//   3. create refuses to clobber an existing run id.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";
import { workspaceDir, projectDir, runDir } from "../../cli/lib/paths.js";
import { createRun, summarizeRun, loadRun, addProjectToRun, appendRunEvent, listRuns } from "../../cli/lib/run.js";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

function seedWorkspace(slug = "default"): void {
  tmp = makeTmpRoot("ralphy-run");
  const dir = workspaceDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "workspace.json"), JSON.stringify({ slug }));
}

function seedProjectFile(project: string, rel: string, body: string): void {
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

/** A native-video eval report with a given verdict + shipReady. */
function evalReport(opts: { verdict?: "pass" | "warn" | "fail"; shipReady?: boolean; findings?: Array<{ category: string; severity: "info" | "warn" | "fail" }> }) {
  const findings = (opts.findings ?? []).map((f, i) => ({
    id: `F${i + 1}`,
    category: f.category,
    severity: f.severity,
    sceneIndex: null,
    timestampSec: null,
    message: `${f.category} finding`,
    fixHint: "fix it",
    fixCommand: null,
  }));
  return {
    schemaVersion: "1.0",
    gate: { mode: "native-video", nativeVideo: true, explicitCheapMode: false, shipReady: opts.shipReady ?? true, reason: "native pass" },
    meta: { video: "render/final.mp4", projectId: null, template: null, evaluatedAt: "2026-06-24T00:00:00Z", durationSec: 15, resolution: { w: 1080, h: 1920 }, fps: 30, codec: { video: "h264", audio: "aac" }, bitrateKbps: 6000 },
    declared: null,
    structure: { scenes: [], sceneCount: 5, avgSceneDurationSec: 3, minSceneDurationSec: 2, maxSceneDurationSec: 4, hookZone: { durationSec: 3, sceneCount: 2, transcript: "stop scrolling now and watch this", wordCount: 6 } },
    audio: { integratedLufs: -16, truePeakDb: -1.5, loudnessRangeLu: 8, deadAirSegments: [], voicePresentPct: 80 },
    captions: { available: true, wordCount: 40, wordsPerSecond: 2.6, densityWarn: false },
    vision: { sceneFindings: [] },
    findings,
    scoring: { weights: {}, penalties: {}, score: 90, verdict: opts.verdict ?? "pass" },
  };
}

/** A fully shipped, ship-ready project (render + passing native eval + motion-design mode). */
function seedShipProject(id: string): void {
  seedProjectFile(id, "render/final.mp4", "fake-mp4");
  seedProjectFile(id, "eval.json", JSON.stringify(evalReport({ verdict: "pass", shipReady: true })));
  seedProjectFile(id, "production-plan.json", JSON.stringify({ contentMode: { mode: "motion-design" } }));
}

describe("summarizeRun — status derivation from seeded fixtures", () => {
  test("rolls up phase, cost, quality, winners, failures, and a next action", async () => {
    seedWorkspace("default");

    // Winner: shipped + ship-ready + $1.50 spend.
    seedShipProject("win-001");
    seedProjectFile("win-001", "logs/generations.jsonl",
      JSON.stringify({ ts: "2026-06-24T00:00:00Z", kind: "image", model: "m", cost_usd: 1.5 }) + "\n");

    // Failure: a render with a FAILED native eval (verdict fail) → blocked scorecard.
    seedProjectFile("fail-001", "render/final.mp4", "fake-mp4");
    seedProjectFile("fail-001", "eval.json", JSON.stringify(evalReport({ verdict: "fail", shipReady: false, findings: [{ category: "audio.true-peak", severity: "fail" }] })));
    seedProjectFile("fail-001", "production-plan.json", JSON.stringify({ contentMode: { mode: "motion-design" } }));
    seedProjectFile("fail-001", "logs/generations.jsonl",
      JSON.stringify({ ts: "2026-06-24T00:00:00Z", kind: "video", model: "m", cost_usd: 0.5 }) + "\n");

    await createRun({ id: "farm-001", workspace: "default", title: "Spring farm", projectIds: ["win-001", "fail-001"] });
    const status = await summarizeRun("farm-001");
    expect(status).not.toBeNull();

    expect(status!.projectCount).toBe(2);
    expect(status!.missingProjects).toEqual([]);
    // cost is the sum of actual spend across members.
    expect(status!.costSummary.spentUsd).toBeCloseTo(2.0, 5);
    expect(status!.costSummary.byProject.length).toBe(2);

    // quality roll-up: one ship winner, one blocked failure.
    expect(status!.winners).toEqual(["win-001"]);
    expect(status!.failures).toEqual(["fail-001"]);
    const byProj = Object.fromEntries(status!.qualitySummary.map((q) => [q.project, q]));
    expect(byProj["win-001"]!.verdict).toBe("ship");
    expect(byProj["fail-001"]!.verdict).toBe("blocked");

    // a failed-quality-gate blocker is surfaced for fail-001.
    expect(status!.blockers.some((b) => b.project === "fail-001" && b.id === "quality-gate-failed")).toBe(true);

    // next action points at the blocker first.
    expect(status!.nextAction).toContain("fail-001");
  });

  test("currentPhase reflects the LAGGARD member project", async () => {
    seedWorkspace("default");
    // advanced: full pipeline to eval.
    seedShipProject("adv-001");
    // laggard: only a brief (intake phase).
    seedProjectFile("lag-001", "BRIEF.md", "# brief\n");

    await createRun({ id: "farm-002", workspace: "default", title: "Mixed farm", projectIds: ["adv-001", "lag-001"] });
    const status = await summarizeRun("farm-002");
    // intake is the first artifact-bearing phase; lag-001 sits there → it is the cursor.
    expect(status!.currentPhase).toBe("intake");
  });
});

describe("summarizeRun — missing-project degradation", () => {
  test("an unresolvable member project lands in missingProjects, never throws", async () => {
    seedWorkspace("default");
    seedShipProject("real-001");

    await createRun({ id: "farm-003", workspace: "default", title: "Partly real", projectIds: ["real-001", "ghost-999"] });
    const status = await summarizeRun("farm-003");
    expect(status!.missingProjects).toEqual(["ghost-999"]);
    expect(status!.projectCount).toBe(2);
    // the resolved one still rolls up.
    expect(status!.winners).toEqual(["real-001"]);
  });

  test("a run with ZERO member projects summarizes cleanly", async () => {
    seedWorkspace("default");
    await createRun({ id: "farm-004", workspace: "default", title: "Empty farm" });
    const status = await summarizeRun("farm-004");
    expect(status!.projectCount).toBe(0);
    expect(status!.currentPhase).toBeNull();
    expect(status!.costSummary.spentUsd).toBe(0);
    expect(status!.nextAction).toContain("add-project");
  });

  test("summarizeRun on an unknown run id returns null", async () => {
    seedWorkspace("default");
    expect(await summarizeRun("does-not-exist")).toBeNull();
  });
});

describe("createRun / loadRun / listRuns / addProjectToRun / appendRunEvent", () => {
  test("createRun writes run.json and loadRun reads it back", async () => {
    seedWorkspace("default");
    const m = await createRun({ id: "farm-005", workspace: "default", title: "T", brief: "b", workflow: "episode" });
    expect(fs.existsSync(path.join(runDir("default", "farm-005"), "run.json"))).toBe(true);
    const loaded = await loadRun("farm-005");
    expect(loaded!.title).toBe("T");
    expect(loaded!.workflow).toBe("episode");
  });

  test("createRun refuses to clobber an existing run id", async () => {
    seedWorkspace("default");
    await createRun({ id: "dup-001", workspace: "default", title: "first" });
    await expect(createRun({ id: "dup-001", workspace: "default", title: "second" })).rejects.toThrow(/already exists/);
  });

  test("addProjectToRun appends idempotently; missing run → null", async () => {
    seedWorkspace("default");
    await createRun({ id: "farm-006", workspace: "default", title: "T", projectIds: ["a"] });
    await addProjectToRun("farm-006", "b");
    await addProjectToRun("farm-006", "b"); // idempotent
    const loaded = await loadRun("farm-006");
    expect(loaded!.projectIds).toEqual(["a", "b"]);
    expect(await addProjectToRun("ghost", "x")).toBeNull();
  });

  test("appendRunEvent only appends to run-events.jsonl", async () => {
    seedWorkspace("default");
    await createRun({ id: "farm-007", workspace: "default", title: "T" });
    await appendRunEvent("farm-007", { kind: "created", message: "one" });
    await appendRunEvent("farm-007", { kind: "note", message: "two" });
    const log = fs.readFileSync(path.join(runDir("default", "farm-007"), "run-events.jsonl"), "utf-8");
    const lines = log.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).message).toBe("one");
    expect(JSON.parse(lines[1]!).kind).toBe("note");
  });

  test("listRuns returns the workspace's runs sorted", async () => {
    seedWorkspace("default");
    await createRun({ id: "farm-b", workspace: "default", title: "B", projectIds: ["x"] });
    await createRun({ id: "farm-a", workspace: "default", title: "A" });
    const rows = await listRuns("default");
    expect(rows.map((r) => r.id)).toEqual(["farm-a", "farm-b"]);
    expect(rows.find((r) => r.id === "farm-b")!.projects).toBe(1);
  });
});
