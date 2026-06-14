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

import path from "node:path";
import { existsSync } from "node:fs";
import { projectDir } from "./paths.js";

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
    artifact: null,
    required: false,
    rationale:
      "If eval flags issues the user wants fixed, the fixer agent reads eval.json and re-rolls. Agent-driven; fixes re-touch existing artifacts (auto-versioned).",
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
}

/** Project-relative recommended next step per phase id. */
const NEXT_STEP: Record<string, string> = {
  intake:
    "Run intake (3-5 clarifying questions) and capture the brief to BRIEF.md (`ralphy project log-prompt --stage brief`).",
  "production-plan":
    "Draft the production plan (PRODUCTION_PLAN.md) and wait for the user's 'go' before any paid generation.",
  scenario:
    "Write the scenario (scenario.json) and pass scoreScenario before handing off to the art-director.",
  prompts: "Draft per-slot prompts (prompts.json); apply scoreImage/scoreVideo gates.",
  assets: "Generate assets via `ralphy generate ...`; the manifest (asset-manifest.json) tracks each slot.",
  render: "Run `ralphy editor preflight <id>` then `ralphy render <id>` → render/final.mp4.",
  eval: "Run the /evaluator post-render gate → eval.json + eval-report.md.",
};

function safeExists(p: string): boolean {
  try {
    return existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Cheap project-kind probe without touching the registry (keeps the function
 * pure-ish + testable on bare fixture dirs): a `render/` sibling means a video
 * project, a `selected/` sibling means an image-pack, otherwise "unknown".
 * Used to relax the `scenario.json` requirement for image-pack projects, which
 * legitimately never have a scenario.
 */
function probeKind(dir: string): string {
  if (safeExists(path.join(dir, "selected")) && !safeExists(path.join(dir, "render"))) {
    return "image-pack";
  }
  if (safeExists(path.join(dir, "render"))) return "video";
  return "unknown";
}

/**
 * Evaluate the production contract for a project. PURE w.r.t. arguments — reads
 * only the filesystem under `projectDir(projectId)`. Safe on a non-existent
 * project dir (every phase reports `present: false`).
 *
 * @param projectId  the project id (resolved through `projectDir`).
 */
export function evaluateContract(projectId: string): ContractEvaluation {
  const dir = projectDir(projectId);
  const kind = probeKind(dir);

  const phases: ContractPhaseResult[] = CONTRACT_PHASES.map((phase) => {
    // image-pack projects never produce a scenario — don't require it of them.
    const requiredForKind =
      phase.id === "scenario" && kind === "image-pack" ? false : phase.required;

    if (phase.artifact === null) {
      // Agent-driven phase — no on-disk artifact, gate lives in the agent loop.
      return {
        id: phase.id,
        label: phase.label,
        artifact: null,
        required: false,
        present: true,
        satisfied: true,
        rationale: phase.rationale,
      };
    }

    const present = safeExists(path.join(dir, phase.artifact));
    return {
      id: phase.id,
      label: phase.label,
      artifact: phase.artifact,
      required: requiredForKind,
      present,
      satisfied: present,
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

  return {
    project: projectId,
    kind,
    phases,
    missingRequired,
    nextRecommendedAction,
    complete: missingRequired.length === 0,
  };
}
