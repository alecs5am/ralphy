import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { BRIDGE_PROTOCOL_VERSION } from "../bridge/protocol.js";
import { SCHEMA_VERSION } from "../store/schema.js";
import { verifyDomainStore, type DomainVerificationReport } from "../store/verify.js";
import { VERSION } from "../version.js";
import { assertMigrationMaintenanceLock } from "./inventory.js";
import type { MigrationContext, MigrationIssue } from "./types.js";

export type FrozenFileFingerprint = {
  exists: boolean;
  bytes: number;
  mtimeMs: number;
  sha256: string | null;
};

export type FreezeMigrationInput = { verificationDir: string };

export type FrozenMigration = {
  id: string;
  runId: string;
  frozenAt: number;
  database: FrozenFileFingerprint;
  wal: FrozenFileFingerprint;
  shm: FrozenFileFingerprint;
  inventoryDigests: Record<string, string>;
  contentDigest: string;
  consumers: { farm: null };
  recordPath: string;
};

export type MigrationVerification = {
  id: string;
  runId: string;
  verifiedAt: number;
  sourceEntries: number;
  coveredEntries: number;
  sourceBytes: number;
  accountedBytes: number;
  blockers: MigrationIssue[];
  databaseDigest: string;
  contentDigest: string;
  inventoryDigests: Record<string, string>;
  coreVersion: string;
  schemaVersion: number;
  contractVersion: number;
  consumers: { farm: null };
  recordPath: string;
};

type Entry = {
  id: string;
  sourceId: string;
  sourceLabel: string;
  sourcePath: string;
  sourceLocatorHash: string;
  entryKind: string;
  disposition: string;
  device: string;
  inode: string;
  mode: number;
  bytes: number;
  mtimeMs: number;
  sha256: string | null;
  targetPath: string | null;
  targetRefs: string;
  rawEvidenceObjectId: string | null;
  state: string;
  terminalAt: number | null;
};

type Activation = {
  sourceEntries: number;
  coveredEntries: number;
  sourceBytes: number;
  accountedBytes: number;
  inventoryDigests: Record<string, string>;
  blockers: MigrationIssue[];
};

const TERMINAL_STATES = new Set(["imported", "verified", "excluded", "issue"]);
const EMPTY_SHA256 = sha256("");
const FTS_TABLES = new Set([
  "document_revisions_fts",
  "document_revisions_fts_config",
  "document_revisions_fts_content",
  "document_revisions_fts_data",
  "document_revisions_fts_docsize",
  "document_revisions_fts_idx",
]);
const REF_TABLES: Readonly<Record<string, string>> = {
  ws: "workspaces", acct: "social_accounts", prj: "projects", iter: "project_iterations",
  fb: "feedback_items", fblink: "feedback_resolution_links", stage: "project_stages",
  doc: "documents", drev: "document_revisions", bind: "project_document_bindings",
  obj: "objects", art: "artifacts", arev: "artifact_revisions", rel: "artifact_relations",
  usage: "artifact_usages", comp: "compositions", crev: "composition_revisions",
  cfile: "composition_revision_files", input: "composition_inputs", build: "builds",
  output: "build_outputs", eval: "evaluations", unit: "units", urev: "unit_revisions",
  item: "unit_items", pres: "unit_presentations", caption: "presentation_caption_revisions",
  pitem: "presentation_items", pub: "publications", metric: "metric_snapshots",
  session: "agent_sessions", run: "runs",
  attempt: "run_attempts", robj: "run_objects", result: "run_results",
  mig: "migration_runs", mentry: "migration_entries", miss: "migration_issues",
  setting: "settings", brand: "brands", persona: "personas", tmpl: "workspace_templates",
  memory: "memory_entries", mrev: "memory_revisions", campaign: "campaigns",
  cell: "campaign_cells", calendar: "calendar_entries",
};

export async function freezeMigration(
  ctx: MigrationContext,
  input: FreezeMigrationInput,
): Promise<FrozenMigration> {
  assertContext(ctx);
  assertMigrationMaintenanceLock(ctx);
  const verificationDir = externalDirectory(input.verificationDir, [ctx.storeRoot, ...ctx.sourceRoots.map((source) => source.path)]);
  const recordPath = path.join(verificationDir, `migration-${ctx.runId}.freeze.json`);
  if (fs.existsSync(recordPath)) throw new Error("Migration is already frozen");
  const run = ctx.db.query<{ phase: string; frozenAt: number | null }, [string]>(
    "SELECT phase, frozen_at AS frozenAt FROM migration_runs WHERE id = ?",
  ).get(ctx.runId);
  if (!run || !new Set(["relations", "verify"]).has(run.phase) || run.frozenAt !== null) {
    throw new Error("Migration is not ready to freeze");
  }

  checkpoint(ctx.db, false);
  const activation = inspectActivation(ctx);
  appendDomainBlockers(activation.blockers, verifyDomainStore({ dataRoot: ctx.storeRoot, hashObjects: true }));
  if (activation.blockers.length > 0) throw activationError(activation.blockers);
  const beforeContent = contentDigest(ctx.db, ctx.storeRoot);
  const frozenAt = Date.now();
  ctx.db.transaction(() => {
    ctx.db.prepare("UPDATE migration_runs SET phase = 'verify', updated_at = ? WHERE id = ? AND phase = 'relations'")
      .run(frozenAt, ctx.runId);
    const updated = ctx.db.prepare(
      `UPDATE migration_runs SET phase = 'ready', frozen_at = ?, updated_at = ?
       WHERE id = ? AND phase = 'verify' AND frozen_at IS NULL RETURNING id`,
    ).get(frozenAt, frozenAt, ctx.runId) as { id: string } | null;
    if (updated?.id !== ctx.runId) throw new Error("Migration freeze did not transition exactly once");
  }).immediate();
  checkpoint(ctx.db, true);
  ctx.db.close();

  const databaseFiles = frozenDatabaseFiles(ctx.storeRoot);
  const db = openSnapshot(path.join(ctx.storeRoot, "ralphy.db"));
  let afterContent: string;
  try {
    afterContent = contentDigest(db, ctx.storeRoot);
  } finally {
    db.close();
  }
  if (afterContent !== beforeContent) throw new Error("Migration content changed during freeze");
  const body = {
    runId: ctx.runId,
    frozenAt,
    database: databaseFiles.database,
    wal: databaseFiles.wal,
    shm: databaseFiles.shm,
    inventoryDigests: activation.inventoryDigests,
    contentDigest: afterContent,
    consumers: { farm: null } as const,
  };
  const record = { id: sha256(canonical(body)), ...body };
  writePrivateJson(recordPath, record);
  return { ...record, recordPath };
}

export function verifyMigration(input: {
  storeRoot: string;
  runId: string;
  verificationDir: string;
}): MigrationVerification {
  const storeRoot = canonicalDirectory(input.storeRoot);
  if (!fs.existsSync(input.verificationDir)) throw new Error("Migration verification is unavailable until the stage is frozen");
  const verificationDir = existingExternalDirectory(input.verificationDir, [storeRoot]);
  const freezePath = path.join(verificationDir, `migration-${input.runId}.freeze.json`);
  const frozen = readFreezeRecord(freezePath, input.runId);
  const before = frozenDatabaseFiles(storeRoot);
  assertFrozenFiles(frozen, before);
  const db = openSnapshot(path.join(storeRoot, "ralphy.db"));
  let activation: Activation;
  let stageContentDigest: string;
  try {
    activation = inspectFrozenActivation(db, input.runId, storeRoot);
    const run = db.query<{ phase: string; frozenAt: number | null }, [string]>(
      "SELECT phase, frozen_at AS frozenAt FROM migration_runs WHERE id = ?",
    ).get(input.runId);
    if (!run || run.phase !== "ready" || run.frozenAt !== frozen.frozenAt) {
      activation.blockers.push(issue("MIGRATION_FREEZE_STATE", input.runId));
    }
    stageContentDigest = contentDigest(db, storeRoot);
  } finally {
    db.close();
  }
  appendDomainBlockers(activation.blockers, verifyDomainStore({ dataRoot: storeRoot, hashObjects: true }));
  if (stageContentDigest !== frozen.contentDigest) {
    activation.blockers.push(issue("MIGRATION_CONTENT_DRIFT", input.runId));
  }
  if (canonical(activation.inventoryDigests) !== canonical(frozen.inventoryDigests)) {
    activation.blockers.push(issue("MIGRATION_INVENTORY_DIGEST_DRIFT", input.runId));
  }
  const after = frozenDatabaseFiles(storeRoot);
  if (canonical(before) !== canonical(after)) {
    activation.blockers.push(issue("MIGRATION_DATABASE_MUTATED_BY_VERIFY", input.runId));
  }
  assertFrozenFiles(frozen, after);
  if (activation.blockers.length > 0) throw activationError(activation.blockers);

  const verifiedAt = Date.now();
  const databaseDigest = before.database.sha256!;
  const contentDigestValue = sha256(canonical({
    databaseDigest,
    stageContentDigest,
    inventoryDigests: activation.inventoryDigests,
    consumers: { farm: null },
  }));
  const body = {
    runId: input.runId,
    verifiedAt,
    nonce: randomUUID(),
    sourceEntries: activation.sourceEntries,
    coveredEntries: activation.coveredEntries,
    sourceBytes: activation.sourceBytes,
    accountedBytes: activation.accountedBytes,
    blockers: [] as MigrationIssue[],
    databaseDigest,
    contentDigest: contentDigestValue,
    inventoryDigests: activation.inventoryDigests,
    coreVersion: VERSION,
    schemaVersion: SCHEMA_VERSION,
    contractVersion: BRIDGE_PROTOCOL_VERSION,
    consumers: { farm: null } as const,
    freezeId: frozen.id,
  };
  const id = sha256(canonical(body));
  const recordPath = path.join(verificationDir, `migration-${input.runId}.verification-${id}.json`);
  writePrivateJson(recordPath, { id, ...body });
  return { id, ...body, recordPath };
}

function inspectActivation(ctx: MigrationContext): Activation {
  const activation = inspectFrozenActivation(ctx.db, ctx.runId, ctx.storeRoot);
  inspectSources(ctx, activation);
  return activation;
}

function inspectFrozenActivation(db: Database, runId: string, storeRoot: string): Activation {
  const run = db.query<{ entries: number; files: number; bytes: number }, [string]>(
    `SELECT source_entry_count AS entries, source_file_count AS files, source_bytes AS bytes
     FROM migration_runs WHERE id = ?`,
  ).get(runId);
  if (!run) throw new Error("Migration Run not found");
  const entries = migrationEntries(db, runId);
  const blockers: MigrationIssue[] = [];
  const inventoryDigests = Object.fromEntries(db.query<{ id: string; digest: string | null }, [string]>(
    "SELECT id, inventory_digest AS digest FROM migration_sources WHERE migration_run_id = ? ORDER BY id",
  ).all(runId).map((row) => [row.id, row.digest ?? ""]));
  for (const [sourceId, digest] of Object.entries(inventoryDigests)) {
    if (!/^[0-9a-f]{64}$/.test(digest)) blockers.push(issue("MIGRATION_INVENTORY_DIGEST_MISSING", sourceId));
  }
  if (entries.length !== run.entries || entries.filter((entry) => entry.entryKind === "file").length !== run.files) {
    blockers.push(issue("MIGRATION_ENTRY_COUNT", runId));
  }
  const sourceBytes = entries.reduce((sum, entry) => sum + (entry.entryKind === "file" ? entry.bytes : 0), 0);
  if (sourceBytes !== run.bytes) blockers.push(issue("MIGRATION_SOURCE_BYTES", runId));
  for (const entry of entries) inspectEntry(db, entry, blockers);
  inspectIssues(db, runId, blockers);
  inspectJobs(db, runId, blockers);
  inspectEntityAccounting(db, blockers);
  inspectSecretMaterializations(db, storeRoot, runId, blockers);
  inspectPlaintextRows(db, blockers);
  return {
    sourceEntries: entries.length,
    coveredEntries: entries.filter((entry) => TERMINAL_STATES.has(entry.state)).length,
    sourceBytes,
    accountedBytes: entries.filter((entry) => TERMINAL_STATES.has(entry.state)).reduce((sum, entry) => sum + (entry.entryKind === "file" ? entry.bytes : 0), 0),
    inventoryDigests,
    blockers: uniqueIssues(blockers),
  };
}

function inspectEntry(db: Database, entry: Entry, blockers: MigrationIssue[]): void {
  if (!TERMINAL_STATES.has(entry.state) || entry.terminalAt === null) {
    blockers.push(issue("MIGRATION_ENTRY_INCOMPLETE", entry.id));
  }
  if (entry.entryKind === "file" && entry.sha256 === null) blockers.push(issue("MIGRATION_ENTRY_HASH_MISSING", entry.id));
  if (entry.entryKind === "file" && entry.bytes === 0 && entry.disposition === "system" && path.posix.basename(entry.sourcePath).toLowerCase() !== ".ds_store") {
    blockers.push(issue("MIGRATION_EMPTY_UNCLASSIFIED", entry.id));
  }
  if (entry.disposition === "domain" && entry.entryKind === "file") {
    if (entry.bytes > 0 && entry.rawEvidenceObjectId === null) blockers.push(issue("MIGRATION_RAW_EVIDENCE_MISSING", entry.id));
    if (entry.bytes === 0 && (entry.sha256 !== EMPTY_SHA256 || JSON.parse(entry.targetRefs).length === 0)) {
      blockers.push(issue("MIGRATION_EMPTY_MARKER_INVALID", entry.id));
    }
  }
  if (entry.rawEvidenceObjectId !== null) {
    const object = db.query<{ sha256: string; bytes: number }, [string]>(
      "SELECT sha256, bytes FROM objects WHERE id = ?",
    ).get(entry.rawEvidenceObjectId);
    if (!object || object.sha256 !== entry.sha256 || object.bytes !== entry.bytes) {
      blockers.push(issue("MIGRATION_RAW_EVIDENCE_MISMATCH", entry.id));
    }
  }
  let refs: string[];
  try { refs = JSON.parse(entry.targetRefs) as string[]; } catch { refs = []; blockers.push(issue("MIGRATION_TARGET_REFS_INVALID", entry.id)); }
  for (const ref of refs) {
    if (ref.startsWith("provider/")) continue;
    const split = ref.indexOf("_");
    const table = REF_TABLES[ref.slice(0, split)];
    if (!table || !db.query(`SELECT id FROM ${table} WHERE id = ?`).get(ref)) {
      blockers.push(issue("MIGRATION_TARGET_REF_MISSING", entry.id, { refId: ref }));
    }
  }
  if (new Set(["object", "run-object", "decoded-object"]).has(entry.disposition) && !refs.some((ref) => ref.startsWith("obj_"))) {
    blockers.push(issue("MIGRATION_OBJECT_REF_MISSING", entry.id));
  }
  if (entry.disposition === "secret-imported") {
    const completion = db.query<{ count: number }, [string, string]>(
      `SELECT COUNT(*) AS count FROM migration_issues
       WHERE migration_run_id = (SELECT migration_run_id FROM migration_entries WHERE id = ?)
         AND code = 'MIGRATION_SECRET_IMPORTED'
         AND resolved_at IS NOT NULL
         AND json_extract(detail_json, '$.sourceLocatorHash') = ?`,
    ).get(entry.id, entry.sourceLocatorHash)?.count ?? 0;
    if (completion !== 1) blockers.push(issue("MIGRATION_SECRET_STATUS_MISSING", entry.id));
  }
}

function inspectSources(ctx: MigrationContext, activation: Activation): void {
  const entries = migrationEntries(ctx.db, ctx.runId);
  const sources = ctx.db.query<{ id: string; label: string; device: string; inode: string; mode: number }, [string]>(
    `SELECT id, source_label AS label, source_device AS device, source_inode AS inode, source_mode AS mode
     FROM migration_sources WHERE migration_run_id = ? ORDER BY id`,
  ).all(ctx.runId);
  for (const source of sources) {
    const bound = ctx.sourceRoots.find((candidate) => candidate.id === source.label);
    if (!bound) { activation.blockers.push(issue("MIGRATION_SOURCE_MISSING", source.id)); continue; }
    let actual: Map<string, fs.Stats>;
    try {
      const root = fs.realpathSync(bound.path);
      const stat = fs.lstatSync(root);
      if (String(stat.dev) !== source.device || String(stat.ino) !== source.inode || stat.mode !== source.mode) {
        activation.blockers.push(issue("MIGRATION_SOURCE_IDENTITY_DRIFT", source.id));
      }
      actual = walkSource(root);
    } catch {
      activation.blockers.push(issue("MIGRATION_SOURCE_UNREADABLE", source.id));
      continue;
    }
    const expected = entries.filter((entry) => entry.sourceId === source.id);
    if (actual.size !== expected.length) activation.blockers.push(issue("MIGRATION_SOURCE_ENTRY_DRIFT", source.id));
    for (const entry of expected) {
      const stat = actual.get(entry.sourcePath);
      if (!stat || entryKind(stat) !== entry.entryKind || String(stat.dev) !== entry.device || String(stat.ino) !== entry.inode || stat.mode !== entry.mode || stat.size !== entry.bytes || Math.trunc(stat.mtimeMs) !== entry.mtimeMs) {
        activation.blockers.push(issue("MIGRATION_SOURCE_FINGERPRINT_DRIFT", entry.id));
        continue;
      }
      if (stat.isFile() && hashFile(path.join(bound.path, ...entry.sourcePath.split("/"))) !== entry.sha256) {
        activation.blockers.push(issue("MIGRATION_SOURCE_HASH_DRIFT", entry.id));
      }
    }
  }
  activation.blockers = uniqueIssues(activation.blockers);
}

function inspectIssues(db: Database, runId: string, blockers: MigrationIssue[]): void {
  for (const row of db.query<{ id: string; entryId: string | null; code: string }, [string]>(
    `SELECT id, migration_entry_id AS entryId, code FROM migration_issues
     WHERE migration_run_id = ? AND severity = 'block' AND resolved_at IS NULL ORDER BY id`,
  ).all(runId)) blockers.push(issue(row.code, row.entryId ?? row.id));
}

function inspectJobs(db: Database, runId: string, blockers: MigrationIssue[]): void {
  const counts = db.query<{ pendingRuns: number; heldJobs: number; orphanJobs: number; jobs: number; runs: number }, [string, string, string, string]>(
    `SELECT
       (SELECT COUNT(*) FROM runs WHERE kind = 'legacy-job' AND state = 'pending'
          AND json_extract(metadata_json, '$.migrationRunId') = ?) AS pendingRuns,
       (SELECT COUNT(*) FROM jobs WHERE status = 'pending' AND migration_hold_run_id = ?) AS heldJobs,
       (SELECT COUNT(*) FROM jobs job LEFT JOIN runs run ON run.id = job.run_id
          WHERE job.kind = 'legacy' AND (run.id IS NULL OR json_extract(run.metadata_json, '$.migrationRunId') <> ?)) AS orphanJobs,
       (SELECT COUNT(*) FROM jobs WHERE kind = 'legacy') AS jobs,
       (SELECT COUNT(*) FROM runs WHERE kind = 'legacy-job'
          AND json_extract(metadata_json, '$.migrationRunId') = ?) AS runs`,
  ).get(runId, runId, runId, runId)!;
  if (counts.pendingRuns !== counts.heldJobs || counts.orphanJobs !== 0 || counts.jobs !== counts.runs) blockers.push(issue("MIGRATION_JOB_RECONCILIATION", runId));
}

function inspectEntityAccounting(db: Database, blockers: MigrationIssue[]): void {
  for (const [table, code] of [["units", "MIGRATION_UNIT_UNACCOUNTED"], ["publications", "MIGRATION_PUBLICATION_UNACCOUNTED"], ["metric_snapshots", "MIGRATION_METRIC_UNACCOUNTED"]] as const) {
    for (const row of db.query<{ id: string }, []>(
      `SELECT entity.id FROM ${table} entity
       WHERE NOT EXISTS (
         SELECT 1 FROM migration_entries entry, json_each(COALESCE(entry.target_refs_json, '[]')) ref
         WHERE ref.value = entity.id) ORDER BY entity.id`,
    ).all()) blockers.push(issue(code, row.id));
  }
}

function inspectSecretMaterializations(db: Database, storeRoot: string, runId: string, blockers: MigrationIssue[]): void {
  const imported = db.query<{ count: number }, [string]>(
    "SELECT COUNT(*) AS count FROM migration_entries WHERE migration_run_id = ? AND disposition = 'secret-imported'",
  ).get(runId)?.count ?? 0;
  if (imported > 0) {
    const envelope = path.join(storeRoot, "secrets.enc");
    try {
      const stat = fs.lstatSync(envelope);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || (stat.mode & 0o777) !== 0o600) throw new Error();
    } catch { blockers.push(issue("MIGRATION_SECRET_ENVELOPE_INVALID", runId)); }
  }
  const secretsRoot = path.join(storeRoot, "tmp");
  if (fs.existsSync(secretsRoot) && walkNames(secretsRoot).some((name) => name.split("/").includes("secrets"))) {
    blockers.push(issue("MIGRATION_SECRET_MATERIALIZATION_REMAINS", runId));
  }
}

function inspectPlaintextRows(db: Database, blockers: MigrationIssue[]): void {
  const pattern = /(?:-----BEGIN [A-Z ]+PRIVATE KEY-----|authorization["']?\s*:\s*["']?(?:bearer|basic)\s+\S+|["']?(?:api[_-]?key|token|password|secret)["']?\s*[:=]\s*["']?[^\s"'}]{4,}|\bsk-[A-Za-z0-9_-]{8,})/iu;
  for (const { name } of db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all()) {
    const columns = db.query<{ name: string; type: string }, [string]>("SELECT name, type FROM pragma_table_info(?)",).all(name)
      .filter((column) => column.type.toUpperCase() === "TEXT")
      .map((column) => column.name);
    if (columns.length === 0 || FTS_TABLES.has(name)) continue;
    for (const row of db.query<Record<string, string | number | null>, []>(`SELECT rowid AS __rowid, * FROM "${name}"`).all()) {
      for (const column of columns) {
        const value = row[column];
        if (typeof value === "string" && pattern.test(value)) {
          blockers.push(issue("MIGRATION_PLAINTEXT_SECRET", String(row.id ?? row.__rowid), { table: name, column }));
        }
      }
    }
  }
}

function appendDomainBlockers(blockers: MigrationIssue[], report: DomainVerificationReport): void {
  if (report.integrity === "ok") return;
  for (const id of report.missingObjects) blockers.push(issue("MIGRATION_OBJECT_MISSING", id));
  for (const id of report.hashMismatches) blockers.push(issue("MIGRATION_OBJECT_HASH", id));
  for (const value of report.objectFileIssues) blockers.push(issue(`MIGRATION_OBJECT_${value.reason.toUpperCase()}`, value.objectId));
  for (const value of report.runObjectIssues) blockers.push(issue(`MIGRATION_RUN_OBJECT_${value.reason.toUpperCase()}`, value.rowId));
  for (const value of report.absolutePathRows) blockers.push(issue("MIGRATION_ABSOLUTE_PATH", value.rowId));
  for (const value of report.dataUrlRows) blockers.push(issue("MIGRATION_DATA_URL", value.rowId));
  for (const value of report.invalidJsonRows) blockers.push(issue("MIGRATION_INVALID_JSON", value.rowId));
  for (const value of report.binaryPayloadRows) blockers.push(issue("MIGRATION_BINARY_PAYLOAD", value.rowId));
  for (const value of report.brokenRevisionChains) blockers.push(issue(`MIGRATION_REVISION_${value.reason.toUpperCase()}`, value.entityId));
  for (const value of report.brokenBuildChains) blockers.push(issue(`MIGRATION_BUILD_${value.reason.toUpperCase()}`, value.entityId));
  for (const value of report.brokenUnitChains) blockers.push(issue(`MIGRATION_UNIT_${value.reason.toUpperCase()}`, value.entityId));
  for (const value of report.sessionProvenanceIssues) blockers.push(issue(`MIGRATION_PROVENANCE_${value.reason.toUpperCase()}`, value.entityId));
  for (const id of report.unreferencedObjects) blockers.push(issue("MIGRATION_OBJECT_UNREFERENCED", id));
  for (const value of report.orphanedObjectPaths) blockers.push(issue("MIGRATION_OBJECT_PATH_ORPHANED", sha256(value)));
  for (const value of report.filesystemIssues) blockers.push(issue(`MIGRATION_FILESYSTEM_${value.reason.toUpperCase()}`, sha256(value.relativePath)));
  for (const value of report.foreignKeyViolations) blockers.push(issue("MIGRATION_FOREIGN_KEY", `${value.table}:${value.rowId}`));
  if (report.integrityCheck.some((value) => value !== "ok")) blockers.push(issue("MIGRATION_INTEGRITY", "database"));
  blockers.splice(0, blockers.length, ...uniqueIssues(blockers));
}

function contentDigest(db: Database, storeRoot: string): string {
  const lines: string[] = [];
  for (const row of db.query<{ id: string; bucket: string; key: string; bytes: number; sha256: string }, []>(
    "SELECT id, bucket, key, bytes, sha256 FROM objects ORDER BY id",
  ).all()) {
    const file = containedPath(storeRoot, `${row.bucket}/${row.key}`);
    const actual = fingerprint(file);
    if (!actual.exists || actual.bytes !== row.bytes || actual.sha256 !== row.sha256) throw new Error(`Object content changed: ${row.id}`);
    lines.push(`object\0${row.id}\0${row.sha256}\0${row.bytes}`);
  }
  for (const row of db.query<{ id: string; objectId: string | null; path: string; bytes: number | null; sha256: string | null; objectBytes: number | null; objectSha256: string | null }, []>(
    `SELECT run_object.id, run_object.object_id AS objectId, run_object.path,
            run_object.bytes, run_object.sha256, object.bytes AS objectBytes,
            object.sha256 AS objectSha256
     FROM run_objects run_object LEFT JOIN objects object ON object.id = run_object.object_id
     ORDER BY run_object.id`,
  ).all()) {
    if (row.objectId === null) {
      const actual = fingerprint(containedPath(storeRoot, row.path));
      if (!actual.exists || actual.bytes !== row.bytes || actual.sha256 !== row.sha256) throw new Error(`RunObject content changed: ${row.id}`);
    }
    lines.push(`run-object\0${row.id}\0${row.objectId ?? ""}\0${row.objectSha256 ?? row.sha256 ?? ""}\0${row.objectBytes ?? row.bytes ?? ""}`);
  }
  const secrets = path.join(storeRoot, "secrets.enc");
  if (fs.existsSync(secrets)) {
    const actual = fingerprint(secrets);
    lines.push(`secrets\0${actual.sha256}\0${actual.bytes}\0${fs.lstatSync(secrets).mode & 0o777}`);
  }
  return sha256(lines.join("\n"));
}

function migrationEntries(db: Database, runId: string): Entry[] {
  return db.query<Entry, [string]>(
    `SELECT entry.id, entry.migration_source_id AS sourceId, source.source_label AS sourceLabel,
            entry.source_path AS sourcePath, entry.source_locator_hash AS sourceLocatorHash,
            entry.entry_kind AS entryKind, entry.disposition, entry.source_device AS device,
            entry.source_inode AS inode, entry.source_mode AS mode, entry.bytes,
            entry.mtime_ms AS mtimeMs, entry.sha256, entry.target_path AS targetPath,
            COALESCE(entry.target_refs_json, '[]') AS targetRefs,
            entry.raw_evidence_object_id AS rawEvidenceObjectId, entry.state,
            entry.terminal_at AS terminalAt
     FROM migration_entries entry JOIN migration_sources source ON source.id = entry.migration_source_id
     WHERE entry.migration_run_id = ? ORDER BY entry.migration_source_id, entry.source_path`,
  ).all(runId);
}

function checkpoint(db: Database, truncate: boolean): void {
  const row = db.query<{ busy: number; log: number; checkpointed: number }, []>(
    `PRAGMA wal_checkpoint(${truncate ? "TRUNCATE" : "PASSIVE"})`,
  ).get();
  if (!row || row.busy !== 0 || (truncate ? row.log !== 0 || row.checkpointed !== 0 : row.log !== row.checkpointed)) {
    throw new Error("Migration WAL checkpoint is incomplete");
  }
}

function frozenDatabaseFiles(storeRoot: string) {
  const database = path.join(storeRoot, "ralphy.db");
  return { database: fingerprint(database), wal: fingerprint(`${database}-wal`), shm: fingerprint(`${database}-shm`) };
}

function fingerprint(file: string): FrozenFileFingerprint {
  try {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const before = fs.fstatSync(fd);
      if (!before.isFile()) throw new Error();
      const hash = createHash("sha256");
      const chunk = Buffer.allocUnsafe(64 * 1024);
      let bytes = 0;
      for (;;) {
        const count = fs.readSync(fd, chunk, 0, chunk.length, null);
        if (count === 0) break;
        bytes += count;
        hash.update(chunk.subarray(0, count));
      }
      const after = fs.fstatSync(fd);
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error();
      return { exists: true, bytes, mtimeMs: before.mtimeMs, sha256: hash.digest("hex") };
    } finally { fs.closeSync(fd); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, bytes: 0, mtimeMs: 0, sha256: null };
    throw new Error("Migration fingerprint failed");
  }
}

function readFreezeRecord(file: string, runId: string): FrozenMigration {
  const raw = readPrivateFile(file);
  let value: FrozenMigration;
  try { value = JSON.parse(raw) as FrozenMigration; } catch { throw new Error("Migration freeze record is invalid"); }
  const body = {
    runId: value.runId, frozenAt: value.frozenAt, database: value.database, wal: value.wal,
    shm: value.shm, inventoryDigests: value.inventoryDigests, contentDigest: value.contentDigest,
    consumers: value.consumers,
  };
  if (value.runId !== runId || value.consumers?.farm !== null || value.id !== sha256(canonical(body)) || raw !== `${canonical({ id: value.id, ...body })}\n`) {
    throw new Error("Migration freeze record is invalid");
  }
  return { ...value, recordPath: file };
}

function assertFrozenFiles(frozen: FrozenMigration, actual: ReturnType<typeof frozenDatabaseFiles>): void {
  if (canonical({ database: frozen.database, wal: frozen.wal, shm: frozen.shm }) !== canonical(actual)) {
    throw new Error("Frozen migration database changed");
  }
}

function openSnapshot(databasePath: string): Database {
  const image = fs.readFileSync(databasePath);
  if (image.subarray(0, 16).toString("binary") !== "SQLite format 3\0") throw new Error("Migration database is invalid");
  if (image[18] === 2 && image[19] === 2) { image[18] = 1; image[19] = 1; }
  const db = Database.deserialize(image, { readonly: true });
  db.exec("PRAGMA query_only = ON");
  return db;
}

function walkSource(root: string): Map<string, fs.Stats> {
  const rows = new Map<string, fs.Stats>();
  const visit = (directory: string, prefix: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      rows.set(relative, stat);
      if (stat.isDirectory() && !stat.isSymbolicLink()) visit(absolute, relative);
    }
  };
  visit(root, "");
  return rows;
}

function walkNames(root: string): string[] {
  const names: string[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      names.push(relative);
      if (fs.lstatSync(absolute).isDirectory()) visit(absolute, relative);
    }
  };
  visit(root, "");
  return names;
}

function entryKind(stat: fs.Stats): string {
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isSocket()) return "socket";
  if (stat.isFIFO()) return "fifo";
  return "other";
}

function hashFile(file: string): string { return fingerprint(file).sha256!; }

function containedPath(root: string, relative: string): string {
  if (!relative || relative.includes("\\") || path.posix.isAbsolute(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Migration content locator is invalid");
  }
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error("Migration content locator escapes the store");
  let current = path.resolve(root);
  for (const part of relative.split("/").slice(0, -1)) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error("Migration content locator has a symlink ancestor");
  }
  return resolved;
}

function assertContext(ctx: MigrationContext): void {
  if (path.resolve(ctx.db.filename) !== path.join(path.resolve(ctx.storeRoot), "ralphy.db")) throw new Error("Migration database does not belong to its store root");
}

function externalDirectory(input: string, excluded: readonly string[]): string {
  assertExternalPath(prospectiveCanonicalPath(input), excluded);
  fs.mkdirSync(input, { recursive: true, mode: 0o700 });
  return existingExternalDirectory(input, excluded);
}

function existingExternalDirectory(input: string, excluded: readonly string[]): string {
  const directory = canonicalDirectory(input);
  assertExternalPath(directory, excluded);
  return directory;
}

function assertExternalPath(directory: string, excluded: readonly string[]): void {
  for (const value of excluded) {
    const target = fs.realpathSync(value);
    if (directory === target || directory.startsWith(`${target}${path.sep}`) || target.startsWith(`${directory}${path.sep}`)) {
      throw new Error("Migration verification records must be outside renamed roots");
    }
  }
}

function prospectiveCanonicalPath(value: string): string {
  let existing = path.resolve(value);
  const missing: string[] = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw new Error("Migration directory is unsafe");
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.resolve(fs.realpathSync(existing), ...missing);
}

function canonicalDirectory(value: string): string {
  const resolved = fs.realpathSync(path.resolve(value));
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Migration directory is unsafe");
  return resolved;
}

function writePrivateJson(file: string, value: unknown): void {
  const directory = path.dirname(file);
  const temporary = path.join(directory, `.migration-record-${randomUUID()}.tmp`);
  const fd = fs.openSync(temporary, "wx", 0o600);
  try {
    fs.writeFileSync(fd, `${canonical(value)}\n`, "utf8");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  try {
    fs.linkSync(temporary, file);
    fs.unlinkSync(temporary);
    const directoryFd = fs.openSync(directory, "r");
    try { fs.fsyncSync(directoryFd); } finally { fs.closeSync(directoryFd); }
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function readPrivateFile(file: string): string {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) throw new Error();
    return fs.readFileSync(fd, "utf8");
  } catch { throw new Error("Migration external record is invalid"); }
  finally { fs.closeSync(fd); }
}

function issue(code: string, entityId: string, detail: Record<string, unknown> = {}): MigrationIssue {
  return { code, severity: "block", detail: { entityId, ...detail } };
}

function uniqueIssues(values: MigrationIssue[]): MigrationIssue[] {
  return [...new Map(values.map((value) => [canonical(value), value])).entries()]
    .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
    .map(([, value]) => value);
}

function activationError(blockers: MigrationIssue[]): Error {
  return new Error(`Migration activation blocked: ${uniqueIssues(blockers).map((value) => `${value.code}:${String(value.detail.entityId ?? "unknown")}`).join(",")}`);
}

function canonical(value: unknown): string { return JSON.stringify(value); }
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
