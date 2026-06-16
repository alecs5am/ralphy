// `ralphy eval video <path>` — quality evaluator for rendered UGC videos.
//
// Per AGENTS.md hard rule #2, all model calls (the per-scene vision pass)
// route through cli/lib/providers/llm.ts. The CLI surface is the
// single entry-point so the agent skill `/evaluator` doesn't have
// to reach into TS internals.

import { Command } from "commander";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { out, err } from "../lib/output.js";
import { evaluateVideo } from "../lib/eval/orchestrator.js";
import { discoverStyleLock } from "../lib/style-lock.js";
import { EVAL_MODES, type EvalMode } from "../lib/eval/types.js";
import { checkFidelity, FIDELITY_ARTIFACT } from "../lib/eval/fidelity.js";
import { checkTextLegibility, TEXT_LEGIBILITY_ARTIFACT } from "../lib/eval/ocr.js";
import { checkFirstFrameHook, HOOK_ARTIFACT } from "../lib/eval/hook.js";
import { checkCaptions, CAPTIONS_GATE_ARTIFACT } from "../lib/eval/captions-gate.js";
import { checkClaims, CLAIMS_ARTIFACT } from "../lib/eval/claims.js";
import { projectDir } from "../lib/paths.js";
import { protectExistingAsset } from "../lib/providers/shared.js";

/** Read the project's resolved content mode from production-plan.json, or null. */
function readProjectMode(projectId: string): string | null {
  try {
    const abs = path.join(projectDir(projectId), "production-plan.json");
    if (!existsSync(abs)) return null;
    const plan = JSON.parse(readFileSync(abs, "utf8")) as { contentMode?: { mode?: unknown } };
    const m = plan.contentMode?.mode;
    return typeof m === "string" ? m : null;
  } catch {
    return null;
  }
}

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

  cmd
    .command("fidelity <project>")
    .description("Run the product/brand fidelity gate (#422): compare the project's generated stills against the LOCKED product/brand refs + research-facts.json (productFacts / claimsToAvoid). Commercial modes only — a non-commercial project returns a not-applicable pass. Writes fidelity.json (append-only) and prints the verdict + blocksShip. Example: ralphy eval fidelity glitter-cream-001")
    .option("--mode <mode>", "Override the content mode (default: read from the project's production-plan.json)")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (project: string, opts) => {
      try {
        const mode = (opts.mode as string | undefined) ?? readProjectMode(project);
        const report = await checkFidelity({ projectId: project, mode });

        // Append-only persistence: archive any existing fidelity.json to .vN first.
        const dest = path.join(projectDir(project), FIDELITY_ARTIFACT);
        const fs = await import("node:fs/promises");
        await protectExistingAsset(dest, false);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(report, null, 2));

        out({
          verdict: report.verdict,
          blocksShip: report.blocksShip,
          applicable: report.applicable,
          mode: report.mode,
          reason: report.reason,
          assets: report.assets.length,
          findings: report.findings.length,
          missingRefs: report.requiredRefs.missing,
          jsonPath: dest,
        });
      } catch (e) {
        err(`eval fidelity failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("ocr <project>")
    .description("Run the text-legibility / OCR gate (#439): read the baked copy in the project's stills + sampled video frames and flag unreadable small text, clipped copy, garbled text / typos, wrong emphasis, and literal markdown artifacts. Compares against expected copy when --expected is given. Baked-text modes only — a text-free mode returns a not-applicable pass. Writes text-legibility.json (append-only). Example: ralphy eval ocr glitter-cream-001 --expected copy.txt")
    .option("--mode <mode>", "Override the content mode (default: read from the project's production-plan.json)")
    .option("--expected <file>", "Path to a file containing the expected copy to compare detected text against")
    .option("--no-text", "Skip the gate (use for an unclassified mode you know bakes no text)")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (project: string, opts) => {
      try {
        const mode = (opts.mode as string | undefined) ?? readProjectMode(project);
        let expectedCopy: string | null = null;
        if (opts.expected) {
          const abs = path.resolve(opts.expected as string);
          if (!existsSync(abs)) {
            err(`--expected file not found: ${abs}`);
            return;
          }
          expectedCopy = readFileSync(abs, "utf8");
        }
        const report = await checkTextLegibility({
          projectId: project,
          mode,
          expectedCopy,
          noText: opts.text === false,
        });

        // Append-only persistence: archive any existing report to .vN first.
        const dest = path.join(projectDir(project), TEXT_LEGIBILITY_ARTIFACT);
        const fs = await import("node:fs/promises");
        await protectExistingAsset(dest, false);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(report, null, 2));

        out({
          verdict: report.verdict,
          blocksShip: report.blocksShip,
          applicable: report.applicable,
          mode: report.mode,
          reason: report.reason,
          assets: report.assets.length,
          findings: report.findings.length,
          expectedCopyProvided: report.expectedCopyProvided,
          jsonPath: dest,
        });
      } catch (e) {
        err(`eval ocr failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("hook <project>")
    .description("Run the first-frame hook gate (#440): extract the FIRST FRAME + the ~1s preview from the project's render and score the opener on subject clarity, visual contrast, subject/product visibility, text-hook legibility, curiosity gap, and scroll-stop pull (mode-thresholded). Flags a MISLEADING opener that over-promises. A stills-only project returns a not-applicable pass. Writes hook.json (append-only) and prints the verdict + blocksShip + the 0-100 hook score the variant tournament (#421) can weight. Example: ralphy eval hook glitter-cream-001")
    .option("--mode <mode>", "Override the content mode (default: read from the project's production-plan.json) — drives the pass thresholds")
    .option("--video <path>", "Override the auto-detected video (default: render/final.mp4 then artifacts/videos)")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (project: string, opts) => {
      try {
        const mode = (opts.mode as string | undefined) ?? readProjectMode(project);
        const report = await checkFirstFrameHook({
          projectId: project,
          mode,
          videoPath: opts.video as string | undefined,
        });

        // Append-only persistence: archive any existing report to .vN first.
        const dest = path.join(projectDir(project), HOOK_ARTIFACT);
        const fs = await import("node:fs/promises");
        await protectExistingAsset(dest, false);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(report, null, 2));

        out({
          verdict: report.verdict,
          blocksShip: report.blocksShip,
          applicable: report.applicable,
          mode: report.mode,
          reason: report.reason,
          hookScore: report.hookScore,
          findings: report.findings.length,
          jsonPath: dest,
        });
      } catch (e) {
        err(`eval hook failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("captions <project>")
    .description("Run the caption sync/readability gate (#441): read the project's caption track + sampled render frames and flag timing drift vs the word-level startMs, captions on screen too briefly to read, overcrowded windows (too many words), captions overlapping a face/product/CTA, and unsafe placement in the platform UI chrome. ENRICHES (does not duplicate) the eval density findings (captions.thin/dense/missing). A project with no caption track returns a not-applicable pass. Writes captions-gate.json (append-only). Example: ralphy eval captions choose-silenthill-001")
    .option("--mode <mode>", "Override the content mode (default: read from the project's production-plan.json)")
    .option("--video <path>", "Override the auto-detected video (default: render/final.mp4 then artifacts/videos)")
    .option("--no-placement", "Skip the vision placement/occlusion pass (run the deterministic timing/duration/crowding checks only)")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (project: string, opts) => {
      try {
        const mode = (opts.mode as string | undefined) ?? readProjectMode(project);
        const report = await checkCaptions({
          projectId: project,
          mode,
          videoPath: opts.video as string | undefined,
          noPlacement: opts.placement === false,
        });

        // Append-only persistence: archive any existing report to .vN first.
        const dest = path.join(projectDir(project), CAPTIONS_GATE_ARTIFACT);
        const fs = await import("node:fs/promises");
        await protectExistingAsset(dest, false);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(report, null, 2));

        out({
          verdict: report.verdict,
          blocksShip: report.blocksShip,
          applicable: report.applicable,
          mode: report.mode,
          reason: report.reason,
          captionCount: report.captionCount,
          wordTimingsProvided: report.wordTimingsProvided,
          findings: report.findings.length,
          jsonPath: dest,
        });
      } catch (e) {
        err(`eval captions failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("claims <project>")
    .description("Run the claims & policy gate (#442): extract the factual claims in the project's commercial copy (script VO/hook + prompts + on-screen OCR text + captions + distribution/social copy) and classify each against product facts + mode/platform restrictions. Categories: health-medical, financial-earnings, performance-efficacy, warranty-guarantee, pricing, platform-policy, testimonial, prohibited-comparative. HIGH-RISK unsupported claims (health/financial/absolute) BLOCK ship unless proof is supplied (--proof or a research-facts.json productFacts/proofPoints entry). Commercial modes only — a non-commercial project returns a not-applicable pass. Writes claims.json (append-only). Example: ralphy eval claims glitter-cream-001 --proof substantiation.txt")
    .option("--mode <mode>", "Override the content mode (default: read from the project's production-plan.json)")
    .option("--proof <file>", "Path to a substantiation document whose lines back high-risk claims (downgrades a blocking claim to a pass)")
    .option("--no-claims", "Skip the gate (use for a commercial mode you know makes no provable claims)")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (project: string, opts) => {
      try {
        const mode = (opts.mode as string | undefined) ?? readProjectMode(project);
        if (opts.proof && !existsSync(path.resolve(opts.proof as string))) {
          err(`--proof file not found: ${path.resolve(opts.proof as string)}`);
          return;
        }
        const report = await checkClaims({
          projectId: project,
          mode,
          proof: (opts.proof as string | undefined) ?? null,
          noClaims: opts.claims === false,
        });

        // Append-only persistence: archive any existing report to .vN first.
        const dest = path.join(projectDir(project), CLAIMS_ARTIFACT);
        const fs = await import("node:fs/promises");
        await protectExistingAsset(dest, false);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(report, null, 2));

        out({
          verdict: report.verdict,
          blocksShip: report.blocksShip,
          applicable: report.applicable,
          mode: report.mode,
          reason: report.reason,
          claims: report.claims.length,
          findings: report.findings.length,
          proofProvided: report.proofProvided,
          jsonPath: dest,
        });
      } catch (e) {
        err(`eval claims failed: ${(e as Error).message}`);
      }
    });

  return cmd;
}
