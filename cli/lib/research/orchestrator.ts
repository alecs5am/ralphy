// Stage-1 orchestrator: planner → fan-out search → fan-out fetch →
// per-source summarize → synthesis → citation verify. Writes everything to
// a job dir under workspace/.ralph/research/<job-id>/.
//
// This is the "planner + parallel workers" topology (see
// docs/research/deep-research-architecture-foundations.md §1). It's the only
// shape that hits 100+ sources within a reasonable budget when the niche is
// broad — the four-role AI-Q split (intent → clarifier → shallow → deep)
// lands in Stage 2 alongside the async job manager.

import { mkdir, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { workspace } from "../paths.js";
import { planResearch, type ResearchPlan } from "./planner.js";
import { searchDuckDuckGo, type SearchHit } from "./retrievers/ddg-search.js";
import { fetchPage } from "./retrievers/web-fetch.js";
import {
  detectVideoUrl,
  pullVideoMeta,
  pullVideoFull,
  computeViralityScore,
  type VideoMeta,
} from "./retrievers/video.js";
import { ytSearchShortsBias, type YtdlpHit } from "./retrievers/ytdlp-search.js";
import { appendSource, loadRegistry } from "./source-registry.js";
import { summarizeSource, type SourceSummary } from "./summarizer.js";
import { summarizeVideo, type VideoSummary } from "./video-summarizer.js";
import { synthesizeReport } from "./synthesizer.js";
import { extractUrls } from "./url-extractor.js";
import { verifyCitations, type VerifyResult } from "./citation-verifier.js";

export type RunOptions = {
  query: string;
  jobId?: string;
  context?: string;
  /** Max text sources to fetch + summarize. Hard cap. */
  maxSources?: number;
  /** DDG results to pull per subquery. */
  hitsPerSubquery?: number;
  /** Parallel fetches. */
  fetchConcurrency?: number;
  /** Parallel summary calls. */
  summaryConcurrency?: number;
  /** Max videos to analyze with vision. 0 disables the video track. */
  maxVideos?: number;
  /** Hits to pull per video discovery query before filtering. */
  videoHitsPerQuery?: number;
  /** Parallel yt-dlp meta probes. */
  videoMetaConcurrency?: number;
  /** Parallel full-pull (mp4 + frames) jobs. */
  videoPullConcurrency?: number;
  /** Parallel vision summarizations. */
  videoSummaryConcurrency?: number;
  plannerModel?: string;
  summaryModel?: string;
  synthModel?: string;
  videoSummaryModel?: string;
  /** Hook for live progress reporting. Called with status objects. */
  onEvent?: (e: ProgressEvent) => void;
  /** Hard timeout in seconds for the entire run. */
  budgetSeconds?: number;
};

export type ProgressEvent =
  | { kind: "plan_start"; query: string }
  | { kind: "plan_done"; subqueries: number; videoQueries: number; intent: string }
  | { kind: "search_start"; total: number }
  | { kind: "search_done"; uniqueUrls: number }
  | { kind: "fetch_start"; total: number }
  | { kind: "fetch_progress"; done: number; total: number; ok: number; failed: number }
  | { kind: "summarize_start"; total: number }
  | { kind: "summarize_progress"; done: number; total: number }
  | { kind: "video_discovery_start"; queries: number }
  | { kind: "video_discovery_done"; candidates: number }
  | { kind: "video_meta_start"; total: number }
  | { kind: "video_meta_progress"; done: number; total: number; usable: number }
  | { kind: "video_filter_done"; kept: number; dropped: number }
  | { kind: "video_pull_start"; total: number }
  | { kind: "video_pull_progress"; done: number; total: number; ok: number; failed: number }
  | { kind: "video_summarize_start"; total: number }
  | { kind: "video_summarize_progress"; done: number; total: number }
  | { kind: "synthesize_start" }
  | { kind: "synthesize_done"; words: number }
  | { kind: "verify_done"; matched: number; unmatched: number; rate: number };

export type RunResult = {
  jobId: string;
  jobDir: string;
  query: string;
  plan: ResearchPlan;
  sourcesAttempted: number;
  sourcesFetched: number;
  sourcesSummarized: number;
  videosDiscovered: number;
  videosMetaProbed: number;
  videosAnalyzed: number;
  report: string;
  reportPath: string;
  registryPath: string;
  verify: VerifyResult;
  citationRate: number;
};

function nowJobId(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate()),
    "-",
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds()),
    "-",
    Math.random().toString(36).slice(2, 7),
  ].join("");
}

export function jobDirFor(jobId: string): string {
  return path.join(workspace(), ".ralph", "research", jobId);
}

async function appendEvent(jobDir: string, event: unknown): Promise<void> {
  const p = path.join(jobDir, "events.jsonl");
  await appendFile(
    p,
    JSON.stringify({ ts: new Date().toISOString(), ...(event as object) }) + "\n",
  );
}

async function runConcurrent<T, U>(
  items: T[],
  worker: (item: T, idx: number) => Promise<U>,
  concurrency: number,
  onProgress?: (done: number, total: number) => void,
): Promise<U[]> {
  const results: U[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;

  async function take(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= total) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        // worker is expected to swallow; this is a last-ditch safety net.
        results[i] = e as U;
      }
      done += 1;
      onProgress?.(done, total);
    }
  }
  const workers = Array(Math.min(concurrency, Math.max(1, total))).fill(0).map(() => take());
  await Promise.all(workers);
  return results;
}

export async function runDeepResearch(opts: RunOptions): Promise<RunResult> {
  const jobId = opts.jobId ?? nowJobId();
  const jobDir = jobDirFor(jobId);
  await mkdir(jobDir, { recursive: true });

  const maxSources = opts.maxSources ?? 100;
  const hitsPerSubquery = opts.hitsPerSubquery ?? 8;
  const fetchConcurrency = opts.fetchConcurrency ?? 8;
  const summaryConcurrency = opts.summaryConcurrency ?? 4;
  const maxVideos = opts.maxVideos ?? 200;
  const videoHitsPerQuery = opts.videoHitsPerQuery ?? 12;
  const videoMetaConcurrency = opts.videoMetaConcurrency ?? 4;
  const videoPullConcurrency = opts.videoPullConcurrency ?? 3;
  const videoSummaryConcurrency = opts.videoSummaryConcurrency ?? 3;
  const deadline = opts.budgetSeconds
    ? Date.now() + opts.budgetSeconds * 1000
    : null;

  const emit = (e: ProgressEvent) => {
    opts.onEvent?.(e);
    void appendEvent(jobDir, e);
  };

  // ── Phase 1: Plan ──────────────────────────────────────────────────────
  emit({ kind: "plan_start", query: opts.query });
  const plan = await planResearch({
    query: opts.query,
    context: opts.context,
    model: opts.plannerModel,
    projectId: jobId,
  });
  await writeFile(
    path.join(jobDir, "plan.json"),
    JSON.stringify(plan, null, 2),
    "utf8",
  );
  emit({
    kind: "plan_done",
    subqueries: plan.subqueries.length,
    videoQueries: plan.video_discovery_queries.length,
    intent: plan.intent,
  });

  // ── Phase 2: Fan-out search ────────────────────────────────────────────
  emit({ kind: "search_start", total: plan.subqueries.length });
  const searchResults = await runConcurrent(
    plan.subqueries,
    (sq) => searchDuckDuckGo(sq.query, { limit: hitsPerSubquery }),
    Math.min(5, plan.subqueries.length),
  );
  // Flatten + dedup
  const seenUrls = new Set<string>();
  const candidates: SearchHit[] = [];
  for (const hits of searchResults) {
    for (const h of hits) {
      if (seenUrls.has(h.url)) continue;
      seenUrls.add(h.url);
      candidates.push(h);
    }
  }
  // Drop common non-content domains we know waste budget.
  const blocklist = [
    /\.youtube\.com\/feed\//i,
    /\.facebook\.com\/login/i,
    /\.instagram\.com\/accounts\/login/i,
    /\bpinterest\./i,
  ];
  const filtered = candidates.filter((c) => !blocklist.some((r) => r.test(c.url)));
  const targets = filtered.slice(0, maxSources);
  await writeFile(
    path.join(jobDir, "search-results.json"),
    JSON.stringify({ total: candidates.length, kept: targets.length, targets }, null, 2),
    "utf8",
  );
  emit({ kind: "search_done", uniqueUrls: targets.length });

  if (deadline && Date.now() > deadline) {
    throw new Error("budget exceeded after search phase");
  }

  // ── Phase 3: Fan-out fetch ─────────────────────────────────────────────
  emit({ kind: "fetch_start", total: targets.length });
  let okCount = 0;
  let failCount = 0;
  await runConcurrent(
    targets,
    async (hit) => {
      const r = await fetchPage(hit.url, { timeoutMs: 15_000, maxBytes: 200_000 });
      if (r.score === 1 && r.text.length > 200) {
        okCount += 1;
        await appendSource(jobDir, {
          url: r.source_url,
          text: r.text,
          retrievedAt: r.retrieved_at,
          score: r.score,
          status: r.status,
          title: hit.title,
          searchRank: hit.rank,
        });
      } else {
        failCount += 1;
      }
      return { hit, fetch: r };
    },
    fetchConcurrency,
    (done, total) => {
      if (done % 5 === 0 || done === total) {
        emit({
          kind: "fetch_progress",
          done,
          total,
          ok: okCount,
          failed: failCount,
        });
      }
    },
  );

  if (deadline && Date.now() > deadline) {
    throw new Error("budget exceeded after fetch phase");
  }

  // ── Phase 4: Summarize ─────────────────────────────────────────────────
  const registry = await loadRegistry(jobDir);
  const toSummarize = registry.filter((r) => r.text.length > 200);
  emit({ kind: "summarize_start", total: toSummarize.length });

  const summaries = await runConcurrent(
    toSummarize,
    async (entry) => {
      try {
        return await summarizeSource({
          url: entry.url,
          rawText: entry.text,
          niche: opts.query,
          model: opts.summaryModel,
          projectId: jobId,
        });
      } catch (e) {
        return {
          url: entry.url,
          title: String((entry as { title?: unknown }).title ?? ""),
          summary: `summarize error: ${(e as Error).message}`,
          key_claims: [],
          format_patterns: [],
          why_resonates: "",
          source_quality: "low",
          freshness: "unknown",
        } as SourceSummary;
      }
    },
    summaryConcurrency,
    (done, total) => {
      if (done % 5 === 0 || done === total) {
        emit({ kind: "summarize_progress", done, total });
      }
    },
  );

  // Drop low-signal summaries so the synthesis context isn't polluted.
  const goodSummaries = summaries.filter(
    (s) => s.source_quality !== "low" && s.summary && !s.summary.startsWith("summarize error"),
  );

  await writeFile(
    path.join(jobDir, "summaries.json"),
    JSON.stringify(summaries, null, 2),
    "utf8",
  );

  if (deadline && Date.now() > deadline) {
    throw new Error("budget exceeded after summarize phase");
  }

  // ── Phase 4b: Video discovery + meta + virality filter + pull + analyze ─
  // Runs in parallel-ish with text summarize on the timeline, but kept here
  // sequentially for simplicity. Skipped when maxVideos===0.
  let videoSummaries: VideoSummary[] = [];
  let videosDiscoveredCount = 0;
  let videosMetaProbedCount = 0;
  let videosAnalyzedCount = 0;

  if (maxVideos > 0 && plan.video_discovery_queries.length > 0) {
    emit({ kind: "video_discovery_start", queries: plan.video_discovery_queries.length });

    // Discovery uses TWO backends in parallel:
    // (a) yt-dlp ytsearch — high-signal for YouTube + Shorts, returns view
    //     counts in the same response, so we can pre-rank cheaply.
    // (b) DDG HTML search — catches TikTok / Instagram / Reddit / X video
    //     URLs that surface in normal web indexing.
    const ytHitsPromise = runConcurrent(
      plan.video_discovery_queries,
      (q) => ytSearchShortsBias(q.query, { limit: videoHitsPerQuery, timeoutMs: 30_000 }),
      Math.min(4, plan.video_discovery_queries.length),
    );
    const ddgHitsPromise = runConcurrent(
      plan.video_discovery_queries,
      (q) => searchDuckDuckGo(q.query, { limit: videoHitsPerQuery }),
      Math.min(3, plan.video_discovery_queries.length),
    );
    const [ytLists, ddgLists] = await Promise.all([ytHitsPromise, ddgHitsPromise]);

    // Flatten + dedup. Keep YouTube hits' pre-fetched view counts so we can
    // pre-rank without a yt-dlp meta call per video.
    //
    // Vertical-only constraint: keep ONLY tiktok / youtube-shorts /
    // instagram-reel. Long-form YouTube `watch?v=...` and IG posts (`/p/`)
    // are out of scope for this research even if the keyword match is good.
    const VERTICAL_PLATFORMS = new Set([
      "tiktok",
      "youtube-shorts",
      "instagram-reel",
    ]);
    const seenVideoUrls = new Set<string>();
    const videoCandidates: Array<{
      url: string;
      title: string;
      platform: ReturnType<typeof detectVideoUrl>;
      prefetched?: YtdlpHit;
    }> = [];
    for (const list of ytLists) {
      for (const h of list) {
        if (seenVideoUrls.has(h.url)) continue;
        if (!VERTICAL_PLATFORMS.has(h.platform)) continue;
        seenVideoUrls.add(h.url);
        videoCandidates.push({ url: h.url, title: h.title, platform: h.platform, prefetched: h });
      }
    }
    for (const list of ddgLists) {
      for (const h of list) {
        const platform = detectVideoUrl(h.url);
        if (!platform) continue;
        if (!VERTICAL_PLATFORMS.has(platform)) continue;
        if (seenVideoUrls.has(h.url)) continue;
        seenVideoUrls.add(h.url);
        videoCandidates.push({ url: h.url, title: h.title, platform });
      }
    }
    videosDiscoveredCount = videoCandidates.length;
    emit({ kind: "video_discovery_done", candidates: videoCandidates.length });

    await writeFile(
      path.join(jobDir, "video-candidates.json"),
      JSON.stringify(videoCandidates, null, 2),
      "utf8",
    );

    // Pre-rank YouTube candidates by their flat-playlist view_count so we
    // can spend the meta-probe budget where it matters. Non-YouTube
    // candidates (TikTok, IG, etc.) keep their original order.
    const ytSorted = videoCandidates
      .filter((c) => c.prefetched)
      .sort((a, b) => (b.prefetched?.views ?? 0) - (a.prefetched?.views ?? 0));
    const otherCandidates = videoCandidates.filter((c) => !c.prefetched);
    const orderedCandidates = [...ytSorted, ...otherCandidates];

    // Meta probe (cheap yt-dlp --dump-json). Cap by 3x maxVideos so we have
    // headroom for the virality filter.
    const metaTargets = orderedCandidates.slice(0, Math.max(maxVideos * 3, maxVideos));
    emit({ kind: "video_meta_start", total: metaTargets.length });
    let usable = 0;
    const metas = await runConcurrent(
      metaTargets,
      async (hit) => {
        const meta = await pullVideoMeta(hit.url, { timeoutMs: 30_000 }).catch(() => null);
        if (meta) usable += 1;
        return { hit, meta };
      },
      videoMetaConcurrency,
      (done, total) => {
        if (done % 5 === 0 || done === total) {
          emit({ kind: "video_meta_progress", done, total, usable });
        }
      },
    );
    videosMetaProbedCount = metas.filter((m) => m.meta !== null).length;

    // Filter: keep videos with sane duration + non-zero views, rank by
    // virality score (log-views-per-day * engagement-boost), pick top N.
    type MetaPair = (typeof metas)[number];
    type ResolvedMeta = MetaPair & { meta: VideoMeta };
    const withScore = metas
      .filter((m): m is ResolvedMeta => m.meta !== null)
      .filter((m) => m.meta.durationSec > 0 && m.meta.durationSec <= 180)
      .filter((m) => m.meta.views >= 500) // drop micro-videos
      .map((m) => ({ ...m, score: computeViralityScore(m.meta) }))
      .sort((a, b) => b.score - a.score);

    const top = withScore.slice(0, maxVideos);
    emit({ kind: "video_filter_done", kept: top.length, dropped: withScore.length - top.length });

    await writeFile(
      path.join(jobDir, "video-meta.json"),
      JSON.stringify(
        metas.map((m) => ({ url: m.hit.url, meta: m.meta })),
        null,
        2,
      ),
      "utf8",
    );

    // Full pull: download mp4 + frames + subs. Each video gets its own
    // subdir under <jobDir>/videos/<sanitized-id>/.
    if (deadline && Date.now() > deadline) {
      // Skip pull phase if we're out of budget but keep the metas.
    } else {
      emit({ kind: "video_pull_start", total: top.length });
      let okPull = 0;
      let failPull = 0;
      const pulled = await runConcurrent(
        top,
        async (entry) => {
          const safeId = entry.meta.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) ||
            `vid${Math.random().toString(36).slice(2, 8)}`;
          const vDir = path.join(jobDir, "videos", `${entry.meta.platform}-${safeId}`);
          const r = await pullVideoFull(entry.meta.url, vDir, {
            numFrames: 8,
            maxDurationSec: 180,
            maxFilesize: "30M",
            timeoutMs: 90_000,
          }).catch(() => null);
          // "ok" = we got SOMETHING the vision/text summarizer can use —
          // frames (any number) OR a non-empty transcript.
          if (r && (r.framePaths.length > 0 || r.transcript.length > 50)) {
            okPull += 1;
          } else {
            failPull += 1;
          }
          return { entry, pull: r };
        },
        videoPullConcurrency,
        (done, total) => {
          if (done % 3 === 0 || done === total) {
            emit({
              kind: "video_pull_progress",
              done,
              total,
              ok: okPull,
              failed: failPull,
            });
          }
        },
      );

      const ready = pulled.filter(
        (p): p is { entry: typeof top[number]; pull: NonNullable<typeof p.pull> } =>
          p.pull !== null && (p.pull.framePaths.length > 0 || p.pull.transcript.length > 50),
      );

      // Vision summarize
      if (ready.length > 0) {
        emit({ kind: "video_summarize_start", total: ready.length });
        const rawSummaries = await runConcurrent(
          ready,
          async ({ entry, pull }) => {
            try {
              return await summarizeVideo({
                meta: entry.meta,
                mp4Path: pull.mp4Path,
                framePaths: pull.framePaths,
                transcript: pull.transcript,
                niche: opts.query,
                viralityScore: entry.score,
                model: opts.videoSummaryModel,
                projectId: jobId,
              });
            } catch (e) {
              return null;
            }
          },
          videoSummaryConcurrency,
          (done, total) => {
            if (done % 3 === 0 || done === total) {
              emit({ kind: "video_summarize_progress", done, total });
            }
          },
        );

        // Persist EVERY raw summary (including off-topic) for debugging /
        // post-hoc analysis. Synthesis only consumes the kept subset.
        const nonNullRaw = rawSummaries.filter(
          (s): s is VideoSummary => s !== null,
        );
        await writeFile(
          path.join(jobDir, "video-summaries-raw.json"),
          JSON.stringify(nonNullRaw, null, 2),
          "utf8",
        );

        videoSummaries = nonNullRaw.filter((s) => s.niche_fit !== "off-topic");
        videosAnalyzedCount = videoSummaries.length;

        await writeFile(
          path.join(jobDir, "video-summaries.json"),
          JSON.stringify(videoSummaries, null, 2),
          "utf8",
        );

        // Append every analyzed video's URL to the citation source registry
        // so the synthesizer can cite them and the verifier resolves.
        for (const v of videoSummaries) {
          await appendSource(jobDir, {
            url: v.url,
            text: `[VIDEO ANALYZED] ${v.title}\nUploader: ${v.uploader}\nViews: ${v.views}\nHook: ${v.hook_first_3s}\nWhy works: ${v.why_works}`,
            retrievedAt: new Date().toISOString(),
            score: 1,
            kind: "video",
            platform: v.platform,
            virality: v.viralityScore,
          });
        }
      }
    }
  }

  if (deadline && Date.now() > deadline) {
    throw new Error("budget exceeded after video phase");
  }

  // ── Phase 5: Synthesize ────────────────────────────────────────────────
  emit({ kind: "synthesize_start" });
  const report = await synthesizeReport({
    query: opts.query,
    plan: {
      intent: plan.intent,
      audience_jtbd: plan.audience_jtbd,
      platforms: plan.platforms,
    },
    summaries: goodSummaries.length >= 5 ? goodSummaries : summaries,
    videoSummaries,
    model: opts.synthModel,
    projectId: jobId,
  });
  const reportPath = path.join(jobDir, "report.md");
  await writeFile(reportPath, report, "utf8");
  const words = report.split(/\s+/).filter(Boolean).length;
  emit({ kind: "synthesize_done", words });

  // ── Phase 6: Verify citations ──────────────────────────────────────────
  const finalRegistry = await loadRegistry(jobDir);
  const citedUrls = extractUrls(report);
  const verify = verifyCitations(citedUrls, finalRegistry);
  const rate = citedUrls.length === 0 ? 0 : verify.matched.length / citedUrls.length;

  // Append verification footer to report.md so the user sees the gate result.
  const verifyFooter = [
    "",
    "---",
    "",
    "## Verification",
    "",
    `- Total inline citations: **${citedUrls.length}**`,
    `- Verified against source registry: **${verify.matched.length}** (${(rate * 100).toFixed(1)}%)`,
    `- Unmatched / flagged: **${verify.unmatched.length}**`,
    `- By level: exact=${verify.byLevel.exact}, truncation=${verify.byLevel.truncation}, prefix=${verify.byLevel.prefix}, child-path=${verify.byLevel["child-path"]}, query-subset=${verify.byLevel["query-subset"]}`,
    verify.unmatched.length
      ? `\nUnmatched URLs (verifier flagged — likely fabricated or stale):\n${verify.unmatched.map((u) => `- ${u}`).join("\n")}`
      : "",
  ].filter((s) => s !== "").join("\n");
  await appendFile(reportPath, "\n" + verifyFooter + "\n");
  emit({ kind: "verify_done", matched: verify.matched.length, unmatched: verify.unmatched.length, rate });

  await writeFile(
    path.join(jobDir, "verify.json"),
    JSON.stringify({ rate, ...verify }, null, 2),
    "utf8",
  );

  return {
    jobId,
    jobDir,
    query: opts.query,
    plan,
    sourcesAttempted: targets.length,
    sourcesFetched: okCount,
    sourcesSummarized: goodSummaries.length,
    videosDiscovered: videosDiscoveredCount,
    videosMetaProbed: videosMetaProbedCount,
    videosAnalyzed: videosAnalyzedCount,
    report,
    reportPath,
    registryPath: path.join(jobDir, "sources.jsonl"),
    verify,
    citationRate: rate,
  };
}
