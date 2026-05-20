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
  optimizeReencode,
  addMusicBed,
} from "../lib/ffmpeg-recipes.js";
import { detectFaces } from "../lib/face-bbox.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";

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
        raiseError("E_INTERNAL", { detail: `extract-segment: ` });
      }
    });

  // ── optimize ───────────────────────────────────────────────────────────
  cmd
    .command("optimize")
    .description(
      "Re-encode with x264 CRF + tune for noise/grain content. Preserves visual content; shrinks 4-8x for noisy footage."
    )
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--out <path>", "Output video")
    .option("--crf <n>", "Quality 18=visually-lossless, 23=web, 28=small", (v) => parseInt(v, 10), 23)
    .option("--preset <name>", "x264 preset (faster=bigger, slower=smaller)", "slow")
    .option("--tune <name>", "x264 tune: grain | film | animation | stillimage", "grain")
    .option("--audio-bitrate <rate>", "AAC bitrate", "128k")
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await optimizeReencode({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          crf: opts.crf,
          preset: opts.preset,
          tune: opts.tune,
          audioBitrate: opts.audioBitrate,
          projectId: opts.project,
          note: opts.note,
        });
        const before = (await fs.stat(path.resolve(opts.in))).size;
        const after = (await fs.stat(dst)).size;
        ok(`Optimized → ${dst}`);
        out({
          src: opts.in,
          dst,
          crf: opts.crf,
          preset: opts.preset,
          tune: opts.tune,
          bytesBefore: before,
          bytesAfter: after,
          ratio: Number((before / after).toFixed(2)),
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `optimize: ` });
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
        raiseError("E_INTERNAL", { detail: `burn-subs: ` });
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
        raiseError("E_INTERNAL", { detail: `tonemap-hdr: ` });
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
        raiseError("E_INTERNAL", { detail: `smart-crop: ` });
      }
    });

  // ── add-music ──────────────────────────────────────────────────────────
  cmd
    .command("add-music")
    .description(
      "Mix a music bed over the video's existing audio (SFX gets attenuated). Music auto-trims to video length with a fade-out tail."
    )
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--music <path>", "Music audio file (mp3/m4a/wav)")
    .requiredOption("--out <path>", "Output video")
    .option("--music-vol <n>", "Music gain (default 1.0 = full)", (v) => Number(v), 1.0)
    .option("--sfx-vol <n>", "Existing-audio gain (default 0.4 = background SFX)", (v) => Number(v), 0.4)
    .option("--fade-out <sec>", "Music fade-out anchored to video end (default 1.5)", (v) => Number(v), 1.5)
    .option("--fade-in <sec>", "Music fade-in (default 0)", (v) => Number(v), 0)
    .option("--duck", "Sidechain duck music under SFX (music breathes when SFX hits)", false)
    .option("--duck-threshold <n>", "Sidechain threshold (default 0.05)", (v) => Number(v), 0.05)
    .option("--duck-ratio <n>", "Sidechain ratio (default 8 = heavy duck)", (v) => Number(v), 8)
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await addMusicBed({
          src: path.resolve(opts.in),
          music: path.resolve(opts.music),
          dst: path.resolve(opts.out),
          musicVol: opts.musicVol,
          sfxVol: opts.sfxVol,
          fadeOutSec: opts.fadeOut,
          fadeInSec: opts.fadeIn,
          duck: opts.duck,
          duckThreshold: opts.duckThreshold,
          duckRatio: opts.duckRatio,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Music mixed → ${dst}`);
        out({ src: opts.in, music: opts.music, dst, musicVol: opts.musicVol, sfxVol: opts.sfxVol, duck: opts.duck });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `add-music: ` });
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
        raiseError("E_INTERNAL", { detail: `concat: ` });
      }
    });

  return cmd;
}
