// Spend governor + approval ledger (#444, run-wide in #481).
//
// A project-local, OPT-IN budget cap, extended in #481 to a run-wide cap that
// covers all of a run's member projects. The ledger records user approvals — a
// budget cap, the allowed content modes, an expiry, and a user-facing reason —
// and the spend check consults it BEFORE any paid generation. When NO ledger
// exists ANYWHERE in the chain, generation proceeds exactly as before
// (`checkSpend` returns `{ allowed: true }`), so existing behavior is unchanged.
// Enforcement fires ONLY once the user has recorded an approval (project-local
// via `ralphy project approve`, or run-wide via `ralphy run approve`). This
// mirrors the agent-layer "wait for go" gate + `--no-ref-consent`: the ledger
// is the auditable record AND the hard cap, not a blanket block.
//
// Resolution order in `checkSpend` (first match wins): project-local active
// approval → the run's active approval (spent basis = run-wide actual spend
// across ALL member projects) → workspace default (NOT yet implemented) →
// pass-through. See `checkSpend` for the opt-in floor rationale.
//
// Actual spend is the sum of `cost_usd` over `<project>/logs/generations.jsonl`
// (read through `readGenerations()` — never parsed by hand). Estimated spend
// for one planned call reuses the existing pricing helpers (image / video /
// flat VO+music+sfx ballparks) so there is one price table, not two.
//
// The ledger file (`spend-ledger.json`) is APPEND-ONLY on its `approvals[]`:
// a new approval is appended, the prior approvals are never rewritten or
// dropped (AGENTS.md #14). The same file shape backs BOTH the project ledger
// (`<project>/spend-ledger.json`) and the run ledger
// (`runs/<runId>/spend-ledger.json`). The ACTIVE approval is the most recent
// one — the floor it enforces is the latest decision the user recorded.

import fs from "node:fs/promises";
import path from "node:path";
import { projectDir, runDir, runWorkspace as runWorkspaceOf } from "./paths.js";
import { readGenerations } from "./gen-log.js";
import { estimateVideoCostUsd } from "./or-catalog.js";
import { imageCostUsd } from "./generate-batch.js";

/** Project-relative location the spend ledger is persisted to. */
export const SPEND_LEDGER_ARTIFACT = "spend-ledger.json" as const;

/** Flat ElevenLabs ballparks — mirror cli/lib/plan/build.ts so there is one table. */
const VOICEOVER_COST_USD = 0.05;
const MUSIC_COST_USD = 0.1;
const SFX_COST_USD = 0.02;

/** A single recorded user approval. Append-only — never rewritten. */
export interface Approval {
  /** What the approval covers: the whole project, a named batch, or a whole run (#481). */
  scope: "project" | "batch" | "run";
  /** Hard USD cap on cumulative actual spend for the scope. */
  budgetCapUsd: number;
  /** Content modes this approval permits. Omitted/empty = any mode allowed. */
  allowedModes?: string[];
  /** ISO timestamp after which the approval no longer applies. Omitted = never expires. */
  expiry?: string;
  /** User-facing reason the budget was approved (auditable). */
  reason: string;
  /** ISO timestamp the approval was recorded. */
  approvedAt: string;
}

/** The on-disk ledger. `approvals[]` grows append-only. */
export interface SpendLedger {
  version: 1;
  /** The owning scope id — a project id (project ledger) or run id (run ledger). */
  projectId: string;
  approvals: Approval[];
}

export interface CheckSpendInput {
  /** Estimated USD cost of the single call about to run. */
  estimatedUsd: number;
  /** Content mode of the call (for the allowedModes check). */
  mode?: string;
  /** ISO "now" override for deterministic tests. Defaults to the real clock. */
  now?: string;
}

export interface CheckSpendResult {
  /** false → the caller must hard-stop (a ledger is present and the call breaches it). */
  allowed: boolean;
  /** Human-readable reason when blocked; null when allowed. */
  reason: string | null;
  /** The active approval's cap (null when no active approval). */
  capUsd: number | null;
  /** Actual spend so far (sum of gen-log cost_usd). */
  spentUsd: number;
  /** Cap minus spent minus the estimate (null when no active approval). */
  remainingUsd: number | null;
  /** true when the active approval has passed its expiry. */
  expired: boolean;
  /** false when an active approval restricts modes and `mode` is not in them. */
  modeAllowed: boolean;
  /** Which ledger tier the active approval came from (#481). null = pass-through. */
  scope?: "project" | "run" | null;
  /** The run id the cap was resolved from, when scope === "run". */
  runId?: string;
}

function ledgerPath(projectId: string): string {
  return path.join(projectDir(projectId), SPEND_LEDGER_ARTIFACT);
}

function runLedgerPath(runId: string): string {
  return path.join(runDir(runWorkspaceOf(runId), runId), SPEND_LEDGER_ARTIFACT);
}

// ── Path-parameterized ledger core ────────────────────────────────────────────
// Both the project ledger (`<project>/spend-ledger.json`) and the run ledger
// (`runs/<runId>/spend-ledger.json`) are the SAME shape; these `*At(path)`
// cores do the read/append, and the project-scoped wrappers below keep their
// existing signatures unchanged (existing callers + spend.test.ts depend on it).

/** Read a ledger at an absolute path, or null when none exists / unparseable. */
export async function readLedgerAt(ledgerAbsPath: string): Promise<SpendLedger | null> {
  try {
    const raw = await fs.readFile(ledgerAbsPath, "utf8");
    const parsed = JSON.parse(raw) as SpendLedger;
    if (!parsed || !Array.isArray(parsed.approvals)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Append an approval to a ledger at an absolute path (creating it on first
 * call). Never rewrites or drops a prior approval — `approvals[]` only grows.
 */
export async function recordApprovalAt(
  ledgerAbsPath: string,
  ownerId: string,
  approval: Omit<Approval, "approvedAt"> & { approvedAt?: string },
): Promise<SpendLedger> {
  const existing = await readLedgerAt(ledgerAbsPath);
  const full: Approval = {
    scope: approval.scope,
    budgetCapUsd: approval.budgetCapUsd,
    allowedModes: approval.allowedModes,
    expiry: approval.expiry,
    reason: approval.reason,
    approvedAt: approval.approvedAt ?? new Date().toISOString(),
  };
  const ledger: SpendLedger = existing ?? { version: 1, projectId: ownerId, approvals: [] };
  ledger.approvals.push(full);
  await fs.mkdir(path.dirname(ledgerAbsPath), { recursive: true });
  await fs.writeFile(ledgerAbsPath, JSON.stringify(ledger, null, 2) + "\n");
  return ledger;
}

/** Read the project ledger, or null when none exists / unparseable. */
export async function readLedger(projectId: string): Promise<SpendLedger | null> {
  return readLedgerAt(ledgerPath(projectId));
}

/**
 * Append a new approval to the project ledger (creating it on first call).
 * Thin wrapper over `recordApprovalAt` — signature unchanged.
 */
export async function recordApproval(
  projectId: string,
  approval: Omit<Approval, "approvedAt"> & { approvedAt?: string },
): Promise<SpendLedger> {
  return recordApprovalAt(ledgerPath(projectId), projectId, approval);
}

/** Read the run ledger, or null when none exists. */
export async function readRunLedger(runId: string): Promise<SpendLedger | null> {
  return readLedgerAt(runLedgerPath(runId));
}

/** Append a run-scoped approval to the run ledger (#481). */
export async function recordRunApproval(
  runId: string,
  approval: Omit<Approval, "approvedAt" | "scope"> & { approvedAt?: string; scope?: Approval["scope"] },
): Promise<SpendLedger> {
  return recordApprovalAt(runLedgerPath(runId), runId, { ...approval, scope: "run" });
}

/** Sum of `cost_usd` over the project's generations.jsonl (actual spend). */
export async function actualSpendUsd(projectId: string): Promise<number> {
  const rows = await readGenerations(projectId);
  let total = 0;
  for (const r of rows) total += r.cost_usd ?? 0;
  return Number(total.toFixed(6));
}

/**
 * Run-wide actual spend (#481): the sum of actual project spend across the
 * given member project ids. A run cap is a ceiling on TOTAL spend across ALL
 * members, not per-project, so this is the spent basis for the run tier.
 */
export async function runActualSpendUsd(memberProjectIds: string[]): Promise<number> {
  let total = 0;
  for (const pid of memberProjectIds) total += await actualSpendUsd(pid);
  return Number(total.toFixed(6));
}

/**
 * The active approval is the most recent one (last appended) — the latest
 * decision the user recorded. Returns null when the ledger is empty / absent.
 */
export function activeApproval(ledger: SpendLedger | null): Approval | null {
  if (!ledger || ledger.approvals.length === 0) return null;
  return ledger.approvals[ledger.approvals.length - 1]!;
}

/**
 * Best-effort per-call cost estimate. Reuses the existing pricing helpers so
 * there is a single price table: `imageCostUsd` (image, same helper the
 * `generate image` dry-run uses), `estimateVideoCostUsd` (catalog-backed video
 * per-second price), and the flat ElevenLabs ballparks for VO / music / sfx.
 */
export function estimatedCallCostUsd(args: {
  kind: "image" | "video" | "voiceover" | "music" | "sfx";
  model?: string;
  durationSec?: number;
  variants?: number;
}): number {
  const variants = Math.max(1, args.variants ?? 1);
  switch (args.kind) {
    case "image":
      return Number((imageCostUsd(args.model ?? "") * variants).toFixed(6));
    case "video":
      return Number((estimateVideoCostUsd(args.model ?? "", args.durationSec ?? 0) * variants).toFixed(6));
    case "voiceover":
      return Number((VOICEOVER_COST_USD * variants).toFixed(6));
    case "music":
      return Number((MUSIC_COST_USD * variants).toFixed(6));
    case "sfx":
      return Number((SFX_COST_USD * variants).toFixed(6));
  }
}

/**
 * Pure evaluation of one active approval against a spent basis + this call's
 * estimate. Shared by the project and run tiers so the four block conditions
 * are identical regardless of which ledger the cap came from.
 */
function evaluateApproval(
  approval: Approval,
  spentUsd: number,
  input: CheckSpendInput,
  scope: "project" | "run",
  runId?: string,
): CheckSpendResult {
  const estimate = Math.max(0, input.estimatedUsd || 0);
  const remainingUsd = Number((approval.budgetCapUsd - spentUsd - estimate).toFixed(6));

  const nowMs = input.now ? Date.parse(input.now) : Date.now();
  const expired = approval.expiry ? Number.isFinite(Date.parse(approval.expiry)) && nowMs > Date.parse(approval.expiry) : false;

  const restrictsModes = Array.isArray(approval.allowedModes) && approval.allowedModes.length > 0;
  const modeAllowed = !restrictsModes || (input.mode != null && approval.allowedModes!.includes(input.mode));

  const overBudget = spentUsd + estimate > approval.budgetCapUsd;
  const reApprove = scope === "run" ? "`ralphy run approve`" : "`ralphy project approve`";

  let allowed = true;
  let reason: string | null = null;
  if (expired) {
    allowed = false;
    reason = `Spend approval expired ${approval.expiry} — re-approve with ${reApprove}.`;
  } else if (!modeAllowed) {
    allowed = false;
    reason = `Mode "${input.mode ?? "(none)"}" is not in the approved modes (${approval.allowedModes!.join(", ")}).`;
  } else if (overBudget) {
    const basis = scope === "run" ? "Run-wide spent" : "Spent";
    allowed = false;
    reason = `${basis} $${spentUsd.toFixed(2)} + estimated $${estimate.toFixed(2)} exceeds the approved cap $${approval.budgetCapUsd.toFixed(2)}.`;
  }

  return { allowed, reason, capUsd: approval.budgetCapUsd, spentUsd, remainingUsd, expired, modeAllowed, scope, runId };
}

/**
 * The core gate. Resolution order (first match wins, #481):
 *   1. project-local active approval — spent basis = project actual spend.
 *   2. else the run's active approval (when the project belongs to a run with a
 *      ledger) — spent basis = RUN-WIDE actual spend across all member projects.
 *   3. else a workspace default — NOT yet implemented; skipped cleanly.
 *   4. else pass-through (`{ allowed: true }`).
 *
 * The opt-in floor is deliberate: with NO ledger anywhere in the chain,
 * generation is unchanged. This reconciles the issue's "block when no matching
 * approval exists" — a job only blocks on a POSITIVE breach of a ledger that
 * DOES exist; un-enrolled work (no project ledger AND no run ledger) is never
 * blocked. A user opts a project into enforcement by recording a project OR run
 * approval, exactly as #444 made enforcement opt-in for a lone project.
 *
 * With an active approval, blocks (`allowed: false`) when ANY condition holds:
 * expired, mode-not-allowed, or spent + estimate > cap.
 *
 * The run lookup is done via a LAZY import of run.ts to avoid a static cycle
 * (run.ts imports `budgetSummary` from this module).
 */
export async function checkSpend(
  projectId: string,
  input: CheckSpendInput,
): Promise<CheckSpendResult> {
  const projectSpent = await actualSpendUsd(projectId);

  // 1. Project-local active approval.
  const projApproval = activeApproval(await readLedger(projectId));
  if (projApproval) {
    return evaluateApproval(projApproval, projectSpent, input, "project");
  }

  // 2. The run this project belongs to, if any, with a run ledger.
  const { projectRun } = await import("./run.js");
  const run = projectRun(projectId);
  if (run) {
    const runApproval = activeApproval(await readRunLedger(run.runId));
    if (runApproval) {
      const members = await runMemberProjectIds(run.runId);
      const runSpent = await runActualSpendUsd(members);
      return evaluateApproval(runApproval, runSpent, input, "run", run.runId);
    }
  }

  // 3. Workspace default — not yet implemented (#481 §3 tier 3).
  // 4. Pass-through (opt-in floor preserved).
  return {
    allowed: true,
    reason: null,
    capUsd: null,
    spentUsd: projectSpent,
    remainingUsd: null,
    expired: false,
    modeAllowed: true,
    scope: null,
  };
}

/** Read a run's member project ids via the manifest (lazy import — see checkSpend). */
async function runMemberProjectIds(runId: string): Promise<string[]> {
  const { loadRun } = await import("./run.js");
  const run = await loadRun(runId);
  return run?.projectIds ?? [];
}

/**
 * Resolve a `--expiry` value to an ISO timestamp. Accepts a bare ISO string
 * (returned as-is when parseable) or a simple duration like `24h`, `7d`,
 * `30m`, `2w` (relative to `now`). Returns null when the input is unparseable.
 */
export function resolveExpiry(value: string, now: Date = new Date()): string | null {
  const trimmed = value.trim();
  const dur = /^(\d+)\s*(m|h|d|w)$/i.exec(trimmed);
  if (dur) {
    const n = Number(dur[1]);
    const unit = dur[2]!.toLowerCase();
    const ms = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[unit]!;
    return new Date(now.getTime() + n * ms).toISOString();
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** Budget summary for `ralphy project budget` — pure data → data. */
export interface BudgetSummary {
  projectId: string;
  hasLedger: boolean;
  capUsd: number | null;
  spentUsd: number;
  remainingUsd: number | null;
  overBudget: boolean;
  activeApproval: Approval | null;
  expired: boolean;
  approvals: Approval[];
}

/** Build the budget summary from the ledger + actual spend. */
export async function budgetSummary(projectId: string, now: Date = new Date()): Promise<BudgetSummary> {
  const ledger = await readLedger(projectId);
  const approval = activeApproval(ledger);
  const spentUsd = await actualSpendUsd(projectId);
  const expired = approval?.expiry ? Number.isFinite(Date.parse(approval.expiry)) && now.getTime() > Date.parse(approval.expiry) : false;
  const cap = approval ? approval.budgetCapUsd : null;
  return {
    projectId,
    hasLedger: !!ledger,
    capUsd: cap,
    spentUsd,
    remainingUsd: cap == null ? null : Number((cap - spentUsd).toFixed(6)),
    overBudget: cap != null && spentUsd > cap,
    activeApproval: approval,
    expired,
    approvals: ledger?.approvals ?? [],
  };
}

/** Run-wide budget summary for `ralphy run budget` (#481) — pure data → data. */
export interface RunBudgetSummary {
  runId: string;
  hasLedger: boolean;
  /** The run-wide cap (active run approval), or null when no run ledger. */
  capUsd: number | null;
  /** Run-wide actual spend (sum across all member projects). */
  spentUsd: number;
  /** cap - run-wide spent (null when no cap). */
  remainingUsd: number | null;
  overBudget: boolean;
  activeApproval: Approval | null;
  expired: boolean;
  approvals: Approval[];
  /** Per-project actual-spend breakdown across the run's members. */
  byProject: Array<{ project: string; spentUsd: number }>;
}

/**
 * Build the run-wide budget summary: the active run cap, run-wide actual spend
 * (summed across ALL member projects), remaining, over-budget, the per-project
 * breakdown, and the full append-only approval history. Reads members via the
 * run manifest (lazy import — see checkSpend). The "estimated remaining queued
 * spend" lives in the command layer (it needs the jobs DB).
 */
export async function runBudgetSummary(runId: string, now: Date = new Date()): Promise<RunBudgetSummary> {
  const ledger = await readRunLedger(runId);
  const approval = activeApproval(ledger);
  const members = await runMemberProjectIds(runId);
  const byProject: RunBudgetSummary["byProject"] = [];
  let spentUsd = 0;
  for (const pid of members) {
    const s = await actualSpendUsd(pid);
    byProject.push({ project: pid, spentUsd: s });
    spentUsd += s;
  }
  spentUsd = Number(spentUsd.toFixed(6));
  const expired = approval?.expiry ? Number.isFinite(Date.parse(approval.expiry)) && now.getTime() > Date.parse(approval.expiry) : false;
  const cap = approval ? approval.budgetCapUsd : null;
  return {
    runId,
    hasLedger: !!ledger,
    capUsd: cap,
    spentUsd,
    remainingUsd: cap == null ? null : Number((cap - spentUsd).toFixed(6)),
    overBudget: cap != null && spentUsd > cap,
    activeApproval: approval,
    expired,
    approvals: ledger?.approvals ?? [],
    byProject,
  };
}
