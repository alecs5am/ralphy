// Scrape-profile orchestrator. Given a creator's profile URL:
//   1. yt-dlp lists their N most recent videos.
//   2. For each: pull mp4 (or thumbnail+subs fallback) + frames.
//   3. Vision-summarize via gemini-3.1-pro-preview.
//   4. Distill into a STYLE SHEET report — what the creator's formula is
//      and how to reproduce it.
//
// Bypasses the planner / web fan-out / niche-research synthesis. This is a
// focused single-creator style extraction.

import { mkdir, writeFile, appendFile, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { researchJobsDir } from "../paths.js";
import {
  listProfileVideos,
  type ProfileVideoRef,
} from "./retrievers/profile-scrape.js";
import {
  pullVideoFull,
  pullVideoMeta,
  computeViralityScore,
  vttToPlainText,
  type VideoMeta,
} from "./retrievers/video.js";
import { summarizeVideo, type VideoSummary } from "./video-summarizer.js";
import { appendSource, loadRegistry } from "./source-registry.js";
import { distillCreatorStyleSheet } from "./creator-stylesheet.js";
import { extractUrls } from "./url-extractor.js";
import { verifyCitations, type VerifyResult } from "./citation-verifier.js";

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
  jobDir: string;
  profileUrl: string;
  creatorHandle: string;
  videosListed: number;
  videosPulled: number;
  videosAnalyzed: number;
  report: string;
  reportPath: string;
  registryPath: string;
  verify: VerifyResult;
  citationRate: number;
};

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
  const jobId = opts.jobId ?? `profile-${nowJobId()}`;
  const jobDir = path.join(researchJobsDir(), jobId);
  await mkdir(jobDir, { recursive: true });

  const max = opts.max ?? 50;
  const pullConcurrency = opts.pullConcurrency ?? 4;
  const summaryConcurrency = opts.summaryConcurrency ?? 3;
  let handle = extractHandle(opts.profileUrl);
  const deadline = opts.budgetSeconds
    ? Date.now() + opts.budgetSeconds * 1000
    : null;

  const emit = (e: ProfileEvent) => {
    opts.onEvent?.(e);
    void appendFile(
      path.join(jobDir, "events.jsonl"),
      JSON.stringify({ ts: new Date().toISOString(), ...(e as object) }) + "\n",
    );
  };

  let refs: ProfileVideoRef[];
  let ready: Array<{ ref: ProfileVideoRef; pull: NonNullable<Awaited<ReturnType<typeof pullVideoFull>>> }>;
  let okPull = 0;
  let failPull = 0;

  if (opts.reanalyzeFrom) {
    // ── Re-analyze path: skip listing + pull, read existing job dir ─────
    const srcDir = path.join(researchJobsDir(), opts.reanalyzeFrom);
    const listingRaw = await readFile(path.join(srcDir, "profile-listing.json"), "utf8");
    const listing = JSON.parse(listingRaw) as {
      profileUrl: string;
      handle: string;
      refs: ProfileVideoRef[];
    };
    refs = listing.refs;
    handle = listing.handle ?? handle;
    emit({ kind: "list_start", profileUrl: listing.profileUrl, max: refs.length });
    emit({ kind: "list_done", total: refs.length });
    // Persist the listing into the new jobDir for traceability.
    await writeFile(
      path.join(jobDir, "profile-listing.json"),
      JSON.stringify({ ...listing, reanalyzedFrom: opts.reanalyzeFrom }, null, 2),
      "utf8",
    );

    emit({ kind: "pull_start", total: refs.length });
    const loaded = await Promise.all(
      refs.map(async (ref) => {
        const safeId =
          ref.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "";
        const vDir = path.join(srcDir, "videos", `${ref.platform}-${safeId}`);
        try {
          const entries = await readdir(vDir);
          const mp4Path = entries.find((e) => e === "video.mp4")
            ? path.join(vDir, "video.mp4")
            : null;
          const framesDirEntries = entries.includes("frames")
            ? await readdir(path.join(vDir, "frames")).catch(() => [])
            : [];
          const framePaths = framesDirEntries
            .filter((f) => f.endsWith(".jpg"))
            .sort()
            .map((f) => path.join(vDir, "frames", f));
          const vttFile = entries.find((e) => e.endsWith(".vtt"));
          let transcript = "";
          if (vttFile) {
            const raw = await readFile(path.join(vDir, vttFile), "utf8");
            transcript = vttToPlainText(raw);
          }
          // Re-fetch metadata cheap (no network if cached, but pullVideoMeta
          // does a yt-dlp call — accept this small cost to keep view counts
          // fresh).
          const meta = await pullVideoMeta(ref.url).catch(() => null);
          if (!meta) {
            failPull += 1;
            return { ref, pull: null };
          }
          // Verify the video dir actually has data we can analyze.
          if (!mp4Path && framePaths.length === 0 && transcript.length < 50) {
            failPull += 1;
            return { ref, pull: null };
          }
          okPull += 1;
          return {
            ref,
            pull: {
              meta,
              mp4Path,
              framePaths,
              transcript,
              videoDir: vDir,
              mode: (mp4Path
                ? "full"
                : framePaths.length > 0
                  ? "thumbnail"
                  : "meta-only") as "full" | "thumbnail" | "meta-only",
            },
          };
        } catch {
          failPull += 1;
          return { ref, pull: null };
        }
      }),
    );
    emit({
      kind: "pull_progress",
      done: refs.length,
      total: refs.length,
      ok: okPull,
      failed: failPull,
    });

    ready = loaded.filter(
      (p): p is { ref: ProfileVideoRef; pull: NonNullable<typeof p.pull> } =>
        p.pull !== null,
    );
  } else {
    // ── Fresh path: list + pull ─────────────────────────────────────────
    emit({ kind: "list_start", profileUrl: opts.profileUrl, max });
    refs = await listProfileVideos(opts.profileUrl, { max });
    emit({ kind: "list_done", total: refs.length });

    await writeFile(
      path.join(jobDir, "profile-listing.json"),
      JSON.stringify({ profileUrl: opts.profileUrl, handle, refs }, null, 2),
      "utf8",
    );

    if (refs.length === 0) {
      throw new Error(
        `Profile listing returned 0 videos for ${opts.profileUrl}. yt-dlp may not support this platform/profile, or the profile is private. Try a TikTok or YouTube channel URL.`,
      );
    }

    if (deadline && Date.now() > deadline) {
      throw new Error("budget exceeded after listing phase");
    }

    emit({ kind: "pull_start", total: refs.length });
    const pulled = await runConcurrent(
      refs,
      async (ref) => {
        const safeId =
          ref.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) ||
          `vid${Math.random().toString(36).slice(2, 8)}`;
        const vDir = path.join(jobDir, "videos", `${ref.platform}-${safeId}`);
        const r = await pullVideoFull(ref.url, vDir, {
          numFrames: 8,
          maxDurationSec: 240,
          maxFilesize: "30M",
          timeoutMs: 90_000,
        }).catch(() => null);
        if (r && (r.framePaths.length > 0 || r.transcript.length > 50)) {
          okPull += 1;
        } else {
          failPull += 1;
        }
        return { ref, pull: r };
      },
      pullConcurrency,
      (done, total) => {
        if (done % 3 === 0 || done === total) {
          emit({
            kind: "pull_progress",
            done,
            total,
            ok: okPull,
            failed: failPull,
          });
        }
      },
    );

    ready = pulled.filter(
      (
        p,
      ): p is { ref: ProfileVideoRef; pull: NonNullable<typeof p.pull> } =>
        p.pull !== null &&
        (p.pull.framePaths.length > 0 || p.pull.transcript.length > 50),
    );

    if (deadline && Date.now() > deadline) {
      throw new Error("budget exceeded after pull phase");
    }
  }

  // ── Phase 3: Summarize ────────────────────────────────────────────────
  emit({ kind: "summarize_start", total: ready.length });
  const rawSummaries = await runConcurrent(
    ready,
    async ({ ref, pull }) => {
      try {
        // Use pull.meta (fully populated by pullVideoMeta) as the
        // authoritative metadata. The flat-listing values are a fallback.
        const meta: VideoMeta = pull.meta;
        const viralityScore = computeViralityScore(meta);
        return await summarizeVideo({
          meta,
          mp4Path: pull.mp4Path,
          framePaths: pull.framePaths,
          transcript: pull.transcript,
          niche: opts.niche ?? `style analysis of ${handle}`,
          viralityScore,
          model: opts.summaryModel,
          projectId: jobId,
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

  const nonNullRaw = rawSummaries.filter(
    (s): s is VideoSummary => s !== null,
  );
  await writeFile(
    path.join(jobDir, "video-summaries-raw.json"),
    JSON.stringify(nonNullRaw, null, 2),
    "utf8",
  );

  // For a single-creator scrape we DON'T filter off-topic — the creator IS
  // the target. We keep every video they posted; the style sheet should
  // characterize the full spread.
  const videoSummaries = nonNullRaw;
  await writeFile(
    path.join(jobDir, "video-summaries.json"),
    JSON.stringify(videoSummaries, null, 2),
    "utf8",
  );

  // Append each analyzed video to the source registry so citations resolve.
  for (const v of videoSummaries) {
    await appendSource(jobDir, {
      url: v.url,
      text: `[VIDEO ANALYZED] ${v.title}\nUploader: ${v.uploader}\nViews: ${v.views}\nHook: ${v.hook_first_3s}\nBody: ${v.body_structure}\nWhy works: ${v.why_works}\nReplicable: ${v.replicable_template}`,
      retrievedAt: new Date().toISOString(),
      score: 1,
      kind: "video",
      platform: v.platform,
      virality: v.viralityScore,
    });
  }

  if (deadline && Date.now() > deadline) {
    throw new Error("budget exceeded after summarize phase");
  }

  // ── Phase 4: Style sheet ──────────────────────────────────────────────
  emit({ kind: "synthesize_start" });
  const report = await distillCreatorStyleSheet({
    creatorHandle: handle,
    profileUrl: opts.profileUrl,
    niche: opts.niche,
    videoSummaries,
    model: opts.synthModel,
    projectId: jobId,
  });
  const reportPath = path.join(jobDir, "style-sheet.md");
  await writeFile(reportPath, report, "utf8");
  const words = report.split(/\s+/).filter(Boolean).length;
  emit({ kind: "synthesize_done", words });

  // ── Phase 5: Verify citations ─────────────────────────────────────────
  const finalRegistry = await loadRegistry(jobDir);
  const citedUrls = extractUrls(report);
  const verify = verifyCitations(citedUrls, finalRegistry);
  const rate =
    citedUrls.length === 0 ? 0 : verify.matched.length / citedUrls.length;

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
      ? `\nUnmatched URLs (verifier flagged — likely fabricated):\n${verify.unmatched
          .map((u) => `- ${u}`)
          .join("\n")}`
      : "",
  ]
    .filter((s) => s !== "")
    .join("\n");
  await appendFile(reportPath, "\n" + verifyFooter + "\n");
  emit({
    kind: "verify_done",
    matched: verify.matched.length,
    unmatched: verify.unmatched.length,
    rate,
  });
  await writeFile(
    path.join(jobDir, "verify.json"),
    JSON.stringify({ rate, ...verify }, null, 2),
    "utf8",
  );

  return {
    jobId,
    jobDir,
    profileUrl: opts.profileUrl,
    creatorHandle: handle,
    videosListed: refs.length,
    videosPulled: okPull,
    videosAnalyzed: videoSummaries.length,
    report,
    reportPath,
    registryPath: path.join(jobDir, "sources.jsonl"),
    verify,
    citationRate: rate,
  };
}
