// `ralphy trends <verb>` — the creator-first trend corpus (#556).
//
//   trends ingest  --source <s> --seed <v> [--niche <n>]   discover + list + label + score
//   trends refresh [--due]                                  re-list creators by tier cadence
//   trends score   [--refit]                                recompute outlier scores
//   trends label   [--llm]                                  cohort labels (LLM off by default)
//   trends top     --niche <n> --since 14d --by outlier     ranked videos
//   trends creator <handle|id>                              one creator's baseline + videos
//   trends watch   add | list | remove                      discovery seeds
//   trends status                                           counts, runs, breakers, spend
//   trends link-digest <video> --ref <bundle|doc>           attach a #557 digest
//
// Every verb takes an explicit global `--workspace <id>` (the corpus
// Workspace). Free sources run logged out with no cookies; paid Apify sources
// run only with `--paid` and a daily cap. Scores are Ralphy's own estimates,
// never platform data.

import { Command } from "commander";
import path from "node:path";
import { resolveCommandContext } from "../lib/context.js";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import { apifyAvailable, apifyRunActorDetailed } from "../lib/providers/apify.js";
import { youtubeAnalyticsAvailable, youtubeVideoDetails } from "../lib/providers/youtube-analytics.js";
import { callLLM } from "../lib/providers/llm.js";
import {
  countUndatedVideos,
  creatorDetail,
  effectiveTrendLabels,
  findTrendCreators,
  findTrendVideo,
  latestDigestLinks,
  linkTrendDigest,
  listWatchlists,
  queryTrendTop,
  recentTrendRuns,
  setWatchlistActive,
  soundKey,
  trendApifySpend,
  trendCounts,
  trendingSoundKeys,
  upsertWatchlist,
  type TrendVideoDto,
  type WatchlistKind,
} from "../lib/store/trends.js";
import { BREAKER_COOLDOWN_MS, openTrip } from "../lib/trends/breaker.js";
import { isNiche, NICHES } from "../lib/trends/cohorts.js";
import {
  LISTING_SOURCE_BY_PLATFORM,
  TREND_SOURCES,
  currentCurves,
  ingest,
  isTrendSource,
  labelPass,
  refresh,
  scorePass,
  type IngestSummary,
  type RefreshSummary,
  type TrendDeps,
  type TrendPassSummary,
} from "../lib/trends/ingest.js";
import { DAY_MS, HOUR_MS, MATURITY_PRIORS, SIZE_BANDS, TREND_PLATFORMS, isTrendPlatform, multiplierBand, type TrendPlatform } from "../lib/trends/math.js";
import { PAID_ACTORS } from "../lib/trends/sources/paid.js";
import { capturePageXhr } from "../lib/trends/sources/tiktok.js";
import { runYtdlp, ytdlpAvailable } from "../lib/trends/sources/ytdlp.js";
import { YOUTUBE_API_SOURCE } from "../lib/trends/sources/youtube.js";

const SCORE_NOTE = "Multipliers, z scores, composites, and labels are Ralphy's own estimates from creator-relative baselines, not platform data.";
const WATCH_KINDS: readonly WatchlistKind[] = ["hashtag", "keyword", "sound", "explore-category", "creator", "related"];

export function trendsCmd(): Command {
  const cmd = new Command("trends").description(
    "Creator-first trend corpus (#556): ingest free logged-out sources (TikTok creator listings + Explore, YouTube Shorts hashtag/channel tabs), refresh by checkpoint, score creator-relative outliers, and query top videos. Requires the global --workspace <id>.",
  );

  cmd
    .command("ingest")
    .description("Discover creators from a source, list each creator's recent videos, label, and score. Idempotent: re-runs upsert on platform ids and add no snapshot rows inside the same checkpoint bucket.")
    .requiredOption("--source <source>", `Source: ${TREND_SOURCES.join(" | ")}`)
    .option("--seed <value...>", "Seed values: Explore category (Technology), sound URL/id, hashtag (aitools), keyword, TikTok secUid, YouTube channel id")
    .option("--niche <niche>", `Seed niche for discovered creators: ${NICHES.join(" | ")}`)
    .option("--per-creator <n>", "Videos per creator listing", "60")
    .option("--max-creators <n>", "Creators to list in this pass", "200")
    .option("--concurrency <n>", "Parallel listings", "2")
    .option("--depth <n>", "Discovery depth (Explore scrolls, hashtag/search entries)", "40")
    .option("--budget <n>", "Request budget per source for this pass", "1000")
    .option("--cadence-hours <n>", "Watchlist re-discovery cadence", "24")
    .option("--discover-only", "Stop after discovery (no creator listing)")
    .option("--paid", "Allow paid Apify sources (requires --apify-daily-cap-usd)")
    .option("--apify-daily-cap-usd <usd>", "Hard cap per actor per UTC day for paid sources")
    .option("--llm", "Also run LLM cohort labels through callLLM() (default off)")
    .option("--llm-limit <n>", "Max videos the LLM labels in this pass", "500")
    .option("--refit", "Refit the maturity curve from longitudinal snapshots before scoring")
    .option("--no-youtube-api", "Do not use the YouTube Data API connector even when configured")
    .option("--quiet-progress", "Suppress progress events on stderr")
    .action(async (opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends ingest");
      if (!isTrendSource(opts.source)) raiseError("E_FLAG_UNKNOWN", { flag: "source", value: opts.source, allowed: TREND_SOURCES.join(", "), verb: "trends ingest" });
      const seeds = (opts.seed as string[] | undefined) ?? [];
      if (seeds.length === 0) raiseError("E_FLAG_MISSING", { flag: "seed", verb: "trends ingest" });
      const niche = nicheOf(opts.niche, "trends ingest");
      const paid = paidOf(opts, opts.source.startsWith("apify-"), "trends ingest");
      const deps = liveDeps(opts);
      const summary = await ingest({
        workspaceId,
        source: opts.source,
        seeds,
        niche,
        perCreator: positiveInt(opts.perCreator, "per-creator", "trends ingest"),
        maxCreators: positiveInt(opts.maxCreators, "max-creators", "trends ingest"),
        concurrency: positiveInt(opts.concurrency, "concurrency", "trends ingest"),
        discoveryDepth: positiveInt(opts.depth, "depth", "trends ingest"),
        budget: positiveInt(opts.budget, "budget", "trends ingest"),
        cadenceHours: positiveInt(opts.cadenceHours, "cadence-hours", "trends ingest"),
        paid,
        discoverOnly: opts.discoverOnly === true,
      }, deps, { llm: opts.llm === true, llmLimit: positiveInt(opts.llmLimit, "llm-limit", "trends ingest"), refit: opts.refit === true });
      out(passReport("trend-ingest", summary));
    });

  cmd
    .command("refresh")
    .description("Re-list creators by tier cadence (hot 6 h, active daily, inactive weekly, dormant monthly), re-run due watchlists for new creators, then label and score. Headless; stops a source when its breaker trips.")
    .option("--due", "Only creators whose next listing time has passed (default: every non-excluded creator)")
    .option("--no-discover", "Skip due watchlist discovery")
    .option("--platform <platform...>", `Platforms: ${TREND_PLATFORMS.join(" | ")}`)
    .option("--per-creator <n>", "Videos per creator listing", "30")
    .option("--max-creators <n>", "Due creators to list in this pass", "1000")
    .option("--max-new-creators <n>", "Never-listed creators to list in this pass", "30")
    .option("--concurrency <n>", "Parallel listings", "2")
    .option("--depth <n>", "Discovery depth for due watchlists", "40")
    .option("--budget <n>", "Request budget per source for this pass", "2000")
    .option("--paid", "Allow paid Apify sources (requires --apify-daily-cap-usd)")
    .option("--apify-daily-cap-usd <usd>", "Hard cap per actor per UTC day for paid sources")
    .option("--llm", "Also run LLM cohort labels (default off)")
    .option("--llm-limit <n>", "Max videos the LLM labels in this pass", "500")
    .option("--refit", "Force a maturity-curve refit (otherwise monthly)")
    .option("--no-youtube-api", "Do not use the YouTube Data API connector even when configured")
    .option("--quiet-progress", "Suppress progress events on stderr")
    .action(async (opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends refresh");
      const platforms = platformsOf(opts.platform, "trends refresh");
      const deps = liveDeps(opts);
      const summary = await refresh({
        workspaceId,
        dueOnly: opts.due === true,
        discover: opts.discover !== false,
        platforms,
        perCreator: positiveInt(opts.perCreator, "per-creator", "trends refresh"),
        maxCreators: positiveInt(opts.maxCreators, "max-creators", "trends refresh"),
        maxNewCreators: nonNegativeInt(opts.maxNewCreators, "max-new-creators", "trends refresh"),
        concurrency: positiveInt(opts.concurrency, "concurrency", "trends refresh"),
        discoveryDepth: positiveInt(opts.depth, "depth", "trends refresh"),
        budget: positiveInt(opts.budget, "budget", "trends refresh"),
        paid: paidOf(opts, false, "trends refresh"),
      }, deps, { llm: opts.llm === true, llmLimit: positiveInt(opts.llmLimit, "llm-limit", "trends refresh"), refit: opts.refit === true });
      out(passReport("trend-refresh", summary));
    });

  cmd
    .command("score")
    .description("Recompute outlier scores, creator baselines, and cohort baselines for the corpus Workspace")
    .option("--refit", "Refit the maturity curve from longitudinal snapshots first")
    .action((opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends score");
      const pass = scorePass({ workspaceId, now: Date.now(), refit: opts.refit === true });
      out({ kind: "trend-score", workspaceId, runId: pass.runId, counts: pass.counts, curves: pass.curves, notes: pass.notes, scoreNote: SCORE_NOTE });
    });

  cmd
    .command("label")
    .description("Write deterministic cohort labels; with --llm also classify format / hook through callLLM() (labels below 0.6 confidence stay unknown)")
    .option("--llm", "Run the LLM pass (default off)")
    .option("--limit <n>", "Max videos the LLM labels", "500")
    .option("--model <id>", "LLM model for labels (default google/gemini-2.5-flash)")
    .action(async (opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends label");
      const deps = liveDeps({ llm: opts.llm === true, quietProgress: true, youtubeApi: false, network: false });
      const pass = await labelPass({ workspaceId, deps, llm: opts.llm === true, llmLimit: positiveInt(opts.limit, "limit", "trends label"), ...(opts.model ? { llmModel: String(opts.model) } : {}) });
      out({ kind: "trend-label", workspaceId, runId: pass.runId, counts: pass.counts, notes: pass.notes });
    });

  cmd
    .command("top")
    .description("Ranked corpus videos: multiplier vs the creator's rolling median, composite score, label and flags, latest metrics with precision, cohort labels, and a digest link when one exists")
    .option("--niche <niche...>", "Creator niche(s), e.g. ai-tools tech-tips")
    .option("--since <age>", "Posted within this window: 14d, 72h, 4w", "14d")
    .option("--by <rank>", "Rank by outlier | views | momentum", "outlier")
    .option("--platform <platform>", `Platform: ${TREND_PLATFORMS.join(" | ")}`)
    .option("--format <format>", "Format key (tiktok-video, yt-short, ig-reel) or content-format label (talking-head, listicle, ...)")
    .option("--size-band <band>", `Creator size band: ${SIZE_BANDS.join(" | ")}`)
    .option("--label <label>", "Only this outlier label: breakout | outlier | strong | normal | under")
    .option("--include-thin", "Also rank videos whose creator baseline is thin (fewer than 8 earlier same-format videos)")
    .option("--limit <n>", "Rows", "20")
    .action((opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends top");
      const niches = (opts.niche as string[] | undefined)?.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
      for (const niche of niches ?? []) nicheOf(niche, "trends top");
      if (!["outlier", "views", "momentum"].includes(opts.by)) raiseError("E_FLAG_UNKNOWN", { flag: "by", value: opts.by, allowed: "outlier, views, momentum", verb: "trends top" });
      const platform = opts.platform === undefined ? undefined : platformOf(opts.platform, "trends top");
      if (opts.sizeBand !== undefined && !(SIZE_BANDS as readonly string[]).includes(opts.sizeBand)) {
        raiseError("E_FLAG_UNKNOWN", { flag: "size-band", value: opts.sizeBand, allowed: SIZE_BANDS.join(", "), verb: "trends top" });
      }
      const sinceMs = durationMs(opts.since, "since", "trends top");
      const now = Date.now();
      const formatKey = typeof opts.format === "string" && ["tiktok-video", "yt-short", "ig-reel"].includes(opts.format) ? opts.format : undefined;
      const limit = positiveInt(opts.limit, "limit", "trends top");
      let rows = queryTrendTop({
        workspaceId,
        ...(niches && niches.length > 0 ? { niches } : {}),
        since: now - sinceMs,
        by: opts.by,
        ...(platform ? { platform } : {}),
        ...(formatKey ? { formatKey } : {}),
        ...(typeof opts.format === "string" && !formatKey ? { contentFormat: opts.format } : {}),
        ...(opts.sizeBand ? { sizeBand: opts.sizeBand } : {}),
        includeThin: opts.includeThin === true,
        limit: opts.label ? Math.min(500, limit * 10) : limit,
      });
      if (opts.label) rows = rows.filter((row) => row.score.label === opts.label).slice(0, limit);
      const undated = countUndatedVideos({ workspaceId, ...(niches && niches.length > 0 ? { niches } : {}), ...(platform ? { platform } : {}) });
      out({
        kind: "trend-top",
        workspaceId,
        niches: niches ?? [],
        since: opts.since,
        by: opts.by,
        scoreNote: SCORE_NOTE,
        count: rows.length,
        notes: undated > 0
          ? [`${undated} video(s) in scope have no post time (YouTube Shorts tabs without the YouTube Data API connector) and are not ranked; configure YOUTUBE_API_KEY to date and score them`]
          : [],
        videos: videoRows(workspaceId, rows, now),
      });
    });

  cmd
    .command("creator <ref>")
    .description("One creator: follower history, cached baselines (log scale), counts, and recent videos with scores. <ref> is a handle, platform creator id, or tcreator id")
    .option("--limit <n>", "Recent videos", "30")
    .action((ref: string, opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends creator");
      const matches = findTrendCreators({ workspaceId, ref });
      if (matches.length === 0) raiseError("E_NOT_FOUND", { kind: "trend creator", id: ref });
      if (matches.length > 1) {
        out({ kind: "trend-creator-matches", ref, matches: matches.map((creator) => ({ id: creator.id, platform: creator.platform, handle: creator.handle, platformCreatorId: creator.platformCreatorId })) });
        return;
      }
      const creator = matches[0]!;
      const detail = creatorDetail({ workspaceId, creatorId: creator.id, limit: positiveInt(opts.limit, "limit", "trends creator") });
      const now = Date.now();
      out({
        kind: "trend-creator",
        creator: {
          ...creator,
          lastListedAt: iso(creator.lastListedAt),
          nextListAt: iso(creator.nextListAt),
          lastPostedAt: iso(creator.lastPostedAt),
        },
        counts: detail.counts,
        baselines: detail.baselines.map((row) => ({
          formatKey: row.formatKey,
          metric: row.metric,
          medianValue: Math.round(Math.expm1(row.medianLog)),
          medianLog: row.medianLog,
          scale: row.madLog,
          n: row.n,
          computedAt: iso(row.computedAt),
        })),
        followerHistory: detail.followerHistory.map((row) => ({ ...row, asOf: iso(row.asOf) })),
        scoreNote: SCORE_NOTE,
        videos: videoRows(workspaceId, detail.videos, now),
      });
    });

  const watch = cmd.command("watch").description("Discovery seeds (watchlists): Explore categories, sounds, hashtags, keywords, creators");
  watch
    .command("add")
    .description("Add or reactivate a watchlist seed")
    .requiredOption("--platform <platform>", `Platform: ${TREND_PLATFORMS.join(" | ")}`)
    .requiredOption("--kind <kind>", `Kind: ${WATCH_KINDS.join(" | ")}`)
    .requiredOption("--value <value>", "Seed value (category name, sound URL, hashtag, keyword, creator id)")
    .requiredOption("--source <source>", `Source that serves it: ${TREND_SOURCES.join(" | ")}`)
    .option("--niche <niche>", "Seed niche")
    .option("--cadence-hours <n>", "Re-discovery cadence", "24")
    .action((opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends watch add");
      const platform = platformOf(opts.platform, "trends watch add");
      if (!WATCH_KINDS.includes(opts.kind)) raiseError("E_FLAG_UNKNOWN", { flag: "kind", value: opts.kind, allowed: WATCH_KINDS.join(", "), verb: "trends watch add" });
      if (!isTrendSource(opts.source)) raiseError("E_FLAG_UNKNOWN", { flag: "source", value: opts.source, allowed: TREND_SOURCES.join(", "), verb: "trends watch add" });
      const watchlist = upsertWatchlist({
        workspaceId,
        platform,
        kind: opts.kind,
        value: String(opts.value).replace(/^#/, ""),
        source: opts.source,
        niche: nicheOf(opts.niche, "trends watch add"),
        cadenceHours: positiveInt(opts.cadenceHours, "cadence-hours", "trends watch add"),
      });
      out({ kind: "trend-watchlist", watchlist: { ...watchlist, lastRunAt: iso(watchlist.lastRunAt), createdAt: iso(watchlist.createdAt), updatedAt: iso(watchlist.updatedAt) } });
    });
  watch
    .command("list")
    .description("List watchlist seeds")
    .option("--all", "Include deactivated seeds")
    .action((opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends watch list");
      out(listWatchlists({ workspaceId, includeInactive: opts.all === true }).map((row) => ({
        id: row.id,
        platform: row.platform,
        kind: row.kind,
        value: row.value,
        source: row.source,
        niche: row.niche,
        cadenceHours: row.cadenceHours,
        active: row.active,
        lastRunAt: iso(row.lastRunAt),
      })));
    });
  watch
    .command("remove <ref>")
    .description("Deactivate a watchlist seed by id or value (history and provenance stay)")
    .action((ref: string, _opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends watch remove");
      try {
        const row = setWatchlistActive({ workspaceId, ref, active: false });
        out({ kind: "trend-watchlist", watchlist: { ...row, lastRunAt: iso(row.lastRunAt), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) } });
      } catch {
        raiseError("E_NOT_FOUND", { kind: "trend watchlist", id: ref });
      }
    });

  cmd
    .command("status")
    .description("Corpus counts, last run per source, breaker state, YouTube API state, and Apify spend (today and to date)")
    .action((_opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends status");
      out(statusReport(workspaceId, Date.now()));
    });

  cmd
    .command("link-digest <video>")
    .description("Attach a #557 reference digest to a corpus video: a bundle directory (relative to the data root) or a Document id")
    .requiredOption("--ref <ref>", "Digest bundle directory or doc_<uuid>")
    .action((videoRef: string, opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends link-digest");
      const video = findTrendVideo({ workspaceId, ref: videoRef });
      if (!video) raiseError("E_NOT_FOUND", { kind: "trend video", id: videoRef });
      const ref = String(opts.ref);
      const isDocument = /^doc_[0-9a-f-]{36}$/.test(ref);
      let digestRef = ref;
      if (!isDocument) {
        const root = path.resolve(ralphDir());
        const absolute = path.resolve(ref);
        const relative = path.relative(root, absolute);
        if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
          raiseError("E_INPUT_INVALID", { field: "ref", detail: "a digest bundle must live inside the data root (or pass a doc_ id)", verb: "trends link-digest" });
        }
        digestRef = relative.split(path.sep).join("/");
      }
      const link = linkTrendDigest({ workspaceId, videoId: video.id, refKind: isDocument ? "document" : "bundle", digestRef });
      out({ kind: "trend-digest-link", ...link, createdAt: iso(link.createdAt) });
    });

  return cmd;
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function iso(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : null;
}

const round = (value: number | null, digits = 2) => (value === null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

export function videoRows(workspaceId: string, rows: TrendVideoDto[], now: number) {
  const labels = effectiveTrendLabels(rows.map((row) => row.id));
  const digests = latestDigestLinks(rows.map((row) => row.id));
  const trending = trendingSoundKeys({ workspaceId, since: now - 7 * DAY_MS, minVideos: 20 });
  return rows.map((row, index) => {
    const cohort = labels.get(row.id) ?? {};
    const pick = (axis: string) => cohort[axis]?.label ?? null;
    const key = soundKey(row.sound);
    const digest = digests.get(row.id);
    return {
      rank: index + 1,
      platform: row.platform,
      creator: row.creator.handle ?? row.creator.displayName ?? row.creator.id,
      followers: row.creator.followers,
      title: row.title ? Array.from(row.title).slice(0, 90).join("") : null,
      url: row.url,
      postedAt: iso(row.postedAt),
      ageDays: row.postedAt === null ? null : round((now - row.postedAt) / DAY_MS, 1),
      views: row.latest.views,
      viewsPrecision: row.latest.viewsPrecision,
      likes: row.latest.likes,
      comments: row.latest.comments,
      shares: row.latest.shares,
      saves: row.latest.saves,
      metricsAsOf: iso(row.latest.asOf),
      multiplier: round(row.score.multiplier),
      band: row.score.multiplier === null ? null : multiplierBand(row.score.multiplier),
      composite: round(row.score.composite),
      viewsZ: round(row.score.z),
      label: row.score.label,
      flags: [...row.score.flags, ...(key && trending.has(key) ? ["trending-sound"] : []), ...(row.isAd ? ["ad"] : [])],
      mode: row.score.mode,
      momentum: round(row.score.momentum),
      cohort: {
        niche: pick("niche") ?? row.creator.niche,
        format: pick("format"),
        hook: pick("hook"),
        length: pick("length_band"),
        size: pick("size_band") ?? row.creator.sizeBand,
        language: pick("language"),
        audio: pick("audio"),
      },
      discoveredVia: row.discoveredVia,
      digest: digest ? `${digest.refKind}:${digest.digestRef} (v${digest.digestVersion})` : null,
      id: row.id,
    };
  });
}

function passReport(kind: "trend-ingest" | "trend-refresh", summary: IngestSummary | RefreshSummary) {
  return {
    kind,
    workspaceId: summary.workspaceId,
    ...("source" in summary ? { source: summary.source, niche: summary.niche } : { dueOnly: summary.dueOnly }),
    startedAt: iso(summary.startedAt),
    wallSeconds: round(summary.wallMs / 1000, 1),
    passes: summary.passes.map((pass: TrendPassSummary) => ({
      kind: pass.kind,
      source: pass.source,
      runId: pass.runId,
      requests: pass.requests,
      breaker: pass.breaker.state,
      breakerReason: pass.breaker.reason,
      counts: pass.counts,
      notes: pass.notes,
      ...(pass.costUsd !== undefined ? { costUsd: pass.costUsd } : {}),
    })),
    totals: summary.totals,
    skipped: summary.skipped,
    scoreNote: SCORE_NOTE,
  };
}

export function statusReport(workspaceId: string, now: number) {
  const counts = trendCounts({ workspaceId, now });
  const runs = recentTrendRuns({ workspaceId, limit: 500 });
  const lastBySource = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    const key = `${run.kind}:${run.source ?? "-"}`;
    if (!lastBySource.has(key)) lastBySource.set(key, run);
  }
  const sources = [...new Set([...Object.values(LISTING_SOURCE_BY_PLATFORM), "tiktok-explore", "tiktok-sound", "youtube-hashtag", "youtube-search", YOUTUBE_API_SOURCE, ...Object.keys(PAID_ACTORS)])];
  const breakers = sources.map((source) => {
    const trip = openTrip(runs, source, now, BREAKER_COOLDOWN_MS);
    return { source, state: trip ? "open (cooling down)" : "closed", reason: trip?.reason ?? null, retryAfter: iso(trip?.retryAfter ?? null) };
  });
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const curves = currentCurves(workspaceId);
  return {
    kind: "trend-status",
    workspaceId,
    creators: counts.creators,
    videos: counts.videos,
    niches: counts.niches,
    snapshots: counts.snapshots,
    outlierLabels: counts.labels,
    cohortLabels: counts.cohortLabels,
    dueCreators: counts.dueCreators,
    lastRuns: [...lastBySource.values()].map((run) => {
      const response = run.response as { counts?: Record<string, number>; breaker?: { state?: string; reason?: string | null } } | null;
      return {
        kind: run.kind,
        source: run.source,
        state: run.state,
        at: iso(run.createdAt),
        seconds: run.endedAt === null ? null : round((run.endedAt - run.createdAt) / 1000, 1),
        breaker: response?.breaker?.state ?? null,
        breakerReason: response?.breaker?.reason ?? null,
        costUsd: run.costUsd,
      };
    }),
    breakers,
    youtubeDataApi: youtubeAnalyticsAvailable() ? "configured" : "not configured (YouTube videos stay undated and unscored; flat views are rounded)",
    apify: {
      paidDefault: "off (needs --paid and --apify-daily-cap-usd)",
      configured: apifyAvailable(),
      today: trendApifySpend({ workspaceId, since: dayStart }),
      toDate: trendApifySpend({ workspaceId, since: 0 }),
    },
    maturityCurves: Object.fromEntries(TREND_PLATFORMS.map((platform) => {
      const curve = curves[platform] ?? MATURITY_PRIORS[platform];
      return [platform, `${curve.basis} tau ${curve.tauHours} h, k ${curve.k}${curve.n ? ` (n ${curve.n})` : ""}`];
    })),
    scoreNote: SCORE_NOTE,
  };
}

// ─── Flags ──────────────────────────────────────────────────────────────────

function workspaceOf(command: Command, verb: string): string {
  const opts = command.optsWithGlobals();
  if (typeof opts.workspace !== "string" || opts.workspace.trim() === "") raiseError("E_FLAG_MISSING", { flag: "workspace", verb });
  const resolved = resolveCommandContext({ dataRoot: ralphDir(), workspaceId: opts.workspace, cwd: process.cwd() });
  return resolved.workspaceId;
}

function nicheOf(value: unknown, verb: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (!isNiche(value)) raiseError("E_FLAG_UNKNOWN", { flag: "niche", value: String(value), allowed: NICHES.join(", "), verb });
  return value;
}

function platformOf(value: unknown, verb: string): TrendPlatform {
  if (!isTrendPlatform(value)) raiseError("E_FLAG_UNKNOWN", { flag: "platform", value: String(value), allowed: TREND_PLATFORMS.join(", "), verb });
  return value;
}

function platformsOf(value: unknown, verb: string): TrendPlatform[] {
  if (value === undefined) return ["tiktok", "youtube"];
  const list = (value as string[]).flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
  return list.map((item) => platformOf(item, verb));
}

function positiveInt(value: unknown, field: string, verb: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) raiseError("E_INPUT_INVALID", { field, detail: "expected a positive whole number", verb });
  return parsed;
}

function nonNegativeInt(value: unknown, field: string, verb: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) raiseError("E_INPUT_INVALID", { field, detail: "expected a whole number >= 0", verb });
  return parsed;
}

export function durationMs(value: unknown, field: string, verb: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(h|d|w)$/i.exec(String(value ?? "").trim());
  if (!match) raiseError("E_INPUT_INVALID", { field, detail: "expected an age like 72h, 14d, or 4w", verb });
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  return amount * (unit === "h" ? HOUR_MS : unit === "d" ? DAY_MS : 7 * DAY_MS);
}

function paidOf(opts: { paid?: boolean; apifyDailyCapUsd?: string }, required: boolean, verb: string) {
  const enabled = opts.paid === true;
  const cap = opts.apifyDailyCapUsd === undefined ? null : Number(opts.apifyDailyCapUsd);
  if (cap !== null && (!Number.isFinite(cap) || cap < 0)) raiseError("E_INPUT_INVALID", { field: "apify-daily-cap-usd", detail: "expected a non-negative USD amount", verb });
  if (required && !enabled) raiseError("E_FLAG_MISSING", { flag: "paid", verb });
  if (enabled && cap === null) raiseError("E_FLAG_MISSING", { flag: "apify-daily-cap-usd", verb });
  if (required && !apifyAvailable()) raiseError("E_ENV_KEY_MISSING", { key: "APIFY_TOKEN", provider: "apify", verb });
  return { enabled, dailyCapUsd: cap };
}

function liveDeps(opts: { llm?: boolean; quietProgress?: boolean; youtubeApi?: boolean; network?: boolean }): TrendDeps {
  if (opts.network !== false && !ytdlpAvailable()) raiseError("E_DEP_MISSING", { dep: "yt-dlp" });
  return {
    ytdlp: runYtdlp,
    capture: capturePageXhr,
    ...(apifyAvailable()
      ? { apify: (input) => apifyRunActorDetailed({ actorId: input.actorId, input: input.input, maxItems: input.maxItems, maxTotalChargeUsd: input.maxTotalChargeUsd }) }
      : {}),
    ...(opts.youtubeApi !== false && youtubeAnalyticsAvailable() ? { youtubeDetails: (ids) => youtubeVideoDetails(ids) } : {}),
    ...(opts.llm
      ? {
          llm: async ({ model, system, user }) =>
            (await callLLM({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], jsonMode: true, endpoint: "trends.label" })).text,
        }
      : {}),
    now: Date.now,
    ...(opts.quietProgress ? {} : { log: (event) => process.stderr.write(`[${String(event.kind)}] ${JSON.stringify(event)}\n`) }),
    paceMs: 150,
  };
}
