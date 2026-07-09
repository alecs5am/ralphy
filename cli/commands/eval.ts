// `ralphy eval video <path>` — quality evaluator for rendered UGC videos.
//
// Per AGENTS.md hard rule #2, all model calls (the per-scene vision pass)
// route through cli/lib/providers/llm.ts. The CLI surface is the
// single entry-point so the agent skill `/evaluator` doesn't have
// to reach into TS internals.

import { Command } from "commander";
import path from "node:path";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { out, err } from "../lib/output.js";
import { evaluateVideo } from "../lib/eval/orchestrator.js";
import { discoverStyleLock } from "../lib/style-lock.js";
import { EVAL_MODES, type EvalMode } from "../lib/eval/types.js";
import { checkFidelity, FIDELITY_ARTIFACT } from "../lib/eval/fidelity.js";
import { checkTextLegibility, TEXT_LEGIBILITY_ARTIFACT } from "../lib/eval/ocr.js";
import { checkFirstFrameHook, HOOK_ARTIFACT } from "../lib/eval/hook.js";
import { checkCaptions, CAPTIONS_GATE_ARTIFACT } from "../lib/eval/captions-gate.js";
import { checkClaims, CLAIMS_ARTIFACT } from "../lib/eval/claims.js";
import {
  validatePlatformSpec,
  PLATFORM_SPEC_ARTIFACT,
  PLATFORM_KEYS,
} from "../lib/eval/platform.js";
import { runQualityFlywheel } from "../lib/eval/flywheel.js";
import { lintProse, type ProseTarget } from "../lib/eval/prose-tells.js";
import { planMetrics, runMetrics, enrichEvalWithMetrics } from "../lib/eval/metrics/run.js";
import { getMetricAdapter } from "../lib/eval/metrics/registry.js";
import { projectDir } from "../lib/paths.js";
import { protectExistingAsset } from "../lib/providers/shared.js";
import { parseCalibrationDataset } from "../lib/schemas/calibration.js";
import { runCalibration, isKnownGate, type RunCalibrationOptions } from "../lib/eval/calibration.js";
import {
  runPromptOptimization,
  writeProposal,
  readPromptFile,
  splitDataset,
  DEFAULT_TRAIN_FRACTION,
  type OptimizeKind,
  type RunPromptOptimizationOptions,
} from "../lib/eval/prompt-optimize.js";
import { raiseError } from "../lib/errors/index.js";
import type { ExpectedLabel } from "../lib/schemas/calibration.js";

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
    .command("prose <file>")
    .description("Run the deterministic AI-tell prose lint (#529) over a text file: a rule pack (inflated symbolism, superficial -ing analyses, promotional language, vague attribution, 'delve'-class AI vocabulary, copula avoidance, negative parallelisms, rule-of-three, false ranges, em-dash overuse, persuasive-authority tropes, signposting, chatbot artifacts, generic conclusions) plus a paragraph-rhythm-uniformity check. Each rule cites its source (Wikipedia 'Signs of AI writing'), carries a warn|fail level, and emits a #409-vocabulary finding. Makes ZERO model calls. Use --target captions to route findings to the editor (captions.ai-tell.*) instead of the scenarist (structure.ai-tell.*). Example: ralphy eval prose draft.md")
    .option("--target <target>", "Owner routing: prose (article/script → scenarist, default) | captions (→ editor)", "prose")
    .option("--pretty", "Render a table instead of JSON")
    .action((file: string, opts) => {
      try {
        const abs = path.resolve(file);
        if (!existsSync(abs)) {
          raiseError("E_NOT_FOUND", { kind: "text file", id: abs });
        }
        const target = (opts.target as string) === "captions" ? "captions" : "prose";
        const result = lintProse(readFileSync(abs, "utf8"), target as ProseTarget);
        const fails = result.findings.filter((f) => f.severity === "fail").length;
        const warns = result.findings.filter((f) => f.severity === "warn").length;
        out({
          file: abs,
          target,
          verdict: fails > 0 ? "fail" : warns > 0 ? "warn" : "pass",
          wordCount: result.wordCount,
          findings: result.findings.map((f) => ({
            category: f.category,
            severity: f.severity,
            message: f.message,
            fix: f.fixHint,
          })),
          ruleHits: result.ruleHits,
        });
      } catch (e) {
        err(`eval prose failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("run <project>")
    .description("Run the quality flywheel (#484): orchestrate the gates RELEVANT to a project (via gatesForContext over mode/format/platform), cheap-deterministic before model-graded, persist each gate's existing report (eval.json / hook.json / captions-gate.json / text-legibility.json / fidelity.json / claims.json / platform-spec.json), then call buildScorecard for the final verdict. Advisory gates (distribution-pack / council) are noted, never run. Recommends `ralphy project repair-plan` on a repair/blocked verdict — never spends or repairs. --dry-run prints the plan and makes ZERO model calls. Example: ralphy eval run glitter-cream-001 --platform tiktok,reels --dry-run")
    .option("--mode <mode>", "Override the content mode (default: read from the project's production-plan.json)")
    .option("--format <format>", "Override the media format (default: the mode's expected Unit format) — drives which temporal gates apply")
    .option("--platform <list>", `Comma-separated target platforms to validate against (${PLATFORM_KEYS.join(", ")}). Drives the platform-spec gate.`)
    .option("--dry-run", "Print the gate plan (which gates would run, the report each writes, cost-bearing flag, skipped-with-reason) and make ZERO model calls")
    .option("--no-vision", "Skip every vision/model pass where the gate supports it (deterministic-only, free)")
    .option("--cheap", "Run only the deterministic gates (structure + platform-spec) and skip every model-graded gate (implies --no-vision)")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (project: string, opts) => {
      try {
        if (!existsSync(projectDir(project))) {
          raiseError("E_NOT_FOUND", { kind: "Project", id: project });
        }
        const platforms = opts.platform
          ? String(opts.platform).split(",").map((s) => s.trim()).filter(Boolean)
          : [];
        const result = await runQualityFlywheel(project, {
          mode: opts.mode as string | undefined,
          format: opts.format as never,
          platforms,
          dryRun: !!opts.dryRun,
          noVision: opts.vision === false,
          cheap: !!opts.cheap,
        });
        out({
          projectId: result.projectId,
          mode: result.mode,
          format: result.format,
          platforms: result.platforms,
          dryRun: result.dryRun,
          plan: result.plan,
          gatesAttempted: result.gatesAttempted,
          gatesSkipped: result.gatesSkipped,
          costBearingGates: result.costBearingGates,
          failures: result.failures.map((f) => f.gate),
          scorecardVerdict: result.scorecardVerdict,
          scorecardReason: result.scorecardReason,
          nextAction: result.nextAction,
        });
      } catch (e) {
        err(`eval run failed: ${(e as Error).message}`);
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

  cmd
    .command("platform <project>")
    .description("Run the platform spec validator (#443): probe the project's final media (render/final.mp4 + artifacts/{images,videos}) and check each against the declared target platforms — aspect ratio, resolution, duration, file size, codecs, safe areas, required metadata. Reports CONCRETE fixes (e.g. 'H.264 required; got vp9 — re-encode'). A hard spec violation (wrong aspect / over-duration / unsupported codec / over-filesize) blocks ship. Defaults --platform to the project's distribution-pack platforms when present. Writes platform-spec.json (append-only). Example: ralphy eval platform glitter-cream-001 --platform tiktok,reels")
    .option("--platform <list>", `Comma-separated target platforms to validate against (${PLATFORM_KEYS.join(", ")}). Default: the project's distribution-pack platforms, else all video platforms.`)
    .option("--pretty", "Render a table instead of JSON")
    .action(async (project: string, opts) => {
      try {
        const platforms = resolvePlatformList(project, opts.platform as string | undefined);
        const report = validatePlatformSpec({ projectId: project, platforms });

        // Append-only persistence: archive any existing report to .vN first.
        const dest = path.join(projectDir(project), PLATFORM_SPEC_ARTIFACT);
        const fs = await import("node:fs/promises");
        await protectExistingAsset(dest, false);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(report, null, 2));

        out({
          verdict: report.verdict,
          blocksShip: report.blocksShip,
          applicable: report.applicable,
          platforms: report.platforms,
          reason: report.reason,
          mediaChecked: new Set(report.results.map((r) => r.media)).size,
          findings: report.findings.length,
          jsonPath: dest,
        });
      } catch (e) {
        err(`eval platform failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("calibrate")
    .description("Measure a binary eval JUDGE's agreement with human labels (#483). Reads a calibration dataset (human-labeled pass/fail examples for ONE gate) and runs the gate's judge over each example, then reports the confusion matrix + TPR/TNR/precision/recall/accuracy + Cohen's kappa + a promote-vs-advisory recommendation (default bar kappa >= 0.6). Binary convention: positive class = the gate should BLOCK (verdict fail). Offline with --predictions (a { exampleId: pass|fail } map → NO model calls, the CI seam); without it the LIVE judge runs (paid, honors --no-vision). Example: ralphy eval calibrate --gate first-frame-hook --dataset hooks.json --predictions preds.json")
    .requiredOption("--gate <id>", "The QUALITY_GATES id to calibrate (e.g. first-frame-hook, ocr, captions) — must match the dataset's gate")
    .requiredOption("--dataset <path>", "Path to the calibration dataset JSON (version, gate, examples[])")
    .option("--predictions <path>", "Path to a JSON map { exampleId: \"pass\"|\"fail\" } of pre-recorded judge predictions — runs OFFLINE (no model calls)")
    .option("--model <id>", "Judge-model id to record in the report (and use on the live path)")
    .option("--no-vision", "On the live path, skip the gate's vision pass where supported (free deterministic-only judge)")
    .option("--out <path>", "Persist the report JSON to this path (append-only / auto-versioned). Omit to print only.")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (opts) => {
      try {
        // — Read + parse the dataset.
        const datasetPath = path.resolve(opts.dataset as string);
        if (!existsSync(datasetPath)) {
          raiseError("E_NOT_FOUND", { kind: "calibration dataset", id: datasetPath });
        }
        let dataset;
        try {
          dataset = parseCalibrationDataset(JSON.parse(readFileSync(datasetPath, "utf8")));
        } catch (e) {
          raiseError("E_FILE_MALFORMED", {
            format: "calibration dataset",
            path: datasetPath,
            detail: (e as Error).message,
          });
        }

        // — Validate --gate against the dataset + the known gate registry.
        const gate = opts.gate as string;
        if (!isKnownGate(gate)) {
          raiseError("E_INPUT_INVALID", {
            field: "--gate",
            detail: `unknown quality gate "${gate}" — see QUALITY_GATES (e.g. first-frame-hook, ocr, captions)`,
          });
        }
        if (gate !== dataset.gate) {
          raiseError("E_INPUT_INVALID", {
            field: "--gate",
            detail: `--gate "${gate}" does not match the dataset's gate "${dataset.gate}"`,
          });
        }

        // — Optional offline predictions map.
        const runOpts: RunCalibrationOptions = {
          model: opts.model as string | undefined,
          noVision: opts.vision === false,
        };
        if (opts.predictions) {
          const predPath = path.resolve(opts.predictions as string);
          if (!existsSync(predPath)) {
            raiseError("E_NOT_FOUND", { kind: "predictions map", id: predPath });
          }
          try {
            runOpts.predictions = JSON.parse(readFileSync(predPath, "utf8")) as Record<string, ExpectedLabel>;
          } catch (e) {
            raiseError("E_FILE_MALFORMED", {
              format: "predictions map",
              path: predPath,
              detail: (e as Error).message,
            });
          }
        }

        const report = await runCalibration(dataset, runOpts);

        // — Append-only persistence ONLY when --out is given (default: print only).
        let jsonPath: string | null = null;
        if (opts.out) {
          const dest = path.resolve(opts.out as string);
          const fs = await import("node:fs/promises");
          await protectExistingAsset(dest, false);
          await fs.mkdir(path.dirname(dest), { recursive: true });
          await fs.writeFile(dest, JSON.stringify(report, null, 2));
          jsonPath = dest;
        }

        out({
          gate: report.gate,
          offline: report.offline,
          judgeModel: report.judgeModel,
          judgePromptVersion: report.judgePromptVersion,
          n: report.metrics.n,
          confusion: report.metrics.confusion,
          tpr: report.metrics.tpr,
          tnr: report.metrics.tnr,
          precision: report.metrics.precision,
          recall: report.metrics.recall,
          accuracy: report.metrics.accuracy,
          cohensKappa: report.metrics.cohensKappa,
          promotionKappaBar: report.promotionKappaBar,
          recommendation: report.recommendation,
          examples: report.examples,
          jsonPath,
        });
      } catch (e) {
        err(`eval calibrate failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("metrics <project>")
    .description("Run the OPTIONAL specialized media metric adapters (#485) and ENRICH the project's eval.json under `metrics` (read → merge → write back, append-only). Adapters degrade to `na` + an actionable hint when their tool/model/expected-input is missing — they never crash and never change the eval verdict. Initial adapters: tts-wer (speech intelligibility = Word Error Rate of the transcribed VO vs the expected script; needs --expected + a transcribe provider) and image-aesthetic (a pluggable seam, `na` until a scorer is configured). --dry-run lists the applicable adapters + availability + thresholds with ZERO model calls. Example: ralphy eval metrics glitter-cream-001 --adapter tts-wer --expected script.txt --dry-run")
    .option("--adapter <id>", "Run only this adapter id (tts-wer | image-aesthetic). Default: all registered adapters.")
    .option("--expected <path>", "Path to a file with the expected text (the script the VO speaks) — required for the tts-wer adapter to score")
    .option("--mode <mode>", "Override the content mode (default: read from the project's production-plan.json) — drives per-mode threshold overrides")
    .option("--dry-run", "List the applicable adapters + their availability (ok / na+hint) + thresholds, make ZERO model calls")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (project: string, opts) => {
      try {
        if (!existsSync(projectDir(project))) {
          raiseError("E_NOT_FOUND", { kind: "Project", id: project });
        }
        const adapterId = opts.adapter as string | undefined;
        if (adapterId && !getMetricAdapter(adapterId)) {
          raiseError("E_INPUT_INVALID", {
            field: "--adapter",
            detail: `unknown metric adapter "${adapterId}" — known: tts-wer, image-aesthetic`,
            verb: "eval",
          });
        }

        let expectedText: string | null = null;
        if (opts.expected) {
          const abs = path.resolve(opts.expected as string);
          if (!existsSync(abs)) {
            err(`--expected file not found: ${abs}`);
            return;
          }
          expectedText = readFileSync(abs, "utf8");
        }

        const mode = (opts.mode as string | undefined) ?? readProjectMode(project);
        const runOpts = {
          projectId: project,
          adapterId: adapterId ?? null,
          mode,
          expectedText,
        };

        if (opts.dryRun) {
          const plan = await planMetrics(runOpts);
          out({
            project,
            mode,
            dryRun: true,
            adapters: plan,
            note: "dry-run — availability + thresholds only, no adapters executed (ZERO model calls).",
          });
          return;
        }

        const metrics = await runMetrics(runOpts);
        const { enriched, evalPath } = await enrichEvalWithMetrics(project, metrics);
        out({
          project,
          mode,
          dryRun: false,
          metrics,
          enrichedEvalJson: enriched,
          evalPath: enriched ? evalPath : null,
          note: enriched
            ? "metric results merged into eval.json under `metrics` (prior version archived)."
            : "no eval.json to enrich — run `ralphy eval video <project>` first; the metrics above were computed but not persisted.",
        });
      } catch (e) {
        err(`eval metrics failed: ${(e as Error).message}`);
      }
    });

  cmd
    .command("optimize-prompt")
    .description("EXPERIMENTAL (#486): improve a judge/generator prompt against a #483 calibration dataset and emit a REVIEWABLE proposal. Splits the dataset into train/held-out (deterministic by id-hash), evaluates the BASELINE prompt on held-out, asks the LLM to improve it from the train-split failures, evaluates the CANDIDATE on held-out, then compares baseline-vs-candidate Cohen's kappa. NEVER overwrites the source prompt / templates / guidelines / MODELS.md — a `propose` recommendation writes an append-only `proposal-vN/` dir for a maintainer to apply by hand. DSPy/MIPRO is the inspiration, not a hard dep. Offline (the CI seam, NO model calls): --baseline-predictions + --candidate-predictions ({ exampleId: pass|fail } maps) + --candidate (a candidate prompt file). --dry-run prints the plan only. Example: ralphy eval optimize-prompt --prompt judge.txt --dataset hooks.json --baseline-predictions base.json --candidate-predictions cand.json --candidate cand.txt")
    .requiredOption("--prompt <path>", "Path to the source prompt being optimized (read-only — NEVER written)")
    .requiredOption("--dataset <path>", "Path to the calibration dataset JSON (version, gate, examples[])")
    .option("--kind <kind>", "judge (default — #483 binary metrics) or generator", "judge")
    .option("--gate <id>", "Override the gate id (default: the dataset's gate) — must be a known QUALITY_GATES id")
    .option("--train-split <frac>", `Train-split fraction in (0,1) (default ${DEFAULT_TRAIN_FRACTION})`, (v) => parseFloat(v))
    .option("--budget <n>", "Max candidate-generation attempts on the live path (default 1)", (v) => parseInt(v, 10))
    .option("--seed <n>", "Deterministic split seed (default 0)", (v) => parseInt(v, 10))
    .option("--out <dir>", "Proposals dir to write a `propose` candidate into (default: <dataset-dir>/prompt-proposals/)")
    .option("--baseline-predictions <path>", "OFFLINE seam: JSON map { exampleId: \"pass\"|\"fail\" } of BASELINE judge predictions on the held-out split (no model calls)")
    .option("--candidate-predictions <path>", "OFFLINE seam: JSON map { exampleId: \"pass\"|\"fail\" } of CANDIDATE judge predictions on the held-out split (no model calls)")
    .option("--candidate <path>", "OFFLINE seam: a candidate prompt file — skips the live LLM candidate generation")
    .option("--model <id>", "Judge/optimizer model id (used on the live path)")
    .option("--no-vision", "On the live path, skip the gate's vision pass where supported (free deterministic-only judge)")
    .option("--dry-run", "Print the plan (train/held-out sizes, what would run, cost-bearing) and make ZERO model calls")
    .option("--pretty", "Render a table instead of JSON")
    .action(async (opts) => {
      try {
        // — Read + validate the prompt file.
        const promptPath = path.resolve(opts.prompt as string);
        if (!existsSync(promptPath)) {
          raiseError("E_NOT_FOUND", { kind: "prompt file", id: promptPath });
        }
        const baselinePrompt = readPromptFile(promptPath);

        // — Read + parse the dataset.
        const datasetPath = path.resolve(opts.dataset as string);
        if (!existsSync(datasetPath)) {
          raiseError("E_NOT_FOUND", { kind: "calibration dataset", id: datasetPath });
        }
        let dataset;
        try {
          dataset = parseCalibrationDataset(JSON.parse(readFileSync(datasetPath, "utf8")));
        } catch (e) {
          raiseError("E_FILE_MALFORMED", {
            format: "calibration dataset",
            path: datasetPath,
            detail: (e as Error).message,
          });
        }

        // — Validate --kind.
        const kind = opts.kind as string;
        if (kind !== "judge" && kind !== "generator") {
          raiseError("E_INPUT_INVALID", {
            field: "--kind",
            detail: `unknown kind "${kind}" — expected "judge" or "generator"`,
          });
        }

        // — Validate --gate (defaults to the dataset's gate) against the known registry.
        const gate = (opts.gate as string | undefined) ?? dataset.gate;
        if (!isKnownGate(gate)) {
          raiseError("E_INPUT_INVALID", {
            field: "--gate",
            detail: `unknown quality gate "${gate}" — see QUALITY_GATES (e.g. first-frame-hook, ocr, captions)`,
          });
        }

        // — Validate --train-split.
        const trainFraction = opts.trainSplit !== undefined ? Number(opts.trainSplit) : DEFAULT_TRAIN_FRACTION;
        if (!Number.isFinite(trainFraction) || trainFraction <= 0 || trainFraction >= 1) {
          raiseError("E_INPUT_INVALID", {
            field: "--train-split",
            detail: `train-split must be a number in (0,1); got "${opts.trainSplit}"`,
          });
        }
        const seed = opts.seed !== undefined ? Number(opts.seed) : 0;

        // — Read the optional offline seams.
        const readPredMap = (flag: string, p: string): Record<string, ExpectedLabel> => {
          const abs = path.resolve(p);
          if (!existsSync(abs)) {
            raiseError("E_NOT_FOUND", { kind: `${flag} map`, id: abs });
          }
          try {
            return JSON.parse(readFileSync(abs, "utf8")) as Record<string, ExpectedLabel>;
          } catch (e) {
            raiseError("E_FILE_MALFORMED", { format: `${flag} map`, path: abs, detail: (e as Error).message });
          }
        };

        // — --dry-run: print the deterministic plan, ZERO model calls.
        if (opts.dryRun) {
          const { train, heldOut } = splitDataset(dataset, trainFraction, seed);
          const offline = !!(opts.baselinePredictions && opts.candidatePredictions && opts.candidate);
          out({
            kind,
            gate,
            promptSource: promptPath,
            datasetSource: datasetPath,
            trainFraction,
            seed,
            trainSize: train.examples.length,
            heldOutSize: heldOut.examples.length,
            dryRun: true,
            offline,
            costBearing: !offline,
            note: offline
              ? "dry-run — offline seams supplied; the real run would make ZERO model calls."
              : "dry-run — no offline seams; the real run would call the live judge (held-out x2) + the LLM optimizer (paid).",
          });
          return;
        }

        // — Assemble the run options (offline when all three seams are present).
        const runOpts: RunPromptOptimizationOptions = {
          trainFraction,
          seed,
          model: opts.model as string | undefined,
          noVision: opts.vision === false,
        };
        if (opts.budget !== undefined) runOpts.optimizerBudget = Number(opts.budget);
        if (opts.baselinePredictions) {
          runOpts.baselinePredictions = readPredMap("baseline-predictions", opts.baselinePredictions as string);
        }
        if (opts.candidatePredictions) {
          runOpts.candidatePredictions = readPredMap("candidate-predictions", opts.candidatePredictions as string);
        }
        if (opts.candidate) {
          const candPath = path.resolve(opts.candidate as string);
          if (!existsSync(candPath)) {
            raiseError("E_NOT_FOUND", { kind: "candidate prompt file", id: candPath });
          }
          runOpts.candidateOverride = readPromptFile(candPath);
        }

        const report = await runPromptOptimization(
          {
            promptSource: promptPath,
            baselinePrompt,
            dataset,
            datasetSource: datasetPath,
            kind: kind as OptimizeKind,
          },
          runOpts,
        );

        // — Write a proposal ONLY on a "propose" recommendation (append-only, no-overwrite).
        let proposalPath: string | null = null;
        if (report.recommendation === "propose") {
          const outDir = (opts.out as string | undefined) ?? path.join(path.dirname(datasetPath), "prompt-proposals");
          proposalPath = writeProposal(outDir, report);
        }

        out({
          kind: report.kind,
          gate: report.gate,
          promptSource: report.promptSource,
          datasetSource: report.datasetSource,
          trainFraction: report.trainFraction,
          seed: report.seed,
          baseline: {
            n: report.baseline.metrics.n,
            cohensKappa: report.baseline.metrics.cohensKappa,
            accuracy: report.baseline.metrics.accuracy,
            tpr: report.baseline.metrics.tpr,
            tnr: report.baseline.metrics.tnr,
          },
          candidate: {
            n: report.candidate.metrics.n,
            cohensKappa: report.candidate.metrics.cohensKappa,
            accuracy: report.candidate.metrics.accuracy,
            tpr: report.candidate.metrics.tpr,
            tnr: report.candidate.metrics.tnr,
          },
          comparison: report.comparison,
          recommendation: report.recommendation,
          proposalPath,
        });
      } catch (e) {
        err(`eval optimize-prompt failed: ${(e as Error).message}`);
      }
    });

  return cmd;
}

/**
 * Resolve the target-platform list for `eval platform`. Explicit --platform wins
 * (comma-split). Else read the project's distribution-pack platforms and map the
 * pack taxonomy (tiktok/reels/shorts/meta/app-store) onto the spec-profile keys
 * (meta → meta-ad, app-store → app-store-screenshot). Falls back to the three
 * video platforms when neither is available.
 */
function resolvePlatformList(projectId: string, explicit: string | undefined): string[] {
  if (explicit) return explicit.split(",").map((s) => s.trim()).filter(Boolean);
  const packPlatforms = readPackPlatforms(projectId);
  if (packPlatforms.length) {
    const MAP: Record<string, string> = { meta: "meta-ad", "app-store": "app-store-screenshot" };
    return [...new Set(packPlatforms.map((p) => MAP[p] ?? p))];
  }
  return ["tiktok", "reels", "shorts"];
}

/** Collect the distinct platform keys across every units/<slug>/distribution-pack.json. */
function readPackPlatforms(projectId: string): string[] {
  const found = new Set<string>();
  try {
    const unitsDir = path.join(projectDir(projectId), "units");
    if (!existsSync(unitsDir)) return [];
    for (const slug of readdirSync(unitsDir)) {
      const fp = path.join(unitsDir, slug, "distribution-pack.json");
      if (!existsSync(fp)) continue;
      try {
        const pack = JSON.parse(readFileSync(fp, "utf8")) as { platforms?: Record<string, unknown> };
        for (const k of Object.keys(pack.platforms ?? {})) found.add(k);
      } catch {
        // skip malformed pack
      }
    }
  } catch {
    // no units
  }
  return [...found];
}
