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

// yt-dlp's --print %()j produces JSON of *just the fields named*, which
// bypasses the n-challenge / format-resolution that --dump-single-json
// requires. Critical for YouTube — YouTube refuses format resolution to
// programmatic clients in 2026, but the metadata fields are still served.
const META_FIELDS = [
  "id",
  "title",
  "webpage_url",
  "uploader",
  "uploader_id",
  "channel",
  "channel_url",
  "duration",
  "view_count",
  "like_count",
  "heart_count",
  "comment_count",
  "repost_count",
  "share_count",
  "upload_date",
  "description",
  "thumbnail",
  "tags",
].join(",");

export async function pullVideoMeta(
  url: string,
  opts: { timeoutMs?: number; cookiesFromBrowser?: string } = {},
): Promise<VideoMeta | null> {
  if (!ensureBin("yt-dlp")) {
    throw new Error("yt-dlp not on PATH; install via `brew install yt-dlp`");
  }
  const cookiesFromBrowser = opts.cookiesFromBrowser ?? "chrome";

  const r = await run(
    "yt-dlp",
    [
      "--js-runtimes",
      "node",
      ...(cookiesFromBrowser ? ["--cookies-from-browser", cookiesFromBrowser] : []),
      "--print",
      `%(.{${META_FIELDS}})j`,
      "--no-download",
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout",
      "10",
      "--ignore-no-formats-error",
      url,
    ],
    { timeoutMs: opts.timeoutMs ?? 25_000 },
  );

  // --print emits the JSON line to stdout even on partial errors; check
  // stdout first.
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
  if (line) {
    try {
      const raw = JSON.parse(line) as RawVideoMeta;
      return normalizeVideoMeta(raw, url);
    } catch {
      // fall through to fallback below
    }
  }

  // Fallback path: try without cookies (TikTok / IG / X don't need them and
  // chrome cookie extraction sometimes fails to acquire the keychain lock).
  if (cookiesFromBrowser) {
    const r2 = await run(
      "yt-dlp",
      [
        "--js-runtimes",
        "node",
        "--print",
        `%(.{${META_FIELDS}})j`,
        "--no-download",
        "--no-playlist",
        "--no-warnings",
        "--socket-timeout",
        "10",
        "--ignore-no-formats-error",
        url,
      ],
      { timeoutMs: opts.timeoutMs ?? 25_000 },
    );
    const line2 = r2.stdout.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
    if (line2) {
      try {
        const raw = JSON.parse(line2) as RawVideoMeta;
        return normalizeVideoMeta(raw, url);
      } catch {
        return null;
      }
    }
  }

  return null;
}

export type FullPullResult = {
  meta: VideoMeta;
  mp4Path: string | null;
  framePaths: string[];
  transcript: string;
  videoDir: string;
  /** "full" — mp4 + N frames sampled; "thumbnail" — thumbnail+subs only;
   *  "meta-only" — neither (still useful for view-count / title citation). */
  mode: "full" | "thumbnail" | "meta-only";
};

export type FullPullOptions = {
  /** N frames to sample evenly across the clip. */
  numFrames?: number;
  /** Max video duration to download in seconds. Anything longer falls back to thumbnail mode. */
  maxDurationSec?: number;
  /** Max filesize hint to yt-dlp. */
  maxFilesize?: string;
  timeoutMs?: number;
  /** Browser to pull cookies from. yt-dlp needs cookies to bypass YouTube's
   *  "Sign in to confirm you're not a bot" gate. */
  cookiesFromBrowser?: string;
};

const COMMON_YTDLP_ARGS = [
  // YouTube requires a JS runtime for signature deciphering; without it yt-dlp
  // returns a 403 "no JS runtime available". Node is a hard repo prerequisite,
  // so pinning it is safe (issue #119).
  "--js-runtimes",
  "node",
  "--no-playlist",
  "--no-warnings",
  "--socket-timeout",
  "15",
  "--ignore-no-formats-error",
];

async function tryFullDownload(
  url: string,
  outDir: string,
  meta: VideoMeta,
  numFrames: number,
  maxFilesize: string,
  cookiesFromBrowser: string | undefined,
  timeoutMs: number,
): Promise<{ mp4Path: string; framePaths: string[] } | null> {
  const mp4Path = path.join(outDir, "video.mp4");
  const args = [
    ...(cookiesFromBrowser ? ["--cookies-from-browser", cookiesFromBrowser] : []),
    "-f",
    "bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4][height<=720]/b[height<=720]/b",
    "--merge-output-format",
    "mp4",
    "--max-filesize",
    maxFilesize,
    "--write-auto-subs",
    "--write-subs",
    "--sub-langs",
    "en-orig,en,en-US,en-GB",
    "--convert-subs",
    "vtt",
    ...COMMON_YTDLP_ARGS,
    "-o",
    mp4Path,
    url,
  ];
  const dl = await run("yt-dlp", args, { timeoutMs });
  if (dl.code !== 0) return null;
  if (!existsSync(mp4Path)) return null;

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
      String(numFrames * 2),
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
  if (framePaths.length === 0) return null;
  return { mp4Path, framePaths };
}

async function tryThumbnailFallback(
  url: string,
  outDir: string,
  cookiesFromBrowser: string | undefined,
  timeoutMs: number,
): Promise<{ framePaths: string[] } | null> {
  const stem = path.join(outDir, "thumb");
  const args = [
    ...(cookiesFromBrowser ? ["--cookies-from-browser", cookiesFromBrowser] : []),
    "--skip-download",
    "--write-thumbnail",
    "--write-auto-subs",
    "--write-subs",
    "--sub-langs",
    "en-orig,en,en-US,en-GB",
    "--convert-subs",
    "vtt",
    ...COMMON_YTDLP_ARGS,
    "-o",
    stem,
    url,
  ];
  const r = await run("yt-dlp", args, { timeoutMs });
  if (r.code !== 0) {
    // Even with --ignore-no-formats-error, the command can exit non-zero;
    // check if files showed up anyway.
  }

  // Find any image file produced. yt-dlp may emit .webp / .jpg / .jpeg / .png.
  const entries = await readdir(outDir).catch(() => []);
  const imgExtensions = [".jpg", ".jpeg", ".png", ".webp"];
  const imgs = entries
    .filter((e) => imgExtensions.includes(path.extname(e).toLowerCase()))
    .map((e) => path.join(outDir, e));
  if (imgs.length === 0) return null;

  // Normalize to JPEG so the vision LLM call shape is uniform.
  const jpegPath = path.join(outDir, "thumbnail.jpg");
  const ff = await run(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-i", imgs[0], "-q:v", "5", jpegPath],
    { timeoutMs: 10_000 },
  );
  if (ff.code !== 0 || !existsSync(jpegPath)) return null;
  return { framePaths: [jpegPath] };
}

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
  // Default cookies source: chrome (Safari containerized files are not readable).
  const cookiesFromBrowser = opts.cookiesFromBrowser ?? "chrome";

  const meta = await pullVideoMeta(url);
  if (!meta) return null;

  await mkdir(outDir, { recursive: true });

  // Phase A: full mp4 + frame sampling. Skipped for clips longer than max.
  let mode: FullPullResult["mode"] = "meta-only";
  let mp4Path: string | null = null;
  let framePaths: string[] = [];

  if (meta.durationSec > 0 && meta.durationSec <= maxDurationSec) {
    const full = await tryFullDownload(
      url,
      outDir,
      meta,
      numFrames,
      maxFilesize,
      cookiesFromBrowser,
      timeoutMs,
    ).catch(() => null);
    if (full) {
      mp4Path = full.mp4Path;
      framePaths = full.framePaths;
      mode = "full";
    }
  }

  // Phase B (fallback): thumbnail + subs only. Triggered when the mp4 path
  // failed (YouTube anti-bot, geo-block, age gate, etc.) or when the clip
  // was too long to download in full.
  if (framePaths.length === 0) {
    const thumb = await tryThumbnailFallback(
      url,
      outDir,
      cookiesFromBrowser,
      Math.min(45_000, timeoutMs),
    ).catch(() => null);
    if (thumb) {
      framePaths = thumb.framePaths;
      mode = "thumbnail";
    }
  }

  const transcript = await readSidecarTranscript(outDir);

  if (framePaths.length === 0 && !transcript) {
    return null;
  }

  return { meta, mp4Path, framePaths, transcript, videoDir: outDir, mode };
}

function existsSync(p: string): boolean {
  try {
    require("node:fs").accessSync(p);
    return true;
  } catch {
    return false;
  }
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
