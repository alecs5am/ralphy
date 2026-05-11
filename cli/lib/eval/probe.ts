// ffprobe wrapper — extracts container/stream metadata.

import { spawnSync } from "node:child_process";
import type { VideoMeta } from "./types.js";

export function ensureFfprobe(): void {
  const r = spawnSync("ffprobe", ["-version"], { stdio: "ignore" });
  if (r.status !== 0) {
    throw new Error("ffprobe not found in PATH (install via `brew install ffmpeg`)");
  }
}

interface FfprobeStream {
  codec_type: "video" | "audio" | string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  bit_rate?: string;
  duration?: string;
  nb_frames?: string;
}

interface FfprobeFormat {
  duration?: string;
  bit_rate?: string;
  format_name?: string;
}

interface FfprobeOutput {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

export function probeVideo(file: string): Pick<VideoMeta, "durationSec" | "resolution" | "fps" | "codec" | "bitrateKbps"> {
  ensureFfprobe();
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);

  const data = JSON.parse(r.stdout) as FfprobeOutput;
  const v = data.streams.find((s) => s.codec_type === "video");
  const a = data.streams.find((s) => s.codec_type === "audio");
  if (!v) throw new Error("no video stream in file");

  const fpsParts = (v.r_frame_rate ?? "0/1").split("/").map(Number);
  const fps = fpsParts[1] ? fpsParts[0] / fpsParts[1] : 0;

  return {
    durationSec: parseFloat(data.format.duration ?? v.duration ?? "0"),
    resolution: { w: v.width ?? 0, h: v.height ?? 0 },
    fps: Number(fps.toFixed(3)),
    codec: { video: v.codec_name ?? "?", audio: a?.codec_name ?? "?" },
    bitrateKbps: Math.round(parseInt(data.format.bit_rate ?? "0", 10) / 1000),
  };
}
