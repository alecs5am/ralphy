// Outcome metrics + decision-vs-outcome table (#558) — pure math over
// synthetic store facts. Covers the rolling PRIOR-window baseline (hit rate is
// a trend, not ~50% by construction), absolute targets, per-platform
// baselines that are never pooled, the minimum-n rule ("insufficient data"
// with no median or lift), derived rates, the #556 cohort seam, the report
// assembly, and the production-plan citation.

import { describe, expect, test } from "bun:test";
import {
  buildObservations,
  currentBaselines,
  decisionPairs,
  decisionTable,
  evaluateHits,
  median,
  summarizeHits,
  type CohortBaselineProvider,
} from "../../cli/lib/analytics/outcomes";
import { buildOutcomeReport, DEFAULT_REPORT_OPTIONS, ledgerEvidenceIndex } from "../../cli/lib/analytics/report";
import { citeLedgerEvidence, planChoices } from "../../cli/lib/analytics/evidence";
import { buildProductionPlan, renderPlanMarkdown } from "../../cli/lib/plan/build";
import { ProductionPlanSchema } from "../../cli/lib/schemas/production-plan";
import type { LedgerValue } from "../../cli/lib/analytics/ledger";
import type { UnitOutcomeFactsDto } from "../../cli/lib/store/outcomes";

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1);

type Post = {
  slug: string;
  platform?: string;
  day: number;
  views: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number | null;
  avgWatchTimeSec?: number;
  completionPct?: number;
  decisions?: Record<string, LedgerValue>;
};

function facts(posts: Post[]): UnitOutcomeFactsDto[] {
  return posts.map((post, index) => ({
    unitId: `unit_${post.slug}`,
    slug: post.slug,
    format: "video",
    workspaceId: "ws_test",
    projectId: "prj_test",
    projectSlug: "test",
    createdAt: T0,
    ledger: post.decisions
      ? {
          documentId: `doc_${post.slug}`,
          currentRevisionId: `drev_${post.slug}`,
          body: {
            kind: "ralphy.decision-ledger",
            version: 1,
            unitId: `unit_${post.slug}`,
            unitSlug: post.slug,
            projectId: "prj_test",
            derived: Object.fromEntries(
              Object.entries(post.decisions).map(([key, value]) => [key, { value, source: "test" }]),
            ),
            manual: {},
            derivedFrom: ["test"],
            derivedAt: "2026-10-01T00:00:00.000Z",
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
        }
      : null,
    observations: [{
      publicationId: `pub_${post.slug}_${post.platform ?? "tiktok"}`,
      platform: post.platform ?? "tiktok",
      publicationState: "published",
      publishedAt: null,
      url: null,
      snapshotCount: 1,
      snapshot: {
        id: `metric_${index}`,
        source: "screenshot",
        asOf: T0 + (post.day + 7) * DAY,
        views: post.views,
        likes: post.likes ?? null,
        comments: post.comments ?? null,
        shares: post.shares ?? null,
        watchTimeMs: null,
        avgViewDurationSec: post.avgWatchTimeSec ?? null,
        retentionCurve: null,
        createdAt: T0,
      },
      importFacts: {
        platform: post.platform ?? "tiktok",
        capturedAt: T0 + (post.day + 7) * DAY,
        postedAt: T0 + post.day * DAY,
        reach: null,
        saves: post.saves === undefined ? 10 : post.saves,
        follows: null,
        avgWatchTimeSec: post.avgWatchTimeSec ?? null,
        totalWatchTimeSec: null,
        avgWatchPct: null,
        completionPct: post.completionPct ?? null,
        videoDurationSec: null,
        retention: null,
        approximateFields: [],
        extractedBy: "agent",
        screenshotCount: 0,
      },
    }],
  }));
}

const stored = (unit: UnitOutcomeFactsDto) => {
  const body = unit.ledger?.body as { derived?: Record<string, { value: LedgerValue }> } | undefined;
  return body?.derived
    ? { decisions: Object.fromEntries(Object.entries(body.derived).map(([key, entry]) => [key, entry.value])), ledger: "stored" as const }
    : { decisions: {}, ledger: "none" as const };
};

// Six TikTok posts: listicle hooks land, statements do not.
const SERIES: Post[] = [
  { slug: "a", day: 0, views: 1000, likes: 50, comments: 5, shares: 5, decisions: { hook_type: "statement", duration_sec: 15 } },
  { slug: "b", day: 1, views: 1200, likes: 60, comments: 6, shares: 6, decisions: { hook_type: "statement", duration_sec: 15 } },
  { slug: "c", day: 2, views: 800, likes: 40, comments: 4, shares: 4, decisions: { hook_type: "statement", duration_sec: 15 } },
  { slug: "d", day: 3, views: 5000, likes: 400, comments: 30, shares: 70, decisions: { hook_type: "listicle", duration_sec: 25 } },
  { slug: "e", day: 4, views: 4000, likes: 300, comments: 20, shares: 60, decisions: { hook_type: "listicle", duration_sec: 25 } },
  { slug: "f", day: 5, views: 6000, likes: 500, comments: 40, shares: 90, decisions: { hook_type: "listicle", duration_sec: 25, models: ["kwaivgi/kling-v3.0-pro"] } },
];

describe("observations and derived rates", () => {
  test("engagement, save, and share rates are percentages of views", () => {
    const [observation] = buildObservations(facts([SERIES[0]!]), stored);
    expect(observation!.metrics).toMatchObject({
      views: 1000,
      "engagement-rate": 7,
      "save-rate": 1,
      "share-rate": 0.5,
    });
    expect(observation!.at).toBe(T0);
    expect(observation!.atSource).toBe("postedAt");
  });

  test("missing engagement components are named, not counted as zero", () => {
    const [observation] = buildObservations(facts([{ slug: "yt", platform: "youtube", day: 0, views: 1000, likes: 40, comments: 10, saves: null }]), stored);
    expect(observation!.metrics["engagement-rate"]).toBe(5);
    expect(observation!.metrics["save-rate"]).toBeNull();
    expect(observation!.derivations.join(" ")).toContain("excludes unreported shares, saves");
  });

  test("avg watch % derives from the ledger duration when the screen shows seconds only", () => {
    const [observation] = buildObservations(
      facts([{ slug: "w", day: 0, views: 100, avgWatchTimeSec: 6, decisions: { duration_sec: 24 } }]),
      stored,
    );
    expect(observation!.metrics["avg-watch-pct"]).toBe(25);
    expect(observation!.derivations[0]).toContain("ledger duration_sec");
  });

  test("units without metrics are skipped, not zero", () => {
    const empty = facts([SERIES[0]!]);
    empty[0]!.observations = [];
    expect(buildObservations(empty, stored)).toEqual([]);
  });
});

describe("baselines and hit rate", () => {
  test("median handles odd, even, and empty inputs", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  test("hits are judged against the PRIOR window; early posts await a baseline", () => {
    const observations = buildObservations(facts(SERIES), stored);
    const evaluations = evaluateHits(observations, "views", { window: 20, minPrior: 3 });
    const bySlug = Object.fromEntries(observations.map((entry) => [entry.slug, evaluations.get(entry)]));
    expect(bySlug.a).toEqual({ baseline: null, hit: null });
    expect(bySlug.c).toEqual({ baseline: null, hit: null });
    expect(bySlug.d).toEqual({ baseline: 1000, hit: true });
    expect(bySlug.e).toEqual({ baseline: 1100, hit: true });
    expect(bySlug.f).toEqual({ baseline: 1200, hit: true });
    const summary = summarizeHits(observations, evaluations, "views", "rolling");
    expect(summary).toMatchObject({ evaluated: 3, hits: 3, rate: 1, awaitingBaseline: 3 });
  });

  test("the window caps how far back the baseline looks", () => {
    const observations = buildObservations(facts(SERIES), stored);
    const evaluations = evaluateHits(observations, "views", { window: 2, minPrior: 2 });
    const f = observations.find((entry) => entry.slug === "f")!;
    expect(evaluations.get(f)).toEqual({ baseline: 4500, hit: true });
  });

  test("an absolute target replaces the rolling rule", () => {
    const observations = buildObservations(facts(SERIES), stored);
    const evaluations = evaluateHits(observations, "views", { window: 20, minPrior: 3, hitThreshold: 4500 });
    expect(summarizeHits(observations, evaluations, "views", "target")).toMatchObject({ evaluated: 6, hits: 2, rate: 0.3333 });
  });

  test("platforms are never pooled into one baseline", () => {
    const observations = buildObservations(
      facts([...SERIES, { slug: "y1", platform: "youtube", day: 6, views: 90_000 }]),
      stored,
    );
    const baselines = currentBaselines(observations, 20);
    expect(baselines.map((entry) => entry.platform)).toEqual(["tiktok", "youtube"]);
    expect(baselines[0]!.current.views).toEqual({ median: 2600, n: 6 });
    expect(baselines[1]!.current.views).toEqual({ median: 90_000, n: 1 });
    const youtube = observations.find((entry) => entry.platform === "youtube")!;
    expect(evaluateHits(observations, "views", { window: 20, minPrior: 3 }).get(youtube)).toEqual({ baseline: null, hit: null });
  });
});

describe("decision-vs-outcome table", () => {
  const options = { metric: "views" as const, minN: 3, liftThreshold: 0.15 };

  test("lift is measured against the platform baseline; sets and durations expand", () => {
    const observations = buildObservations(facts(SERIES), stored);
    const baselines = currentBaselines(observations, 20);
    const rows = decisionTable(observations, baselines, evaluateHits(observations, "views", { window: 20, minPrior: 3 }), options);
    const row = (dimension: string, value: string) => rows.find((entry) => entry.dimension === dimension && entry.value === value);
    expect(row("hook_type", "listicle")).toMatchObject({ n: 3, units: 3, medianOutcome: 5000, verdict: "over", hitRate: 1 });
    expect(row("hook_type", "listicle")!.lift).toBeCloseTo(5000 / 2600 - 1, 3);
    expect(row("hook_type", "statement")).toMatchObject({ n: 3, medianOutcome: 1000, verdict: "under" });
    expect(row("length_band", "medium")).toMatchObject({ n: 3, verdict: "over" });
    expect(row("length_band", "short")).toMatchObject({ n: 3, verdict: "under" });
    expect(rows.some((entry) => entry.dimension === "platform")).toBe(false);
  });

  test("below the minimum n there is no claim, only a sample size", () => {
    const observations = buildObservations(facts(SERIES), stored);
    const baselines = currentBaselines(observations, 20);
    const rows = decisionTable(observations, baselines, evaluateHits(observations, "views", { window: 20, minPrior: 3 }), options);
    expect(rows.find((entry) => entry.dimension === "models")).toEqual({
      dimension: "models",
      value: "kwaivgi/kling-v3.0-pro",
      n: 1,
      units: 1,
      medianOutcome: null,
      lift: null,
      hitRate: null,
      verdict: "insufficient data",
    });
    const strict = decisionTable(observations, baselines, new Map(), { ...options, minN: 4 });
    expect(strict.find((entry) => entry.value === "listicle")!.verdict).toBe("insufficient data");
  });

  test("decision pairs bucket duration only when no length band is recorded", () => {
    expect(decisionPairs({ duration_sec: 50, transitions: ["glitch", "whip-pan"] })).toEqual([
      ["length_band", "long"],
      ["transitions", "glitch"],
      ["transitions", "whip-pan"],
    ]);
    expect(decisionPairs({ duration_sec: 50, length_band: "short" })).toEqual([
      ["length_band", "short"],
    ]);
  });
});

describe("outcome report", () => {
  test("assembles coverage, hit rate, baselines, decisions, and honest notes", () => {
    const units = facts(SERIES);
    const pending = facts([{ slug: "pending", day: 9, views: 0 }])[0]!;
    pending.observations = [];
    const report = buildOutcomeReport({
      workspaceId: "ws_test",
      projectId: null,
      units: [...units, pending],
      decisionsFor: stored,
      options: DEFAULT_REPORT_OPTIONS,
      generatedAt: "2026-10-28T00:00:00.000Z",
    });
    expect(report.coverage).toEqual({
      units: 7,
      unitsWithOutcomes: 6,
      pendingPerformance: 1,
      observations: 6,
      ledgers: { stored: 6, derived: 0, none: 0 },
    });
    expect(report.hitRate).toMatchObject({ metric: "views", evaluated: 3, hits: 3, rate: 1, awaitingBaseline: 3 });
    expect(report.hitRate.byPlatform).toEqual([{ platform: "tiktok", evaluated: 3, hits: 3, rate: 1, awaitingBaseline: 3 }]);
    expect(report.baselines.find((row) => row.metric === "views")).toEqual({ platform: "tiktok", metric: "views", median: 2600, n: 6 });
    expect(report.cohort.status).toBe("not configured");
    expect(report.observations[0]!.unit).toBe("f");
    expect(report.notes.join("\n")).toContain("await a baseline");
    expect(report.notes.join("\n")).toContain("insufficient data");
  });

  test("an empty workspace says how to start instead of reporting zeros", () => {
    const report = buildOutcomeReport({
      workspaceId: "ws_test",
      projectId: null,
      units: [],
      decisionsFor: stored,
      options: DEFAULT_REPORT_OPTIONS,
    });
    expect(report.hitRate.rate).toBeNull();
    expect(report.decisions).toEqual([]);
    expect(report.notes[0]).toContain("ralphy analytics import");
  });

  test("a cohort provider (#556 seam) is reported against the workspace median", () => {
    const cohort: CohortBaselineProvider = {
      id: "fixture-cohort",
      baseline: ({ platform, metric }) => (platform === "tiktok" && metric === "views" ? { median: 5200, n: 140, label: "kitchen gear" } : null),
    };
    const report = buildOutcomeReport({
      workspaceId: "ws_test",
      projectId: null,
      units: facts(SERIES),
      decisionsFor: stored,
      options: { ...DEFAULT_REPORT_OPTIONS, cohort },
    });
    expect(report.cohort).toMatchObject({
      provider: "fixture-cohort",
      status: "ok",
      rows: [{ platform: "tiktok", metric: "views", workspaceMedian: 2600, cohortMedian: 5200, cohortN: 140, ratio: 0.5 }],
    });
  });
});

describe("production plan cites the ledger", () => {
  const report = buildOutcomeReport({
    workspaceId: "ws_test",
    projectId: null,
    units: facts(SERIES.map((post) => ({ ...post, decisions: { ...post.decisions, format: "video" } }))),
    decisionsFor: stored,
    options: DEFAULT_REPORT_OPTIONS,
    generatedAt: "2026-10-28T00:00:00.000Z",
  });
  const index = ledgerEvidenceIndex(report);

  test("cites chosen options with n >= minN and lists the rest as insufficient", () => {
    const evidence = citeLedgerEvidence(index, [
      { dimension: "format", value: "video" },
      { dimension: "length_band", value: "medium" },
      { dimension: "models", value: "kwaivgi/kling-v3.0-pro" },
      { dimension: "template", value: "never-used" },
    ]);
    expect(evidence.cited.map((entry) => `${entry.dimension}=${entry.value}:${entry.verdict}`)).toEqual([
      "format=video:in line",
      "length_band=medium:over",
    ]);
    expect(evidence.cited[1]!.note).toContain("length_band=medium: views +92% vs the workspace baseline across 3 post(s) (over)");
    expect(evidence.insufficient).toEqual([
      { dimension: "models", value: "kwaivgi/kling-v3.0-pro", n: 1 },
      { dimension: "template", value: "never-used", n: 0 },
    ]);
    expect(evidence.source).toBe("ralphy analytics report --workspace ws_test");
  });

  test("buildProductionPlan attaches ledgerEvidence and renders it; absent without an index", async () => {
    const { plan } = await buildProductionPlan({ projectId: "kettle-002", brief: "a 25 second tiktok video review of a kettle" }, { ledgerEvidence: index });
    expect(() => ProductionPlanSchema.parse(plan)).not.toThrow();
    expect(plan.ledgerEvidence?.workspaceId).toBe("ws_test");
    const choices = planChoices(plan);
    expect(choices[0]).toEqual({ dimension: "format", value: plan.formatTemplate.format });
    expect(plan.ledgerEvidence?.cited.some((entry) => entry.dimension === "format" && entry.value === "video")).toBe(true);
    expect(renderPlanMarkdown(plan)).toContain("## Ledger evidence (#558)");

    const { plan: bare } = await buildProductionPlan({ projectId: "kettle-003", brief: "a kettle review video" });
    expect(bare.ledgerEvidence).toBeUndefined();
    expect(renderPlanMarkdown(bare)).not.toContain("Ledger evidence");
  });
});
