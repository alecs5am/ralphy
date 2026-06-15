// `buildBatchReview` + `ralphy batch review <id>` tests (#410).
//
// The pure `buildBatchReview(batch, projectStates)` is the deterministic
// content-farm triage roll-up: it aggregates a batch's member projects'
// already-read artifacts (eval.json, repair-plan.json, generations.jsonl) into
// winners / failures / cost roll-up / style drift / repeated-model-failures /
// recommended-repairs. It makes ZERO model calls and touches no disk, so the
// bulk of this file asserts on it inline; one smoke test drives the CLI verb
// against a fixture batch (`bun run cli/index.ts`, NOT bunx tsx — the latter
// breaks on bun:sqlite per the test discipline).
//
// English-only-on-disk: every fixture id / model / error string is plain
// English; no Cyrillic, no real-creator tokens.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { buildBatchReview, type ProjectStateInput } from "../../cli/lib/batch-review";
import type { EvalReport } from "../../cli/lib/eval/types";
import type { RepairPlan } from "../../cli/lib/schemas/repair-plan";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

// ─── Fixture builders ─────────────────────────────────────────────────────────

/** A minimal native-video eval report with a given verdict + ship gate. */
function evalReport(opts: {
  verdict: "pass" | "warn" | "fail";
  shipReady: boolean;
  nativeVideo?: boolean;
  findings?: EvalReport["findings"];
}): EvalReport {
  return {
    schemaVersion: "1.0",
    gate: {
      mode: opts.nativeVideo === false ? "keyframe" : "native-video",
      nativeVideo: opts.nativeVideo ?? true,
      explicitCheapMode: false,
      shipReady: opts.shipReady,
      reason: "fixture",
    },
    meta: {
      video: "render/final.mp4",
      projectId: null,
      template: null,
      evaluatedAt: "2026-06-01T00:00:00Z",
      durationSec: 15,
      resolution: { w: 1080, h: 1920 },
      fps: 30,
      codec: { video: "h264", audio: "aac" },
      bitrateKbps: 4000,
    },
    declared: null,
    structure: {
      scenes: [],
      sceneCount: 0,
      avgSceneDurationSec: 0,
      minSceneDurationSec: 0,
      maxSceneDurationSec: 0,
      hookZone: { durationSec: 0, sceneCount: 0, transcript: "", wordCount: 0 },
    },
    audio: {
      integratedLufs: null,
      truePeakDb: null,
      loudnessRangeLu: null,
      deadAirSegments: [],
      voicePresentPct: 0,
    },
    captions: { available: false, wordCount: null, wordsPerSecond: null, densityWarn: null },
    vision: { sceneFindings: [] },
    findings: opts.findings ?? [],
    scoring: { weights: {}, penalties: {}, score: 0, verdict: opts.verdict },
  };
}

function finding(
  id: string,
  category: string,
  severity: "info" | "warn" | "fail",
): EvalReport["findings"][number] {
  return {
    id,
    category,
    severity,
    sceneIndex: null,
    timestampSec: null,
    message: `${category} ${severity}`,
    fixHint: "fix it",
    fixCommand: null,
  };
}

function genRow(opts: {
  model: string;
  status: "ok" | "error";
  cost?: number;
  error?: string;
}) {
  return {
    timestamp: "2026-06-01T00:00:00Z",
    provider: "openrouter",
    model: opts.model,
    endpoint: opts.model,
    kind: "image" as const,
    status: opts.status,
    error: opts.error,
    cost_usd: opts.cost,
    input: {},
  };
}

// ─── buildBatchReview ─────────────────────────────────────────────────────────

describe("buildBatchReview — winners / failures / in-progress (#411 ship gate)", () => {
  const states: ProjectStateInput[] = [
    // winner: native pass + ship-ready
    {
      id: "win-001",
      evalReport: evalReport({ verdict: "pass", shipReady: true }),
      generations: [genRow({ model: "google/gemini-3-pro-image-preview", status: "ok", cost: 0.04 })],
    },
    // failure: failed eval
    {
      id: "fail-002",
      evalReport: evalReport({ verdict: "fail", shipReady: false }),
      generations: [genRow({ model: "google/gemini-3-pro-image-preview", status: "ok", cost: 0.08 })],
    },
    // in-progress: no eval yet
    {
      id: "wip-003",
      generations: [genRow({ model: "google/gemini-3-pro-image-preview", status: "ok", cost: 0.02 })],
    },
    // in-progress: warn verdict, not ship-ready (cheap gate)
    {
      id: "warn-004",
      evalReport: evalReport({ verdict: "warn", shipReady: false, nativeVideo: false }),
      generations: [],
    },
  ];

  test("classifies each project against the ship gate", () => {
    const r = buildBatchReview({ batchId: "b1", name: "Batch 1", template: "ugc-base" }, states);
    expect(r.batchId).toBe("b1");
    expect(r.total).toBe(4);
    expect(r.winners).toEqual(["win-001"]);
    expect(r.failures).toEqual(["fail-002"]);
    // wip-003 (no eval) + warn-004 (warn, not ship-ready) are both in progress.
    expect(r.inProgress).toEqual(["warn-004", "wip-003"]);
  });

  test("a warn verdict that is NOT ship-ready is in-progress, not a winner", () => {
    const r = buildBatchReview({ batchId: "b1" }, states);
    const warn = r.items.find((i) => i.id === "warn-004")!;
    expect(warn.status).toBe("in-progress");
    expect(warn.shipReady).toBe(false);
    expect(warn.nativeVideo).toBe(false);
  });

  test("a cheap-gate eval can never be a winner even with a pass verdict", () => {
    // keyframe gate: nativeVideo false, shipReady false even on a pass verdict
    const r = buildBatchReview({ batchId: "b1" }, [
      {
        id: "cheap-001",
        evalReport: evalReport({ verdict: "pass", shipReady: false, nativeVideo: false }),
      },
    ]);
    expect(r.winners).toEqual([]);
    expect(r.inProgress).toEqual(["cheap-001"]);
  });
});

describe("buildBatchReview — cost roll-up (#032 gen-log contract)", () => {
  test("sums per-project generations.jsonl cost_usd and the batch total", () => {
    const r = buildBatchReview({ batchId: "b1" }, [
      {
        id: "a-001",
        generations: [
          genRow({ model: "m1", status: "ok", cost: 0.04 }),
          genRow({ model: "m2", status: "ok", cost: 0.01 }),
        ],
      },
      {
        id: "b-002",
        generations: [genRow({ model: "m1", status: "ok", cost: 0.08 })],
      },
      // a row with no cost contributes 0
      { id: "c-003", generations: [genRow({ model: "m1", status: "error", error: "boom" })] },
    ]);
    expect(r.cost.byProject).toEqual([
      { id: "a-001", costUsd: 0.05 },
      { id: "b-002", costUsd: 0.08 },
      { id: "c-003", costUsd: 0 },
    ]);
    expect(r.cost.totalUsd).toBe(0.13);
  });

  test("normalizes the legacy costUsd alias", () => {
    const r = buildBatchReview({ batchId: "b1" }, [
      {
        id: "legacy-001",
        // legacy row shape: costUsd instead of cost_usd
        generations: [
          { timestamp: "t", provider: "openrouter", model: "m1", endpoint: "m1", kind: "image", status: "ok", costUsd: 0.05, input: {} } as any,
        ],
      },
    ]);
    expect(r.cost.totalUsd).toBe(0.05);
  });
});

describe("buildBatchReview — style drift (eval style.*/brief.* findings)", () => {
  test("flags items with style/register/brief drift findings of warn|fail severity", () => {
    const r = buildBatchReview({ batchId: "b1" }, [
      {
        id: "drift-001",
        evalReport: evalReport({
          verdict: "warn",
          shipReady: false,
          findings: [finding("F1", "style.register-mismatch", "fail"), finding("F2", "brief.intent-drift", "warn")],
        }),
      },
      {
        id: "clean-002",
        evalReport: evalReport({
          verdict: "pass",
          shipReady: true,
          findings: [finding("F1", "audio.loudness", "warn")],
        }),
      },
      // info-severity style finding does NOT count as drift
      {
        id: "info-003",
        evalReport: evalReport({
          verdict: "pass",
          shipReady: true,
          findings: [finding("F1", "style.minor-note", "info")],
        }),
      },
    ]);
    expect(r.styleDrift).toEqual(["drift-001"]);
    const drift = r.items.find((i) => i.id === "drift-001")!;
    expect(drift.styleDriftCategories).toEqual(["brief.intent-drift", "style.register-mismatch"]);
    expect(r.items.find((i) => i.id === "info-003")!.styleDrift).toBe(false);
  });
});

describe("buildBatchReview — repeated model failures (across ≥2 items)", () => {
  test("groups the same (model,error) recurring across multiple projects", () => {
    const r = buildBatchReview({ batchId: "b1" }, [
      { id: "a-001", generations: [genRow({ model: "kling-v3", status: "error", error: "HTTP 429" })] },
      { id: "b-002", generations: [genRow({ model: "kling-v3", status: "error", error: "HTTP 429" })] },
      { id: "c-003", generations: [genRow({ model: "kling-v3", status: "error", error: "HTTP 429" })] },
    ]);
    expect(r.repeatedModelFailures).toHaveLength(1);
    expect(r.repeatedModelFailures[0]).toEqual({
      model: "kling-v3",
      error: "HTTP 429",
      occurrences: 3,
      projects: ["a-001", "b-002", "c-003"],
    });
  });

  test("a failure in only ONE project is NOT a repeated batch failure", () => {
    const r = buildBatchReview({ batchId: "b1" }, [
      {
        id: "a-001",
        generations: [
          genRow({ model: "kling-v3", status: "error", error: "HTTP 500" }),
          genRow({ model: "kling-v3", status: "error", error: "HTTP 500" }),
        ],
      },
      { id: "b-002", generations: [genRow({ model: "kling-v3", status: "ok", cost: 0.04 })] },
    ]);
    // Two errors but in a single project → not a batch-level repeated failure.
    expect(r.repeatedModelFailures).toEqual([]);
  });

  test("distinct errors on the same model are tracked separately", () => {
    const r = buildBatchReview({ batchId: "b1" }, [
      { id: "a-001", generations: [genRow({ model: "m1", status: "error", error: "HTTP 429" })] },
      { id: "b-002", generations: [genRow({ model: "m1", status: "error", error: "HTTP 429" })] },
      { id: "c-003", generations: [genRow({ model: "m1", status: "error", error: "timeout" })] },
    ]);
    // Only the 429 recurs across ≥2 items; the lone timeout does not.
    expect(r.repeatedModelFailures.map((f) => f.error)).toEqual(["HTTP 429"]);
  });
});

describe("buildBatchReview — recommended repairs (#409 owner buckets)", () => {
  test("prefers an already-built repair-plan's byOwner index", () => {
    const repairPlan: RepairPlan = {
      version: 1,
      projectId: "rp-001",
      generatedAt: "2026-06-01T00:00:00Z",
      sourceVerdict: "fail",
      sourcePreferred: "findings",
      items: [
        {
          findingId: "F1",
          category: "style.register-mismatch",
          severity: "fail",
          owner: "art-director",
          source: "findings",
          targetSlotOrFile: "scene-02",
          proposedCommandOrEdit: "re-anchor",
          costEstimate: 0.1,
          risk: "high",
          approvalState: "pending",
          priority: 1,
          message: "drift",
        },
        {
          findingId: "F2",
          category: "audio.loudness",
          severity: "warn",
          owner: "editor",
          source: "findings",
          targetSlotOrFile: null,
          proposedCommandOrEdit: "loudnorm",
          costEstimate: 0,
          risk: "low",
          approvalState: "pending",
          priority: 2,
          message: "quiet",
        },
      ],
      byOwner: { "art-director": ["F1"], editor: ["F2"] },
      totalCostEstimate: 0.1,
      approvalGate: "gate",
    };
    const r = buildBatchReview({ batchId: "b1" }, [
      { id: "rp-001", evalReport: evalReport({ verdict: "fail", shipReady: false }), repairPlan },
    ]);
    const item = r.items.find((i) => i.id === "rp-001")!;
    expect(item.repairsByOwner).toEqual({ "art-director": 1, editor: 1 });
    expect(item.repairCount).toBe(2);
    expect(r.recommendedRepairs.byOwner).toEqual({ "art-director": 1, editor: 1 });
    expect(r.recommendedRepairs.total).toBe(2);
  });

  test("falls back to classifying eval findings when no repair-plan exists", () => {
    const r = buildBatchReview({ batchId: "b1" }, [
      {
        id: "ev-001",
        evalReport: evalReport({
          verdict: "fail",
          shipReady: false,
          findings: [
            finding("F1", "style.register-mismatch", "fail"), // art-director
            finding("F2", "structure.hook-thin", "warn"), // scenarist
            finding("F3", "audio.loudness", "warn"), // editor
            finding("F4", "captions.density", "info"), // info → not counted
          ],
        }),
      },
    ]);
    const item = r.items.find((i) => i.id === "ev-001")!;
    expect(item.repairsByOwner).toEqual({ "art-director": 1, scenarist: 1, editor: 1 });
    expect(item.repairCount).toBe(3);
  });
});

describe("buildBatchReview — recommendation + edge cases", () => {
  test("empty batch returns a scaffold recommendation", () => {
    const r = buildBatchReview({ batchId: "empty" }, []);
    expect(r.total).toBe(0);
    expect(r.winners).toEqual([]);
    expect(r.cost.totalUsd).toBe(0);
    expect(r.recommendation).toContain("No member projects yet");
  });

  test("recommendation names the repeated model failure and the caption handoff", () => {
    const r = buildBatchReview({ batchId: "b1" }, [
      { id: "a-001", evalReport: evalReport({ verdict: "pass", shipReady: true }) },
      { id: "b-002", generations: [genRow({ model: "kling-v3", status: "error", error: "HTTP 429" })] },
      { id: "c-003", generations: [genRow({ model: "kling-v3", status: "error", error: "HTTP 429" })] },
    ]);
    expect(r.recommendation).toContain("kling-v3");
    expect(r.recommendation).toContain("unit caption --bulk");
  });
});

// ─── CLI smoke (bun run cli/index.ts, NOT bunx tsx) ─────────────────────────────

describe("ralphy batch review <id> — CLI smoke", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-batch-review-410");
  });
  afterEach(() => {
    tmp.cleanup();
  });

  /** Write a JSON file under the tmp root (mkdir -p the parent). */
  function writeJson(rel: string, obj: unknown) {
    const abs = path.join(tmp.dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + "\n");
  }
  function writeText(rel: string, text: string) {
    const abs = path.join(tmp.dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }

  test("aggregates a fixture batch into the review JSON shape", () => {
    const wsProjects = ".ralphy/workspaces/default/projects";
    // registry so projectDir resolves the members
    writeJson(".ralphy/registry.json", {
      projects: {
        "win-001": { workspace: "default" },
        "fail-002": { workspace: "default" },
      },
    });
    // batch
    writeJson(".ralphy/workspaces/default/batches/farm-001/batch-config.json", {
      batchId: "farm-001",
      name: "Farm 001",
      template: "ugc-base",
    });
    writeJson(".ralphy/workspaces/default/batches/farm-001/state.json", {
      batchId: "farm-001",
      status: "running",
      projects: ["win-001", "fail-002"],
    });
    // winner
    writeJson(
      `${wsProjects}/win-001/eval.json`,
      evalReport({ verdict: "pass", shipReady: true }),
    );
    writeText(
      `${wsProjects}/win-001/logs/generations.jsonl`,
      JSON.stringify(genRow({ model: "m1", status: "ok", cost: 0.05 })) + "\n",
    );
    // failure with a repeated 429
    writeJson(
      `${wsProjects}/fail-002/eval.json`,
      evalReport({
        verdict: "fail",
        shipReady: false,
        findings: [finding("F1", "style.register-mismatch", "fail")],
      }),
    );
    writeText(
      `${wsProjects}/fail-002/logs/generations.jsonl`,
      JSON.stringify(genRow({ model: "kling-v3", status: "error", error: "HTTP 429" })) + "\n",
    );

    const res = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "batch", "review", "farm-001"],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(0);
    // Output carries an `ok` line + the JSON; parse the JSON object out.
    const start = res.stdout.indexOf("{");
    const review = JSON.parse(res.stdout.slice(start));
    expect(review.batchId).toBe("farm-001");
    expect(review.template).toBe("ugc-base");
    expect(review.total).toBe(2);
    expect(review.winners).toEqual(["win-001"]);
    expect(review.failures).toEqual(["fail-002"]);
    expect(review.cost.totalUsd).toBe(0.05);
    expect(review.styleDrift).toEqual(["fail-002"]);
  });

  test("unknown batch id raises E_NOT_FOUND", () => {
    const res = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "batch", "review", "no-such-batch"],
      { encoding: "utf8" },
    );
    expect(res.status).not.toBe(0);
    expect(res.stdout + res.stderr).toContain("E_NOT_FOUND");
  });
});
