// Cost/ROI join layer (#544) — a read-only REPORTING VIEW that joins spend to
// outcomes at unit granularity, then aggregates by the campaign cell's
// dimensions (format / angle / channel / thesis / platform). No new pipeline,
// no writes, no model calls: it folds three existing ledgers and stops.
//
// THE THREE INPUTS (all real, none synthetic):
//   • SPEND    — the project's gen-log `cost_usd` fold (reuse `actualSpendUsd`,
//                #444/#032; NEVER re-parse the log) + the workspace publish-quota
//                ledger's per-platform API-unit usage. A unit is `project/slug`;
//                a unit inherits its OWNING PROJECT's realized model spend. When
//                a project holds >1 unit the spend is split evenly across them,
//                flagged `sharedProjectSpend` so the split is never mistaken for
//                a measured per-unit figure.
//   • PERFORMANCE — the newest #507 analytics snapshot per unit
//                (`readSnapshots`), keyed by the unit dir. Views/likes/comments/
//                ctr/retention as the platform actually reported them.
//   • THE JOIN KEY — the #528 campaign cell's `linkedUnitId` ("project/slug")
//                ties a produced unit to its format/angle/channel/thesis, which
//                are the ROI aggregation dimensions.
//
// HONEST PENDING-PERFORMANCE RULE (the issue's hard clause): a unit WITH spend
// but NO analytics snapshot (views) is COUNTED in spend, EXCLUDED from every
// ROI ratio (cost-per-1k-views etc.), and FLAGGED `pending-performance`. No
// assumed views, no synthetic zero — unknown stays explicitly unknown.

import { readSnapshots, listUnitSlugs } from "./pull.js";
import { unitDirFor } from "../publish/publish.js";
import { actualSpendUsd } from "../spend.js";
import { readQuotaUsage } from "../publish/quota.js";
import { splitUnitId } from "../campaign/crosslink.js";
import { workspaceDir, projectWorkspace } from "../paths.js";
import type { Campaign } from "../schemas/campaign.js";
import type { AnalyticsSnapshot } from "../schemas/analytics.js";
import fs from "node:fs";
import path from "node:path";

// ─── per-unit join row ────────────────────────────────────────────────────────

export interface UnitRoiRow {
  /** "project/slug". */
  unitId: string;
  project: string;
  slug: string;
  /** Realized model spend attributed to this unit (project spend, possibly split). */
  spendUsd: number;
  /** True when the owning project holds >1 unit and spend was split evenly. */
  sharedProjectSpend: boolean;
  /** Newest measured views across the unit's snapshots (null = none yet). */
  views: number | null;
  /** Sum of likes + shares from the newest snapshot per (target,postId). */
  engagements: number | null;
  /** Cost per 1k views — null when views unknown or zero (never fabricated). */
  costPer1kViews: number | null;
  /** Spend counted but no analytics yet — excluded from every ratio. */
  pendingPerformance: boolean;
  // Campaign-cell join facts (present only when a cell links this unit).
  format?: string;
  angle?: string;
  channel?: string;
  thesisId?: string;
}

// ─── aggregated cell ──────────────────────────────────────────────────────────

export interface RoiAggregate {
  /** The dimension value being aggregated (a format id, an angle string, …). */
  key: string;
  units: number;
  /** Units with measured views (the denominator for the ratios). */
  unitsWithPerformance: number;
  /** Units with spend but no analytics (excluded from ratios, counted here). */
  pendingPerformance: number;
  spendUsd: number;
  views: number;
  engagements: number;
  /** spend / units. */
  spendPerUnit: number | null;
  /** spend across performing units / (views/1000). null when no measured views. */
  costPer1kViews: number | null;
}

export interface RoiReport {
  scope: "campaign" | "workspace";
  workspace: string;
  /** Campaign id when scope === "campaign". */
  campaign?: string;
  totals: {
    units: number;
    unitsWithPerformance: number;
    pendingPerformance: number;
    spendUsd: number;
    /** Publish-quota API-unit spend charged to the workspace (informational). */
    publishApiUnits: number;
    views: number;
    engagements: number;
    spendPerUnit: number | null;
    costPer1kViews: number | null;
  };
  byFormat: RoiAggregate[];
  byAngle: RoiAggregate[];
  byChannel: RoiAggregate[];
  byThesis: RoiAggregate[];
  byPlatform: RoiAggregate[];
  /** Per-unit join rows sorted best ROI (lowest cost/1k views) first. */
  rows: UnitRoiRow[];
  /** Best / worst cell by cost-per-1k-views across ALL dimensions (null when none measured). */
  bestCell: { dimension: string; key: string; costPer1kViews: number } | null;
  worstCell: { dimension: string; key: string; costPer1kViews: number } | null;
}

// ─── measurement helpers (pure) ─────────────────────────────────────────────────

/** Newest snapshot per (target, postId), so one post's history collapses to its latest reading. */
function newestPerPost(snapshots: AnalyticsSnapshot[]): AnalyticsSnapshot[] {
  const byKey = new Map<string, AnalyticsSnapshot>();
  for (const s of snapshots) {
    const key = `${s.target} ${s.postId}`;
    const prev = byKey.get(key);
    if (!prev || Date.parse(s.at) > Date.parse(prev.at)) byKey.set(key, s);
  }
  return [...byKey.values()];
}

/** Measured views + engagements for a unit (null views = pending-performance). */
function measurePerformance(unitDir: string): { views: number | null; engagements: number | null; platforms: string[] } {
  const latest = newestPerPost(readSnapshots(unitDir));
  if (latest.length === 0) return { views: null, engagements: null, platforms: [] };
  let views = 0;
  let engagements = 0;
  let hasViews = false;
  const platforms = new Set<string>();
  for (const s of latest) {
    platforms.add(s.target);
    if (typeof s.metrics.views === "number") {
      views += s.metrics.views;
      hasViews = true;
    }
    const likes = typeof s.metrics.likes === "number" ? s.metrics.likes : 0;
    const shares = typeof s.metrics.shares === "number" ? s.metrics.shares : 0;
    engagements += likes + shares;
  }
  // No snapshot reported views → performance is unknown (pending), not zero.
  return { views: hasViews ? views : null, engagements: hasViews ? engagements : null, platforms: [...platforms] };
}

/** cost per 1k views — null when views unknown or zero (never divide-by-zero fabrication). */
function costPer1k(spendUsd: number, views: number | null): number | null {
  if (views === null || views <= 0) return null;
  return Number(((spendUsd / views) * 1000).toFixed(4));
}

function round(n: number): number {
  return Number(n.toFixed(6));
}

// ─── project → unit spend attribution ────────────────────────────────────────

/**
 * A unit inherits its owning project's realized model spend. When a project
 * holds N>1 units, the spend is split evenly and each row is flagged
 * `sharedProjectSpend`. Cached per project so a workspace scan reads each
 * gen-log once. Pure over the on-disk ledgers (no writes).
 */
async function projectSpendCache(): Promise<(projectId: string) => Promise<number>> {
  const cache = new Map<string, number>();
  return async (projectId: string) => {
    if (!cache.has(projectId)) cache.set(projectId, await actualSpendUsd(projectId));
    return cache.get(projectId)!;
  };
}

/** Build one join row for a `project/slug` unit. `cell` supplies the aggregation dims. */
async function buildUnitRow(
  projectId: string,
  slug: string,
  spendOf: (p: string) => Promise<number>,
  cell?: { format?: string; angle?: string; channel?: string; thesisId?: string },
): Promise<UnitRoiRow> {
  const unitDir = unitDirFor(projectId, slug);
  const unitCount = Math.max(1, listUnitSlugs(projectId).length);
  const projectSpend = await spendOf(projectId);
  const spendUsd = round(projectSpend / unitCount);
  const { views, engagements } = measurePerformance(unitDir);
  return {
    unitId: `${projectId}/${slug}`,
    project: projectId,
    slug,
    spendUsd,
    sharedProjectSpend: unitCount > 1,
    views,
    engagements,
    costPer1kViews: costPer1k(spendUsd, views),
    pendingPerformance: views === null,
    ...(cell?.format && { format: cell.format }),
    ...(cell?.angle && { angle: cell.angle }),
    ...(cell?.channel && { channel: cell.channel }),
    ...(cell?.thesisId && { thesisId: cell.thesisId }),
  };
}

// ─── aggregation ─────────────────────────────────────────────────────────────

/** Group rows by a dimension accessor, folding spend + measured performance. */
function aggregate(rows: UnitRoiRow[], keyOf: (r: UnitRoiRow) => string | undefined): RoiAggregate[] {
  const groups = new Map<string, UnitRoiRow[]>();
  for (const r of rows) {
    const key = keyOf(r);
    if (key === undefined) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    g.push(r);
  }
  const out: RoiAggregate[] = [];
  for (const [key, group] of groups) {
    const spendUsd = round(group.reduce((a, r) => a + r.spendUsd, 0));
    const performing = group.filter((r) => !r.pendingPerformance);
    const views = performing.reduce((a, r) => a + (r.views ?? 0), 0);
    const engagements = performing.reduce((a, r) => a + (r.engagements ?? 0), 0);
    // Ratio spend basis = ONLY the performing units' spend (pending units are
    // excluded from ratios but still counted in the group's total spend).
    const performingSpend = round(performing.reduce((a, r) => a + r.spendUsd, 0));
    out.push({
      key,
      units: group.length,
      unitsWithPerformance: performing.length,
      pendingPerformance: group.length - performing.length,
      spendUsd,
      views,
      engagements,
      spendPerUnit: group.length > 0 ? round(spendUsd / group.length) : null,
      costPer1kViews: costPer1k(performingSpend, views > 0 ? views : null),
    });
  }
  // Best ROI (lowest cost/1k views) first; unmeasured cells sink to the bottom.
  out.sort((a, b) => rankRoi(a.costPer1kViews) - rankRoi(b.costPer1kViews) || b.spendUsd - a.spendUsd);
  return out;
}

/** Sort key: a measured cost/1k views ranks by value; null (unmeasured) sinks last. */
function rankRoi(c: number | null): number {
  return c === null ? Number.POSITIVE_INFINITY : c;
}

/** Best (lowest) + worst (highest) measured cell across every dimension. */
function bestWorst(dims: Array<{ dimension: string; aggs: RoiAggregate[] }>): {
  best: RoiReport["bestCell"];
  worst: RoiReport["worstCell"];
} {
  let best: RoiReport["bestCell"] = null;
  let worst: RoiReport["worstCell"] = null;
  for (const { dimension, aggs } of dims) {
    for (const a of aggs) {
      if (a.costPer1kViews === null) continue;
      if (!best || a.costPer1kViews < best.costPer1kViews) best = { dimension, key: a.key, costPer1kViews: a.costPer1kViews };
      if (!worst || a.costPer1kViews > worst.costPer1kViews) worst = { dimension, key: a.key, costPer1kViews: a.costPer1kViews };
    }
  }
  return { best, worst };
}

// ─── public API ────────────────────────────────────────────────────────────────

/**
 * Assemble a ROI report from a set of per-unit join rows + a workspace's
 * publish-quota usage. `platformRows` explodes each unit across the platforms
 * its snapshots reported, so the by-platform view is per-post, not per-unit.
 * Pure — no reads beyond what the callers already gathered.
 */
function assembleReport(
  scope: "campaign" | "workspace",
  workspace: string,
  rows: UnitRoiRow[],
  platformRows: UnitRoiRow[],
  publishApiUnits: number,
  campaign?: string,
): RoiReport {
  const totalSpend = round(rows.reduce((a, r) => a + r.spendUsd, 0));
  const performing = rows.filter((r) => !r.pendingPerformance);
  const totalViews = performing.reduce((a, r) => a + (r.views ?? 0), 0);
  const totalEng = performing.reduce((a, r) => a + (r.engagements ?? 0), 0);
  const performingSpend = round(performing.reduce((a, r) => a + r.spendUsd, 0));

  const byFormat = aggregate(rows, (r) => r.format);
  const byAngle = aggregate(rows, (r) => r.angle);
  const byChannel = aggregate(rows, (r) => r.channel);
  const byThesis = aggregate(rows, (r) => r.thesisId);
  const byPlatform = aggregate(platformRows, (r) => r.channel);

  const { best, worst } = bestWorst([
    { dimension: "format", aggs: byFormat },
    { dimension: "angle", aggs: byAngle },
    { dimension: "channel", aggs: byChannel },
    { dimension: "thesis", aggs: byThesis },
    { dimension: "platform", aggs: byPlatform },
  ]);

  return {
    scope,
    workspace,
    ...(campaign && { campaign }),
    totals: {
      units: rows.length,
      unitsWithPerformance: performing.length,
      pendingPerformance: rows.length - performing.length,
      spendUsd: totalSpend,
      publishApiUnits,
      views: totalViews,
      engagements: totalEng,
      spendPerUnit: rows.length > 0 ? round(totalSpend / rows.length) : null,
      costPer1kViews: costPer1k(performingSpend, totalViews > 0 ? totalViews : null),
    },
    byFormat,
    byAngle,
    byChannel,
    byThesis,
    byPlatform,
    rows: [...rows].sort((a, b) => rankRoi(a.costPer1kViews) - rankRoi(b.costPer1kViews)),
    bestCell: best,
    worstCell: worst,
  };
}

/** Total publish-quota API-units charged to a workspace (informational spend axis). */
function publishApiUnitsFor(ws: string): number {
  return readQuotaUsage(ws).reduce((a, u) => a + (typeof u.apiUnits === "number" ? u.apiUnits : 0), 0);
}

/**
 * ROI report for ONE campaign: join every cell's linked unit to its spend +
 * performance, aggregate by the cell's format / angle / channel / thesis (and
 * platform from the unit's snapshots). Cells with no linked unit are skipped
 * (nothing produced → nothing to attribute). Async (reads unit dirs).
 */
export async function buildCampaignRoi(ws: string, campaign: Campaign): Promise<RoiReport> {
  const spendOf = await projectSpendCache();
  const rows: UnitRoiRow[] = [];
  const platformRows: UnitRoiRow[] = [];
  const seen = new Set<string>();
  for (const cell of campaign.inventory) {
    if (!cell.linkedUnitId) continue;
    const [projectId, slug] = splitUnitId(cell.linkedUnitId);
    if (!projectId || !slug) continue;
    if (seen.has(cell.linkedUnitId)) continue;
    seen.add(cell.linkedUnitId);
    const row = await buildUnitRow(projectId, slug, spendOf, {
      format: cell.format,
      angle: cell.angle,
      channel: cell.channel,
      thesisId: cell.thesisId,
    });
    rows.push(row);
    // Per-platform explosion: one row per platform the unit's snapshots hit,
    // sharing the unit's spend (the platform view is qualitative, so we do NOT
    // re-split spend — a platform's cost/1k is over the unit's whole spend).
    for (const platform of measurePerformance(unitDirFor(projectId, slug)).platforms) {
      platformRows.push({ ...row, channel: platform });
    }
  }
  return assembleReport("campaign", ws, rows, platformRows, publishApiUnitsFor(ws), campaign.id);
}

/** Every project registered under a workspace (mirrors selection.ts's scan). */
function workspaceProjects(ws: string): string[] {
  const projectsRoot = path.join(workspaceDir(ws), "projects");
  let ids: string[] = [];
  try {
    ids = fs.readdirSync(projectsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  return ids.filter((id) => projectWorkspace(id) === ws);
}

/**
 * ROI report for a WHOLE workspace: every unit across every project registered
 * under it. Format comes from the unit manifest (no campaign cell to supply
 * angle/channel/thesis, so those dimensions stay empty at workspace scope);
 * platform comes from the unit's snapshots. Async (reads unit dirs).
 */
export async function buildWorkspaceRoi(ws: string): Promise<RoiReport> {
  const spendOf = await projectSpendCache();
  const rows: UnitRoiRow[] = [];
  const platformRows: UnitRoiRow[] = [];
  for (const projectId of workspaceProjects(ws)) {
    for (const slug of listUnitSlugs(projectId)) {
      const unitDir = unitDirFor(projectId, slug);
      let format: string | undefined;
      try {
        format = (JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8")) as { format?: string }).format;
      } catch {
        /* unreadable manifest — the row still counts spend, just no format dim */
      }
      const row = await buildUnitRow(projectId, slug, spendOf, { format });
      rows.push(row);
      for (const platform of measurePerformance(unitDir).platforms) {
        platformRows.push({ ...row, channel: platform });
      }
    }
  }
  return assembleReport("workspace", ws, rows, platformRows, publishApiUnitsFor(ws));
}

// ─── #532 seam: cost-adjusted performance score ───────────────────────────────
//
// #532's selection loop (selection.ts `attributeOutcomes` → `sampleWeighted`)
// biases toward proven WINNERS on raw performance. This exposes the ROI axis it
// can weight by so selection optimizes RETURN, not raw views: a cheap-but-decent
// format can beat an expensive-slightly-better one. Pure function over a report;
// #532 owns the wiring — we do NOT touch the selection loop here.

export interface CostAdjustedScore {
  /** The (dimension, value) the score attaches to (matches selection.ts keys). */
  dimension: string;
  value: string;
  /** Measured views per USD across the dimension's performing units (0 when unmeasured). */
  viewsPerUsd: number;
  /** Normalized [0,1] within the report — the multiplier #532 folds into its weight. */
  score: number;
}

/**
 * Cost-adjusted performance scores per aggregation cell, for #532 to weight by.
 * `viewsPerUsd` is the honest efficiency signal (measured views / performing
 * spend); `score` min-max normalizes it within the report so it is a bounded
 * multiplier. Cells with no measured views score 0 (never a fabricated signal).
 *
 * Dimensions map to selection.ts's `SelectionDimension` where they overlap
 * (platform); format/angle/channel/thesis are campaign-cell axes #532 can adopt.
 */
export function costAdjustedScores(report: RoiReport): CostAdjustedScore[] {
  const dims: Array<{ dimension: string; aggs: RoiAggregate[] }> = [
    { dimension: "format", aggs: report.byFormat },
    { dimension: "angle", aggs: report.byAngle },
    { dimension: "channel", aggs: report.byChannel },
    { dimension: "thesis", aggs: report.byThesis },
    { dimension: "platform", aggs: report.byPlatform },
  ];
  const raw: Array<{ dimension: string; value: string; viewsPerUsd: number }> = [];
  for (const { dimension, aggs } of dims) {
    for (const a of aggs) {
      // viewsPerUsd is the inverse of cost/1k; 0 when unmeasured (excluded from the ratio).
      const viewsPerUsd = a.costPer1kViews === null || a.costPer1kViews <= 0 ? 0 : (1000 / a.costPer1kViews);
      raw.push({ dimension, value: a.key, viewsPerUsd: Number(viewsPerUsd.toFixed(4)) });
    }
  }
  const max = Math.max(0, ...raw.map((r) => r.viewsPerUsd));
  return raw.map((r) => ({
    ...r,
    // ponytail: normalize to the report max; degenerate (all 0) → 0 (neutral).
    score: max > 0 ? Number((r.viewsPerUsd / max).toFixed(4)) : 0,
  }));
  // #532: fold `score` into the selection weight for the matching (dimension,value)
  // in cli/lib/selection.ts (buildLookup / attributeOutcomes) so the sampler
  // biases on RETURN, not raw views. That wiring is #532's job — not done here.
}
