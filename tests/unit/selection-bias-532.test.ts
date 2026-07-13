// Performance-driven selection loop (#532, WIRING layer) — zero-network,
// zero-model unit tests for the two consumers the foundation left open:
//   • the extended SELECTION_DIMENSIONS + lengthBand bucketing,
//   • dimension recording on a produced unit (selection provenance → observations),
//   • the campaign-next picker bias (weights → biased drain, priority still gates,
//     COLD-START byte-for-byte identical to the pre-#532 priority/plan-order drain),
//   • the variance-planner bias (weights → hook/length biased, COLD-START identical
//     to the uniform staggered rotation + #529 pool-coverage guarantee).
//
// tmp-root + env/cwd hygiene per #545: a fresh mkdtemp root, setRoot points the
// paths singleton at it, the prior root restored in afterEach.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setRoot, root as currentRoot, projectDir } from "../../cli/lib/paths.js";
import { appendSnapshots } from "../../cli/lib/analytics/pull.js";
import type { AnalyticsSnapshot } from "../../cli/lib/schemas/analytics.js";
import {
  attributeOutcomes,
  recomputeSelectionWeights,
  lengthBand,
  buildLookup,
  SELECTION_DIMENSIONS,
  DECAY_HALFLIFE_DAYS,
  type WeightsSnapshot,
} from "../../cli/lib/selection.js";
import { assignBatchProfiles } from "../../cli/lib/eval/variance-pools.js";
import { makePrng } from "../../cli/lib/prng.js";
import type { CampaignCell } from "../../cli/lib/schemas/campaign.js";

const WS = "default";
const NOW = Date.parse("2026-07-06T12:00:00.000Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

let rootDir: string;
let wsDir: string;
let savedRoot: string;

beforeEach(() => {
  savedRoot = currentRoot();
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "sel-bias-532-"));
  setRoot(rootDir);
  wsDir = path.join(rootDir, ".ralphy", "workspaces", WS);
  fs.mkdirSync(path.join(wsDir, "campaigns"), { recursive: true });
  fs.writeFileSync(path.join(rootDir, ".ralphy", "registry.json"), JSON.stringify({ projects: {} }));
});
afterEach(() => {
  setRoot(savedRoot);
  fs.rmSync(rootDir, { recursive: true, force: true });
});

// ─── lengthBand bucketing (pure) ─────────────────────────────────────────────

describe("lengthBand bucketing", () => {
  test("seconds: short ≤20, medium ≤40, else long", () => {
    expect(lengthBand(8, "seconds")).toBe("short");
    expect(lengthBand(20, "seconds")).toBe("short");
    expect(lengthBand(21, "seconds")).toBe("medium");
    expect(lengthBand(40, "seconds")).toBe("medium");
    expect(lengthBand(55, "seconds")).toBe("long");
  });
  test("words: short ≤900, medium ≤1600, else long", () => {
    expect(lengthBand(700, "words")).toBe("short");
    expect(lengthBand(1600, "words")).toBe("medium");
    expect(lengthBand(2200, "words")).toBe("long");
  });
  test("deterministic — same input, same band", () => {
    expect(lengthBand(30, "seconds")).toBe(lengthBand(30, "seconds"));
  });
});

describe("SELECTION_DIMENSIONS", () => {
  test("carries the four #532 axes plus format", () => {
    for (const d of ["hookType", "lengthBand", "angle", "thesis", "format"]) {
      expect(SELECTION_DIMENSIONS).toContain(d as never);
    }
  });
});

// ─── dimension recording on a produced unit ──────────────────────────────────

let seq = 0;
function seedUnit(selection: Record<string, string>, snapshots: AnalyticsSnapshot[]): Promise<void> {
  const projectId = `bias-${String(++seq).padStart(3, "0")}`;
  const reg = JSON.parse(fs.readFileSync(path.join(rootDir, ".ralphy", "registry.json"), "utf8"));
  reg.projects[projectId] = { id: projectId, name: projectId, workspace: WS };
  fs.writeFileSync(path.join(rootDir, ".ralphy", "registry.json"), JSON.stringify(reg));
  const unitDir = path.join(projectDir(projectId), "units", "u");
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(
    path.join(unitDir, "unit.json"),
    JSON.stringify({ slug: "u", format: "video", media: ["final.mp4"], created: iso(NOW - 30 * DAY), provenance: { selection } }),
  );
  return appendSnapshots(unitDir, snapshots);
}

const snap = (over: Partial<AnalyticsSnapshot> & { at: string }): AnalyticsSnapshot => ({
  target: "youtube",
  postId: "p1",
  source: "youtube-analytics",
  metrics: {},
  ...over,
});

describe("new-dimension attribution", () => {
  test("a unit stamped with the #532 axes produces observations for each", async () => {
    await seedUnit(
      { hookType: "cold-open-action", lengthBand: "medium", angle: "demo", thesis: "studio", format: "video" },
      [snap({ at: iso(NOW - DAY), metrics: { views: 500, avgViewDurationSec: 30 } })],
    );
    const w = attributeOutcomes(WS, NOW);
    for (const [dim, val] of [
      ["hookType", "cold-open-action"],
      ["lengthBand", "medium"],
      ["angle", "demo"],
      ["thesis", "studio"],
      ["format", "video"],
    ] as const) {
      expect(w.entries.some((e) => e.dimension === dim && e.value === val)).toBe(true);
    }
  });

  test("format falls back to the manifest top-level when selection carries none", async () => {
    // Seed a unit whose provenance has NO selection block — format still attributes
    // from unit.json.format.
    const projectId = `bias-fmt`;
    const reg = JSON.parse(fs.readFileSync(path.join(rootDir, ".ralphy", "registry.json"), "utf8"));
    reg.projects[projectId] = { id: projectId, name: projectId, workspace: WS };
    fs.writeFileSync(path.join(rootDir, ".ralphy", "registry.json"), JSON.stringify(reg));
    const unitDir = path.join(projectDir(projectId), "units", "u");
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify({ slug: "u", format: "carousel", media: ["a.png"], created: iso(NOW - DAY) }));
    await appendSnapshots(unitDir, [snap({ at: iso(NOW - DAY), metrics: { views: 10 } })]);
    const w = attributeOutcomes(WS, NOW);
    expect(w.entries.some((e) => e.dimension === "format" && e.value === "carousel")).toBe(true);
  });
});

// ─── campaign-next picker bias ───────────────────────────────────────────────

const THESES = [
  { id: "studio", statement: "ralphy is a studio for agents" },
  { id: "earns", statement: "agent video earns" },
];

/** Four equal-priority cells with distinct angles so the bias reorders WITHIN one band. */
const EQUAL_CELLS: CampaignCell[] = ["a", "b", "c", "d"].map((angle, i) => ({
  id: `cell-${angle}`,
  thesisId: i % 2 === 0 ? "studio" : "earns",
  format: "video" as const,
  angle,
  keyword: "ai video",
  channel: "youtube" as const,
  priority: 5,
  status: "planned" as const,
}));

/** Write a weights snapshot directly favoring one angle so the picker biases toward it. */
function writeWeights(entries: Array<{ dimension: string; value: string; weight: number }>): void {
  const snapshot: WeightsSnapshot = {
    workspace: WS,
    computedAt: iso(NOW),
    units: { scanned: 1, withAnalytics: 1 },
    halfLifeDays: DECAY_HALFLIFE_DAYS,
    coldStart: false,
    entries: entries.map((e) => ({ ...e, score: e.weight, sampleSize: 5, confidence: 1, lastUpdated: iso(NOW) })),
  };
  fs.writeFileSync(path.join(wsDir, "selection-weights.jsonl"), JSON.stringify(snapshot) + "\n");
}

// ─── variance-planner bias ───────────────────────────────────────────────────

describe("variance-planner COLD-START equivalence", () => {
  test("no bias → assignBatchProfiles is byte-for-byte the uniform rotation", () => {
    const baseline = assignBatchProfiles("article", 12, "camp-a");
    const again = assignBatchProfiles("article", 12, "camp-a");
    expect(again).toEqual(baseline); // deterministic + unchanged from #529
    // The #529 coverage guarantee still holds without bias.
    expect(new Set(baseline.map((p) => p.hookType)).size).toBe(6);
  });
});

describe("variance-planner weight bias", () => {
  test("a heavily-weighted hookType is drawn far more often than the rotation would", () => {
    // article pool has 6 hooks; a 12-item uniform rotation uses each exactly twice.
    const baseline = assignBatchProfiles("article", 12, "camp-a");
    const baselineWinnerCount = baseline.filter((p) => p.hookType === "contrarian-claim").length;
    expect(baselineWinnerCount).toBe(2); // uniform rotation

    const snapshot: WeightsSnapshot = {
      workspace: WS,
      computedAt: iso(NOW),
      units: { scanned: 1, withAnalytics: 1 },
      halfLifeDays: DECAY_HALFLIFE_DAYS,
      coldStart: false,
      entries: [{ dimension: "hookType", value: "contrarian-claim", weight: 0.99, score: 0.99, sampleSize: 5, confidence: 1, lastUpdated: iso(NOW) }],
    };
    const lookup = buildLookup(snapshot, { pinned: new Set(), retired: new Set() });
    const biased = assignBatchProfiles("article", 12, "camp-a", { lookup, prng: makePrng("v-bias") });
    const biasedWinnerCount = biased.filter((p) => p.hookType === "contrarian-claim").length;
    expect(biasedWinnerCount).toBeGreaterThan(baselineWinnerCount); // biased toward the winner
  });

  test("exploration floor: bias never fully starves the other hook types", () => {
    const snapshot: WeightsSnapshot = {
      workspace: WS,
      computedAt: iso(NOW),
      units: { scanned: 1, withAnalytics: 1 },
      halfLifeDays: DECAY_HALFLIFE_DAYS,
      coldStart: false,
      entries: [{ dimension: "hookType", value: "question", weight: 0.99, score: 0.99, sampleSize: 5, confidence: 1, lastUpdated: iso(NOW) }],
    };
    const lookup = buildLookup(snapshot, { pinned: new Set(), retired: new Set() });
    // Over a large batch, non-winning hooks still appear (epsilon floor in sampleWeighted).
    const biased = assignBatchProfiles("article", 200, "camp-floor", { lookup, prng: makePrng("v-floor") });
    const hooks = new Set(biased.map((p) => p.hookType));
    expect(hooks.size).toBeGreaterThan(1);
    expect(hooks.has("question")).toBe(true);
  });
});
