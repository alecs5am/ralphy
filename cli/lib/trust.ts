// Workspace trust ladder (#505) — earned auto-publish per workspace.
//
// The ladder (docs/architecture/farm-node-graph.md "Trust ladder"):
//   • L0 — publish always parks for human approval (the default, the floor).
//   • L1 — a unit auto-passes when its workspace-eval scorecard says `ship`
//          AND its overall score clears `autoPublishScore`; borderline parks.
//   • L2 — any gate-clearing unit (workspace-eval verdict `ship`) auto-passes.
//
// HARD INVARIANT (#4 extended to the farm): a non-`ship` verdict or ANY
// fail/warn criterion NEVER auto-passes, at ANY level. `decideAutoPass` is the
// single place that rule lives; both the approval node and the publish path
// call it.
//
// Storage (all under `<workspace>/`):
//   • workspace.json `trust` key       — the config (engine state, rewritable).
//   • trust-audit.jsonl                — APPEND-ONLY audit of every auto-pass
//                                        (+ demotions), with the score/verdict
//                                        that justified it.
//   • trust-agreement.jsonl            — APPEND-ONLY (eval verdict, human
//                                        decision) samples. Agreement rate =
//                                        fraction where the human matched the
//                                        verdict (approve↔ship, reject↔non-ship);
//                                        streak = consecutive matches counted
//                                        from the most recent sample backward.
//
// Promotion is SUGGESTED (never applied) when streak >= promotionStreak AND
// rate >= PROMOTION_AGREEMENT_RATE (0.9). Promotion itself is always the
// explicit `ralphy workspace update <ws> --trust-level <L>`.
//
// Demotion: a human reject of a unit that was auto-published (its project/unit
// has an auto-pass audit entry) resets the streak (the reject sample is a
// mismatch by construction) and, when `demoteOnReject` (default true), drops
// L2 → L1. L1 stays L1 on reject (the streak reset is the penalty); L0 is the
// floor.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { workspaceDir, workspaceManifestPath, projectDir } from "./paths.js";
import { TRUST_LEVELS, type TrustLevel } from "./schemas/bundle.js";

export { TRUST_LEVELS, type TrustLevel };

/** Agreement-rate bar for a promotion suggestion (with a full streak). */
export const PROMOTION_AGREEMENT_RATE = 0.9;

// ─── Config (workspace.json `trust` key) ─────────────────────────────────────

/**
 * Malformed values degrade to the default (`.catch`) — a hand-edited
 * workspace.json never crashes the farm, it just falls back to the floor.
 */
export const TrustConfigSchema = z.object({
  /** The ladder level. Default L0 — everything parks for approval. */
  level: z.enum(TRUST_LEVELS).catch("L0").default("L0"),
  /** L1 threshold on the workspace-eval OVERALL score (0-100 scale, #469). */
  autoPublishScore: z.number().min(0).max(100).catch(80).default(80),
  /** Consecutive verdict↔decision matches needed to suggest promotion. */
  promotionStreak: z.number().int().min(1).catch(10).default(10),
  /** Reject of an auto-published unit drops L2 → L1 (default true). */
  demoteOnReject: z.boolean().catch(true).default(true),
});
export type TrustConfig = z.infer<typeof TrustConfigSchema>;

export const DEFAULT_TRUST_CONFIG: TrustConfig = TrustConfigSchema.parse({});

/** Read `<workspace>/workspace.json`, or {} when missing/malformed. */
function readManifest(ws: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(workspaceManifestPath(ws), "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The workspace's trust config (defaults when unset — every workspace is L0 until promoted). */
export function readTrustConfig(ws: string): TrustConfig {
  return TrustConfigSchema.parse(readManifest(ws).trust ?? {});
}

/**
 * Merge a partial trust patch into workspace.json's `trust` key. The manifest
 * is engine state (like registry.json) — rewriting it does not touch
 * invariant #14. Creates the manifest when the workspace has none yet.
 */
export function writeTrustConfig(ws: string, patch: Partial<TrustConfig>): TrustConfig {
  const manifest = readManifest(ws);
  const merged = TrustConfigSchema.parse({ ...(manifest.trust as object | undefined), ...patch });
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.writeFileSync(
    workspaceManifestPath(ws),
    JSON.stringify({ slug: ws, ...manifest, trust: merged }, null, 2) + "\n",
  );
  return merged;
}

// ─── Workspace-eval read (the L1/L2 evidence) ────────────────────────────────

export interface ProjectEvalRead {
  /** False when the project has no readable workspace-eval.json. */
  found: boolean;
  /** The #427 overall verdict (ship | repair | needs-user-decision | blocked). */
  verdict: string | null;
  /** The 0-100 overall score (mean of scored criteria), or null. */
  score: number | null;
  /** Criterion ids whose per-criterion verdict is fail or warn. */
  failOrWarnCriteria: string[];
}

const NO_EVAL: ProjectEvalRead = { found: false, verdict: null, score: null, failOrWarnCriteria: [] };

/** Best-effort read of `<project>/workspace-eval.json` (#469 scorecard). */
export function readProjectEval(projectId: string): ProjectEvalRead {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(projectDir(projectId), "workspace-eval.json"), "utf8"),
    ) as {
      overall?: { verdict?: unknown; score?: unknown };
      criteria?: Array<{ id?: unknown; verdict?: unknown }>;
    };
    const verdict = typeof raw.overall?.verdict === "string" ? raw.overall.verdict : null;
    const score = typeof raw.overall?.score === "number" ? raw.overall.score : null;
    const failOrWarnCriteria = (Array.isArray(raw.criteria) ? raw.criteria : [])
      .filter((c) => c.verdict === "fail" || c.verdict === "warn")
      .map((c) => String(c.id ?? "?"));
    return { found: true, verdict, score, failOrWarnCriteria };
  } catch {
    return NO_EVAL;
  }
}

// ─── The decision (pure) ─────────────────────────────────────────────────────

export interface TrustDecision {
  autoPass: boolean;
  level: TrustLevel;
  reason: string;
  verdict: string | null;
  score: number | null;
}

/**
 * May this unit auto-pass a human-approval gate? The ONLY auto-pass rule in
 * the codebase — approval node, publish node, and `checkPublishTrust` all
 * route through here. Refusals are ordered so the invariant-#4 cases fire
 * before any level logic.
 */
export function decideAutoPass(
  config: TrustConfig,
  ev: ProjectEvalRead,
  project: string,
): TrustDecision {
  const base = { level: config.level, verdict: ev.verdict, score: ev.score };
  if (config.level === "L0") {
    return { ...base, autoPass: false, reason: "trust level L0 — publish always parks for human approval" };
  }
  if (!ev.found) {
    return {
      ...base,
      autoPass: false,
      reason: `no workspace-eval scorecard for "${project}" — nothing justifies an auto-pass (run \`ralphy workspace eval ${project}\`)`,
    };
  }
  if (ev.verdict !== "ship") {
    return {
      ...base,
      autoPass: false,
      reason: `workspace-eval verdict "${ev.verdict ?? "(missing)"}" is not ship — a non-ship verdict never auto-passes at any level (invariant #4)`,
    };
  }
  if (ev.failOrWarnCriteria.length > 0) {
    return {
      ...base,
      autoPass: false,
      reason: `criteria [${ev.failOrWarnCriteria.join(", ")}] are fail/warn — never auto-pass over a failed/warn gate (invariant #4)`,
    };
  }
  if (config.level === "L1") {
    if (ev.score === null || ev.score < config.autoPublishScore) {
      return {
        ...base,
        autoPass: false,
        reason: `score ${ev.score ?? "(none)"} is below the L1 auto-publish threshold ${config.autoPublishScore} — borderline parks for approval`,
      };
    }
    return {
      ...base,
      autoPass: true,
      reason: `L1 auto-pass: verdict ship, score ${ev.score} >= threshold ${config.autoPublishScore}`,
    };
  }
  return { ...base, autoPass: true, reason: "L2 auto-pass: verdict ship (gate-clearing unit)" };
}

// ─── Audit log (append-only) ─────────────────────────────────────────────────

export interface TrustAuditEntry {
  at: string;
  kind: "auto-pass" | "demotion";
  workspace: string;
  level: TrustLevel;
  /** Where the auto-pass fired: approval-node | publish-node | x-post-node | … */
  surface: string;
  run?: string | null;
  node?: string | null;
  project?: string | null;
  unit?: string | null;
  verdict?: string | null;
  score?: number | null;
  /** The L1 threshold in force, when relevant. */
  threshold?: number | null;
  reason: string;
}

export function trustAuditPath(ws: string): string {
  return path.join(workspaceDir(ws), "trust-audit.jsonl");
}

/** Append one audit line. APPEND-ONLY — never rewritten, never truncated. */
export function appendTrustAudit(
  ws: string,
  entry: Omit<TrustAuditEntry, "at" | "workspace"> & { at?: string },
): TrustAuditEntry {
  const full: TrustAuditEntry = { at: entry.at ?? new Date().toISOString(), workspace: ws, ...entry };
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.appendFileSync(trustAuditPath(ws), JSON.stringify(full) + "\n");
  return full;
}

export function readTrustAudit(ws: string): TrustAuditEntry[] {
  return readJsonl<TrustAuditEntry>(trustAuditPath(ws));
}

/** Did an auto-pass audit entry cover this project (and unit, when both name one)? */
export function hasAutoPassAudit(ws: string, project: string, unit?: string | null): boolean {
  return readTrustAudit(ws).some(
    (e) =>
      e.kind === "auto-pass" &&
      e.project === project &&
      (unit == null || e.unit == null || e.unit === unit),
  );
}

// ─── Agreement store (append-only) ───────────────────────────────────────────

export interface TrustAgreementSample {
  at: string;
  /** The human's call on the unit. */
  decision: "approve" | "reject";
  /** The eval verdict the unit carried when the human decided (#427 vocab). */
  verdict: string;
  score?: number | null;
  project?: string | null;
  unit?: string | null;
  run?: string | null;
  /** Which surface recorded it (run-approve | dashboard | …). */
  source?: string | null;
  /** approve↔ship / reject↔non-ship. */
  match: boolean;
}

export function trustAgreementPath(ws: string): string {
  return path.join(workspaceDir(ws), "trust-agreement.jsonl");
}

export function readAgreementSamples(ws: string): TrustAgreementSample[] {
  return readJsonl<TrustAgreementSample>(trustAgreementPath(ws));
}

export interface AgreementStats {
  samples: number;
  matches: number;
  /** matches/samples, or null with zero samples (never fabricated as 0). */
  rate: number | null;
  /** Consecutive matches counted from the most recent sample backward. */
  streak: number;
}

/** Pure agreement math over the sample list (oldest → newest order). */
export function agreementStats(samples: TrustAgreementSample[]): AgreementStats {
  const matches = samples.filter((s) => s.match).length;
  let streak = 0;
  for (let i = samples.length - 1; i >= 0 && samples[i]!.match; i--) streak++;
  return {
    samples: samples.length,
    matches,
    rate: samples.length === 0 ? null : Number((matches / samples.length).toFixed(4)),
    streak,
  };
}

export interface PromotionSuggestion {
  suggested: boolean;
  nextLevel: TrustLevel | null;
  /** The documented suggestion rule, with the live numbers folded in. */
  rule: string;
}

/**
 * Suggest (never apply) a promotion: streak >= promotionStreak AND rate >=
 * PROMOTION_AGREEMENT_RATE. L2 has nowhere to go.
 */
export function promotionSuggestion(config: TrustConfig, stats: AgreementStats): PromotionSuggestion {
  const nextLevel: TrustLevel | null =
    config.level === "L0" ? "L1" : config.level === "L1" ? "L2" : null;
  const suggested =
    nextLevel !== null &&
    stats.streak >= config.promotionStreak &&
    stats.rate !== null &&
    stats.rate >= PROMOTION_AGREEMENT_RATE;
  const rule =
    `promotion is suggested when the streak of consecutive verdict-matching human decisions reaches ` +
    `${config.promotionStreak} (current: ${stats.streak}) AND the overall agreement rate is >= ` +
    `${PROMOTION_AGREEMENT_RATE} (current: ${stats.rate ?? "n/a"}). Promotion is ALWAYS explicit: ` +
    `ralphy workspace update <ws> --trust-level ${nextLevel ?? "L2"}`;
  return { suggested, nextLevel, rule };
}

// ─── Recording a human decision (the #506 dashboard helper) ──────────────────

export interface TrustDecisionInput {
  decision: "approve" | "reject";
  verdict: string;
  score?: number | null;
  project?: string | null;
  unit?: string | null;
  run?: string | null;
  source?: string | null;
  at?: string;
}

export interface TrustDecisionRecord {
  sample: TrustAgreementSample;
  /** Non-null when the reject hit an auto-published unit (demotion path checked). */
  demotion: { demoted: boolean; from: TrustLevel; to: TrustLevel; reason: string } | null;
}

/**
 * Record one (eval verdict, human decision) sample — THE reject/approve
 * recording path (also the direct helper #506's dashboard calls). Appends to
 * trust-agreement.jsonl; a reject of an auto-published unit (auto-pass audit
 * entry present) additionally runs the demotion rule: L2 → L1 when
 * demoteOnReject, audited; L1 stays L1 (the streak reset is emergent — the
 * reject sample is a mismatch, so the streak recomputes to 0).
 */
export function recordTrustDecision(ws: string, input: TrustDecisionInput): TrustDecisionRecord {
  const sample: TrustAgreementSample = {
    at: input.at ?? new Date().toISOString(),
    decision: input.decision,
    verdict: input.verdict,
    score: input.score ?? null,
    project: input.project ?? null,
    unit: input.unit ?? null,
    run: input.run ?? null,
    source: input.source ?? null,
    match: (input.decision === "approve") === (input.verdict === "ship"),
  };
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.appendFileSync(trustAgreementPath(ws), JSON.stringify(sample) + "\n");

  let demotion: TrustDecisionRecord["demotion"] = null;
  if (input.decision === "reject" && input.project && hasAutoPassAudit(ws, input.project, input.unit)) {
    const config = readTrustConfig(ws);
    if (config.level === "L2" && config.demoteOnReject) {
      writeTrustConfig(ws, { level: "L1" });
      const reason = `human reject of auto-published ${input.project}${input.unit ? `/${input.unit}` : ""} — demoted L2 -> L1 (demoteOnReject)`;
      appendTrustAudit(ws, {
        kind: "demotion",
        level: "L1",
        surface: input.source ?? "trust-decision",
        project: input.project,
        unit: input.unit ?? null,
        run: input.run ?? null,
        verdict: input.verdict,
        reason,
      });
      demotion = { demoted: true, from: "L2", to: "L1", reason };
    } else {
      demotion = {
        demoted: false,
        from: config.level,
        to: config.level,
        reason:
          config.level === "L2"
            ? "demoteOnReject is off — level kept, streak reset"
            : `level ${config.level} stays on reject — the streak reset is the penalty`,
      };
    }
  }
  return { sample, demotion };
}

// ─── Status roll-up (`ralphy workspace trust`) ───────────────────────────────

export interface TrustStatus {
  workspace: string;
  level: TrustLevel;
  autoPublishScore: number;
  promotionStreak: number;
  demoteOnReject: boolean;
  agreement: AgreementStats;
  promotion: PromotionSuggestion;
  /** Count of auto-pass audit entries (how often the ladder fired). */
  autoPasses: number;
  agreementLog: string;
  auditLog: string;
}

export function trustStatus(ws: string): TrustStatus {
  const config = readTrustConfig(ws);
  const stats = agreementStats(readAgreementSamples(ws));
  return {
    workspace: ws,
    ...config,
    agreement: stats,
    promotion: promotionSuggestion(config, stats),
    autoPasses: readTrustAudit(ws).filter((e) => e.kind === "auto-pass").length,
    agreementLog: trustAgreementPath(ws),
    auditLog: trustAuditPath(ws),
  };
}

// ─── shared ──────────────────────────────────────────────────────────────────

function readJsonl<T>(file: string): T[] {
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // torn final line — append-only stores tolerate it
    }
  }
  return out;
}
