import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import {
  acquireMaintenanceLock,
  releaseMaintenanceLock,
  sourceLocatorHash,
} from "../../cli/lib/migration/inventory.js";
import {
  freezeMigration,
  verifyMigration,
} from "../../cli/lib/migration/verify.js";
import type { MigrationContext, MigrationLock } from "../../cli/lib/migration/types.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const RUN_ID = "mig_00000000-0000-4000-8000-000000000071";
const SOURCE_ID = "mig_00000000-0000-4000-8000-000000000072";
const ENTRY_ID = "mentry_00000000-0000-4000-8000-000000000073";
const EXTRA_ID = "mentry_00000000-0000-4000-8000-000000000074";
const WORKSPACE_ID = "ws_00000000-0000-4000-8000-000000000075";
const OBJECT_ID = "obj_00000000-0000-4000-8000-000000000076";
const PROJECT_ID = "prj_00000000-0000-4000-8000-000000000077";
const BUILD_ID = "build_00000000-0000-4000-8000-000000000078";
const UNIT_ID = "unit_00000000-0000-4000-8000-000000000079";
const EMPTY_SHA256 = sha256("");

type Fixture = {
  root: TmpRoot;
  ctx: MigrationContext;
  lock: MigrationLock;
  sourceRoot: string;
  storeRoot: string;
  verificationDir: string;
  objectPath: string;
};

let fixtures: Fixture[] = [];

afterEach(() => {
  for (const fixture of fixtures) {
    try { fixture.ctx.db.close(); } catch { /* Freeze owns the final close. */ }
    if (fs.existsSync(fixture.lock.path)) releaseMaintenanceLock(fixture.lock);
    fixture.root.cleanup();
  }
  fixtures = [];
});

describe("migration freeze and read-only verification", () => {
  test.each([
    ["missing Object", (fixture: Fixture) => fs.rmSync(fixture.objectPath), OBJECT_ID],
    ["corrupt Object hash", (fixture: Fixture) => fs.writeFileSync(fixture.objectPath, "xx"), OBJECT_ID],
    ["changed source control", (fixture: Fixture) => fs.writeFileSync(path.join(fixture.sourceRoot, "control.json"), "[]"), ENTRY_ID],
    ["absolute live row", (fixture: Fixture) => fixture.ctx.db.prepare("UPDATE workspaces SET metadata_json = ? WHERE id = ?").run(JSON.stringify({ path: "/Users/customer/private" }), WORKSPACE_ID), WORKSPACE_ID],
    ["data URL row", (fixture: Fixture) => fixture.ctx.db.prepare("UPDATE workspaces SET metadata_json = ? WHERE id = ?").run(JSON.stringify({ image: "data:image/png;base64,eA==" }), WORKSPACE_ID), WORKSPACE_ID],
    ["plaintext secret row", (fixture: Fixture) => fixture.ctx.db.prepare("UPDATE workspaces SET metadata_json = ? WHERE id = ?").run(JSON.stringify({ token: "fixture-plaintext-token" }), WORKSPACE_ID), WORKSPACE_ID],
    ["broken Build chain", (fixture: Fixture) => insertBrokenBuild(fixture), BUILD_ID],
    ["broken Unit chain", (fixture: Fixture) => insertBrokenUnit(fixture), UNIT_ID],
  ] as const)("blocks %s with the exact entity", async (_label, mutate, entityId) => {
    const fixture = setup();
    mutate(fixture);

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(entityId);
  });

  test.each([
    ["unclassified empty file", { unclassifiedEmpty: true }, EXTRA_ID],
    ["unimported Desktop secret", { pendingSecret: true }, EXTRA_ID],
  ] as const)("blocks %s with the exact entry", async (_label, options, entryId) => {
    const fixture = setup(options);

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(entryId);
  });

  test("rejects an internal verification directory without creating it", async () => {
    const fixture = setup();
    const internal = path.join(fixture.storeRoot, "verification");

    await expect(freezeMigration(fixture.ctx, { verificationDir: internal }))
      .rejects.toThrow("outside renamed roots");
    expect(fs.existsSync(internal)).toBe(false);
  });

  test("freezes once and produces repeatable byte-neutral content verification", async () => {
    const fixture = setup();
    const frozen = await freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir });
    expect(frozen.consumers).toEqual({ farm: null });
    expect(fs.statSync(frozen.recordPath).mode & 0o777).toBe(0o600);
    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow("Migration is already frozen");
    const before = databaseFiles(fixture.storeRoot);

    const first = verifyMigration({
      storeRoot: fixture.storeRoot,
      runId: RUN_ID,
      verificationDir: fixture.verificationDir,
    });
    const second = verifyMigration({
      storeRoot: fixture.storeRoot,
      runId: RUN_ID,
      verificationDir: fixture.verificationDir,
    });

    expect(databaseFiles(fixture.storeRoot)).toEqual(before);
    expect(first.id).not.toBe(second.id);
    expect(first.contentDigest).toBe(second.contentDigest);
    expect(first.databaseDigest).toBe(second.databaseDigest);
    expect(first.inventoryDigests).toEqual(second.inventoryDigests);
    expect(first.consumers).toEqual({ farm: null });
    expect(first.blockers).toEqual([]);
    expect(first).toMatchObject({ sourceEntries: 1, coveredEntries: 1, sourceBytes: 2, accountedBytes: 2 });
    expect(fs.statSync(first.recordPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(second.recordPath).mode & 0o777).toBe(0o600);
  });
});

function setup(options: { unclassifiedEmpty?: boolean; pendingSecret?: boolean } = {}): Fixture {
  const root = makeTmpRoot("ralphy-migration-verify");
  let sourceRoot = path.join(root.dir, "source", ".ralphy");
  let storeRoot = path.join(root.dir, ".ralphy");
  const verificationDir = path.join(root.dir, "verification");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(storeRoot, { recursive: true });
  sourceRoot = fs.realpathSync(sourceRoot);
  storeRoot = fs.realpathSync(storeRoot);
  fs.writeFileSync(path.join(sourceRoot, "control.json"), "{}");
  if (options.unclassifiedEmpty) fs.writeFileSync(path.join(sourceRoot, "unknown.empty"), "");
  if (options.pendingSecret) fs.writeFileSync(path.join(sourceRoot, "claude-api-key.bin"), "fixture-secret");
  const sourceStat = fs.statSync(sourceRoot);
  const controlStat = fs.statSync(path.join(sourceRoot, "control.json"));
  const db = openDomainDbAt(storeRoot);
  const bucket = `buckets/${WORKSPACE_ID}/shared`;
  const key = `objects/${OBJECT_ID}.json`;
  const objectPath = path.join(storeRoot, bucket, key);
  fs.mkdirSync(path.dirname(objectPath), { recursive: true });
  fs.writeFileSync(objectPath, "{}");
  db.prepare(
    "INSERT INTO workspaces (id, slug, name, metadata_json, created_at, updated_at) VALUES (?, 'fixture', 'Fixture', '{}', 1, 1)",
  ).run(WORKSPACE_ID);
  db.prepare(
    `INSERT INTO objects
     (id, workspace_id, backend, bucket, key, sha256, mime, bytes, storage_class, original_name, metadata_json, created_at)
     VALUES (?, ?, 'local', ?, ?, ?, 'application/json', 2, 'durable', 'control.json', '{}', 1)`,
  ).run(OBJECT_ID, WORKSPACE_ID, bucket, key, sha256("{}"));
  const entries = [{
    id: ENTRY_ID,
    path: "control.json",
    disposition: "domain",
    state: "imported",
    bytes: 2,
    sha: sha256("{}"),
    stat: controlStat,
    raw: OBJECT_ID,
  }];
  if (options.unclassifiedEmpty) {
    entries.push({
      id: EXTRA_ID,
      path: "unknown.empty",
      disposition: "system",
      state: "excluded",
      bytes: 0,
      sha: EMPTY_SHA256,
      stat: fs.statSync(path.join(sourceRoot, "unknown.empty")),
      raw: null as unknown as string,
    });
  }
  if (options.pendingSecret) {
    const file = path.join(sourceRoot, "claude-api-key.bin");
    entries.push({
      id: EXTRA_ID,
      path: "claude-api-key.bin",
      disposition: "secret-recovery-only",
      state: "inventoried",
      bytes: fs.statSync(file).size,
      sha: sha256(fs.readFileSync(file)),
      stat: fs.statSync(file),
      raw: null as unknown as string,
    });
  }
  const inventoryDigest = createHash("sha256").update(entries.map((entry) => [
    sourceLocatorHash("ralphy", entry.path), "file", entry.disposition,
    String(entry.stat.dev), String(entry.stat.ino), String(entry.stat.mode),
    String(entry.bytes), String(Math.trunc(entry.stat.mtimeMs)), entry.sha,
  ].join("\0")).sort().join("\n"), "utf8").digest("hex");
  db.prepare(
    `INSERT INTO migration_runs
     (id, stage_root_rel, recovery_root_rel, phase, source_entry_count, source_file_count,
      source_bytes, inventory_completed_at, created_at, updated_at)
     VALUES (?, 'stage/.ralphy', 'recovery/.ralphy', 'relations', ?, ?, ?, 1, 1, 1)`,
  ).run(RUN_ID, entries.length, entries.length, entries.reduce((sum, entry) => sum + entry.bytes, 0));
  db.prepare(
    `INSERT INTO migration_sources
     (id, migration_run_id, source_kind, source_label, canonical_path_hash,
      source_device, source_inode, source_mode, inventory_digest, created_at)
     VALUES (?, ?, 'ralphy', 'source-ralphy', ?, ?, ?, ?, ?, 1)`,
  ).run(
    SOURCE_ID,
    RUN_ID,
    sha256(fs.realpathSync(sourceRoot)),
    String(sourceStat.dev),
    String(sourceStat.ino),
    sourceStat.mode,
    inventoryDigest,
  );
  for (const entry of entries) {
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, sha256, target_refs_json, raw_evidence_object_id, state,
        terminal_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'file', 'ralphy', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    ).run(
      entry.id, RUN_ID, SOURCE_ID, entry.path, sourceLocatorHash("ralphy", entry.path),
      entry.disposition, String(entry.stat.dev), String(entry.stat.ino), entry.stat.mode,
      entry.bytes, Math.trunc(entry.stat.mtimeMs), entry.sha,
      entry.raw ? JSON.stringify([entry.raw]) : "[]", entry.raw,
      entry.state, entry.state === "inventoried" ? null : 1,
    );
  }
  const lock = acquireMaintenanceLock({ sourcePath: sourceRoot, runId: RUN_ID });
  const fixture = {
    root,
    ctx: {
      db,
      storeRoot,
      sourceRoots: [{ id: "source-ralphy", kind: "ralphy" as const, path: sourceRoot, device: BigInt(sourceStat.dev), inode: BigInt(sourceStat.ino) }],
      runId: RUN_ID,
    },
    lock,
    sourceRoot,
    storeRoot,
    verificationDir,
    objectPath,
  };
  fixtures.push(fixture);
  return fixture;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function databaseFiles(storeRoot: string): unknown[] {
  const database = path.join(storeRoot, "ralphy.db");
  return [database, `${database}-wal`, `${database}-shm`].map((file) => {
    if (!fs.existsSync(file)) return { file: path.basename(file), exists: false };
    const stat = fs.statSync(file);
    return {
      file: path.basename(file),
      exists: true,
      bytes: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: sha256(fs.readFileSync(file)),
    };
  });
}

function insertBrokenBuild(fixture: Fixture): void {
  const db = fixture.ctx.db;
  const compositionId = "comp_00000000-0000-4000-8000-000000000080";
  const revisionId = "crev_00000000-0000-4000-8000-000000000081";
  db.prepare(
    "INSERT INTO projects (id, workspace_id, slug, name, created_at, updated_at) VALUES (?, ?, 'broken-build', 'Broken', 1, 1)",
  ).run(PROJECT_ID, WORKSPACE_ID);
  db.prepare(
    "INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at) VALUES (?, ?, 'broken', 'video', 1, 1)",
  ).run(compositionId, PROJECT_ID);
  db.prepare(
    `INSERT INTO composition_revisions
     (id, composition_id, revision_no, state, engine, engine_config_json, created_at)
     VALUES (?, ?, 1, 'draft', 'fixture', '{}', 1)`,
  ).run(revisionId, compositionId);
  for (const { name } of db.query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'composition_revisions'",
  ).all()) db.exec(`DROP TRIGGER "${name}"`);
  db.prepare(
    "UPDATE composition_revisions SET state = 'sealed', manifest_sha256 = ?, sealed_at = 1 WHERE id = ?",
  ).run("a".repeat(64), revisionId);
  db.prepare(
    `INSERT INTO builds (id, composition_revision_id, state, profile_json, created_at, started_at, ended_at)
     VALUES (?, ?, 'succeeded', '{}', 1, 1, 1)`,
  ).run(BUILD_ID, revisionId);
}

function insertBrokenUnit(fixture: Fixture): void {
  fixture.ctx.db.prepare(
    `INSERT INTO units (id, workspace_id, slug, format, created_at, updated_at)
     VALUES (?, ?, 'broken-unit', 'post', 1, 1)`,
  ).run(UNIT_ID, WORKSPACE_ID);
  fixture.ctx.db.prepare(
    `INSERT INTO unit_revisions (id, unit_id, revision_no, created_at)
     VALUES ('urev_00000000-0000-4000-8000-000000000082', ?, 1, 1)`,
  ).run(UNIT_ID);
}
