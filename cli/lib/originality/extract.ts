// Fingerprint extraction for the originality check (#561). Local only: ffmpeg
// decodes, the hashing is pure TypeScript. No provider call, no network.
//
//   frames — `fps=F,scale=32:32,format=gray` raw luma, F = min(2, 240 / duration)
//            so long media stays bounded at ~240 sampled frames.
//   audio  — mono 8 kHz PCM, first AUDIO_MAX_SEC seconds.
//   script — explicit text, else a caption / transcript sidecar next to the
//            media (same basename: .srt, .vtt, .transcript.json, .captions.json,
//            .txt, .md), else nothing.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { decodeMonoPcm, ensureFfmpeg } from "../ffmpeg-recipes.js";
import { classifyFile, probeFile } from "../ffprobe.js";
import { audioFingerprint, AUDIO_SAMPLE_RATE } from "./audio-fingerprint.js";
import type { MediaFingerprint } from "./compare.js";
import { frameSignature, GRID, type FrameSignature } from "./frame-hash.js";
import { textFromFileContent } from "./script-similarity.js";

export const MAX_FRAMES = 240;
export const MAX_SAMPLE_FPS = 2;
export const AUDIO_MAX_SEC = 180;

export const TEXT_EXTENSIONS = new Set([".txt", ".md", ".srt", ".vtt", ".json"]);
const SIDECAR_SUFFIXES = [".srt", ".vtt", ".transcript.json", ".captions.json", ".script.txt", ".txt", ".md"];

export interface FingerprintInput {
  /** Media (or text) file to fingerprint. */
  path: string | null;
  label: string;
  /** Explicit script text; wins over sidecars. */
  script?: string | null;
  scriptSource?: string | null;
  /** Override the media kind (store Artifact kind); default by extension / probe. */
  kind?: "video" | "image" | "audio";
}

/** Build a fingerprint. Throws when the media cannot be decoded at all. */
export async function fingerprintMedia(input: FingerprintInput): Promise<MediaFingerprint> {
  let script = input.script?.trim() ? input.script.trim() : null;
  let scriptSource = script ? input.scriptSource ?? "explicit" : null;
  if (!input.path) {
    return { label: input.label, path: null, kind: "text", durationSec: null, frames: [], audio: null, script, scriptSource };
  }
  const file = input.path;
  const ext = path.extname(file).toLowerCase();
  if (!input.kind && TEXT_EXTENSIONS.has(ext)) {
    const text = textFromFileContent(fs.readFileSync(file, "utf8"), ext);
    return {
      label: input.label,
      path: file,
      kind: "text",
      durationSec: null,
      frames: [],
      audio: null,
      script: script ?? (text || null),
      scriptSource: scriptSource ?? (text ? `file:${path.basename(file)}` : null),
    };
  }
  if (!script) {
    const sidecar = findSidecarScript(file);
    if (sidecar) {
      script = sidecar.text;
      scriptSource = `sidecar:${path.basename(sidecar.path)}`;
    }
  }

  ensureFfmpeg();
  const probe = await probeFile(file);
  if (probe.error) throw new Error(`cannot read media ${file}: ${probe.error}`);
  const byExt = classifyFile(file);
  const kind: "video" | "image" | "audio" =
    input.kind ?? (byExt === "image" ? "image" : byExt === "audio" || !probe.has_video ? "audio" : "video");
  const durationSec = typeof probe.duration_s === "number" ? probe.duration_s : null;

  let frames: FrameSignature[] = [];
  if (kind === "image") frames = await sampleFrames(file, { single: true });
  else if (kind === "video" && probe.has_video) {
    const fps = durationSec && durationSec > 0 ? Math.min(MAX_SAMPLE_FPS, MAX_FRAMES / durationSec) : MAX_SAMPLE_FPS;
    frames = await sampleFrames(file, { fps });
  }

  let audio = null;
  if (kind !== "image" && probe.has_audio) {
    try {
      const pcm = await decodeMonoPcm({ src: file, sampleRate: AUDIO_SAMPLE_RATE, maxSec: AUDIO_MAX_SEC });
      audio = audioFingerprint(pcm);
    } catch {
      audio = null;
    }
  }
  return { label: input.label, path: file, kind, durationSec, frames, audio, script, scriptSource };
}

/** A caption / transcript file next to the media, when one exists. */
export function findSidecarScript(mediaPath: string): { path: string; text: string } | null {
  const dir = path.dirname(mediaPath);
  const base = path.basename(mediaPath, path.extname(mediaPath));
  for (const suffix of SIDECAR_SUFFIXES) {
    const candidate = path.join(dir, `${base}${suffix}`);
    if (candidate === mediaPath || !fs.existsSync(candidate)) continue;
    try {
      const ext = suffix.slice(suffix.lastIndexOf("."));
      const text = textFromFileContent(fs.readFileSync(candidate, "utf8"), ext);
      if (text) return { path: candidate, text };
    } catch {
      /* unreadable sidecar: ignore */
    }
  }
  return null;
}

/** Decode GRID x GRID luma frames and hash them. */
export function sampleFrames(file: string, opts: { fps?: number; single?: boolean }): Promise<FrameSignature[]> {
  const frameBytes = GRID * GRID;
  const fps = opts.fps ?? MAX_SAMPLE_FPS;
  const filter = opts.single
    ? `scale=${GRID}:${GRID}:flags=area,format=gray`
    : `fps=${fps.toFixed(4)},scale=${GRID}:${GRID}:flags=area,format=gray`;
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", file, "-an", "-vf", filter];
  if (opts.single) args.push("-frames:v", "1");
  args.push("-f", "rawvideo", "-pix_fmt", "gray", "-");
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    const frames: FrameSignature[] = [];
    let pending: Buffer = Buffer.alloc(0);
    let index = 0;
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      while (pending.length >= frameBytes && frames.length < MAX_FRAMES) {
        const raster = new Uint8Array(pending.subarray(0, frameBytes));
        frames.push(frameSignature(opts.single ? 0 : Number((index / fps).toFixed(3)), raster));
        index += 1;
        pending = pending.subarray(frameBytes);
      }
    });
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0 && frames.length === 0) {
        reject(new Error(`ffmpeg frame sampling failed for ${file}: ${stderr.slice(-300)}`));
        return;
      }
      resolve(frames);
    });
  });
}
