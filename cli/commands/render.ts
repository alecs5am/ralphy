// `ralphy render <project>` — direct render pipeline.
//
// Engine: HyperFrames (HTML + GSAP, deterministic Puppeteer + FFmpeg).
// Project shape: workspace/projects/<id>/index.html.
//
// AGENTS.md hard rule #5 — no auto-launched Studio. Iterations happen via
// regenerate-slot + re-render, not Studio scrubbing.

import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { projectsDir } from "../lib/paths.js";
import { logGeneration } from "../lib/gen-log.js";
import { out } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { CommandStream } from "../lib/stream/command.js";
import { runHyperframesRender, looksLikeHyperframesProject } from "../lib/render/hyperframes.js";
import {
  lintHyperframesProject,
  formatHyperframesLintReport,
} from "../lib/render/hyperframes-lint.js";
import {
  colorGrade,
  compressForSocial,
  mixMusic,
  qualityPresetToCrf,
  type ColorGradePreset,
} from "../lib/ffmpeg-recipes.js";

const GRADE_PRESETS: readonly ColorGradePreset[] = [
  "tv-commercial-soft",
  "tv-commercial-strong",
  "cinematic-teal-orange",
  "analog-horror",
] as const;

const QUALITY_PRESETS = ["web", "print", "archive"] as const;
type QualityPreset = (typeof QUALITY_PRESETS)[number];

function isGradePreset(v: string): v is ColorGradePreset {
  return (GRADE_PRESETS as readonly string[]).includes(v);
}
function isDeliverableQuality(v: string): v is QualityPreset {
  return (QUALITY_PRESETS as readonly string[]).includes(v);
}

async function runLoudnorm(src: string, dst: string): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-y",
        "-i",
        src,
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        dst,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
  });
}

async function fileSize(p: string): Promise<number> {
  try {
    return (await fs.stat(p)).size;
  } catch {
    return 0;
  }
}

export function renderCmd() {
  const cmd = new Command("render")
    .argument("<project>", "Project ID")
    .description(
      "Render a project to MP4. Engine: HyperFrames (HTML + GSAP). " +
        "Writes workspace/projects/<id>/render/final.mp4. Adds EBU R128 loudnorm with --loudnorm.",
    );
  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy render spring-001
  ralphy render proj-001 --loudnorm
  ralphy render proj-001 --output ./out.mp4
  ralphy render proj-001 --fps 60 --quality high
`,
  );
  return cmd
    .option("--composition <id>", "Composition id (default: index.html)")
    .option("--output <path>", "Output mp4 path (default: workspace/projects/<id>/render/final.mp4)")
    .option("--loudnorm", "Apply EBU R128 loudnorm (-16 LUFS) post-render via ffmpeg")
    .option("--fps <fps>", "Frame rate (default 30)")
    .option(
      "--quality <quality>",
      "Quality preset: draft|standard|high (HyperFrames engine) OR web|print|archive (post-render CRF 23|18|12)",
    )
    .option(
      "--grade <preset>",
      `Color-grade preset post-render: ${GRADE_PRESETS.join(" | ")}`,
    )
    .option(
      "--format <format>",
      "Output format: mp4|webm|mov|png-sequence (default mp4)",
    )
    .option(
      "--resolution <preset>",
      "Resolution preset: portrait|landscape|square|1080p|4k|...",
    )
    .option(
      "--music-variants",
      "After the base render, mix one variant per <project>/assets/music/*.mp3 onto the final mp4. Writes render/final.<music-basename>.mp4 per bed. #049",
      false,
    )
    .option(
      "--music-volume <n>",
      "Music gain for --music-variants (default 0.18, background bed under VO)",
      (v) => parseFloat(v),
      0.18,
    )
    .option("--dry-run", "Print the resolved render plan; no engine run", false)
    .option("--summary", "Collapse the dry-run plan to a per-stage rollup", false)
    .action(async (projectId: string, opts) => {
      const t0 = Date.now();
      const engine = "hyperframes" as const;
      const engineEndpoint = "hyperframes-render";

      // Validate --grade up front; reject unknown values with a concrete ask.
      const gradePreset: ColorGradePreset | undefined = (() => {
        if (!opts.grade) return undefined;
        if (!isGradePreset(opts.grade)) {
          raiseError("E_INTERNAL", {
            detail: `Unknown --grade preset '${opts.grade}'. Allowed: ${GRADE_PRESETS.join(", ")}.`,
          });
        }
        return opts.grade as ColorGradePreset;
      })();

      // --quality can mean two things. The legacy form (draft|standard|high) is
      // forwarded to the HyperFrames engine. The new deliverable form
      // (web|print|archive) drives a post-render x264 CRF re-encode. Resolve.
      const deliverableQuality: QualityPreset | undefined =
        opts.quality && isDeliverableQuality(opts.quality) ? opts.quality : undefined;
      const ENGINE_QUALITIES = ["draft", "standard", "high"] as const;
      type EngineQuality = (typeof ENGINE_QUALITIES)[number];
      const engineQuality: EngineQuality | undefined = (() => {
        if (!opts.quality || isDeliverableQuality(opts.quality)) return undefined;
        if ((ENGINE_QUALITIES as readonly string[]).includes(opts.quality)) {
          return opts.quality as EngineQuality;
        }
        raiseError("E_INTERNAL", {
          detail:
            `Unknown --quality '${opts.quality}'. Allowed: ${[...ENGINE_QUALITIES, ...QUALITY_PRESETS].join(", ")}.`,
        });
        return undefined;
      })();

      if (opts.dryRun) {
        const renderDir = path.join(projectsDir(), projectId, "render");
        const renderFinal = opts.output ? path.resolve(opts.output) : path.join(renderDir, "final.mp4");
        const compositionId = opts.composition ?? "index.html";
        const stages = [
          { stage: engineEndpoint, engine, composition: compositionId, output: renderFinal, est_usd: 0 },
          ...(opts.loudnorm ? [{ stage: "ffmpeg-loudnorm", target: "-16 LUFS", est_usd: 0 }] : []),
          ...(gradePreset ? [{ stage: "ffmpeg-color-grade", preset: gradePreset, est_usd: 0 }] : []),
          ...(deliverableQuality
            ? [{ stage: "ffmpeg-compress", quality: deliverableQuality, crf: qualityPresetToCrf(deliverableQuality), est_usd: 0 }]
            : []),
        ];
        if (opts.summary) {
          out({
            dryRun: true,
            engine,
            stages: {
              [engineEndpoint]: { count: 1, est_usd: 0 },
              ...(opts.loudnorm ? { "ffmpeg-loudnorm": { count: 1, est_usd: 0 } } : {}),
              ...(gradePreset ? { "ffmpeg-color-grade": { count: 1, est_usd: 0 } } : {}),
              ...(deliverableQuality ? { "ffmpeg-compress": { count: 1, est_usd: 0 } } : {}),
            },
            cost_estimate_usd: 0,
          });
        } else {
          out({
            dryRun: true,
            engine,
            would_call: stages,
            cost_estimate_usd: 0,
            would_write: [renderFinal],
          });
        }
        return;
      }

      const cs = new CommandStream();
      const renderDir = path.join(projectsDir(), projectId, "render");
      await fs.mkdir(renderDir, { recursive: true });
      const renderRaw = path.join(renderDir, "final.raw.mp4");
      const renderFinal = opts.output
        ? path.resolve(opts.output)
        : path.join(renderDir, "final.mp4");
      const ui = await import("../lib/ui.js");

      const projectDir = path.join(projectsDir(), projectId);
      if (!looksLikeHyperframesProject(projectDir)) {
        raiseError("E_FILE_UNREADABLE", {
          path: path.join(projectDir, "index.html"),
        });
      }
      const compositionLabel = opts.composition ?? "index.html";

      // Author-time HyperFrames lint (#047). Upstream runs lint at render
      // time, but two edge cases — wrapper-on-video and many-short-same-track
      // — only surface AFTER a silent freeze. We mirror those checks here so
      // they block (errors) or warn (short-stack heuristic) BEFORE we shell
      // out to upstream render. If the composition file isn't readable, fall
      // through and let upstream surface the clearer error.
      let lintResult;
      try {
        lintResult = await lintHyperframesProject(projectDir, opts.composition);
      } catch (err) {
        if ((err as { code?: string } | undefined)?.code !== "ENOENT") {
          throw err;
        }
        lintResult = undefined;
      }
      if (lintResult) {
        const report = formatHyperframesLintReport(lintResult);
        if (report) {
          process.stderr.write(`${report}\n`);
        }
        if (!lintResult.ok) {
          raiseError("E_INTERNAL", {
            detail:
              `HyperFrames lint failed with ${lintResult.errors.length} error(s) before render. ` +
              `Fix the errors above and re-run, or see notes/issues/047-hyperframes-edge-case-rules.md.`,
          });
        }
      }


      cs.event("render-started", { project: projectId, engine, composition: compositionLabel });
      // We need to land the raw render in a temp slot whenever ANY post-render
      // pass is requested (loudnorm, grade, or deliverable compress). Each pass
      // re-encodes into the next slot; the final pass writes to `renderFinal`.
      const hasPostRender =
        Boolean(opts.loudnorm) || Boolean(gradePreset) || Boolean(deliverableQuality);
      const renderOut = hasPostRender ? renderRaw : renderFinal;
      const rr = await ui.withSpinner(
        `Rendering ${compositionLabel} (hyperframes) → ${path.basename(renderOut)}`,
        () =>
          runHyperframesRender({
            projectDir,
            outputPath: renderOut,
            composition: opts.composition,
            fps: opts.fps !== undefined ? Number(opts.fps) : undefined,
            quality: engineQuality,
            format: opts.format,
            resolution: opts.resolution,
          }),
        {
          successText: () =>
            `Rendered ${ui.c.cmd(compositionLabel)} (hyperframes) → ${ui.c.path(renderOut)}`,
          failText: () => `HyperFrames render of ${ui.c.cmd(compositionLabel)} failed`,
        },
      );
      if (rr.exitCode !== 0) {
        await logGeneration(projectId, {
          provider: "other",
          model: "hyperframes-render",
          endpoint: "hyperframes-render",
          kind: "video",
          input: { project: projectId, engine, projectDir, composition: opts.composition },
          status: "error",
          error: rr.stderr.slice(-500),
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          note: "render failed",
        });
        raiseError("E_INTERNAL", {
          detail: `hyperframes render failed (exit ${rr.exitCode}); see stderr above`,
        });
      }

      let outputPath = renderOut;
      const tmpStages: string[] = [];
      // Each post-render stage reads from `outputPath` and writes to the next
      // slot. The last stage in the chain writes to `renderFinal`. Intermediate
      // slots live alongside renderRaw and are cleaned up at the end.
      const stageQueue: Array<"loudnorm" | "grade" | "compress"> = [];
      if (opts.loudnorm) stageQueue.push("loudnorm");
      if (gradePreset) stageQueue.push("grade");
      if (deliverableQuality) stageQueue.push("compress");

      for (let i = 0; i < stageQueue.length; i++) {
        const stage = stageQueue[i]!;
        const isLast = i === stageQueue.length - 1;
        const nextOut = isLast
          ? renderFinal
          : path.join(renderDir, `.final.stage-${i + 1}-${stage}.mp4`);
        if (!isLast) tmpStages.push(nextOut);
        if (stage === "loudnorm") {
          const lr = await ui.withSpinner(
            `Loudnorm → ${path.basename(nextOut)}`,
            () => runLoudnorm(outputPath, nextOut),
            { successText: () => `Loudnorm applied (-16 LUFS) → ${ui.c.path(nextOut)}` },
          );
          if (lr.exitCode !== 0) {
            raiseError("E_INTERNAL", { detail: `ffmpeg loudnorm failed: ${lr.stderr.slice(-300)}` });
          }
        } else if (stage === "grade") {
          await ui.withSpinner(
            `Grade (${gradePreset}) → ${path.basename(nextOut)}`,
            () =>
              colorGrade({
                src: outputPath,
                dst: nextOut,
                preset: gradePreset!,
                forceOverwrite: true, // intermediate stage slot — controlled by us
                projectId,
                note: `render --grade ${gradePreset}`,
              }),
            { successText: () => `Graded (${gradePreset}) → ${ui.c.path(nextOut)}` },
          );
        } else if (stage === "compress") {
          const crf = qualityPresetToCrf(deliverableQuality!);
          await ui.withSpinner(
            `Compress (${deliverableQuality}, CRF ${crf}) → ${path.basename(nextOut)}`,
            () =>
              compressForSocial({
                src: outputPath,
                dst: nextOut,
                crf,
                forceOverwrite: true,
                projectId,
                note: `render --quality ${deliverableQuality}`,
              }),
            { successText: () => `Compressed (${deliverableQuality}, CRF ${crf}) → ${ui.c.path(nextOut)}` },
          );
        }
        outputPath = nextOut;
      }
      if (hasPostRender) {
        // Remove the raw + any in-between scratch files; keep only renderFinal.
        await fs.unlink(renderRaw).catch(() => undefined);
        for (const t of tmpStages) {
          await fs.unlink(t).catch(() => undefined);
        }
        outputPath = renderFinal;
      }

      const size = await fileSize(outputPath);
      cs.event("render-finished", { project: projectId, engine, bytes: size });
      await logGeneration(projectId, {
        provider: "other",
        model: "hyperframes-render",
        endpoint: "hyperframes-render",
        kind: "video",
        input: {
          project: projectId,
          engine,
          projectDir,
          composition: opts.composition,
          loudnorm: Boolean(opts.loudnorm),
          grade: gradePreset ?? null,
          quality: deliverableQuality ?? null,
        },
        output: { local: outputPath, bytes: size },
        status: "ok",
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        note: [
          "render",
          opts.loudnorm ? "loudnorm" : null,
          gradePreset ? `grade=${gradePreset}` : null,
          deliverableQuality ? `quality=${deliverableQuality}` : null,
        ]
          .filter(Boolean)
          .join(" + "),
      });
      // --music-variants (#049): auto-discover <project>/assets/music/*.mp3
      // and render one variant per file. Final mp4 untouched — each variant
      // is a sibling final.<music-basename>.mp4 next to it.
      const musicVariants: Array<{ music: string; out: string; bytes: number }> = [];
      if (opts.musicVariants) {
        const musicDir = path.join(projectsDir(), projectId, "assets", "music");
        let beds: string[] = [];
        try {
          const entries = await fs.readdir(musicDir);
          beds = entries
            .filter((e) => /\.(mp3|m4a|wav|aac|ogg)$/i.test(e))
            .sort()
            .map((e) => path.join(musicDir, e));
        } catch {
          /* no music dir — emit empty variants */
        }
        for (const bed of beds) {
          const bedBase = path.basename(bed, path.extname(bed));
          const variantOut = path.join(renderDir, `final.${bedBase}.mp4`);
          // Numeric-suffix on collision — never overwrite an existing variant.
          let dst = variantOut;
          let n = 2;
          while (await fs.access(dst).then(() => true).catch(() => false)) {
            dst = path.join(renderDir, `final.${bedBase}.v${n}.mp4`);
            n += 1;
            if (n > 9999) break;
          }
          await ui.withSpinner(
            `Music variant (${bedBase}) → ${path.basename(dst)}`,
            () =>
              mixMusic({
                src: outputPath,
                music: bed,
                dst,
                volume: Number(opts.musicVolume) || 0.18,
                forceOverwrite: false,
                projectId,
                note: `render --music-variants ${bedBase}`,
              }),
            { successText: () => `Variant ${bedBase} → ${ui.c.path(dst)}` },
          );
          const vsize = await fileSize(dst);
          musicVariants.push({ music: bed, out: dst, bytes: vsize });
        }
      }
      cs.summary({
        project: projectId,
        engine,
        composition: compositionLabel,
        path: outputPath,
        bytes: size,
        loudnorm: Boolean(opts.loudnorm),
        grade: gradePreset ?? null,
        quality: deliverableQuality ?? null,
        musicVariants: musicVariants.length > 0 ? musicVariants : undefined,
        latencyMs: Date.now() - t0,
      });
    });
}
