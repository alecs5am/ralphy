// ffprobe truth helper — single canonical place for "what does the file
// ACTUALLY look like on disk", separate from whatever the manifest claims.
//
// Used by:
//   - `ralphy project assets <id> --json`  → enumerate truth per file
//   - `ralphy project verify <id>`         → compare truth vs manifest claim
//
// Issue #029. The point is to stop every multi-clip project from
// re-inventing an ad-hoc `ffprobe -show_entries` loop.

import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";

export type ProbeResult = {
  path: string;
  exists: boolean;
  size_bytes?: number;
  duration_s?: number;
  width?: number;
  height?: number;
  fps?: number;
  codecs?: string[]; // e.g. ["h264", "aac"]
  has_video?: boolean;
  has_audio?: boolean;
  error?: string;
};

export function ensureFfprobe(): void {
  const r = spawnSync("ffprobe", ["-version"], { stdio: "ignore" });
  if (r.status !== 0) {
    throw new Error(
      "ffprobe not found in PATH. Install via `brew install ffmpeg` or run `ralphy doctor`.",
    );
  }
}

// Parse the framerate field which is reported as "30000/1001" or "30/1".
function parseFps(rate: string | undefined): number | undefined {
  if (!rate) return undefined;
  if (rate.includes("/")) {
    const [num, den] = rate.split("/").map(Number);
    if (!den || !Number.isFinite(num) || !Number.isFinite(den)) return undefined;
    const v = num / den;
    return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : undefined;
  }
  const v = Number(rate);
  return Number.isFinite(v) ? v : undefined;
}

/**
 * Probe a single file. Returns a structured ProbeResult. Never throws on
 * a probe failure — surfaces the error inside the result so callers can
 * keep walking a directory of mixed-validity files.
 */
export async function probeFile(filePath: string): Promise<ProbeResult> {
  const r: ProbeResult = { path: filePath, exists: false };
  try {
    const st = await fs.stat(filePath);
    r.exists = true;
    r.size_bytes = st.size;
  } catch {
    r.error = "file missing on disk";
    return r;
  }

  ensureFfprobe();
  const probe = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      filePath,
    ],
    { encoding: "utf8" },
  );
  if (probe.status !== 0) {
    r.error = `ffprobe exit ${probe.status}: ${(probe.stderr || "").slice(0, 200)}`;
    return r;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(probe.stdout || "{}");
  } catch (e) {
    r.error = `ffprobe JSON parse failed: ${(e as Error).message}`;
    return r;
  }

  const fmt = parsed.format ?? {};
  const streams: any[] = Array.isArray(parsed.streams) ? parsed.streams : [];
  const dur = parseFloat(fmt.duration ?? "");
  if (Number.isFinite(dur)) r.duration_s = Math.round(dur * 1000) / 1000;

  const codecs: string[] = [];
  for (const s of streams) {
    if (s.codec_name) codecs.push(String(s.codec_name));
    if (s.codec_type === "video") {
      r.has_video = true;
      if (!r.width && Number.isFinite(s.width)) r.width = Number(s.width);
      if (!r.height && Number.isFinite(s.height)) r.height = Number(s.height);
      if (!r.fps) r.fps = parseFps(s.avg_frame_rate) ?? parseFps(s.r_frame_rate);
    }
    if (s.codec_type === "audio") {
      r.has_audio = true;
      // Fall back: duration on audio-only files lives on the stream not format.
      if (r.duration_s === undefined && Number.isFinite(parseFloat(s.duration))) {
        r.duration_s = Math.round(parseFloat(s.duration) * 1000) / 1000;
      }
    }
  }
  if (codecs.length) r.codecs = codecs;

  return r;
}

// Reasonable default for "which extensions does ffprobe even understand for our
// pipeline". Anything else gets skipped at the caller (json / captions / srt
// noise).
export const MEDIA_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff",
  ".mp4", ".mov", ".webm", ".mkv", ".m4v",
  ".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".opus",
]);

export type FileKind = "video" | "image" | "audio" | "other";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".mkv", ".m4v"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".opus"]);

export function classifyFile(filePath: string): FileKind {
  const ext = path.extname(filePath).toLowerCase();
  if (VIDEO_EXTS.has(ext)) return "video";
  if (IMAGE_EXTS.has(ext)) return "image";
  if (AUDIO_EXTS.has(ext)) return "audio";
  return "other";
}

/** Recursively list every media file under a directory. */
export async function walkMediaFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function recurse(d: string) {
    let items: import("fs").Dirent[] = [];
    try { items = await fs.readdir(d, { withFileTypes: true }); }
    catch { return; }
    for (const it of items) {
      const full = path.join(d, it.name);
      if (it.isDirectory()) await recurse(full);
      else if (it.isFile()) {
        const ext = path.extname(it.name).toLowerCase();
        if (MEDIA_EXTS.has(ext)) out.push(full);
      }
    }
  }
  await recurse(dir);
  return out;
}

/**
 * Compare a probe result against a manifest claim. Returns the list of
 * divergences (empty array == perfect match). Tolerances:
 *   - duration: 100ms (`durationSec`, `duration_s`, or `duration`)
 *   - dimensions: exact (`width` / `height`)
 *   - size_bytes: exact (`sizeBytes` / `size_bytes` / `size`)
 * Unknown fields on the claim are ignored — we only check what the manifest
 * explicitly committed to.
 */
export function diffManifestVsProbe(
  claim: Record<string, unknown>,
  probe: ProbeResult,
): Array<{ field: string; manifest: unknown; ffprobe: unknown; delta?: number }> {
  const out: Array<{ field: string; manifest: unknown; ffprobe: unknown; delta?: number }> = [];

  // Duration tolerance: 100ms.
  const claimedDur =
    (claim.durationSec as number | undefined) ??
    (claim.duration_s as number | undefined) ??
    (claim.duration as number | undefined);
  if (typeof claimedDur === "number" && Number.isFinite(claimedDur) && probe.duration_s !== undefined) {
    const delta = Math.abs(claimedDur - probe.duration_s);
    if (delta > 0.1) {
      out.push({ field: "duration_s", manifest: claimedDur, ffprobe: probe.duration_s, delta });
    }
  }

  const claimedW = (claim.width as number | undefined);
  if (typeof claimedW === "number" && probe.width !== undefined && claimedW !== probe.width) {
    out.push({ field: "width", manifest: claimedW, ffprobe: probe.width });
  }
  const claimedH = (claim.height as number | undefined);
  if (typeof claimedH === "number" && probe.height !== undefined && claimedH !== probe.height) {
    out.push({ field: "height", manifest: claimedH, ffprobe: probe.height });
  }

  const claimedSize =
    (claim.sizeBytes as number | undefined) ??
    (claim.size_bytes as number | undefined) ??
    (claim.size as number | undefined);
  if (typeof claimedSize === "number" && probe.size_bytes !== undefined && claimedSize !== probe.size_bytes) {
    out.push({ field: "size_bytes", manifest: claimedSize, ffprobe: probe.size_bytes });
  }

  // Codec name claim (manifest sometimes pins `codec` or `codec_name`).
  const claimedCodec = (claim.codec as string | undefined) ?? (claim.codec_name as string | undefined);
  if (typeof claimedCodec === "string" && probe.codecs && !probe.codecs.includes(claimedCodec)) {
    out.push({ field: "codec", manifest: claimedCodec, ffprobe: probe.codecs });
  }

  return out;
}
