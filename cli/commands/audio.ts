// `ralphy audio <recipe>` — thin CLI over cli/lib/ffmpeg-recipes.ts.
//
// Why: the editor playbook lists audio post-processing recipes
// (loudnorm, sidechain ducking, lossless concat) but until now they were
// only callable from inside another TS module. This is the missing CLI
// surface so the agent can run a recipe without writing code.

import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import {
  loudnorm,
  sidechainCompress,
  concatLossless,
  mixMusic,
  audioStem,
  resolveCueSheet,
  type StemCueSheet,
} from "../lib/ffmpeg-recipes.js";
import { resolveLatestArtifactObject } from "../lib/store/artifacts.js";
import { ok, err } from "../lib/output.js";
import { artifactOut as out, mimeForOutput, produceArtifactRevision } from "../lib/artifact-production.js";

export function audioCmd() {
  const cmd = new Command("audio").description(
    "FFmpeg audio recipes (loudnorm, sidechain duck, concat, SFX stem). All wrap cli/lib/ffmpeg-recipes.ts.",
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
    .option(
      "--single-pass",
      "Skip the measurement pass (dynamic-mode loudnorm — misses the target on transient-dense audio)",
      false,
    )
    .requiredOption("--project <id>", "Project ID")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const completed = await produceArtifactRevision({ scope: { projectId: opts.project }, runKind: "audio.loudnorm",
          requestedOutput: opts.out, artifactKind: "audio", mime: mimeForOutput(opts.out), provider: "ffmpeg", model: "ffmpeg/loudnorm",
          produce: (dst) => loudnorm({
          src: path.resolve(opts.in), dst,
          target: opts.target,
          truePeak: opts.truePeak,
          loudnessRange: opts.lra,
          twoPass: !opts.singlePass,
        }) });
        ok(`Loudness-normalized → Artifact Revision ${completed.revision.id}`);
        out({ src: opts.in, artifactId: completed.artifact.id, revisionId: completed.revision.id, runId: completed.run.id,
          target: opts.target, truePeak: opts.truePeak, lra: opts.lra, twoPass: !opts.singlePass });
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
    .option(
      "--loudnorm [lufs]",
      "Chain an EBU R128 loudnorm pass on the mixed output (default target -16 LUFS when flag is set without a value)",
      (v: string) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : -16;
      },
    )
    .requiredOption("--project <id>", "Project ID")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const completed = await produceArtifactRevision({ scope: { projectId: opts.project }, runKind: "audio.sidechain",
          requestedOutput: opts.out, artifactKind: "audio", mime: mimeForOutput(opts.out), provider: "ffmpeg", model: "ffmpeg/sidechain",
          produce: (dst) => sidechainCompress({
          voice: path.resolve(opts.voice),
          music: path.resolve(opts.music),
          dst,
          threshold: opts.threshold,
          ratio: opts.ratio,
          mix: [opts.voiceVol, opts.musicVol],
          // Commander returns `true` when --loudnorm is passed without a
          // value (boolean preset), a number when our parser ran (with-value
          // path), and `undefined` when omitted. Coerce all three into a
          // number-or-undef for the recipe helper.
          loudnorm: (() => {
            const v: unknown = opts.loudnorm;
            if (v === undefined || v === false || v === null) return undefined;
            if (v === true) return -16;
            const n = Number(v);
            return Number.isFinite(n) ? n : -16;
          })(),
        }) });
        ok(`Mixed (ducked) → Artifact Revision ${completed.revision.id}`);
        out({ voice: opts.voice, music: opts.music, artifactId: completed.artifact.id,
          revisionId: completed.revision.id, runId: completed.run.id });
      } catch (e: any) {
        err(`sidechain failed: ${e?.message || e}`);
      }
    });

  // ── mix-music (single-call music bed) ──────────────────────────────────
  cmd
    .command("mix-music")
    .description(
      "Overlay a music bed onto a video at a fixed volume — no ducking, no fades. Single-call surface for A/B preview workflows.",
    )
    .requiredOption("--in <path>", "Input video (mp4 / mov)")
    .requiredOption("--music <path>", "Music audio file (mp3 / m4a / wav)")
    .requiredOption("--out <path>", "Output video")
    .option("--volume <n>", "Music gain (default 0.18 = background bed)", (v) => Number(v), 0.18)
    .option("--force-overwrite", "Skip the .v2 collision archive", false)
    .requiredOption("--project <id>", "Project ID")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const completed = await produceArtifactRevision({ scope: { projectId: opts.project }, runKind: "audio.mix-music",
          requestedOutput: opts.out, artifactKind: "video", mime: mimeForOutput(opts.out), provider: "ffmpeg", model: "ffmpeg/mix-music",
          produce: (dst) => mixMusic({
          src: path.resolve(opts.in),
          music: path.resolve(opts.music),
          dst,
          volume: opts.volume,
          forceOverwrite: true,
        }) });
        ok(`Music bed mixed → Artifact Revision ${completed.revision.id}`);
        out({ src: opts.in, music: opts.music, artifactId: completed.artifact.id,
          revisionId: completed.revision.id, runId: completed.run.id, volume: opts.volume });
      } catch (e: any) {
        err(`mix-music failed: ${e?.message || e}`);
      }
    });

  // ── stem (cue sheet → one pre-mixed SFX track) ─────────────────────────
  cmd
    .command("stem")
    .description(
      "Flatten a cue sheet of SFX one-shots into ONE pre-mixed stem (delay + gain per cue, amix, limiter). " +
        "HyperFrames cannot overlap short clips on one track — a stem is the correct shape.",
    )
    .requiredOption(
      "--cues <path>",
      'Cue sheet JSON: [{ "at": 5.333, "slot": "click-01", "gainDb": -9 }] or { "fps": 30, "cues": [{ "frame": 160, ... }] }; ' +
        '"slot" is a Project audio Artifact, "path" a file relative to the sheet',
    )
    .requiredOption("--out <file>", "Output filename, e.g. sfx-stem.mp3 — its basename becomes the Artifact slug")
    .option("--duration <sec>", "Pin the stem to exactly N seconds (pad / trim)", (v) => Number(v))
    .option("--target-lufs <lufs>", "Two-pass loudnorm target for the stem", (v) => Number(v), -20)
    .option("--no-loudnorm", "Skip the loudness pass — keep the raw authored cue gains")
    .option("--limit <n>", "alimiter ceiling (linear)", (v) => Number(v), 0.89)
    .requiredOption("--project <id>", "Project ID — cue slots resolve against its audio Artifacts")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const sheetPath = path.resolve(opts.cues);
        const sheet = JSON.parse(fs.readFileSync(sheetPath, "utf8")) as StemCueSheet;
        // Collect every unresolvable cue source so one run names them all.
        const missing = new Set<string>();
        const cues = resolveCueSheet(sheet, (ref) => {
          if ("path" in ref) {
            const file = path.resolve(path.dirname(sheetPath), ref.path);
            if (!fs.existsSync(file)) missing.add(ref.path);
            return file;
          }
          try {
            return resolveLatestArtifactObject({ context: { projectId: opts.project }, slug: ref.slot, kind: "audio" }).objectPath;
          } catch {
            missing.add(ref.slot);
            return "";
          }
        });
        if (missing.size) {
          err(`stem failed: ${missing.size} cue source(s) not found (audio Artifact slot or file): ${[...missing].join(", ")}`);
          return;
        }
        const targetLufs = opts.loudnorm === false ? undefined : opts.targetLufs;
        const completed = await produceArtifactRevision({ scope: { projectId: opts.project }, runKind: "audio.stem",
          requestedOutput: opts.out, artifactKind: "audio", mime: mimeForOutput(opts.out), provider: "ffmpeg", model: "ffmpeg/audio-stem",
          request: { cues: cues.length, durationSec: opts.duration ?? null, targetLufs: targetLufs ?? null, limit: opts.limit },
          produce: (dst) => audioStem({
          cues,
          dst,
          durationSec: opts.duration,
          targetLufs,
          limit: opts.limit,
        }) });
        ok(`Stem built from ${cues.length} cues → Artifact Revision ${completed.revision.id}`);
        out({ artifactId: completed.artifact.id, revisionId: completed.revision.id, runId: completed.run.id,
          cues: cues.length, duration: opts.duration ?? null, targetLufs: targetLufs ?? null, limit: opts.limit });
      } catch (e: any) {
        err(`stem failed: ${e?.message || e}`);
      }
    });

  // ── concat (lossless) ──────────────────────────────────────────────────
  cmd
    .command("concat")
    .description("Lossless concat of audio segments via the concat demuxer")
    .requiredOption("--files <list>", "Comma-separated input paths (in order)")
    .requiredOption("--out <path>", "Output file")
    .requiredOption("--project <id>", "Project ID")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const srcs = (opts.files as string)
          .split(",")
          .map((f) => path.resolve(f.trim()))
          .filter(Boolean);
        const completed = await produceArtifactRevision({ scope: { projectId: opts.project }, runKind: "audio.concat",
          requestedOutput: opts.out, artifactKind: "audio", mime: mimeForOutput(opts.out), provider: "ffmpeg", model: "ffmpeg/concat",
          produce: (dst) => concatLossless({
          srcs,
          dst,
        }) });
        ok(`Concatenated → Artifact Revision ${completed.revision.id}`);
        out({ srcs, artifactId: completed.artifact.id, revisionId: completed.revision.id, runId: completed.run.id });
      } catch (e: any) {
        err(`concat failed: ${e?.message || e}`);
      }
    });

  return cmd;
}
