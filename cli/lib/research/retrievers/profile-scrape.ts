// Profile scrape — given a creator's profile URL (TikTok / YouTube channel /
// other yt-dlp-supported), pull a flat list of their video URLs ordered by
// recency (or by yt-dlp's default playlist order). Used by the
// scrape-profile flow to feed the existing video pipeline with a fixed,
// author-specific corpus.

import { spawn, spawnSync } from "node:child_process";
import { detectVideoUrl, type VideoPlatform } from "./video.js";

export type ProfileVideoRef = {
  url: string;
  platform: VideoPlatform;
  id: string;
  title: string;
  durationSec: number;
  views: number;
  uploadDate?: string;
};

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

function ensureBin(bin: string): boolean {
  return spawnSync("which", [bin], { stdio: "ignore" }).status === 0;
}

export type ListProfileVideosOptions = {
  /** Max entries to return. Default 50. */
  max?: number;
  /** Cookies source for yt-dlp. Default chrome. */
  cookiesFromBrowser?: string;
  timeoutMs?: number;
};

// Each --print field becomes a tab-separated column in stdout. Robust to
// blank fields and to entries that yt-dlp doesn't fully resolve.
const PRINT_FIELDS = "%(url)s\t%(id)s\t%(title)s\t%(duration)s\t%(view_count)s\t%(upload_date)s";

export async function listProfileVideos(
  profileUrl: string,
  opts: ListProfileVideosOptions = {},
): Promise<ProfileVideoRef[]> {
  if (!ensureBin("yt-dlp")) {
    throw new Error("yt-dlp not on PATH; install via `brew install yt-dlp`");
  }
  const max = opts.max ?? 50;
  const cookies = opts.cookiesFromBrowser ?? "chrome";

  const args = [
    ...(cookies ? ["--cookies-from-browser", cookies] : []),
    "--flat-playlist",
    "--print",
    PRINT_FIELDS,
    "--no-warnings",
    "--playlist-end",
    String(max),
    "--socket-timeout",
    "15",
    profileUrl,
  ];

  const r = await run("yt-dlp", args, { timeoutMs: opts.timeoutMs ?? 120_000 });

  // yt-dlp prints one row per video. Even with non-zero exit code, partial
  // output is usable.
  const lines = r.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && l.includes("\t"));

  const out: ProfileVideoRef[] = [];
  for (const line of lines) {
    const [url, id, title, duration, viewCount, uploadDate] = line.split("\t");
    if (!url || url === "NA") continue;
    const platform = detectVideoUrl(url);
    if (!platform) continue;
    out.push({
      url,
      platform,
      id: id === "NA" ? "" : id,
      title: title === "NA" ? "" : title,
      durationSec:
        duration && duration !== "NA" && !isNaN(Number(duration))
          ? Number(duration)
          : 0,
      views:
        viewCount && viewCount !== "NA" && !isNaN(Number(viewCount))
          ? Number(viewCount)
          : 0,
      uploadDate: uploadDate && uploadDate !== "NA" ? uploadDate : undefined,
    });
    if (out.length >= max) break;
  }

  // Fallback: if profile is configured for cookies but the chrome path
  // failed silently, retry without cookies (Instagram / TikTok don't need
  // auth for public profiles).
  if (out.length === 0 && cookies) {
    const r2 = await run(
      "yt-dlp",
      [
        "--flat-playlist",
        "--print",
        PRINT_FIELDS,
        "--no-warnings",
        "--playlist-end",
        String(max),
        "--socket-timeout",
        "15",
        profileUrl,
      ],
      { timeoutMs: opts.timeoutMs ?? 120_000 },
    );
    const lines2 = r2.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && l.includes("\t"));
    for (const line of lines2) {
      const [url, id, title, duration, viewCount, uploadDate] = line.split("\t");
      if (!url || url === "NA") continue;
      const platform = detectVideoUrl(url);
      if (!platform) continue;
      out.push({
        url,
        platform,
        id: id === "NA" ? "" : id,
        title: title === "NA" ? "" : title,
        durationSec:
          duration && duration !== "NA" && !isNaN(Number(duration))
            ? Number(duration)
            : 0,
        views:
          viewCount && viewCount !== "NA" && !isNaN(Number(viewCount))
            ? Number(viewCount)
            : 0,
        uploadDate: uploadDate && uploadDate !== "NA" ? uploadDate : undefined,
      });
      if (out.length >= max) break;
    }
  }

  return out;
}
