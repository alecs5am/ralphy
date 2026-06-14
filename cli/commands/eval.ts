// `ralphy eval video <path>` — quality evaluator for rendered UGC videos.
//
// Per AGENTS.md hard rule #2, all model calls (the per-scene vision pass)
// route through cli/lib/providers/llm.ts. The CLI surface is the
// single entry-point so the agent skill `/evaluator` doesn't have
// to reach into TS internals.

import { Command } from "commander";
import path from "node:path";
import { out, err } from "../lib/output.js";
import { evaluateVideo } from "../lib/eval/orchestrator.js";
import { discoverStyleLock } from "../lib/style-lock.js";
import { EVAL_MODES, type EvalMode } from "../lib/eval/types.js";

export function evalCmd() {
  const cmd = new Command("eval").description("Evaluate the quality of a rendered video");

  cmd
    .command("video <path>")
    .description("Run the eval pipeline on a single mp4 and write eval-report.md + eval.json. Defaults to the native-video final gate (full-mp4 model pass) when a model provider is configured; without one it falls back to structure-only (not a ship gate).")
    .option(
      "--mode <mode>",
      "Validation mode: structure (deterministic only, no model) | keyframe (cheap per-scene vision smoke check) | native-video (full-mp4 temporal/audio/pacing/caption/format gate, no style sheet) | deep-style (native-video + style-lock/brief/reference conformance). Omit for the default final gate (native-video, or deep-style when a style lock/brief is discoverable).",
    )
    .option("--project <id>", "Override project auto-detection (use for videos outside the project tree)")
    .option("--no-project", "Disable project context entirely (treat as standalone video)")
    .option("--no-vision", "Legacy alias for --mode structure (skip every model pass — deterministic only)")
    .option("--out-dir <path>", "Override output directory (default: project dir or video's parent)")
    .option("--vision-concurrency <n>", "Parallel scene-vision requests (default 3)", (v) => parseInt(v, 10))
    .option("--style-sheet <path>", "Path to a style-sheet.md or STYLE_LOCK.md (e.g. from `ralphy research scrape-profile` or `ralphy project style-lock`). Implies --mode deep-style (full-mp4 style-conformance pass). When omitted, auto-discovers the project-local STYLE_LOCK.md (#408) by walking up from the video path.")
    .option("--brief <path>", "Path to a BRIEF.md. Implies --mode deep-style and scores intent conformance.")
    .option("--reference-urls <urls...>", "Reference video URLs (the creator's target benchmark) — fed into the deep-style context")
    .option("--deep-vision-model <id>", "Override the full-mp4 model (default google/gemini-3.1-pro-preview)")
    .option("--no-deep-vision", "Legacy alias: cap the mode at keyframe (never run the full-mp4 native pass even when a style-sheet/BRIEF.md is present)")
    .action(async (videoPath: string, opts) => {
      try {
        const resolvedVideo = path.resolve(videoPath);

        let mode: EvalMode | null = null;
        if (opts.mode) {
          if (!EVAL_MODES.includes(opts.mode as EvalMode)) {
            err(`unknown --mode "${opts.mode}". Valid: ${EVAL_MODES.join(", ")}`);
            return;
          }
          mode = opts.mode as EvalMode;
        }

        // #408: when no explicit --style-sheet override is passed, auto-discover
        // the project-local STYLE_LOCK.md by walking up from the video path. Skip
        // the discovery when the mode can't use it (structure / keyframe /
        // explicit native-video) or the legacy --no-deep-vision cap is set.
        let styleSheetPath: string | null = opts.styleSheet ?? null;
        const styleSheetUsable = (!mode || mode === "deep-style") && opts.deepVision !== false;
        if (!styleSheetPath && styleSheetUsable) {
          const discovered = discoverStyleLock(resolvedVideo);
          if (discovered) {
            styleSheetPath = discovered;
            process.stderr.write(
              `ralphy: auto-discovered project style lock → deep-style gate (${discovered}) — pass --mode native-video to skip style scoring, --style-sheet to override\n`,
            );
          }
        }

        const result = await evaluateVideo({
          videoPath: resolvedVideo,
          mode,
          projectId: opts.project === false ? null : opts.project,
          noVision: opts.vision === false,
          outDir: opts.outDir,
          visionConcurrency: opts.visionConcurrency,
          styleSheetPath,
          briefPath: opts.brief ?? null,
          referenceUrls: opts.referenceUrls ?? [],
          deepVisionModel: opts.deepVisionModel,
          noDeepVision: opts.deepVision === false,
        });
        out({
          verdict: result.report.scoring.verdict,
          score: result.report.scoring.score,
          mode: result.report.gate.mode,
          shipReady: result.report.gate.shipReady,
          gateReason: result.report.gate.reason,
          findings: result.report.findings.length,
          severities: result.report.scoring.penalties,
          jsonPath: result.jsonPath,
          mdPath: result.mdPath,
        });
      } catch (e) {
        err(`eval failed: ${(e as Error).message}`);
      }
    });

  return cmd;
}
