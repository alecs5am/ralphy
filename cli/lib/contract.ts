// Agent production contract — the machine-readable phase ledger (#406).
//
// The contract (prose source of truth: `docs/playbooks/agent-production-contract.md`)
// is the single flow every "make content" request follows. This file is the
// READABLE half of it: a pure function that inspects a project dir on disk and
// reports which contract phases are satisfied, which required artifacts are
// missing, and what the agent should do next.
//
// Design notes:
//  - PURE + SYNC-on-fs: `evaluateContract(projectId)` does only `existsSync`
//    probes through the `paths.ts` helpers, so tests can call it directly
//    without spawning the CLI (the `project status <id> --contract` command is
//    a thin wrapper that prints its JSON).
//  - The phase LIST and ORDER mirror the contract doc exactly. When the doc
//    gains/loses a phase, update `CONTRACT_PHASES` here in lockstep — the doc
//    cross-references this constant by name.
//  - "satisfied" is a presence check, NOT a quality check. The quality gates
//    (`scoreScenario` / `scoreImage` / `scoreVideo`, AGENTS.md invariant #4)
//    are enforced by the agent at the relevant phase; this ledger only answers
//    "has the artifact this phase produces landed on disk yet?".
//  - Some phases are AGENT-DRIVEN with no on-disk artifact (intake question
//    turns, content-mode emission, memory recall, the reference gate decision).
//    They are listed for completeness with `artifact: null` and are reported as
//    `satisfied: true` (nothing to check on disk) so they never block
//    `nextRecommendedAction` — the gate for those lives in the agent loop, not
//    the filesystem.

import { getCommandContext } from "./context-state.js";
import { isModeSupported } from "./content-modes.js";
import { openDomainDb } from "./store/db.js";
import { loadWorkspaceEvaluatorsSync } from "./workspace-evaluators.js";

/** A single phase of the production contract. */
export interface ContractPhase {
  /** Stable phase id (kebab-case), referenced by the contract doc. */
  id: string;
  /** One-line human label. */
  label: string;
  /**
   * The project-relative artifact this phase produces, or `null` for an
   * agent-driven phase that has no on-disk artifact (intake, mode emission,
   * memory recall, the reference-gate decision).
   */
  artifact: string | null;
  /**
   * Whether the artifact is required for a "complete" contract. Agent-driven
   * phases (`artifact: null`) are never `required` against the filesystem.
   * A phase can also be artifact-bearing but OPTIONAL — present only when the
   * job calls for it (e.g. STYLE_LOCK.md fires only when a style/benchmark
   * lock is in scope).
   */
  required: boolean;
  /** Why this phase exists / what skipping it costs. Short. */
  rationale: string;
}

/**
 * The contract phases, in execution order. Mirrors
 * `docs/playbooks/agent-production-contract.md`. Append/edit in lockstep with
 * the doc.
 *
 * Artifact paths are project-relative (resolve against `projectDir(id)`).
 */
export const CONTRACT_PHASES: ContractPhase[] = [
  {
    id: "intake",
    label: "Intake — clarifying questions + brief capture",
    artifact: "BRIEF.md",
    required: true,
    rationale:
      "Captures audience language, aspect, brand/entity, duration, hard constraints before any spend. Skipping it is the #1 cost-overrun cause across postmortems.",
  },
  {
    id: "content-mode",
    label: "Content-mode selection (#412)",
    artifact: null,
    required: false,
    rationale:
      "Emit a production-intent content_mode (classifyContentMode) BEFORE touching templates/skills. Agent-driven; no on-disk artifact.",
  },
  {
    id: "format-template-match",
    label: "Format / template match",
    artifact: null,
    required: false,
    rationale:
      "Match the brief's media format + template via `ralphy template suggest --format <f>`. Agent-driven; the choice is recorded in PRODUCTION_PLAN.md.",
  },
  {
    id: "memory-recall",
    label: "Memory recall (#112/#114)",
    artifact: null,
    required: false,
    rationale:
      "`ralphy memory recall` — workspace facts pre-answer intake, global rules shape the plan. Agent-driven; no on-disk artifact.",
  },
  {
    id: "reference-gate",
    label: "Reference gate (AGENTS.md #3)",
    artifact: null,
    required: false,
    rationale:
      "Named real entities (specific person / brand product / IP) require a ref or a logged --no-ref-consent. Floor: `ralphy ref check <id>`. Decision is agent-driven; refs land in artifacts/refs/.",
  },
  {
    id: "research",
    label: "Research bootstrap (#416)",
    artifact: "artifacts/refs/research-facts.json",
    required: false,
    rationale:
      "Deterministic depth decision (chooseResearchDepth) routes to the EXISTING surface (quick: site-grounding / a few `ralphy ref pull`; deep: `ralphy research run` + `scrape-profile`); the distillate lands as ProductBrandFacts in artifacts/refs/research-facts.json (or research/report.md for the deep engine). Optional — fires per the bootstrap's depth (`none` writes nothing). Runs BEFORE the style lock so the register/plan ground in findings.",
  },
  {
    id: "style-lock",
    label: "Benchmark / style grounding (#408)",
    artifact: "STYLE_LOCK.md",
    required: false,
    rationale:
      "When a style/benchmark lock is in scope, freeze the register (palette, framing, realism axis) BEFORE prompts. Optional — fires per content-mode style-lock requirement.",
  },
  {
    id: "production-plan",
    label: "Production plan (#407)",
    artifact: "PRODUCTION_PLAN.md",
    required: true,
    rationale:
      "The user-approved plan (vibe, beats, stack, cost/wall-clock estimate, first checkpoint). Wait for user 'go' before any paid generation — AGENTS.md.",
  },
  {
    id: "council-preflight",
    label: "Preflight council (#415)",
    artifact: "council-preflight.json",
    required: false,
    rationale:
      "`ralphy project council <id> --phase preflight` — seven bounded roles review production-plan.json BEFORE any paid generation (NO media, NO browsing). A `block` verdict must be resolved before spending; fold prioritizedActions into the plan. Optional + advisory — the user 'go' (phase production-plan) stays the spend gate.",
  },
  {
    id: "scenario",
    label: "Scenario quality (scoreScenario)",
    artifact: "scenario.json",
    required: true,
    rationale:
      "Locked scenario; gated by scoreScenario (refuse-not-warn twice → stop). image-pack projects have no scenario — treated satisfied for that kind.",
  },
  {
    id: "prompts",
    label: "Prompt drafting",
    artifact: "prompts.json",
    required: true,
    rationale:
      "Per-slot prompts. Generation gates (scoreImage/scoreVideo) and the wait-for-go rule apply before any paid call.",
  },
  {
    id: "assets",
    label: "Asset generation",
    artifact: "asset-manifest.json",
    required: true,
    rationale:
      "Generated images/video/VO/music tracked in the manifest. Regen auto-versions (.v2); failed gens stay on disk (AGENTS.md #14).",
  },
  {
    id: "render",
    label: "Render preflight + render",
    artifact: "render/final.mp4",
    required: true,
    rationale:
      "`ralphy editor preflight <id>` then `ralphy render <id>`. The only render path is HyperFrames index.html → render/final.mp4.",
  },
  {
    id: "eval",
    label: "Eval (#411)",
    artifact: "eval.json",
    required: true,
    rationale:
      "Post-render quality gate (/evaluator) → eval.json + eval-report.md. Don't ship over a failed eval.",
  },
  {
    id: "repair",
    label: "Repair loop (#409)",
    artifact: "repair-plan.json",
    required: false,
    rationale:
      "If eval flags issues the user wants fixed, the fixer agent runs `ralphy project repair-plan <id>` (deterministic, zero model calls) → repair-plan.json, presents it, and re-rolls only on approval. Optional — present only when a repair pass ran; fixes re-touch existing artifacts (auto-versioned).",
  },
  {
    id: "council-polish",
    label: "Polish council (#415)",
    artifact: "council-polish.json",
    required: false,
    rationale:
      "`ralphy project council <id> --phase polish` — the seven roles review eval.json (+ eval-deep-vision.json) AFTER eval and BEFORE Unit formation (NO media, NO browsing). Its prioritizedActions speak the #409 repair vocabulary so they flow into `ralphy project repair-plan` structurally. Optional — use when a single-agent eval feels thin on market-fit / pacing / CTA judgment.",
  },
  {
    id: "unit",
    label: "Unit formation (#069)",
    artifact: "units",
    required: false,
    rationale:
      "`ralphy unit create` COPIES curated artifacts into units/<slug>/ + unit.json. The deliverable; append-only.",
  },
  {
    id: "postmortem",
    label: "Postmortem + memory capture (#117)",
    artifact: "postmortem",
    required: false,
    rationale:
      "/postmortem writes postmortem/ ; `ralphy memory distill` captures durable lessons. Optional but high-value on iteration-heavy sessions.",
  },
];

/**
 * The set of valid contract phase ids, derived from `CONTRACT_PHASES`. The
 * workspace stage-gate config (#472, `cli/lib/schemas/workspace-evaluators.ts`)
 * validates each `StageGate.phase` against this set, so a gate can only target a
 * real phase. Keep it derived (never a hand-maintained literal) so it stays in
 * lockstep with the phase list above.
 */
export const CONTRACT_PHASE_IDS: readonly string[] = CONTRACT_PHASES.map((p) => p.id);

/** Per-phase evaluation result. */
export interface ContractPhaseResult {
  id: string;
  label: string;
  /** Project-relative artifact path, or null for agent-driven phases. */
  artifact: string | null;
  required: boolean;
  /** Whether the artifact exists on disk (always true for agent-driven phases). */
  present: boolean;
  /**
   * Whether the phase counts as satisfied: an agent-driven phase is always
   * satisfied (its gate is in the agent loop), an artifact-bearing phase is
   * satisfied when its artifact is present.
   */
  satisfied: boolean;
  rationale: string;
}

/**
 * A blocking condition the agent must clear before advancing past where it
 * currently sits in the lifecycle (#414). Stop conditions are derived from
 * project state, never from chat memory. Each names the phase it gates and a
 * one-line `detail` the agent can act on or surface verbatim.
 */
export interface StopCondition {
  /** Stable stop-condition id (kebab-case). Append, never repurpose. */
  id:
    | "reference-required"
    | "quality-gate-failed"
    | "mode-unsupported"
    | "estimate-exceeds-target"
    | "user-approval-needed"
    | "native-gate-required"
    | "stage-gate-unmet";
  /** The phase id this stop gates (matches a `CONTRACT_PHASES[].id`). */
  phase: string;
  /** Severity: `block` halts progress; `warn` is advisory the agent should surface. */
  severity: "block" | "warn";
  /** One-line, agent-actionable explanation. English-on-disk. */
  detail: string;
}

/** The full contract evaluation for one project. */
export interface ContractEvaluation {
  project: string;
  /** Project kind from the registry-less probe ("video" | "image-pack" | "unknown"). */
  kind: string;
  phases: ContractPhaseResult[];
  /**
   * Required artifacts that are still missing (project-relative paths), in
   * phase order. Empty when every required phase is satisfied.
   */
  missingRequired: string[];
  /**
   * The first unsatisfied phase's label + a one-line next step, or a "complete"
   * marker when nothing required is missing. Machine-readable guidance for the
   * agent, NOT a human wizard.
   */
  nextRecommendedAction: string;
  /** True when no required artifact is missing. */
  complete: boolean;

  // ── Resume model (#414) ──────────────────────────────────────────────────
  // So an agent can RESUME a project mid-flight without guessing the phase.

  /**
   * The id of the FURTHEST satisfied phase (the deepest phase in order whose
   * artifact is present / which is agent-driven), or `null` when nothing has
   * landed yet. Agent-driven phases (`artifact: null`) count as satisfied, so
   * `currentPhase` reflects "how far the on-disk trail reaches".
   */
  currentPhase: string | null;
  /**
   * The id of the first UNSATISFIED phase to do next (the first phase whose
   * artifact is required-or-optional and absent), or `null` when every phase is
   * satisfied. This is the resume cursor — pair it with `nextStep`.
   */
  nextPhase: string | null;
  /** A one-line, agent-actionable instruction for `nextPhase` (or a complete marker). */
  nextStep: string;
  /**
   * Blocking / advisory conditions derived from project state (#414): a missing
   * required reference, a failed quality gate after the retry budget, an
   * unsupported content mode, a cost/time estimate over target, a pending
   * user-approval-before-spend, and the native-video gate requirement for a
   * "polished" Unit. Empty when nothing blocks.
   */
  stopConditions: StopCondition[];
  /**
   * True only when the render has passed the #411 native-video final gate
   * (`eval.json` → `gate.shipReady === true` under a native-video / deep-style
   * mode) OR an explicit user-approved bypass was logged. A keyframe / structure
   * eval can NEVER make this true. A Unit may not be considered polished /
   * publishable while this is false. `null` when no eval has landed yet.
   */
  polished: boolean | null;
}

/** Project-relative recommended next step per phase id. */
const NEXT_STEP: Record<string, string> = {
  intake:
    "Run intake (3-5 clarifying questions) and capture the brief to BRIEF.md (`ralphy project log-prompt --stage brief`).",
  research:
    "Run the research bootstrap (chooseResearchDepth) and route the depth to the existing surface; distill into artifacts/refs/research-facts.json. Skip-clean when the depth is `none`.",
  "production-plan":
    "Draft the production plan (PRODUCTION_PLAN.md) and wait for the user's 'go' before any paid generation.",
  "council-preflight":
    "Optional: convene the preflight council (`ralphy project council <id> --phase preflight`) on the plan BEFORE any paid generation; resolve a `block` verdict first.",
  scenario:
    "Write the scenario (scenario.json) and pass scoreScenario before handing off to the art-director.",
  prompts: "Draft per-slot prompts (prompts.json); apply scoreImage/scoreVideo gates.",
  assets: "Generate assets via `ralphy generate ...`; the manifest (asset-manifest.json) tracks each slot.",
  render: "Run `ralphy editor preflight <id>` then `ralphy render <id>` → render/final.mp4.",
  eval: "Run the /evaluator post-render gate → eval.json + eval-report.md (native-video mode is the ship gate).",
  "council-polish":
    "Optional: convene the polish council (`ralphy project council <id> --phase polish`) on eval.json before forming the Unit; its actions feed `ralphy project repair-plan`.",
  unit: "Form the deliverable Unit (`ralphy unit create <id> --slug <s> --format <f> --from \"<glob>\"`) once the native-video gate is ship-ready.",
  postmortem: "Run /postmortem and `ralphy memory distill` to capture durable lessons.",
};

type ContractProjectRow = {
  id: string;
  workspaceId: string;
  workspaceSlug: string;
  metadataJson: string | null;
};

type ContractStageRow = {
  stage: string;
  state: string;
  entityType: string | null;
  entityId: string | null;
};

const SATISFIED_STAGE_STATES = new Set([
  "complete",
  "completed",
  "succeeded",
  "skipped",
  "awaiting-approval",
]);

function stageBindingBelongsToProject(
  projectId: string,
  stage: ContractStageRow | undefined,
): boolean {
  if (!stage?.entityType || !stage.entityId) return false;
  const queries: Record<string, string> = {
    document_revision: `SELECT document.project_id AS projectId
      FROM document_revisions revision
      JOIN documents document ON document.id = revision.document_id
      WHERE revision.id = ?`,
    evaluation: "SELECT project_id AS projectId FROM evaluations WHERE id = ?",
    artifact_revision: `SELECT artifact.project_id AS projectId
      FROM artifact_revisions revision
      JOIN artifacts artifact ON artifact.id = revision.artifact_id
      WHERE revision.id = ?`,
    composition_revision: `SELECT composition.project_id AS projectId
      FROM composition_revisions revision
      JOIN compositions composition ON composition.id = revision.composition_id
      WHERE revision.id = ?`,
    build: `SELECT composition.project_id AS projectId
      FROM builds build
      JOIN composition_revisions revision ON revision.id = build.composition_revision_id
      JOIN compositions composition ON composition.id = revision.composition_id
      WHERE build.id = ?`,
    run: "SELECT project_id AS projectId FROM runs WHERE id = ?",
    unit_revision: `SELECT unit.project_id AS projectId
      FROM unit_revisions revision
      JOIN units unit ON unit.id = revision.unit_id
      WHERE revision.id = ?`,
    unit_presentation: `SELECT unit.project_id AS projectId
      FROM unit_presentations presentation
      JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
      JOIN units unit ON unit.id = revision.unit_id
      WHERE presentation.id = ?`,
    publication: `SELECT unit.project_id AS projectId
      FROM publications publication
      JOIN unit_presentations presentation ON presentation.id = publication.presentation_id
      JOIN unit_revisions revision ON revision.id = presentation.unit_revision_id
      JOIN units unit ON unit.id = revision.unit_id
      WHERE publication.id = ?`,
  };
  const query = queries[stage.entityType];
  if (!query) return false;
  return openDomainDb().query<{ projectId: string | null }, [string]>(query)
    .get(stage.entityId)?.projectId === projectId;
}

function resolveContractProject(projectId: string): ContractProjectRow {
  const db = openDomainDb();
  const context = getCommandContext();
  const row = context
    ? db.query<ContractProjectRow, [string, string, string, string]>(
        `SELECT project.id, project.workspace_id AS workspaceId,
                workspace.slug AS workspaceSlug,
                project.metadata_json AS metadataJson
         FROM projects project
         JOIN workspaces workspace ON workspace.id = project.workspace_id
         WHERE project.workspace_id = ? AND (project.id = ? OR project.slug = ?)
         ORDER BY CASE WHEN project.id = ? THEN 0 ELSE 1 END LIMIT 1`,
      ).get(context.workspaceId, projectId, projectId, projectId)
    : db.query<ContractProjectRow, [string, string, string]>(
        `SELECT project.id, project.workspace_id AS workspaceId,
                workspace.slug AS workspaceSlug,
                project.metadata_json AS metadataJson
         FROM projects project
         JOIN workspaces workspace ON workspace.id = project.workspace_id
         WHERE project.id = ? OR project.slug = ?
         ORDER BY CASE WHEN project.id = ? THEN 0 ELSE 1 END LIMIT 1`,
      ).get(projectId, projectId, projectId);
  if (!row) throw new Error(`Project not found: ${projectId}`);
  return row;
}

function projectKind(project: ContractProjectRow): string {
  try {
    const metadata = project.metadataJson === null
      ? null
      : JSON.parse(project.metadataJson) as { kind?: unknown };
    return typeof metadata?.kind === "string" ? metadata.kind : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Evaluate the production contract for a project. PURE w.r.t. arguments — reads
 * only the filesystem under `projectDir(projectId)`. Safe on a non-existent
 * project dir (every phase reports `present: false`).
 *
 * @param projectId  the project id (resolved through `projectDir`).
 */
export function evaluateContract(projectId: string): ContractEvaluation {
  const project = resolveContractProject(projectId);
  const kind = projectKind(project);
  const stageRows = openDomainDb()
    .query<ContractStageRow, [string]>(
      "SELECT stage, state, entity_type AS entityType, entity_id AS entityId FROM project_stages WHERE project_id = ?",
    )
    .all(project.id);
  const stages = new Map(stageRows.map((stage) => [stage.stage, stage]));

  const phases: ContractPhaseResult[] = CONTRACT_PHASES.map((phase) => {
    // image-pack projects never produce a scenario — don't require it of them.
    const requiredForKind =
      phase.id === "scenario" && kind === "image-pack" ? false : phase.required;

    const stage = stages.get(phase.id);
    const bound = phase.artifact === null || stageBindingBelongsToProject(project.id, stage);
    const present = phase.artifact === null || (stage !== undefined && bound);
    return {
      id: phase.id,
      label: phase.label,
      artifact: phase.artifact,
      required: requiredForKind,
      present,
      satisfied: phase.artifact === null ||
        (stage !== undefined && bound && SATISFIED_STAGE_STATES.has(stage.state)),
      rationale: phase.rationale,
    };
  });

  const missingRequired = phases
    .filter((p) => p.required && !p.satisfied && p.artifact)
    .map((p) => p.artifact as string);

  const firstUnsatisfiedRequired = phases.find((p) => p.required && !p.satisfied);

  let nextRecommendedAction: string;
  if (firstUnsatisfiedRequired) {
    nextRecommendedAction =
      NEXT_STEP[firstUnsatisfiedRequired.id] ??
      `Satisfy phase "${firstUnsatisfiedRequired.label}" (${firstUnsatisfiedRequired.artifact}).`;
  } else {
    // All required phases satisfied — point at the first optional gap (eval is
    // required, so this is unit/postmortem territory) or declare complete.
    const firstOptionalGap = phases.find(
      (p) => !p.required && p.artifact && !p.satisfied,
    );
    nextRecommendedAction = firstOptionalGap
      ? `All required phases satisfied. Optional next: ${firstOptionalGap.label} (${firstOptionalGap.artifact}).`
      : "Contract complete — all required artifacts present.";
  }

  // ── Resume model (#414): currentPhase / nextPhase / nextStep ────────────────
  // currentPhase = the deepest ARTIFACT-BEARING satisfied phase (the real
  //                on-disk progress signal). Agent-driven phases (artifact:null)
  //                are always satisfied and carry no progress, so they never
  //                stand in as the cursor — otherwise BRIEF.md alone would jump
  //                currentPhase past the intake to reference-gate.
  // nextPhase    = the first ARTIFACT-BEARING phase that is unsatisfied (the
  //                resume cursor); agent-driven phases never become the cursor
  //                because they are always satisfied.
  let currentPhase: string | null = null;
  for (const p of phases) {
    if (p.artifact !== null && p.satisfied) currentPhase = p.id;
  }
  const nextPhaseResult = phases.find((p) => p.artifact !== null && !p.satisfied);
  const nextPhase = nextPhaseResult ? nextPhaseResult.id : null;
  const nextStep = nextPhaseResult
    ? NEXT_STEP[nextPhaseResult.id] ??
      `Satisfy phase "${nextPhaseResult.label}" (${nextPhaseResult.artifact}).`
    : "Lifecycle complete — every phase artifact is present.";

  // ── Polished determination (#411 native-gate gated) ─────────────────────────
  const renderPresent = phases.find((p) => p.id === "render")?.present === true;
  const polished = derivePolished(project.id, stages, renderPresent);

  // ── Stop conditions derived from project state (#414) ───────────────────────
  const stopConditions = deriveStopConditions(project, stages, phases, polished);

  return {
    project: projectId,
    kind,
    phases,
    missingRequired,
    nextRecommendedAction,
    complete: missingRequired.length === 0,
    currentPhase,
    nextPhase,
    nextStep,
    stopConditions,
    polished,
  };
}

/**
 * `lifecycleStatus` — the canonical name for the full Unit-lifecycle ledger
 * (#414). It is `evaluateContract` (the contract IS the lifecycle backbone, not
 * a fork), re-exported under the lifecycle vocabulary so callers and docs can
 * speak one name. Surfaced as `ralphy project status <id> --lifecycle`.
 */
export function lifecycleStatus(projectId: string): ContractEvaluation {
  return evaluateContract(projectId);
}

// ─── Resume-model helpers (#414) ───────────────────────────────────────────────

function boundStageJson(
  projectId: string,
  stage: ContractStageRow | undefined,
): Record<string, unknown> | null {
  if (!stage?.entityType || !stage.entityId) return null;
  let body: string | null = null;
  if (stage.entityType === "document_revision") {
    body = openDomainDb()
      .query<{ body: string }, [string, string]>(
        `SELECT revision.body FROM document_revisions revision
         JOIN documents document ON document.id = revision.document_id
         WHERE revision.id = ? AND document.project_id = ?`,
      )
      .get(stage.entityId, projectId)?.body ?? null;
  } else if (stage.entityType === "evaluation") {
    body = openDomainDb()
      .query<{ body: string }, [string, string]>(
        "SELECT report_json AS body FROM evaluations WHERE id = ? AND project_id = ?",
      )
      .get(stage.entityId, projectId)?.body ?? null;
  }
  if (body === null) return null;
  try {
    const value = JSON.parse(body) as unknown;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

/**
 * The native-video-gated "polished" determination (#411 + #414 Acceptance #3).
 * A Unit is polished ONLY when the render passed the native-video final gate OR
 * an explicit user-approved bypass was logged:
 *   • `eval.json` present with `gate.shipReady === true` (a structure/keyframe
 *     report forces `shipReady` false, so this can only be true under a
 *     native-video / deep-style pass) → polished (`true`).
 *   • a `gate-bypass:<reason>` entry in the plan's `bypasses[]` → an explicit
 *     user-approved bypass → polished (`true`).
 *   • a render exists but neither of the above holds → NOT polished (`false`)
 *     — the agent needs the false to know the native gate still blocks.
 *   • no render and no bypass yet → `null` (the question is N/A; nothing to ship).
 */
function derivePolished(
  projectId: string,
  stages: Map<string, ContractStageRow>,
  renderPresent: boolean,
): boolean | null {
  const planBypasses = readPlanBypasses(projectId, stages);
  const userBypass = planBypasses.some((b) => /^gate-bypass[:\s]/i.test(b));
  if (userBypass) return true;

  const evalRaw = boundStageJson(projectId, stages.get("eval")) as
    | { gate?: { shipReady?: unknown } }
    | null;
  if (evalRaw) {
    return evalRaw.gate?.shipReady === true;
  }
  // No eval. If a render exists, the native gate has not passed → not polished.
  // Before any render, the question is N/A.
  return renderPresent ? false : null;
}

/** Read the production plan's `bypasses[]` (the logged phase-skip ledger), or []. */
function readPlanBypasses(
  projectId: string,
  stages: Map<string, ContractStageRow>,
): string[] {
  const planRaw = boundStageJson(projectId, stages.get("production-plan")) as
    | { bypasses?: unknown }
    | null;
  const b = planRaw?.bypasses;
  return Array.isArray(b) ? b.filter((x): x is string => typeof x === "string") : [];
}

/**
 * The per-video wall-clock target (minutes) the estimate is checked against
 * (`docs/perf-targets.md` — ≤8 min cold-start / ≤20 min custom single video).
 * We use the custom-from-brief ceiling as the conservative single-video target
 * and fire the stop only when the plan's own estimate runs >50% over it.
 */
const SINGLE_VIDEO_TARGET_MIN = 20;
const OVER_TARGET_FACTOR = 1.5;

/**
 * Derive the lifecycle stop conditions from project state (#414). Each is a
 * pure read of an artifact already on disk — no model call, no chat memory.
 */
function deriveStopConditions(
  project: ContractProjectRow,
  stages: Map<string, ContractStageRow>,
  phases: ContractPhaseResult[],
  polished: boolean | null,
): StopCondition[] {
  const stops: StopCondition[] = [];
  const planRaw = boundStageJson(project.id, stages.get("production-plan")) as
    | {
        contentMode?: { mode?: unknown };
        estimate?: { wallClockMin?: unknown };
        requiredRefs?: unknown;
        bypasses?: unknown;
      }
    | null;
  const bypasses = readPlanBypasses(project.id, stages);
  const evalRaw = boundStageJson(project.id, stages.get("eval")) as
    | { gate?: { shipReady?: unknown; nativeVideo?: unknown }; scoring?: { verdict?: unknown } }
    | null;

  const present = (id: string) => phases.find((p) => p.id === id)?.present === true;

  // ── mode-unsupported (#412/#413) ──
  const mode = typeof planRaw?.contentMode?.mode === "string" ? planRaw.contentMode.mode : null;
  if (mode && !isModeSupported(mode)) {
    stops.push({
      id: "mode-unsupported",
      phase: "content-mode",
      severity: "block",
      detail: `content mode "${mode}" is not a first-class route (isModeSupported=false). Route to the closest supported mode or tell the user it is not yet supported — do not promise it as a deliverable.`,
    });
  }

  // ── reference-required (AGENTS.md #3) ──
  // The plan declares requiredRefs; if it does and no ref landed in
  // artifacts/refs/ and no --no-ref-consent bypass was logged, the gate blocks.
  const requiredRefs = Array.isArray(planRaw?.requiredRefs) ? planRaw!.requiredRefs : [];
  const hasRefs = stages.get("reference-gate") !== undefined &&
    SATISFIED_STAGE_STATES.has(stages.get("reference-gate")!.state);
  const refConsent = bypasses.some((b) => /^no-ref-consent[:\s]/i.test(b));
  if (requiredRefs.length > 0 && !hasRefs && !refConsent) {
    stops.push({
      id: "reference-required",
      phase: "reference-gate",
      severity: "block",
      detail: `plan declares required references (${requiredRefs
        .map((r) => String(r))
        .join(", ")}) but artifacts/refs/ is empty and no --no-ref-consent is logged. Attach a ref or log consent before any generation.`,
    });
  }

  // ── estimate-exceeds-target (#407 estimate vs docs/perf-targets.md) ──
  const wallClock =
    typeof planRaw?.estimate?.wallClockMin === "number" ? planRaw.estimate.wallClockMin : null;
  if (wallClock !== null && wallClock > SINGLE_VIDEO_TARGET_MIN * OVER_TARGET_FACTOR) {
    stops.push({
      id: "estimate-exceeds-target",
      phase: "production-plan",
      severity: "warn",
      detail: `plan wall-clock estimate (${wallClock} min) exceeds 50% over the ${SINGLE_VIDEO_TARGET_MIN}-min single-video target (docs/perf-targets.md). Report to the user before starting.`,
    });
  }

  // ── user-approval-needed (wait-for-go before paid generation) ──
  // The plan is written but nothing paid has run yet (no asset manifest) and the
  // user has not waived the gate — surface that the spend gate is still open.
  const planPresent = present("production-plan");
  const assetsStarted = present("assets") || present("render");
  const goWaived = bypasses.some((b) => /^skip:production-plan[:\s]/i.test(b));
  if (
    planPresent &&
    stages.get("production-plan")?.state === "awaiting-approval" &&
    !assetsStarted &&
    !goWaived
  ) {
    stops.push({
      id: "user-approval-needed",
      phase: "production-plan",
      severity: "block",
      detail:
        "production plan is written but no paid asset has been generated. Wait for the user's explicit 'go' before any paid generation (AGENTS.md). Logged skip:production-plan waives this.",
    });
  }

  // ── quality-gate-failed (eval landed with a non-pass verdict) ──
  if (evalRaw && evalRaw.scoring?.verdict === "fail") {
    stops.push({
      id: "quality-gate-failed",
      phase: "eval",
      severity: "block",
      detail:
        "eval.json verdict is `fail`. Run `ralphy project repair-plan <id>`, get approval, and re-roll the failing slots (auto-versioned) before re-evaluating. Do not form/publish a Unit over a failed gate.",
    });
  }

  // ── native-gate-required (#411 — polished requires the native final gate) ──
  // Once a render exists, a Unit may not be considered polished/publishable
  // until the native-video gate is ship-ready (or a user bypass is logged). A
  // cheap (keyframe/structure) eval is a diagnostic, not the ship gate.
  if (present("render") && polished === false) {
    const evalLanded = !!evalRaw;
    const nativeRan = evalRaw?.gate?.nativeVideo === true;
    const detail = !evalLanded
      ? "render exists but no eval has run. The native-video final gate (#411) must pass before the Unit is polished — run `ralphy evaluate <id>` (defaults to native-video) or log an explicit user-approved bypass."
      : nativeRan
        ? "the native-video gate ran but did not return shipReady — block forming/publishing until the priority fixes land (or log an explicit user-approved bypass)."
        : "eval ran in a cheap (keyframe/structure) mode — that can never approve a polished Unit (#411). Re-run in native-video / deep-style before forming/publishing, or log an explicit user-approved bypass.";
    stops.push({ id: "native-gate-required", phase: "unit", severity: "block", detail });
  }

  // ── stage-gate-unmet (#472 — workspace-rubric stage gates) ──
  stops.push(...deriveStageGateStops(project, stages));

  return stops;
}

/**
 * Derive `stage-gate-unmet` stops from the workspace rubric's `stageGates` (#472).
 *
 * ZERO behavior change for every workspace WITHOUT a rubric or `stageGates`: a
 * null config or an empty/absent `stageGates` returns `[]` immediately (the early
 * returns below). This keeps every existing contract test green.
 *
 * The gate reads the latest Workspace Evaluation bound to the Project stage
 * (#469). When that eval has not run yet we emit NO stop — you cannot gate on
 * an evaluation that does not exist, and fabricating a block would be wrong.
 *
 * Verdict → severity rule (per owned criterion in a gate):
 *   • `fail` → a stop at `stageGate.severity` (default `block`).
 *   • `warn` → a `warn`-severity stop (advisory), regardless of `stageGate.severity`.
 *   • `pass` / `na` / unknown → nothing.
 * A single gate emits at most ONE stop: a `fail` on any owned criterion wins
 * (block at the gate's severity); else a `warn` on any owned criterion (advisory).
 */
function deriveStageGateStops(
  project: ContractProjectRow,
  stages: Map<string, ContractStageRow>,
): StopCondition[] {
  const config = loadWorkspaceEvaluatorsSync(project.workspaceId);
  const gates = config?.stageGates;
  if (!config || !gates || gates.length === 0) return []; // no rubric → no stop.

  // The latest workspace-eval scorecard — absent ⇒ cannot gate, emit nothing.
  const evalRaw = boundStageJson(project.id, stages.get("workspace-eval")) as
    | { criteria?: Array<{ id?: unknown; verdict?: unknown }> }
    | null;
  if (!evalRaw || !Array.isArray(evalRaw.criteria)) return [];

  const verdicts = new Map<string, string>();
  for (const c of evalRaw.criteria) {
    if (typeof c?.id === "string" && typeof c?.verdict === "string") {
      verdicts.set(c.id, c.verdict);
    }
  }

  const stops: StopCondition[] = [];
  for (const gate of gates) {
    const failing = gate.criteria.filter((id) => verdicts.get(id) === "fail");
    const warning = gate.criteria.filter((id) => verdicts.get(id) === "warn");
    if (failing.length === 0 && warning.length === 0) continue;

    // fail wins (block at the gate's severity); else warn → advisory warn.
    const blocked = failing.length > 0;
    const offenders = blocked ? failing : warning;
    const severity: StopCondition["severity"] = blocked ? gate.severity : "warn";
    stops.push({
      id: "stage-gate-unmet",
      phase: gate.phase,
      severity,
      detail: `stage "${gate.stage}" (phase ${gate.phase}) cannot advance: criterion(s) ${offenders
        .map((id) => `"${id}"`)
        .join(", ")} ${blocked ? "FAILED" : "WARNED"} in the latest Workspace Evaluation. Clear the eval (\`ralphy workspace eval <id>\`) and run the repair loop before advancing this stage.`,
    });
  }
  return stops;
}
