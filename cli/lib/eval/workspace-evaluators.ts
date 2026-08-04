// Per-workspace custom-evaluator RUNNER + engine (#469).
//
// Scores a project against its WORKSPACE's custom rubric (#468 config) and emits
// a `workspace-eval.json` scorecard + a markdown report. Two kinds of criteria:
//   • `deterministic` — resolved via `validatorId` against a module-level
//     validator registry. #470 plugs the real validators in via
//     `registerWorkspaceValidator`; an UNREGISTERED id is surfaced as one `info`
//     finding + the criterion verdict `na` (never throws), so #469 ships with
//     NO real validators.
//   • `vision` — ONE ISOLATED deep-vision call PER vision criterion (#477), each
//     loading ONLY that criterion's own rubric (focused, non-diluted context).
//     Rubric resolution per criterion: inline `rubricPrompt` → `rubricFile`
//     content (relative to the workspace dir) → registered builtin fragment
//     (#470, by `validatorId`) → the label. The shared STYLE_LOCK.md is NO LONGER
//     folded into these passes (#477) — each rubric file is self-contained. The
//     mp4 is loaded ONCE (`buildVideoContentBlock`) and reused across the
//     per-criterion calls; each returns STRICT per-criterion JSON. A single
//     criterion's call throwing → that one criterion gets a warn finding; the
//     others still run. Skipped entirely when there are zero vision criteria or
//     `--no-vision` is passed (so the smoke test never calls the LLM).
//
// REUSE, do not reinvent: `Finding`/`Severity`/`Verdict` (./types), the penalty
// `score()` (./findings), the video-input mechanism (./deep-vision), `callLLM()`
// (../providers/llm), and the #468 config loader (../workspace-evaluators). The
// overall verdict uses the #427 readiness vocab so it feeds the repair loop (#409).
//
// English-only-on-disk.

import { readFileSync } from "node:fs";
import path from "node:path";
import { existsSync } from "node:fs";
import { projectDir, workspaceDir } from "../paths.js";
import { assertCommandProject, getCommandContext } from "../context-state.js";
import { loadWorkspaceEvaluators } from "../workspace-evaluators.js";
import { openDomainDb } from "../store/db.js";
import { createEvaluation } from "../store/evaluations.js";
import { finishRun, startRun } from "../store/runs.js";
import { endAgentSession, startAgentSession } from "../store/sessions.js";
import { updateProjectStage } from "../store/scopes.js";
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

// ─── Vision-rubric registry (#470) ──────────────────────────────────────────────
//
// Parallel to the deterministic VALIDATORS map: a vision criterion can carry an
// inline `rubricPrompt` (wins), OR reference a canonical rubric fragment by its
// `validatorId` against this registry. #470 registers the 3 builtin fragments
// (scenario-fidelity, character-design-cohesion, location-consistency) so a
// workspace config only needs `{ check: "vision", validatorId: "<id>" }`.

const VISION_RUBRICS = new Map<string, string>();

/** Register a canonical vision-rubric fragment by id. #470 calls this per builtin. */
export function registerWorkspaceVisionRubric(id: string, text: string): void {
  VISION_RUBRICS.set(id, text);
}

/** Test seam: whether a vision rubric id is registered. */
export function hasWorkspaceVisionRubric(id: string): boolean {
  return VISION_RUBRICS.has(id);
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
  /**
   * Run ONLY the criteria whose `id` is in this list (#477). When set AND a
   * prior Workspace Evaluation exists, the fresh subset results are MERGED over
   * the prior scorecard (untouched criteria kept, overall verdict +
   * mean score recomputed over the full merged set). Unknown ids are ignored +
   * noted in the summary. Omitted / empty → a full run (today's behavior).
   */
  criteria?: string[];
}

export type RecordedWorkspaceEval = {
  runId: string;
  evaluationId: string;
  stageId: string;
  stageRowVersion: number;
};

export function recordWorkspaceEvalResult(
  result: WorkspaceEvalResult,
): RecordedWorkspaceEval {
  const db = openDomainDb();
  const project = db
    .query<{ id: string; workspaceId: string }, [string, string, string, string]>(
      `SELECT project.id, project.workspace_id AS workspaceId
       FROM projects project
       JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE (project.id = ? OR project.slug = ?)
         AND (workspace.id = ? OR workspace.slug = ?)`,
    )
    .get(result.projectId, result.projectId, result.workspace, result.workspace);
  if (!project) throw new Error(`Project not found: ${result.projectId}`);

  const context = getCommandContext();
  const ownsSession = context?.kind !== "session" ||
    context.workspaceId !== project.workspaceId ||
    context.projectId !== project.id;
  const sessionId = ownsSession
    ? startAgentSession({
        workspaceId: project.workspaceId,
        projectId: project.id,
        agent: "workspace-evaluator",
      }).id
    : context.sessionId;
  try {
    const run = startRun({
      projectId: project.id,
      agentSessionId: sessionId,
      kind: "workspace-evaluation",
    });
    const { video: _video, ...safeResult } = result;
    const evaluation = createEvaluation({
      target: { type: "run", id: run.id },
      authoredBySessionId: sessionId,
      kind: "workspace",
      verdict: result.overall.verdict,
      report: JSON.parse(JSON.stringify({
        ...safeResult,
        videoEvaluated: result.video !== null,
      })),
    });
    finishRun(run.id, { state: "succeeded" });
    const current = db
      .query<{ rowVersion: number }, [string, string]>(
        "SELECT row_version AS rowVersion FROM project_stages WHERE project_id = ? AND stage = ?",
      )
      .get(project.id, "workspace-eval");
    const stage = updateProjectStage({
      projectId: project.id,
      stage: "workspace-eval",
      state: "complete",
      entityType: "evaluation",
      entityId: evaluation.id,
      expectedRowVersion: current?.rowVersion ?? null,
    });
    return {
      runId: run.id,
      evaluationId: evaluation.id,
      stageId: stage.id,
      stageRowVersion: stage.rowVersion,
    };
  } finally {
    if (ownsSession) endAgentSession(sessionId);
  }
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
function resolveEvalScope(
  projectId: string,
  override?: string,
): { projectId: string; workspaceId: string; workspaceSlug: string } {
  const context = getCommandContext();
  const workspace = override ?? context?.workspaceId;
  const clauses = ["(project.id = ? OR project.slug = ?)"];
  const values: string[] = [projectId, projectId];
  if (workspace !== undefined) {
    clauses.push("(workspace.id = ? OR workspace.slug = ?)");
    values.push(workspace, workspace);
  }
  const row = openDomainDb()
    .query<{ projectId: string; workspaceId: string; workspaceSlug: string }, string[]>(
      `SELECT project.id AS projectId, project.workspace_id AS workspaceId,
              workspace.slug AS workspaceSlug
       FROM projects project
       JOIN workspaces workspace ON workspace.id = project.workspace_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY CASE WHEN project.id = ? THEN 0 ELSE 1 END LIMIT 1`,
    )
    .get(...values, projectId);
  if (!row) throw new Error(`Project not found: ${projectId}`);
  assertCommandProject(row.projectId, row.workspaceId);
  return row;
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
  const scope = resolveEvalScope(projectId, opts.workspace);
  const workspace = scope.workspaceId;
  const workspaceSlug = scope.workspaceSlug;
  const evaluatedAt = new Date().toISOString();

  const config = await loadWorkspaceEvaluators(workspace);
  const allCriteria = config?.criteria ?? [];

  // — #477 subset filter: when `opts.criteria` is set, run ONLY the named ids.
  //   Unknown ids are ignored + noted (never throw).
  const subset = opts.criteria && opts.criteria.length > 0 ? opts.criteria : null;
  const unknownIds = subset
    ? subset.filter((id) => !allCriteria.some((c) => c.id === id))
    : [];
  const criteria = subset
    ? allCriteria.filter((c) => subset.includes(c.id))
    : allCriteria;

  // Resolve the video once — used by both the deterministic validators (so a
  // #470 freeze/aspect check can probe it) and the per-criterion vision passes.
  const videoOverride = opts.video ? path.resolve(opts.video) : null;
  const candidate = videoOverride ?? defaultVideoPath(projectId);
  const videoPath = existsSync(candidate) ? candidate : null;

  const visionCriteria = criteria.filter((c) => c.check === "vision");
  const runVision =
    !opts.noVision && visionCriteria.length > 0 && videoPath !== null;

  // — Vision pass: ONE ISOLATED model call PER vision criterion (#477). The mp4
  //   is loaded ONCE and reused; a single criterion throwing → that one gets a
  //   warn finding, the rest still run.
  const visionScores = new Map<string, VisionCriterionScore>();
  if (runVision) {
    const videoBlock = await buildVideoContentBlock(videoPath!, DEEP_VISION_MAX_MP4_BYTES);
    for (const c of visionCriteria) {
      try {
        visionScores.set(
          c.id,
          await runCriterionVisionPass({
            videoBlock,
            criterion: c,
            workspace: workspaceSlug,
            benchmarks: config?.benchmarks,
            model: opts.model,
            projectId,
          }),
        );
      } catch (e) {
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
              message: `vision pass failed for "${c.id}": ${(e as Error).message}`,
              fixHint:
                "Re-encode the mp4 under the deep-vision size cap, or re-run with --no-vision to skip the model pass.",
              fixCommand: null,
            },
          ],
        });
      }
    }
  }

  // — Per-criterion results (only the criteria in scope this run).
  const freshResults: WorkspaceCriterionResult[] = [];
  for (const c of criteria) {
    if (c.check === "deterministic") {
      freshResults.push(await runDeterministicCriterion(c, { projectId, dir, videoPath, config: config! }));
    } else {
      freshResults.push(
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

  // — #477 merge: a subset run overlays its fresh results over the prior
  //   scorecard (others kept), then recomputes overall over the FULL set. No
  //   prior scorecard → the subset stands alone (others simply not run).
  const prior = subset ? await readPriorResults(scope.projectId) : null;
  const results = prior
    ? mergeResults(prior, freshResults)
    : freshResults;

  // — Overall verdict (#427 vocab) + mean score, over the full (merged) set.
  //   Each result's gate severity is its configured severity from the loaded
  //   config (a prior-kept criterion still resolves against the same config).
  const overallVerdict = deriveOverallVerdict(
    results.map((r) => ({
      verdict: r.verdict,
      severity:
        allCriteria.find((c) => c.id === r.id)?.severity ?? ("warn" as Severity),
    })),
  );
  const scored = results.map((r) => r.score).filter((s): s is number => s !== null);
  const meanScore =
    scored.length > 0
      ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
      : null;

  return {
    schemaVersion: "1.0",
    workspace: workspaceSlug,
    projectId,
    evaluatedAt,
    video: videoPath,
    criteria: results,
    overall: {
      verdict: overallVerdict,
      score: meanScore,
      summary: buildSummary(workspaceSlug, allCriteria.length, results, overallVerdict, runVision, videoPath, {
        subset,
        unknownIds,
        merged: prior !== null,
      }),
    },
  };
}

/**
 * Read the latest SQL Workspace Evaluation report for a merge (#477).
 * Returns null when there is no prior scorecard.
 */
async function readPriorResults(projectId: string): Promise<WorkspaceCriterionResult[] | null> {
  try {
    const row = openDomainDb()
      .query<{ report: string }, [string]>(
        `SELECT report_json AS report FROM evaluations
         WHERE project_id = ? AND kind = 'workspace'
         ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(projectId);
    if (!row) return null;
    const parsed = JSON.parse(row.report) as Partial<WorkspaceEvalResult>;
    return Array.isArray(parsed.criteria) ? parsed.criteria : null;
  } catch {
    return null;
  }
}

/**
 * Merge fresh subset results over prior results by criterion id (#477): keep
 * prior criteria not in the fresh set, overlay the freshly-run ones, preserving
 * the prior ordering and appending any fresh-only ids.
 */
function mergeResults(
  prior: WorkspaceCriterionResult[],
  fresh: WorkspaceCriterionResult[],
): WorkspaceCriterionResult[] {
  const freshById = new Map(fresh.map((r) => [r.id, r]));
  const merged = prior.map((p) => freshById.get(p.id) ?? p);
  for (const f of fresh) {
    if (!prior.some((p) => p.id === f.id)) merged.push(f);
  }
  return merged;
}

function buildSummary(
  workspace: string,
  criteriaCount: number,
  results: WorkspaceCriterionResult[],
  verdict: ScorecardVerdict,
  ranVision: boolean,
  videoPath: string | null,
  subsetInfo?: { subset: string[] | null; unknownIds: string[]; merged: boolean },
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
  // #477 subset / merge note.
  let subsetNote = "";
  if (subsetInfo?.subset) {
    subsetNote = subsetInfo.merged
      ? ` (re-ran only [${subsetInfo.subset.join(", ")}], merged over the prior scorecard)`
      : ` (ran only [${subsetInfo.subset.join(", ")}]; no prior scorecard — the other criteria were not run)`;
    if (subsetInfo.unknownIds.length > 0) {
      subsetNote += ` (ignored unknown criterion id(s): ${subsetInfo.unknownIds.join(", ")})`;
    }
  }
  return `Workspace "${workspace}" rubric → ${verdict}: ${fails} fail, ${warns} warn, ${nas} na across ${results.length} criteria${visionNote}${subsetNote}.`;
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

/** A video content block (the shape `buildVideoContentBlock` returns). */
type VideoBlock = Awaited<ReturnType<typeof buildVideoContentBlock>>;

/**
 * Resolve the prose rubric a vision criterion is scored against (#477). The
 * precedence is, in order:
 *   1. inline `rubricPrompt` on the criterion,
 *   2. the content of `<workspaceDir(workspace)>/<rubricFile>` (a missing or
 *      unreadable file falls through),
 *   3. the registered builtin fragment for `validatorId` (#470),
 *   4. `null` (the caller then judges by the label).
 *
 * Exported as a pure function so the precedence is unit-testable without an LLM.
 * NOTE: the builtin fragments are registered by `registerBuiltinWorkspaceValidators()`
 * — `runWorkspaceEval` calls it; a standalone caller must call it first.
 */
export function resolveCriterionRubric(
  criterion: Pick<WorkspaceCriterion, "rubricPrompt" | "rubricFile" | "validatorId">,
  workspaceSlug: string,
): string | null {
  if (criterion.rubricPrompt) return criterion.rubricPrompt;
  if (criterion.rubricFile) {
    const p = path.resolve(workspaceDir(workspaceSlug), criterion.rubricFile);
    try {
      const text = readFileSync(p, "utf8");
      if (text.trim().length > 0) return text;
    } catch {
      /* missing / unreadable → fall through */
    }
  }
  return VISION_RUBRICS.get(criterion.validatorId ?? "") ?? null;
}

/**
 * Score ONE vision criterion with its OWN rubric only (#477) — focused,
 * non-diluted context. The shared STYLE_LOCK is intentionally NOT folded in;
 * each rubric file is self-contained. The video block is built once by the
 * caller and reused across criteria.
 */
async function runCriterionVisionPass(args: {
  videoBlock: VideoBlock;
  criterion: WorkspaceCriterion;
  workspace: string;
  benchmarks?: Record<string, unknown>;
  model?: string;
  projectId: string;
}): Promise<VisionCriterionScore> {
  const { videoBlock, criterion: c, workspace, benchmarks, model, projectId } = args;

  const rubric = resolveCriterionRubric(c, workspace) ?? `Judge by the label: ${c.label}`;

  // Only the benchmark THIS criterion references — keep the context focused.
  const refBench =
    c.benchmarkRef && benchmarks && benchmarks[c.benchmarkRef] !== undefined
      ? "## BENCHMARK (this criterion measures against it)\n\n" +
        "```json\n" +
        JSON.stringify({ [c.benchmarkRef]: benchmarks[c.benchmarkRef] }, null, 2).slice(0, 8_000) +
        "\n```"
      : "";

  const system = `You are a senior creative director running ONE focused quality check on a rendered short-form video for the workspace "${workspace}". You will be given the full rendered mp4 as native video input (every frame at native temporal resolution) and a SINGLE criterion's rubric. Judge ONLY that criterion against ONLY this rubric — do not invent other concerns.

Return STRICT JSON only. No prose, no markdown fences. Exactly this object:

{ "score": 0-100, "verdict": "pass"|"warn"|"fail", "findings": [ { "message": string, "severity": "info"|"warn"|"fail", "fixHint": string } ] }

Be harsh and specific — cite timestamps, give concrete fixes. An empty findings array is fine for a clean pass. Generic platitudes are forbidden.`;

  const userText = [
    `## CRITERION "${c.id}" (${c.category}, severity ${c.severity})`,
    "## RUBRIC (score against THIS, and only this)",
    rubric,
    refBench,
    "## RENDERED VIDEO\n(attached as a file content block — evaluate the full mp4 at native temporal resolution)",
    "Return the strict JSON object now.",
  ]
    .filter((s) => s.length > 0)
    .join("\n\n");

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
    maxTokens: 4000,
    projectId,
    endpoint: "eval/workspace-vision",
  });

  // The per-criterion response is a bare entry object (not keyed by id).
  return normalizeVisionEntry(c, safeParseEntry(text));
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

/** Parse a single per-criterion entry object from the model text (#477). A
 *  malformed / empty body → undefined, which `normalizeVisionEntry` turns into a
 *  warn finding (never a crash). */
function safeParseEntry(text: string): RawVisionEntry | undefined {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  const tryParse = (s: string): RawVisionEntry | undefined => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" ? (v as RawVisionEntry) : undefined;
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(cleaned.slice(start, end + 1));
  return undefined;
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
