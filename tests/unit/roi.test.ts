// Cost/ROI join layer (#544) — zero-network, zero-model unit tests. Covers the
// join math on fixtures WITH and WITHOUT analytics (pending-performance),
// per-format aggregation, cost-per-1k-views computation, ROI ranking
// (best/worst cells), and the #532 cost-adjusted score. Fixture setup mirrors
// tests/unit/selection.test.ts (tmp-root + registry + seeded units + gen-log).
// No process.env / chdir mutation (#545): setRoot via makeTmpRoot only.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir, workspaceDir } from "../../cli/lib/paths";
import { appendSnapshots } from "../../cli/lib/analytics/pull";
import { logGeneration } from "../../cli/lib/gen-log";
import type { AnalyticsSnapshot } from "../../cli/lib/schemas/analytics";
import { parseCampaign, type Campaign } from "../../cli/lib/schemas/campaign";
import {
  buildCampaignRoi,
  buildWorkspaceRoi,
  costAdjustedScores,
} from "../../cli/lib/analytics/roi";

const WS = "default";
const NOW = Date.parse("2026-07-06T12:00:00.000Z");

let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-roi-544");
  fs.writeFileSync(path.join(tmp.dir, ".ralphy", "registry.json"), JSON.stringify({ projects: {} }));
});
afterEach(() => tmp.cleanup());

function register(projectId: string): void {
  const regPath = path.join(tmp.dir, ".ralphy", "registry.json");
  const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
  reg.projects[projectId] = { id: projectId, name: projectId, workspace: WS };
  fs.writeFileSync(regPath, JSON.stringify(reg));
}

/** Seed a project + one unit + optional gen-log spend + optional snapshots. */
async function seedUnit(opts: {
  projectId: string;
  slug?: string;
  format?: string;
  spendRows?: number[];
  views?: number;
  likes?: number;
  target?: string;
}): Promise<string> {
  const slug = opts.slug ?? "u";
  register(opts.projectId);

  const unitDir = path.join(projectDir(opts.projectId), "units", slug);
  fs.mkdirSync(unitDir, { recursive: true });
  fs.writeFileSync(
    path.join(unitDir, "unit.json"),
    JSON.stringify({ slug, format: opts.format ?? "video", media: ["final.mp4"], created: new Date(NOW).toISOString() }),
  );

  for (const cost of opts.spendRows ?? []) {
    await logGeneration(opts.projectId, {
      provider: "openrouter",
      endpoint: "test/model",
      kind: "image",
      input: { slot: "scene-01" },
      status: "ok",
      cost_usd: cost,
    });
  }

  if (typeof opts.views === "number") {
    const snap: AnalyticsSnapshot = {
      at: new Date(NOW).toISOString(),
      target: opts.target ?? "youtube",
      postId: "p1",
      source: "youtube-analytics",
      metrics: { views: opts.views, ...(opts.likes != null && { likes: opts.likes }) },
    };
    await appendSnapshots(unitDir, [snap]);
  }
  return `${opts.projectId}/${slug}`;
}

/** A campaign linking cells to seeded units. */
function campaign(cells: Array<{ id: string; format: string; angle: string; channel: string; thesisId: string; linkedUnitId?: string }>): Campaign {
  return parseCampaign({
    id: "c1",
    title: "c1",
    theses: [{ id: "t-a", statement: "thesis a" }, { id: "t-b", statement: "thesis b" }],
    keywords: {},
    inventory: cells.map((c) => ({
      ...c,
      keyword: "kw",
      priority: 0,
      status: c.linkedUnitId ? "produced" : "planned",
    })),
    planned: true,
  });
}

// ─── join math: WITH analytics ─────────────────────────────────────────────

describe("join math", () => {
  test("unit with spend + analytics computes cost-per-1k-views", async () => {
    const linked = await seedUnit({ projectId: "p-001", format: "video", spendRows: [0.5, 0.5], views: 2000, likes: 40 });
    const c = campaign([{ id: "cell-1", format: "video", angle: "pov", channel: "youtube", thesisId: "t-a", linkedUnitId: linked }]);
    const report = await buildCampaignRoi(WS, c);

    expect(report.totals.units).toBe(1);
    expect(report.totals.spendUsd).toBeCloseTo(1.0, 5);
    expect(report.totals.views).toBe(2000);
    expect(report.totals.engagements).toBe(40);
    // 1.0 spend / 2000 views * 1000 = 0.5
    expect(report.totals.costPer1kViews).toBeCloseTo(0.5, 5);
    expect(report.totals.pendingPerformance).toBe(0);
    expect(report.rows[0]!.pendingPerformance).toBe(false);
  });

  test("PENDING-PERFORMANCE: spend but no analytics → counted in spend, excluded from ratio, flagged", async () => {
    const linked = await seedUnit({ projectId: "p-002", format: "video", spendRows: [2.0] }); // no views
    const c = campaign([{ id: "cell-1", format: "video", angle: "pov", channel: "youtube", thesisId: "t-a", linkedUnitId: linked }]);
    const report = await buildCampaignRoi(WS, c);

    expect(report.totals.spendUsd).toBeCloseTo(2.0, 5); // counted in spend
    expect(report.totals.views).toBe(0);
    expect(report.totals.costPer1kViews).toBeNull(); // excluded from ratio
    expect(report.totals.pendingPerformance).toBe(1); // flagged
    expect(report.totals.unitsWithPerformance).toBe(0);
    expect(report.rows[0]!.pendingPerformance).toBe(true);
    expect(report.rows[0]!.costPer1kViews).toBeNull();
  });

  test("cell with no linked unit is skipped (nothing produced)", async () => {
    const c = campaign([{ id: "cell-1", format: "video", angle: "pov", channel: "youtube", thesisId: "t-a" }]);
    const report = await buildCampaignRoi(WS, c);
    expect(report.totals.units).toBe(0);
  });
});

// ─── per-format aggregation + shared-project spend ───────────────────────────

describe("aggregation", () => {
  test("per-format aggregation sums spend + views across units", async () => {
    const v1 = await seedUnit({ projectId: "p-101", format: "video", spendRows: [1.0], views: 1000 });
    const v2 = await seedUnit({ projectId: "p-102", format: "video", spendRows: [1.0], views: 3000 });
    const art = await seedUnit({ projectId: "p-103", format: "article", spendRows: [0.1], views: 500 });
    const c = campaign([
      { id: "c1", format: "video", angle: "a", channel: "youtube", thesisId: "t-a", linkedUnitId: v1 },
      { id: "c2", format: "video", angle: "b", channel: "youtube", thesisId: "t-a", linkedUnitId: v2 },
      { id: "c3", format: "article", angle: "c", channel: "devto", thesisId: "t-b", linkedUnitId: art },
    ]);
    const report = await buildCampaignRoi(WS, c);

    const videoAgg = report.byFormat.find((a) => a.key === "video")!;
    expect(videoAgg.units).toBe(2);
    expect(videoAgg.spendUsd).toBeCloseTo(2.0, 5);
    expect(videoAgg.views).toBe(4000);
    // 2.0 / 4000 * 1000 = 0.5
    expect(videoAgg.costPer1kViews).toBeCloseTo(0.5, 5);

    const articleAgg = report.byFormat.find((a) => a.key === "article")!;
    expect(articleAgg.units).toBe(1);
    // 0.1 / 500 * 1000 = 0.2
    expect(articleAgg.costPer1kViews).toBeCloseTo(0.2, 5);
  });

  test("shared-project spend: >1 unit in a project splits spend evenly + flags it", async () => {
    register("p-201");
    // two units in ONE project, project spend = 2.0 total → 1.0 each.
    for (const slug of ["a", "b"]) {
      const unitDir = path.join(projectDir("p-201"), "units", slug);
      fs.mkdirSync(unitDir, { recursive: true });
      fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify({ slug, format: "video", media: ["f.mp4"], created: new Date(NOW).toISOString() }));
      await appendSnapshots(unitDir, [{ at: new Date(NOW).toISOString(), target: "youtube", postId: `p-${slug}`, source: "youtube-analytics", metrics: { views: 1000 } }]);
    }
    await logGeneration("p-201", { provider: "openrouter", endpoint: "m", kind: "image", input: { slot: "s" }, status: "ok", cost_usd: 2.0 });

    const report = await buildWorkspaceRoi(WS);
    expect(report.totals.units).toBe(2);
    expect(report.totals.spendUsd).toBeCloseTo(2.0, 5); // total preserved
    for (const row of report.rows) {
      expect(row.spendUsd).toBeCloseTo(1.0, 5); // split evenly
      expect(row.sharedProjectSpend).toBe(true);
    }
  });
});

// ─── ROI ranking (best/worst cells) ──────────────────────────────────────────

describe("ROI ranking", () => {
  test("best cell = cheapest cost-per-1k-views, worst = priciest; pending sinks last", async () => {
    // video: cheap ROI (1.0 / 10000 * 1000 = 0.1). article: pricey (1.0 / 100 * 1000 = 10).
    const cheap = await seedUnit({ projectId: "p-301", format: "video", spendRows: [1.0], views: 10000 });
    const pricey = await seedUnit({ projectId: "p-302", format: "article", spendRows: [1.0], views: 100 });
    const pending = await seedUnit({ projectId: "p-303", format: "carousel", spendRows: [5.0] }); // no analytics
    const c = campaign([
      { id: "c1", format: "video", angle: "a", channel: "youtube", thesisId: "t-a", linkedUnitId: cheap },
      { id: "c2", format: "article", angle: "b", channel: "devto", thesisId: "t-b", linkedUnitId: pricey },
      { id: "c3", format: "carousel", angle: "c", channel: "instagram", thesisId: "t-a", linkedUnitId: pending },
    ]);
    const report = await buildCampaignRoi(WS, c);

    expect(report.bestCell!.key).toBe("video");
    expect(report.bestCell!.costPer1kViews).toBeCloseTo(0.1, 5);
    // worst measured cell is the pricey article, NOT the pending carousel (unmeasured excluded).
    expect(report.worstCell!.key).toBe("article");
    expect(report.worstCell!.costPer1kViews).toBeCloseTo(10, 5);

    // Rows sorted best-ROI first; the pending row sinks to the bottom.
    expect(report.rows[0]!.slug).toBe("u");
    expect(report.rows.at(-1)!.pendingPerformance).toBe(true);
  });
});

// ─── #532 cost-adjusted score ────────────────────────────────────────────────

describe("cost-adjusted score (#532 seam)", () => {
  test("cheaper-per-view format scores higher; unmeasured scores 0", async () => {
    const cheap = await seedUnit({ projectId: "p-401", format: "video", spendRows: [1.0], views: 10000 });
    const pricey = await seedUnit({ projectId: "p-402", format: "article", spendRows: [1.0], views: 1000 });
    const pending = await seedUnit({ projectId: "p-403", format: "carousel", spendRows: [1.0] });
    const c = campaign([
      { id: "c1", format: "video", angle: "a", channel: "youtube", thesisId: "t-a", linkedUnitId: cheap },
      { id: "c2", format: "article", angle: "b", channel: "devto", thesisId: "t-b", linkedUnitId: pricey },
      { id: "c3", format: "carousel", angle: "c", channel: "instagram", thesisId: "t-a", linkedUnitId: pending },
    ]);
    const scores = costAdjustedScores(await buildCampaignRoi(WS, c));

    const videoScore = scores.find((s) => s.dimension === "format" && s.value === "video")!;
    const articleScore = scores.find((s) => s.dimension === "format" && s.value === "article")!;
    const carouselScore = scores.find((s) => s.dimension === "format" && s.value === "carousel")!;
    expect(videoScore.score).toBeGreaterThan(articleScore.score);
    expect(carouselScore.score).toBe(0); // unmeasured → neutral 0
    expect(videoScore.viewsPerUsd).toBeCloseTo(10000, 0); // 10000 views / 1.0 usd
  });
});

// ─── workspace scope ─────────────────────────────────────────────────────────

describe("workspace scope", () => {
  test("aggregates every unit across the workspace's projects", async () => {
    await seedUnit({ projectId: "p-501", format: "video", spendRows: [1.0], views: 2000 });
    await seedUnit({ projectId: "p-502", format: "article", spendRows: [0.2], views: 400 });
    const report = await buildWorkspaceRoi(WS);
    expect(report.scope).toBe("workspace");
    expect(report.totals.units).toBe(2);
    expect(report.byFormat.map((a) => a.key).sort()).toEqual(["article", "video"]);
    // No campaign cell at workspace scope → angle/channel/thesis dims empty.
    expect(report.byAngle).toEqual([]);
    expect(report.byThesis).toEqual([]);
  });

  test("empty workspace → zeroed report, no NaN", async () => {
    fs.mkdirSync(path.join(workspaceDir(WS), "projects"), { recursive: true });
    const report = await buildWorkspaceRoi(WS);
    expect(report.totals.units).toBe(0);
    expect(report.totals.costPer1kViews).toBeNull();
    expect(report.bestCell).toBeNull();
  });
});
