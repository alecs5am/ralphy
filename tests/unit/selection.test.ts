// Performance-driven selection loop (#532, FOUNDATION layer) — zero-network,
// zero-model unit tests. Covers: attribution math on a SPARSE fixture (n=1 →
// wide confidence, low weight, no overfit) and a RICH fixture (clear winner
// surfaces); time decay (older snapshot weighted less); the exploration floor
// (no candidate ever starved to 0 across many seeded draws); weight → sampling
// bias (higher weight sampled more often); pin/retire round-trip (reversible +
// logged); and cold-start (no analytics → uniform). Sampling uses the seeded
// PRNG so every draw assertion is deterministic. Fixture setup mirrors
// tests/unit/analytics.test.ts (tmp-root + seedUnit + appendSnapshots).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import { appendSnapshots } from "../../cli/lib/analytics/pull";
import type { AnalyticsSnapshot } from "../../cli/lib/schemas/analytics";
import {
  attributeOutcomes,
  recomputeSelectionWeights,
  readLatestWeights,
  readSelectionFlags,
  appendSelectionFlag,
  sampleWeighted,
  buildLookup,
  postingWindowBucket,
  DECAY_HALFLIFE_DAYS,
  type Candidate,
  type WeightsSnapshot,
} from "../../cli/lib/selection";
import { makePrng } from "../../cli/lib/farm/prng";

const WS = "default";
const NOW = Date.parse("2026-07-06T12:00:00.000Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-selection-532");
  fs.writeFileSync(path.join(tmp.dir, ".ralphy", "registry.json"), JSON.stringify({ projects: {} }));
});
afterEach(() => tmp.cleanup());

let projectSeq = 0;
/** Register a project under WS + seed one unit with provenance + publish + snapshots. */
async function seedUnit(opts: {
  provenance?: Record<string, unknown>;
  publish?: Array<Record<string, unknown>>;
  snapshots: AnalyticsSnapshot[];
}): Promise<void> {
  const projectId = `sel-${String(++projectSeq).padStart(3, "0")}`;
  const reg = JSON.parse(fs.readFileSync(path.join(tmp.dir, ".ralphy", "registry.json"), "utf8"));
  reg.projects[projectId] = { id: projectId, name: projectId, workspace: WS };
  fs.writeFileSync(path.join(tmp.dir, ".ralphy", "registry.json"), JSON.stringify(reg));

  const unitDir = path.join(projectDir(projectId), "units", "u");
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(
    path.join(unitDir, "unit.json"),
    JSON.stringify({
      slug: "u",
      format: "video",
      media: ["final.mp4"],
      created: iso(NOW - 30 * DAY),
      ...(opts.provenance && { provenance: opts.provenance }),
      ...(opts.publish && { publish: opts.publish }),
    }),
  );
  await appendSnapshots(unitDir, opts.snapshots);
}

const snap = (over: Partial<AnalyticsSnapshot> & { at: string }): AnalyticsSnapshot => ({
  target: "youtube",
  postId: "p1",
  source: "youtube-analytics",
  metrics: {},
  ...over,
});

// ─── cold start ────────────────────────────────────────────────────────────

describe("cold start", () => {
  test("no analytics → coldStart, empty entries, sampler is uniform", () => {
    const w = attributeOutcomes(WS, NOW);
    expect(w.coldStart).toBe(true);
    expect(w.entries).toEqual([]);

    // Uniform: with an empty lookup, seeded draws spread across candidates.
    const cands: Candidate[] = [
      { dimension: "template", value: "a" },
      { dimension: "template", value: "b" },
      { dimension: "template", value: "c" },
    ];
    const lookup = buildLookup(w, { pinned: new Set(), retired: new Set() });
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const prng = makePrng("cold");
    for (let i = 0; i < 3000; i++) counts[sampleWeighted(cands, lookup, { prng }).value]!++;
    // Each ~1000; assert none is starved and the spread is roughly even.
    for (const v of ["a", "b", "c"]) expect(counts[v]!).toBeGreaterThan(700);
  });
});

// ─── attribution: sparse vs rich ─────────────────────────────────────────────

describe("attribution math", () => {
  test("sparse (n=1) → low confidence, weight shrunk toward baseline (no overfit)", async () => {
    // "lonely" is seen ONCE with the workspace-best metrics; a low-performing
    // style provides the spread so lonely's score normalizes high. The point:
    // a raw winner seen once must NOT surface as a confident winner.
    await seedUnit({
      provenance: { style: "lonely" },
      snapshots: [snap({ at: iso(NOW - DAY), metrics: { views: 9999, avgViewDurationSec: 60, ctr: 0.9 } })],
    });
    await seedUnit({
      provenance: { style: "baseline" },
      snapshots: Array.from({ length: 6 }, (_, i) =>
        snap({ at: iso(NOW - (i + 1) * DAY), metrics: { views: 100, avgViewDurationSec: 5, ctr: 0.01 } }),
      ),
    });
    const w = attributeOutcomes(WS, NOW);
    const style = w.entries.find((e) => e.dimension === "style" && e.value === "lonely")!;
    expect(style.sampleSize).toBe(1);
    // decayedCount ≈ 0.985 (1 day of a 45-day half-life) / CONFIDENCE_FULL_AT(5).
    expect(style.confidence).toBeLessThan(0.25);
    // Raw score is near 1 (best metrics) but low confidence shrinks the weight
    // hard toward the 0.5 baseline — n=1 is never a confident winner.
    expect(style.score).toBeGreaterThan(0.9);
    expect(style.weight).toBeGreaterThan(0.5);
    expect(style.weight).toBeLessThan(0.62);
  });

  test("rich fixture → the genuine winner outranks the loser on weight", async () => {
    // Two styles, each with enough snapshots to earn confidence; winner has
    // strictly better views/retention/ctr across the board.
    const many = (base: number, o: Partial<AnalyticsSnapshot["metrics"]>) =>
      Array.from({ length: 6 }, (_, i) =>
        snap({ at: iso(NOW - (i + 1) * DAY), metrics: { views: base + i * 10, avgViewDurationSec: (o.avgViewDurationSec as number) ?? 10, ctr: (o.ctr as number) ?? 0.02, ...o } }),
      );
    await seedUnit({ provenance: { style: "winner" }, snapshots: many(5000, { avgViewDurationSec: 55, ctr: 0.12 }) });
    await seedUnit({ provenance: { style: "loser" }, snapshots: many(100, { avgViewDurationSec: 5, ctr: 0.01 }) });

    const w = attributeOutcomes(WS, NOW);
    const winner = w.entries.find((e) => e.value === "winner")!;
    const loser = w.entries.find((e) => e.value === "loser")!;
    expect(winner.weight).toBeGreaterThan(loser.weight);
    expect(winner.confidence).toBeGreaterThan(0.9); // 6 recent samples → near full
    expect(winner.score).toBeGreaterThan(loser.score);
    // Entries are sorted by weight desc — winner comes first overall.
    expect(w.entries[0]!.value).toBe("winner");
  });

  test("platform + posting-window are attributed from the publish record", async () => {
    await seedUnit({
      provenance: {},
      publish: [{ target: "tiktok", postId: "p1", scheduleAt: iso(Date.parse("2026-07-01T09:30:00Z")), at: iso(NOW - DAY) }],
      snapshots: [snap({ target: "tiktok", postId: "p1", source: "postiz", at: iso(NOW - DAY), metrics: { views: 500 } })],
    });
    const w = attributeOutcomes(WS, NOW);
    expect(w.entries.some((e) => e.dimension === "platform" && e.value === "tiktok")).toBe(true);
    expect(w.entries.some((e) => e.dimension === "postingWindow" && e.value === "09")).toBe(true);
  });

  test("postingWindowBucket is the UTC hour, tolerant of junk", () => {
    expect(postingWindowBucket("2026-07-01T09:30:00Z")).toBe("09");
    expect(postingWindowBucket("2026-07-01T23:59:00Z")).toBe("23");
    expect(postingWindowBucket(null)).toBeNull();
    expect(postingWindowBucket("not-a-date")).toBeNull();
  });
});

// ─── decay ────────────────────────────────────────────────────────────────

describe("time decay", () => {
  test("an older snapshot contributes less than a recent one (same metrics)", async () => {
    // Same style, two units: one fresh, one exactly one half-life old, both with
    // the identical (max) metric. The fresh one should carry more decayed weight,
    // so identical scores but the recent one drives confidence up faster is the
    // wrong axis — assert on the decayed sample count via a second style that is
    // ONLY old, giving it lower confidence than an only-fresh style.
    await seedUnit({ provenance: { style: "fresh" }, snapshots: [snap({ at: iso(NOW - DAY), metrics: { views: 1000 } })] });
    await seedUnit({
      provenance: { style: "old" },
      snapshots: [snap({ at: iso(NOW - DECAY_HALFLIFE_DAYS * DAY), metrics: { views: 1000 } })],
    });
    const w = attributeOutcomes(WS, NOW);
    const fresh = w.entries.find((e) => e.value === "fresh")!;
    const old = w.entries.find((e) => e.value === "old")!;
    // Half-life old → ~half the decayed weight → strictly lower confidence.
    expect(old.confidence).toBeLessThan(fresh.confidence);
    expect(old.confidence).toBeGreaterThan(0); // faded, never zeroed
  });
});

// ─── history store ──────────────────────────────────────────────────────────

describe("selection-weights.jsonl append-only history", () => {
  test("recompute appends; readLatest returns the newest; prior lines survive", async () => {
    await seedUnit({ provenance: { style: "s" }, snapshots: [snap({ at: iso(NOW - DAY), metrics: { views: 100 } })] });
    const first = recomputeSelectionWeights(WS, NOW);
    const p = path.join(tmp.dir, ".ralphy", "workspaces", WS, "selection-weights.jsonl");
    const afterFirst = fs.readFileSync(p, "utf8");
    const second = recomputeSelectionWeights(WS, NOW + DAY);
    const afterSecond = fs.readFileSync(p, "utf8");
    expect(afterSecond.startsWith(afterFirst)).toBe(true); // never rewritten
    expect(afterSecond.trim().split("\n")).toHaveLength(2);
    const latest = readLatestWeights(WS)!;
    expect(latest.computedAt).toBe(second.computedAt);
    expect(latest.computedAt).not.toBe(first.computedAt);
  });

  test("readLatest on a fresh workspace is null", () => {
    expect(readLatestWeights(WS)).toBeNull();
  });
});

// ─── sampling bias + exploration floor ───────────────────────────────────────

function lookupFrom(weights: Record<string, number>, flags: { pinned?: string[]; retired?: string[] } = {}) {
  const snapshot: WeightsSnapshot = {
    workspace: WS,
    computedAt: iso(NOW),
    units: { scanned: 0, withAnalytics: 0 },
    halfLifeDays: DECAY_HALFLIFE_DAYS,
    coldStart: false,
    entries: Object.entries(weights).map(([value, weight]) => ({
      dimension: "template",
      value,
      score: weight,
      sampleSize: 5,
      confidence: 1,
      weight,
      lastUpdated: iso(NOW),
    })),
  };
  return buildLookup(snapshot, {
    pinned: new Set((flags.pinned ?? []).map((v) => `template|${v}`)),
    retired: new Set((flags.retired ?? []).map((v) => `template|${v}`)),
  });
}

describe("sampleWeighted", () => {
  const cands: Candidate[] = [
    { dimension: "template", value: "hi" },
    { dimension: "template", value: "mid" },
    { dimension: "template", value: "lo" },
  ];

  test("higher weight is sampled more often (seeded, deterministic)", () => {
    const lookup = lookupFrom({ hi: 0.9, mid: 0.5, lo: 0.1 });
    const prng = makePrng("bias");
    const counts: Record<string, number> = { hi: 0, mid: 0, lo: 0 };
    for (let i = 0; i < 5000; i++) counts[sampleWeighted(cands, lookup, { prng }).value]!++;
    expect(counts.hi).toBeGreaterThan(counts.mid!);
    expect(counts.mid).toBeGreaterThan(counts.lo!);
  });

  test("exploration floor: even a near-zero weight is never starved to 0", () => {
    const lookup = lookupFrom({ hi: 1, mid: 0, lo: 0 });
    const prng = makePrng("floor");
    const counts: Record<string, number> = { hi: 0, mid: 0, lo: 0 };
    for (let i = 0; i < 5000; i++) counts[sampleWeighted(cands, lookup, { prng, epsilon: 0.1 }).value]!++;
    // epsilon=0.1 over 3 candidates → each gets ≥ ~3.3% of draws regardless.
    for (const v of ["hi", "mid", "lo"]) expect(counts[v]!).toBeGreaterThan(80);
  });

  test("epsilon=0 still never divides by zero when all weights are 0 → uniform", () => {
    const lookup = lookupFrom({ hi: 0, mid: 0, lo: 0 });
    const prng = makePrng("zero");
    const counts: Record<string, number> = { hi: 0, mid: 0, lo: 0 };
    for (let i = 0; i < 3000; i++) counts[sampleWeighted(cands, lookup, { prng, epsilon: 0 }).value]!++;
    for (const v of ["hi", "mid", "lo"]) expect(counts[v]!).toBeGreaterThan(700);
  });

  test("single candidate returns it; empty throws", () => {
    expect(sampleWeighted([cands[0]!], lookupFrom({}), {}).value).toBe("hi");
    expect(() => sampleWeighted([], lookupFrom({}), {})).toThrow(/no candidates/);
  });
});

// ─── pin / retire round-trip ─────────────────────────────────────────────────

describe("pin / retire lifecycle", () => {
  const cands: Candidate[] = [
    { dimension: "template", value: "star" },
    { dimension: "template", value: "dud" },
  ];

  test("retire down-weights but never hard-excludes; reversible + logged", () => {
    appendSelectionFlag(WS, "retire", "template", "dud", "chronic loser");
    let flags = readSelectionFlags(WS);
    expect(flags.retired.has("template|dud")).toBe(true);
    expect(flags.pinned.size).toBe(0);

    // Retired still keeps a positive draw share (never fully starved).
    const lookup = buildLookup(null, flags); // no measured weights → all baseline
    const prng = makePrng("retire");
    const counts: Record<string, number> = { star: 0, dud: 0 };
    for (let i = 0; i < 5000; i++) counts[sampleWeighted(cands, lookup, { prng }).value]!++;
    expect(counts.dud).toBeGreaterThan(0); // NOT hard-excluded
    expect(counts.dud).toBeLessThan(counts.star!); // but down-weighted

    // Reverse it: unretire clears the flag (append-only, both preserved on disk).
    appendSelectionFlag(WS, "unretire", "template", "dud");
    flags = readSelectionFlags(WS);
    expect(flags.retired.has("template|dud")).toBe(false);
  });

  test("pin floors weight even with no data; reversible", () => {
    appendSelectionFlag(WS, "pin", "template", "star");
    let flags = readSelectionFlags(WS);
    expect(flags.pinned.has("template|star")).toBe(true);

    // Give the OTHER candidate a big measured weight; the pin still keeps star
    // competitive (floored at PIN_FLOOR × max), so it wins a meaningful share.
    const lookup = lookupFrom({ dud: 1.0 }, { pinned: ["star"] });
    const prng = makePrng("pin");
    const counts: Record<string, number> = { star: 0, dud: 0 };
    for (let i = 0; i < 5000; i++) counts[sampleWeighted(cands, lookup, { prng }).value]!++;
    expect(counts.star).toBeGreaterThan(1000);

    appendSelectionFlag(WS, "unpin", "template", "star");
    flags = readSelectionFlags(WS);
    expect(flags.pinned.has("template|star")).toBe(false);
  });

  test("last action per (dimension,value) wins; log is append-only", () => {
    appendSelectionFlag(WS, "pin", "template", "x");
    appendSelectionFlag(WS, "retire", "template", "x"); // supersedes the pin
    const flags = readSelectionFlags(WS);
    expect(flags.pinned.has("template|x")).toBe(false);
    expect(flags.retired.has("template|x")).toBe(true);
    const lifecycle = fs.readFileSync(path.join(tmp.dir, ".ralphy", "workspaces", WS, "lifecycle.jsonl"), "utf8");
    expect(lifecycle.trim().split("\n")).toHaveLength(2); // both events survive
  });
});
