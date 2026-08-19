// `ralphy video <recipe>` — thin CLI over cli/lib/ffmpeg-recipes.ts (video side).
//
// Companion to `ralphy audio <recipe>`. Provides the editor's standard
// video post-processing primitives without making the agent write code.

import { Command } from "commander";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  extractSegment,
  boomerang,
  burnSubtitles,
  tonemapHDR,
  concatLossless,
  optimizeReencode,
  addMusicBed,
  applyVhs,
  chromaKeyVideo,
  dither,
  compressForSocial,
  colorGrade,
  extractFrame,
  extractLastFrame,
  probeDurationSec,
  type ColorGradePreset,
} from "../lib/ffmpeg-recipes.js";
import { detectFaces } from "../lib/face-bbox.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { currentWorkspace, projectRefsDir, projectDir } from "../lib/paths.js";
import { logGeneration } from "../lib/gen-log.js";
import { resolveConnector } from "../lib/providers/registry.js";
import { resolveModelAlias } from "../lib/model-aliases.js";
import { estimateVideoCostUsd } from "../lib/or-catalog.js";

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
    .option(
      "--mute",
      "Drop the audio track. Use for screen-recording segments bound for a HyperFrames composition — the render mixes any audio stream that is present, so the source narration would leak under the voiceover.",
    )
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
          mute: !!opts.mute,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Extracted → ${dst}`);
        out({ src: opts.in, dst, startSec: opts.start, endSec: opts.end });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `extract-segment: ` });
      }
    });

  // ── frame (#012) ───────────────────────────────────────────────────────
  //
  // Single-frame extract for i2v anchoring / QA / poster. Wraps the
  // `extractFrame` and `extractLastFrame` ffmpeg recipes so agents stop
  // shelling out to raw `ffmpeg -sseof -1 -frames:v 1` and dropping PNGs in
  // /tmp (issue #012).
  //
  //   ralphy video frame <clip> --at 1.5 --out frame.png
  //   ralphy video frame <clip> --at last --out last.png
  //   ralphy video frame <clip> --at last --project arena-rocker-001 \
  //       --slot scene-02-anchor
  //
  // When `--project` is passed and `--out` is omitted, the frame is written
  // into `<project>/artifacts/refs/<clip-basename>-frame-<t>.png` and logged to the
  // project gen-log with `input.source_clip` + `input.frame_at` so postmortems
  // can rollup extend chains.
  cmd
    .command("frame")
    .description(
      "Extract a single frame (i2v anchor / QA still / poster). " +
        "`--at` accepts a numeric seconds value or the literal `last` (`-sseof -1`).",
    )
    .argument("<clip>", "Input video path (absolute, or relative to cwd)")
    .requiredOption(
      "--at <ts>",
      "Timestamp: numeric seconds (`1.5`) or `last` for the final frame",
    )
    .option(
      "--out <path>",
      "Output PNG. Optional when `--project` is set — defaults to <project>/artifacts/refs/<clip>-frame-<t>.png.",
    )
    .option("--project <id>", "Project ID — logs the extract to gen-log and resolves default --out.")
    .option(
      "--slot <slot>",
      "Optional asset slot id (e.g. `scene-02-first-frame`). Recorded in the gen-log row.",
    )
    .option("--note <note>", "Free-form note")
    .action(async (clip: string, opts: any) => {
      const src = path.resolve(clip);
      if (!existsSync(src)) {
        raiseError("E_FILE_UNREADABLE", { path: src });
        return;
      }

      const atRaw = String(opts.at).trim();
      const isLast = atRaw.toLowerCase() === "last";
      const atSec = isLast ? null : Number(atRaw);
      if (!isLast && !Number.isFinite(atSec)) {
        raiseError("E_INPUT_INVALID", {
          field: "--at",
          detail: `expected numeric seconds or 'last', got '${opts.at}'`,
        });
        return;
      }

      // Resolve --out: explicit wins; otherwise project's artifacts/refs/ if --project given.
      let dst: string;
      if (opts.out) {
        dst = path.resolve(opts.out);
      } else if (opts.project) {
        const dir = projectDir(opts.project);
        if (!existsSync(dir)) {
          raiseError("E_NOT_FOUND", { kind: "Project", id: opts.project });
          return;
        }
        const base = path.basename(src, path.extname(src));
        const tag = isLast ? "last" : String(atSec).replace(/\./g, "p");
        dst = path.join(projectRefsDir(opts.project), `${base}-frame-${tag}.png`);
      } else {
        raiseError("E_INPUT_INVALID", {
          field: "--out",
          detail: "either --out <path> or --project <id> is required",
        });
        return;
      }

      try {
        if (isLast) {
          await extractLastFrame({
            src,
            dst,
            projectId: opts.project,
            note: opts.note,
          });
        } else {
          await extractFrame({
            src,
            atSec: atSec!,
            dst,
            projectId: opts.project,
            note: opts.note,
          });
        }

        // Additional gen-log row with the canonical `input.source_clip` +
        // `input.frame_at` shape the issue prescribes (recipes log a generic
        // ffmpeg row; this adds the slot-aware lineage row).
        if (opts.project) {
          await logGeneration(opts.project, {
            provider: "ffmpeg",
            model: "ffmpeg/video-frame",
            endpoint: isLast ? "ffmpeg/extract-last-frame" : "ffmpeg/extract-frame",
            kind: "image",
            input: {
              project: opts.project,
              slot: opts.slot,
              source_clip: src,
              frame_at: isLast ? "last" : atSec,
            },
            output: { local: dst },
            status: "ok",
            cost_usd: 0,
            note: opts.note ?? "video.frame",
          });
        }

        ok(`Frame extracted → ${dst}`);
        out({
          src,
          dst,
          at: isLast ? "last" : atSec,
          project: opts.project ?? null,
          slot: opts.slot ?? null,
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `video frame: ${e?.message || e}` });
      }
    });

  // ── extend (#012) ──────────────────────────────────────────────────────
  //
  // Multi-block i2v continuation. Grabs the last frame of `<clip>`, feeds it
  // as `--first-frame` to a new video generation, and records `input.extends:
  // <clip>` in the manifest entry so postmortems can rollup extend chains.
  // MEMORY: feedback_seedance_multiblock_i2v_extend documents the pattern.
  //
  //   ralphy video extend scene-01.mp4 --slot scene-02 --duration 15 \
  //       --prompt "..." --project arena-rocker-001
  //
  // `--dry-run` extracts the anchor frame (cheap, local) and prints the
  // planned generation without submitting — useful for plan review before a
  // paid i2v round-trip.
  cmd
    .command("extend")
    .description(
      "Last-frame i2v continuation: extracts the last frame of <clip> and runs a new generation anchored on it. " +
        "Records `input.extends: <clip>` lineage in the gen-log.",
    )
    .argument("<clip>", "Source video to extend (its last frame becomes the first-frame anchor)")
    .requiredOption("--project <id>", "Project ID")
    .requiredOption("--slot <slot>", "New asset slot id for the extended clip (e.g. `scene-02-vid`)")
    .requiredOption("--prompt <text>", "Motion / camera description for the continuation")
    .requiredOption("--duration <seconds>", "Duration in seconds (model-dependent grid)", parseFloat)
    .option("--model <id>", "Video model (default: bytedance/seedance-2.0)", "bytedance/seedance-2.0")
    .option("--aspect-ratio <ratio>", "Aspect ratio passed to the model", "9:16")
    .option("--resolution <res>", "Resolution", "720p")
    .option("--audio", "Enable model-native audio (per-model support varies)", false)
    .option("--note <note>", "Free-form note")
    .option(
      "--dry-run",
      "Extract the anchor frame + print the planned generation; do NOT submit",
      false,
    )
    .action(async (clip: string, opts: any) => {
      const src = path.resolve(clip);
      if (!existsSync(src)) {
        raiseError("E_FILE_UNREADABLE", { path: src });
        return;
      }
      const projDir = projectDir(opts.project);
      if (!existsSync(projDir)) {
        raiseError("E_NOT_FOUND", { kind: "Project", id: opts.project });
        return;
      }

      // Step 1: extract the last frame into the project's artifacts/refs/ so the i2v
      // call has a stable anchor file under the project tree (manifest can
      // point at it).
      const base = path.basename(src, path.extname(src));
      const anchorPath = path.join(projectRefsDir(opts.project), `${base}-last-frame.png`);
      try {
        await extractLastFrame({
          src,
          dst: anchorPath,
          projectId: opts.project,
          note: `video.extend anchor for ${opts.slot}`,
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `video extend last-frame: ${e?.message || e}` });
        return;
      }

      const resolvedModel = resolveModelAlias(opts.model) ?? opts.model;

      if (opts.dryRun) {
        ok(`Anchor frame ready → ${anchorPath}`);
        out({
          dryRun: true,
          chain: { extends: src, anchor: anchorPath, into: opts.slot },
          model: resolvedModel,
          project: opts.project,
          slot: opts.slot,
          durationSec: opts.duration,
          prompt: opts.prompt,
          aspectRatio: opts.aspectRatio,
          resolution: opts.resolution,
          generateAudio: !!opts.audio,
          estimatedCostUsd: estimateVideoCostUsd(resolvedModel, opts.duration),
        });
        return;
      }

      // Step 2: live i2v with the anchor as --first-frame.
      const connV = resolveConnector("video");
      if (!connV.generateVideo) {
        raiseError("E_INTERNAL", { detail: "no video connector available for `video extend`" });
        return;
      }

      try {
        const result = await connV.generateVideo({
          projectId: opts.project,
          slot: opts.slot,
          prompt: opts.prompt,
          durationSec: opts.duration,
          model: resolvedModel,
          firstFrame: anchorPath,
          aspectRatio: opts.aspectRatio,
          resolution: opts.resolution,
          generateAudio: !!opts.audio,
          note: opts.note,
        });

        // Lineage row — `kind: "i2v-extend"` per issue #012 plus the canonical
        // `input.extends: <clip>` pointer so postmortems can walk the chain.
        await logGeneration(opts.project, {
          provider: "openrouter",
          model: resolvedModel,
          endpoint: "openrouter/video-extend",
          kind: "video",
          input: {
            project: opts.project,
            slot: opts.slot,
            extends: src,
            anchor: anchorPath,
            prompt: opts.prompt,
            duration: opts.duration,
            extend_chain: true,
          },
          output: { local: result.localPath, url: result.url },
          status: "ok",
          cost_usd: result.costUsd,
          latency_ms: result.latencyMs,
          note: opts.note ?? "video.extend",
        });

        ok(`Extended → ${result.localPath}`);
        out({
          project: opts.project,
          slot: opts.slot,
          model: resolvedModel,
          path: result.localPath,
          extends: src,
          anchor: anchorPath,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `video extend i2v: ${e?.message || e}` });
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
    .option("--fps <n>", "Output frame rate (use 30 with --gop 30 for HyperFrames-safe seeking)", (v) => parseInt(v, 10))
    .option("--gop <n>", "Keyframe interval / GOP size (e.g. 30 = one keyframe per second at 30fps)", (v) => parseInt(v, 10))
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
          fps: opts.fps,
          gop: opts.gop,
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
          fps: opts.fps ?? null,
          gop: opts.gop ?? null,
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
      "Detect speaker face bboxes in a source video and write face-bboxes.json. Output is consumed by HyperFrames smart-reframe overlays (used by the podcast-clip template) to follow the active speaker with a virtual 9:16 camera, eliminating letterbox bars on horizontal sources.",
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

  // ── vhs ────────────────────────────────────────────────────────────────
  cmd
    .command("vhs")
    .description(
      "VHS post-process chain: chroma shift + sine drift + film grain + vignette + slight desat/contrast.",
    )
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--out <path>", "Output video")
    .option("--drift <px>", "Sine-wave horizontal drift in px (0 = off)", (v) => Number(v), 2)
    .option("--grain <n>", "Grain strength 0..100 (0 = off)", (v) => Number(v), 8)
    .option("--chroma <px>", "Chroma R/B horizontal shift in px (0 = off)", (v) => Number(v), 3)
    .option("--force-overwrite", "Skip the .v2 collision archive", false)
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await applyVhs({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          drift: opts.drift,
          grain: opts.grain,
          chroma: opts.chroma,
          forceOverwrite: opts.forceOverwrite,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`VHS chain applied → ${dst}`);
        out({ src: opts.in, dst, drift: opts.drift, grain: opts.grain, chroma: opts.chroma });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `vhs: ${e?.message || e}` });
      }
    });

  // ── chromakey ──────────────────────────────────────────────────────────
  cmd
    .command("chromakey")
    .description(
      "Key a green-screen video to a transparent VP9 alpha WebM (chromakey + despill). HyperFrames plays the .webm directly via <video>. Video sibling of `ralphy asset chromakey` (images).",
    )
    .requiredOption("--in <path>", "Input green-screen video (mp4/mov)")
    .requiredOption("--out <path>", "Output .webm (VP9 + alpha)")
    .option("--color <hex>", "Key colour (default 0x00b140 greenscreen green)", "0x00b140")
    .option("--similarity <n>", "chromakey similarity 0..1", (v) => Number(v), 0.24)
    .option("--blend <n>", "chromakey blend / edge softness 0..1", (v) => Number(v), 0.08)
    .option("--force-overwrite", "Skip the .v2 collision archive", false)
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await chromaKeyVideo({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          color: opts.color,
          similarity: opts.similarity,
          blend: opts.blend,
          forceOverwrite: opts.forceOverwrite,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Chroma-keyed → ${dst}`);
        out({ src: opts.in, dst, color: opts.color, similarity: opts.similarity, blend: opts.blend });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `chromakey: ${e?.message || e}` });
      }
    });

  // ── dither ─────────────────────────────────────────────────────────────
  cmd
    .command("dither")
    .description(
      "Stylish dither / halftone effect. Default: crisp 1-bit black & white (monob). --palette N keeps hue as an N-colour dither. Sibling of `ralphy video color-grade` / `apply-vhs`.",
    )
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--out <path>", "Output .mp4")
    .option("--pixelate <n>", "Downscale factor for chunky retro dots (1 = native res)", (v) => Number(v), 1)
    .option("--contrast <n>", "Pre-dither contrast boost (1 = off; real footage wants ~1.5-2.0 for a punchy 1-bit look)", (v) => Number(v), 1)
    .option("--palette <n>", "Switch to an N-colour palette dither that keeps hue (omit for 1-bit B&W)", (v) => Number(v))
    .option(
      "--mode <mode>",
      "Palette dither mode: bayer | floyd_steinberg | sierra2 | sierra2_4a | sierra3 | burkes | atkinson | heckbert | none",
      "bayer",
    )
    .option("--bayer-scale <n>", "Bayer pattern coarseness 0..5 (palette + bayer mode only)", (v) => Number(v), 2)
    .option("--force-overwrite", "Skip the .v2 collision archive", false)
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await dither({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          pixelate: opts.pixelate,
          palette: opts.palette,
          mode: opts.mode,
          bayerScale: opts.bayerScale,
          contrast: opts.contrast,
          forceOverwrite: opts.forceOverwrite,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Dithered → ${dst}`);
        out({
          src: opts.in,
          dst,
          pixelate: opts.pixelate,
          palette: opts.palette ?? null,
          mode: opts.mode,
          bayerScale: opts.bayerScale,
          contrast: opts.contrast,
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `dither: ${e?.message || e}` });
      }
    });

  // ── compress ───────────────────────────────────────────────────────────
  cmd
    .command("compress")
    .description(
      "x264 CRF + faststart for social-shareable deliverables. Default CRF 23 (`--social` is implicit).",
    )
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--out <path>", "Output video")
    .option("--crf <n>", "x264 CRF (23 web, 18 print, 12 archive)", (v) => parseInt(v, 10), 23)
    .option("--social", "Alias for the CRF 23 + faststart default (kept for discoverability)", false)
    .option("--force-overwrite", "Skip the .v2 collision archive", false)
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await compressForSocial({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          crf: opts.crf,
          forceOverwrite: opts.forceOverwrite,
          projectId: opts.project,
          note: opts.note,
        });
        const before = (await fs.stat(path.resolve(opts.in))).size;
        const after = (await fs.stat(dst)).size;
        ok(`Compressed → ${dst}`);
        out({
          src: opts.in,
          dst,
          crf: opts.crf,
          bytesBefore: before,
          bytesAfter: after,
          ratio: Number((before / after).toFixed(2)),
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `compress: ${e?.message || e}` });
      }
    });

  // ── grade ──────────────────────────────────────────────────────────────
  cmd
    .command("grade")
    .description(
      "Apply a named color-grade preset (tv-commercial-soft|tv-commercial-strong|cinematic-teal-orange|analog-horror).",
    )
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--out <path>", "Output video")
    .requiredOption(
      "--preset <name>",
      "tv-commercial-soft | tv-commercial-strong | cinematic-teal-orange | analog-horror",
    )
    .option("--force-overwrite", "Skip the .v2 collision archive", false)
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const allowed: ColorGradePreset[] = [
          "tv-commercial-soft",
          "tv-commercial-strong",
          "cinematic-teal-orange",
          "analog-horror",
        ];
        if (!allowed.includes(opts.preset)) {
          raiseError("E_INTERNAL", {
            detail: `Unknown grade preset '${opts.preset}'. Allowed: ${allowed.join(", ")}.`,
          });
          return;
        }
        const dst = await colorGrade({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          preset: opts.preset,
          forceOverwrite: opts.forceOverwrite,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Graded (${opts.preset}) → ${dst}`);
        out({ src: opts.in, dst, preset: opts.preset });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `grade: ${e?.message || e}` });
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

  // ── boomerang ───────────────────────────────────────────────────────────
  cmd
    .command("boomerang")
    .description(
      "Boomerang / ping-pong loop: forward playback + the clip reversed, concatenated into a seamless back-and-forth loop (classic Instagram boomerang). Drops audio (add a music bed in the compose/render step). Output is ~2x the source length.",
    )
    .requiredOption("--in <path>", "Input video")
    .requiredOption("--out <path>", "Output video")
    .option("--passes <n>", "Number of passes (2 = fwd+rev default, 3 = fwd+rev+fwd, …)", (v) => parseInt(v, 10), 2)
    .option("--seconds <n>", "Trim source to first N seconds per pass (total ≈ passes × seconds)", (v) => Number(v))
    .option("--project <id>", "Project ID for log line")
    .option("--note <note>", "Free-form note")
    .action(async (opts: any) => {
      try {
        const dst = await boomerang({
          src: path.resolve(opts.in),
          dst: path.resolve(opts.out),
          passes: opts.passes,
          seconds: opts.seconds,
          projectId: opts.project,
          note: opts.note,
        });
        ok(`Boomerang → ${dst}`);
        out({ src: opts.in, dst, passes: opts.passes, seconds: opts.seconds ?? null });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `boomerang: ${e?.message ?? e}` });
      }
    });

  // ── translate ───────────────────────────────────────────────────────────
  // The only NON-ffmpeg recipe in this group: a paid provider call (HeyGen
  // /v3/video-translations) that re-voices a finished cut into other languages
  // and re-animates the speaker's lips. Lives here because the input and output
  // are both a finished mp4 — the same shape as every other verb in the group.
  cmd
    .command("translate")
    .description(
      "Dub a finished cut into other languages (HeyGen): re-voiced audio + re-animated lips, one output per target language.",
    )
    .requiredOption("--in <path|url>", "Source video (local path or URL)")
    .requiredOption(
      "--languages <list>",
      'Comma-separated target language NAMES as the provider spells them (e.g. "Spanish (Spain),German"). Run `ralphy video translate-languages` to enumerate.',
    )
    .option("--out-dir <dir>", "Directory for the dubbed files. Default: alongside the source.")
    .option("--mode <mode>", "speed (default, $0.0333/s) | precision (better lip-sync, $0.0667/s)", "speed")
    .option("--input-language <lang>", "Source language. Auto-detected when omitted.")
    .option("--speakers <n>", "Number of distinct speakers — improves separation on multi-voice sources", (v) => parseInt(v, 10))
    .option("--captions", "Also produce SRT captions per language", false)
    .option("--audio-only", "Translate the audio track only (no lip re-animation)", false)
    .option("--project <id>", "Project ID for the gen-log line")
    .option("--poll-interval-ms <ms>", "Polling cadence (default 15000)", (v) => parseInt(v, 10))
    .option("--poll-max-attempts <n>", "Max polls before timeout (default 80 ≈ 20min)", (v) => parseInt(v, 10))
    .option("--force-overwrite", "Overwrite an existing output file in place instead of auto-versioning it", false)
    .option("--dry-run", "Validate params + print the resolved plan and cost estimate; do not submit", false)
    .action(async (opts: any) => {
      const { collectVideoTranslation, heygenPricePerSec, submitVideoTranslation } = await import(
        "../lib/providers/heygen.js"
      );
      const isRemote = /^https?:\/\//.test(opts.in);
      const source = isRemote ? opts.in : path.resolve(opts.in);
      if (!isRemote && !existsSync(source)) {
        raiseError("E_FILE_UNREADABLE", { path: source, verb: "video translate" });
      }
      const languages = (opts.languages as string)
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean);
      if (languages.length === 0) {
        raiseError("E_INPUT_INVALID", {
          field: "languages",
          detail: "pass at least one target language name",
          verb: "video translate",
        });
      }
      const mode: "speed" | "precision" = opts.mode === "precision" ? "precision" : "speed";
      const outDir = opts.outDir ? path.resolve(opts.outDir) : path.dirname(source);
      const stem = path.basename(source, path.extname(source));
      const sourceSec = isRemote ? null : probeDurationSec(source);
      const estUsd =
        sourceSec === null
          ? null
          : Number((heygenPricePerSec(`translate-${mode}`) * sourceSec * languages.length).toFixed(4));

      if (opts.dryRun) {
        out({
          dryRun: true,
          source: opts.in,
          languages,
          mode,
          sourceDurationSec: sourceSec,
          outDir,
          estimatedCostUsd: estUsd,
        });
        return;
      }

      try {
        const ids = await submitVideoTranslation({
          source,
          languages,
          mode,
          inputLanguage: opts.inputLanguage,
          speakerNum: opts.speakers,
          enableCaption: !!opts.captions,
          translateAudioOnly: !!opts.audioOnly,
          title: stem,
        });
        // One job per requested language, resolved in submit order.
        const results = [];
        for (const [index, id] of ids.entries()) {
          const label = languages[index] ?? id;
          const result = await collectVideoTranslation({
            id,
            dest: path.join(outDir, `${stem}.${label.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.mp4`),
            mode,
            overwrite: opts.forceOverwrite,
            pollIntervalMs: opts.pollIntervalMs,
            pollMaxAttempts: opts.pollMaxAttempts,
          });
          results.push({ requested: label, ...result });
          await logGeneration(
            opts.project ? { kind: "project", id: opts.project } : { kind: "workspace", id: currentWorkspace() },
            {
              slot: `${stem}-${label}`,
              provider: "heygen",
              model: `translate-${mode}`,
              endpoint: "/v3/video-translations",
              kind: "video",
              input: { slot: `${stem}-${label}`, project: opts.project, language: label, mode },
              output: { url: result.url, local: result.localPath, job_id: id },
              status: result.status === "completed" ? "ok" : "error",
              ...(result.failure ? { error: result.failure } : {}),
              cost_usd: result.costUsd,
              note: `video translate ${label}`,
            },
          );
        }
        const failed = results.filter((r) => r.status !== "completed");
        if (failed.length === 0) ok(`Translated into ${results.length} language(s)`);
        out({
          source: opts.in,
          mode,
          outDir,
          totalCostUsd: Number(results.reduce((sum, r) => sum + r.costUsd, 0).toFixed(4)),
          results: results.map((r) => ({
            language: r.requested,
            status: r.status,
            path: r.localPath ?? null,
            durationSec: r.durationSec ?? null,
            costUsd: r.costUsd,
            failure: r.failure ?? null,
          })),
        });
      } catch (e: any) {
        raiseError("E_INTERNAL", { detail: `video translate: ${e?.message ?? e}` });
      }
    })
    .addHelpText(
      "after",
      `
Examples:
  ralphy video translate-languages
  ralphy video translate --in render/final.mp4 --languages "Spanish (Spain),German" --captions
  ralphy video translate --in render/final.mp4 --languages Japanese --mode precision --project my-ad-001
`,
    );

  cmd
    .command("translate-languages")
    .description("Print the target language names `video translate` currently accepts (free, no generation).")
    .action(async () => {
      const { listTranslationLanguages } = await import("../lib/providers/heygen.js");
      const languages = await listTranslationLanguages();
      out({ count: languages.length, languages });
    });

  return cmd;
}
