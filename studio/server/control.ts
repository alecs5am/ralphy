// Farm control plane (#506) — the server half of the deploy/dashboard issue:
// bundle import, farm start/stop/tick/status, trust ladder, calendar, and the
// workspace workflow-graph read for the #490 canvas.
//
// Two implementation modes, per endpoint (studio/ never imports cli/ — the
// same self-containment rule as readWorkflowLane / summarizeRun in lib.ts):
//
//   • MUTATIONS WITH A CLI VERB shell out to `bun cli/index.ts <verb>` with
//     cwd = the dir containing `.ralphy/` — the CLI stays the single engine
//     (validation, error catalog, logs). Used by: import-bundle
//     (`workspace import`), farm stop (`farm stop`), trust config update
//     (`workspace update`). farm start / tick-now spawn `farm start` DETACHED
//     (long-lived daemon; stdio to a log file under .ralphy/farm/).
//   • READS (and the one verb-less mutation) are thin hand-copies over the
//     same on-disk state: farm status (pidfile + runs/*/farm-state.json +
//     run-events.jsonl), trust status (workspace.json `trust` +
//     trust-agreement.jsonl + trust-audit.jsonl), calendar (calendar.json),
//     workflow graphs (workflows/*.json). recordTrustDecision has NO CLI verb
//     yet (cli/lib/trust.ts exports it but only `ralphy run approve` embeds
//     it) — re-implemented here; a `ralphy workspace trust-decision` verb
//     would let this delegate.
//
// MEDIA SAFETY (AGENTS.md invariant #14): nothing here deletes, moves, or
// overwrites media. Imports CREATE a new workspace (the CLI refuses slug
// collisions); farm controls touch the pidfile + log files; trust writes are
// workspace.json (engine state) + append-only jsonl; everything else reads.

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { workspaceDir, projectDir } from "./lib.js";

// ─── CLI shell-out plumbing ──────────────────────────────────────────────────

/** Repo root (studio/server/ → repo) and the CLI entrypoint. */
const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const CLI_ENTRY = path.join(REPO_ROOT, "cli", "index.ts");

/** The dir that CONTAINS `.ralphy/` — the cwd every CLI spawn resolves from. */
function rootDirOf(dataRoot: string): string {
  return path.dirname(dataRoot);
}

export interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
  /** stdout parsed as JSON when it is one (the CLI's non-TTY `out()` shape). */
  json: unknown | null;
}

/** Env for CLI spawns: force plain JSON output, kill inherited color forcing. */
function cliEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  return env;
}

/** Run one ralphy verb synchronously against this data root's CLI. `--cwd`
 *  pins the CLI's root resolution to OUR data root (no auto-detection drift). */
export function runCli(dataRoot: string, args: string[]): CliResult {
  const r = spawnSync(process.execPath, [CLI_ENTRY, "--cwd", rootDirOf(dataRoot), ...args], {
    cwd: rootDirOf(dataRoot),
    encoding: "utf8",
    env: cliEnv(),
    timeout: 120_000,
  });
  const stdout = r.stdout ?? "";
  let json: unknown | null = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    /* non-JSON stdout (pretty ok() lines, empty) */
  }
  return { status: r.status ?? 1, stdout, stderr: r.stderr ?? "", json };
}

// ─── Farm daemon (#503 pidfile + state files, hand-copied read side) ─────────

/** `.ralphy/farm/<ws>.pid` — mirrors cli/lib/farm/runner.ts farmPidPath(). */
export function farmPidPath(dataRoot: string, ws: string): string {
  return path.join(dataRoot, "farm", `${ws}.pid`);
}

/** `.ralphy/farm/<ws>.log` — where a dashboard-launched daemon's stdio lands. */
export function farmLogPath(dataRoot: string, ws: string): string {
  return path.join(dataRoot, "farm", `${ws}.log`);
}

export function readFarmPid(dataRoot: string, ws: string): number | null {
  try {
    const n = Number(fs.readFileSync(farmPidPath(dataRoot, ws), "utf8").trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function isFarmAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

type FarmRunStatus = "running" | "parked-approval" | "halted-budget" | "halted-failure" | "complete";

const FARM_RUN_STATUSES: FarmRunStatus[] = [
  "running",
  "parked-approval",
  "halted-budget",
  "halted-failure",
  "complete",
];

/** Journal fold — a hand-copy of runner.ts readJournal (completed wins, started/failed re-run). */
function foldJournal(runDir: string): { completed: number; skipped: number; spendUsd: number } {
  const nodes = new Map<string, "completed" | "skipped">();
  let spendUsd = 0;
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(path.join(runDir, "run-events.jsonl"), "utf8").split("\n").filter(Boolean);
  } catch {
    return { completed: 0, skipped: 0, spendUsd: 0 };
  }
  for (const line of lines) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // torn final line
    }
    if (typeof e.costUsd === "number") spendUsd += e.costUsd;
    const node = typeof e.node === "string" ? e.node : null;
    if (!node) continue;
    if (e.kind === "node-completed") nodes.set(node, "completed");
    else if (e.kind === "node-skipped") nodes.set(node, "skipped");
    else if ((e.kind === "node-started" || e.kind === "node-failed") && nodes.get(node) !== "completed")
      nodes.delete(node);
    else if (e.kind === "node-invalidated") nodes.delete(node); // #519 targeted retry
  }
  let completed = 0;
  let skipped = 0;
  for (const s of nodes.values()) (s === "completed" ? completed++ : skipped++);
  return { completed, skipped, spendUsd: Number(spendUsd.toFixed(6)) };
}

/**
 * Unresolved dead-letter quarantine count per run (#519) — a read-only fold
 * of `<workspace>/farm/dead-letter.jsonl` (a "resolved" line clears every
 * prior entry for the same run + node). Mirrors cli/lib/farm/dead-letter.ts.
 */
function quarantineCounts(dataRoot: string, ws: string): Map<string, number> {
  const counts = new Map<string, number>();
  let lines: string[] = [];
  try {
    lines = fs
      .readFileSync(path.join(workspaceDir(dataRoot, ws), "farm", "dead-letter.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean);
  } catch {
    return counts;
  }
  const entries: Array<{ run: string; node: string; resolved: boolean }> = [];
  for (const line of lines) {
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue; // torn final line
    }
    if (typeof e.run !== "string" || typeof e.node !== "string") continue;
    if (e.kind === "quarantined") entries.push({ run: e.run, node: e.node, resolved: false });
    else if (e.kind === "resolved") {
      for (const q of entries) if (!q.resolved && q.run === e.run && q.node === e.node) q.resolved = true;
    }
  }
  for (const q of entries) {
    if (!q.resolved) counts.set(q.run, (counts.get(q.run) ?? 0) + 1);
  }
  return counts;
}

/** Node count of a workspace graph workflow (null when missing / not a graph). */
function graphNodeCount(dataRoot: string, ws: string, name: string): number | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(workspaceDir(dataRoot, ws), "workflows", `${name}.json`), "utf-8"),
    );
    return Array.isArray(raw?.nodes) ? raw.nodes.length : null;
  } catch {
    return null;
  }
}

export interface FarmStatusView {
  workspace: string;
  daemon: { running: boolean; pid: number | null; pidFile: string; log: string };
  counts: Record<FarmRunStatus, number>;
  runs: Array<{
    id: string;
    workflow: string;
    status: FarmRunStatus;
    completedNodes: number;
    skippedNodes: number;
    totalNodes: number | null;
    spendUsd: number;
    /** #519: unresolved dead-letter quarantine entries for this run. */
    quarantined: number;
    updatedAt: string;
    detail: string | null;
  }>;
}

/**
 * READ-ONLY farm status roll-up — mirrors `ralphy farm status` (runner.ts
 * farmStatus) minus its stale-pidfile cleanup: a GET never writes, a dead
 * pid simply reports running:false.
 */
export function farmStatusView(dataRoot: string, ws: string): FarmStatusView {
  const pid = readFarmPid(dataRoot, ws);
  const running = isFarmAlive(pid);
  const counts = Object.fromEntries(FARM_RUN_STATUSES.map((s) => [s, 0])) as Record<FarmRunStatus, number>;
  const quarantined = quarantineCounts(dataRoot, ws);
  const runs: FarmStatusView["runs"] = [];
  const runsDir = path.join(workspaceDir(dataRoot, ws), "runs");
  let ids: string[] = [];
  try {
    ids = fs
      .readdirSync(runsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    /* no runs yet */
  }
  for (const id of ids) {
    let state: { workflow?: unknown; status?: unknown; updatedAt?: unknown; detail?: unknown };
    try {
      state = JSON.parse(fs.readFileSync(path.join(runsDir, id, "farm-state.json"), "utf8"));
    } catch {
      continue; // not a farm run
    }
    const status = FARM_RUN_STATUSES.includes(state.status as FarmRunStatus)
      ? (state.status as FarmRunStatus)
      : "running";
    counts[status]++;
    const j = foldJournal(path.join(runsDir, id));
    const workflow = typeof state.workflow === "string" ? state.workflow : "";
    runs.push({
      id,
      workflow,
      status,
      completedNodes: j.completed,
      skippedNodes: j.skipped,
      totalNodes: workflow ? graphNodeCount(dataRoot, ws, workflow) : null,
      spendUsd: j.spendUsd,
      quarantined: quarantined.get(id) ?? 0,
      updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : "",
      detail: typeof state.detail === "string" ? state.detail : null,
    });
  }
  return {
    workspace: ws,
    daemon: { running, pid: running ? pid : null, pidFile: farmPidPath(dataRoot, ws), log: farmLogPath(dataRoot, ws) },
    counts,
    runs,
  };
}

// ─── Farm metrics report (#518, read-only hand-copy of cli/lib/farm/rollup.ts) ─

// Publish node types (mirrors PUBLISH_NODE_TYPES in cli/lib/schemas/workflow.ts).
const PUBLISH_NODE_TYPES = new Set(["publish", "youtube-upload", "x-post", "analytics-pull"]);

/** Per-node-id → its type across the workspace's graph workflows. */
function nodeTypesOf(dataRoot: string, ws: string): Map<string, string> {
  const types = new Map<string, string>();
  const dir = path.join(workspaceDir(dataRoot, ws), "workflows");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return types;
  }
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      if (!Array.isArray(raw?.nodes)) continue; // linear (#478) — not a graph
      for (const n of raw.nodes) {
        if (n && typeof n.id === "string" && typeof n.type === "string" && !types.has(n.id)) {
          types.set(n.id, n.type);
        }
      }
    } catch {
      /* malformed workflow — skip */
    }
  }
  return types;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

export interface FarmReportView {
  workspace: string;
  since: string | null;
  runsIncluded: string[];
  totals: {
    ticks: number;
    runs: number;
    unitsProduced: number;
    unitsGated: number;
    unitsPublished: number;
    spendUsd: number;
    cacheHits: number;
    cacheSavedUsd: number;
  };
  spendPerUnit: number | null;
  spendPerTick: number | null;
  rates: {
    nodeExecutions: number;
    nodeFailures: number;
    nodeReroutes: number;
    nodeQuarantines: number;
    nodeCacheHits: number;
    failureRate: number;
    rerouteRate: number;
    cacheHitRate: number;
  };
  durations: {
    medianNodeMs: number | null;
    nodeDurationSamples: number;
    medianApprovalLatencyMs: number | null;
    approvalLatencySamples: number;
  };
  partial: boolean;
}

/**
 * READ-ONLY farm metrics roll-up — a hand-copy of cli/lib/farm/rollup.ts
 * buildFarmReport (studio/ never imports cli/). Same fold, same graceful
 * degrade (torn lines skipped, missing workflow → unclassified + partial).
 */
export function farmReportView(
  dataRoot: string,
  ws: string,
  opts: { since?: string } = {},
): FarmReportView | null {
  if (!fs.existsSync(workspaceDir(dataRoot, ws))) return null;
  const sinceMs = opts.since && !Number.isNaN(Date.parse(opts.since)) ? Date.parse(opts.since) : null;
  const inWindow = (ts: unknown): boolean => {
    if (sinceMs === null) return true;
    if (typeof ts !== "string") return true;
    const t = Date.parse(ts);
    return Number.isNaN(t) || t >= sinceMs;
  };
  const types = nodeTypesOf(dataRoot, ws);

  const runsDir = path.join(workspaceDir(dataRoot, ws), "runs");
  let runIds: string[] = [];
  try {
    runIds = fs.readdirSync(runsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    /* no runs yet */
  }

  const totals = { ticks: 0, runs: 0, unitsProduced: 0, unitsGated: 0, unitsPublished: 0, spendUsd: 0, cacheHits: 0, cacheSavedUsd: 0 };
  const rates = { nodeExecutions: 0, nodeFailures: 0, nodeReroutes: 0, nodeQuarantines: 0, nodeCacheHits: 0, failureRate: 0, rerouteRate: 0, cacheHitRate: 0 };
  const nodeDurations: number[] = [];
  const approvalLatencies: number[] = [];
  const runsIncluded: string[] = [];
  let partial = false;
  let completions = 0;

  for (const runId of runIds) {
    let events: Array<Record<string, unknown>> = [];
    try {
      events = fs
        .readFileSync(path.join(runsDir, runId, "run-events.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as Record<string, unknown>];
          } catch {
            return [];
          }
        });
    } catch {
      continue;
    }
    if (events.length === 0) continue;
    const runHasTypes = events.some((e) => typeof e.node === "string" && types.has(e.node));
    const startedAt = new Map<string, string>();
    let contributed = false;

    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (!inWindow(e.ts)) continue;
      contributed = true;
      if (typeof e.costUsd === "number") totals.spendUsd += e.costUsd;
      const node = typeof e.node === "string" ? e.node : null;
      const ts = typeof e.ts === "string" ? e.ts : null;

      if (e.kind === "farm-tick") totals.ticks++;
      else if (e.kind === "node-started" && node && ts) startedAt.set(node, ts);
      else if (e.kind === "node-completed" && node) {
        completions++;
        const startTs = startedAt.get(node);
        if (startTs && ts) {
          const d = Date.parse(ts) - Date.parse(startTs);
          if (Number.isFinite(d) && d >= 0) nodeDurations.push(d);
        }
        rates.nodeExecutions++;
        const t = types.get(node);
        if (t === "ralphy-unit") totals.unitsProduced++;
        else if (t === "approval") totals.unitsGated++;
        else if (t && PUBLISH_NODE_TYPES.has(t)) totals.unitsPublished++;
      } else if (e.kind === "node-cached") {
        totals.cacheHits++;
        rates.nodeCacheHits++;
        if (typeof e.costSavedUsd === "number") totals.cacheSavedUsd += e.costSavedUsd;
      } else if (e.kind === "node-failed") {
        rates.nodeFailures++;
        rates.nodeExecutions++;
      } else if (e.kind === "node-routed") rates.nodeReroutes++;
      else if (e.kind === "node-quarantined") {
        rates.nodeQuarantines++;
        rates.nodeExecutions++;
      } else if (e.kind === "run-parked" && ts) {
        const next = events.slice(i + 1).find((n) => typeof n.ts === "string");
        if (next && typeof next.ts === "string") {
          const d = Date.parse(next.ts) - Date.parse(ts);
          if (Number.isFinite(d) && d >= 0) approvalLatencies.push(d);
        }
      }
    }
    if (contributed) {
      runsIncluded.push(runId);
      totals.runs++;
      if (!runHasTypes) partial = true;
    }
  }

  totals.spendUsd = Number(totals.spendUsd.toFixed(6));
  totals.cacheSavedUsd = Number(totals.cacheSavedUsd.toFixed(6));
  const cacheDenom = completions + rates.nodeCacheHits;
  rates.failureRate = rates.nodeExecutions ? Number((rates.nodeFailures / rates.nodeExecutions).toFixed(4)) : 0;
  rates.rerouteRate = rates.nodeExecutions ? Number((rates.nodeReroutes / rates.nodeExecutions).toFixed(4)) : 0;
  rates.cacheHitRate = cacheDenom ? Number((rates.nodeCacheHits / cacheDenom).toFixed(4)) : 0;

  return {
    workspace: ws,
    since: opts.since ?? null,
    runsIncluded,
    totals,
    spendPerUnit: totals.unitsProduced > 0 ? Number((totals.spendUsd / totals.unitsProduced).toFixed(4)) : null,
    spendPerTick: totals.ticks > 0 ? Number((totals.spendUsd / totals.ticks).toFixed(4)) : null,
    rates,
    durations: {
      medianNodeMs: median(nodeDurations),
      nodeDurationSamples: nodeDurations.length,
      medianApprovalLatencyMs: median(approvalLatencies),
      approvalLatencySamples: approvalLatencies.length,
    },
    partial,
  };
}

export interface FarmSpawn {
  started: boolean;
  pid: number | null;
  log: string;
  command: string[];
}

/**
 * Spawn `ralphy farm start` as a DETACHED child (stdio → .ralphy/farm/<ws>.log,
 * append) and return its pid. Refuses when the workspace pidfile names a live
 * process — the CLI would refuse too; this is the fast, clean 409. tickNow
 * adds `--once --tick-now` (one immediate tick, then exit).
 */
export function startFarm(
  dataRoot: string,
  ws: string,
  opts: { tickNow?: boolean } = {},
): FarmSpawn | { error: string } {
  const existing = readFarmPid(dataRoot, ws);
  if (isFarmAlive(existing)) {
    return { error: `a farm process for workspace "${ws}" is already running (pid ${existing}) — stop it first` };
  }
  const log = farmLogPath(dataRoot, ws);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const args = ["farm", "start", "--workspace", ws, ...(opts.tickNow ? ["--once", "--tick-now"] : [])];
  const fd = fs.openSync(log, "a");
  try {
    const child = spawn(process.execPath, [CLI_ENTRY, "--cwd", rootDirOf(dataRoot), ...args], {
      cwd: rootDirOf(dataRoot),
      detached: true,
      stdio: ["ignore", fd, fd],
      env: cliEnv(),
    });
    child.unref();
    return { started: true, pid: child.pid ?? null, log, command: ["ralphy", ...args] };
  } finally {
    fs.closeSync(fd);
  }
}

// ─── Workflow simulate (#516 via `ralphy workflow simulate`) ─────────────────

export interface SimulateViewOptions {
  workflow?: string;
  ticks?: number;
  week?: boolean;
  assumeItems?: number;
}

/**
 * Relay `ralphy workflow simulate` (#516) — the CLI is the engine (synthetic
 * executors over the real runner in an ephemeral scratch root), so this is a
 * shell-out, not a hand-copy. GET-safe: the verb is read-only over the
 * workspace. A blocking finding exits the CLI non-zero but STILL prints the
 * full JSON report — relay it as 200 and let the client read `ok`/`blocking`.
 */
export function simulateWorkflowView(
  dataRoot: string,
  ws: string,
  opts: SimulateViewOptions = {},
): { status: number; body: unknown } {
  if (!fs.existsSync(workspaceDir(dataRoot, ws))) {
    return { status: 404, body: { error: "unknown workspace" } };
  }
  const args = ["workflow", "simulate", ws];
  if (opts.workflow) args.push(opts.workflow);
  if (opts.week) args.push("--week");
  else if (opts.ticks && Number.isInteger(opts.ticks) && opts.ticks >= 1) args.push("--ticks", String(opts.ticks));
  if (opts.assumeItems && Number.isInteger(opts.assumeItems) && opts.assumeItems >= 1) {
    args.push("--assume-items", String(opts.assumeItems));
  }
  const r = runCli(dataRoot, args);
  if (r.json && typeof r.json === "object") return { status: 200, body: r.json };
  return { status: 400, body: { error: r.stderr.trim() || `workflow simulate exited ${r.status}` } };
}

/** `ralphy farm stop --workspace <ws>` — SIGTERM via the pidfile, relayed verbatim. */
export function stopFarm(dataRoot: string, ws: string): unknown | { error: string } {
  const r = runCli(dataRoot, ["farm", "stop", "--workspace", ws]);
  if (r.status !== 0) return { error: r.stderr.trim() || `farm stop exited ${r.status}` };
  return r.json ?? { workspace: ws, stopped: false };
}

// ─── Bundle import (#502 via `ralphy workspace import`) ──────────────────────

export interface ImportOutcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

/**
 * Import an uploaded bundle zip: bytes → temp file → `ralphy workspace
 * import <zip> [--as] [--allow-missing-keys] [--allow-coverage-gaps]`.
 * Validation refusals come back VERBATIM (the CLI prints the structured
 * `{ imported: false, refusals }` list on stdout before its error exit).
 * Creates a NEW workspace only — the CLI refuses slug collisions.
 */
export function importBundle(
  dataRoot: string,
  zipBytes: Uint8Array,
  opts: { as?: string; allowMissingKeys?: boolean; allowCoverageGaps?: boolean } = {},
): ImportOutcome {
  if (zipBytes.byteLength === 0) {
    return { ok: false, status: 400, body: { imported: false, error: "empty body — POST the bundle zip bytes" } };
  }
  if (opts.as && !/^[a-z0-9][a-z0-9-]*$/.test(opts.as)) {
    return { ok: false, status: 400, body: { imported: false, error: `'${opts.as}' is not a valid workspace slug` } };
  }
  const tmpZip = path.join(os.tmpdir(), `studio-bundle-${crypto.randomBytes(6).toString("hex")}.zip`);
  fs.writeFileSync(tmpZip, zipBytes);
  try {
    const args = ["workspace", "import", tmpZip];
    if (opts.as) args.push("--as", opts.as);
    if (opts.allowMissingKeys) args.push("--allow-missing-keys");
    if (opts.allowCoverageGaps) args.push("--allow-coverage-gaps");
    const r = runCli(dataRoot, args);
    if (r.status === 0 && r.json && typeof r.json === "object") {
      return { ok: true, status: 200, body: { imported: true, ...(r.json as Record<string, unknown>) } };
    }
    const refusals =
      r.json && typeof r.json === "object" && Array.isArray((r.json as Record<string, unknown>).refusals)
        ? ((r.json as Record<string, unknown>).refusals as unknown[])
        : [];
    return {
      ok: false,
      status: 400,
      body: { imported: false, refusals, error: r.stderr.trim() || "bundle import refused" },
    };
  } finally {
    fs.rmSync(tmpZip, { force: true });
  }
}

// ─── Bundle upgrade (#521 via `ralphy workspace upgrade`) ────────────────────

/**
 * Upgrade a deployed workspace from an uploaded bundle zip: bytes → temp file →
 * `ralphy workspace upgrade <ws> <zip> [--dry-run|--yes] [--allow-*]`. Refusals
 * (lineage mismatch, version regression, active run, validation) come back
 * VERBATIM from the CLI's structured `{ applied: false, refusals }` payload.
 * Default is a DRY-RUN diff; pass `apply: true` to actually apply.
 */
export function upgradeBundle(
  dataRoot: string,
  ws: string,
  zipBytes: Uint8Array,
  opts: { apply?: boolean; allowUnknownLineage?: boolean; allowMissingKeys?: boolean; allowCoverageGaps?: boolean } = {},
): ImportOutcome {
  if (!fs.existsSync(workspaceDir(dataRoot, ws))) {
    return { ok: false, status: 404, body: { applied: false, error: "unknown workspace" } };
  }
  if (zipBytes.byteLength === 0) {
    return { ok: false, status: 400, body: { applied: false, error: "empty body — POST the bundle zip bytes" } };
  }
  const tmpZip = path.join(os.tmpdir(), `studio-upgrade-${crypto.randomBytes(6).toString("hex")}.zip`);
  fs.writeFileSync(tmpZip, zipBytes);
  try {
    const args = ["workspace", "upgrade", ws, tmpZip];
    args.push(opts.apply ? "--yes" : "--dry-run");
    if (opts.allowUnknownLineage) args.push("--allow-unknown-lineage");
    if (opts.allowMissingKeys) args.push("--allow-missing-keys");
    if (opts.allowCoverageGaps) args.push("--allow-coverage-gaps");
    const r = runCli(dataRoot, args);
    if (r.status === 0 && r.json && typeof r.json === "object") {
      return { ok: true, status: 200, body: r.json as Record<string, unknown> };
    }
    const refusals =
      r.json && typeof r.json === "object" && Array.isArray((r.json as Record<string, unknown>).refusals)
        ? ((r.json as Record<string, unknown>).refusals as unknown[])
        : [];
    return {
      ok: false,
      status: 400,
      body: { applied: false, refusals, error: r.stderr.trim() || "bundle upgrade refused" },
    };
  } finally {
    fs.rmSync(tmpZip, { force: true });
  }
}

// ─── Trust ladder (#505) ─────────────────────────────────────────────────────

const TRUST_LEVELS = ["L0", "L1", "L2"] as const;
type TrustLevel = (typeof TRUST_LEVELS)[number];

interface TrustConfigView {
  level: TrustLevel;
  autoPublishScore: number;
  promotionStreak: number;
  demoteOnReject: boolean;
}

/** Promotion bar — mirrors cli/lib/trust.ts PROMOTION_AGREEMENT_RATE. */
const PROMOTION_AGREEMENT_RATE = 0.9;

function readManifest(dataRoot: string, ws: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(workspaceDir(dataRoot, ws), "workspace.json"), "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Defaulted trust config — malformed values degrade like TrustConfigSchema's `.catch`. */
function readTrustConfigView(dataRoot: string, ws: string): TrustConfigView {
  const t = (readManifest(dataRoot, ws).trust ?? {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number, dflt: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : dflt;
  return {
    level: (TRUST_LEVELS as readonly string[]).includes(t.level as string) ? (t.level as TrustLevel) : "L0",
    autoPublishScore: num(t.autoPublishScore, 0, 100, 80),
    promotionStreak: Number.isInteger(t.promotionStreak) && (t.promotionStreak as number) >= 1 ? (t.promotionStreak as number) : 10,
    demoteOnReject: typeof t.demoteOnReject === "boolean" ? t.demoteOnReject : true,
  };
}

function readJsonl(file: string): Array<Record<string, unknown>> {
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* torn final line */
    }
  }
  return out;
}

export interface TrustStatusView extends TrustConfigView {
  workspace: string;
  agreement: { samples: number; matches: number; rate: number | null; streak: number };
  promotion: { suggested: boolean; nextLevel: TrustLevel | null; rule: string };
  autoPasses: number;
}

/** READ-ONLY hand-copy of `ralphy workspace trust` (cli/lib/trust.ts trustStatus). */
export function trustStatusView(dataRoot: string, ws: string): TrustStatusView | null {
  if (!fs.existsSync(workspaceDir(dataRoot, ws))) return null;
  const config = readTrustConfigView(dataRoot, ws);
  const wsDir = workspaceDir(dataRoot, ws);
  const samples = readJsonl(path.join(wsDir, "trust-agreement.jsonl"));
  const matches = samples.filter((s) => s.match === true).length;
  let streak = 0;
  for (let i = samples.length - 1; i >= 0 && samples[i].match === true; i--) streak++;
  const agreement = {
    samples: samples.length,
    matches,
    rate: samples.length === 0 ? null : Number((matches / samples.length).toFixed(4)),
    streak,
  };
  const nextLevel: TrustLevel | null = config.level === "L0" ? "L1" : config.level === "L1" ? "L2" : null;
  const suggested =
    nextLevel !== null &&
    streak >= config.promotionStreak &&
    agreement.rate !== null &&
    agreement.rate >= PROMOTION_AGREEMENT_RATE;
  const audit = readJsonl(path.join(wsDir, "trust-audit.jsonl"));
  return {
    workspace: ws,
    ...config,
    agreement,
    promotion: {
      suggested,
      nextLevel,
      rule: `promotion is suggested when the streak reaches ${config.promotionStreak} (current: ${streak}) AND the agreement rate is >= ${PROMOTION_AGREEMENT_RATE} (current: ${agreement.rate ?? "n/a"}). Promotion is ALWAYS explicit: ralphy workspace update ${ws} --trust-level ${nextLevel ?? "L2"}`,
    },
    autoPasses: audit.filter((e) => e.kind === "auto-pass").length,
  };
}

/**
 * Update the trust config through `ralphy workspace update <ws> --trust-*` —
 * the CLI owns validation (its refusal detail relays as the error).
 */
export function updateTrustConfig(
  dataRoot: string,
  ws: string,
  patch: { level?: unknown; autoPublishScore?: unknown; promotionStreak?: unknown; demoteOnReject?: unknown },
): { status: number; body: Record<string, unknown> } {
  const args = ["workspace", "update", ws];
  if (patch.level !== undefined) args.push("--trust-level", String(patch.level));
  if (patch.autoPublishScore !== undefined) args.push("--auto-publish-score", String(patch.autoPublishScore));
  if (patch.promotionStreak !== undefined) args.push("--promotion-streak", String(patch.promotionStreak));
  if (patch.demoteOnReject !== undefined) args.push("--demote-on-reject", String(patch.demoteOnReject));
  if (args.length === 3) {
    return {
      status: 400,
      body: { error: "nothing to update — pass level, autoPublishScore, promotionStreak, or demoteOnReject" },
    };
  }
  const r = runCli(dataRoot, args);
  if (r.status !== 0) {
    return { status: 400, body: { error: r.stderr.trim() || `workspace update exited ${r.status}` } };
  }
  return { status: 200, body: (r.json as Record<string, unknown>) ?? { workspace: ws } };
}

export interface TrustDecisionResult {
  sample: Record<string, unknown>;
  demotion: { demoted: boolean; from: TrustLevel; to: TrustLevel; reason: string } | null;
}

/**
 * Record one approve/reject decision against a project's workspace-eval
 * verdict — the #505 dashboard hook. A hand-copy of cli/lib/trust.ts
 * recordTrustDecision (there is NO CLI verb wrapping it yet — flagged as a
 * gap): appends to trust-agreement.jsonl (+ the demotion rule: a reject of an
 * auto-published unit drops L2 → L1 when demoteOnReject, audited).
 */
export function recordTrustDecisionView(
  dataRoot: string,
  ws: string,
  input: { project: string; unitSlug?: string | null; decision: "approve" | "reject"; run?: string | null },
): TrustDecisionResult | { error: string } {
  if (input.decision !== "approve" && input.decision !== "reject") {
    return { error: "decision must be approve or reject" };
  }
  if (!input.project || !fs.existsSync(projectDir(dataRoot, ws, input.project))) {
    return { error: "unknown project" };
  }
  const wsDir = workspaceDir(dataRoot, ws);

  // The eval verdict the unit carried when the human decided (#427 vocab).
  let verdict = "unknown";
  let score: number | null = null;
  try {
    const ev = JSON.parse(
      fs.readFileSync(path.join(projectDir(dataRoot, ws, input.project), "workspace-eval.json"), "utf8"),
    );
    if (typeof ev?.overall?.verdict === "string") verdict = ev.overall.verdict;
    if (typeof ev?.overall?.score === "number") score = ev.overall.score;
  } catch {
    /* no scorecard — the sample still records, match computes against "unknown" */
  }

  const sample = {
    at: new Date().toISOString(),
    decision: input.decision,
    verdict,
    score,
    project: input.project,
    unit: input.unitSlug ?? null,
    run: input.run ?? null,
    source: "studio-dashboard",
    match: (input.decision === "approve") === (verdict === "ship"),
  };
  fs.mkdirSync(wsDir, { recursive: true });
  fs.appendFileSync(path.join(wsDir, "trust-agreement.jsonl"), JSON.stringify(sample) + "\n");

  // Demotion rule (reject of an auto-published unit).
  let demotion: TrustDecisionResult["demotion"] = null;
  if (input.decision === "reject") {
    const autoPassed = readJsonl(path.join(wsDir, "trust-audit.jsonl")).some(
      (e) =>
        e.kind === "auto-pass" &&
        e.project === input.project &&
        (input.unitSlug == null || e.unit == null || e.unit === input.unitSlug),
    );
    if (autoPassed) {
      const config = readTrustConfigView(dataRoot, ws);
      if (config.level === "L2" && config.demoteOnReject) {
        const manifest = readManifest(dataRoot, ws);
        const trust = { ...(manifest.trust as object | undefined), level: "L1" };
        fs.writeFileSync(
          path.join(wsDir, "workspace.json"),
          JSON.stringify({ slug: ws, ...manifest, trust }, null, 2) + "\n",
        );
        const reason = `human reject of auto-published ${input.project}${input.unitSlug ? `/${input.unitSlug}` : ""} — demoted L2 -> L1 (demoteOnReject)`;
        fs.appendFileSync(
          path.join(wsDir, "trust-audit.jsonl"),
          JSON.stringify({
            at: new Date().toISOString(),
            kind: "demotion",
            workspace: ws,
            level: "L1",
            surface: "studio-dashboard",
            project: input.project,
            unit: input.unitSlug ?? null,
            run: input.run ?? null,
            verdict,
            reason,
          }) + "\n",
        );
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
  }
  return { sample, demotion };
}

// ─── Calendar (#504, read-only) ──────────────────────────────────────────────

/** The workspace calendar document (slots + entries), defaulted; null = unknown workspace. */
export function readCalendarView(
  dataRoot: string,
  ws: string,
): { workspace: string; version: string; slots: unknown[]; entries: unknown[] } | null {
  if (!fs.existsSync(workspaceDir(dataRoot, ws))) return null;
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(fs.readFileSync(path.join(workspaceDir(dataRoot, ws), "calendar.json"), "utf8"));
  } catch {
    /* no calendar yet — empty document */
  }
  return {
    workspace: ws,
    version: typeof raw.version === "string" ? raw.version : "1.0",
    slots: Array.isArray(raw.slots) ? raw.slots : [],
    entries: Array.isArray(raw.entries) ? raw.entries : [],
  };
}

// ─── Workflow graphs (#498 spec → #490 canvas shape, read-only) ──────────────

/** `artifact:<path>` or any path containing "/" — mirrors workflow-graph.ts isArtifactRef. */
function isArtifactRef(value: string): boolean {
  return value.startsWith("artifact:") || value.includes("/");
}

const IN_REF_RE = /^([a-z0-9][a-z0-9-]*)\.[A-Za-z0-9][A-Za-z0-9_-]*$/;

export interface WorkflowListRow {
  name: string;
  kind: "graph" | "linear" | "unknown";
  nodes: number;
  steps: number;
}

/** List a workspace's workflows/*.json with their shape. Null = unknown workspace. */
export function listWorkspaceWorkflows(dataRoot: string, ws: string): WorkflowListRow[] | null {
  if (!fs.existsSync(workspaceDir(dataRoot, ws))) return null;
  const dir = path.join(workspaceDir(dataRoot, ws), "workflows");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const rows: WorkflowListRow[] = [];
  for (const f of files) {
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    } catch {
      rows.push({ name: f.replace(/\.json$/, ""), kind: "unknown", nodes: 0, steps: 0 });
      continue;
    }
    const nodes = Array.isArray(raw.nodes) ? raw.nodes.length : 0;
    const steps = Array.isArray(raw.steps) ? raw.steps.length : 0;
    rows.push({
      name: f.replace(/\.json$/, ""),
      kind: Array.isArray(raw.nodes) ? "graph" : Array.isArray(raw.steps) ? "linear" : "unknown",
      nodes,
      steps,
    });
  }
  return rows;
}

export type WorkflowGraphView = {
  workspace: string;
  workflow: string;
  kind: "graph";
  nodes: Array<{ id: string; type: string; label: string; layer: number; detail?: string }>;
  edges: Array<{ from: string; to: string }>;
  issues: Array<{ level: "error" | "warning"; message: string }>;
  /** Saved node positions (none persisted for the spec view yet — client auto-layouts). */
  layout: Record<string, { x: number; y: number }>;
} | null;

/**
 * Parse a #498 graph workflow into the #490 canvas conventions (nodes with
 * id/type/label/layer + {from,to} edges + a layout record, mirroring
 * buildRunGraph's output shape so the client reuses its rendering). Edges are
 * derived from the in-ports (`<producer>.<out>` refs); `layer` is the
 * longest-path depth. This is a LIGHT read — the authoritative lint is
 * `ralphy workflow lint`; `issues` only carries what the shaping itself hits
 * (duplicate ids, unknown producers, a cycle).
 */
export function workflowGraphView(dataRoot: string, ws: string, name: string): WorkflowGraphView {
  const file = path.join(workspaceDir(dataRoot, ws), "workflows", `${name}.json`);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
  if (!Array.isArray(raw.nodes)) return null; // linear (#478) — not a graph

  const issues: NonNullable<WorkflowGraphView>["issues"] = [];
  const nodesRaw = raw.nodes.filter((n): n is Record<string, unknown> => !!n && typeof n === "object");
  const ids = new Set<string>();
  for (const n of nodesRaw) {
    const id = String(n.id ?? "");
    if (ids.has(id)) issues.push({ level: "error", message: `duplicate node id "${id}"` });
    ids.add(id);
  }

  const edges: Array<{ from: string; to: string }> = [];
  for (const n of nodesRaw) {
    const id = String(n.id ?? "");
    const inPorts = n.in && typeof n.in === "object" ? (n.in as Record<string, unknown>) : {};
    for (const [port, refRaw] of Object.entries(inPorts)) {
      const ref = String(refRaw ?? "");
      if (isArtifactRef(ref)) continue;
      const m = IN_REF_RE.exec(ref);
      const producer = m ? m[1] : null;
      if (!producer || !ids.has(producer)) {
        issues.push({ level: "warning", message: `node "${id}" port "${port}": unknown producer ref "${ref}"` });
        continue;
      }
      if (producer !== id) edges.push({ from: producer, to: id });
    }
  }

  // Longest-path layer (Kahn). Cycle → remaining nodes land at layer 0 + issue.
  const layer = new Map<string, number>();
  const indeg = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const id of ids) indeg.set(id, 0);
  for (const e of edges) {
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  const queue = [...ids].filter((id) => (indeg.get(id) ?? 0) === 0);
  for (const id of queue) layer.set(id, 0);
  let visited = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    visited++;
    for (const next of out.get(id) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, (layer.get(id) ?? 0) + 1));
      const d = (indeg.get(next) ?? 0) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (visited < ids.size) {
    issues.push({ level: "error", message: "graph has a cycle — run `ralphy workflow lint` for the full report" });
  }

  return {
    workspace: ws,
    workflow: typeof raw.name === "string" && raw.name ? raw.name : name,
    kind: "graph",
    nodes: nodesRaw.map((n) => {
      const id = String(n.id ?? "");
      const params = n.params && typeof n.params === "object" ? (n.params as Record<string, unknown>) : {};
      const model = typeof params.model === "string" ? params.model : undefined;
      return { id, type: String(n.type ?? ""), label: id, layer: layer.get(id) ?? 0, detail: model };
    }),
    edges,
    issues,
    layout: {},
  };
}
