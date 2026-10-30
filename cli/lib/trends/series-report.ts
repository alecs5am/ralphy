// `ralphy trends series` (#588) — series detection over a niche's kept
// main-group channels, visual format labels from the per-niche label
// Document, format-level stats, and the free digest + labeling worksheet
// flow for the agent's own vision.
//
// Scope: every kept main-group member of the niche, in-sample and
// out-of-sample (the stratified sample cap matters for cohort statistics,
// not for a within-channel comparison). Personal data: public handles,
// public video URLs, public metrics, and a short caption stem; full captions
// appear only (truncated) in the agent's labeling worksheet.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadNicheMembers, loadNicheVideos, type NicheDto, type NicheMemberDto, type NicheVideoDto } from "../store/trend-niches.js";
import { visualFormatLabels } from "../store/trend-formats.js";
import { truncateCodePoints, type TrendPlatform } from "./math.js";
import { classifyProbe } from "./breaker.js";
import { inFreshWindow } from "./freshness.js";
import { buildReferenceIndex, contrastClassByVideo, videoScorecard } from "./reference-card.js";
import { byVerdict, renderScorecardTable, verdictCounts, SCORECARD_RULES, type Scorecard } from "./scorecard.js";
import { isSponsored } from "./signals.js";
import {
  DEFAULT_SERIES_OPTIONS,
  VISUAL_FORMATS,
  VISUAL_FORMAT_DEFINITIONS,
  VISUAL_FORMAT_METHOD,
  VISUAL_FORMAT_TAXONOMY_VERSION,
  detectChannelSeries,
  formatStats,
  type DetectedSeries,
  type FormatStat,
  type LabeledSeries,
  type SeriesFreshness,
  type SeriesOptions,
  type VisualFormatLabel,
  SERIES_FRESH_DAYS,
  seriesFreshness,
} from "./series.js";

export interface SeriesReportOptions extends SeriesOptions {
  language?: string;
  platform?: TrendPlatform;
  /** Hide series whose median views sit below this floor (0 = show all). */
  minMedianViews: number;
  /** Rows in the printed list. */
  limit: number;
  /** A series is a reference only with a part posted within this many days (the #590 window, --max-age-days). */
  freshDays: number;
  /** List only fresh series (references); default true since #590, `--include-stale` lists the rest with verdict skip. */
  freshOnly: boolean;
}

export const DEFAULT_SERIES_REPORT_OPTIONS: SeriesReportOptions = { ...DEFAULT_SERIES_OPTIONS, minMedianViews: 0, limit: 30, freshDays: SERIES_FRESH_DAYS, freshOnly: true };

const DAY_MS = 86_400_000;
const isoOf = (value: number | null) => (value === null ? null : new Date(value).toISOString());
const ageOf = (value: number | null, now: number) => (value === null ? null : Math.round(((now - value) / DAY_MS) * 10) / 10);

const round = (value: number | null, digits = 2): number | null => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export interface SeriesItem {
  niche: string;
  creatorId: string;
  platform: TrendPlatform;
  channel: string;
  language: string | null;
  followers: number | null;
  sizeBand: string | null;
  seriesKey: string;
  series: DetectedSeries;
  best: PartRef | null;
  /** Highest part number: the part to date and digest. */
  newest: PartRef | null;
  freshness: SeriesFreshness;
  /** Latest known post time over the parts, and its age in days. */
  postedAt: number | null;
  ageDays: number | null;
  label: VisualFormatLabel | null;
  /** The part the scorecard judges (#590): the most-viewed part posted inside the window, else the newest part. */
  reference: ReferencePart | null;
  /** Parts posted inside the window. */
  partsInWindow: number;
  /** Adapt scorecard of the reference part (#590). */
  card: Scorecard | null;
}

export interface ReferencePart extends PartRef {
  multiplier: number | null;
  baselineN: number | null;
  flags: string[];
  viewsPrecision: string | null;
  hashtags: string[];
  captionLabel: string | null;
}

export interface PartRef {
  videoId: string;
  platformVideoId: string;
  url: string;
  views: number | null;
  postedAt: number | null;
  title: string | null;
}

/** Detect series for the given niches (kept main-group channels in scope). */
export function collectSeries(input: { niches: readonly NicheDto[]; options?: Partial<SeriesReportOptions>; now: number }): {
  items: SeriesItem[];
  channels: Map<string, { niche: string; channels: number; withMarkers: number; withSeries: number; thinBaseline: number }>;
} {
  const options = { ...DEFAULT_SERIES_REPORT_OPTIONS, ...(input.options ?? {}) };
  const items: SeriesItem[] = [];
  const channels = new Map<string, { niche: string; channels: number; withMarkers: number; withSeries: number; thinBaseline: number }>();
  for (const niche of input.niches) {
    const members = loadNicheMembers({ nicheId: niche.id, statuses: ["kept"] }).filter(
      (member) =>
        (member.cohortGroup === "main" || member.cohortGroup === null) &&
        (!options.language || member.language === options.language) &&
        (!options.platform || member.platform === options.platform),
    );
    const labels = visualFormatLabels({ workspaceId: niche.workspaceId, niche: niche.slug });
    const byCreator = new Map<string, NicheVideoDto[]>();
    const loaded = loadNicheVideos({ creatorIds: members.map((member) => member.creatorId) });
    for (const video of loaded) {
      (byCreator.get(video.creatorId) ?? byCreator.set(video.creatorId, []).get(video.creatorId)!).push(video);
    }
    const nicheItems: SeriesItem[] = [];
    const stats = { niche: niche.slug, channels: members.length, withMarkers: 0, withSeries: 0, thinBaseline: 0 };
    for (const member of members) {
      const videos = byCreator.get(member.creatorId) ?? [];
      const result = detectChannelSeries(
        videos.map((video) => ({ id: video.id, text: video.title ?? video.description, views: video.views, multiplier: video.multiplier, postedAt: video.postedAt })),
        options,
      );
      if (result.marked > 0) stats.withMarkers += 1;
      if (result.reason === "thin-baseline") stats.thinBaseline += 1;
      if (result.series.length > 0) stats.withSeries += 1;
      const byId = new Map(videos.map((video) => [video.id, video]));
      for (const series of result.series) nicheItems.push(seriesItem(niche, member, series, byId, labels, input.now, options.freshDays));
    }
    // #590 scorecards: one reference index per niche (labels, fresh labeled formats, contrasts, the multiplier population).
    const index = buildReferenceIndex({
      now: input.now,
      maxAgeDays: options.freshDays,
      noiseFloorViews: niche.settings.noiseFloorViews,
      labels,
      seriesItems: nicheItems,
      transferByVideo: contrastClassByVideo({ workspaceId: niche.workspaceId, niche: niche.slug }),
      population: loaded.filter((video) => judgeableInWindow(video, input.now, options.freshDays)),
    });
    const memberOf = new Map(members.map((member) => [member.creatorId, member]));
    for (const item of nicheItems) {
      const ref = item.reference;
      const member = memberOf.get(item.creatorId);
      item.card = ref
        ? videoScorecard(index, {
            videoId: ref.videoId, creatorId: item.creatorId, platform: item.platform, postedAt: ref.postedAt, views: ref.views, viewsPrecision: ref.viewsPrecision,
            multiplier: ref.multiplier, baselineN: ref.baselineN, flags: ref.flags, followers: member?.followers ?? item.followers, sizeBand: item.sizeBand,
            title: ref.title, hashtags: ref.hashtags, captionLabel: ref.captionLabel,
          }, { partsInWindow: item.partsInWindow, kind: "series", series: item })
        : null;
      items.push(item);
    }
    channels.set(niche.slug, stats);
  }
  items.sort((a, b) => (b.series.lift ?? -Infinity) - (a.series.lift ?? -Infinity) || b.series.parts - a.series.parts || a.channel.localeCompare(b.channel));
  return { items, channels };
}

/** Scored, non-thin, past the provisional age, not sponsored, and posted inside the window: the percentile population. */
export function judgeableInWindow(video: NicheVideoDto, now: number, maxAgeDays: number): boolean {
  return video.multiplier !== null && !video.flags.includes("thin") && !video.flags.includes("provisional") && !isSponsored({ title: video.title ?? video.description, hashtags: video.hashtags }) && inFreshWindow(video.postedAt, now, maxAgeDays);
}

const baselineNOf = (video: NicheVideoDto): number | null => (typeof video.detail?.baselineN === "number" ? video.detail.baselineN : null);

function referencePart(series: DetectedSeries, byId: Map<string, NicheVideoDto>, now: number, maxAgeDays: number): { part: ReferencePart | null; inWindow: number } {
  const parts = series.partIds.map((id) => byId.get(id)).filter((video): video is NicheVideoDto => video !== undefined);
  const fresh = parts.filter((video) => inFreshWindow(video.postedAt, now, maxAgeDays));
  const chosen = fresh.sort((a, b) => (b.views ?? -1) - (a.views ?? -1))[0] ?? (series.newestPartId ? byId.get(series.newestPartId) : undefined) ?? (series.bestPartId ? byId.get(series.bestPartId) : undefined);
  if (!chosen) return { part: null, inWindow: fresh.length };
  return {
    part: { ...partRef(chosen)!, multiplier: chosen.multiplier, baselineN: baselineNOf(chosen), flags: chosen.flags, viewsPrecision: chosen.viewsPrecision, hashtags: chosen.hashtags, captionLabel: chosen.format },
    inWindow: fresh.length,
  };
}

function partRef(video: NicheVideoDto | null | undefined): PartRef | null {
  if (!video) return null;
  const text = video.title ?? video.description;
  return { videoId: video.id, platformVideoId: video.platformVideoId, url: video.url, views: video.views, postedAt: video.postedAt, title: text ? truncateCodePoints(text, 90) : null };
}

function seriesItem(niche: NicheDto, member: NicheMemberDto, series: DetectedSeries, byId: Map<string, NicheVideoDto>, labels: Map<string, VisualFormatLabel>, now: number, freshDays: number): SeriesItem {
  // The label of the newest part wins, then the best part; any labeled part labels the series.
  const labeledId = [series.newestPartId, series.bestPartId, ...series.partIds].find((id) => id !== null && labels.has(id)) ?? null;
  const fresh = seriesFreshness(series, now, freshDays);
  const reference = referencePart(series, byId, now, freshDays);
  return {
    niche: niche.slug,
    creatorId: member.creatorId,
    platform: member.platform,
    channel: member.handle ?? member.displayName ?? member.platformCreatorId,
    language: member.language,
    followers: member.followers,
    sizeBand: member.sizeBand,
    seriesKey: `${member.creatorId}:${series.key}`,
    series,
    best: partRef(series.bestPartId ? byId.get(series.bestPartId) : null),
    newest: partRef(series.newestPartId ? byId.get(series.newestPartId) : null),
    freshness: fresh.freshness,
    postedAt: fresh.postedAt,
    ageDays: fresh.ageDays,
    label: labeledId ? labels.get(labeledId)! : null,
    reference: reference.part,
    partsInWindow: reference.inWindow,
    card: null,
  };
}

/** Labeled series of the given items as format-stat input (one row per series). */
export function labeledSeriesRows(items: readonly SeriesItem[]): LabeledSeries[] {
  return items
    .filter((item) => item.label !== null && item.freshness === "fresh")
    .map((item) => ({
      niche: item.niche,
      channel: item.channel,
      creatorId: item.creatorId,
      lift: item.series.lift,
      parts: item.series.parts,
      url: item.best?.url ?? null,
      format: item.label!.format,
      confidence: item.label!.confidence,
      postedAt: isoOf(item.postedAt),
      ageDays: item.ageDays,
    }));
}

const SERIES_METHOD =
  "captions with a part / episode / day / week / chapter / series / #N / N-of-M marker (English and Russian) are grouped per channel by a 3-word stem (markers, hashtags, and digits removed); a rank (\"the #1 skill\") is never a marker, and a rank-shaped #N, a bare \"series N\", a rating or stat fraction (N/10, N/100) or a date-shaped fraction (10/28) counts only when the channel has the minimum parts of that kind with distinct numbers (#593); a stem group with the minimum parts is a series, otherwise the marked videos of one marker kind with the minimum distinct part numbers form one numbered set; lift = series median views / median views of the channel's unmarked videos; multiplier lift compares creator-relative multipliers where both sides are dated and scored";

export function seriesRow(item: SeriesItem, rank: number, now: number) {
  const s = item.series;
  const part = (ref: PartRef | null) => (ref ? { url: ref.url, views: ref.views, postedAt: isoOf(ref.postedAt), ageDays: ageOf(ref.postedAt, now), videoId: ref.videoId } : null);
  return {
    rank,
    freshness: item.freshness,
    postedAt: isoOf(item.postedAt),
    ageDays: item.ageDays,
    niche: item.niche,
    platform: item.platform,
    channel: item.channel,
    language: item.language,
    followers: item.followers,
    sizeBand: item.sizeBand,
    stem: s.stem,
    grouping: s.grouping,
    primary: s.primary,
    parts: s.parts,
    partNumbers: s.partNumbers.slice(0, 12),
    markerKinds: s.markerKinds,
    other: s.other,
    seriesMedianViews: round(s.seriesMedianViews, 1),
    otherMedianViews: round(s.otherMedianViews, 1),
    lift: round(s.lift),
    multiplierLift: round(s.multiplierLift),
    datedParts: s.datedParts,
    datedOther: s.datedOther,
    bestPart: part(item.best),
    newestPart: part(item.newest),
    referencePart: part(item.reference),
    partsInWindow: item.partsInWindow,
    visualFormat: item.label ? { format: item.label.format, confidence: item.label.confidence, method: item.label.method } : null,
    verdict: item.card?.verdict ?? "skip",
    scorecard: item.card,
    seriesKey: item.seriesKey,
  };
}

export function buildSeriesReport(input: { niches: readonly NicheDto[]; options?: Partial<SeriesReportOptions>; now: number }) {
  const options = { ...DEFAULT_SERIES_REPORT_OPTIONS, ...(input.options ?? {}) };
  const { items, channels } = collectSeries({ niches: input.niches, options, now: input.now });
  const aboveFloor = items.filter((item) => (item.series.seriesMedianViews ?? 0) >= options.minMedianViews);
  // #590: references are fresh only; stale and freshness-unknown series are counted, not listed (unless --include-stale).
  const shown = byVerdict(aboveFloor.filter((item) => !options.freshOnly || item.freshness === "fresh"), (item) => item.card);
  const excluded = { stale: aboveFloor.filter((item) => item.freshness === "stale").length, freshnessUnknown: aboveFloor.filter((item) => item.freshness === "unknown").length, belowMedianViews: items.length - aboveFloor.length };
  const freshnessCounts = (list: readonly SeriesItem[]) => ({ fresh: list.filter((item) => item.freshness === "fresh").length, stale: list.filter((item) => item.freshness === "stale").length, unknown: list.filter((item) => item.freshness === "unknown").length });
  const primary = items.filter((item) => item.series.primary);
  const labeled = labeledSeriesRows(items);
  const byNiche = [...channels.values()].map((row) => {
    const own = primary.filter((item) => item.niche === row.niche);
    return {
      niche: row.niche,
      channels: row.channels,
      withMarkers: row.withMarkers,
      withSeries: row.withSeries,
      thinBaseline: row.thinBaseline,
      series: items.filter((item) => item.niche === row.niche).length,
      primaryAtLeast1_5x: own.filter((item) => (item.series.lift ?? 0) >= 1.5).length,
      primaryAtLeast2x: own.filter((item) => (item.series.lift ?? 0) >= 2).length,
      freshness: freshnessCounts(items.filter((item) => item.niche === row.niche)),
      labeled: labeled.filter((entry) => entry.niche === row.niche).length,
    };
  });
  return {
    kind: "trend-series" as const,
    niches: input.niches.map((niche) => niche.slug),
    scope: { language: options.language ?? null, platform: options.platform ?? null },
    generatedAt: new Date(input.now).toISOString(),
    settings: { minParts: options.minParts, minOther: options.minOther, stemWords: options.stemWords, minMedianViews: options.minMedianViews, limit: options.limit, freshDays: options.freshDays, freshOnly: options.freshOnly },
    method: SERIES_METHOD,
    coverage: {
      channels: byNiche.reduce((sum, row) => sum + row.channels, 0),
      channelsWithSeries: byNiche.reduce((sum, row) => sum + row.withSeries, 0),
      series: items.length,
      freshness: freshnessCounts(items),
      shown: Math.min(shown.length, options.limit),
      /** Series that pass the freshness and median-views filters, before --limit; the verdict counts cover these. */
      eligible: shown.length,
      excluded: { ...excluded, listed: !options.freshOnly, basis: `a series is listed only when a part was posted within ${options.freshDays} days (--max-age-days); stale and undated series stay stored and counted` },
      verdicts: verdictCounts(shown.map((item) => item.card)),
      primary: {
        series: primary.length,
        atLeast1_5x: primary.filter((item) => (item.series.lift ?? 0) >= 1.5).length,
        atLeast2x: primary.filter((item) => (item.series.lift ?? 0) >= 2).length,
      },
      byNiche,
    },
    series: shown.slice(0, options.limit).map((item, index) => seriesRow(item, index + 1, input.now)),
    scorecardRules: SCORECARD_RULES,
    formats: {
      taxonomyVersion: VISUAL_FORMAT_TAXONOMY_VERSION,
      method: VISUAL_FORMAT_METHOD,
      labeledSeries: labeled.length,
      labeledNotFresh: items.filter((item) => item.label !== null && item.freshness !== "fresh").length,
      basis: `fresh labeled series only (a part posted within ${options.freshDays} days)`,
      rows: formatStats(labeled),
      howTo: "ralphy trends series --niche <n> --digest <k> writes contact sheets and a worksheet; fill format + confidence per item after looking at the sheets, then ralphy trends formats label --from <worksheet>",
    },
    notes: [
      "Lifts are Ralphy's own estimates from listing views (YouTube listing views are rounded to 2-3 significant figures), not platform data.",
      "A series without a caption marker is missed. Ratings (10/10), ranks (the #1 skill), dates (10/28) and product names (Series 11) are not markers unless the channel numbers several parts that way (#593); three unrelated franchises with one marker kind (Ep 1, Ep 5, Ep 16) can still form a numbered set.",
      "The primary series of a channel is its largest one (the one-series-per-channel view of docs/research/series-formats-2026-10-30.md).",
      `Freshness: a series is a reference only when a part was posted within ${options.freshDays} days; detection and lift use the whole channel history. YouTube flat listings carry no post date, so most YouTube series stay "unknown" until their newest part is dated (trends series --digest dates it through the watch page first).`,
      `Scorecard (#590): each row judges its reference part (the most-viewed part posted within ${options.freshDays} days, else the newest part) with the adapt / test / skip rules in scorecardRules; rows are ordered adapt, test, skip, then by lift.`,
    ],
    _items: items,
  };
}

export type SeriesReport = ReturnType<typeof buildSeriesReport>;

// ─── Markdown ───────────────────────────────────────────────────────────────

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US") : String(value);
  return String(value).replace(/\|/g, "/");
};

/** Stems are caption words; a non-Latin stem stays out of markdown written to disk (the repository is English-only). */
export const stemCell = (stem: string) => (!stem ? "-" : /[^\p{Script=Latin}\p{N}\s]/u.test(stem) ? "(non-Latin caption)" : stem);

const postedCell = (postedAt: string | null, ageDays: number | null) => (postedAt ? `${postedAt.slice(0, 10)} (${ageDays ?? "-"})` : "undated");

function table(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) return "_No rows._\n";
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)].join("\n") + "\n";
}

/** "Formats and series" markdown for labeled series and format stats (shared by trends series and the niche report). */
export function renderFormatsAndSeriesMarkdown(input: {
  labeledSeries: ReadonlyArray<ReturnType<typeof seriesRow>>;
  stats: readonly FormatStat[];
  heading?: string;
  level?: number;
}): string {
  const h = "#".repeat(input.level ?? 2);
  const lines: string[] = [`${h} ${input.heading ?? "Formats and series"}`, ""];
  lines.push(
    "Visual formats read from contact sheets (1 frame per second) of the newest part of each series; method vision-agent, taxonomy v" +
      `${VISUAL_FORMAT_TAXONOMY_VERSION}. Lift = series median views / the channel's unmarked median views. Fresh series only (a part posted within ${SERIES_FRESH_DAYS} days); posted = the newest known part.`,
    "",
  );
  lines.push(`${h}# Visual formats that run as series`, "");
  lines.push(
    table(
      ["Niche", "Visual format", "Series", "Channels", "Median lift", "Best example", "Posted (age d)"],
      input.stats.map((row) => [row.niche, row.format, row.series, row.channels, row.medianLift === null ? null : `${row.medianLift}x`, row.bestExample ? `@${String(row.bestExample.channel).replace(/^@/, "")} ${row.bestExample.lift}x (${row.bestExample.parts} parts) ${row.bestExample.url ?? ""}`.trim() : null, row.bestExample ? postedCell(row.bestExample.postedAt, row.bestExample.ageDays) : null]),
    ),
  );
  lines.push(`${h}# Labeled series`, "");
  lines.push(
    table(
      ["#", "Channel", "Niche", "Parts", "Lift", "Visual format", "Confidence", "Freshness", "Posted (age d)", "Example (newest part)"],
      input.labeledSeries.map((row, index) => [index + 1, `${row.platform}:@${String(row.channel).replace(/^@/, "")}`, row.niche, row.parts, row.lift === null ? null : `${row.lift}x`, row.visualFormat?.format ?? null, row.visualFormat?.confidence ?? null, row.freshness, postedCell(row.postedAt, row.ageDays), row.newestPart?.url ?? row.bestPart?.url ?? null]),
    ),
  );
  return lines.join("\n");
}

export function renderSeriesMarkdown(report: SeriesReport, options: { title?: string; preface?: string } = {}): string {
  const lines: string[] = [`# ${options.title ?? `Series and visual formats: ${report.niches.join(", ")}`}`, ""];
  if (options.preface) lines.push(options.preface, "");
  lines.push(`Generated ${report.generatedAt} by \`ralphy trends series --niche ${report.niches.join(",")}\`. ${report.notes[0]}`, "");
  lines.push(`Method: ${report.method}. Minimum ${report.settings.minParts} parts and ${report.settings.minOther} unmarked videos per channel.`, "");
  lines.push("## Coverage", "");
  lines.push(
    table(
      ["Niche", "Channels", "With a marker", "With a series", "Series", "Fresh", "Stale", "Freshness unknown", "Primary >= 1.5x", "Primary >= 2x", "Labeled (fresh)"],
      report.coverage.byNiche.map((row) => [row.niche, row.channels, row.withMarkers, row.withSeries, row.series, row.freshness.fresh, row.freshness.stale, row.freshness.unknown, row.primaryAtLeast1_5x, row.primaryAtLeast2x, row.labeled]),
    ),
  );
  const ex = report.coverage.excluded;
  lines.push(`Freshness window: ${report.settings.freshDays} days. Excluded from the list: ${ex.stale} stale series (newest dated part older than the window), ${ex.freshnessUnknown} freshness-unknown series (no dated part), ${ex.belowMedianViews} below the median-views floor. Verdicts of the ${report.coverage.eligible} listable series (before --limit ${report.settings.limit}): adapt ${report.coverage.verdicts.adapt}, test ${report.coverage.verdicts.test}, skip ${report.coverage.verdicts.skip}.`, "");
  lines.push("## Series by verdict and lift", "");
  lines.push(
    table(
      ["#", "Channel", "Niche", "Stem", "Grouping", "Parts (in window)", "Median views (series vs other)", "Lift", "Multiplier lift", "Freshness", "Posted (age d)", "Visual format", "Verdict", "Reference part"],
      report.series.map((row) => [
        row.rank, `${row.platform}:@${String(row.channel).replace(/^@/, "")}`, row.niche, stemCell(row.stem), row.grouping, `${row.parts} (${row.partsInWindow})`,
        `${cell(row.seriesMedianViews)} vs ${cell(row.otherMedianViews)}`, row.lift === null ? null : `${row.lift}x`, row.multiplierLift === null ? null : `${row.multiplierLift}x`,
        row.freshness, postedCell(row.postedAt, row.ageDays), row.visualFormat ? `${row.visualFormat.format} (${row.visualFormat.confidence})` : null, row.verdict,
        row.referencePart?.url ?? row.newestPart?.url ?? row.bestPart?.url ?? null,
      ]),
    ),
  );
  lines.push("## Adapt scorecard", "");
  lines.push("Each row judges the series' reference part (the most-viewed part posted inside the window, else the newest part). Rules:", "", ...report.scorecardRules.map((rule) => `- ${rule}`), "");
  lines.push(renderScorecardTable(report.series.filter((row) => row.scorecard !== null).map((row) => ({
    label: `${row.platform}:@${String(row.channel).replace(/^@/, "")} (${row.niche}) "${stemCell(row.stem)}" ${row.parts} parts`,
    url: row.referencePart?.url ?? row.newestPart?.url ?? null,
    card: row.scorecard!,
  }))));
  const now = Date.parse(report.generatedAt);
  const labeledRows = report._items.filter((item) => item.label !== null && item.freshness === "fresh").map((item, index) => seriesRow(item, index + 1, now));
  lines.push(renderFormatsAndSeriesMarkdown({ labeledSeries: labeledRows, stats: report.formats.rows }));
  lines.push("## Notes", "", ...report.notes.map((line) => `- ${line}`), "");
  return lines.join("\n");
}

// ─── Digest + labeling worksheet ────────────────────────────────────────────

export interface SeriesDigestDeps {
  /** Pull a public video into `outputDir` (the free yt-dlp path, logged out, no cookies). */
  pull: (input: { url: string; slug: string; outputDir: string }) => Promise<{ videoPath?: string; meta: Record<string, unknown> }>;
  /** Build a #557 digest bundle for a local video. */
  digest: (input: { videoPath: string; bundleDir: string; url: string; everySec: number; tilesPerSheet: number; maxSheets: number; meta: Record<string, unknown> }) => Promise<{ bundleDir: string; sheets: string[] }>;
  /** Allocate a fresh versioned bundle dir under `base`. */
  allocate: (base: string) => Promise<string>;
  /** Link a finished bundle to the corpus video (#557 link-digest). */
  link?: (input: { videoId: string; bundleDir: string; params: Record<string, number> }) => void;
}

export interface WorksheetItem {
  rank: number;
  niche: string;
  seriesKey: string;
  videoId: string;
  channel: string;
  platform: string;
  url: string;
  stem: string;
  grouping: string;
  parts: number;
  lift: number | null;
  /** The digested part: the newest one (highest part number). */
  partNumber: number | null;
  views: number | null;
  /** Post time of the digested part (corpus, else the digest's yt-dlp upload_date) and its age in days. */
  postedAt: string | null;
  ageDays: number | null;
  freshness: SeriesFreshness;
  title: string | null;
  status: "ok" | "reused" | "failed" | "blocked" | "not-run";
  reason: string | null;
  bundle: string | null;
  sheets: string[];
  format: string | null;
  confidence: number | null;
  notes: string | null;
}

export interface LabelWorksheet {
  kind: "trend-format-worksheet";
  version: 1;
  createdAt: string;
  niches: string[];
  taxonomyVersion: number;
  taxonomy: Array<{ format: string; definition: string }>;
  instructions: string;
  sampling: { everySec: number; tilesPerSheet: number; maxSheets: number };
  /** Platforms whose first block stopped their digests (other platforms continue, as the per-source breaker does). */
  stopped: Array<{ platform: string; reason: string; detail: string | null; atRank: number }>;
  items: WorksheetItem[];
}

const digestBase = (cacheDir: string, url: string) => path.join(cacheDir, createHash("sha256").update(url).digest("hex").slice(0, 16));

/** An existing bundle (base or newest .vN) built with the same cadence and tile count, if any. */
export function reusableBundle(base: string, everySec: number, tilesPerSheet: number, exists: (file: string) => boolean = existsSync, read: (file: string) => string = (file) => readFileSync(file, "utf8")): { bundleDir: string; sheets: string[] } | null {
  const candidates = [base, ...Array.from({ length: 20 }, (_, index) => `${base}.v${index + 2}`)].filter((dir) => exists(path.join(dir, "digest.json")));
  for (const dir of candidates.reverse()) {
    try {
      const digest = JSON.parse(read(path.join(dir, "digest.json"))) as { sampling?: { everySec?: number }; layout?: { tilesPerSheet?: number }; sheets?: Array<{ file: string }> };
      if (digest.sampling?.everySec === everySec && digest.layout?.tilesPerSheet === tilesPerSheet && Array.isArray(digest.sheets) && digest.sheets.length > 0) {
        return { bundleDir: dir, sheets: digest.sheets.map((sheet) => path.join(dir, sheet.file)) };
      }
    } catch {
      // unreadable digest: build a new one
    }
  }
  return null;
}

/** Post time from yt-dlp metadata: `timestamp`, else `upload_date` (YYYYMMDD, noon UTC). */
export function postedAtFromMeta(meta: Record<string, unknown> | null | undefined): number | null {
  if (!meta) return null;
  const timestamp = typeof meta.timestamp === "number" && Number.isFinite(meta.timestamp) ? meta.timestamp : null;
  if (timestamp !== null) return timestamp * 1000;
  const date = typeof meta.upload_date === "string" && /^\d{8}$/.test(meta.upload_date) ? meta.upload_date : null;
  return date ? Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)), 12) : null;
}

/**
 * Digest the newest part (highest part number) of each of the top-k series, sequentially, and write
 * the labeling worksheet. Free path only: yt-dlp logged out, no cookies; the
 * first block (bot check, rate limit, login wall, forbidden) on a platform
 * stops that platform (its remaining items stay `not-run`), like the #556
 * per-source breaker; other platforms continue.
 */
export async function digestTopSeries(input: {
  items: readonly SeriesItem[];
  k: number;
  cacheDir: string;
  everySec: number;
  tilesPerSheet: number;
  maxSheets: number;
  now: number;
  deps: SeriesDigestDeps;
  log?: (event: Record<string, unknown>) => void;
}): Promise<LabelWorksheet> {
  const chosen = input.items.filter((item) => (item.newest ?? item.best) !== null).slice(0, input.k);
  const items: WorksheetItem[] = chosen.map((item, index) => {
    const part = (item.newest ?? item.best)!;
    const postedAt = part.postedAt ?? item.postedAt;
    return {
    rank: index + 1,
    niche: item.niche,
    seriesKey: item.seriesKey,
    videoId: part.videoId,
    channel: item.channel,
    platform: item.platform,
    url: part.url,
    stem: item.series.stem,
    grouping: item.series.grouping,
    parts: item.series.parts,
    lift: round(item.series.lift),
    partNumber: item.newest ? item.series.newestPartNumber : null,
    views: part.views,
    postedAt: isoOf(postedAt),
    ageDays: ageOf(postedAt, input.now),
    freshness: item.freshness,
    title: part.title,
    status: "not-run",
    reason: null,
    bundle: null,
    sheets: [],
    format: item.label?.format ?? null,
    confidence: item.label?.confidence ?? null,
    notes: item.label?.notes ?? null,
    };
  });
  const stopped: LabelWorksheet["stopped"] = [];
  for (const item of items) {
    const blocked = stopped.find((entry) => entry.platform === item.platform);
    if (blocked) {
      item.reason = `stopped: ${item.platform} blocked (${blocked.reason}) at rank ${blocked.atRank}`;
      continue;
    }
    const base = digestBase(input.cacheDir, item.url);
    const reused = reusableBundle(base, input.everySec, input.tilesPerSheet);
    if (reused) {
      Object.assign(item, { status: "reused", bundle: reused.bundleDir, sheets: reused.sheets });
      input.log?.({ kind: "series-digest", rank: item.rank, status: "reused", url: item.url });
      continue;
    }
    const bundleDir = await input.deps.allocate(base);
    try {
      const pulled = await input.deps.pull({ url: item.url, slug: `series-${item.rank}`, outputDir: path.join(bundleDir, "source") });
      if (!pulled.videoPath) throw new Error("yt-dlp returned no video stream");
      const built = await input.deps.digest({ videoPath: pulled.videoPath, bundleDir, url: item.url, everySec: input.everySec, tilesPerSheet: input.tilesPerSheet, maxSheets: input.maxSheets, meta: pulled.meta });
      Object.assign(item, { status: "ok", bundle: built.bundleDir, sheets: built.sheets });
      const uploaded = postedAtFromMeta(pulled.meta);
      if (item.postedAt === null && uploaded !== null) Object.assign(item, { postedAt: isoOf(uploaded), ageDays: ageOf(uploaded, input.now) });
      input.deps.link?.({ videoId: item.videoId, bundleDir: built.bundleDir, params: { everySec: input.everySec, tilesPerSheet: input.tilesPerSheet, maxSheets: input.maxSheets } });
      input.log?.({ kind: "series-digest", rank: item.rank, status: "ok", url: item.url, sheets: built.sheets.length });
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      const probe = classifyProbe({ code: 1, stderr: message, entries: 0 });
      if (probe.kind === "blocked") {
        Object.assign(item, { status: "blocked", reason: probe.reason ?? "blocked" });
        stopped.push({ platform: item.platform, reason: probe.reason ?? "blocked", detail: probe.detail ?? null, atRank: item.rank });
      } else {
        Object.assign(item, { status: "failed", reason: (probe.reason ?? "error") + (probe.detail ? `: ${probe.detail}` : "") });
      }
      input.log?.({ kind: "series-digest", rank: item.rank, status: item.status, url: item.url, reason: item.reason });
    }
  }
  return {
    kind: "trend-format-worksheet",
    version: 1,
    createdAt: new Date(input.now).toISOString(),
    niches: [...new Set(items.map((item) => item.niche))],
    taxonomyVersion: VISUAL_FORMAT_TAXONOMY_VERSION,
    taxonomy: VISUAL_FORMATS.map((format) => ({ format, definition: VISUAL_FORMAT_DEFINITIONS[format] })),
    instructions:
      "Open every sheet of an item (tiles are 1 s apart, timestamps under each tile), decide how the video is made and presented, and set format to one taxonomy id, confidence to 0..1, and notes to one line on what the frames show. Leave format null to skip an item. Then run: ralphy trends formats label --from <this file>",
    sampling: { everySec: input.everySec, tilesPerSheet: input.tilesPerSheet, maxSheets: input.maxSheets },
    stopped,
    items,
  };
}
