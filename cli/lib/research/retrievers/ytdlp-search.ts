// yt-dlp-backed search retriever.
//
// `yt-dlp ytsearch<N>:<query> --flat-playlist --dump-single-json` returns
// a playlist of N YouTube hits with view_count, channel, duration, and the
// canonical video URL — much higher signal than DDG for YouTube.
//
// We expose a generic shape so the orchestrator can mix yt-dlp results with
// DDG results into one candidate pool.

import { spawn, spawnSync } from "node:child_process";
import { detectVideoUrl, type VideoPlatform } from "./video.js";

export type YtdlpHit = {
  url: string;
  title: string;
  platform: VideoPlatform;
  views: number;
  durationSec: number;
  channel: string;
  uploaderHandle: string;
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

type FlatEntry = {
  id?: string;
  url?: string;
  title?: string;
  duration?: number;
  view_count?: number;
  channel?: string;
  uploader?: string;
  uploader_id?: string;
  upload_date?: string;
  ie_key?: string;
};

export async function ytSearch(
  query: string,
  opts: { limit?: number; timeoutMs?: number } = {},
): Promise<YtdlpHit[]> {
  if (!ensureBin("yt-dlp")) return [];
  const limit = Math.max(1, Math.min(50, opts.limit ?? 15));
  const r = await run(
    "yt-dlp",
    [
      // YouTube needs a JS runtime for signature deciphering (issue #119).
      "--js-runtimes",
      "node",
      `ytsearch${limit}:${query}`,
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      "--socket-timeout",
      "10",
    ],
    { timeoutMs: opts.timeoutMs ?? 30_000 },
  );
  if (r.code !== 0) return [];
  let parsed: { entries?: FlatEntry[] };
  try {
    parsed = JSON.parse(r.stdout) as { entries?: FlatEntry[] };
  } catch {
    return [];
  }
  const entries = parsed.entries ?? [];
  const hits: YtdlpHit[] = [];
  for (const e of entries) {
    const url = e.url ?? (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null);
    if (!url) continue;
    const platform = detectVideoUrl(url);
    if (!platform) continue;
    hits.push({
      url,
      title: e.title ?? "",
      platform,
      views: typeof e.view_count === "number" ? e.view_count : 0,
      durationSec: typeof e.duration === "number" ? e.duration : 0,
      channel: e.channel ?? "",
      uploaderHandle: e.uploader_id ?? e.uploader ?? "",
      uploadDate: e.upload_date,
    });
  }
  return hits;
}

// Run yt-dlp search but re-tag results to prefer Shorts URLs (replace
// /watch?v=ID with /shorts/ID for short videos). The /shorts/ form behaves
// the same for download but improves the readability of citations.
//
// YouTube Shorts officially supports up to 180 seconds since 2024. We
// auto-promote anything under that threshold. Longer videos stay as
// "youtube" (long-form) and are dropped by the vertical-only filter.
export async function ytSearchShortsBias(
  query: string,
  opts: { limit?: number; timeoutMs?: number; maxShortsDurationSec?: number } = {},
): Promise<YtdlpHit[]> {
  const hits = await ytSearch(query, opts);
  const maxDur = opts.maxShortsDurationSec ?? 180;
  return hits.map((h) => {
    if (h.durationSec > 0 && h.durationSec <= maxDur && h.platform === "youtube") {
      const m = h.url.match(/v=([\w-]{11})/);
      if (m) {
        return {
          ...h,
          url: `https://www.youtube.com/shorts/${m[1]}`,
          platform: "youtube-shorts" as VideoPlatform,
        };
      }
    }
    return h;
  });
}
