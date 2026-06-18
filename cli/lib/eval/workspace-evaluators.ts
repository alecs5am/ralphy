// Per-workspace custom-evaluator RUNNER + engine (#469).
//
// Scores a project against its WORKSPACE's custom rubric (#468 config) and emits
// a `workspace-eval.json` scorecard + a markdown report. Two kinds of criteria:
//   • `deterministic` — resolved via `validatorId` against a module-level
//     validator registry. #470 plugs the real validators in via
//     `registerWorkspaceValidator`; an UNREGISTERED id is surfaced as one `info`
//     finding + the criterion verdict `na` (never throws), so #469 ships with
//     NO real validators.
//   • `vision` — every vision criterion's `rubricPrompt` is folded into ONE
//     deep-vision-style prompt (plus the discovered workspace STYLE_LOCK.md +
//     the config `benchmarks`); the mp4 is sent through deep-vision's existing
//     video-send mechanism (`buildVideoContentBlock`), and the model returns
//     STRICT per-criterion JSON. Skipped entirely when there are zero vision
//     criteria or `--no-vision` is passed (so the smoke test never calls the LLM).
//
// REUSE, do not reinvent: `Finding`/`Severity`/`Verdict` (./types), the penalty
// `score()` (./findings), the video-input mechanism (./deep-vision), `callLLM()`
// (../providers/llm), the #468 config loader (../workspace-evaluators), and the
// #468 workspace STYLE_LOCK fallback (../style-lock). The overall verdict uses
// the #427 readiness vocab so it feeds the repair loop (#409).
//
// English-only-on-disk.

import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { projectDir } from "../paths.js";
import { getEntity } from "../registry.js";
import { getActiveWorkspace } from "../registry.js";
import { loadWorkspaceEvaluators } from "../workspace-evaluators.js";
import { discoverStyleLock } from "../style-lock.js";
import { callLLM } from "../providers/llm.js";
import { buildVideoContentBlock, DEEP_VISION_MAX_MP4_BYTES } from "./deep-vision.js";
import { score } from "./findings.js";
import type { Finding, Severity, Verdict } from "./types.js";
import type {
  WorkspaceCriterion,
  WorkspaceEvaluatorsConfig,
} from "../schemas/workspace-evaluators.js";
import type { ScorecardVerdict } from "../schemas/scorecard.js";
import { registerBuiltinWorkspaceValidators } from "./workspace-criteria.js";

// ─── Validator registry (decoupled from #470) ──────────────────────────────────

/**
 * The context a deterministic validator receives. Kept deliberately small for
 * #469 (the #470 validators widen what they read from the project tree as they
 * land — they get the criterion, the project id + dir, and the resolved video).
 */
export interface WorkspaceValidatorContext {
  criterion: WorkspaceCriterion;
  projectId: string;
  projectDir: string;
  videoPath: string | null;
  config: WorkspaceEvaluatorsConfig;
}

/** A deterministic criterion validator — code-only, NO model. Returns findings. */
export type WorkspaceValidator = (
  ctx: WorkspaceValidatorContext,
) => Finding[] | Promise<Finding[]>;

const VALIDATORS = new Map<string, WorkspaceValidator>();

/** Register a deterministic validator by id. #470 calls this for each builtin. */
export function registerWorkspaceValidator(
  id: string,
  fn: WorkspaceValidator,
): void {
  VALIDATORS.set(id, fn);
}

/** Test seam: whether an id is registered. */
export function hasWorkspaceValidator(id: string): boolean {
  return VALIDATORS.has(id);
}

// ─── Result shape (mirrors eval.json v1.0) ──────────────────────────────────────

export interface WorkspaceCriterionResult {
  id: string;
  label: string;
  category: string;
  check: "deterministic" | "vision";
  /** 0-100, or null when the criterion is `na` / unscored. */
  score: number | null;
  /** pass | warn | fail | na. */
  verdict: Verdict | "na";
  /** The configured bar (echoed for the reader). */
  threshold: WorkspaceCriterion["threshold"];
  findings: Finding[];
}

export interface WorkspaceEvalResult {
  schemaVersion: "1.0";
  workspace: string;
  projectId: string;
  evaluatedAt: string;
  /** Resolved video path, or null when none was found / vision was skipped. */
  video: string | null;
  criteria: WorkspaceCriterionResult[];
  overall: {
    verdict: ScorecardVerdict;
    /** 0-100 mean of the scored criteria, or null when nothing scored. */
    score: number | null;
    summary: string;
  };
}

export interface RunWorkspaceEvalOptions {
  /** Skip the vision pass (no LLM call). */
  noVision?: boolean;
  /** Override the deep-vision model. */
  model?: string;
  /** Override the workspace whose rubric is loaded (default: the project's). */
  workspace?: string;
  /** Override the video path (default: <project>/render/final.mp4). */
  video?: string;
}

/** The project-relative artifact names. */
export const WORKSPACE_EVAL_ARTIFACT = "workspace-eval.json" as const;
export const WORKSPACE_EVAL_REPORT = "workspace-eval-report.md" as const;

/**
 * Map the per-criterion verdicts onto the #427 readiness vocab:
 *   • any criterion `fail`                          → `blocked`
 *   • else any `warn`                               → `repair`
 *   • else any REQUIRED criterion `na`/unscored     → `needs-user-decision`
 *   • else                                          → `ship`
 * "Required" = a criterion whose configured severity is `fail` (the workspace
 * opted it up to a hard bar). A criterion left at the default `warn`/`info`
 * severity is advisory, so its `na` does not force a human decision.
 */
export function deriveOverallVerdict(
  results: Array<{ verdict: Verdict | "na"; severity: Severity }>,
): ScorecardVerdict {
  if (results.some((r) => r.verdict === "fail")) return "blocked";
  if (results.some((r) => r.verdict === "warn")) return "repair";
  if (results.some((r) => r.verdict === "na" && r.severity === "fail")) {
    return "needs-user-decision";
  }
  return "ship";
}

/** Resolve the default video for a project — <project>/render/final.mp4. */
function defaultVideoPath(projectId: string): string {
  return path.join(projectDir(projectId), "render", "final.mp4");
}

/**
 * Resolve which workspace's rubric to score against: an explicit override wins,
 * else the registry's `id → workspace` map, else the active workspace.
 */
async function resolveWorkspace(
  projectId: string,
  override?: string,
): Promise<string> {
  if (override) return override;
  const entry = (await getEntity("projects", projectId)) as
    | { workspace?: unknown }
    | null;
  if (entry && typeof entry.workspace === "string" && entry.workspace.length > 0) {
    return entry.workspace;
  }
  return getActiveWorkspace();
}

let _findingId = 0;
function nextFindingId(): string {
  _findingId += 1;
  return `WS${_findingId}`;
}

/**
 * Run the workspace eval. Returns the scorecard result (the caller persists it
 * append-only + renders the markdown — see `cli/commands/workspace.ts`).
 */
export async function runWorkspaceEval(
  projectId: string,
  opts: RunWorkspaceEvalOptions = {},
): Promise<WorkspaceEvalResult> {
  registerBuiltinWorkspaceValidators();

  const dir = projectDir(projectId);
  const workspace = await resolveWorkspace(projectId, opts.workspace);
  const evaluatedAt = new Date().toISOString();

  const config = await loadWorkspaceEvaluators(workspace);
  const criteria = config?.criteria ?? [];

  // Resolve the video once — used by both the deterministic validators (so a
  // #470 freeze/aspect check can probe it) and the vision pass.
  const videoOverride = opts.video ? path.resolve(opts.video) : null;
  const candidate = videoOverride ?? defaultVideoPath(projectId);
  const videoPath = existsSync(candidate) ? candidate : null;

  const visionCriteria = criteria.filter((c) => c.check === "vision");
  const runVision =
    !opts.noVision && visionCriteria.length > 0 && videoPath !== null;

  // — Vision pass: ONE model call, STRICT per-criterion JSON keyed by id.
  let visionScores: Map<string, VisionCriterionScore> = new Map();
  if (runVision) {
    try {
      visionScores = await runVisionPass({
        videoPath: videoPath!,
        visionCriteria,
        workspace,
        benchmarks: config?.benchmarks,
        model: opts.model,
        projectId,
      });
    } catch (e) {
      // A vision failure must not crash the whole eval — surface it on every
      // vision criterion as a warn so the report is honest about what ran.
      const msg = (e as Error).message;
      for (const c of visionCriteria) {
        visionScores.set(c.id, {
          score: null,
          verdict: "warn",
          findings: [
            {
              id: nextFindingId(),
              category: "workspace.vision-error",
              severity: "warn",
              sceneIndex: null,
              timestampSec: null,
              message: `vision pass failed for "${c.id}": ${msg}`,
              fixHint:
                "Re-encode the mp4 under the deep-vision size cap, or re-run with --no-vision to skip the model pass.",
              fixCommand: null,
            },
          ],
        });
      }
    }
  }

  // — Per-criterion results.
  const results: WorkspaceCriterionResult[] = [];
  for (const c of criteria) {
    if (c.check === "deterministic") {
      results.push(await runDeterministicCriterion(c, { projectId, dir, videoPath, config: config! }));
    } else {
      results.push(
        buildVisionCriterionResult(c, visionScores.get(c.id), {
          ran: runVision,
          skippedReason:
            opts.noVision
              ? "vision skipped (--no-vision)"
              : videoPath === null
                ? "no video found to score"
                : null,
        }),
      );
    }
  }

  // — Overall verdict (#427 vocab) + mean score.
  const overallVerdict = deriveOverallVerdict(
    results.map((r) => ({
      verdict: r.verdict,
      severity:
        criteria.find((c) => c.id === r.id)?.severity ?? ("warn" as Severity),
    })),
  );
  const scored = results.map((r) => r.score).filter((s): s is number => s !== null);
  const meanScore =
    scored.length > 0
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : null;

  return {
    schemaVersion: "1.0",
    workspace,
    projectId,
    evaluatedAt,
    video: videoPath,
    criteria: results,
    overall: {
      verdict: overallVerdict,
      score: meanScore,
      summary: buildSummary(workspace, criteria.length, results, overallVerdict, runVision, videoPath),
    },
  };
}

function buildSummary(
  workspace: string,
  criteriaCount: number,
  results: WorkspaceCriterionResult[],
  verdict: ScorecardVerdict,
  ranVision: boolean,
  videoPath: string | null,
): string {
  if (criteriaCount === 0) {
    return `Workspace "${workspace}" has no custom evaluator rubric configured — nothing to score.`;
  }
  const fails = results.filter((r) => r.verdict === "fail").length;
  const warns = results.filter((r) => r.verdict === "warn").length;
  const nas = results.filter((r) => r.verdict === "na").length;
  const visionNote = ranVision
    ? ""
    : videoPath === null
      ? " (vision criteria unscored — no video)"
      : " (vision skipped)";
  return `Workspace "${workspace}" rubric → ${verdict}: ${fails} fail, ${warns} warn, ${nas} na across ${criteriaCount} criteria${visionNote}.`;
}

// ─── Deterministic criterion ────────────────────────────────────────────────────

async function runDeterministicCriterion(
  c: WorkspaceCriterion,
  ctx: { projectId: string; dir: string; videoPath: string | null; config: WorkspaceEvaluatorsConfig },
): Promise<WorkspaceCriterionResult> {
  const validatorId = c.validatorId;
  const validator = validatorId ? VALIDATORS.get(validatorId) : undefined;

  if (!validator) {
    // UNREGISTERED (or missing) validatorId → one info finding + na. NEVER throw.
    // This is the seam #470 fills; #469 ships with no real validators.
    const message = validatorId
      ? `deterministic criterion "${c.id}" references validator "${validatorId}" which is not registered yet (#470).`
      : `deterministic criterion "${c.id}" has no validatorId — cannot run a code check.`;
    return {
      ...baseResult(c),
      score: null,
      verdict: "na",
      findings: [
        {
          id: nextFindingId(),
          category: "workspace.validator-missing",
          severity: "info",
          sceneIndex: null,
          timestampSec: null,
          message,
          fixHint:
            "Register the validator via registerWorkspaceValidator() (#470 wires the builtins), or change the criterion to a vision check.",
          fixCommand: null,
        },
      ],
    };
  }

  const findings = await validator({
    criterion: c,
    projectId: ctx.projectId,
    projectDir: ctx.dir,
    videoPath: ctx.videoPath,
    config: ctx.config,
  });
  return {
    ...baseResult(c),
    score: score(findings).score,
    verdict: verdictFromFindings(findings),
    findings,
  };
}

// ─── Vision pass ────────────────────────────────────────────────────────────────

interface VisionCriterionScore {
  score: number | null;
  verdict: Verdict;
  findings: Finding[];
}

interface RawVisionEntry {
  score?: number;
  verdict?: string;
  findings?: Array<{ message?: string; severity?: string; fixHint?: string }>;
}

async function runVisionPass(args: {
  videoPath: string;
  visionCriteria: WorkspaceCriterion[];
  workspace: string;
  benchmarks?: Record<string, unknown>;
  model?: string;
  projectId: string;
}): Promise<Map<string, VisionCriterionScore>> {
  const { videoPath, visionCriteria, workspace, benchmarks, model, projectId } = args;

  // Reuse the #468 workspace STYLE_LOCK fallback for register grounding.
  const styleLockPath = discoverStyleLock(videoPath);
  const styleLock = styleLockPath ? await readSafe(styleLockPath) : "";

  const rubricBlock = visionCriteria
    .map(
      (c) =>
        `- id "${c.id}" (${c.category}, severity ${c.severity}${c.benchmarkRef ? `, benchmark "${c.benchmarkRef}"` : ""}): ${c.rubricPrompt ?? "(no rubric prompt — judge by the label)"}${c.rubricPrompt ? "" : ` label: ${c.label}`}`,
    )
    .join("\n");

  const benchmarkBlock =
    benchmarks && Object.keys(benchmarks).length > 0
      ? "## BENCHMARKS (referenced by `benchmark` above)\n\n" +
        "```json\n" + JSON.stringify(benchmarks, null, 2).slice(0, 8_000) + "\n```"
      : "## BENCHMARKS\n(none configured)";

  const styleBlock = styleLock
    ? "## WORKSPACE STYLE LOCK (the universe register — score conformance against it)\n\n" +
      styleLock.slice(0, 16_000)
    : "## WORKSPACE STYLE LOCK\n(none discoverable — judge each criterion on its rubric alone)";

  const idList = visionCriteria.map((c) => c.id);

  const system = `You are a senior creative director running a workspace-specific quality gate on a rendered short-form video. The workspace ("${workspace}") encodes its own hard quality bar as a set of vision criteria. You will be given the full rendered mp4 as native video input (every frame at native temporal resolution), the workspace's STYLE LOCK, optional named benchmarks, and a list of criteria — each with an id and a rubric. Score EACH criterion independently.

For every criterion id, return:
  • score: an integer 0-100 (how well the render satisfies the rubric)
  • verdict: "pass" | "warn" | "fail"
  • findings: an array of { message, severity ("info"|"warn"|"fail"), fixHint } — be SPECIFIC, cite timestamps, give a concrete fix. An empty array is fine for a clean pass.

Output STRICT JSON only. No prose, no markdown fences. The TOP-LEVEL object is keyed by criterion id, exactly these ids and no others: ${JSON.stringify(idList)}. Schema:

{
  "<criterionId>": { "score": 0-100, "verdict": "pass"|"warn"|"fail", "findings": [ { "message": string, "severity": "info"|"warn"|"fail", "fixHint": string } ] }
}

Be harsh and specific — generic platitudes are forbidden. Judge against the rubric and the STYLE LOCK, not generic UGC defaults.`;

  const userText = [
    "## CRITERIA (score each independently, return one entry per id)",
    rubricBlock,
    styleBlock,
    benchmarkBlock,
    "## RENDERED VIDEO\n(attached as a file content block — evaluate the full mp4 at native temporal resolution)",
    `Return the strict per-criterion JSON now, keyed by exactly: ${JSON.stringify(idList)}.`,
  ].join("\n\n");

  const videoBlock = await buildVideoContentBlock(videoPath, DEEP_VISION_MAX_MP4_BYTES);

  // NOTE: jsonMode=false intentional — gemini-3.1-pro-preview with a video file
  // content block + jsonMode returns an empty text body (the same documented bug
  // deep-vision.ts works around). Ask for JSON in the prompt, parse post-hoc.
  const { text } = await callLLM({
    messages: [
      { role: "system", content: system },
      { role: "user", content: [videoBlock, { type: "text", text: userText }] },
    ],
    model: model ?? "google/gemini-3.1-pro-preview",
    jsonMode: false,
    temperature: 0.2,
    maxTokens: 8000,
    projectId,
    endpoint: "eval/workspace-vision",
  });

  const parsed = safeParseJson(text);
  const out = new Map<string, VisionCriterionScore>();
  for (const c of visionCriteria) {
    const entry = parsed?.[c.id];
    out.set(c.id, normalizeVisionEntry(c, entry));
  }
  return out;
}

function normalizeVisionEntry(
  c: WorkspaceCriterion,
  raw: RawVisionEntry | undefined,
): VisionCriterionScore {
  if (!raw) {
    return {
      score: null,
      verdict: "warn",
      findings: [
        {
          id: nextFindingId(),
          category: "workspace.vision-missing-entry",
          severity: "warn",
          sceneIndex: null,
          timestampSec: null,
          message: `the vision model returned no entry for criterion "${c.id}".`,
          fixHint: "Re-run the eval; if it recurs, simplify the rubric prompt.",
          fixCommand: null,
        },
      ],
    };
  }
  const verdict: Verdict =
    raw.verdict === "fail" ? "fail" : raw.verdict === "pass" ? "pass" : "warn";
  const findings: Finding[] = (raw.findings ?? []).map((f) => ({
    id: nextFindingId(),
    category: `workspace.${c.category}`,
    severity: coerceSeverity(f.severity),
    sceneIndex: null,
    timestampSec: null,
    message: f.message ?? "(no message)",
    fixHint: f.fixHint ?? "Review the flagged criterion and address the issue.",
    fixCommand: null,
  }));
  const numScore =
    typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : null;
  return { score: numScore, verdict, findings };
}

function buildVisionCriterionResult(
  c: WorkspaceCriterion,
  scoreEntry: VisionCriterionScore | undefined,
  ctx: { ran: boolean; skippedReason: string | null },
): WorkspaceCriterionResult {
  if (!ctx.ran || !scoreEntry) {
    return {
      ...baseResult(c),
      score: null,
      verdict: "na",
      findings: [
        {
          id: nextFindingId(),
          category: "workspace.vision-skipped",
          severity: "info",
          sceneIndex: null,
          timestampSec: null,
          message: `vision criterion "${c.id}" not scored — ${ctx.skippedReason ?? "vision pass did not run"}.`,
          fixHint: "Render the project and re-run without --no-vision to score this criterion.",
          fixCommand: null,
        },
      ],
    };
  }
  return {
    ...baseResult(c),
    score: scoreEntry.score,
    verdict: scoreEntry.verdict,
    findings: scoreEntry.findings,
  };
}

// ─── Shared helpers ─────────────────────────────────────────────────────────────

function baseResult(c: WorkspaceCriterion): Omit<WorkspaceCriterionResult, "score" | "verdict" | "findings"> {
  return { id: c.id, label: c.label, category: c.category, check: c.check, threshold: c.threshold };
}

/** Verdict from a validator's findings — any fail → fail, any warn → warn, else pass. */
function verdictFromFindings(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === "fail")) return "fail";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return "pass";
}

function coerceSeverity(s: string | undefined): Severity {
  return s === "fail" ? "fail" : s === "info" ? "info" : s === "warn" ? "warn" : "warn";
}

async function readSafe(p: string): Promise<string> {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return "";
  }
}

function safeParseJson(text: string): Record<string, RawVisionEntry> | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, RawVisionEntry>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, RawVisionEntry>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Render the workspace-eval scorecard as markdown (mirrors `eval/report.ts`).
 */
export function renderWorkspaceEvalMarkdown(r: WorkspaceEvalResult): string {
  const lines: string[] = [];
  lines.push(`# Workspace eval — ${r.projectId} (${r.workspace})`);
  lines.push("");
  lines.push(`**Verdict: ${r.overall.verdict.toUpperCase()}${r.overall.score !== null ? ` · score ${r.overall.score}/100` : ""}**`);
  lines.push(`> ${r.overall.summary}`);
  lines.push("");
  lines.push(`Video: ${r.video ? `\`${r.video}\`` : "_(none scored)_"}`);
  lines.push(`Evaluated: ${r.evaluatedAt}`);
  lines.push("");

  lines.push(`## Criteria`);
  if (r.criteria.length === 0) {
    lines.push(`_No criteria configured for this workspace._`);
  } else {
    lines.push("");
    lines.push(`| ID | Verdict | Score | Check | Category | Findings |`);
    lines.push(`|----|---------|-------|-------|----------|----------|`);
    for (const c of r.criteria) {
      lines.push(
        `| ${c.id} | ${c.verdict} | ${c.score === null ? "—" : `${c.score}`} | ${c.check} | ${c.category} | ${c.findings.length} |`,
      );
    }
    lines.push("");
    for (const c of r.criteria) {
      if (c.findings.length === 0) continue;
      lines.push(`### ${c.id} — ${c.label}`);
      for (const f of c.findings) {
        lines.push(`- **${f.severity}** \`${f.category}\` — ${escapeCell(f.message)}`);
        if (f.fixHint) lines.push(`  - fix: ${f.fixHint}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
