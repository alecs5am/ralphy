// `ralphy eval video <path>` — quality evaluator for rendered UGC videos.
//
// Per AGENTS.md hard rule #2, all model calls (the per-scene vision pass)
// route through cli/lib/providers/llm.ts. The CLI surface is the
// single entry-point so the agent skill `/ralph-evaluator` doesn't have
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
    .action(async (videoPath: string, opts) => {
      try {
        const result = await evaluateVideo({
          videoPath: path.resolve(videoPath),
          projectId: opts.project === false ? null : opts.project,
          noVision: opts.vision === false,
          outDir: opts.outDir,
          visionConcurrency: opts.visionConcurrency,
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
