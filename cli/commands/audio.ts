// `ralphy audio <recipe>` — thin CLI over cli/lib/ffmpeg-recipes.ts.
//
// Why: the editor playbook lists audio post-processing recipes
// (loudnorm, sidechain ducking, lossless concat) but until now they were
// only callable from inside another TS module. This is the missing CLI
// surface so the agent can run a recipe without writing code.

import { Command } from "commander";
import path from "node:path";
import {
  loudnorm,
  sidechainCompress,
  concatLossless,
} from "../lib/ffmpeg-recipes.js";
import { out, ok, err } from "../lib/output.js";

export function audioCmd() {
  const cmd = new Command("audio").description(
    "FFmpeg audio recipes (loudnorm, sidechain duck, concat). All wrap cli/lib/ffmpeg-recipes.ts.",
  );

  // ── loudnorm ───────────────────────────────────────────────────────────
  cmd
    .command("loudnorm")
    .description("EBU R128 loudness normalization (TikTok / Reels target -16 LUFS by default)")
    .requiredOption("--in <path>", "Input audio file")
    .requiredOption("--out <path>", "Output audio file")
    .option("--target <lufs>", "Target integrated loudness", (v) => Number(v), -16)
    .option("--true-peak <dbtp>", "True-peak ceiling", (v) => Number(v), -1.5)
    .option("--lra <lu>", "Loudness range", (v) => Number(v), 11)
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await loudnorm({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          target: opts.target,
          truePeak: opts.truePeak,
          loudnessRange: opts.lra,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Loudness-normalized → ${dst}`);
        out({ src: opts.in, dst, target: opts.target, truePeak: opts.truePeak, lra: opts.lra });
      } catch (e: any) {
        err(`loudnorm failed: ${e?.message || e}`);
      }
    });

  // ── sidechain (duck music under VO) ────────────────────────────────────
  cmd
    .command("sidechain")
    .description("Duck music under voice via sidechain compressor → single mixed file")
    .requiredOption("--voice <path>", "Voice / VO track")
    .requiredOption("--music <path>", "Music bed")
    .requiredOption("--out <path>", "Output mixed audio")
    .option("--threshold <n>", "Compression threshold", (v) => Number(v), 0.05)
    .option("--ratio <n>", "Compression ratio (heavy duck = 8)", (v) => Number(v), 8)
    .option("--voice-vol <n>", "Voice mix volume", (v) => Number(v), 1)
    .option("--music-vol <n>", "Music pre-duck volume", (v) => Number(v), 0.6)
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await sidechainCompress({
          voice: path.resolve(opts.voice),
          music: path.resolve(opts.music),
          dst: path.resolve(opts.out),
          threshold: opts.threshold,
          ratio: opts.ratio,
          mix: [opts.voiceVol, opts.musicVol],
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Mixed (ducked) → ${dst}`);
        out({ voice: opts.voice, music: opts.music, dst });
      } catch (e: any) {
        err(`sidechain failed: ${e?.message || e}`);
      }
    });

  // ── concat (lossless) ──────────────────────────────────────────────────
  cmd
    .command("concat")
    .description("Lossless concat of audio segments via the concat demuxer")
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
