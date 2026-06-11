// `ralphy render <project>` — direct render pipeline.
//
// Engine: HyperFrames (HTML + GSAP, deterministic Puppeteer + FFmpeg).
// Project shape: .ralphy/workspaces/<ws>/projects/<id>/index.html.
//
// AGENTS.md hard rule #5 — no auto-launched Studio. Iterations happen via
// regenerate-slot + re-render, not Studio scrubbing.

import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { resolveArtifactKindDirs, projectDir } from "../lib/paths.js";
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

// Emit the auto social-compressed sibling deliverable (#073). Derives the
// social path next to the finalized master (<basename>-social.mp4), re-encodes
// it via the shared compress recipe with forceOverwrite:false so an existing
// social cut auto-versions instead of being clobbered (append-only invariant
// #14), and returns the resolved path + byte size for the command summary. The
// recipe logs its own `ffmpeg/compress-social` gen-log row because projectId is
// passed — no manual duplicate row here.
async function emitSocialDeliverable(args: {
  renderFinal: string;
  socialCrf: number;
  projectId: string;
  ui: typeof import("../lib/ui.js");
}): Promise<{ path: string; bytes: number }> {
  const { renderFinal, socialCrf, projectId, ui } = args;
  const socialDst = path.join(
    path.dirname(renderFinal),
    path.basename(renderFinal, ".mp4") + "-social.mp4",
  );
  const written = await ui.withSpinner(
    `Social cut (CRF ${socialCrf}) → ${path.basename(socialDst)}`,
    () =>
      compressForSocial({
        src: renderFinal,
        dst: socialDst,
        crf: socialCrf,
        forceOverwrite: false,
        projectId,
        note: "render --social",
      }),
    {
      successText: (p) => `Social cut (CRF ${socialCrf}) → ${ui.c.path(p)}`,
      failText: () => `Social compress failed`,
    },
  );
  const finalPath = typeof written === "string" ? written : socialDst;
  return { path: finalPath, bytes: await fileSize(finalPath) };
}

export function renderCmd() {
  const cmd = new Command("render")
    .argument("<project>", "Project ID")
    .description(
      "Render a project to MP4. Engine: HyperFrames (HTML + GSAP). " +
        "Writes <project>/render/final.mp4. Adds EBU R128 loudnorm with --loudnorm. " +
        "Also auto-emits a compressed social sibling render/final-social.mp4 (CRF 20 default, x264 faststart) " +
        "so 'render → upload' is one command; pass --no-compress to skip it.",
    );
  cmd.addHelpText(
    "after",
    `
Examples:
  ralphy render spring-001
  ralphy render proj-001 --loudnorm
  ralphy render proj-001 --output ./out.mp4
  ralphy render proj-001 --fps 60 --quality high
  ralphy render arena-rocker-001 --from-clip raw.mp4 --loudnorm
  ralphy render proj-001 --no-compress              # master only, skip final-social.mp4
  ralphy render proj-001 --social-crf 18            # higher-quality (larger) social cut

The social cut: every render also writes render/final-social.mp4 — an x264
faststart re-encode of the finalized master, sized for direct upload. Default
CRF is 20 (not 23) because grainy registers (PS1 / VHS) are high-entropy and
ring at higher CRFs; raise --social-crf for a smaller file at the cost of grain
fidelity, lower it for a larger, cleaner cut. The social cut inherits the
master's already-loudnormed audio (no double loudnorm) and never overwrites
render/final.mp4 (append-only).
`,
  );
  return cmd
    .option("--composition <id>", "Composition id (default: index.html)")
    .option("--output <path>", "Output mp4 path (default: <project>/render/final.mp4)")
    .option(
      "--from-clip <path>",
      "Pure-clip deliverable mode: faststart-wrap (and optionally loudnorm) an existing mp4 instead of running the HyperFrames engine. Logs to the project's gen-log so the single-entry-point invariant (AGENTS.md #2) holds. #009",
    )
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
      "After the base render, mix one variant per <project>/artifacts/music/*.mp3 onto the final mp4. Writes render/final.<music-basename>.mp4 per bed. #049",
      false,
    )
    .option(
      "--music-volume <n>",
      "Music gain for --music-variants (default 0.18, background bed under VO)",
      (v) => parseFloat(v),
      0.18,
    )
    .option(
      "--no-compress",
      "Skip the auto social-compressed deliverable (render/final-social.mp4)",
    )
    .option(
      "--social-crf <n>",
      "x264 CRF for the auto social cut (default 20; raise for smaller files, lower for cleaner grain)",
      (v) => parseInt(v, 10),
      20,
    )
    .option(
      "--workers <n>",
      "Parallel capture workers (number or 'auto'). Lower to 1 for heavy compositions (many embedded videos / large GSAP timelines) that hit 'Runtime.callFunctionOn timed out' under the default auto fan-out.",
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

      // Commander maps `--no-compress` to opts.compress === false (default true).
      const socialCrf: number = typeof opts.socialCrf === "number" ? opts.socialCrf : 20;
      const emitSocial = opts.compress !== false;

      if (opts.dryRun) {
        const renderDir = path.join(projectDir(projectId), "render");
        const renderFinal = opts.output ? path.resolve(opts.output) : path.join(renderDir, "final.mp4");
        // The social sibling sits next to the master: <basename>-social.mp4.
        const socialFinal = path.join(
          path.dirname(renderFinal),
          path.basename(renderFinal, ".mp4") + "-social.mp4",
        );
        const compositionId = opts.composition ?? "index.html";
        const socialStage = emitSocial
          ? [{ stage: "ffmpeg-compress-social", crf: socialCrf, output: socialFinal, est_usd: 0 }]
          : [];
        const stages = opts.fromClip
          ? [
              { stage: "ffmpeg-from-clip-wrap", source: path.resolve(opts.fromClip), output: renderFinal, est_usd: 0 },
              ...(opts.loudnorm ? [{ stage: "ffmpeg-loudnorm", target: "-16 LUFS", est_usd: 0 }] : []),
              ...(gradePreset ? [{ stage: "ffmpeg-color-grade", preset: gradePreset, est_usd: 0 }] : []),
              ...(deliverableQuality
                ? [{ stage: "ffmpeg-compress", quality: deliverableQuality, crf: qualityPresetToCrf(deliverableQuality), est_usd: 0 }]
                : []),
              ...socialStage,
            ]
          : [
              { stage: engineEndpoint, engine, composition: compositionId, output: renderFinal, est_usd: 0 },
              ...(opts.loudnorm ? [{ stage: "ffmpeg-loudnorm", target: "-16 LUFS", est_usd: 0 }] : []),
              ...(gradePreset ? [{ stage: "ffmpeg-color-grade", preset: gradePreset, est_usd: 0 }] : []),
              ...(deliverableQuality
                ? [{ stage: "ffmpeg-compress", quality: deliverableQuality, crf: qualityPresetToCrf(deliverableQuality), est_usd: 0 }]
                : []),
              ...socialStage,
            ];
        if (opts.summary) {
          const baseStageKey = opts.fromClip ? "ffmpeg-from-clip-wrap" : engineEndpoint;
          out({
            dryRun: true,
            engine: opts.fromClip ? "ffmpeg" : engine,
            stages: {
              [baseStageKey]: { count: 1, est_usd: 0 },
              ...(opts.loudnorm ? { "ffmpeg-loudnorm": { count: 1, est_usd: 0 } } : {}),
              ...(gradePreset ? { "ffmpeg-color-grade": { count: 1, est_usd: 0 } } : {}),
              ...(deliverableQuality ? { "ffmpeg-compress": { count: 1, est_usd: 0 } } : {}),
              ...(emitSocial ? { "ffmpeg-compress-social": { count: 1, crf: socialCrf, est_usd: 0 } } : {}),
            },
            cost_estimate_usd: 0,
          });
        } else {
          out({
            dryRun: true,
            engine: opts.fromClip ? "ffmpeg" : engine,
            would_call: stages,
            cost_estimate_usd: 0,
            would_write: [renderFinal, ...(emitSocial ? [socialFinal] : [])],
          });
        }
        return;
      }

      const cs = new CommandStream();
      const renderDir = path.join(projectDir(projectId), "render");
      await fs.mkdir(renderDir, { recursive: true });
      const renderRaw = path.join(renderDir, "final.raw.mp4");
      const renderFinal = opts.output
        ? path.resolve(opts.output)
        : path.join(renderDir, "final.mp4");
      const ui = await import("../lib/ui.js");

      const projDir = projectDir(projectId);

      // --from-clip mode (#009): pure-clip deliverable — no HF engine run.
      // Faststart-wrap the source clip into renderFinal, then run the same
      // optional loudnorm / grade / compress chain. Single entry-point invariant
      // (AGENTS.md #2) is preserved because everything still flows through
      // `ralphy render` and lands a gen-log row.
      if (opts.fromClip) {
        const src = path.resolve(opts.fromClip);
        try {
          await fs.access(src);
        } catch {
          raiseError("E_FILE_UNREADABLE", { path: src });
        }
        cs.event("render-started", { project: projectId, engine: "ffmpeg", source: src });
        const hasPostRender =
          Boolean(opts.loudnorm) || Boolean(gradePreset) || Boolean(deliverableQuality);
        const wrapOut = hasPostRender ? renderRaw : renderFinal;
        // Plain faststart wrap: stream copy A/V, just rewrite the moov atom to
        // the front of the file for browser-progressive playback.
        const wrap = await ui.withSpinner(
          `Wrap (faststart) → ${path.basename(wrapOut)}`,
          () =>
            new Promise<{ exitCode: number; stderr: string }>((resolve) => {
              const proc = spawn(
                "ffmpeg",
                [
                  "-y",
                  "-i",
                  src,
                  "-c",
                  "copy",
                  "-movflags",
                  "+faststart",
                  wrapOut,
                ],
                { stdio: ["ignore", "ignore", "pipe"] },
              );
              let stderr = "";
              proc.stderr.on("data", (c) => (stderr += c.toString()));
              proc.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
            }),
          {
            successText: () => `Wrapped (faststart) → ${ui.c.path(wrapOut)}`,
            failText: () => `ffmpeg faststart wrap failed`,
          },
        );
        if (wrap.exitCode !== 0) {
          await logGeneration(projectId, {
            provider: "ffmpeg",
            model: "ffmpeg-from-clip-wrap",
            endpoint: "ffmpeg-from-clip-wrap",
            kind: "video",
            input: { project: projectId, source: src, loudnorm: Boolean(opts.loudnorm) },
            status: "error",
            error: wrap.stderr.slice(-500),
            latency_ms: Date.now() - t0,
            cost_usd: 0,
            note: "from-clip wrap failed",
          });
          raiseError("E_INTERNAL", {
            detail: `ffmpeg faststart wrap failed (exit ${wrap.exitCode}): ${wrap.stderr.slice(-300)}`,
          });
        }

        let outputPath = wrapOut;
        const tmpStages: string[] = [];
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
                  forceOverwrite: true,
                  projectId,
                  note: `render --from-clip --grade ${gradePreset}`,
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
                  note: `render --from-clip --quality ${deliverableQuality}`,
                }),
              { successText: () => `Compressed (${deliverableQuality}, CRF ${crf}) → ${ui.c.path(nextOut)}` },
            );
          }
          outputPath = nextOut;
        }
        if (hasPostRender) {
          await fs.unlink(renderRaw).catch(() => undefined);
          for (const t of tmpStages) {
            await fs.unlink(t).catch(() => undefined);
          }
          outputPath = renderFinal;
        }

        const sz = await fileSize(outputPath);
        cs.event("render-finished", { project: projectId, engine: "ffmpeg", bytes: sz });
        await logGeneration(projectId, {
          provider: "ffmpeg",
          model: "ffmpeg-from-clip-wrap",
          endpoint: "ffmpeg-from-clip-wrap",
          kind: "video",
          input: {
            project: projectId,
            source: src,
            loudnorm: Boolean(opts.loudnorm),
            grade: gradePreset ?? null,
            quality: deliverableQuality ?? null,
          },
          output: { local: outputPath, bytes: sz },
          status: "ok",
          latency_ms: Date.now() - t0,
          cost_usd: 0,
          note: [
            "from-clip",
            opts.loudnorm ? "loudnorm" : null,
            gradePreset ? `grade=${gradePreset}` : null,
            deliverableQuality ? `quality=${deliverableQuality}` : null,
          ]
            .filter(Boolean)
            .join(" + "),
        });
        // Auto social-compressed sibling deliverable (#073). Re-encodes the
        // finalized master (which already carries the loudnormed audio) into a
        // share-ready x264 faststart cut. Never overwrites the master:
        // compressForSocial(forceOverwrite:false) auto-versions on collision.
        const social = emitSocial
          ? await emitSocialDeliverable({
              renderFinal: outputPath,
              socialCrf,
              projectId,
              ui,
            })
          : null;
        cs.summary({
          project: projectId,
          engine: "ffmpeg",
          mode: "from-clip",
          source: src,
          path: outputPath,
          bytes: sz,
          loudnorm: Boolean(opts.loudnorm),
          grade: gradePreset ?? null,
          quality: deliverableQuality ?? null,
          social,
          latencyMs: Date.now() - t0,
        });
        return;
      }

      if (!looksLikeHyperframesProject(projDir)) {
        raiseError("E_FILE_UNREADABLE", {
          path: path.join(projDir, "index.html"),
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
        lintResult = await lintHyperframesProject(projDir, opts.composition);
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
              `Fix the errors above and re-run, or see notes/issues/done/047-hyperframes-edge-case-rules.md.`,
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
            projectDir: projDir,
            outputPath: renderOut,
            composition: opts.composition,
            fps: opts.fps !== undefined ? Number(opts.fps) : undefined,
            quality: engineQuality,
            format: opts.format,
            resolution: opts.resolution,
            workers: opts.workers,
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
          input: { project: projectId, engine, projectDir: projDir, composition: opts.composition },
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
          projectDir: projDir,
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
      // --music-variants (#049): auto-discover <project>/artifacts/music/*.mp3
      // and render one variant per file. Final mp4 untouched — each variant
      // is a sibling final.<music-basename>.mp4 next to it.
      const musicVariants: Array<{ music: string; out: string; bytes: number }> = [];
      if (opts.musicVariants) {
        const musicDirs = resolveArtifactKindDirs(projectId, "music");
        let beds: string[] = [];
        try {
          const seen = new Set<string>();
          for (const musicDir of musicDirs) {
            const entries = await fs.readdir(musicDir).catch(() => [] as string[]);
            for (const e of entries) {
              if (!/\.(mp3|m4a|wav|aac|ogg)$/i.test(e)) continue;
              if (seen.has(e)) continue;
              seen.add(e);
              beds.push(path.join(musicDir, e));
            }
          }
          beds.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
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
      // Auto social-compressed sibling deliverable (#073). Runs only once the
      // master is fully finalized (post loudnorm/grade/quality-compress) so the
      // social cut inherits the loudnormed audio — no double loudnorm. Writes a
      // NEW file, never overwrites final.mp4 (append-only invariant #14).
      const social = emitSocial
        ? await emitSocialDeliverable({
            renderFinal: outputPath,
            socialCrf,
            projectId,
            ui,
          })
        : null;
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
        social,
        latencyMs: Date.now() - t0,
      });
    });
}
