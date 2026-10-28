// `ralphy trends niche report <niche>` (#576) — read-only. Every section
// states its n; a group below the minimum n says "insufficient data" instead
// of a claim (the #558 minimum-n rule). Multipliers, labels, and the
// copyability score are Ralphy's own estimates, never platform data.
//
// Personal data: the report carries public handles, public video URLs, and
// public metrics only. Captions and bios are not reproduced.

import { latestDigestLinks } from "../store/trends.js";
import {
  followerSeries,
  loadNicheMembers,
  loadNicheVideos,
  nicheRuns,
  type NicheDto,
  type NicheMemberDto,
  type NicheVideoDto,
} from "../store/trend-niches.js";
import { DAY_MS, HOUR_MS, SIZE_BANDS, median, type TrendPlatform } from "./math.js";
import { QUOTA_BANDS, SMALL_SIZE_BANDS, quotaBandFor, quotaStatus, rankCopyability, type CopyCandidate } from "./niche.js";
import { YOUTUBE_WATCH_SOURCE } from "./sources/youtube.js";

export const NICHE_REPORT_MIN_N = 20;
export const NICHE_REPORT_MIN_CREATORS = 5;
const HIT_LABELS = new Set(["breakout", "outlier", "strong"]);
const MATURE_HOURS = 168;

export interface NicheReportOptions {
  language?: string;
  platform?: TrendPlatform;
  minN: number;
  minCreators: number;
  top: number;
  noiseFloorViews?: number;
  /** Analysis window for dated videos (the dataset spec's 90-day backfill). */
  sinceDays: number;
  /** Rows per creator in the ranked lists (repeats still count as evidence). */
  maxPerCreator: number;
}

export const DEFAULT_NICHE_REPORT_OPTIONS: NicheReportOptions = { minN: NICHE_REPORT_MIN_N, minCreators: NICHE_REPORT_MIN_CREATORS, top: 20, sinceDays: 90, maxPerCreator: 2 };

/** Keep at most `max` rows per creator, in order. */
function capPerCreator<T>(rows: readonly T[], creatorOf: (row: T) => string, max: number): T[] {
  const seen = new Map<string, number>();
  return rows.filter((row) => {
    const key = creatorOf(row);
    const count = seen.get(key) ?? 0;
    if (count >= max) return false;
    seen.set(key, count + 1);
    return true;
  });
}

const round = (value: number | null, digits = 2): number | null => (value === null || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());

type VideoView = NicheVideoDto & { member: NicheMemberDto; ageHours: number | null; followersAtSnapshot: number | null };

function followersAt(series: Array<{ asOf: number; followers: number }>, at: number | null, fallback: number | null): number | null {
  if (at === null || series.length === 0) return fallback;
  let best: { distance: number; followers: number } | null = null;
  for (const point of series) {
    const distance = Math.abs(point.asOf - at);
    if (!best || distance < best.distance) best = { distance, followers: point.followers };
  }
  return best?.followers ?? fallback;
}

const isMatureScored = (video: VideoView) =>
  video.multiplier !== null && video.ageHours !== null && video.ageHours >= MATURE_HOURS && !video.flags.includes("thin") && !video.flags.includes("provisional");

function groupStats(videos: readonly VideoView[], overallHitRate: number | null, minN: number) {
  const n = videos.length;
  const creators = new Set(videos.map((video) => video.creatorId)).size;
  if (n < minN) return { n, creators, medianMultiplier: null, hitRate: null, lift: null, verdict: "insufficient data" as const };
  const hits = videos.filter((video) => video.label !== null && HIT_LABELS.has(video.label)).length;
  const hitRate = hits / n;
  const lift = overallHitRate && overallHitRate > 0 ? hitRate / overallHitRate - 1 : null;
  const verdict = lift === null ? "no baseline" : lift >= 0.15 ? "over" : lift <= -0.15 ? "under" : "in line";
  return { n, creators, medianMultiplier: round(median(videos.map((video) => video.multiplier!))), hitRate: round(hitRate, 3), lift: round(lift, 3), verdict };
}

function labelTable(videos: readonly VideoView[], axis: "format" | "hook", overallHitRate: number | null, minN: number) {
  const groups = new Map<string, VideoView[]>();
  for (const video of videos) {
    const label = video[axis];
    if (!label || label === "unknown") continue;
    (groups.get(label) ?? groups.set(label, []).get(label)!).push(video);
  }
  return [...groups.entries()]
    .map(([label, list]) => ({ label, ...groupStats(list, overallHitRate, minN) }))
    .sort((a, b) => (b.lift ?? -Infinity) - (a.lift ?? -Infinity) || b.n - a.n || a.label.localeCompare(b.label));
}

function videoRef(video: VideoView, now: number) {
  return {
    platform: video.platform,
    creator: video.member.handle ?? video.member.platformCreatorId,
    followers: video.followersAtSnapshot,
    sizeBand: video.member.sizeBand,
    subNiche: video.member.subNiche,
    url: video.url,
    postedAt: iso(video.postedAt),
    ageDays: video.postedAt === null ? null : round((now - video.postedAt) / DAY_MS, 1),
    views: video.views,
    viewsPrecision: video.viewsPrecision,
    multiplier: round(video.multiplier),
    label: video.label,
    format: video.format,
    hook: video.hook,
    videoId: video.id,
  };
}

export function buildNicheReport(input: { niche: NicheDto; options?: Partial<NicheReportOptions>; now: number }) {
  const options = { ...DEFAULT_NICHE_REPORT_OPTIONS, ...(input.options ?? {}) };
  const niche = input.niche;
  const now = input.now;
  const noiseFloor = options.noiseFloorViews ?? niche.settings.noiseFloorViews;
  const all = loadNicheMembers({ nicheId: niche.id });
  const inScope = all.filter((member) => (!options.language || member.language === options.language) && (!options.platform || member.platform === options.platform));
  const pendingUnknownLanguage = options.language ? all.filter((member) => member.status === "candidate" && member.language === null).length : 0;
  const keptAll = inScope.filter((member) => member.status === "kept");
  // Out-of-sample kept creators (above the stratified cap) stay stored but are not analysed.
  const outOfSample = keptAll.filter((member) => member.flags.includes("out-of-sample"));
  const kept = keptAll.filter((member) => !member.flags.includes("out-of-sample"));
  const main = kept.filter((member) => member.cohortGroup === "main" || member.cohortGroup === null);
  const negative = kept.filter((member) => member.cohortGroup === "negative");
  const anomaly = kept.filter((member) => member.cohortGroup === "anomaly");
  const memberById = new Map(kept.map((member) => [member.creatorId, member]));
  const series = followerSeries({ creatorIds: kept.map((member) => member.creatorId) });
  const videos: VideoView[] = loadNicheVideos({ creatorIds: kept.map((member) => member.creatorId) }).map((video) => {
    const member = memberById.get(video.creatorId)!;
    return {
      ...video,
      member,
      ageHours: video.postedAt === null || video.latestAsOf === null ? null : (video.latestAsOf - video.postedAt) / HOUR_MS,
      followersAtSnapshot: followersAt(series.get(video.creatorId) ?? [], video.latestAsOf, member.followers),
    };
  });
  const mainIds = new Set(main.map((member) => member.creatorId));
  const windowStart = now - options.sinceDays * DAY_MS;
  // Dated videos outside the analysis window are baseline history, not references.
  const inWindow = (video: VideoView) => video.postedAt === null || video.postedAt >= windowStart;
  const mainVideos = videos.filter((video) => mainIds.has(video.creatorId) && inWindow(video));
  const mature = mainVideos.filter(isMatureScored);
  const overallHits = mature.filter((video) => video.label !== null && HIT_LABELS.has(video.label)).length;
  const overallHitRate = mature.length > 0 ? overallHits / mature.length : null;
  const runs = nicheRuns({ workspaceId: niche.workspaceId, slug: niche.slug })
    .filter((run) => run.state === "succeeded" && run.response && run.response.stopReason !== "no-discovery")
    .map((run) => {
      const response = run.response!;
      const languages = Array.isArray(run.request?.languages) ? (run.request!.languages as unknown[]).join(",") : null;
      return {
        runId: run.runId,
        startedAt: iso(run.createdAt),
        languages,
        wallMinutes: typeof response.wallMs === "number" ? round(response.wallMs / 60_000, 1) : null,
        rounds: Array.isArray(response.rounds) ? response.rounds.length : null,
        stopReason: typeof response.stopReason === "string" ? response.stopReason : null,
        blocks: typeof response.blocks === "number" ? response.blocks : null,
      };
    })
    .filter((run) => !options.language || run.languages === null || run.languages.split(",").includes(options.language));

  // 1. Coverage
  const statusCounts: Record<string, number> = { kept: 0, dropped: 0, undetermined: 0, candidate: 0 };
  for (const member of inScope) if (!member.flags.includes("out-of-sample")) statusCounts[member.status] = (statusCounts[member.status] ?? 0) + 1;
  statusCounts.outOfSample = outOfSample.length;
  const keptByPlatformBand: Record<string, Record<string, number>> = {};
  for (const member of kept) {
    const row = keptByPlatformBand[member.platform] ?? (keptByPlatformBand[member.platform] = Object.fromEntries([...QUOTA_BANDS, "unknown"].map((band) => [band, 0])));
    const band = quotaBandFor(member.followers) ?? "unknown";
    row[band] = (row[band] ?? 0) + 1;
  }
  const dropReasons: Record<string, number> = {};
  for (const member of inScope.filter((entry) => entry.status === "dropped" || entry.status === "undetermined")) {
    const reason = `${member.status}:${member.gateReason ?? "unknown"}`;
    dropReasons[reason] = (dropReasons[reason] ?? 0) + 1;
  }
  const coverage = {
    creators: statusCounts,
    /** Candidates not judged yet (no language known), outside a language-scoped report. */
    pendingUnknownLanguage,
    groups: { main: main.length, negative: negative.length, anomaly: anomaly.length },
    keptByPlatformBand,
    quotas: quotaStatus(kept.map((member) => member.followers), niche.settings.targetCreators),
    gateReasons: dropReasons,
    videos: {
      listed: videos.length,
      dated: videos.filter((video) => video.postedAt !== null).length,
      scored: videos.filter((video) => video.multiplier !== null).length,
      matureScoredMain: mature.length,
      inWindowDatedMain: mainVideos.filter((video) => video.postedAt !== null).length,
      byPlatform: Object.fromEntries((["tiktok", "youtube"] as const).map((platform) => [platform, videos.filter((video) => video.platform === platform).length])),
    },
    discoveryRuns: runs,
  };

  // 2. What to copy (copyability ranking)
  const candidates: Array<CopyCandidate & { video: VideoView }> = mainVideos.map((video) => ({
    videoId: video.id,
    creatorId: video.creatorId,
    multiplier: video.multiplier,
    views: video.views,
    followers: video.followersAtSnapshot,
    sizeBand: video.member.sizeBand,
    format: video.format,
    hook: video.hook,
    thin: video.flags.includes("thin"),
    provisional: video.flags.includes("provisional"),
    video,
  }));
  const ranking = rankCopyability(candidates, { noiseFloorViews: noiseFloor });
  const topRanked = capPerCreator(ranking.ranked, (entry) => entry.candidate.creatorId, options.maxPerCreator).slice(0, options.top);
  const digests = latestDigestLinks(topRanked.map((entry) => entry.candidate.videoId));
  const excludedCounts: Record<string, number> = {};
  for (const entry of ranking.excluded) excludedCounts[entry.reason] = (excludedCounts[entry.reason] ?? 0) + 1;
  const whatToCopy = {
    status: ranking.ranked.length > 0 ? "ok" : "insufficient data",
    noiseFloorViews: noiseFloor,
    formula: "sizeWeight x (ln multiplier + 0.5 ln(1 + min(views/followers, 100))) x (replicationFactor + same-creator repeats)",
    ranked: ranking.ranked.length,
    excluded: excludedCounts,
    rankedCreators: new Set(ranking.ranked.map((entry) => entry.candidate.creatorId)).size,
    platforms: [...new Set(ranking.ranked.map((entry) => entry.candidate.video.platform))],
    items: topRanked.map((entry, index) => {
      const digest = digests.get(entry.candidate.videoId);
      return {
        rank: index + 1,
        score: entry.score,
        ...videoRef(entry.candidate.video, now),
        components: entry.components,
        digest: digest ? `${digest.refKind}:${digest.digestRef}` : null,
      };
    }),
  };

  // 3. Top outliers overall, per sub-niche, per size band
  const byMultiplier = [...mature].sort((a, b) => (b.multiplier ?? 0) - (a.multiplier ?? 0));
  const outliersOf = (list: VideoView[], limit: number) =>
    capPerCreator(list.filter((video) => video.label === "breakout" || video.label === "outlier"), (video) => video.creatorId, options.maxPerCreator).slice(0, limit).map((video) => videoRef(video, now));
  const subNiches = [...new Set(main.map((member) => member.subNiche ?? "general"))].sort();
  const thresholds = mature.find((video) => video.detail?.labelThresholds)?.detail?.labelThresholds ?? null;
  const topOutliers = {
    thresholds,
    overall: outliersOf(byMultiplier, 10),
    bySubNiche: Object.fromEntries(subNiches.map((sub) => [sub, outliersOf(byMultiplier.filter((video) => (video.member.subNiche ?? "general") === sub), 3)])),
    bySizeBand: Object.fromEntries(SIZE_BANDS.map((band) => [band, outliersOf(byMultiplier.filter((video) => video.member.sizeBand === band), 3)])),
  };

  // 4. Winning formats and hook types
  const labeled = { format: mature.filter((video) => video.format && video.format !== "unknown").length, hook: mature.filter((video) => video.hook && video.hook !== "unknown").length };
  const formats = {
    basis: "hit = calibrated label strong, outlier, or breakout; lift = label hit rate / niche hit rate - 1; mature (7 d+), non-thin, main-group videos",
    overallHitRate: round(overallHitRate, 3),
    n: mature.length,
    labelCoverage: { format: labeled.format, hook: labeled.hook },
    formats: labelTable(mature, "format", overallHitRate, options.minN),
    hooks: labelTable(mature, "hook", overallHitRate, options.minN),
  };

  // 5. Cadence and length of creators who grow (breakout proxy until follower history exists)
  const historyDays = (() => {
    let max = 0;
    for (const points of series.values()) if (points.length >= 2) max = Math.max(max, (points.at(-1)!.asOf - points[0]!.asOf) / DAY_MS);
    return max;
  })();
  const recent = (member: NicheMemberDto) => mainVideos.filter((video) => video.creatorId === member.creatorId && video.postedAt !== null && now - video.postedAt <= 30 * DAY_MS);
  const datedMain = main.filter((member) => member.platform !== "youtube");
  const growing = datedMain.filter((member) => recent(member).some((video) => video.label !== null && HIT_LABELS.has(video.label)));
  const growingIds = new Set(growing.map((member) => member.creatorId));
  const cadenceRow = (group: string, members: NicheMemberDto[]) => {
    if (members.length < options.minCreators) return { group, creators: members.length, medianPostsPerWeek: null, medianDurationSec: null, verdict: "insufficient data" };
    const perWeek = members.map((member) => (recent(member).length * 7) / 30);
    const durations = members.flatMap((member) => recent(member).map((video) => video.durationMs).filter((value): value is number => value !== null).map((value) => value / 1000));
    return { group, creators: members.length, medianPostsPerWeek: round(median(perWeek), 1), medianDurationSec: round(median(durations), 0), verdict: "ok" };
  };
  const growth = {
    basis: historyDays >= 14
      ? `follower history spans ${round(historyDays, 0)} days; growth proxy still uses breakouts until 60 days exist`
      : `proxy: creators with a strong-or-better video in the last 30 days (follower history spans ${round(historyDays, 1)} days; growth needs 14+)`,
    rows: [cadenceRow("breaking out (strong+ video in 30 d)", growing), cadenceRow("others", datedMain.filter((member) => !growingIds.has(member.creatorId)))],
  };

  // 6. Sub-niche saturation vs demand
  const subRows = subNiches.map((sub) => {
    const members = main.filter((member) => (member.subNiche ?? "general") === sub);
    const list = mature.filter((video) => (video.member.subNiche ?? "general") === sub);
    const label = sub === "general" ? "general (no dominant sub-niche)" : niche.taxonomy.subNiches.find((entry) => entry.slug === sub)?.label ?? sub;
    const creatorShare = main.length > 0 ? members.length / main.length : 0;
    if (members.length < options.minCreators || list.length < options.minN) {
      return { subNiche: sub, label, creators: members.length, creatorShare: round(creatorShare, 3), videos: list.length, medianMultiplier: null, hitRate: null, medianViewsPerFollower: null, gap: null, verdict: "insufficient data" };
    }
    const hits = list.filter((video) => video.label !== null && HIT_LABELS.has(video.label)).length;
    const hitRate = hits / list.length;
    const vpf = list.map((video) => (video.views !== null && video.followersAtSnapshot ? video.views / video.followersAtSnapshot : null)).filter((value): value is number => value !== null);
    const k = subNiches.length;
    const gap = overallHitRate && overallHitRate > 0 && creatorShare > 0 ? (hitRate / overallHitRate) / (creatorShare * k) : null;
    return {
      subNiche: sub,
      label,
      creators: members.length,
      creatorShare: round(creatorShare, 3),
      videos: list.length,
      medianMultiplier: round(median(list.map((video) => video.multiplier!))),
      hitRate: round(hitRate, 3),
      medianViewsPerFollower: round(median(vpf), 3),
      gap: round(gap, 2),
      verdict: gap === null ? "no baseline" : gap >= 1.25 ? "under-supplied" : gap <= 0.8 ? "saturated" : "balanced",
    };
  }).sort((a, b) => (b.gap ?? -Infinity) - (a.gap ?? -Infinity));
  const subNicheGaps = {
    basis: "gap = (sub-niche hit rate / niche hit rate) / (creator share x number of sub-niches); above 1 means more demand than supply",
    rows: subRows,
  };

  // 7. Entry formats for a new account (small creators)
  const small = mature.filter((video) => SMALL_SIZE_BANDS.has(video.member.sizeBand ?? ""));
  const smallHitRate = small.length > 0 ? small.filter((video) => video.label !== null && HIT_LABELS.has(video.label)).length / small.length : null;
  const entryRows = (["format", "hook"] as const).flatMap((axis) => labelTable(small, axis, smallHitRate, Math.max(5, Math.floor(options.minN / 2))).map((row) => {
    const list = small.filter((video) => video[axis] === row.label);
    const breakoutCreators = new Set(list.filter((video) => video.label !== null && HIT_LABELS.has(video.label)).map((video) => video.creatorId)).size;
    return { axis, ...row, smallCreatorsWithHit: breakoutCreators, replicated: breakoutCreators >= 2 };
  })).sort((a, b) => Number(b.replicated) - Number(a.replicated) || b.smallCreatorsWithHit - a.smallCreatorsWithHit || (b.hitRate ?? 0) - (a.hitRate ?? 0));
  const entryFormats = {
    basis: "seed / nano / micro creators only; replicated = a strong-or-better video for 2+ distinct small creators",
    n: small.length,
    smallHitRate: round(smallHitRate, 3),
    rows: entryRows,
  };

  // 8. Negative control group and anomalies
  const flagCounts = (members: NicheMemberDto[]) => {
    const out: Record<string, number> = {};
    for (const member of members) for (const flag of member.flags) out[flag] = (out[flag] ?? 0) + 1;
    return out;
  };
  const negativeGroup = {
    rules: "active, 6+ posts in 30 days, 75%+ of the 60-day window below the platform x niche x size cohort median, no video at 3x or a strong-or-better label, flat follower growth; size-matched to the kept creators",
    size: negative.length,
    shareOfKept: kept.length > 0 ? round(negative.length / kept.length, 3) : null,
    byBand: Object.fromEntries(QUOTA_BANDS.map((band) => [band, negative.filter((member) => quotaBandFor(member.followers) === band).length])),
    packagingWeak: negative.filter((member) => member.flags.includes("packaging-weak")).length,
    provisional: negative.some((member) => member.flags.includes("provisional")),
    creators: negative.slice(0, 15).map((member) => ({ platform: member.platform, creator: member.handle ?? member.platformCreatorId, followers: member.followers, flags: member.flags })),
  };
  const anomalies = { size: anomaly.length, flags: flagCounts(anomaly) };

  // 9. Digest links for the top 20 references
  const digestSection = {
    linked: whatToCopy.items.filter((item) => item.digest !== null).length,
    of: whatToCopy.items.length,
    howTo: "ralphy ref digest <url> writes a #557 bundle; ralphy trends link-digest <video> --ref <bundle> attaches it",
    items: whatToCopy.items.map((item) => ({ rank: item.rank, url: item.url, digest: item.digest })),
  };

  // 10. YouTube coverage
  const youtubeMembers = main.filter((member) => member.platform === "youtube");
  const youtubeVideos = mainVideos.filter((video) => video.platform === "youtube");
  const dated = youtubeVideos.filter((video) => video.postedAtSource === YOUTUBE_WATCH_SOURCE);
  const creatorMedian = new Map<string, number>();
  for (const member of youtubeMembers) {
    const values = youtubeVideos.filter((video) => video.creatorId === member.creatorId && video.latestSource !== YOUTUBE_WATCH_SOURCE).map((video) => video.views).filter((value): value is number => value !== null);
    if (values.length >= 8) creatorMedian.set(member.creatorId, median(values)!);
  }
  const youtube = {
    creators: youtubeMembers.length,
    videos: youtubeVideos.length,
    undated: youtubeVideos.filter((video) => video.postedAt === null).length,
    datedByWatchPage: dated.length,
    candidates: dated
      .map((video) => {
        const center = creatorMedian.get(video.creatorId) ?? null;
        return {
          ...videoRef(video, now),
          rawListingRatio: center && video.views !== null ? round(video.views / center, 1) : null,
          viewsPerFollower: video.views !== null && video.followersAtSnapshot ? round(video.views / video.followersAtSnapshot, 2) : null,
        };
      })
      .sort((a, b) => (b.rawListingRatio ?? 0) - (a.rawListingRatio ?? 0))
      .slice(0, options.top),
    lacks: [
      "post time for listing videos (channel Shorts tabs carry none without the YouTube Data API key), so YouTube videos are unscored: no multiplier, label, or copyability score",
      "likes, comments, and exact views in listings (views are rounded to 2-3 significant figures)",
      "duration in Shorts-tab listings (no length band)",
      "posting cadence and recency (activity unknown)",
      "the raw listing ratio above compares a dated candidate with the median of the creator's undated listing; it is a candidate filter, not the #556 score",
    ],
  };

  const notes = [
    "Multipliers, labels, and copyability scores are Ralphy's own estimates from creator-relative baselines, not platform data.",
    `Groups below the minimum n (${options.minN} videos, ${options.minCreators} creators) show "insufficient data" instead of a claim.`,
    "Videos come from the backfill cohort (first seen already mature); they set baselines and format distributions, never early-breakout predictions.",
  ];
  if (labeled.format < options.minN) notes.push(`Only ${labeled.format} mature videos carry a content-format label (rule pre-labels from titles; the LLM label pass was off), so format rows are thin.`);

  return {
    kind: "trend-niche-report" as const,
    niche: { slug: niche.slug, topic: niche.topic, languages: niche.languages, platforms: niche.platforms, seedSource: niche.seedSource, subNiches: niche.taxonomy.subNiches.map((sub) => sub.slug) },
    scope: { language: options.language ?? null, platform: options.platform ?? null },
    generatedAt: new Date(now).toISOString(),
    settings: { minN: options.minN, minCreators: options.minCreators, top: options.top, noiseFloorViews: noiseFloor, relevanceThreshold: niche.settings.relevanceThreshold, sinceDays: options.sinceDays, maxPerCreator: options.maxPerCreator },
    coverage,
    whatToCopy,
    topOutliers,
    formats,
    growth,
    subNicheGaps,
    entryFormats,
    negativeGroup,
    anomalies,
    digests: digestSection,
    youtube,
    notes,
  };
}

export type NicheReport = ReturnType<typeof buildNicheReport>;

// ─── Markdown ───────────────────────────────────────────────────────────────

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toLocaleString("en-US") : String(value);
  return String(value).replace(/\|/g, "/");
};

function table(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) return "_No rows._\n";
  return [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)].join("\n") + "\n";
}

export function renderNicheReportMarkdown(report: NicheReport, options: { title?: string; preface?: string } = {}): string {
  const lines: string[] = [];
  const scope = [report.scope.language ? report.scope.language.toUpperCase() : null, report.scope.platform].filter(Boolean).join(", ");
  lines.push(`# ${options.title ?? `Niche report: ${report.niche.topic}${scope ? ` (${scope})` : ""}`}`, "");
  if (options.preface) lines.push(options.preface, "");
  lines.push(`Generated ${report.generatedAt} by \`ralphy trends niche report ${report.niche.slug}${report.scope.language ? ` --lang ${report.scope.language}` : ""}\`. Seeds: ${report.niche.seedSource}. ${report.notes[0]}`, "");

  lines.push("## Coverage", "");
  const c = report.coverage;
  lines.push(table(["Status", "Creators"], Object.entries(c.creators)));
  lines.push(`Groups among kept creators: main ${c.groups.main}, negative control ${c.groups.negative}, anomaly ${c.groups.anomaly}.`, "");
  lines.push(table(["Platform", ...QUOTA_BANDS, "unknown"], Object.entries(c.keptByPlatformBand).map(([platform, bands]) => [platform, ...QUOTA_BANDS.map((band) => bands[band] ?? 0), bands.unknown ?? 0])));
  lines.push(table(["Quota band", "Quota", "Kept", "Deficit"], c.quotas.map((row) => [row.band, row.quota, row.kept, row.deficit])));
  lines.push(`Videos: ${cell(c.videos.listed)} listed (TikTok ${cell(c.videos.byPlatform.tiktok)}, YouTube ${cell(c.videos.byPlatform.youtube)}), ${cell(c.videos.dated)} dated, ${cell(c.videos.scored)} scored. Analysis window: the last ${report.settings.sinceDays} days, ${cell(c.videos.inWindowDatedMain)} dated main-group videos, ${cell(c.videos.matureScoredMain)} of them mature (7 d+) with a non-thin baseline.`, "");
  if (c.discoveryRuns.length > 0) lines.push(table(["Discovery run", "Languages", "Wall (min)", "Rounds", "Stop reason", "Blocks"], c.discoveryRuns.map((run) => [run.startedAt, run.languages, run.wallMinutes, run.rounds, run.stopReason, run.blocks])));
  if (Object.keys(c.gateReasons).length > 0) lines.push(table(["Gate outcome", "Creators"], Object.entries(c.gateReasons).sort((a, b) => b[1] - a[1])));

  lines.push("## What to copy (copyability ranking)", "");
  const w = report.whatToCopy;
  lines.push(`Score = ${w.formula}. Noise floor ${cell(w.noiseFloorViews)} views. ${cell(w.ranked)} videos from ${cell(w.rankedCreators)} creators ranked (platforms: ${w.platforms.join(", ") || "none"}); at most ${report.settings.maxPerCreator} rows per creator below. Excluded: ${Object.entries(w.excluded).map(([reason, n]) => `${reason} ${n}`).join(", ") || "none"}.`, "");
  if (w.items.length === 0) lines.push("Insufficient data: no main-group video clears the noise floor above its creator's baseline.", "");
  else {
    lines.push(table(
      ["#", "Score", "Creator", "Size", "Sub-niche", "X", "Views", "Views/follower", "Size weight", "Replication (small creators with a hit)", "Factor", "Format", "Hook", "Video"],
      w.items.map((item) => [
        item.rank, item.score, `${item.platform}:@${String(item.creator).replace(/^@/, "")}`, item.sizeBand, item.subNiche, `${item.components.multiplier}x`, item.views,
        item.components.viewsPerFollower, item.components.sizeWeight,
        `format ${item.components.replication.format.label ?? "unlabeled"} (${item.components.replication.format.smallCreators}); hook ${item.components.replication.hook.label ?? "unlabeled"} (${item.components.replication.hook.smallCreators})${item.components.replication.sameCreatorRepeats ? `; +${item.components.replication.sameCreatorRepeats} same creator` : ""}`,
        item.components.replicationFactor, item.format, item.hook, item.url,
      ]),
    ));
  }

  lines.push("## Top outliers", "");
  const t = report.topOutliers;
  if (t.thresholds) {
    const thresholds = t.thresholds as { group?: string; basis?: string; breakout?: number; outlier?: number; strong?: number };
    lines.push(`Label thresholds (${cell(thresholds.basis)}, ${cell(thresholds.group)}): breakout ${cell(thresholds.breakout)}x, outlier ${cell(thresholds.outlier)}x with z >= 2, strong ${cell(thresholds.strong)}x.`, "");
  }
  const outlierRows = (list: ReturnType<typeof videoRef>[]) => list.map((video) => [`${video.platform}:@${String(video.creator).replace(/^@/, "")}`, video.sizeBand, video.subNiche, `${video.multiplier}x`, video.label, video.views, video.ageDays, video.url]);
  lines.push("### Overall", "", t.overall.length > 0 ? table(["Creator", "Size", "Sub-niche", "X", "Label", "Views", "Age (d)", "Video"], outlierRows(t.overall)) : "Insufficient data: no breakout or outlier among mature main-group videos.\n");
  lines.push("### By sub-niche", "");
  for (const [sub, list] of Object.entries(t.bySubNiche)) lines.push(`**${sub}**`, "", list.length > 0 ? table(["Creator", "Size", "Sub-niche", "X", "Label", "Views", "Age (d)", "Video"], outlierRows(list)) : "Insufficient data.\n");
  lines.push("### By size band", "");
  for (const [band, list] of Object.entries(t.bySizeBand)) lines.push(`**${band}**`, "", list.length > 0 ? table(["Creator", "Size", "Sub-niche", "X", "Label", "Views", "Age (d)", "Video"], outlierRows(list)) : "Insufficient data.\n");

  lines.push("## Winning formats and hook types", "");
  const f = report.formats;
  lines.push(`${f.basis}. Niche hit rate ${cell(f.overallHitRate)} over ${cell(f.n)} videos; labeled: format ${cell(f.labelCoverage.format)}, hook ${cell(f.labelCoverage.hook)}.`, "");
  const statRows = (rows: typeof f.formats) => rows.map((row) => [row.label, row.n, row.creators, row.medianMultiplier, row.hitRate, row.lift, row.verdict]);
  lines.push("### Formats", "", table(["Format", "n", "Creators", "Median X", "Hit rate", "Lift", "Verdict"], statRows(f.formats)));
  lines.push("### Hook types", "", table(["Hook", "n", "Creators", "Median X", "Hit rate", "Lift", "Verdict"], statRows(f.hooks)));

  lines.push("## Cadence and length of creators who grow", "", `${report.growth.basis}.`, "");
  lines.push(table(["Group", "Creators", "Median posts / week", "Median length (s)", "Verdict"], report.growth.rows.map((row) => [row.group, row.creators, row.medianPostsPerWeek, row.medianDurationSec, row.verdict])));

  lines.push("## Sub-niche saturation vs demand", "", `${report.subNicheGaps.basis}.`, "");
  lines.push(table(["Sub-niche", "Creators", "Share", "Videos", "Median X", "Hit rate", "Median views/follower", "Gap", "Verdict"], report.subNicheGaps.rows.map((row) => [row.label, row.creators, row.creatorShare, row.videos, row.medianMultiplier, row.hitRate, row.medianViewsPerFollower, row.gap, row.verdict])));

  lines.push("## Entry formats for a new account", "", `${report.entryFormats.basis}. Small-creator videos ${cell(report.entryFormats.n)}, hit rate ${cell(report.entryFormats.smallHitRate)}.`, "");
  lines.push(table(["Axis", "Label", "n", "Small creators with a hit", "Replicated", "Hit rate", "Lift", "Verdict"], report.entryFormats.rows.map((row) => [row.axis, row.label, row.n, row.smallCreatorsWithHit, row.replicated ? "yes" : "no", row.hitRate, row.lift, row.verdict])));

  lines.push("## Negative control group", "", `Rule: ${report.negativeGroup.rules}.`, "");
  lines.push(`Size ${report.negativeGroup.size} (${cell(report.negativeGroup.shareOfKept)} of kept), packaging-weak ${report.negativeGroup.packagingWeak}, ${report.negativeGroup.provisional ? "provisional (selected from backfill; follower growth and the 60-day window are re-checked once 60 days of snapshots exist)" : "confirmed"}.`, "");
  lines.push(table(["Quota band", "Negative creators"], Object.entries(report.negativeGroup.byBand)));
  if (report.negativeGroup.creators.length > 0) lines.push(table(["Creator", "Followers", "Flags"], report.negativeGroup.creators.map((row) => [`${row.platform}:@${String(row.creator).replace(/^@/, "")}`, row.followers, row.flags.join(", ")])));
  lines.push(`Anomaly accounts kept out of both groups: ${report.anomalies.size} (${Object.entries(report.anomalies.flags).map(([flag, n]) => `${flag} ${n}`).join(", ") || "none"}).`, "");

  lines.push("## Digests for the top references", "", `${report.digests.linked} of ${report.digests.of} top references have a #557 digest. ${report.digests.howTo}.`, "");
  lines.push(table(["#", "Video", "Digest"], report.digests.items.map((item) => [item.rank, item.url, item.digest ?? "not yet"])));

  lines.push("## YouTube coverage", "");
  const y = report.youtube;
  lines.push(`${y.creators} kept main-group channels, ${y.videos} listed Shorts (${y.undated} undated), ${y.datedByWatchPage} dated through the watch page (Tier-1 budget).`, "");
  if (y.candidates.length > 0) lines.push(table(["Creator", "Size", "Raw listing ratio", "Views", "Views/follower", "Age (d)", "Video"], y.candidates.map((row) => [`youtube:@${String(row.creator).replace(/^@/, "")}`, row.sizeBand, row.rawListingRatio, row.views, row.viewsPerFollower, row.ageDays, row.url])));
  lines.push("What YouTube coverage lacks without the Data API key:", "", ...y.lacks.map((line) => `- ${line}`), "");

  lines.push("## Notes", "", ...report.notes.map((line) => `- ${line}`), "");
  return lines.join("\n");
}
