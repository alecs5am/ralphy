// Free YouTube comment pull for OUR OWN videos (#582): `yt-dlp --write-comments`
// with `--dump-single-json`, logged out (no cookies, `--ignore-config`), for a
// single video URL the agent passes explicitly. The output is converted into
// the ordinary comment payload, so it goes through the same validation,
// classification, dry-run, and `--yes` write as a screenshot reading.

import { spawn, spawnSync } from "node:child_process";
import { DomainError } from "../errors/domain.js";

export interface YtdlpRunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export type CommentYtdlpRunner = (args: string[], options: { timeoutMs: number }) => Promise<YtdlpRunResult>;

export const DEFAULT_YTDLP_MAX_COMMENTS = 500;
const YTDLP_TIMEOUT_MS = 180_000;
const MAX_STDOUT_BYTES = 64 * 1024 * 1024;
const FORBIDDEN_FLAGS = ["--cookies", "--cookies-from-browser", "--username", "--password", "--netrc"];

/** The video id of a single YouTube video URL (watch, youtu.be, shorts, live, embed), else null. */
export function youtubeVideoId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(?:www\.|m\.|music\.)/u, "");
  const id = /^[A-Za-z0-9_-]{11}$/u;
  if (host === "youtu.be") {
    const candidate = url.pathname.split("/")[1] ?? "";
    return id.test(candidate) ? candidate : null;
  }
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (url.pathname === "/watch") {
    const candidate = url.searchParams.get("v") ?? "";
    return id.test(candidate) ? candidate : null;
  }
  const match = /^\/(?:shorts|live|embed)\/([^/?#]+)/u.exec(url.pathname);
  return match && id.test(match[1]!) ? match[1]! : null;
}

export function ytdlpCommentArgs(url: string, maxComments: number): string[] {
  return [
    "--ignore-config",
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    "--write-comments",
    "--extractor-args",
    `youtube:max_comments=${Math.max(1, Math.floor(maxComments))};comment_sort=top`,
    "--socket-timeout",
    "20",
    "--dump-single-json",
    url,
  ];
}

export const runCommentYtdlp: CommentYtdlpRunner = (args, options) => {
  for (const arg of args) {
    if (FORBIDDEN_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`))) {
      throw new Error(`comment pulls run logged out; refusing ${arg}`);
    }
  }
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, options.timeoutMs);
    proc.stdout?.on("data", (chunk) => {
      if (stdout.length < MAX_STDOUT_BYTES) stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk) => {
      if (stderr.length < 64_000) stderr += chunk.toString();
    });
    proc.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}\nERROR: ${error.message}`, timedOut });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
};

export interface YtdlpCommentsResult {
  videoId: string;
  url: string;
  durationSec: number | null;
  commentCount: number | null;
  /** Ordinary comment-payload entries (pre-validation). */
  comments: Array<Record<string, unknown>>;
}

/** Convert a yt-dlp info JSON (with `comments`) into comment-payload entries. */
export function convertYtdlpInfo(info: unknown, requestedId: string): YtdlpCommentsResult {
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new DomainError("E_VALIDATION_FAILED", undefined, { target: "yt-dlp output", detail: "expected one video info JSON object" });
  }
  const record = info as Record<string, unknown>;
  const videoId = typeof record.id === "string" ? record.id : "";
  if (videoId !== requestedId) {
    throw new DomainError("E_VALIDATION_FAILED", undefined, {
      target: "yt-dlp output",
      detail: `yt-dlp returned video "${videoId || "?"}", expected "${requestedId}"`,
    });
  }
  const raw = Array.isArray(record.comments) ? record.comments : [];
  const comments: Array<Record<string, unknown>> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) continue;
    const out: Record<string, unknown> = { text };
    if (typeof item.id === "string" && item.id) out.id = item.id;
    const author = typeof item.author_id === "string" && item.author_id
      ? item.author_id
      : typeof item.author === "string" && item.author
        ? item.author
        : null;
    if (author) out.author = author;
    if (typeof item.like_count === "number" && Number.isInteger(item.like_count) && item.like_count >= 0) out.likes = item.like_count;
    if (typeof item.timestamp === "number" && Number.isFinite(item.timestamp) && item.timestamp > 0) {
      out.postedAt = Math.round(item.timestamp * 1000);
    }
    if (typeof item.parent === "string" && item.parent && item.parent !== "root") out.replyTo = item.parent;
    if (item.is_pinned === true) out.pinned = true;
    if (item.author_is_uploader === true) out.byCreator = true;
    comments.push(out);
  }
  return {
    videoId,
    url: typeof record.webpage_url === "string" ? record.webpage_url : `https://www.youtube.com/watch?v=${videoId}`,
    durationSec: typeof record.duration === "number" && record.duration > 0 ? record.duration : null,
    commentCount: typeof record.comment_count === "number" ? record.comment_count : null,
    comments,
  };
}

/** Pull the comments of one explicitly passed YouTube video URL. */
export async function fetchYoutubeComments(input: {
  url: string;
  maxComments?: number;
  runner?: CommentYtdlpRunner;
}): Promise<YtdlpCommentsResult> {
  const videoId = youtubeVideoId(input.url);
  if (!videoId) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "from-ytdlp",
      detail: "expected one YouTube video URL (watch?v=, youtu.be/, or /shorts/); playlists and channels are refused",
    });
  }
  const runner = input.runner ?? runCommentYtdlp;
  if (!input.runner && spawnSync("which", ["yt-dlp"], { stdio: "ignore" }).status !== 0) {
    throw new DomainError("E_DEP_MISSING", undefined, { dep: "yt-dlp" });
  }
  const result = await runner(ytdlpCommentArgs(input.url, input.maxComments ?? DEFAULT_YTDLP_MAX_COMMENTS), {
    timeoutMs: YTDLP_TIMEOUT_MS,
  });
  if (result.code !== 0 || result.timedOut) {
    const tail = result.stderr.trim().split("\n").slice(-3).join(" | ");
    throw new DomainError("E_PROVIDER_UNAVAILABLE", undefined, {
      provider: "yt-dlp",
      detail: (result.timedOut ? "timed out" : tail || `exit ${result.code}`).slice(0, 500),
    });
  }
  let info: unknown;
  try {
    info = JSON.parse(result.stdout);
  } catch {
    throw new DomainError("E_VALIDATION_FAILED", undefined, { target: "yt-dlp output", detail: "yt-dlp did not print JSON" });
  }
  return convertYtdlpInfo(info, videoId);
}
