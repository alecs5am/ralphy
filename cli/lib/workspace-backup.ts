// Farm state backup / restore (#540) — disaster recovery for the IRREPLACEABLE
// runtime history a deployed farm accumulates.
//
// The three-way boundary (the crux — one explicit manifest, not scattered path
// lists). Every workspace-relative path is exactly one of:
//
//   • STATE     — accumulated runtime history that is IRREPLACEABLE and NOT in
//                 the bundle: publish ledger, quota usage, calendar entries,
//                 trust level + agreement, selection weights, dedup store,
//                 node-cache, dead-letter, publish-mode audit, run journals,
//                 lifecycle. THIS is what backup archives (the STATE_PATHS set
//                 below). Losing the publish ledger reintroduces the #531
//                 double-post risk — the highest-stakes case.
//   • KNOW-HOW  — reproducible from the bundle (graphs, subgraphs, prompts,
//                 compositions, evaluators, STYLE_LOCK, reroute rules,
//                 shared/refs, calendar SLOTS). NOT the primary backup target —
//                 it lives in the bundle (bundle.ts). Documented here, not
//                 archived by default.
//   • MEDIA     — project/batch artifacts + logs (projects/, batches/, ideas/).
//                 EXCLUDED by default; `--include-media` opts in.
//
// Boundary sharing with bundle.ts: the upgrade's RUNTIME_STATE_PATHS is the
// source of truth for "what the bundle upgrade must preserve" — it legitimately
// includes MEDIA (projects/batches/ideas) because upgrade swaps the whole tree.
// The backup STATE set is a DOCUMENTED SUBSET of that (media split out to the
// MEDIA axis) PLUS the top-level ledger/quota/selection/publish-mode files that
// upgrade preserves implicitly (they sit at the ws top level, outside the
// know-how paths it touches) but that a state-only archive must name explicitly.
// bundle.ts behavior is UNCHANGED — this module only reads its const.
//
// Archive format: the same system `zip`/`unzip` as bundle.ts (#048 decision —
// zero new deps, battle-tested). READ-ONLY over the live workspace: state files
// are snapshot-COPIED into a scratch dir, THEN the scratch dir is archived. The
// live tree is never mutated and the copy is a point-in-time snapshot, so a
// concurrent append to a JSONL (a publish, a calendar event) cannot tear the
// archive — it either lands fully in the snapshot or not at all.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { workspaceDir } from "./paths.js";
import { BundleError } from "./bundle.js";
import { VERSION } from "./version.js";
import { readPublishLedger } from "./publish/ledger.js";
import { readCalendar } from "./calendar/store.js";

// ─── The three-way manifest ────────────────────────────────────────────────

/**
 * STATE — workspace-relative paths (files or dirs) carrying accumulated runtime
 * history. This is a documented subset of bundle.ts RUNTIME_STATE_PATHS (media
 * split to MEDIA below) + the top-level ledger/quota/selection/publish-mode
 * files upgrade preserves implicitly. Each entry may be absent on disk — a
 * young farm has few of them; the backup only archives what exists.
 */
export const STATE_PATHS = [
  // Publish exactly-once ledger (#531) — the highest-stakes entry.
  "publish-ledger.jsonl",
  // Rolling quota usage (#534).
  "publish-quota.jsonl",
  // Publish-mode audit (#519 review flow).
  "publish-mode-audit.jsonl",
  // Calendar dated entries live inside calendar.json alongside know-how SLOTS;
  // the append-only event log is pure state.
  "calendar.json",
  "calendar-events.jsonl",
  // Trust level + agreement history (#505).
  "trust-audit.jsonl",
  "trust-agreement.jsonl",
  // Selection weights (#532).
  "selection-weights.jsonl",
  // Dedup store (#500): seen.jsonl + cursor.json.
  "ingestion",
  // Node cache (#521 runtime state).
  "cache",
  // Farm runtime: dead-letter.jsonl, webhook-tokens.json, *.pid.
  "farm",
  // Run journals (#503).
  "runs",
  // Upgrade/rollback history (#521).
  "lifecycle.jsonl",
  // workspace.json carries the runtime `trust` block (+ bundle version pointer).
  "workspace.json",
] as const;

/** MEDIA — project/batch artifacts + logs. Excluded by default (`--include-media`). */
export const MEDIA_PATHS = ["projects", "batches", "ideas"] as const;

/**
 * KNOW-HOW — reproducible-from-the-bundle paths. Documented for completeness;
 * backup does NOT archive these (they live in the bundle). Restore never writes
 * them either — restore is STATE rehydration only.
 */
export const KNOWHOW_PATHS = [
  "workflows",
  "subgraphs",
  "prompts",
  "compositions",
  "evaluators.json",
  "STYLE_LOCK.md",
  "metrics-benchmarks.json",
  "reroute-rules.json",
  "golden",
  "shared", // shared/refs is know-how; shared/ is not runtime state
] as const;

// Extension seam — files named in the issue #540 spec that do NOT yet exist in
// code (no path helper, no writer). Enumerated here so the boundary is honest
// and a future writer knows where to slot in:
//   • analytics snapshots (#507) — no workspace-scoped analytics.jsonl writer
//     exists yet (analytics is currently project-scoped, cli/lib/analytics/).
//   • quarantine (#519) — no separate quarantine store; the review flow uses
//     publish-mode-audit.jsonl (already in STATE_PATHS above).
//   • topic-index (#541) — not built.
// When any lands as a workspace-relative store, add its path to STATE_PATHS.

// ─── Archive schema versions ────────────────────────────────────────────────

/** Backup archive schema version — bump on an incompatible manifest change. */
export const BACKUP_SCHEMA_VERSION = "1";

export interface BackupManifest {
  /** Archive schema version (BACKUP_SCHEMA_VERSION). */
  schema: string;
  /** ralphy version that produced the archive. */
  ralphyVersion: string;
  workspace: string;
  /** ISO timestamp the snapshot was taken. */
  createdAt: string;
  /** Did `--include-media` fire? */
  includeMedia: boolean;
  /** STATE (+ MEDIA) paths that actually existed and landed in the archive. */
  contents: string[];
}

const MANIFEST_ENTRY = "backup-manifest.json";

function requireBinary(bin: "zip" | "unzip"): void {
  if (!Bun.which(bin)) {
    throw new BundleError("dep-missing", `required binary not found on PATH: ${bin}`, [bin]);
  }
}

// ─── Backup ──────────────────────────────────────────────────────────────────

export interface BackupResult {
  workspace: string;
  out: string;
  manifest: BackupManifest;
  sizeBytes: number;
}

export interface BackupOptions {
  /** Include project/batch media artifacts (default false). */
  includeMedia?: boolean;
}

/**
 * Snapshot a workspace's runtime STATE into a versioned, timestamped zip.
 * READ-ONLY over the live workspace — every state path is copied into a scratch
 * dir first (point-in-time snapshot; no torn reads on a live farm), then the
 * scratch dir is archived. Never overwrites an existing outPath.
 */
export function backupWorkspace(ws: string, outPath: string, opts: BackupOptions = {}): BackupResult {
  const dir = workspaceDir(ws);
  if (!fs.existsSync(dir)) {
    throw new BundleError("not-found", `workspace not found: ${ws}`, [ws]);
  }
  requireBinary("zip");

  const out = path.resolve(outPath);
  if (fs.existsSync(out)) {
    throw new BundleError("already-exists", `backup already exists: ${out} — pass a fresh --out`, [out]);
  }

  const includeMedia = Boolean(opts.includeMedia);
  const paths = [...STATE_PATHS, ...(includeMedia ? MEDIA_PATHS : [])];

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-backup-"));
  try {
    const contents: string[] = [];
    // Snapshot-copy each existing state path into staging (read-only; the copy
    // is atomic per-file, so a concurrent JSONL append cannot tear it).
    for (const rel of paths) {
      const src = path.join(dir, rel);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(staging, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
      contents.push(rel);
    }

    const manifest: BackupManifest = {
      schema: BACKUP_SCHEMA_VERSION,
      ralphyVersion: VERSION,
      workspace: ws,
      createdAt: new Date().toISOString(),
      includeMedia,
      contents: contents.sort(),
    };
    fs.writeFileSync(path.join(staging, MANIFEST_ENTRY), JSON.stringify(manifest, null, 2) + "\n");

    fs.mkdirSync(path.dirname(out), { recursive: true });
    const r = spawnSync("zip", ["-r", "-q", "-X", out, "."], { cwd: staging, encoding: "utf8" });
    if (r.status !== 0) {
      throw new BundleError("invalid", `zip failed (status ${r.status}): ${r.stderr || r.stdout}`);
    }

    return { workspace: ws, out, manifest, sizeBytes: fs.statSync(out).size };
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

// ─── Restore ──────────────────────────────────────────────────────────────────

export interface RestoreResult {
  workspace: string;
  path: string;
  manifest: BackupManifest;
  /** State paths written into the target. */
  restored: string[];
  /** Was an existing (newer) workspace state overwritten via --force? */
  forced: boolean;
  /** Post-restore integrity check (farm doctor subset). */
  integrity: RestoreIntegrity;
}

export interface RestoreIntegrity {
  ok: boolean;
  checks: Array<{ id: string; status: "ok" | "warn" | "fail"; detail: string }>;
}

export interface RestoreOptions {
  /** Restore into this workspace slug (default: the archive's workspace). */
  as?: string;
  /** Overwrite even when the target's live state is NEWER than the archive. */
  force?: boolean;
}

/** Read + parse the archive's manifest without extracting the whole zip. */
function readArchiveManifest(scratch: string): BackupManifest {
  const p = path.join(scratch, MANIFEST_ENTRY);
  if (!fs.existsSync(p)) {
    throw new BundleError("invalid", `archive has no ${MANIFEST_ENTRY} — not a ralphy backup (or too old)`);
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as Partial<BackupManifest>;
  if (raw.schema !== BACKUP_SCHEMA_VERSION) {
    throw new BundleError(
      "invalid",
      `backup schema mismatch: archive is v${raw.schema ?? "?"}, this ralphy expects v${BACKUP_SCHEMA_VERSION}`,
      [{ id: "schema-mismatch", archive: raw.schema, expected: BACKUP_SCHEMA_VERSION }],
    );
  }
  return raw as BackupManifest;
}

/** The live workspace's most-recent state mtime (0 when the ws / its state is absent). */
function liveStateMtimeMs(dir: string): number {
  let newest = 0;
  for (const rel of STATE_PATHS) {
    const src = path.join(dir, rel);
    if (!fs.existsSync(src)) continue;
    // Walk dirs; a single stat for files.
    const stack = [src];
    while (stack.length) {
      const p = stack.pop()!;
      const st = fs.statSync(p);
      if (st.mtimeMs > newest) newest = st.mtimeMs;
      if (st.isDirectory()) for (const e of fs.readdirSync(p)) stack.push(path.join(p, e));
    }
  }
  return newest;
}

/**
 * Post-restore integrity check — a `farm doctor` subset (#530): the publish
 * ledger parses and the calendar resolves. Kept deliberately tiny (no network,
 * no paid calls) so restore stays offline. Reuses the same store readers the
 * doctor uses rather than re-parsing.
 */
export function checkRestoreIntegrity(ws: string): RestoreIntegrity {
  const checks: RestoreIntegrity["checks"] = [];
  const dir = workspaceDir(ws);

  // Ledger parses (the #531 exactly-once guard must survive the round-trip).
  try {
    const rows = readPublishLedger(ws);
    checks.push({ id: "ledger-parses", status: "ok", detail: `publish ledger parses (${rows.length} row(s))` });
  } catch (e) {
    checks.push({ id: "ledger-parses", status: "fail", detail: `publish ledger unreadable: ${(e as Error).message}` });
  }

  // Calendar resolves (readCalendar tolerates a missing file → empty).
  try {
    const cal = readCalendar(dir);
    checks.push({
      id: "calendar-resolves",
      status: "ok",
      detail: `calendar resolves (${cal.slots.length} slot(s), ${cal.entries.length} entry(ies))`,
    });
  } catch (e) {
    checks.push({ id: "calendar-resolves", status: "fail", detail: `calendar unreadable: ${(e as Error).message}` });
  }

  return { ok: checks.every((c) => c.status !== "fail"), checks };
}

/**
 * Rehydrate a workspace's runtime STATE from a backup archive. Validates the
 * schema version, refuses to clobber a target whose live state is NEWER than
 * the archive without `--force` (logged via the returned `forced` flag), and
 * writes ONLY the STATE (+ MEDIA when the archive carried it) paths — never
 * know-how, never media the archive didn't include. `--as` targets a
 * different/new workspace. Post-restore runs the integrity subset.
 */
export function restoreWorkspace(archivePath: string, opts: RestoreOptions = {}): RestoreResult {
  const archive = path.resolve(archivePath);
  if (!fs.existsSync(archive)) {
    throw new BundleError("not-found", `backup archive not found: ${archive}`, [archive]);
  }
  requireBinary("unzip");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-restore-"));
  try {
    const r = spawnSync("unzip", ["-q", archive, "-d", scratch], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new BundleError("invalid", `unzip failed (status ${r.status}): ${r.stderr || r.stdout}`);
    }

    const manifest = readArchiveManifest(scratch);
    const slug = opts.as ?? manifest.workspace;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      throw new BundleError("invalid", `'${slug}' is not a valid workspace slug (lowercase kebab-case)`);
    }
    const dir = workspaceDir(slug);

    // Clobber-newer guard: if the target already has state newer than the
    // archive's snapshot, refuse without --force (a restore would lose the
    // history the farm accrued since the backup).
    const liveMtime = liveStateMtimeMs(dir);
    const archiveMtime = Date.parse(manifest.createdAt);
    const forced = Boolean(opts.force);
    if (liveMtime > archiveMtime && !forced) {
      throw new BundleError(
        "already-exists",
        `"${slug}" has state newer than the archive (live ${new Date(liveMtime).toISOString()} > archive ${manifest.createdAt}) — restore would overwrite it; pass --force to override, or --as <new-slug> to restore beside it`,
        [{ id: "clobber-newer", live: new Date(liveMtime).toISOString(), archive: manifest.createdAt }],
      );
    }

    // Materialize: copy each archived state path onto the target. Directories
    // (runs/, ingestion/, cache/, farm/) are removed first so a restore is a
    // clean rehydration, not a merge with drifted live state.
    fs.mkdirSync(dir, { recursive: true });
    const restored: string[] = [];
    for (const rel of manifest.contents) {
      if (rel === MANIFEST_ENTRY) continue;
      const src = path.join(scratch, rel);
      if (!fs.existsSync(src)) continue;
      const dest = path.join(dir, rel);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
      restored.push(rel);
    }

    const integrity = checkRestoreIntegrity(slug);
    return { workspace: slug, path: dir, manifest, restored: restored.sort(), forced, integrity };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
