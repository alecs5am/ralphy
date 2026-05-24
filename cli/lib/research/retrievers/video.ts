// Video retriever for the deep-research pipeline.
//
// Given a video URL (TikTok / YouTube Shorts / Instagram Reel / X / etc.):
//   1. yt-dlp --dump-json   → canonical VideoMeta
//   2. yt-dlp -f bv*+ba/b   → mp4 download (capped duration / filesize)
//   3. ffmpeg -vf "fps=…"   → N evenly-spaced JPEG frames
//   4. yt-dlp --write-auto-subs → vtt/srt → plain transcript text
//
// Pure helpers (URL detection, meta normalization, virality score) are unit
// tested. The shell-out wrappers are exercised by the live end-to-end run.

import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

export type VideoPlatform =
  | "tiktok"
  | "youtube"
  | "youtube-shorts"
  | "instagram-reel"
  | "instagram-post"
  | "x"
  | "reddit"
  | "facebook"
  | "other";

export type VideoMeta = {
  platform: VideoPlatform;
  id: string;
  title: string;
  url: string;
  uploaderHandle: string;
  uploaderName: string;
  durationSec: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  uploadedAt: string; // YYYY-MM-DD
  ageDays: number;
  engagementRate: number;
  description?: string;
  tags?: string[];
  thumbnail?: string;
};

export type RawVideoMeta = {
  id?: string;
  title?: string;
  webpage_url?: string;
  uploader?: string;
  uploader_id?: string;
  channel?: string;
  channel_url?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  heart_count?: number;
  comment_count?: number;
  repost_count?: number;
  share_count?: number;
  upload_date?: string;
  description?: string;
  tags?: string[];
  thumbnail?: string;
  [k: string]: unknown;
};

export function detectVideoUrl(url: string): VideoPlatform | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.host.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const p = u.pathname;

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    if (/\/(@[^/]+\/)?video\/\d+/i.test(p)) return "tiktok";
    if (host === "vm.tiktok.com" && p.length > 1) return "tiktok";
    return null;
  }
  if (host === "youtube.com") {
    if (/\/shorts\/[\w-]+/i.test(p)) return "youtube-shorts";
    if (/\/watch$/i.test(p) && u.searchParams.get("v")) return "youtube";
    return null;
  }
  if (host === "youtu.be" && p.length > 1) return "youtube";
  if (host === "instagram.com") {
    if (/\/reel(s)?\/[\w-]+/i.test(p)) return "instagram-reel";
    if (/^\/p\/[\w-]+/i.test(p)) return "instagram-post";
    return null;
  }
  if (host === "x.com" || host === "twitter.com") {
    if (/\/[^/]+\/status\/\d+/i.test(p)) return "x";
    return null;
  }
  if (host === "reddit.com" || host.endsWith(".reddit.com")) {
    if (/\/comments\/\w+/i.test(p) || /\/r\/[^/]+\/s\//i.test(p)) return "reddit";
    return null;
  }
  if (host === "facebook.com" || host === "fb.watch") {
    if (/\/(watch|reel|videos)\b/i.test(p) || host === "fb.watch") return "facebook";
    return null;
  }
  return null;
}

export function normalizeVideoMeta(
  raw: RawVideoMeta,
  sourceUrl: string,
  opts: { now?: Date } = {},
): VideoMeta {
  const detected = detectVideoUrl(sourceUrl);
  const platform: VideoPlatform = detected ?? "other";

  const id = String(raw.id ?? "");
  const title = String(raw.title ?? "");
  const uploaderHandle = String(raw.uploader_id ?? raw.uploader ?? "");
  const uploaderName = String(raw.channel ?? raw.uploader ?? "");

  const views = numOrZero(raw.view_count);
  const likes = numOrZero(raw.like_count ?? raw.heart_count);
  const comments = numOrZero(raw.comment_count);
  const shares = numOrZero(raw.repost_count ?? raw.share_count);

  const uploadedAt = parseUploadDate(raw.upload_date);
  const now = opts.now ?? new Date();
  const ageDays = uploadedAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(uploadedAt).getTime()) / 86_400_000))
    : 0;

  const engagementRate =
    views > 0 ? (likes + comments + shares) / views : 0;

  return {
    platform,
    id,
    title,
    url: sourceUrl,
    uploaderHandle,
    uploaderName,
    durationSec: numOrZero(raw.duration),
    views,
    likes,
    comments,
    shares,
    uploadedAt: uploadedAt ?? "",
    ageDays,
    engagementRate,
    description: raw.description,
    tags: raw.tags,
    thumbnail: raw.thumbnail,
  };
}

function numOrZero(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function parseUploadDate(d?: string): string | null {
  if (!d || typeof d !== "string") return null;
  const m = d.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// Virality = log-scaled views-per-day with engagement-rate multiplier.
// Resistant to age=0 (treat as 1 day for the denominator) and views=0.
export function computeViralityScore(m: VideoMeta): number {
  if (m.views <= 0) return 0;
  const daysFloor = Math.max(1, m.ageDays);
  const vpd = m.views / daysFloor;
  const base = Math.log10(vpd + 1);
  const engagementBoost = 1 + Math.min(0.5, m.engagementRate * 5);
  return base * engagementBoost;
}

// ─── Shell helpers ──────────────────────────────────────────────────────────

function ensureBin(bin: string): boolean {
  return spawnSync("which", [bin], { stdio: "ignore" }).status === 0;
}

function run(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const t = opts.timeoutMs
      ? setTimeout(() => proc.kill("SIGKILL"), opts.timeoutMs)
      : null;
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("error", () => {
      if (t) clearTimeout(t);
      resolve({ code: 1, stdout, stderr });
    });
    proc.on("close", (code) => {
      if (t) clearTimeout(t);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function pullVideoMeta(
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<VideoMeta | null> {
  if (!ensureBin("yt-dlp")) {
    throw new Error("yt-dlp not on PATH; install via `brew install yt-dlp`");
  }
  const r = await run(
    "yt-dlp",
    [
      "--dump-single-json",
      "--no-download",
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "10",
      url,
    ],
    { timeoutMs: opts.timeoutMs ?? 25_000 },
  );
  if (r.code !== 0) return null;
  try {
    const raw = JSON.parse(r.stdout) as RawVideoMeta;
    return normalizeVideoMeta(raw, url);
  } catch {
    return null;
  }
}

export type FullPullResult = {
  meta: VideoMeta;
  mp4Path: string;
  framePaths: string[];
  transcript: string;
  videoDir: string;
};

export type FullPullOptions = {
  /** N frames to sample evenly across the clip. */
  numFrames?: number;
  /** Max video duration to download in seconds. Anything longer is skipped. */
  maxDurationSec?: number;
  /** Max filesize hint to yt-dlp. */
  maxFilesize?: string;
  timeoutMs?: number;
};

export async function pullVideoFull(
  url: string,
  outDir: string,
  opts: FullPullOptions = {},
): Promise<FullPullResult | null> {
  if (!ensureBin("yt-dlp") || !ensureBin("ffmpeg")) {
    throw new Error("yt-dlp + ffmpeg required on PATH");
  }
  const numFrames = opts.numFrames ?? 8;
  const maxDurationSec = opts.maxDurationSec ?? 180;
  const maxFilesize = opts.maxFilesize ?? "30M";
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const meta = await pullVideoMeta(url);
  if (!meta) return null;
  if (meta.durationSec > maxDurationSec) return null;

  await mkdir(outDir, { recursive: true });
  const mp4Path = path.join(outDir, "video.mp4");
  const dl = await run(
    "yt-dlp",
    [
      "-f",
      "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b",
      "--merge-output-format",
      "mp4",
      "--max-filesize",
      maxFilesize,
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "15",
      "--write-auto-subs",
      "--write-subs",
      "--sub-langs",
      "en.*,en,*",
      "--sub-format",
      "vtt/srt/best",
      "--convert-subs",
      "vtt",
      "-o",
      mp4Path,
      url,
    ],
    { timeoutMs },
  );
  if (dl.code !== 0) return null;

  // Frames
  const framesDir = path.join(outDir, "frames");
  await mkdir(framesDir, { recursive: true });
  const fps = numFrames / Math.max(1, meta.durationSec);
  const framesOut = path.join(framesDir, "frame-%03d.jpg");
  const ff = await run(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-i",
      mp4Path,
      "-vf",
      `fps=${fps.toFixed(4)},scale=640:-2`,
      "-frames:v",
      String(numFrames * 2), // overshoot a bit; we trim below
      "-q:v",
      "5",
      framesOut,
    ],
    { timeoutMs: 30_000 },
  );
  if (ff.code !== 0) return null;

  const allFrames = (await readdir(framesDir).catch(() => [])).filter((f) =>
    f.endsWith(".jpg"),
  );
  allFrames.sort();
  const framePaths = allFrames.slice(0, numFrames).map((f) => path.join(framesDir, f));

  // Transcript — find any .vtt sidecar emitted by yt-dlp.
  const transcript = await readSidecarTranscript(outDir);

  return { meta, mp4Path, framePaths, transcript, videoDir: outDir };
}

async function readSidecarTranscript(dir: string): Promise<string> {
  const entries = await readdir(dir).catch(() => []);
  const vtt = entries.find((e) => e.endsWith(".vtt"));
  if (!vtt) return "";
  try {
    const raw = await readFile(path.join(dir, vtt), "utf8");
    return vttToPlainText(raw);
  } catch {
    return "";
  }
}

export function vttToPlainText(vtt: string): string {
  const lines = vtt.split(/\r?\n/);
  const out: string[] = [];
  let lastLine = "";
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^WEBVTT\b/i.test(line)) continue;
    if (/^\d+$/.test(line.trim())) continue; // cue number
    if (/-->/i.test(line)) continue; // timing line
    if (/^Kind:|^Language:|^NOTE\b|^STYLE\b/i.test(line)) continue;
    const stripped = line
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .trim();
    if (!stripped) continue;
    if (stripped === lastLine) continue;
    out.push(stripped);
    lastLine = stripped;
  }
  return out.join(" ");
}

export async function cleanupVideoDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

// helper to encode a frame to a data URI for vision LLMs
export async function frameToDataUri(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  const b64 = buf.toString("base64");
  return `data:image/jpeg;base64,${b64}`;
}

export { writeFile };
