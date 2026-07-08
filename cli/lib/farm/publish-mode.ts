// Publishing kill switch + safe-mode (#536) — the operator counterpart to the
// trust ladder (#505). The ladder GRANTS autonomy; this REVOKES it instantly.
//
// Two levels above `normal`:
//   • safe   — keep producing + gating, but route EVERY publish to the approval
//              queue regardless of trust level (nothing auto-posts). Equivalent
//              to forcing L0 at the publish gate; a human already in the loop
//              (a recorded run approval, or an explicit force_reason) still
//              passes — safe stops the UNATTENDED post, not the human one.
//   • freeze — halt publishing entirely. The node path parks the run; the
//              chat-driven `ralphy publish` verb refuses with a clear error.
//              Scheduled/held posts are NOT re-fired until `resume`.
//
// Scope + precedence: a per-workspace mode on workspace.json (`publishMode`),
// mirroring trust.ts's read/write, PLUS a GLOBAL override in config.json
// (`publishMode` via global-config). THE GLOBAL WINS when it is set to a
// non-`normal` value (the big red button covers every workspace at once); a
// `normal` global falls through to the workspace's own mode. Both are on disk,
// so a daemon restart honors the mode by construction (it is just a file read).
//
// FREEZE is the top authority at the publish gate — it wins over a trust
// auto-pass AND over a workflow `force_reason` (an operator freeze outranks a
// graph-baked bypass; the operator turned publishing OFF). SAFE forces the park
// like L0 but yields to a human already in the loop (run approval / force_reason).
//
// Auto-trip (#518-notified) folds three anomaly signals — spend-rate vs budget
// (#481), failure-rate (#519 dead-letter), policy-gate breach (#442) — into a
// conservative decision. `evaluateAutoTrip` is PURE over injected counts so the
// runner seam and the tests share one deterministic decision. The runner trips
// `normal → safe` only, notifies, and NEVER auto-resumes (resume is always an
// explicit human action — `ralphy farm resume`).
//
// Storage (all under `<workspace>/` + the global config), append-only audit:
//   • workspace.json `publishMode` / `autoTrip` keys — engine state (rewritable,
//     like `trust`); malformed → the `.catch` default (the floor `normal`).
//   • config.json `publishMode`                      — the global override.
//   • publish-mode-audit.jsonl                       — APPEND-ONLY record of
//     every mode change / resume (scope, mode, actor, reason).

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { workspaceDir, workspaceManifestPath } from "../paths.js";
import { configGet, configSet } from "../global-config.js";

// ─── State ────────────────────────────────────────────────────────────────────

export const PUBLISH_MODES = ["normal", "safe", "freeze"] as const;
export type PublishMode = (typeof PUBLISH_MODES)[number];

/** The global config key the override lives under (config.json). */
export const GLOBAL_PUBLISH_MODE_KEY = "publishMode" as const;

/**
 * Auto-trip config (workspace.json `autoTrip`). Conservative defaults + an
 * `enabled` flag. The default is ENABLED with high thresholds: a kill switch
 * that never trips is theater, and tripping only ever moves `normal → safe`
 * (produce-don't-post) with a notification — the safe failure mode. Malformed
 * values degrade to the default (`.catch`) so a hand-edited manifest never
 * crashes the farm.
 */
export const AutoTripConfigSchema = z.object({
  /** Master switch. Default ON — the switch only trips to safe + notifies. */
  enabled: z.boolean().catch(true).default(true),
  /**
   * Spend signal: trip when run-wide realized spend is at/over this fraction of
   * the approved cap (#481). 0.9 = a 90%-of-budget burn trips safe-mode.
   */
  spendFraction: z.number().min(0).max(1).catch(0.9).default(0.9),
  /**
   * Failure signal: trip when the unresolved dead-letter count (#519) reaches
   * this many. A mass-failure spike (many nodes quarantined) is the signal.
   */
  failureCount: z.number().int().min(1).catch(10).default(10),
  /**
   * Policy signal: trip when this many projects carry a blocking #442
   * claims/policy breach. One breach at scale (a batch) is enough to warrant a
   * human look before more posts go out.
   */
  policyBreachCount: z.number().int().min(1).catch(3).default(3),
});
export type AutoTripConfig = z.infer<typeof AutoTripConfigSchema>;

export const DEFAULT_AUTO_TRIP_CONFIG: AutoTripConfig = AutoTripConfigSchema.parse({});

const PublishModeValue = z.enum(PUBLISH_MODES).catch("normal").default("normal");

/** Read `<workspace>/workspace.json`, or {} when missing/malformed. */
function readManifest(ws: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(workspaceManifestPath(ws), "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The workspace's OWN publish mode (ignores the global override). Default `normal`. */
export function readWorkspacePublishMode(ws: string): PublishMode {
  return PublishModeValue.parse(readManifest(ws).publishMode);
}

/** The GLOBAL publish-mode override (config.json), or `normal` when unset/malformed. */
export function readGlobalPublishMode(): PublishMode {
  return PublishModeValue.parse(configGet(GLOBAL_PUBLISH_MODE_KEY));
}

/** The workspace's auto-trip config (defaults when unset). */
export function readAutoTripConfig(ws: string): AutoTripConfig {
  return AutoTripConfigSchema.parse(readManifest(ws).autoTrip ?? {});
}

export interface EffectivePublishMode {
  mode: PublishMode;
  /** Which tier decided: "global" when the global override won, else "workspace". */
  scope: "global" | "workspace";
  /** The workspace's own mode (surfaced for observability / the dashboard). */
  workspaceMode: PublishMode;
  /** The global override value. */
  globalMode: PublishMode;
}

/**
 * The effective publish mode for a workspace: THE GLOBAL WINS when it is set to
 * a non-`normal` value (the big red button); else the workspace's own mode.
 * Persisted on disk → a daemon restart honors it (this is a pure file read).
 */
export function effectivePublishMode(ws: string): EffectivePublishMode {
  const globalMode = readGlobalPublishMode();
  const workspaceMode = readWorkspacePublishMode(ws);
  if (globalMode !== "normal") {
    return { mode: globalMode, scope: "global", workspaceMode, globalMode };
  }
  return { mode: workspaceMode, scope: "workspace", workspaceMode, globalMode };
}

// ─── Audit log (append-only) ────────────────────────────────────────────────

export interface PublishModeAuditEntry {
  at: string;
  /** Which tier the change hit. */
  scope: "workspace" | "global";
  /** The new mode. */
  mode: PublishMode;
  /** Who made the change (os user / "auto-trip" for the runner). */
  actor: string;
  /** Why — required for resume, logged for every change. */
  reason: string;
  /** The auto-trip signal, when the runner made the change. */
  signal?: "spend" | "failure" | "policy" | null;
}

/** The workspace's publish-mode audit log path. */
export function publishModeAuditPath(ws: string): string {
  return path.join(workspaceDir(ws), "publish-mode-audit.jsonl");
}

/** Append one audit line. APPEND-ONLY — never rewritten, never truncated. */
export function appendPublishModeAudit(
  ws: string,
  entry: Omit<PublishModeAuditEntry, "at"> & { at?: string },
): PublishModeAuditEntry {
  const full: PublishModeAuditEntry = { at: entry.at ?? new Date().toISOString(), ...entry };
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.appendFileSync(publishModeAuditPath(ws), JSON.stringify(full) + "\n");
  return full;
}

export function readPublishModeAudit(ws: string): PublishModeAuditEntry[] {
  let raw = "";
  try {
    raw = fs.readFileSync(publishModeAuditPath(ws), "utf8");
  } catch {
    return [];
  }
  const out: PublishModeAuditEntry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as PublishModeAuditEntry);
    } catch {
      // torn final line — append-only stores tolerate it
    }
  }
  return out;
}

// ─── Setters (write + audit) ────────────────────────────────────────────────

export interface SetModeOptions {
  actor: string;
  reason: string;
  /** The auto-trip signal (runner path only). */
  signal?: "spend" | "failure" | "policy" | null;
  /** ISO override for deterministic tests. */
  at?: string;
}

/**
 * Set the WORKSPACE publish mode: write `publishMode` on workspace.json (engine
 * state, does not touch invariant #14) + append an audit line. The audit is the
 * durable actor/reason record for every change (and the resume trail).
 */
export function setPublishMode(ws: string, mode: PublishMode, opts: SetModeOptions): PublishModeAuditEntry {
  const manifest = readManifest(ws);
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.writeFileSync(
    workspaceManifestPath(ws),
    JSON.stringify({ slug: ws, ...manifest, publishMode: mode }, null, 2) + "\n",
  );
  return appendPublishModeAudit(ws, { scope: "workspace", mode, actor: opts.actor, reason: opts.reason, signal: opts.signal ?? null, at: opts.at });
}

/**
 * Set the GLOBAL publish-mode override (config.json). Audited against the
 * workspace so the trail lives with the rest of the farm's per-workspace audit;
 * the change itself is global. `ws` is the audit anchor (the active workspace).
 */
export function setGlobalPublishMode(mode: PublishMode, ws: string, opts: SetModeOptions): PublishModeAuditEntry {
  configSet(GLOBAL_PUBLISH_MODE_KEY, mode);
  return appendPublishModeAudit(ws, { scope: "global", mode, actor: opts.actor, reason: opts.reason, signal: opts.signal ?? null, at: opts.at });
}

// ─── Auto-trip (pure over injected counts) ──────────────────────────────────

export interface AutoTripSignals {
  /** Run-wide realized spend as a fraction of the approved cap (0-1+), or null when no cap. */
  spendFraction: number | null;
  /** Unresolved dead-letter count (#519). */
  failureCount: number;
  /** Count of projects carrying a blocking #442 claims/policy breach. */
  policyBreachCount: number;
}

export interface AutoTripDecision {
  /** True when a signal crossed its threshold and the switch should trip to safe. */
  trip: boolean;
  /** The signal that tripped (first match wins), or null. */
  signal: "spend" | "failure" | "policy" | null;
  /** Human-readable reason for the notification + audit. */
  reason: string;
}

const NO_TRIP: AutoTripDecision = { trip: false, signal: null, reason: "no anomaly signal crossed its auto-trip threshold" };

/**
 * PURE decision: given the auto-trip config + the three signal readings, decide
 * whether to trip to safe-mode. Disabled config → never trips. Signals are
 * checked in a fixed order (spend → failure → policy) so the reason is stable.
 * The runner + the tests share this one function — no filesystem here.
 */
export function evaluateAutoTrip(config: AutoTripConfig, signals: AutoTripSignals): AutoTripDecision {
  if (!config.enabled) return NO_TRIP;
  if (signals.spendFraction != null && signals.spendFraction >= config.spendFraction) {
    return {
      trip: true,
      signal: "spend",
      reason: `spend-rate signal: run-wide spend is ${(signals.spendFraction * 100).toFixed(0)}% of the approved cap (>= ${(config.spendFraction * 100).toFixed(0)}% trip threshold, #481)`,
    };
  }
  if (signals.failureCount >= config.failureCount) {
    return {
      trip: true,
      signal: "failure",
      reason: `failure-rate signal: ${signals.failureCount} unresolved dead-letter entries (>= ${config.failureCount} trip threshold, #519)`,
    };
  }
  if (signals.policyBreachCount >= config.policyBreachCount) {
    return {
      trip: true,
      signal: "policy",
      reason: `policy-gate signal: ${signals.policyBreachCount} project(s) carry a blocking claims/policy breach (>= ${config.policyBreachCount} trip threshold, #442)`,
    };
  }
  return NO_TRIP;
}

// ─── Status roll-up (`farm safe-mode`/`freeze`/`resume` + the future app API) ──

export interface PublishModeStatus {
  workspace: string;
  /** The effective mode (global override applied). */
  mode: PublishMode;
  scope: "global" | "workspace";
  workspaceMode: PublishMode;
  globalMode: PublishMode;
  autoTrip: AutoTripConfig;
  auditLog: string;
  /** The most recent audit entry, when any. */
  lastChange: PublishModeAuditEntry | null;
}

/** The publish-mode status block — exported for the CLI verbs AND the future dashboard app API (#506/#492). */
export function publishModeStatus(ws: string): PublishModeStatus {
  const eff = effectivePublishMode(ws);
  const audit = readPublishModeAudit(ws);
  return {
    workspace: ws,
    mode: eff.mode,
    scope: eff.scope,
    workspaceMode: eff.workspaceMode,
    globalMode: eff.globalMode,
    autoTrip: readAutoTripConfig(ws),
    auditLog: publishModeAuditPath(ws),
    lastChange: audit.length ? audit[audit.length - 1]! : null,
  };
}
