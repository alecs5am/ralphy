// Scrape-profile orchestrator. Given a creator's profile URL:
//   1. yt-dlp lists their N most recent videos.
//   2. For each: pull mp4 (or thumbnail+subs fallback) + frames.
//   3. Vision-summarize via gemini-3.1-pro-preview.
//   4. Distill into a STYLE SHEET report — what the creator's formula is
//      and how to reproduce it.
//
// Bypasses the planner / web fan-out / niche-research synthesis. This is a
// focused single-creator style extraction.

import { mkdir, rm } from "node:fs/promises";
import {
  listProfileVideos,
  type ProfileVideoRef,
} from "./retrievers/profile-scrape.js";
import {
  pullVideoFull,
  computeViralityScore,
  type VideoMeta,
} from "./retrievers/video.js";
import { summarizeVideo, type VideoSummary } from "./video-summarizer.js";
import { findSource, type RegistryRecord } from "./source-registry.js";
import { distillCreatorStyleSheet } from "./creator-stylesheet.js";
import { extractUrls } from "./url-extractor.js";
import { verifyCitations, type VerifyResult } from "./citation-verifier.js";
import { getCommandContext } from "../context-state.js";
import { openDomainDb } from "../store/db.js";
import { getRun } from "../store/runs.js";
import { jobDirFor, recordResearchResult } from "./orchestrator.js";

export type ScrapeProfileOptions = {
  profileUrl: string;
  jobId?: string;
  /** Number of recent videos to analyze. Default 50. */
  max?: number;
  /** Optional niche context to ground the style sheet. */
  niche?: string;
  pullConcurrency?: number;
  summaryConcurrency?: number;
  summaryModel?: string;
  synthModel?: string;
  onEvent?: (e: ProfileEvent) => void;
  budgetSeconds?: number;
  /** Re-analyze an existing scrape job in-place: skip listing + pull, read
   *  the per-video dirs the previous run left on disk, run the (updated)
   *  summarizer and style-sheet over them. Saves the cost + time of
   *  re-downloading 50 mp4s when the prompt is what changed. */
  reanalyzeFrom?: string;
};

export type ProfileEvent =
  | { kind: "list_start"; profileUrl: string; max: number }
  | { kind: "list_done"; total: number }
  | { kind: "pull_start"; total: number }
  | { kind: "pull_progress"; done: number; total: number; ok: number; failed: number }
  | { kind: "summarize_start"; total: number }
  | { kind: "summarize_progress"; done: number; total: number }
  | { kind: "synthesize_start" }
  | { kind: "synthesize_done"; words: number }
  | { kind: "verify_done"; matched: number; unmatched: number; rate: number };

export type ScrapeProfileResult = {
  jobId: string;
  runId: string;
  profileUrl: string;
  creatorHandle: string;
  videosListed: number;
  videosPulled: number;
  videosAnalyzed: number;
  report: string;
  reportDocumentId: string;
  reportRevisionId: string;
  sourcesDocumentId: string;
  verify: VerifyResult;
  citationRate: number;
};

type ProfileAnalysisPlan = {
  kind: "creator-profile";
  profileUrl: string;
  creatorHandle: string;
  niche?: string;
  videosListed: number;
  videosPulled: number;
  videoSummaries: VideoSummary[];
  reanalyzedFrom?: string;
};

export function recordProfileScrapeResult(input: {
  profileUrl: string;
  creatorHandle: string;
  niche?: string;
  videosListed: number;
  videosPulled: number;
  videoSummaries: VideoSummary[];
  sources: RegistryRecord[];
  report: string;
  verify: VerifyResult & { rate: number };
  reanalyzedFrom?: string;
}) {
  const plan: ProfileAnalysisPlan = {
    kind: "creator-profile",
    profileUrl: input.profileUrl,
    creatorHandle: input.creatorHandle,
    niche: input.niche,
    videosListed: input.videosListed,
    videosPulled: input.videosPulled,
    videoSummaries: input.videoSummaries,
    reanalyzedFrom: input.reanalyzedFrom,
  };
  return recordResearchResult({
    query: `Creator style: ${input.creatorHandle}`,
    plan,
    sources: input.sources,
    report: input.report,
    verify: input.verify,
  });
}

function loadProfileAnalysis(runId: string): ProfileAnalysisPlan {
  const context = getCommandContext();
  if (!context) throw new Error("Profile re-analysis requires an explicit Workspace context");
  const queryContext = context.kind === "session"
    ? { sessionId: context.sessionId }
    : { workspaceId: context.workspaceId, projectId: context.projectId };
  getRun({ context: queryContext, runId });
  const row = openDomainDb()
    .query<{ body: string }, [string]>(
      `SELECT revision.body
       FROM run_results result
       JOIN document_revisions revision ON revision.id = result.entity_id
       WHERE result.run_id = ?
         AND result.position = 0
         AND result.entity_type = 'document_revision'`,
    )
    .get(runId);
  if (!row) throw new Error(`Profile analysis Run has no plan Document: ${runId}`);
  const parsed = JSON.parse(row.body) as { plan?: ProfileAnalysisPlan };
  if (parsed.plan?.kind !== "creator-profile" || !Array.isArray(parsed.plan.videoSummaries)) {
    throw new Error(`Run is not a creator profile analysis: ${runId}`);
  }
  return parsed.plan;
}

function extractHandle(profileUrl: string): string {
  try {
    const u = new URL(profileUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    // tiktok.com/@handle | youtube.com/@handle | instagram.com/handle
    for (const s of segs) {
      if (s.startsWith("@")) return s;
      if (
        u.host.includes("instagram.com") &&
        !["reels", "reel", "p", "explore", "tv"].includes(s)
      )
        return `@${s}`;
    }
    return profileUrl;
  } catch {
    return profileUrl;
  }
}

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
    "-",
    Math.random().toString(36).slice(2, 7),
  ].join("");
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
        results[i] = e as U;
      }
      done += 1;
      onProgress?.(done, total);
    }
  }
  const workers = Array(Math.min(concurrency, Math.max(1, total)))
    .fill(0)
    .map(() => take());
  await Promise.all(workers);
  return results;
}

export async function scrapeProfile(
  opts: ScrapeProfileOptions,
): Promise<ScrapeProfileResult> {
  const tempJobId = opts.jobId ?? `profile-${nowJobId()}`;
  const jobDir = jobDirFor(tempJobId);
  await mkdir(jobDir, { recursive: true });

  const max = opts.max ?? 50;
  const pullConcurrency = opts.pullConcurrency ?? 4;
  const summaryConcurrency = opts.summaryConcurrency ?? 3;
  let handle = extractHandle(opts.profileUrl);
  const deadline = opts.budgetSeconds
    ? Date.now() + opts.budgetSeconds * 1000
    : null;
  const emit = (event: ProfileEvent) => opts.onEvent?.(event);

  try {
    let refs: ProfileVideoRef[] = [];
    let videosListed = 0;
    let videosPulled = 0;
    let videoSummaries: VideoSummary[];

    if (opts.reanalyzeFrom) {
      const previous = loadProfileAnalysis(opts.reanalyzeFrom);
      handle = previous.creatorHandle;
      videosListed = previous.videosListed;
      videosPulled = previous.videosPulled;
      videoSummaries = previous.videoSummaries;
      emit({ kind: "list_start", profileUrl: previous.profileUrl, max: videosListed });
      emit({ kind: "list_done", total: videosListed });
      emit({ kind: "pull_start", total: videosListed });
      emit({
        kind: "pull_progress",
        done: videosListed,
        total: videosListed,
        ok: videosPulled,
        failed: Math.max(0, videosListed - videosPulled),
      });
      emit({ kind: "summarize_start", total: videoSummaries.length });
      emit({ kind: "summarize_progress", done: videoSummaries.length, total: videoSummaries.length });
    } else {
      emit({ kind: "list_start", profileUrl: opts.profileUrl, max });
      refs = await listProfileVideos(opts.profileUrl, { max });
      videosListed = refs.length;
      emit({ kind: "list_done", total: refs.length });
      if (refs.length === 0) {
        throw new Error(
          `Profile listing returned 0 videos for ${opts.profileUrl}. yt-dlp may not support this platform/profile, or the profile is private. Try a TikTok or YouTube channel URL.`,
        );
      }
      if (deadline && Date.now() > deadline) {
        throw new Error("budget exceeded after listing phase");
      }

      let failedPulls = 0;
      emit({ kind: "pull_start", total: refs.length });
      const pulled = await runConcurrent(
        refs,
        async (ref) => {
          const safeId = ref.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)
            || `vid${Math.random().toString(36).slice(2, 8)}`;
          const result = await pullVideoFull(ref.url, `${jobDir}/videos/${ref.platform}-${safeId}`, {
            numFrames: 8,
            maxDurationSec: 240,
            maxFilesize: "30M",
            timeoutMs: 90_000,
          }).catch(() => null);
          if (result && (result.framePaths.length > 0 || result.transcript.length > 50)) {
            videosPulled += 1;
          } else {
            failedPulls += 1;
          }
          return { ref, pull: result };
        },
        pullConcurrency,
        (done, total) => {
          if (done % 3 === 0 || done === total) {
            emit({ kind: "pull_progress", done, total, ok: videosPulled, failed: failedPulls });
          }
        },
      );
      const ready = pulled.filter(
        (item): item is { ref: ProfileVideoRef; pull: NonNullable<typeof item.pull> } =>
          item.pull !== null
          && (item.pull.framePaths.length > 0 || item.pull.transcript.length > 50),
      );
      if (deadline && Date.now() > deadline) {
        throw new Error("budget exceeded after pull phase");
      }

      emit({ kind: "summarize_start", total: ready.length });
      const rawSummaries = await runConcurrent(
        ready,
        async ({ pull }) => {
          try {
            const meta: VideoMeta = pull.meta;
            return await summarizeVideo({
              meta,
              mp4Path: pull.mp4Path,
              framePaths: pull.framePaths,
              transcript: pull.transcript,
              niche: opts.niche ?? `style analysis of ${handle}`,
              viralityScore: computeViralityScore(meta),
              model: opts.summaryModel,
              projectId: tempJobId,
            });
          } catch {
            return null;
          }
        },
        summaryConcurrency,
        (done, total) => {
          if (done % 3 === 0 || done === total) {
            emit({ kind: "summarize_progress", done, total });
          }
        },
      );
      videoSummaries = rawSummaries.filter(
        (summary): summary is VideoSummary => summary !== null,
      );
    }

    if (deadline && Date.now() > deadline) {
      throw new Error("budget exceeded after summarize phase");
    }

    const sources: RegistryRecord[] = [];
    for (const video of videoSummaries) {
      if (findSource(sources, video.url)) continue;
      sources.push({
        url: video.url,
        text: `[VIDEO ANALYZED] ${video.title}\nUploader: ${video.uploader}\nViews: ${video.views}\nHook: ${video.hook_first_3s}\nBody: ${video.body_structure}\nWhy works: ${video.why_works}\nReplicable: ${video.replicable_template}`,
        retrievedAt: new Date().toISOString(),
        score: 1,
        kind: "video",
        platform: video.platform,
        virality: video.viralityScore,
      });
    }

    emit({ kind: "synthesize_start" });
    const report = await distillCreatorStyleSheet({
      creatorHandle: handle,
      profileUrl: opts.profileUrl,
      niche: opts.niche,
      videoSummaries,
      model: opts.synthModel,
      projectId: tempJobId,
    });
    emit({ kind: "synthesize_done", words: report.split(/\s+/).filter(Boolean).length });

    const citedUrls = extractUrls(report);
    const verify = verifyCitations(citedUrls, sources);
    const rate = citedUrls.length === 0 ? 0 : verify.matched.length / citedUrls.length;
    const verifyFooter = [
      "",
      "---",
      "",
      "## Verification",
      "",
      `- Total inline citations: **${citedUrls.length}**`,
      `- Verified against video corpus: **${verify.matched.length}** (${(rate * 100).toFixed(1)}%)`,
      `- Unmatched / flagged: **${verify.unmatched.length}**`,
      verify.unmatched.length
        ? `\nUnmatched URLs (verifier flagged — likely fabricated):\n${verify.unmatched.map((url) => `- ${url}`).join("\n")}`
        : "",
    ].filter((line) => line !== "").join("\n");
    const fullReport = `${report}\n${verifyFooter}\n`;
    emit({
      kind: "verify_done",
      matched: verify.matched.length,
      unmatched: verify.unmatched.length,
      rate,
    });

    const recorded = recordProfileScrapeResult({
      profileUrl: opts.profileUrl,
      creatorHandle: handle,
      niche: opts.niche,
      videosListed,
      videosPulled,
      videoSummaries,
      sources,
      report: fullReport,
      verify: { ...verify, rate },
      reanalyzedFrom: opts.reanalyzeFrom,
    });
    return {
      jobId: tempJobId,
      runId: recorded.runId,
      profileUrl: opts.profileUrl,
      creatorHandle: handle,
      videosListed,
      videosPulled,
      videosAnalyzed: videoSummaries.length,
      report: fullReport,
      reportDocumentId: recorded.reportDocumentId,
      reportRevisionId: recorded.reportRevisionId,
      sourcesDocumentId: recorded.sourcesDocumentId,
      verify,
      citationRate: rate,
    };
  } finally {
    await rm(jobDir, { recursive: true, force: true });
  }
}
