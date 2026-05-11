// `ralphy video <recipe>` — thin CLI over cli/lib/ffmpeg-recipes.ts (video side).
//
// Companion to `ralphy audio <recipe>`. Provides the editor's standard
// video post-processing primitives without making the agent write code.

import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import {
  extractSegment,
  burnSubtitles,
  tonemapHDR,
  concatLossless,
} from "../lib/ffmpeg-recipes.js";
import { detectFaces } from "../lib/face-bbox.js";
import { out, ok, err } from "../lib/output.js";

export function videoCmd() {
  const cmd = new Command("video").description(
    "FFmpeg video recipes (extract-segment, burn-subs, tonemap-hdr, concat). Wraps cli/lib/ffmpeg-recipes.ts.",
  );

  // ── extract-segment ────────────────────────────────────────────────────
  cmd
    .command("extract-segment")
    .description("Cut a re-encoded segment between start/end seconds (frame-accurate)")
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--out <path>", "Output video")
    .requiredOption("--start <sec>", "Start in seconds", (v) => Number(v))
    .requiredOption("--end <sec>", "End in seconds", (v) => Number(v))
    .option("--no-reencode", "Stream-copy instead (faster, key-frame aligned)")
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await extractSegment({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          startSec: opts.start,
          endSec: opts.end,
          reencode: opts.reencode !== false,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Extracted → ${dst}`);
        out({ src: opts.in, dst, startSec: opts.start, endSec: opts.end });
      } catch (e: any) {
        err(`extract-segment failed: ${e?.message || e}`);
      }
    });

  // ── burn-subs ──────────────────────────────────────────────────────────
  cmd
    .command("burn-subs")
    .description("Burn an .srt file into the video (call last in the chain — MarginV=90 safe-zone)")
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--srt <path>", "Subtitle file (.srt)")
    .requiredOption("--out <path>", "Output video")
    .option("--margin-v <px>", "Vertical bottom margin", (v) => parseInt(v, 10), 90)
    .option("--font-size <px>", "Font size", (v) => parseInt(v, 10), 36)
    .option("--font-name <name>", "System-installed font name", "Inter")
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await burnSubtitles({
          src: path.resolve(opts.in),
          srt: path.resolve(opts.srt),
          dst: path.resolve(opts.out),
          marginV: opts.marginV,
          fontSize: opts.fontSize,
          fontName: opts.fontName,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Subs burned → ${dst}`);
        out({ src: opts.in, srt: opts.srt, dst });
      } catch (e: any) {
        err(`burn-subs failed: ${e?.message || e}`);
      }
    });

  // ── tonemap-hdr ────────────────────────────────────────────────────────
  cmd
    .command("tonemap-hdr")
    .description("HDR HLG/PQ → Rec.709 SDR via zscale + tonemap (default algo: hable)")
    .requiredOption("--in <path>", "Input video (HDR)")
    .requiredOption("--out <path>", "Output video (SDR)")
    .option("--algorithm <algo>", "hable | reinhard | mobius | clip", "hable")
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await tonemapHDR({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          algorithm: opts.algorithm,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Tonemapped → ${dst}`);
        out({ src: opts.in, dst, algorithm: opts.algorithm });
      } catch (e: any) {
        err(`tonemap-hdr failed: ${e?.message || e}`);
      }
    });

  // ── smart-crop ─────────────────────────────────────────────────────────
  cmd
    .command("smart-crop")
    .description(
      "Detect speaker face bboxes in a source video and write face-bboxes.json. Output is consumed by the <SmartReframe> Remotion component (used by podcast-clip template) to follow the active speaker with a virtual 9:16 camera, eliminating letterbox bars on horizontal sources.",
    )
    .requiredOption("--in <path>", "Source video (typically 16:9 podcast cut)")
    .requiredOption("--out <path>", "Output face-bboxes.json")
    .option("--fps <n>", "Sample FPS (default 1 — one bbox set per second)", (v) => Number(v), 1)
    .option("--project <id>", "Project ID — logs to generations.jsonl when present")
    .action(async (opts: any) => {
      try {
        const result = await detectFaces({
          videoPath: path.resolve(opts.in),
          fps: opts.fps,
          cachePath: path.resolve(opts.out),
          projectId: opts.project,
        });
        const totalFaces = result.frames.reduce((acc, f) => acc + f.bboxes.length, 0);
        ok(`Detected ${totalFaces} face(s) across ${result.frames.length} sampled frame(s) → ${opts.out}`);
        out({
          src: opts.in,
          dst: opts.out,
          source: result.source,
          frames: result.frames.length,
          totalFaces,
        });
      } catch (e: any) {
        err(`smart-crop failed: ${e?.message || e}`);
      }
    });

  // ── concat (also useful for video-with-audio segments) ─────────────────
  cmd
    .command("concat")
    .description("Lossless concat of video segments (must share codec/resolution)")
    .requiredOption("--files <list>", "Comma-separated input paths (in order)")
    .requiredOption("--out <path>", "Output file")
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const srcs = (opts.files as string)
          .split(",")
          .map((f) => path.resolve(f.trim()))
          .filter(Boolean);
        const dst = await concatLossless({
          srcs,
          dst: path.resolve(opts.out),
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Concatenated → ${dst}`);
        out({ srcs, dst });
      } catch (e: any) {
        err(`concat failed: ${e?.message || e}`);
      }
    });

  return cmd;
}
