import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";
import { BRIDGE_PROTOCOL_VERSION } from "../bridge/protocol.js";
import { SCHEMA_VERSION } from "../store/schema.js";
import { verifyDomainStore, type DomainVerificationReport } from "../store/verify.js";
import {
  readSecretInventory,
  type KeyProvider,
  type SecretInventoryEntry,
} from "../store/secrets.js";
import {
  createExclusiveRegularFileAt,
  linkExclusiveAt,
  openDirectoryAt,
  openExistingDirectoryAt,
  openRootDirectory,
  readFileAt,
  unlinkAt,
} from "../store/posix-directory.js";
import { VERSION } from "../version.js";
import {
  assertMigrationMaintenanceLock,
  assertMigrationQuiescent,
  isRecognizedEmptySystemFile,
} from "./inventory.js";
import { isLegacySecretCandidate } from "./legacy.js";
import type { MigrationContext, MigrationIssue, MigrationSourceKind } from "./types.js";
import {
  isProductionSourceFingerprint,
  productionSourceGraphMismatches,
  type ProductionSourceFingerprintFact,
} from "./production-accounting.js";

export type FrozenFileFingerprint = {
  exists: boolean;
  bytes: number;
  mtimeMs: number;
  sha256: string | null;
};

type FrozenDirectoryIdentity = {
  path: string;
  device: string;
  inode: string;
};

export type FreezeMigrationInput = {
  verificationDir: string;
  /** @internal Explicit key provider for authenticated secret verification. */
  keyProvider?: KeyProvider;
  /** @internal Deterministic race seam for closed-snapshot tests. */
  afterClosedSnapshot?: (index: number) => void;
  /** @internal Deterministic race seam for verification-directory pin tests. */
  afterVerificationDirectoryOpen?: () => void;
  /** @internal Test seam observing plaintext buffers after zeroization. */
  afterPlaintextBufferReleased?: (buffer: Buffer) => void;
};

export type FrozenMigration = {
  id: string;
  runId: string;
  frozenAt: number;
  database: FrozenFileFingerprint;
  wal: FrozenFileFingerprint;
  shm: FrozenFileFingerprint;
  inventoryDigests: Record<string, string>;
  secretInventory: SecretInventoryFact[];
  secretInventoryDigest: string;
  verificationDirectory: FrozenDirectoryIdentity;
  stagedRoot: FrozenDirectoryIdentity;
  excludedRoots: FrozenDirectoryIdentity[];
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
  sourceKind: MigrationSourceKind;
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

type SecretInventoryFact = Pick<SecretInventoryEntry, "ref" | "kind">;

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
  freezeGate(ctx);
  const verificationDir = pinExternalDirectory(
    input.verificationDir,
    [ctx.storeRoot, ...ctx.sourceRoots.map((source) => source.path)],
    true,
  );
  let secrets: SecretInventoryEntry[] = [];
  try {
    input.afterVerificationDirectoryOpen?.();
    assertPinnedDirectory(verificationDir);
    freezeGate(ctx);
    const recordName = `migration-${ctx.runId}.freeze.json`;
    const recordPath = path.join(verificationDir.path, recordName);
    if (readPinnedFile(verificationDir, recordName) !== null) throw new Error("Migration is already frozen");
    const run = ctx.db.query<{ phase: string; frozenAt: number | null }, [string]>(
      "SELECT phase, frozen_at AS frozenAt FROM migration_runs WHERE id = ?",
    ).get(ctx.runId);
    if (!run || !new Set(["relations", "verify"]).has(run.phase) || run.frozenAt !== null) {
      throw new Error("Migration is not ready to freeze");
    }
    secrets = await readSecretInventory({
      dataRoot: ctx.storeRoot,
      keyProvider: input.keyProvider,
      afterPlaintextBufferReleased: input.afterPlaintextBufferReleased,
    });
    freezeGate(ctx);
    checkpoint(ctx.db, false);
    freezeGate(ctx);
    const activation = inspectActivation(ctx, secrets, input.afterPlaintextBufferReleased);
    appendDomainBlockers(activation.blockers, verifyDomainStore({ dataRoot: ctx.storeRoot, hashObjects: true }));
    if (activation.blockers.length > 0) throw activationError(activation.blockers);
    const frozenAt = Date.now();
    freezeGate(ctx);
    ctx.db.transaction(() => {
      ctx.db.prepare("UPDATE migration_runs SET phase = 'verify', updated_at = ? WHERE id = ? AND phase = 'relations'")
        .run(frozenAt, ctx.runId);
      const updated = ctx.db.prepare(
        `UPDATE migration_runs SET phase = 'ready', frozen_at = ?, updated_at = ?
         WHERE id = ? AND phase = 'verify' AND frozen_at IS NULL RETURNING id`,
      ).get(frozenAt, frozenAt, ctx.runId) as { id: string } | null;
      if (updated?.id !== ctx.runId) throw new Error("Migration freeze did not transition exactly once");
    }).immediate();
    freezeGate(ctx);
    checkpoint(ctx.db, true);
    freezeGate(ctx);
    ctx.db.close();

    const first = inspectClosedSnapshot(ctx, frozenAt, secrets, input.afterPlaintextBufferReleased);
    input.afterClosedSnapshot?.(1);
    const second = inspectClosedSnapshot(ctx, frozenAt, secrets, input.afterPlaintextBufferReleased);
    input.afterClosedSnapshot?.(2);
    const third = inspectClosedSnapshot(ctx, frozenAt, secrets, input.afterPlaintextBufferReleased);
    if (third.activation.blockers.length > 0) throw activationError(third.activation.blockers);
    if (canonical(first) !== canonical(second) || canonical(second) !== canonical(third)) {
      throw new Error("Migration closed snapshots are not stable");
    }
    const secretInventory = secretInventoryFacts(secrets);
    const secretInventoryDigest = sha256(canonical(secretInventory));
    const verificationDirectory = pinnedDirectoryIdentity(verificationDir);
    const stagedRoot = directoryIdentity(ctx.storeRoot);
    const excludedRoots = [ctx.storeRoot, ...ctx.sourceRoots.map((source) => source.path)]
      .map(directoryIdentity)
      .sort((left, right) => left.path.localeCompare(right.path));
    const body = {
      runId: ctx.runId,
      frozenAt,
      database: third.files.database,
      wal: third.files.wal,
      shm: third.files.shm,
      inventoryDigests: third.activation.inventoryDigests,
      secretInventory,
      secretInventoryDigest,
      verificationDirectory,
      stagedRoot,
      excludedRoots,
      contentDigest: third.contentDigest,
      consumers: { farm: null } as const,
    };
    const record = { id: sha256(canonical(body)), ...body };
    freezeGate(ctx);
    writePrivateJson(verificationDir, recordName, record);
    freezeGate(ctx);
    return { ...record, recordPath };
  } finally {
    for (const secret of secrets) secret.value.fill(0);
    closePinnedDirectory(verificationDir);
  }
}

export function verifyMigration(input: {
  storeRoot: string;
  runId: string;
  verificationDir: string;
}): MigrationVerification {
  const storeRoot = canonicalDirectory(input.storeRoot);
  if (!fs.existsSync(input.verificationDir)) throw new Error("Migration verification is unavailable until the stage is frozen");
  const verificationDir = pinExternalDirectory(input.verificationDir, [storeRoot], false);
  try {
    return verifyPinnedMigration(input, storeRoot, verificationDir);
  } finally {
    closePinnedDirectory(verificationDir);
  }
}

function verifyPinnedMigration(
  input: { storeRoot: string; runId: string; verificationDir: string },
  storeRoot: string,
  verificationDir: PinnedDirectory,
): MigrationVerification {
  const freezeName = `migration-${input.runId}.freeze.json`;
  const frozen = readFreezeRecord(verificationDir, freezeName, input.runId);
  assertFrozenStoreRoot(frozen, storeRoot);
  const before = frozenDatabaseFiles(storeRoot);
  assertFrozenFiles(frozen, before);
  const db = openSnapshot(path.join(storeRoot, "ralphy.db"));
  let activation: Activation;
  let stageContentDigest: string;
  try {
    activation = inspectFrozenActivation(db, input.runId, storeRoot, frozen.secretInventory);
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
  const recordName = `migration-${input.runId}.verification-${id}.json`;
  const recordPath = path.join(verificationDir.path, recordName);
  writePrivateJson(verificationDir, recordName, { id, ...body });
  return { id, ...body, recordPath };
}

function inspectActivation(
  ctx: MigrationContext,
  secrets: readonly SecretInventoryEntry[],
  afterPlaintextBufferReleased?: (buffer: Buffer) => void,
): Activation {
  const activation = inspectFrozenActivation(
    ctx.db,
    ctx.runId,
    ctx.storeRoot,
    secretInventoryFacts(secrets),
    secrets,
    afterPlaintextBufferReleased,
  );
  inspectSources(ctx, activation);
  return activation;
}

function inspectFrozenActivation(
  db: Database,
  runId: string,
  storeRoot: string,
  secretInventory: readonly SecretInventoryFact[] = [],
  plaintextSecrets: readonly SecretInventoryEntry[] = [],
  afterPlaintextBufferReleased?: (buffer: Buffer) => void,
): Activation {
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
  inspectProductionAccountingFacts(db, runId, blockers);
  inspectFarmState(db, blockers);
  inspectSecretMaterializations(db, storeRoot, runId, blockers);
  inspectSecretInventory(db, runId, secretInventory, blockers);
  inspectPlaintextRows(db, blockers);
  inspectStagePlaintext(storeRoot, plaintextSecrets, blockers, afterPlaintextBufferReleased);
  return {
    sourceEntries: entries.length,
    coveredEntries: entries.filter((entry) => TERMINAL_STATES.has(entry.state)).length,
    sourceBytes,
    accountedBytes: entries.filter((entry) => TERMINAL_STATES.has(entry.state)).reduce((sum, entry) => sum + (entry.entryKind === "file" ? entry.bytes : 0), 0),
    inventoryDigests,
    blockers: uniqueIssues(blockers),
  };
}

function inspectFarmState(db: Database, blockers: MigrationIssue[]): void {
  for (const row of db.query<{ id: string }, []>(
    `SELECT id FROM consumer_principals WHERE namespace = 'farm'
     UNION SELECT id FROM agent_sessions WHERE agent = 'consumer:farm'
        OR consumer_principal_id IN (SELECT id FROM consumer_principals WHERE namespace = 'farm')
     UNION SELECT id FROM runs WHERE external_system = 'ralphy-farm'
        OR consumer_principal_id IN (SELECT id FROM consumer_principals WHERE namespace = 'farm')
     ORDER BY id`,
  ).all()) blockers.push(issue("MIGRATION_FARM_STATE_FORBIDDEN", row.id));
}

function inspectEntry(db: Database, entry: Entry, blockers: MigrationIssue[]): void {
  if (!TERMINAL_STATES.has(entry.state) || entry.terminalAt === null) {
    blockers.push(issue("MIGRATION_ENTRY_INCOMPLETE", entry.id));
  }
  // Secret dispositions are the one case with no hash to demand: the bytes of an
  // unparseable candidate are never opened, which is the whole point of keeping
  // them recovery-only, and inventory only hashes control-sized files.
  if (entry.entryKind === "file" && entry.sha256 === null && !entry.disposition.startsWith("secret-")) {
    blockers.push(issue("MIGRATION_ENTRY_HASH_MISSING", entry.id));
  }
  if (entry.entryKind === "file" && entry.bytes === 0 && entry.disposition === "system"
    && !isRecognizedEmptySystemFile(entry.sourcePath, entry.sourceKind)) {
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
         AND json_extract(detail_json, '$.sourceEntryId') = ?`,
    ).get(entry.id, entry.id)?.count ?? 0;
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
      if (!stat || entryKind(stat) !== entry.entryKind || String(stat.dev) !== entry.device || String(stat.ino) !== entry.inode || stat.mode !== entry.mode || (stat.isFile() && stat.size !== entry.bytes) || Math.trunc(stat.mtimeMs) !== entry.mtimeMs) {
        activation.blockers.push(issue("MIGRATION_SOURCE_FINGERPRINT_DRIFT", entry.id));
        continue;
      }
      if (stat.isFile() && entry.sha256 !== null
        && hashFile(path.join(bound.path, ...entry.sourcePath.split("/"))) !== entry.sha256) {
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
  inspectJobAccountingFacts(db, runId, blockers);
}

function inspectJobAccountingFacts(db: Database, runId: string, blockers: MigrationIssue[]): void {
  type FactRow = { id: number; jobId?: number; runId?: string; status?: string; hold?: string | null; digest: string; runDigest?: string };
  const expectedJobs = new Set<number>();
  const expectedLogs = new Set<number>();
  const expectedArtifacts = new Set<number>();
  const tripletEntries = db.query<{ sourceId: string; entryId: string }, [string]>(
    `SELECT migration_source_id AS sourceId, id AS entryId FROM migration_entries
     WHERE migration_run_id = ? AND (
       source_path = 'jobs.db' OR source_path LIKE '%/jobs.db'
       OR source_path = 'jobs.db-wal' OR source_path LIKE '%/jobs.db-wal'
       OR source_path = 'jobs.db-shm' OR source_path LIKE '%/jobs.db-shm')
     ORDER BY migration_source_id, source_path`,
  ).all(runId);
  const groupedTriplets = new Map<string, string[]>();
  for (const entry of tripletEntries) {
    const entries = groupedTriplets.get(entry.sourceId) ?? [];
    entries.push(entry.entryId);
    groupedTriplets.set(entry.sourceId, entries);
  }
  const expectedTriplets = [...groupedTriplets.entries()]
    .map(([sourceId, entryIds]) => ({ sourceId, entryIds: entryIds.sort() }))
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const indexes = db.query<{ detail: string }, [string]>(
    `SELECT detail_json AS detail FROM migration_issues
     WHERE migration_run_id = ? AND code = 'MIGRATION_JOB_ACCOUNTING_INDEX' ORDER BY id`,
  ).all(runId);
  let indexedTriplets: Array<{ sourceId: string; entryIds: string[] }> = [];
  if (indexes.length !== (expectedTriplets.length > 0 ? 1 : 0)) {
    blockers.push(issue("MIGRATION_JOB_ACCOUNTING", runId));
  } else if (indexes.length === 1) {
    try {
      const value = JSON.parse(indexes[0]!.detail) as { triplets?: unknown };
      if (!Array.isArray(value.triplets)) throw new Error();
      indexedTriplets = value.triplets as typeof indexedTriplets;
      if (canonical(indexedTriplets) !== canonical(expectedTriplets)) throw new Error();
    } catch { blockers.push(issue("MIGRATION_JOB_ACCOUNTING", runId)); }
  }
  const indexed = new Map(indexedTriplets.map((triplet) => [triplet.sourceId, triplet.entryIds]));
  const factSources = new Set<string>();
  const digest = (table: string, id: number | string): string | null => {
    const row = db.query<Record<string, unknown>, [number | string]>(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    return row ? sha256(canonicalRow(row)) : null;
  };
  for (const fact of db.query<{ detail: string }, [string]>(
    `SELECT detail_json AS detail FROM migration_issues
     WHERE migration_run_id = ? AND code = 'MIGRATION_JOB_ACCOUNTING_FACT' ORDER BY id`,
  ).all(runId)) {
    let value: { sourceId?: unknown; entryIds?: unknown; jobs?: FactRow[]; logs?: FactRow[]; artifacts?: FactRow[] };
    try { value = JSON.parse(fact.detail) as typeof value; }
    catch { blockers.push(issue("MIGRATION_JOB_ACCOUNTING", runId)); continue; }
    const entryId = Array.isArray(value.entryIds) && typeof value.entryIds[0] === "string" ? value.entryIds[0] : runId;
    if (typeof value.sourceId !== "string" || factSources.has(value.sourceId)
      || canonical(value.entryIds) !== canonical(indexed.get(value.sourceId))
      || !Array.isArray(value.jobs) || !Array.isArray(value.logs) || !Array.isArray(value.artifacts)) {
      blockers.push(issue("MIGRATION_JOB_ACCOUNTING", entryId));
      continue;
    }
    factSources.add(value.sourceId);
    for (const job of value.jobs) {
      const current = db.query<{ status: string; hold: string | null; runId: string }, [number]>(
        "SELECT status, migration_hold_run_id AS hold, run_id AS runId FROM jobs WHERE id = ?",
      ).get(job.id);
      if (
        expectedJobs.has(job.id) || !current || current.runId !== job.runId
        || current.status !== job.status || current.hold !== job.hold
        || digest("jobs", job.id) !== job.digest || digest("runs", job.runId!) !== job.runDigest
        || (job.status === "pending" && job.hold !== runId)
      ) blockers.push(issue("MIGRATION_JOB_ACCOUNTING", entryId));
      expectedJobs.add(job.id);
    }
    for (const [table, rows, expected] of [
      ["job_logs", value.logs, expectedLogs],
      ["job_artifacts", value.artifacts, expectedArtifacts],
    ] as const) {
      for (const row of rows) {
        const current = db.query<{ jobId: number }, [number]>(
          `SELECT job_id AS jobId FROM ${table} WHERE id = ?`,
        ).get(row.id);
        if (expected.has(row.id) || !current || current.jobId !== row.jobId || digest(table, row.id) !== row.digest) {
          blockers.push(issue("MIGRATION_JOB_ACCOUNTING", entryId));
        }
        expected.add(row.id);
      }
    }
  }
  if (canonical([...factSources].sort()) !== canonical([...indexed.keys()].sort())) {
    blockers.push(issue("MIGRATION_JOB_ACCOUNTING", runId));
  }
  const actualJobs = db.query<{ id: number }, [string]>(
    `SELECT job.id FROM jobs job JOIN runs run ON run.id = job.run_id
     WHERE job.kind = 'legacy' AND json_extract(run.metadata_json, '$.migrationRunId') = ? ORDER BY job.id`,
  ).all(runId).map((row) => row.id);
  const actualLogs = db.query<{ id: number }, [string]>(
    `SELECT log.id FROM job_logs log JOIN jobs job ON job.id = log.job_id JOIN runs run ON run.id = job.run_id
     WHERE job.kind = 'legacy' AND json_extract(run.metadata_json, '$.migrationRunId') = ? ORDER BY log.id`,
  ).all(runId).map((row) => row.id);
  const actualArtifacts = db.query<{ id: number }, [string]>(
    `SELECT artifact.id FROM job_artifacts artifact JOIN jobs job ON job.id = artifact.job_id JOIN runs run ON run.id = job.run_id
     WHERE job.kind = 'legacy' AND json_extract(run.metadata_json, '$.migrationRunId') = ? ORDER BY artifact.id`,
  ).all(runId).map((row) => row.id);
  if (canonical(actualJobs) !== canonical([...expectedJobs].sort((a, b) => a - b))
    || canonical(actualLogs) !== canonical([...expectedLogs].sort((a, b) => a - b))
    || canonical(actualArtifacts) !== canonical([...expectedArtifacts].sort((a, b) => a - b))) {
    blockers.push(issue("MIGRATION_JOB_ACCOUNTING", runId));
  }
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

function inspectProductionAccountingFacts(db: Database, runId: string, blockers: MigrationIssue[]): void {
  const indexes = db.query<{ detail: string }, [string]>(
    `SELECT detail_json AS detail FROM migration_issues
     WHERE migration_run_id = ? AND code = 'MIGRATION_PRODUCTION_ACCOUNTING_INDEX' ORDER BY id`,
  ).all(runId);
  const facts = db.query<{ detail: string }, [string]>(
    `SELECT detail_json AS detail FROM migration_issues
     WHERE migration_run_id = ? AND code = 'MIGRATION_PRODUCTION_ACCOUNTING_FACT' ORDER BY id`,
  ).all(runId);
  if (indexes.length === 0 && facts.length === 0) return;
  if (indexes.length !== 1) {
    blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", runId));
    return;
  }
  let index: {
    entryIds?: unknown;
    sourceFingerprint?: unknown;
    sourceFingerprintDigest?: unknown;
  };
  try { index = JSON.parse(indexes[0]!.detail) as typeof index; }
  catch { blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", runId)); return; }
  if (!Array.isArray(index.entryIds) || index.entryIds.some((id) => typeof id !== "string")
    || !isProductionSourceFingerprint(index.sourceFingerprint)
    || typeof index.sourceFingerprintDigest !== "string"
    || index.sourceFingerprintDigest !== sha256(canonicalRow(index.sourceFingerprint))) {
    blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", runId));
    return;
  }
  const seen = new Set<string>();
  const accountedRefs = new Map<string, string[]>();
  for (const row of facts) {
    let fact: { entryId?: unknown; sourceLocatorHash?: unknown; refs?: unknown; facts?: unknown };
    try { fact = JSON.parse(row.detail) as typeof fact; }
    catch { blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", runId)); continue; }
    const entryId = typeof fact.entryId === "string" ? fact.entryId : runId;
    if (seen.has(entryId) || !Array.isArray(fact.refs) || !Array.isArray(fact.facts)) {
      blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", entryId));
      continue;
    }
    seen.add(entryId);
    const entry = db.query<{ refs: string; sourceLocatorHash: string }, [string, string]>(
      `SELECT COALESCE(target_refs_json, '[]') AS refs,
              source_locator_hash AS sourceLocatorHash FROM migration_entries
       WHERE migration_run_id = ? AND id = ? AND state IN ('imported', 'verified')`,
    ).get(runId, entryId);
    if (!entry || fact.sourceLocatorHash !== entry.sourceLocatorHash
      || canonical(JSON.parse(entry.refs) as unknown) !== canonical(fact.refs)) {
      blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", entryId));
      continue;
    }
    accountedRefs.set(entryId, fact.refs as string[]);
    const expectedFacts = new Map((fact.facts as Array<{ ref?: unknown; digest?: unknown }>).map((value) => [value.ref, value.digest]));
    if (expectedFacts.size !== fact.refs.length) blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", entryId));
    for (const ref of fact.refs as string[]) {
      if (typeof ref !== "string") { blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", entryId)); continue; }
      if (ref.startsWith("provider/")) {
        if (expectedFacts.get(ref) !== null) blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", entryId));
        continue;
      }
      const split = ref.indexOf("_");
      const table = REF_TABLES[ref.slice(0, split)];
      const target = table ? db.query<Record<string, unknown>, [string]>(`SELECT * FROM ${table} WHERE id = ?`).get(ref) : null;
      if (!target || expectedFacts.get(ref) !== sha256(canonicalRow(target))) {
        blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", entryId));
      }
    }
  }
  if (canonical([...seen].sort()) !== canonical([...(index.entryIds as string[])].sort())) {
    blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", runId));
  }
  const fingerprint = index.sourceFingerprint;
  const ambiguousLocators = new Set(db.query<{ sourceLocatorHash: string }, [string]>(
    `SELECT DISTINCT json_extract(detail_json, '$.sourceLocatorHash') AS sourceLocatorHash
     FROM migration_issues
     WHERE migration_run_id = ?
       AND code IN ('MIGRATION_UNIT_ITEM_AMBIGUOUS', 'MIGRATION_UNIT_DOCUMENT_AMBIGUOUS')
       AND json_type(detail_json, '$.sourceLocatorHash') = 'text'`,
  ).all(runId).map((row) => row.sourceLocatorHash));
  for (const unit of fingerprint.unitRecords) {
    const refs = accountedRefs.get(unit.entryId) ?? [];
    const sourceLocatorHash = db.query<{ sourceLocatorHash: string }, [string]>(
      "SELECT source_locator_hash AS sourceLocatorHash FROM migration_entries WHERE id = ?",
    ).get(unit.entryId)?.sourceLocatorHash;
    if (refs.filter((ref) => ref.startsWith("item_")).length !== unit.itemOccurrences
      && (!sourceLocatorHash || !ambiguousLocators.has(sourceLocatorHash))) {
      blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", unit.entryId));
    }
  }
  for (const entryId of productionSourceGraphMismatches(db, fingerprint)) {
    blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", entryId));
  }
  const importedMetrics = new Set([...accountedRefs.values()].flat().filter((ref) => ref.startsWith("metric_")));
  const expectedWinners = productionMetricWinnerIds(
    fingerprint.metricRecords.filter((record) => importedMetrics.has(record.metricId)),
  );
  const actualWinners = db.query<{ id: string }, []>(
    `WITH ranked AS (
       SELECT id, ROW_NUMBER() OVER (
         PARTITION BY publication_id ORDER BY as_of DESC, created_at DESC, id DESC
       ) AS winner
       FROM metric_snapshots
     ) SELECT id FROM ranked WHERE winner = 1 ORDER BY id`,
  ).all().map((row) => row.id);
  if (canonical(actualWinners) !== canonical(expectedWinners)) {
    blockers.push(issue("MIGRATION_PRODUCTION_ACCOUNTING", runId));
  }
}

function productionMetricWinnerIds(
  records: readonly ProductionSourceFingerprintFact["metricRecords"][number][],
): string[] {
  const winners = new Map<string, ProductionSourceFingerprintFact["metricRecords"][number]>();
  for (const record of records) {
    const current = winners.get(record.winnerKey);
    if (!current || record.asOf > current.asOf
      || (record.asOf === current.asOf && record.createdAt > current.createdAt)
      || (record.asOf === current.asOf && record.createdAt === current.createdAt
        && record.metricId > current.metricId)) winners.set(record.winnerKey, record);
  }
  return [...winners.values()].map((record) => record.metricId).sort();
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

function inspectSecretInventory(
  db: Database,
  runId: string,
  inventory: readonly SecretInventoryFact[],
  blockers: MigrationIssue[],
): void {
  const expected = new Map<string, { entryId: string; kind: "text" | "file" }>();
  for (const entry of db.query<{ id: string; sourceLocatorHash: string; refs: string }, [string]>(
    `SELECT id, source_locator_hash AS sourceLocatorHash,
            COALESCE(target_refs_json, '[]') AS refs
     FROM migration_entries
     WHERE migration_run_id = ? AND disposition = 'secret-imported' ORDER BY id`,
  ).all(runId)) {
    const rows = db.query<{ code: string; detail: string }, [string, string]>(
      `SELECT code, detail_json AS detail FROM migration_issues
       WHERE migration_run_id = ? AND code IN (
         'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED', 'MIGRATION_SECRET_IMPORT_PLANNED',
         'MIGRATION_SECRET_IMPORTED')
         AND json_extract(detail_json, '$.sourceEntryId') = ? ORDER BY code, id`,
    ).all(runId, entry.id);
    const plans = rows.filter((row) => row.code !== "MIGRATION_SECRET_IMPORTED");
    const completions = rows.filter((row) => row.code === "MIGRATION_SECRET_IMPORTED");
    if (plans.length !== 1 || completions.length !== 1) {
      blockers.push(issue("MIGRATION_SECRET_ACCOUNTING", entry.id));
      continue;
    }
    let plan: { kind?: unknown; refs?: unknown };
    let completion: { completed?: unknown; kind?: unknown; refs?: unknown };
    try {
      plan = JSON.parse(plans[0]!.detail) as typeof plan;
      completion = JSON.parse(completions[0]!.detail) as typeof completion;
    } catch {
      blockers.push(issue("MIGRATION_SECRET_ACCOUNTING", entry.id));
      continue;
    }
    if (
      (plan.kind !== "text" && plan.kind !== "file")
      || completion.completed !== true
      || completion.kind !== plan.kind
      || canonical(completion.refs) !== canonical(plan.refs)
      || canonical(plan.refs) !== canonical(JSON.parse(entry.refs) as unknown)
    ) {
      blockers.push(issue("MIGRATION_SECRET_ACCOUNTING", entry.id));
      continue;
    }
    for (const ref of plan.refs as string[]) {
      if (typeof ref !== "string" || expected.has(ref)) {
        blockers.push(issue("MIGRATION_SECRET_ACCOUNTING", entry.id));
      } else expected.set(ref, { entryId: entry.id, kind: plan.kind });
    }
  }
  const actual = new Map(inventory.map((entry) => [entry.ref, entry]));
  for (const [ref, value] of expected) {
    if (actual.get(ref)?.kind !== value.kind) blockers.push(issue("MIGRATION_SECRET_INVENTORY_MISMATCH", value.entryId));
  }
  for (const entry of inventory) {
    if (!expected.has(entry.ref)) blockers.push(issue("MIGRATION_SECRET_INVENTORY_EXTRA", sha256(entry.ref)));
  }
}

function inspectPlaintextRows(db: Database, blockers: MigrationIssue[]): void {
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
        if (typeof value === "string" && isLegacySecretCandidate("row.txt", Buffer.from(value))) {
          blockers.push(issue("MIGRATION_PLAINTEXT_SECRET", String(row.id ?? row.__rowid), { table: name, column }));
        }
      }
    }
  }
}

function inspectStagePlaintext(
  storeRoot: string,
  secrets: readonly SecretInventoryEntry[],
  blockers: MigrationIssue[],
  afterPlaintextBufferReleased?: (buffer: Buffer) => void,
): void {
  for (const relative of walkStageFiles(storeRoot)) {
    if (relative === "secrets.enc") continue;
    let leaked: boolean;
    try {
      leaked = fileContainsPlaintext(
        containedPath(storeRoot, relative),
        secrets,
        afterPlaintextBufferReleased,
      );
    }
    catch { blockers.push(issue("MIGRATION_STAGE_FILE_UNREADABLE", sha256(relative))); continue; }
    if (leaked) blockers.push(issue("MIGRATION_PLAINTEXT_SECRET", sha256(relative)));
  }
}

function fileContainsPlaintext(
  file: string,
  secrets: readonly SecretInventoryEntry[],
  afterPlaintextBufferReleased?: (buffer: Buffer) => void,
): boolean {
  const needles = secrets.map((secret) => secret.value).filter((value) => value.length > 0);
  const overlap = Math.max(64 * 1024, ...needles.map((value) => value.length - 1));
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  let carry = Buffer.alloc(0);
  let bytes: Buffer | null = null;
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const release = (buffer: Buffer): void => {
    buffer.fill(0);
    afterPlaintextBufferReleased?.(buffer);
  };
  try {
    for (;;) {
      const count = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (count === 0) return false;
      const combined = Buffer.concat([carry, chunk.subarray(0, count)]);
      bytes = combined;
      if (needles.some((needle) => combined.indexOf(needle) !== -1)) return true;
      const nextCarry = Buffer.from(combined.subarray(Math.max(0, combined.length - overlap)));
      release(combined);
      bytes = null;
      release(carry);
      carry = nextCarry;
    }
  } finally {
    fs.closeSync(fd);
    if (bytes) release(bytes);
    release(carry);
    release(chunk);
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
  const objects = new Map<string, ReturnType<typeof inspectFile>>();
  for (const row of db.query<{ id: string; bucket: string; key: string; bytes: number; sha256: string; mime: string }, []>(
    "SELECT id, bucket, key, bytes, sha256, mime FROM objects ORDER BY id",
  ).all()) {
    const file = containedPath(storeRoot, `${row.bucket}/${row.key}`);
    const actual = inspectFile(file);
    if (!actual.fingerprint.exists || actual.fingerprint.bytes !== row.bytes || actual.fingerprint.sha256 !== row.sha256) throw new Error(`Object content changed: ${row.id}`);
    objects.set(row.id, actual);
    lines.push(`object\0${row.id}\0${row.bucket}/${row.key}\0${row.sha256}\0${row.bytes}\0${row.mime}\0${actual.mode}`);
  }
  for (const row of db.query<{
    id: string;
    objectId: string | null;
    path: string;
    bytes: number | null;
    sha256: string | null;
    mime: string | null;
    objectPath: string | null;
    objectBytes: number | null;
    objectSha256: string | null;
    objectMime: string | null;
  }, []>(
    `SELECT run_object.id, run_object.object_id AS objectId, run_object.path,
            run_object.bytes, run_object.sha256, run_object.mime,
            CASE WHEN object.id IS NULL THEN NULL ELSE object.bucket || '/' || object.key END AS objectPath,
            object.bytes AS objectBytes, object.sha256 AS objectSha256,
            object.mime AS objectMime
     FROM run_objects run_object LEFT JOIN objects object ON object.id = run_object.object_id
     ORDER BY run_object.id`,
  ).all()) {
    if (row.objectId === null) {
      const actual = inspectFile(containedPath(storeRoot, row.path));
      if (!actual.fingerprint.exists || actual.fingerprint.bytes !== row.bytes || actual.fingerprint.sha256 !== row.sha256) throw new Error(`RunObject content changed: ${row.id}`);
      lines.push(`run-object\0${row.id}\0\0${row.path}\0${row.sha256 ?? ""}\0${row.bytes ?? ""}\0${row.mime ?? ""}\0${actual.mode}`);
      continue;
    }
    const actual = objects.get(row.objectId);
    if (!actual || row.path !== row.objectPath || row.bytes !== row.objectBytes
      || row.sha256 !== row.objectSha256 || row.mime !== row.objectMime) {
      throw new Error(`RunObject Object changed: ${row.id}`);
    }
    lines.push(`run-object\0${row.id}\0${row.objectId}\0${row.path}\0${row.sha256}\0${row.bytes}\0${row.mime}\0${actual.mode}`);
  }
  const secrets = path.join(storeRoot, "secrets.enc");
  if (fs.existsSync(secrets)) {
    const actual = inspectFile(secrets);
    lines.push(`secrets\0${actual.fingerprint.sha256}\0${actual.fingerprint.bytes}\0${actual.mode}`);
  }
  for (const relative of walkStageFiles(storeRoot)) {
    const actual = inspectFile(containedPath(storeRoot, relative));
    lines.push(`stage\0${relative}\0${actual.fingerprint.sha256}\0${actual.fingerprint.bytes}\0${actual.mode}`);
  }
  return sha256(lines.join("\n"));
}

function inspectClosedSnapshot(
  ctx: MigrationContext,
  frozenAt: number,
  secrets: readonly SecretInventoryEntry[],
  afterPlaintextBufferReleased?: (buffer: Buffer) => void,
): { files: ReturnType<typeof frozenDatabaseFiles>; activation: Activation; contentDigest: string } {
  freezeGate(ctx);
  const before = frozenDatabaseFiles(ctx.storeRoot);
  const db = openSnapshot(path.join(ctx.storeRoot, "ralphy.db"));
  let activation: Activation;
  let digest: string;
  try {
    activation = inspectFrozenActivation(
      db,
      ctx.runId,
      ctx.storeRoot,
      secretInventoryFacts(secrets),
      secrets,
      afterPlaintextBufferReleased,
    );
    inspectSources({ ...ctx, db }, activation);
    const run = db.query<{ phase: string; frozenAt: number | null }, [string]>(
      "SELECT phase, frozen_at AS frozenAt FROM migration_runs WHERE id = ?",
    ).get(ctx.runId);
    if (!run || run.phase !== "ready" || run.frozenAt !== frozenAt) {
      activation.blockers.push(issue("MIGRATION_FREEZE_STATE", ctx.runId));
    }
    digest = contentDigest(db, ctx.storeRoot);
  } finally {
    db.close();
  }
  appendDomainBlockers(activation.blockers, verifyDomainStore({ dataRoot: ctx.storeRoot, hashObjects: true }));
  activation.blockers = uniqueIssues(activation.blockers);
  const after = frozenDatabaseFiles(ctx.storeRoot);
  if (canonical(before) !== canonical(after)) throw new Error("Migration database changed during closed verification");
  freezeGate(ctx);
  return { files: after, activation, contentDigest: digest };
}

function freezeGate(ctx: MigrationContext): void {
  assertMigrationMaintenanceLock(ctx);
  assertMigrationQuiescent([...ctx.sourceRoots.map((source) => source.path), ctx.storeRoot]);
}

function migrationEntries(db: Database, runId: string): Entry[] {
  return db.query<Entry, [string]>(
    `SELECT entry.id, entry.migration_source_id AS sourceId, source.source_label AS sourceLabel,
            entry.source_path AS sourcePath, entry.source_locator_hash AS sourceLocatorHash,
            entry.entry_kind AS entryKind, entry.source_kind AS sourceKind,
            entry.disposition, entry.source_device AS device,
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
  return inspectFile(file).fingerprint;
}

function inspectFile(file: string): { fingerprint: FrozenFileFingerprint; mode: number | null } {
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
      return {
        fingerprint: { exists: true, bytes, mtimeMs: before.mtimeMs, sha256: hash.digest("hex") },
        mode: before.mode & 0o777,
      };
    } finally { fs.closeSync(fd); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { fingerprint: { exists: false, bytes: 0, mtimeMs: 0, sha256: null }, mode: null };
    }
    throw new Error("Migration fingerprint failed");
  }
}

function readFreezeRecord(
  directory: PinnedDirectory,
  name: string,
  runId: string,
): FrozenMigration {
  const raw = readPrivateFile(directory, name);
  let value: FrozenMigration;
  try { value = JSON.parse(raw) as FrozenMigration; } catch { throw new Error("Migration freeze record is invalid"); }
  const body = {
    runId: value.runId, frozenAt: value.frozenAt, database: value.database, wal: value.wal,
    shm: value.shm, inventoryDigests: value.inventoryDigests,
    secretInventory: value.secretInventory, secretInventoryDigest: value.secretInventoryDigest,
    verificationDirectory: value.verificationDirectory, stagedRoot: value.stagedRoot,
    excludedRoots: value.excludedRoots,
    contentDigest: value.contentDigest,
    consumers: value.consumers,
  };
  const currentDirectory = pinnedDirectoryIdentity(directory);
  if (!isDirectoryIdentity(value.verificationDirectory)
    || canonical(value.verificationDirectory) !== canonical(currentDirectory)) {
    throw new Error("Migration verification directory identity does not match freeze record");
  }
  if (
    value.runId !== runId
    || value.consumers?.farm !== null
    || !isSecretInventoryFacts(value.secretInventory)
    || value.secretInventoryDigest !== sha256(canonical(value.secretInventory))
    || !Array.isArray(value.excludedRoots)
    || !value.excludedRoots.every(isDirectoryIdentity)
    || canonical(value.excludedRoots) !== canonical([...value.excludedRoots].sort((left, right) => left.path.localeCompare(right.path)))
    || !isDirectoryIdentity(value.stagedRoot)
    || !value.excludedRoots.some((identity) => canonical(identity) === canonical(value.stagedRoot))
    || value.id !== sha256(canonical(body))
    || raw !== `${canonical({ id: value.id, ...body })}\n`
  ) {
    throw new Error("Migration freeze record is invalid");
  }
  return { ...value, recordPath: path.join(directory.path, name) };
}

function assertFrozenStoreRoot(frozen: FrozenMigration, storeRoot: string): void {
  const current = directoryIdentity(storeRoot);
  if (current.device !== frozen.stagedRoot.device || current.inode !== frozen.stagedRoot.inode) {
    throw new Error("Migration store root identity does not match freeze record");
  }
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

function walkStageFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Migration stage contains a symlink: ${sha256(relative)}`);
      if (stat.isDirectory()) visit(absolute, relative);
      else if (stat.isFile()) files.push(relative);
      else throw new Error(`Migration stage contains a special file: ${sha256(relative)}`);
    }
  };
  visit(root, "");
  return files;
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

type PinnedDirectory = {
  fd: number;
  path: string;
  dev: number;
  ino: number;
  uid: number;
};

function pinnedDirectoryIdentity(directory: PinnedDirectory): FrozenDirectoryIdentity {
  assertPinnedDirectory(directory);
  return { path: directory.path, device: String(directory.dev), inode: String(directory.ino) };
}

function directoryIdentity(directory: string): FrozenDirectoryIdentity {
  const current = canonicalDirectory(directory);
  const stat = fs.statSync(current);
  return { path: current, device: String(stat.dev), inode: String(stat.ino) };
}

function isDirectoryIdentity(value: unknown): value is FrozenDirectoryIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<FrozenDirectoryIdentity>;
  return typeof identity.path === "string" && path.isAbsolute(identity.path)
    && typeof identity.device === "string" && /^\d+$/u.test(identity.device)
    && typeof identity.inode === "string" && /^\d+$/u.test(identity.inode);
}

function pinExternalDirectory(
  input: string,
  excluded: readonly string[],
  create: boolean,
): PinnedDirectory {
  const directory = canonicalDarwinPath(path.resolve(input));
  assertExternalPath(directory, excluded);
  const root = path.parse(directory).root;
  let fd = openRootDirectory(root);
  try {
    for (const name of directory.slice(root.length).split(path.sep).filter(Boolean)) {
      const child = create
        ? openDirectoryAt(fd, name, 0o700).fd
        : openExistingDirectoryAt(fd, name);
      if (child === null) throw new Error("Migration verification is unavailable until the stage is frozen");
      fs.closeSync(fd);
      fd = child;
    }
    const stat = fs.fstatSync(fd);
    const uid = typeof process.getuid === "function" ? process.getuid() : 0;
    if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o777) !== 0o700) {
      throw new Error("Migration verification directory must be private and owned by the current user");
    }
    const pinned = { fd, path: directory, dev: stat.dev, ino: stat.ino, uid: stat.uid };
    assertPinnedDirectory(pinned);
    return pinned;
  } catch (error) {
    fs.closeSync(fd);
    throw error instanceof Error && error.message
      ? error
      : new Error("Migration directory is unsafe");
  }
}

function canonicalDarwinPath(value: string): string {
  if (process.platform !== "darwin") return value;
  if (value === "/var" || value.startsWith("/var/")) return `/private${value}`;
  if (value === "/tmp" || value.startsWith("/tmp/")) return `/private${value}`;
  return value;
}

function assertExternalPath(directory: string, excluded: readonly string[]): void {
  for (const value of excluded) {
    const target = fs.realpathSync(value);
    if (directory === target || directory.startsWith(`${target}${path.sep}`) || target.startsWith(`${directory}${path.sep}`)) {
      throw new Error("Migration verification records must be outside renamed roots");
    }
  }
}

function assertPinnedDirectory(directory: PinnedDirectory): void {
  const stat = fs.fstatSync(directory.fd);
  if (!stat.isDirectory() || stat.dev !== directory.dev || stat.ino !== directory.ino
    || stat.uid !== directory.uid || (stat.mode & 0o777) !== 0o700) {
    throw new Error("Migration verification directory identity changed");
  }
  const current = pinDirectoryPath(directory.path);
  try {
    const reopened = fs.fstatSync(current);
    if (reopened.dev !== directory.dev || reopened.ino !== directory.ino) {
      throw new Error("Migration verification directory identity changed");
    }
  } finally {
    fs.closeSync(current);
  }
}

function pinDirectoryPath(directory: string): number {
  const root = path.parse(directory).root;
  let fd = openRootDirectory(root);
  try {
    for (const name of directory.slice(root.length).split(path.sep).filter(Boolean)) {
      const child = openExistingDirectoryAt(fd, name);
      if (child === null) throw new Error("Migration directory is unsafe");
      fs.closeSync(fd);
      fd = child;
    }
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function closePinnedDirectory(directory: PinnedDirectory): void {
  fs.closeSync(directory.fd);
}

function canonicalDirectory(value: string): string {
  const resolved = fs.realpathSync(path.resolve(value));
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Migration directory is unsafe");
  return resolved;
}

function writePrivateJson(directory: PinnedDirectory, name: string, value: unknown): void {
  const temporary = `.migration-record-${randomUUID()}.tmp`;
  assertPinnedDirectory(directory);
  const fd = createExclusiveRegularFileAt(directory.fd, temporary, 0o600);
  if (fd === null) throw new Error("Migration external record collision");
  try {
    fs.writeFileSync(fd, `${canonical(value)}\n`, "utf8");
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  try {
    assertPinnedDirectory(directory);
    if (!linkExclusiveAt(directory.fd, temporary, directory.fd, name)) {
      throw new Error("Migration external record already exists");
    }
    assertPinnedDirectory(directory);
    unlinkAt(directory.fd, temporary, false);
    assertPinnedDirectory(directory);
    fs.fsyncSync(directory.fd);
  } catch (error) {
    try { unlinkAt(directory.fd, temporary, false, true); } catch { /* Original error owns the boundary. */ }
    throw error;
  }
}

function readPinnedFile(directory: PinnedDirectory, name: string): Buffer | null {
  assertPinnedDirectory(directory);
  const entry = readFileAt(directory.fd, name);
  assertPinnedDirectory(directory);
  return entry?.bytes ?? null;
}

function readPrivateFile(directory: PinnedDirectory, name: string): string {
  const entry = readFileAt(directory.fd, name);
  if (!entry || entry.mode !== 0o600 || entry.uid !== directory.uid) {
    throw new Error("Migration external record is invalid");
  }
  assertPinnedDirectory(directory);
  return entry.bytes.toString("utf8");
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

function secretInventoryFacts(values: readonly SecretInventoryEntry[]): SecretInventoryFact[] {
  return values.map(({ ref, kind }) => ({ ref, kind }))
    .sort((left, right) => left.ref.localeCompare(right.ref) || left.kind.localeCompare(right.kind));
}

function isSecretInventoryFacts(value: unknown): value is SecretInventoryFact[] {
  return Array.isArray(value)
    && value.every((entry) => entry !== null && typeof entry === "object"
      && Object.keys(entry).sort().join(",") === "kind,ref"
      && typeof (entry as { ref?: unknown }).ref === "string"
      && new Set(["text", "file"]).has(String((entry as { kind?: unknown }).kind)))
    && canonical(value) === canonical([...value].sort((left, right) =>
      left.ref.localeCompare(right.ref) || left.kind.localeCompare(right.kind)));
}

function canonicalRow(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRow).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalRow(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
