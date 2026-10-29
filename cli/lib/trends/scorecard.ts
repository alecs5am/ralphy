// Adapt scorecard for trend references (#590).
//
// Every reference row the engine shows (`trends signals`, `trends series`,
// the niche report) carries one scorecard: when it was posted and how old it
// is, how far it beat its creator and where that sits in the niche, reach
// per follower, creator size, replication (other creators with the same
// visual format, series lift), visual format, sponsored flag, transferable vs
// creator-bound, evidence quality, and a verdict `adapt | test | skip` with
// the rules that decided it. The rules are fixed and documented in
// docs/research/trend-corpus.md ("Freshness window and adapt scorecard"), so
// the verdict is reproducible from the row alone.
//
// Pure: no store access; callers pass the facts.

import { DEFAULT_MAX_AGE_DAYS, HOT_AGE_DAYS, ageDaysOf, freshnessOf, type Freshness } from "./freshness.js";

export const SCORECARD_RULES_VERSION = 1;

/** Rule thresholds (version 1). */
export const SCORECARD_THRESHOLDS = {
  /** K5: below both, the row shows no lift over its creator. */
  minMultiplier: 2,
  minSeriesLift: 1.5,
  /** A1: a strong lift. */
  adaptMultiplier: 3,
  adaptPercentile: 0.9,
  adaptSeriesLift: 2,
  minSeriesParts: 3,
  /** A3: other in-window hits (>= adaptMultiplier) of the same creator that make the hit repeatable on the channel. */
  minRepeatHits: 2,
  /** Evidence quality. */
  strongBaselineN: 15,
  okBaselineN: 8,
  okSeriesOther: 5,
  /** A5: on macro / mega accounts, reach must leave the audience. */
  largeBands: ["macro", "mega"] as readonly string[],
  largeMinViewsPerFollower: 1,
} as const;

export type ScorecardVerdict = "adapt" | "test" | "skip";
export type EvidenceQuality = "strong" | "ok" | "weak";
export type TransferClass = "transferable" | "creator-bound" | "not-checked";

export interface ScorecardInput {
  /** `series`: the row is a series (judged on its reference part); K5 then needs the series lift itself. Default `video`. */
  kind?: "video" | "series";
  now: number;
  maxAgeDays?: number;
  postedAt: number | null;
  views: number | null;
  /** `exact` or `rounded` (YouTube flat listings round to 2-3 significant figures). */
  viewsPrecision: string | null;
  /** Creator-relative views multiplier (#556), null when unscored. */
  multiplier: number | null;
  /** Share of the niche's judgeable in-window videos (same platform) at or below this multiplier. */
  multiplierPercentile: number | null;
  /** Earlier same-format videos in the creator baseline (#556 `baselineN`). */
  baselineN: number | null;
  thin: boolean;
  provisional: boolean;
  followers: number | null;
  sizeBand: string | null;
  sponsored: boolean;
  /** Frame-read visual format (#588), null when unlabeled. */
  visualFormat: { format: string; confidence: number } | null;
  /** Caption pre-label (#556 content format): shown, never used by a rule. */
  captionLabel: string | null;
  /** Other creators with a fresh labeled series of the same visual format (null when the row has no visual format). */
  visualFormatCreators: number | null;
  /** Other in-window judgeable videos of the same creator at >= 3x (null when unknown). */
  creatorRepeatHits: number | null;
  /** The series this video belongs to (#588), if any. */
  series: { lift: number | null; parts: number; other: number; partsInWindow: number | null } | null;
  /** Within-creator contrast class (#577), null when no contrast was written. */
  transfer: "transferable" | "creator-bound" | null;
  /** Niche noise floor in views (A4), null to skip the rule. */
  noiseFloorViews: number | null;
}

export interface ScorecardCheck {
  rule: string;
  pass: boolean;
  detail: string;
}

export interface Scorecard {
  rulesVersion: number;
  posted: { at: string | null; ageDays: number | null; freshness: Freshness };
  multiplier: number | null;
  nichePercentile: number | null;
  views: number | null;
  viewsPerFollower: number | null;
  creator: { followers: number | null; sizeBand: string | null };
  replication: { visualFormatCreators: number | null; creatorRepeatHits: number | null; seriesLift: number | null; seriesParts: number | null; seriesPartsInWindow: number | null };
  visualFormat: { format: string; confidence: number } | null;
  captionLabel: string | null;
  sponsored: boolean;
  transfer: TransferClass;
  evidence: { quality: EvidenceQuality; baselineN: number | null; dated: boolean; views: "exact" | "rounded" | "unknown" };
  verdict: ScorecardVerdict;
  /** The rules that decided the verdict (failing skip rules, else failing adapt rules, else the passing adapt rules). */
  reasons: string[];
  checks: ScorecardCheck[];
}

const round = (value: number | null, digits = 2): number | null => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const pct = (value: number) => `p${Math.round(value * 100)}`;
const x = (value: number | null) => (value === null ? "-" : `${round(value)}x`);

/** Share of `sortedAsc` at or below `value` (0..1); null without a value or a population. */
export function percentileRank(sortedAsc: readonly number[], value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || sortedAsc.length === 0) return null;
  let low = 0;
  let high = sortedAsc.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sortedAsc[mid]! <= value) low = mid + 1;
    else high = mid;
  }
  return round(low / sortedAsc.length, 3);
}

export function evidenceQuality(input: Pick<ScorecardInput, "postedAt" | "viewsPrecision" | "baselineN" | "thin" | "provisional" | "multiplier" | "series">): EvidenceQuality {
  if (input.postedAt === null) return "weak";
  const t = SCORECARD_THRESHOLDS;
  const scored = input.multiplier !== null && !input.thin && !input.provisional;
  if (scored && (input.baselineN ?? 0) >= t.strongBaselineN && input.viewsPrecision === "exact") return "strong";
  if (scored && (input.baselineN ?? 0) >= t.okBaselineN) return "ok";
  if (!input.provisional && input.series && input.series.parts >= t.minSeriesParts && input.series.other >= t.okSeriesOther) return "ok";
  return "weak";
}

export function buildScorecard(input: ScorecardInput): Scorecard {
  const t = SCORECARD_THRESHOLDS;
  const maxAgeDays = input.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const freshness = freshnessOf(input.postedAt, input.now, maxAgeDays, HOT_AGE_DAYS);
  const ageDays = ageDaysOf(input.postedAt, input.now);
  const vpf = input.views !== null && input.followers !== null && input.followers > 0 ? input.views / input.followers : null;
  const seriesLift = input.series?.lift ?? null;
  const seriesParts = input.series?.parts ?? null;
  const quality = evidenceQuality(input);
  const transfer: TransferClass = input.transfer ?? "not-checked";
  const postedText = input.postedAt === null ? "undated" : `${new Date(input.postedAt).toISOString().slice(0, 10)}, ${ageDays} d`;
  const strongSeries = seriesLift !== null && seriesLift >= t.adaptSeriesLift && (seriesParts ?? 0) >= t.minSeriesParts;
  const repeatSeries = seriesLift !== null && seriesLift >= t.minSeriesLift && (seriesParts ?? 0) >= t.minSeriesParts;
  // A multiplier from a thin baseline or a provisional age is shown but decides nothing.
  const usable = input.thin || input.provisional ? null : input.multiplier;
  const usableText = input.multiplier === null ? "-" : usable === null ? `${x(input.multiplier)} (${input.thin ? "thin baseline" : "provisional age"}, not used)` : x(usable);
  const strongMultiplier = usable !== null && usable >= t.adaptMultiplier && (input.multiplierPercentile === null || input.multiplierPercentile >= t.adaptPercentile);
  const seriesRow = input.kind === "series";

  const skip: ScorecardCheck[] = [
    { rule: "K1 dated", pass: input.postedAt !== null, detail: input.postedAt === null ? "freshness unknown: no post time, never a reference" : `posted ${postedText}` },
    { rule: "K2 fresh", pass: input.postedAt === null || freshness === "hot" || freshness === "fresh", detail: freshness === "stale" ? `posted ${postedText} > ${maxAgeDays} d` : `${freshness} (<= ${freshness === "hot" ? HOT_AGE_DAYS : maxAgeDays} d)` },
    { rule: "K3 not sponsored", pass: !input.sponsored, detail: input.sponsored ? "sponsored (#ad / paid partnership): reach was bought" : "no sponsored marker" },
    { rule: "K4 not creator-bound", pass: transfer !== "creator-bound", detail: transfer === "creator-bound" ? "within-creator contrast: creator-bound (persona, news, collab, or paid)" : `contrast: ${transfer}` },
    {
      rule: "K5 lift",
      pass: seriesRow ? seriesLift !== null && seriesLift >= t.minSeriesLift : (usable !== null && usable >= t.minMultiplier) || (seriesLift !== null && seriesLift >= t.minSeriesLift),
      detail: seriesRow
        ? `series lift ${x(seriesLift)} over the channel's other videos (a series row needs >= ${t.minSeriesLift}x)`
        : `multiplier ${usableText} (needs >= ${t.minMultiplier}x) or series lift ${x(seriesLift)} (needs >= ${t.minSeriesLift}x)`,
    },
  ];
  const visualText = input.visualFormat ? `${input.visualFormat.format} on ${input.visualFormatCreators ?? 0} other creator(s)` : "visual format not labeled";
  const repeatHits = (input.creatorRepeatHits ?? 0) >= t.minRepeatHits;
  const repeatText = `${input.creatorRepeatHits ?? 0} other ${t.adaptMultiplier}x+ hit(s) by the same creator in the window`;
  const adapt: ScorecardCheck[] = [
    {
      rule: "A1 strong lift",
      pass: strongMultiplier || strongSeries,
      detail: strongMultiplier
        ? `${x(input.multiplier)} creator median${input.multiplierPercentile === null ? "" : `, niche ${pct(input.multiplierPercentile)}`}`
        : strongSeries
          ? `series lift ${x(seriesLift)} over ${seriesParts} parts`
          : `needs >= ${t.adaptMultiplier}x at niche >= ${pct(t.adaptPercentile)} (has ${usableText}${input.multiplierPercentile === null || usable === null ? "" : `, ${pct(input.multiplierPercentile)}`}) or series lift >= ${t.adaptSeriesLift}x over ${t.minSeriesParts}+ parts (has ${x(seriesLift)})`,
    },
    {
      rule: "A2 evidence",
      pass: quality !== "weak",
      detail: `${quality} (baseline n ${input.baselineN ?? "-"}${input.thin ? ", thin" : ""}${input.provisional ? ", provisional age" : ""}, ${input.viewsPrecision ?? "unknown"} views${input.series ? `, series ${input.series.parts} parts vs ${input.series.other} other` : ""})`,
    },
    {
      rule: "A3 replication",
      pass: (input.visualFormatCreators ?? 0) >= 1 || repeatSeries || repeatHits,
      detail: [
        visualText,
        seriesLift === null ? "not part of a series" : `series lift ${x(seriesLift)} over ${seriesParts} parts${repeatSeries ? "" : ` (needs >= ${t.minSeriesLift}x over ${t.minSeriesParts}+)`}`,
        `${repeatText}${repeatHits ? "" : ` (needs ${t.minRepeatHits})`}`,
      ].join("; "),
    },
    {
      rule: "A4 noise floor",
      pass: input.noiseFloorViews === null || (input.views ?? 0) >= input.noiseFloorViews,
      detail: input.noiseFloorViews === null ? "no noise floor" : `${input.views ?? "-"} views vs floor ${input.noiseFloorViews}`,
    },
    {
      rule: "A5 reach beyond audience",
      pass: !t.largeBands.includes(input.sizeBand ?? "") || strongSeries || (vpf !== null && vpf >= t.largeMinViewsPerFollower),
      detail: t.largeBands.includes(input.sizeBand ?? "")
        ? `${input.sizeBand} account, ${round(vpf, 2) ?? "-"} views per follower (needs >= ${t.largeMinViewsPerFollower} unless a strong series)`
        : `${input.sizeBand ?? "unknown"} account`,
    },
  ];
  const failedSkip = skip.filter((check) => !check.pass);
  const failedAdapt = adapt.filter((check) => !check.pass);
  const verdict: ScorecardVerdict = failedSkip.length > 0 ? "skip" : failedAdapt.length > 0 ? "test" : "adapt";
  const asReason = (check: ScorecardCheck) => `${check.rule}: ${check.detail}`;
  const reasons = verdict === "skip"
    ? failedSkip.map(asReason)
    : verdict === "test"
      ? failedAdapt.map(asReason)
      : adapt.map(asReason);
  if (verdict !== "skip" && transfer === "not-checked") reasons.push("note: transferability not checked (no within-creator contrast)");
  return {
    rulesVersion: SCORECARD_RULES_VERSION,
    posted: { at: input.postedAt === null ? null : new Date(input.postedAt).toISOString(), ageDays, freshness },
    multiplier: round(input.multiplier),
    nichePercentile: input.multiplierPercentile,
    views: input.views,
    viewsPerFollower: round(vpf, 3),
    creator: { followers: input.followers, sizeBand: input.sizeBand },
    replication: { visualFormatCreators: input.visualFormatCreators, creatorRepeatHits: input.creatorRepeatHits, seriesLift: round(seriesLift), seriesParts, seriesPartsInWindow: input.series?.partsInWindow ?? null },
    visualFormat: input.visualFormat,
    captionLabel: input.captionLabel,
    sponsored: input.sponsored,
    transfer,
    evidence: { quality, baselineN: input.baselineN, dated: input.postedAt !== null, views: input.viewsPrecision === "exact" ? "exact" : input.viewsPrecision === "rounded" ? "rounded" : "unknown" },
    verdict,
    reasons,
    checks: [...skip, ...adapt],
  };
}

const VERDICT_ORDER: Record<ScorecardVerdict, number> = { adapt: 0, test: 1, skip: 2 };

/** adapt first, then test, then skip; stable within a verdict. */
export function byVerdict<T>(rows: readonly T[], cardOf: (row: T) => Scorecard | null): T[] {
  return rows
    .map((row, index) => ({ row, index, order: VERDICT_ORDER[cardOf(row)?.verdict ?? "skip"] }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.row);
}

export function verdictCounts(cards: ReadonlyArray<Scorecard | null>): Record<ScorecardVerdict, number> {
  const out: Record<ScorecardVerdict, number> = { adapt: 0, test: 0, skip: 0 };
  for (const card of cards) if (card) out[card.verdict] += 1;
  return out;
}

/** The rules, as printed in reports and the docs (version 1). */
export const SCORECARD_RULES: readonly string[] = [
  `Freshness: hot = posted within ${HOT_AGE_DAYS} days, fresh = within the window (default ${DEFAULT_MAX_AGE_DAYS} days), stale = older, unknown = undated.`,
  "Skip when any of: K1 undated; K2 stale; K3 sponsored (#ad, paid partnership); K4 creator-bound in a within-creator contrast; K5 no lift (multiplier < 2x and series lift < 1.5x; a series row needs its own series lift >= 1.5x). A multiplier from a thin baseline or a provisional age (under 72 h) is shown but never decides a rule.",
  "Adapt when none of the skip rules fire and all of: A1 strong lift (multiplier >= 3x at niche percentile >= p90, or series lift >= 2x over 3+ parts); A2 evidence ok or strong; A3 replication (the visual format on 1+ other creator's fresh labeled series, or series lift >= 1.5x over 3+ parts, or 2+ other 3x+ hits by the same creator inside the window); A4 views at or above the niche noise floor; A5 reach beyond the audience (macro / mega accounts need >= 1 view per follower unless a strong series).",
  "Test otherwise; the failing adapt rules are the reasons.",
  "Evidence: strong = scored, non-thin, past the 72-hour provisional age, baseline n >= 15, exact views; ok = scored with baseline n >= 8, or a series with 3+ parts and 5+ unmarked videos; weak = anything else.",
  "Niche percentile = share of the niche's judgeable in-window videos on the same platform (scored, non-thin, non-provisional, not sponsored) at or below this multiplier.",
];

// ─── Markdown ───────────────────────────────────────────────────────────────

const mdCell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US") : String(value);
  return String(value).replace(/\|/g, "/");
};

export interface ScorecardRow {
  label: string;
  url: string | null;
  card: Scorecard;
}

/** One reference table: every row shows post date and age and the full scorecard. */
export function renderScorecardTable(rows: readonly ScorecardRow[]): string {
  if (rows.length === 0) return "_No rows._\n";
  const headers = ["#", "Reference", "Posted (age d)", "Fresh", "X (niche pct)", "Views", "Views / follower", "Size", "Visual format", "Replication", "Sponsored", "Transfer", "Evidence", "Verdict", "Reasons", "Video"];
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  rows.forEach((row, index) => {
    const c = row.card;
    const replication = [
      c.replication.visualFormatCreators === null ? null : `format on ${c.replication.visualFormatCreators} other creator(s)`,
      c.replication.seriesLift === null ? null : `series ${c.replication.seriesLift}x / ${c.replication.seriesParts} parts`,
      c.replication.creatorRepeatHits ? `${c.replication.creatorRepeatHits} repeat hit(s)` : null,
    ].filter(Boolean).join("; ");
    const cells = [
      index + 1,
      row.label,
      c.posted.at ? `${c.posted.at.slice(0, 10)} (${c.posted.ageDays})` : "undated",
      c.posted.freshness,
      c.multiplier === null ? null : `${c.multiplier}x${c.nichePercentile === null ? "" : ` (p${Math.round(c.nichePercentile * 100)})`}`,
      c.views === null ? null : `${mdCell(c.views)}${c.evidence.views === "rounded" ? " (rounded)" : ""}`,
      c.viewsPerFollower,
      c.creator.sizeBand,
      c.visualFormat ? `${c.visualFormat.format} (${c.visualFormat.confidence})` : "unlabeled",
      replication || "none",
      c.sponsored ? "yes" : "no",
      c.transfer,
      `${c.evidence.quality} (n ${c.evidence.baselineN ?? "-"})`,
      `**${c.verdict}**`,
      c.reasons.join("; "),
      row.url,
    ];
    lines.push(`| ${cells.map(mdCell).join(" | ")} |`);
  });
  return lines.join("\n") + "\n";
}
