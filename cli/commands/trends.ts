// `ralphy trends <verb>` — the creator-first trend corpus (#556).
//
//   trends ingest  --source <s> --seed <v> [--niche <n>]   discover + list + label + score
//   trends refresh [--due] [--tier-source computed|stored]  re-list creators by tier cadence
//   trends score   [--refit]                                recompute outlier scores
//   trends label   [--llm]                                  cohort labels (LLM off by default)
//   trends top     --niche <n> --since 14d --by outlier     ranked videos
//   trends creator <handle|id>                              one creator's baseline + videos
//   trends watch   add | list | remove                      discovery seeds
//   trends status                                           counts, runs, breakers, spend
//   trends link-digest <video> --ref <bundle|doc>           attach a #557 digest
//   trends niche init "<topic>" --lang en --seeds-file f   topic -> creators (#576)
//   trends niche report <niche> [--lang en] [--markdown f] niche report (#576)
//   trends niche list                                       open niches
//   trends signals --niche <n> [--lang en] [--type ...]    signal engine (#577)
//   trends precision --niche <n> [--lang en]                prediction-ledger precision (#577)
//   trends pick link <pick-key> --unit <unit>               a pick was produced as a Unit (#577)
//   trends pick skip <pick-key> --reason <text>             a pick was skipped (#577)
//
// Every verb takes an explicit global `--workspace <id>` (the corpus
// Workspace). Free sources run logged out with no cookies; paid Apify sources
// run only with `--paid` and a daily cap. Scores are Ralphy's own estimates,
// never platform data.

import { Command } from "commander";
import fs from "node:fs";
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
import { getNiche, listNiches, loadNicheMembers, openNicheSlugs, saveNicheReportDocument } from "../lib/store/trend-niches.js";
import {
  DEFAULT_NICHE_SETTINGS,
  defaultNicheSeedFile,
  llmSeedPrompt,
  nicheSettings,
  parseLlmSeeds,
  parseNicheSeedFile,
  slugifyNiche,
  type NicheSeedFile,
} from "../lib/trends/niche.js";
import { nicheInit, type NicheInitSummary } from "../lib/trends/niche-onboard.js";
import { buildNicheReport, renderNicheReportMarkdown } from "../lib/trends/niche-report.js";
import { DEFAULT_LABEL_PERCENTILES, parseLabelPercentiles, type LabelPolicy } from "../lib/trends/thresholds.js";
import { LLM_LABEL_MODEL } from "../lib/trends/cohorts.js";
import { isNiche, NICHES } from "../lib/trends/cohorts.js";
import {
  LISTING_SOURCE_BY_PLATFORM,
  TREND_SOURCES,
  currentCurves,
  ingest,
  TIER_SOURCES,
  isTierSource,
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
import { capturePageXhr, openTiktokProfileSession } from "../lib/trends/sources/tiktok.js";
import { runYtdlp, ytdlpAvailable } from "../lib/trends/sources/ytdlp.js";
import { YOUTUBE_API_SOURCE, YOUTUBE_WATCH_SOURCE } from "../lib/trends/sources/youtube.js";
import { buildNicheSignals, buildPrecision, linkPickToUnit, recordPicks, skipPick, SIGNAL_MIN_N, type HypothesisInput, type PickScope } from "../lib/trends/signal-engine.js";
import { ATTENTION_TIERS, DEFAULT_TIER_RULES, SIGNAL_TYPES, TIER_CADENCE, attentionTier, isSignalType, type SignalType } from "../lib/trends/signals.js";
import { creatorAttentionFacts } from "../lib/store/trend-signals.js";

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
    .description("Re-list creators by tier cadence, re-run due watchlists for new creators, then label and score. With --due the computed attention tier (#577) schedules each creator by default (hot every 6 h, watched daily, background weekly, dropped never); --tier-source stored uses the stored #556 tier (hot 6 h, active daily, inactive weekly, dormant monthly). The tier used per creator is in the output and on the listing run. Headless; stops a source when its breaker trips.")
    .option("--due", "Only creators whose tier cadence has passed (default: every non-excluded creator)")
    .option("--tier-source <source>", `Tier that schedules --due: ${TIER_SOURCES.join(" | ")}`, "computed")
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
      if (!isTierSource(opts.tierSource)) raiseError("E_FLAG_UNKNOWN", { flag: "tier-source", value: String(opts.tierSource), allowed: TIER_SOURCES.join(", "), verb: "trends refresh" });
      const deps = liveDeps(opts);
      const summary = await refresh({
        workspaceId,
        dueOnly: opts.due === true,
        tierSource: opts.tierSource,
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
    .description("Recompute outlier scores, creator baselines, and cohort baselines for the corpus Workspace. Labels are calibrated per platform x niche by percentile (breakout top 2%, outlier top 5% with z >= 2, strong top 15%; the fixed 10x / 5x / 3x stay as floors)")
    .option("--refit", "Refit the maturity curve from longitudinal snapshots first")
    .option("--label-mode <mode>", "percentile (default) | fixed (the #556 multipliers only)", "percentile")
    .option("--label-percentiles <list>", "breakout,outlier,strong percentiles (default 0.98,0.95,0.85); niche settings override per niche")
    .option("--label-min-sample <n>", "Mature videos a platform x niche group needs for its own percentiles", "200")
    .action((opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends score");
      const labelPolicy = labelPolicyOf(opts, "trends score");
      const pass = scorePass({ workspaceId, now: Date.now(), refit: opts.refit === true, labelPolicy });
      out({ kind: "trend-score", workspaceId, runId: pass.runId, counts: pass.counts, curves: pass.curves, labelThresholds: pass.labelThresholds, notes: pass.notes, scoreNote: SCORE_NOTE });
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
      for (const niche of niches ?? []) nicheOf(niche, "trends top", workspaceId);
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

  cmd
    .command("signals")
    .description("Signal engine (#577): breakout, small-account breakout, early momentum, near-miss (packaging-weak / content-weak), emerging format, and demand signal (not collected yet) for one niche, each with a label and evidence; adaptive widening below K references (the step is recorded per item); attention tiers; scale-up estimate against the own #558 baseline; optional within-creator contrast sets; --record appends the picks with predicted bands to the niche's prediction ledger")
    .requiredOption("--niche <niche>", "Open niche slug (from trends niche init)")
    .option("--lang <code>", "Only creators of this language (ISO 639-1)")
    .option("--platform <platform>", `Only one platform: ${TREND_PLATFORMS.join(" | ")}`)
    .option("--sub-niche <slug>", "Only one sub-niche (enables the adjacent-sub-niches widening step)")
    .option("--type <type...>", `Signal types: ${SIGNAL_TYPES.join(" | ")}`)
    .option("--since <age>", "Listing and base widening window", "30d")
    .option("--widen-since <age>", "Window of the extend-window widening step", "90d")
    .option("--k <n>", "Qualifying references wanted before widening stops", "20")
    .option("--limit <n>", "Rows per signal type", "20")
    .option("--contrast <n>", "Within-creator contrast sets (signal vs 3 median videos of the same creator) for the top N transferable candidates", "0")
    .option("--noise-floor <views>", "Override the niche's noise floor for references")
    .option("--own-workspace <id>", "Workspace whose #558 outcomes form the own baseline (default: the corpus Workspace)")
    .option("--own-followers <n>", "Own follower count for the reach-per-follower scale-up (#558 stores none)")
    .option("--record", "Append the picks (widened references + emerging formats) with predicted outcome bands to the prediction ledger Document")
    .option("--hypotheses <file>", "With --record: JSON [{ videoId | url, why, classification: transferable | creator-bound }] merged into the picks")
    .action((opts, child: Command) => {
      const verb = "trends signals";
      const workspaceId = workspaceOf(child, verb);
      const found = getNiche({ workspaceId, ref: slugifyNiche(String(opts.niche)) }) ?? getNiche({ workspaceId, ref: String(opts.niche) });
      if (!found) raiseError("E_NOT_FOUND", { kind: "trend niche", id: String(opts.niche) });
      const language = languageOf(opts.lang, verb);
      const types = (opts.type as string[] | undefined)?.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
      for (const type of types ?? []) if (!isSignalType(type)) raiseError("E_FLAG_UNKNOWN", { flag: "type", value: type, allowed: SIGNAL_TYPES.join(", "), verb });
      if (opts.hypotheses && !opts.record) raiseError("E_FLAG_MISSING", { flag: "record", verb });
      const ownWorkspaceId = opts.ownWorkspace ? resolveCommandContext({ dataRoot: ralphDir(), workspaceId: String(opts.ownWorkspace), cwd: process.cwd() }).workspaceId : undefined;
      const now = Date.now();
      const scope = { ...(language ? { language } : {}), ...(opts.platform ? { platform: platformOf(opts.platform, verb) } : {}) };
      const report = buildNicheSignals({
        niche: found,
        now,
        options: {
          ...scope,
          ...(opts.subNiche ? { subNiche: String(opts.subNiche) } : {}),
          ...(types && types.length > 0 ? { types: types as SignalType[] } : {}),
          sinceDays: durationMs(opts.since, "since", verb) / DAY_MS,
          widenSinceDays: durationMs(opts.widenSince, "widen-since", verb) / DAY_MS,
          k: positiveInt(opts.k, "k", verb),
          limit: positiveInt(opts.limit, "limit", verb),
          contrast: nonNegativeInt(opts.contrast, "contrast", verb),
          ...(opts.noiseFloor !== undefined ? { noiseFloorViews: nonNegativeInt(opts.noiseFloor, "noise-floor", verb) } : {}),
        },
        ownFollowers: opts.ownFollowers === undefined ? null : positiveInt(opts.ownFollowers, "own-followers", verb),
        ...(ownWorkspaceId ? { ownWorkspaceId } : {}),
      });
      const { _picks: picks, ...printed } = report;
      let recorded: Record<string, unknown> | null = null;
      if (opts.record) {
        const hypotheses = opts.hypotheses ? hypothesesOf(String(opts.hypotheses), verb) : [];
        recorded = recordPicks({ niche: found, options: scope, picks, hypotheses, now });
      }
      out({ ...printed, recorded, scoreNote: SCORE_NOTE });
    });

  cmd
    .command("precision")
    .description("Prediction-ledger precision per signal type (#577): produced picks resolve through #558 outcomes, skipped picks through whether the format kept spreading; \"insufficient data\" below the minimum n (as in #558)")
    .requiredOption("--niche <niche>", "Open niche slug")
    .option("--lang <code>", "Ledger scope language (as recorded by trends signals --record)")
    .option("--platform <platform>", `Ledger scope platform: ${TREND_PLATFORMS.join(" | ")}`)
    .option("--min-n <n>", "Resolved picks per signal type before a precision is claimed", String(SIGNAL_MIN_N))
    .action((opts, child: Command) => {
      const verb = "trends precision";
      const workspaceId = workspaceOf(child, verb);
      const found = getNiche({ workspaceId, ref: slugifyNiche(String(opts.niche)) }) ?? getNiche({ workspaceId, ref: String(opts.niche) });
      if (!found) raiseError("E_NOT_FOUND", { kind: "trend niche", id: String(opts.niche) });
      const language = languageOf(opts.lang, verb);
      out(buildPrecision({
        niche: found,
        now: Date.now(),
        options: { ...(language ? { language } : {}), ...(opts.platform ? { platform: platformOf(opts.platform, verb) } : {}) },
        minN: positiveInt(opts.minN, "min-n", verb),
      }));
    });

  cmd.addCommand(nicheCmd());
  cmd.addCommand(pickCmd());

  return cmd;
}

// ─── Pick decisions (#577) ──────────────────────────────────────────────────

function pickCmd(): Command {
  const pick = new Command("pick").description(
    "Close the prediction loop (#577): mark a prediction-ledger pick as produced (linked to a Unit, judged later against its #558 outcomes) or skipped (judged by whether the signal kept spreading). Pick keys are the pickKey of each signal after trends signals --record.",
  );
  const scopeOptions = (command: Command) =>
    command
      .option("--niche <niche>", "Niche slug of the ledger (default: every ledger of the Workspace)")
      .option("--lang <code>", "Ledger scope language")
      .option("--platform <platform>", `Ledger scope platform: ${TREND_PLATFORMS.join(" | ")}`);
  const scopeOf = (opts: Record<string, unknown>, workspaceId: string, verb: string): PickScope => {
    let niche: string | undefined;
    if (opts.niche) {
      const found = getNiche({ workspaceId, ref: slugifyNiche(String(opts.niche)) }) ?? getNiche({ workspaceId, ref: String(opts.niche) });
      if (!found) raiseError("E_NOT_FOUND", { kind: "trend niche", id: String(opts.niche) });
      niche = found.slug;
    }
    const language = languageOf(opts.lang, verb);
    return { ...(niche ? { niche } : {}), ...(language ? { language } : {}), ...(opts.platform ? { platform: platformOf(opts.platform, verb) } : {}) };
  };

  scopeOptions(
    pick
      .command("link <pick-key>")
      .description("Mark a pick produced: append a ledger revision with decision produced and the Unit reference, and record reference_pick / reference_signal in the Unit's decision ledger (#558) so outcome reports group by reference type")
      .requiredOption("--unit <unit>", "Unit ID or slug (a slug must match one Unit)")
      .option("--own-workspace <id>", "Workspace that holds the Unit (default: the corpus Workspace)"),
  ).action((key: string, opts, child: Command) => {
    const verb = "trends pick link";
    const workspaceId = workspaceOf(child, verb);
    const scope = scopeOf(opts, workspaceId, verb);
    const ownWorkspaceId = opts.ownWorkspace ? resolveCommandContext({ dataRoot: ralphDir(), workspaceId: String(opts.ownWorkspace), cwd: process.cwd() }).workspaceId : workspaceId;
    out(linkPickToUnit({ workspaceId, pickId: String(key).trim(), scope, unitRef: String(opts.unit), unitContext: { workspaceId: ownWorkspaceId }, now: Date.now() }));
  });

  scopeOptions(
    pick
      .command("skip <pick-key>")
      .description("Mark a pick skipped with a reason: append a ledger revision with decision skipped; trends precision checks it by whether the format or hook kept spreading")
      .requiredOption("--reason <text>", "Why the pick was not produced (stored on the pick)"),
  ).action((key: string, opts, child: Command) => {
    const verb = "trends pick skip";
    const workspaceId = workspaceOf(child, verb);
    const scope = scopeOf(opts, workspaceId, verb);
    out(skipPick({ workspaceId, pickId: String(key).trim(), scope, reason: String(opts.reason), now: Date.now() }));
  });

  return pick;
}

// ─── Niche onboarding (#576) ────────────────────────────────────────────────

function nicheCmd(): Command {
  const niche = new Command("niche").description(
    "On-demand niche onboarding (#576): a topic becomes an open niche with its own sub-niches; seeds -> snowballed creator discovery on free sources -> relevance gate (60%+ of the last 30 videos on-topic) -> size-band quotas, negative control group, anomaly flags -> niche report ranked by copyability",
  );

  niche
    .command("init <topic>")
    .description("Create or re-run an open niche from a topic. Seeds come from an agent-authored --seeds-file (default and free), one callLLM() call (--llm-seeds), or a deterministic topic fallback. Discovery uses free logged-out sources only; every source stops on its circuit breaker. Idempotent: re-runs re-gate members and add only new creators")
    .option("--lang <codes>", "Niche languages (ISO 639-1), comma-separated, e.g. en or en,ru", "en")
    .option("--platform <platforms>", "Platforms, comma-separated: tiktok,youtube", "tiktok,youtube")
    .option("--target-creators <n>", "Relevant creators wanted per language (dataset spec: 300-500)", String(DEFAULT_NICHE_SETTINGS.targetCreators))
    .option("--seeds-file <path>", "Seeds JSON: { topic, lexicon: { <lang>: { core, support, negative } }, subNiches: [{ slug, label, terms }], seeds: [{ platform, kind, value, language? }] }")
    .option("--llm-seeds", "Propose the seeds file with one callLLM() call instead (paid, off by default)")
    .option("--llm-model <id>", `Model for --llm-seeds / --llm-relevance (default ${LLM_LABEL_MODEL})`)
    .option("--slug <slug>", "Niche slug (default: from the topic)")
    .option("--relevance-threshold <share>", "On-topic share of the last 30 videos needed to keep a creator", String(DEFAULT_NICHE_SETTINGS.relevanceThreshold))
    .option("--profile-floor <share>", "Keep a creator whose bio or name states the topic from this on-topic share (0 = off)", String(DEFAULT_NICHE_SETTINGS.profileRelevanceFloor))
    .option("--max-rounds <n>", "Snowball rounds after the seed round", String(DEFAULT_NICHE_SETTINGS.maxRounds))
    .option("--time-budget-min <n>", "Wall-time budget for discovery in minutes", String(DEFAULT_NICHE_SETTINGS.timeBudgetMinutes))
    .option("--noise-floor <views>", "Copyability noise floor in absolute views", String(DEFAULT_NICHE_SETTINGS.noiseFloorViews))
    .option("--per-creator <n>", "Videos per creator listing", "60")
    .option("--concurrency <n>", "Parallel listings", "2")
    .option("--search-depth <n>", "Results per YouTube keyword search", "100")
    .option("--hashtag-depth <n>", "Entries per YouTube hashtag page", "60")
    .option("--budget <n>", "Request budget per source per pass", "1500")
    .option("--profile-budget <n>", "TikTok profile pages per run (handle -> secUid)", "400")
    .option("--youtube-date-budget <n>", "YouTube watch-page calls to date Tier-1 candidates (at most 150; 0 = off)", "0")
    .option("--expansion-hashtags <n>", "On-topic co-hashtags added per snowball round", "8")
    .option("--expansion-handles <n>", "Cross-platform / mention handles queued per platform per round", "200")
    .option("--no-guess-handles", "Do not try a YouTube creator's @handle as a TikTok handle")
    .option("--no-discover", "Skip discovery seeds and expansion (pending candidates are still sample-listed and gated)")
    .option("--no-list", "List nothing: re-gate, label, score, and regroup the stored members only (after a lexicon edit)")
    .option("--sample-listing <n>", "Sample-first gate: list candidates with this many videos, backfill only kept creators (0 = full listing)", "12")
    .option("--sample-cap <n>", "Kept creators per language in the analysis set, stratified by size band (the rest are out-of-sample)", "400")
    .option("--llm-relevance", "Judge undetermined and near-threshold creators with batched callLLM() calls (paid, off by default)")
    .option("--label-percentiles <list>", "Per-niche label percentiles breakout,outlier,strong (default 0.98,0.95,0.85)")
    .option("--quiet-progress", "Suppress progress events on stderr")
    .action(async (topic: string, opts, child: Command) => {
      const verb = "trends niche init";
      const workspaceId = workspaceOf(child, verb);
      const languages = String(opts.lang).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
      if (languages.length === 0 || languages.some((value) => !/^[a-z]{2}$/.test(value))) raiseError("E_INPUT_INVALID", { field: "lang", detail: "expected ISO 639-1 codes such as en or en,ru", verb });
      const platforms = platformsOf(String(opts.platform).split(","), verb).filter((platform) => platform !== "instagram");
      if (platforms.length === 0) raiseError("E_INPUT_INVALID", { field: "platform", detail: "niche init discovers on tiktok and youtube (Instagram has no free discovery path)", verb });
      let seedFile: NicheSeedFile;
      let seedSource: "file" | "llm" | "topic";
      const notes: string[] = [];
      if (opts.seedsFile) {
        const file = path.resolve(String(opts.seedsFile));
        if (!fs.existsSync(file)) raiseError("E_INPUT_INVALID", { field: "seeds-file", detail: `no file at ${file}`, verb });
        try {
          seedFile = parseNicheSeedFile(JSON.parse(fs.readFileSync(file, "utf8")), { topic, languages, platforms });
        } catch (error) {
          raiseError("E_INPUT_INVALID", { field: "seeds-file", detail: (error as Error).message, verb });
        }
        seedSource = "file";
      } else if (opts.llmSeeds) {
        const model = opts.llmModel ? String(opts.llmModel) : LLM_LABEL_MODEL;
        const prompt = llmSeedPrompt(topic, languages, platforms);
        const reply = await callLLM({ model, messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }], jsonMode: true, endpoint: "trends.niche-seeds" });
        try {
          seedFile = parseLlmSeeds(reply.text, { topic, languages, platforms });
        } catch (error) {
          raiseError("E_INPUT_INVALID", { field: "llm-seeds", detail: `the model reply is not a valid seeds file: ${(error as Error).message}`, verb });
        }
        seedSource = "llm";
      } else {
        seedFile = defaultNicheSeedFile(topic, languages, platforms);
        seedSource = "topic";
        notes.push("no --seeds-file: used the deterministic topic fallback (the topic as the only lexicon term); author a seeds file with sub-niches and a full lexicon for a useful relevance gate");
      }
      // An explicit --lang narrows the seeds file to those languages; each needs a lexicon.
      const langGiven = child.getOptionValueSource("lang") === "cli";
      const nicheLanguages = langGiven ? languages : seedFile.languages;
      const missing = nicheLanguages.filter((lang) => !seedFile.taxonomy.lexicon[lang]);
      if (missing.length > 0) raiseError("E_INPUT_INVALID", { field: "lang", detail: `the seeds have no lexicon for ${missing.join(", ")}`, verb });
      seedFile = {
        ...seedFile,
        topic,
        languages: nicheLanguages,
        seeds: seedFile.seeds.filter((seed) => seed.language === null || nicheLanguages.includes(seed.language)),
        platforms: seedFile.platforms.filter((platform) => (platforms as TrendPlatform[]).includes(platform)),
        ...(opts.slug ? { slug: slugifyNiche(String(opts.slug)) } : {}),
      };
      const labelPercentiles = opts.labelPercentiles ? parseLabelPercentiles(String(opts.labelPercentiles)) : null;
      if (opts.labelPercentiles && !labelPercentiles) raiseError("E_INPUT_INVALID", { field: "label-percentiles", detail: "expected breakout,outlier,strong in (0, 1), descending, e.g. 0.98,0.95,0.85", verb });
      const settings = nicheSettings({
        ...seedFile.settings,
        targetCreators: positiveInt(opts.targetCreators, "target-creators", verb),
        relevanceThreshold: shareOf(opts.relevanceThreshold, "relevance-threshold", verb),
        profileRelevanceFloor: Number(opts.profileFloor) === 0 ? 0 : shareOf(opts.profileFloor, "profile-floor", verb),
        maxRounds: nonNegativeInt(opts.maxRounds, "max-rounds", verb),
        timeBudgetMinutes: positiveInt(opts.timeBudgetMin, "time-budget-min", verb),
        noiseFloorViews: nonNegativeInt(opts.noiseFloor, "noise-floor", verb),
        sampleCap: positiveInt(opts.sampleCap, "sample-cap", verb),
        ...(labelPercentiles ? { labelPercentiles } : {}),
      });
      const deps = liveDeps({ llm: opts.llmRelevance === true, quietProgress: opts.quietProgress === true, youtubeApi: true, network: true });
      const summary = await nicheInit({
        workspaceId,
        seedFile,
        seedSource,
        settings,
        perCreator: positiveInt(opts.perCreator, "per-creator", verb),
        concurrency: positiveInt(opts.concurrency, "concurrency", verb),
        searchDepth: positiveInt(opts.searchDepth, "search-depth", verb),
        hashtagDepth: positiveInt(opts.hashtagDepth, "hashtag-depth", verb),
        budget: positiveInt(opts.budget, "budget", verb),
        profileBudget: nonNegativeInt(opts.profileBudget, "profile-budget", verb),
        youtubeDateBudget: Math.min(150, nonNegativeInt(opts.youtubeDateBudget, "youtube-date-budget", verb)),
        guessHandles: opts.guessHandles !== false,
        expansionHashtags: nonNegativeInt(opts.expansionHashtags, "expansion-hashtags", verb),
        expansionHandles: nonNegativeInt(opts.expansionHandles, "expansion-handles", verb),
        llmRelevance: opts.llmRelevance === true,
        ...(opts.llmModel ? { llmModel: String(opts.llmModel) } : {}),
        discover: opts.discover !== false,
        list: opts.list !== false,
        sampleListing: nonNegativeInt(opts.sampleListing, "sample-listing", verb),
      }, deps);
      out(nicheInitReport(summary, seedSource, seedFile, notes));
    });

  niche
    .command("report <niche>")
    .description("Niche report: coverage by size band, the copyability-ranked \"what to copy\" list with every component, top outliers overall / per sub-niche / per size band, formats and hook types with n and lift, cadence and length of growing creators, sub-niche saturation vs demand, entry formats for a new account, the negative control group, digest links, and YouTube gaps. Groups below the minimum n say \"insufficient data\"")
    .option("--lang <code>", "Only creators of this language (ISO 639-1)")
    .option("--platform <platform>", `Only one platform: ${TREND_PLATFORMS.join(" | ")}`)
    .option("--min-n <n>", "Minimum videos before a group gets a claim", "20")
    .option("--min-creators <n>", "Minimum creators before a group gets a claim", "5")
    .option("--top <n>", "Rows in the ranked lists", "20")
    .option("--noise-floor <views>", "Override the niche's noise floor in views")
    .option("--since <age>", "Analysis window for dated videos (dataset spec backfill: 90d)", "90d")
    .option("--max-per-creator <n>", "Rows per creator in the ranked lists", "2")
    .option("--markdown <path>", "Also write the report as a markdown file")
    .option("--document", "Also save the report as a research Document in the corpus Workspace")
    .action((ref: string, opts, child: Command) => {
      const verb = "trends niche report";
      const workspaceId = workspaceOf(child, verb);
      const found = getNiche({ workspaceId, ref: slugifyNiche(ref) }) ?? getNiche({ workspaceId, ref });
      if (!found) raiseError("E_NOT_FOUND", { kind: "trend niche", id: ref });
      const language = opts.lang ? String(opts.lang).toLowerCase() : undefined;
      if (language && !/^[a-z]{2}$/.test(language)) raiseError("E_INPUT_INVALID", { field: "lang", detail: "expected an ISO 639-1 code", verb });
      const report = buildNicheReport({
        niche: found,
        now: Date.now(),
        options: {
          ...(language ? { language } : {}),
          ...(opts.platform ? { platform: platformOf(opts.platform, verb) } : {}),
          minN: positiveInt(opts.minN, "min-n", verb),
          minCreators: positiveInt(opts.minCreators, "min-creators", verb),
          top: positiveInt(opts.top, "top", verb),
          sinceDays: durationMs(opts.since, "since", verb) / DAY_MS,
          maxPerCreator: positiveInt(opts.maxPerCreator, "max-per-creator", verb),
          ...(opts.noiseFloor !== undefined ? { noiseFloorViews: nonNegativeInt(opts.noiseFloor, "noise-floor", verb) } : {}),
        },
      });
      const outputs: Record<string, string> = {};
      if (opts.markdown || opts.document) {
        const markdown = renderNicheReportMarkdown(report);
        if (opts.markdown) {
          const file = path.resolve(String(opts.markdown));
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, markdown);
          outputs.markdown = file;
        }
        if (opts.document) {
          const saved = saveNicheReportDocument({ workspaceId, slug: `${found.slug}${language ? `-${language}` : ""}`, title: `Niche report: ${found.topic}${language ? ` (${language})` : ""}`, markdown });
          outputs.documentId = saved.documentId;
          outputs.revisionId = saved.revisionId;
        }
      }
      out({ ...report, outputs, scoreNote: SCORE_NOTE });
    });

  niche
    .command("list")
    .description("Open niches in the corpus Workspace with member counts")
    .action((_opts, child: Command) => {
      const workspaceId = workspaceOf(child, "trends niche list");
      out(listNiches({ workspaceId }).map((row) => {
        const members = loadNicheMembers({ nicheId: row.id });
        const count = (status: string) => members.filter((member) => member.status === status).length;
        return {
          slug: row.slug,
          topic: row.topic,
          languages: row.languages.join(","),
          platforms: row.platforms.join(","),
          subNiches: row.taxonomy.subNiches.length,
          seedSource: row.seedSource,
          kept: members.filter((member) => member.status === "kept" && !member.flags.includes("out-of-sample")).length,
          outOfSample: members.filter((member) => member.status === "kept" && member.flags.includes("out-of-sample")).length,
          dropped: count("dropped"),
          undetermined: count("undetermined"),
          candidates: count("candidate"),
          updatedAt: iso(row.updatedAt),
        };
      }));
    });

  return niche;
}

function nicheInitReport(summary: NicheInitSummary, seedSource: string, seedFile: NicheSeedFile, notes: string[]) {
  return {
    kind: "trend-niche-init",
    niche: summary.slug,
    nicheId: summary.nicheId,
    runId: summary.runId,
    seedSource,
    seeds: seedFile.seeds.length,
    subNiches: seedFile.taxonomy.subNiches.map((sub) => sub.slug),
    wallMinutes: round(summary.wallMs / 60_000, 1),
    stopReason: summary.stopReason,
    rounds: summary.rounds,
    members: summary.members,
    quotas: summary.quotas,
    negative: summary.negative,
    videos: summary.videos,
    blocks: summary.blocks,
    breakers: summary.breakers,
    passes: summary.passes.map((pass) => ({ kind: pass.kind, source: pass.source, requests: pass.requests, breaker: pass.breaker.state, breakerReason: pass.breaker.reason, counts: pass.counts })),
    skipped: summary.skipped,
    notes: [...notes, ...summary.notes],
    scoreNote: SCORE_NOTE,
  };
}

function labelPolicyOf(opts: { labelMode?: string; labelPercentiles?: string; labelMinSample?: string }, verb: string): LabelPolicy {
  const mode = opts.labelMode ?? "percentile";
  if (mode !== "percentile" && mode !== "fixed") raiseError("E_FLAG_UNKNOWN", { flag: "label-mode", value: mode, allowed: "percentile, fixed", verb });
  const percentiles = opts.labelPercentiles ? parseLabelPercentiles(opts.labelPercentiles) : DEFAULT_LABEL_PERCENTILES;
  if (!percentiles) raiseError("E_INPUT_INVALID", { field: "label-percentiles", detail: "expected breakout,outlier,strong in (0, 1), descending, e.g. 0.98,0.95,0.85", verb });
  return { mode, percentiles, minSample: positiveInt(opts.labelMinSample ?? "200", "label-min-sample", verb) };
}

function shareOf(value: unknown, field: string, verb: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) raiseError("E_INPUT_INVALID", { field, detail: "expected a share between 0 and 1", verb });
  return parsed;
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
    ...("source" in summary ? { source: summary.source, niche: summary.niche } : { dueOnly: summary.dueOnly, scheduling: summary.scheduling }),
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
  const attention: Record<string, Record<string, number>> = {};
  for (const facts of creatorAttentionFacts({ workspaceId, now, signalFloor: 2, hotMaxAgeHours: DEFAULT_TIER_RULES.hotMaxAgeHours, ignoreDateSources: [YOUTUBE_WATCH_SOURCE] })) {
    const row = attention[facts.platform] ?? (attention[facts.platform] = Object.fromEntries(ATTENTION_TIERS.map((tier) => [tier, 0])));
    const tier = attentionTier(facts, now).tier;
    row[tier] = (row[tier] ?? 0) + 1;
  }
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
    attentionTiers: {
      rules: `hot: a video under ${DEFAULT_TIER_RULES.hotMaxAgeHours} h with rising momentum (${TIER_CADENCE.hot}); watched: posted in ${DEFAULT_TIER_RULES.recentDays} d, ${DEFAULT_TIER_RULES.minPosts30}+ posts in 30 d, a breakout or near-miss in 30 d (${TIER_CADENCE.watched}); background: the rest (${TIER_CADENCE.background}); dropped: excluded or no post in ${DEFAULT_TIER_RULES.droppedAfterDays}+ d`,
      byPlatform: attention,
      note: "computed on read from posting frequency, recency, and signals, so tiers re-rank after every refresh; trends refresh --due schedules by these tiers (hot every 6 h, watched daily, background weekly, dropped never) unless --tier-source stored",
    },
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

function nicheOf(value: unknown, verb: string, workspaceId?: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (isNiche(value)) return value;
  // Open niches created by `trends niche init` (#576) are first-class too.
  const open = workspaceId ? openNicheSlugs(workspaceId) : new Set<string>();
  if (typeof value === "string" && open.has(value)) return value;
  raiseError("E_FLAG_UNKNOWN", { flag: "niche", value: String(value), allowed: [...NICHES, ...open].join(", "), verb });
}

function languageOf(value: unknown, verb: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const language = String(value).toLowerCase();
  if (!/^[a-z]{2}$/.test(language)) raiseError("E_INPUT_INVALID", { field: "lang", detail: "expected an ISO 639-1 code", verb });
  return language;
}

function hypothesesOf(file: string, verb: string): HypothesisInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  } catch (error) {
    raiseError("E_INPUT_INVALID", { field: "hypotheses", detail: `cannot read JSON: ${(error as Error).message}`, verb });
  }
  if (!Array.isArray(raw)) raiseError("E_INPUT_INVALID", { field: "hypotheses", detail: "expected a JSON array", verb });
  return raw.map((entry, index) => {
    const record = entry as Record<string, unknown>;
    const why = typeof record.why === "string" ? record.why.trim() : "";
    const classification = record.classification;
    if (!why || (classification !== "transferable" && classification !== "creator-bound")) {
      raiseError("E_INPUT_INVALID", { field: `hypotheses[${index}]`, detail: "needs why and classification transferable | creator-bound", verb });
    }
    if (typeof record.videoId !== "string" && typeof record.url !== "string") raiseError("E_INPUT_INVALID", { field: `hypotheses[${index}]`, detail: "needs videoId or url", verb });
    return {
      ...(typeof record.videoId === "string" ? { videoId: record.videoId } : {}),
      ...(typeof record.url === "string" ? { url: record.url } : {}),
      why,
      classification,
    };
  });
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
    tiktokProfiles: openTiktokProfileSession,
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
