// `ralphy eval video <path>` — quality evaluator for rendered UGC videos.
//
// Per AGENTS.md hard rule #2, all model calls (the per-scene vision pass)
// route through cli/lib/providers/llm.ts. The CLI surface is the
// single entry-point so the agent skill `/ralphy-evaluator` doesn't have
// to reach into TS internals.

import { Command } from "commander";
import path from "node:path";
import { out, err } from "../lib/output.js";
import { evaluateVideo } from "../lib/eval/orchestrator.js";

export function evalCmd() {
  const cmd = new Command("eval").description("Evaluate the quality of a rendered video");

  cmd
    .command("video <path>")
    .description("Run the full eval pipeline on a single mp4 (structure / audio / captions / vision) and write eval-report.md + eval.json")
    .option("--project <id>", "Override project auto-detection (use for videos outside workspace/projects)")
    .option("--no-project", "Disable project context entirely (treat as standalone video)")
    .option("--no-vision", "Skip the per-scene vision pass (faster, no model spend)")
    .option("--out-dir <path>", "Override output directory (default: project dir or video's parent)")
    .option("--vision-concurrency <n>", "Parallel scene-vision requests (default 3)", (v) => parseInt(v, 10))
    .option("--style-sheet <path>", "Path to a style-sheet.md (e.g. from `ralphy research scrape-profile`). Triggers deep-vision pass with project-specific style-conformance findings.")
    .option("--brief <path>", "Path to a BRIEF.md. Sent to deep-vision pass to score intent conformance.")
    .option("--reference-urls <urls...>", "Reference video URLs (the creator's target benchmark) — fed into deep-vision context")
    .option("--deep-vision-model <id>", "Override deep-vision model (default google/gemini-3.1-pro-preview)")
    .option("--no-deep-vision", "Skip the deep-vision pass even when style-sheet or BRIEF.md is available")
    .action(async (videoPath: string, opts) => {
      try {
        const result = await evaluateVideo({
          videoPath: path.resolve(videoPath),
          projectId: opts.project === false ? null : opts.project,
          noVision: opts.vision === false,
          outDir: opts.outDir,
          visionConcurrency: opts.visionConcurrency,
          styleSheetPath: opts.styleSheet ?? null,
          briefPath: opts.brief ?? null,
          referenceUrls: opts.referenceUrls ?? [],
          deepVisionModel: opts.deepVisionModel,
          noDeepVision: opts.deepVision === false,
        });
        out({
          verdict: result.report.scoring.verdict,
          score: result.report.scoring.score,
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
