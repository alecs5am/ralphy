import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import { createSecretStore, type KeyProvider } from "../../cli/lib/store/secrets.js";
import { completeMigrationSecretImport } from "../../cli/lib/migration/import.js";
import {
  acquireMaintenanceLock,
  releaseMaintenanceLock,
  setMigrationProcessToolsForTesting,
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
const LEGACY_RUN_ID = "run_00000000-0000-4000-8000-00000000007a";
const RUN_OBJECT_ID = "robj_00000000-0000-4000-8000-00000000007b";
const SUPPLEMENTAL_PROJECT_ID = "prj_00000000-0000-4000-8000-00000000007c";
const SUPPLEMENTAL_COMPOSITION_ID = "comp_00000000-0000-4000-8000-00000000007d";
const MISSING_SUPPLEMENTAL_COMPOSITION_ID = "comp_00000000-0000-4000-8000-00000000007e";
const SUPPLEMENTAL_REVISION_ID = "crev_00000000-0000-4000-8000-00000000007f";
const ORDINARY_COMPOSITION_ID = "comp_00000000-0000-4000-8000-000000000080";
const ORDINARY_REVISION_ID = "crev_00000000-0000-4000-8000-000000000081";
const ORDINARY_RUN_ID = "run_00000000-0000-4000-8000-000000000082";
const GENERATION_ENTRY_ID = "mentry_00000000-0000-4000-8000-000000000091";
const SOURCE_ENTRY_ID = "mentry_00000000-0000-4000-8000-000000000092";
const RENDER_ENTRY_ID = "mentry_00000000-0000-4000-8000-000000000093";
const GENERATION_OBJECT_ID = "obj_00000000-0000-4000-8000-000000000094";
const SOURCE_OBJECT_ID = "obj_00000000-0000-4000-8000-000000000095";
const RENDER_OBJECT_ID = "obj_00000000-0000-4000-8000-000000000096";
const GENERATION_DOCUMENT_ID = "doc_00000000-0000-4000-8000-000000000097";
const GENERATION_REVISION_ID = "drev_00000000-0000-4000-8000-000000000098";
const SOURCE_ARTIFACT_ID = "art_00000000-0000-4000-8000-000000000099";
const SOURCE_ARTIFACT_REVISION_ID = "arev_00000000-0000-4000-8000-00000000009a";
const RENDER_ARTIFACT_ID = "art_00000000-0000-4000-8000-00000000009b";
const RENDER_ARTIFACT_REVISION_ID = "arev_00000000-0000-4000-8000-00000000009c";
const GENERATION_RUN_ID = "run_00000000-0000-4000-8000-00000000009d";
const GENERATION_RUN_OBJECT_ID = "robj_00000000-0000-4000-8000-00000000009e";
const EMPTY_SHA256 = sha256("");
const SECRET_REF = `provider/test/workspace/${WORKSPACE_ID}/token`;
const SECRET_VALUE = "fixture-authenticated-secret-value";
const secretKey = Buffer.alloc(32, 71);
const keyProvider: KeyProvider = {
  async lookupKey() { return secretKey; },
  async createKey() { return secretKey; },
};

type Fixture = {
  root: TmpRoot;
  ctx: MigrationContext;
  lock: MigrationLock;
  sourceRoot: string;
  storeRoot: string;
  verificationDir: string;
  objectPath: string;
  restoreProcessTools: () => void;
};

let fixtures: Fixture[] = [];

afterEach(() => {
  for (const fixture of [...fixtures].reverse()) {
    try { fixture.ctx.db.close(); } catch { /* Freeze owns the final close. */ }
    if (fs.existsSync(fixture.lock.path)) releaseMaintenanceLock(fixture.lock);
    fixture.restoreProcessTools();
    fixture.root.cleanup();
  }
  fixtures = [];
});

describe("migration freeze and read-only verification", () => {
  test.each([
    ["path", { path: "objects/mismatched.json" }],
    ["bytes", { bytes: 1 }],
    ["sha256", { sha256: "a".repeat(64) }],
    ["mime", { mime: "text/plain" }],
  ] as const)("rejects a promoted RunObject with mismatched %s", async (_field, override) => {
    const fixture = setup();
    installPromotedRunObject(fixture, override);

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(RUN_OBJECT_ID);
  });

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

  test("accepts a zero-byte system file a named rule recognizes", async () => {
    const fixture = setup({ recognizedEmpty: true });

    await freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir });

    const report = verifyMigration({
      storeRoot: fixture.storeRoot,
      runId: RUN_ID,
      verificationDir: fixture.verificationDir,
    });
    expect(report.blockers).toEqual([]);
    expect(report).toMatchObject({ sourceEntries: 2, coveredEntries: 2 });
  });

  test("rejects an internal verification directory without creating it", async () => {
    const fixture = setup();
    const internal = path.join(fixture.storeRoot, "verification");

    await expect(freezeMigration(fixture.ctx, { verificationDir: internal }))
      .rejects.toThrow("outside renamed roots");
    expect(fs.existsSync(internal)).toBe(false);
  });

  test("rejects another process whose cwd is inside the stage", async () => {
    const fixture = setup();
    const child = Bun.spawn(["/bin/sleep", "30"], {
      cwd: fixture.storeRoot,
      stdout: "ignore",
      stderr: "ignore",
    });
    const restore = installProcessTools(
      fixture.root.dir,
      child.pid,
      fixture.storeRoot,
    );
    try {
      await Bun.sleep(100);
      await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
        .rejects.toThrow(/quiescent/u);
    } finally {
      restore();
      child.kill();
      await child.exited;
    }
  });

  test("abandons freeze when a source changes between closed snapshots", async () => {
    const fixture = setup();
    const input = {
      verificationDir: fixture.verificationDir,
      afterClosedSnapshot(index: number) {
        if (index === 1) fs.writeFileSync(path.join(fixture.sourceRoot, "control.json"), "[]");
      },
    } as Parameters<typeof freezeMigration>[1];

    await expect(freezeMigration(fixture.ctx, input)).rejects.toThrow(ENTRY_ID);
    expect(fs.existsSync(path.join(fixture.verificationDir, `migration-${RUN_ID}.freeze.json`))).toBe(false);
  });

  test("abandons freeze when a source changes after the second closed snapshot", async () => {
    const fixture = setup();
    const recordPath = path.join(fixture.verificationDir, `migration-${RUN_ID}.freeze.json`);

    await expect(freezeMigration(fixture.ctx, {
      verificationDir: fixture.verificationDir,
      afterClosedSnapshot(index: number) {
        if (index === 2) fs.writeFileSync(path.join(fixture.sourceRoot, "control.json"), "[]");
      },
    })).rejects.toThrow(ENTRY_ID);
    expect(fs.existsSync(recordPath)).toBe(false);
  });

  test("blocks Farm namespace consumer state", async () => {
    const fixture = setup();
    fixture.ctx.db.prepare(
      `INSERT INTO consumer_principals (id, namespace, identity_digest, created_at)
       VALUES ('farm-principal', 'farm', ?, 1)`,
    ).run("a".repeat(64));

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow("farm-principal");
  });

  test("rejects a symlinked or non-private verification directory", async () => {
    const symlinkFixture = setup();
    const target = path.join(symlinkFixture.root.dir, "records-target");
    const symlink = path.join(symlinkFixture.root.dir, "records-link");
    fs.mkdirSync(target, { mode: 0o700 });
    fs.symlinkSync(target, symlink);
    await expect(freezeMigration(symlinkFixture.ctx, { verificationDir: symlink }))
      .rejects.toThrow(/unsafe|private/u);

    const modeFixture = setup();
    fs.mkdirSync(modeFixture.verificationDir, { mode: 0o755 });
    await expect(freezeMigration(modeFixture.ctx, { verificationDir: modeFixture.verificationDir }))
      .rejects.toThrow(/private/u);
  });

  test("rejects a verification-directory ancestor swap after pinning", async () => {
    const fixture = setup();
    const parent = path.join(fixture.root.dir, "external-parent");
    const moved = `${parent}-moved`;
    const verificationDir = path.join(parent, "verification");
    fs.mkdirSync(parent, { mode: 0o700 });

    await expect(freezeMigration(fixture.ctx, {
      verificationDir,
      afterVerificationDirectoryOpen() {
        fs.renameSync(parent, moved);
        fs.mkdirSync(parent, { mode: 0o700 });
        fs.mkdirSync(verificationDir, { mode: 0o700 });
      },
    })).rejects.toThrow(/changed|unsafe/u);
    expect(fs.existsSync(path.join(moved, "verification", `migration-${RUN_ID}.freeze.json`))).toBe(false);
  });

  test("rejects a copied freeze record under an excluded source root", async () => {
    const fixture = setup();
    const frozen = await freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir });
    const copiedDirectory = path.join(fixture.sourceRoot, "recovery-records");
    fs.mkdirSync(copiedDirectory, { mode: 0o700 });
    const copiedRecord = path.join(copiedDirectory, path.basename(frozen.recordPath));
    fs.copyFileSync(frozen.recordPath, copiedRecord);
    fs.chmodSync(copiedRecord, 0o600);

    expect(() => verifyMigration({
      storeRoot: fixture.storeRoot,
      runId: RUN_ID,
      verificationDir: copiedDirectory,
    })).toThrow(/directory identity/u);
  });

  test("rejects a byte-identical staged store copied to a new inode", async () => {
    const fixture = setup();
    await freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir });
    const copiedStore = path.join(fixture.root.dir, "copied-stage", ".ralphy");
    fs.cpSync(fixture.storeRoot, copiedStore, { recursive: true, preserveTimestamps: true });

    expect(() => verifyMigration({
      storeRoot: copiedStore,
      runId: RUN_ID,
      verificationDir: fixture.verificationDir,
    })).toThrow(/store root identity/u);
  });

  test("accepts the frozen staged store after a same-inode rename", async () => {
    const fixture = setup();
    await freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir });
    const renamedStore = path.join(fixture.root.dir, "renamed-stage", ".ralphy");
    fs.mkdirSync(path.dirname(renamedStore));
    fs.renameSync(fixture.storeRoot, renamedStore);

    expect(() => verifyMigration({
      storeRoot: renamedStore,
      runId: RUN_ID,
      verificationDir: fixture.verificationDir,
    })).not.toThrow();
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

  test("accepts secret-looking documentation placeholders", async () => {
    const fixture = setup();
    fixture.ctx.db.prepare("UPDATE workspaces SET metadata_json = ? WHERE id = ?")
      .run(JSON.stringify({ css: "sk-keyframes", example: "xi-api-key: $XI_API_KEY" }), WORKSPACE_ID);

    await expect(freezeMigration(fixture.ctx, {
      verificationDir: fixture.verificationDir,
    })).resolves.toBeDefined();
  });

  test("verification detects Object mode drift", async () => {
    const fixture = setup();
    await freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir });
    fs.chmodSync(fixture.objectPath, 0o600);

    expect(() => verifyMigration({
      storeRoot: fixture.storeRoot,
      runId: RUN_ID,
      verificationDir: fixture.verificationDir,
    })).toThrow(/MIGRATION_CONTENT_DRIFT/u);
  });

  test("authenticates exact secret plans and rejects plaintext on any staged surface", async () => {
    const fixture = setup({ pendingSecret: true });
    await importFixtureSecret(fixture);
    const leak = "reports/verification.log";
    fs.mkdirSync(path.join(fixture.storeRoot, "reports"));
    fs.writeFileSync(path.join(fixture.storeRoot, leak), SECRET_VALUE);

    await expect(freezeMigration(fixture.ctx, {
      verificationDir: fixture.verificationDir,
      keyProvider,
    })).rejects.toThrow(sha256(leak));
    expect(fs.existsSync(path.join(fixture.verificationDir, `migration-${RUN_ID}.freeze.json`))).toBe(false);
  });

  test("authenticates the encrypted envelope without scanning its ciphertext as plaintext", async () => {
    const fixture = setup({ pendingSecret: true });
    await importFixtureSecret(fixture);

    const frozen = await freezeMigration(fixture.ctx, {
      verificationDir: fixture.verificationDir,
      keyProvider,
    });
    expect(frozen.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(fs.statSync(path.join(fixture.storeRoot, "secrets.enc")).mode & 0o777).toBe(0o600);
    expect(() => verifyMigration({
      storeRoot: fixture.storeRoot,
      runId: RUN_ID,
      verificationDir: fixture.verificationDir,
    })).not.toThrow();
  });

  test("accepts an imported secret whose source hash was intentionally omitted", async () => {
    const fixture = setup({ pendingSecret: true, unhashedSecret: true });
    await importFixtureSecret(fixture);

    await expect(freezeMigration(fixture.ctx, {
      verificationDir: fixture.verificationDir,
      keyProvider,
    })).resolves.toBeDefined();
  });

  test("zeroes retained decrypted and stage-scan buffers", async () => {
    const fixture = setup({ pendingSecret: true });
    await importFixtureSecret(fixture);
    const released: Buffer[] = [];
    const input = {
      verificationDir: fixture.verificationDir,
      keyProvider,
      afterPlaintextBufferReleased(buffer: Buffer) { released.push(buffer); },
    } as Parameters<typeof freezeMigration>[1];

    await freezeMigration(fixture.ctx, input);

    expect(released.length).toBeGreaterThan(3);
    expect(released.every((buffer) => buffer.every((byte) => byte === 0))).toBe(true);
  });

  test("rejects an authenticated secret ref absent from immutable migration plans", async () => {
    const fixture = setup({ pendingSecret: true });
    await importFixtureSecret(fixture);
    const extraRef = `provider/test/workspace/${WORKSPACE_ID}/extra`;
    await createSecretStore({ dataRoot: fixture.storeRoot, keyProvider }).set(extraRef, "extra-value");

    await expect(freezeMigration(fixture.ctx, {
      verificationDir: fixture.verificationDir,
      keyProvider,
    })).rejects.toThrow(sha256(extraRef));
  });

  test("rejects a supplemental migration ref whose target is missing", async () => {
    const fixture = setup();
    fixture.ctx.db.prepare(
      `INSERT INTO migration_entry_supplemental_refs
       (migration_entry_id, target_ref, repair_key, created_at)
       VALUES (?, ?, 'task-2d2-v1', 2)`,
    ).run(ENTRY_ID, MISSING_SUPPLEMENTAL_COMPOSITION_ID);

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(ENTRY_ID);
  });

  test("uses supplemental refs semantically without changing frozen JSON accounting", async () => {
    const fixture = setup();
    insertTask2d2Composition(fixture);
    insertOrdinaryCompositionAndRun(fixture);
    fixture.ctx.db.prepare(
      `INSERT INTO migration_entry_supplemental_refs
       (migration_entry_id, target_ref, repair_key, created_at)
       VALUES (?, ?, 'task-2d2-v1', 2), (?, ?, 'task-2d2-v1', 2)`,
    ).run(
      ENTRY_ID,
      SUPPLEMENTAL_COMPOSITION_ID,
      ENTRY_ID,
      SUPPLEMENTAL_REVISION_ID,
    );
    installProductionAccountingFact(fixture);

    await freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir });
  });

  test("deduplicates a semantic ref present in original and supplemental accounting", async () => {
    const fixture = setup({
      additionalRefs: [SUPPLEMENTAL_COMPOSITION_ID, SUPPLEMENTAL_REVISION_ID],
    });
    insertTask2d2Composition(fixture);
    fixture.ctx.db.prepare(
      `INSERT INTO migration_entry_supplemental_refs
       (migration_entry_id, target_ref, repair_key, created_at)
       VALUES (?, ?, 'task-2d2-v1', 2), (?, ?, 'task-2d2-v1', 2)`,
    ).run(
      ENTRY_ID,
      SUPPLEMENTAL_COMPOSITION_ID,
      ENTRY_ID,
      SUPPLEMENTAL_REVISION_ID,
    );

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .resolves.toBeDefined();
  });

  test("rejects a Task 2D2 repair target missing its required supplemental association", async () => {
    const fixture = setup();
    insertTask2d2Composition(fixture);
    fixture.ctx.db.prepare(
      `INSERT INTO migration_entry_supplemental_refs
       (migration_entry_id, target_ref, repair_key, created_at)
       VALUES (?, ?, 'task-2d2-v1', 2)`,
    ).run(ENTRY_ID, SUPPLEMENTAL_REVISION_ID);

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(SUPPLEMENTAL_COMPOSITION_ID);
  });

  test("rejects a valid mutable Job substituted after its immutable accounting fact", async () => {
    const fixture = setup();
    installJobAccountingFact(fixture);
    fixture.ctx.db.prepare("UPDATE jobs SET status = 'running', started_at = 3 WHERE id = 71071").run();

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(ENTRY_ID);
  });

  test("rejects a valid production entity substituted after its immutable accounting fact", async () => {
    const fixture = setup();
    installProductionAccountingFact(fixture);
    fixture.ctx.db.prepare("UPDATE objects SET original_name = 'substituted.json' WHERE id = ?").run(OBJECT_ID);

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(ENTRY_ID);
  });

  test("freeze verifier rejects persisted Artifact-only HyperFrames provenance", async () => {
    const fixture = setup({ artifactOnlyGeneration: true });
    installArtifactOnlyGenerationAccounting(fixture);
    expect(fixture.ctx.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM compositions",
    ).get()?.count).toBe(0);
    expect(fixture.ctx.db.query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM builds",
    ).get()?.count).toBe(0);

    let error: Error | null = null;
    try {
      await freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir });
    } catch (value) {
      error = value as Error;
    }
    expect(error).not.toBeNull();
    expect(error?.message).toBe(
      `Migration activation blocked: MIGRATION_PRODUCTION_ACCOUNTING:${GENERATION_ENTRY_ID}`,
    );
    expect(fs.existsSync(path.join(
      fixture.verificationDir,
      `migration-${RUN_ID}.freeze.json`,
    ))).toBe(false);
  });

  test("rejects a non-Unit graph omitted from both its accounting fact and index", async () => {
    const fixture = setup();
    installOmittedBuildAccountingIndex(fixture);

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(ENTRY_ID);
  });

  test("does not satisfy source coverage with another migration run's issue", async () => {
    const fixture = setup();
    installCrossRunProductionIssue(fixture);

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(ENTRY_ID);
  });

  test("does not satisfy record coverage with a file-level issue", async () => {
    const fixture = setup();
    fixture.ctx.db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, code, severity, line_no, detail_json, created_at)
       VALUES ('miss_file-level-build-issue', ?, 'MIGRATION_BUILD_BINDING_AMBIGUOUS', 'review', NULL, ?, 2)`,
    ).run(RUN_ID, JSON.stringify({ sourceLocatorHash: sourceLocatorHash("ralphy", "control.json") }));
    installIssueExpectationIndex(fixture, "miss_file-level-build-issue");

    await expect(freezeMigration(fixture.ctx, { verificationDir: fixture.verificationDir }))
      .rejects.toThrow(ENTRY_ID);
  });
});

function setup(options: {
  unclassifiedEmpty?: boolean;
  pendingSecret?: boolean;
  unhashedSecret?: boolean;
  recognizedEmpty?: boolean;
  artifactOnlyGeneration?: boolean;
  additionalRefs?: readonly string[];
} = {}): Fixture {
  const root = makeTmpRoot("ralphy-migration-verify");
  let sourceRoot = path.join(root.dir, "source", ".ralphy");
  let storeRoot = path.join(root.dir, ".ralphy");
  const verificationDir = path.join(root.dir, "verification");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(storeRoot, { recursive: true });
  sourceRoot = fs.realpathSync(sourceRoot);
  storeRoot = fs.realpathSync(storeRoot);
  fs.writeFileSync(path.join(sourceRoot, "control.json"), "{}");
  const generationBody = JSON.stringify({
    timestamp: "2026-07-10T10:00:00.000Z",
    endpoint: "hyperframes-render",
    input: { project: "incident", composition: "index.html" },
    output: { local: "render/final.mp4", bytes: 13 },
    status: "ok",
  });
  if (options.artifactOnlyGeneration) {
    fs.mkdirSync(path.join(sourceRoot, "workspaces/fixture/projects/incident/logs"), { recursive: true });
    fs.mkdirSync(path.join(sourceRoot, "workspaces/fixture/projects/incident/render"), { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, "workspaces/fixture/projects/incident/index.html"), "<html></html>");
    fs.writeFileSync(path.join(sourceRoot, "workspaces/fixture/projects/incident/render/final.mp4"), "render-output");
    fs.writeFileSync(path.join(sourceRoot, "workspaces/fixture/projects/incident/logs/generations.jsonl"), `${generationBody}\n`);
  }
  if (options.unclassifiedEmpty) fs.writeFileSync(path.join(sourceRoot, "unknown.empty"), "");
  if (options.recognizedEmpty) fs.writeFileSync(path.join(sourceRoot, ".DS_Store"), "");
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
  const incidentEntries: Array<{
    id: string;
    path: string;
    kind: "directory" | "file";
    disposition: string;
    state: string;
    bytes: number;
    sha: string;
    stat: fs.Stats;
    raw: string | null;
    refs: string[];
  }> = [];
  if (options.artifactOnlyGeneration) {
    db.prepare(
      "INSERT INTO projects (id, workspace_id, slug, name, created_at, updated_at) VALUES (?, ?, 'incident', 'Incident', 1, 1)",
    ).run(PROJECT_ID, WORKSPACE_ID);
    const addObject = (id: string, originalName: string, body: string): string => {
      const incidentBucket = `buckets/${WORKSPACE_ID}/projects/${PROJECT_ID}`;
      const objectKey = `objects/${id}${path.extname(originalName)}`;
      fs.mkdirSync(path.join(storeRoot, incidentBucket, "objects"), { recursive: true });
      fs.writeFileSync(path.join(storeRoot, incidentBucket, objectKey), body);
      db.prepare(
        `INSERT INTO objects
         (id, workspace_id, project_id, backend, bucket, key, sha256, mime, bytes,
          storage_class, original_name, metadata_json, created_at)
         VALUES (?, ?, ?, 'local', ?, ?, ?, 'application/octet-stream', ?,
                 'durable', ?, '{}', 1)`,
      ).run(id, WORKSPACE_ID, PROJECT_ID, incidentBucket, objectKey, sha256(body), Buffer.byteLength(body), originalName);
      return `${incidentBucket}/${objectKey}`;
    };
    const generationObjectPath = addObject(GENERATION_OBJECT_ID, "generations.jsonl", `${generationBody}\n`);
    addObject(SOURCE_OBJECT_ID, "index.html", "<html></html>");
    addObject(RENDER_OBJECT_ID, "final.mp4", "render-output");
    db.prepare(
      `INSERT INTO documents (id, workspace_id, project_id, kind, slug, title, created_at, updated_at)
       VALUES (?, ?, ?, 'custom', 'generation-line-1', 'generations.jsonl line-1', 1, 1)`,
    ).run(GENERATION_DOCUMENT_ID, WORKSPACE_ID, PROJECT_ID);
    db.prepare(
      `INSERT INTO document_revisions
       (id, document_id, revision_no, format, title, body, content_sha256, created_at)
       VALUES (?, ?, 1, 'json', 'generations.jsonl line-1', ?, ?, 1)`,
    ).run(GENERATION_REVISION_ID, GENERATION_DOCUMENT_ID, generationBody, sha256(generationBody));
    db.prepare("UPDATE documents SET current_revision_id = ? WHERE id = ?")
      .run(GENERATION_REVISION_ID, GENERATION_DOCUMENT_ID);
    for (const [artifactId, revisionId, objectId, slug, kind] of [
      [SOURCE_ARTIFACT_ID, SOURCE_ARTIFACT_REVISION_ID, SOURCE_OBJECT_ID, "incident-source", "html"],
      [RENDER_ARTIFACT_ID, RENDER_ARTIFACT_REVISION_ID, RENDER_OBJECT_ID, "incident-render", "video"],
    ] as const) {
      db.prepare(
        `INSERT INTO artifacts (id, workspace_id, project_id, slug, kind, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
      ).run(artifactId, WORKSPACE_ID, PROJECT_ID, slug, kind);
      db.prepare(
        `INSERT INTO artifact_revisions
         (id, artifact_id, object_id, revision_no, state, metadata_json, created_at)
         VALUES (?, ?, ?, 1, 'working', '{}', 1)`,
      ).run(revisionId, artifactId, objectId);
    }
    db.prepare(
      `INSERT INTO runs (id, workspace_id, project_id, kind, state, created_at)
       VALUES (?, ?, ?, 'legacy-generation-log', 'pending', 1)`,
    ).run(GENERATION_RUN_ID, WORKSPACE_ID, PROJECT_ID);
    db.prepare(
      `INSERT INTO run_objects
       (id, run_id, object_id, path, purpose, state, retention, bytes, sha256, mime, created_at)
       VALUES (?, ?, ?, ?, 'diagnostic', 'promoted', 'keep', ?, ?, 'application/octet-stream', 1)`,
    ).run(
      GENERATION_RUN_OBJECT_ID,
      GENERATION_RUN_ID,
      GENERATION_OBJECT_ID,
      generationObjectPath,
      Buffer.byteLength(`${generationBody}\n`),
      sha256(`${generationBody}\n`),
    );
    for (const [index, relative] of [
      "workspaces",
      "workspaces/fixture",
      "workspaces/fixture/projects",
      "workspaces/fixture/projects/incident",
      "workspaces/fixture/projects/incident/logs",
      "workspaces/fixture/projects/incident/render",
    ].entries()) {
      incidentEntries.push({
        id: `mentry_10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        path: relative,
        kind: "directory",
        disposition: "system",
        state: "excluded",
        bytes: 0,
        sha: null,
        stat: fs.statSync(path.join(sourceRoot, relative)),
        raw: null,
        refs: [],
      });
    }
    for (const [id, relative, disposition, raw, refs] of [
      [GENERATION_ENTRY_ID, "workspaces/fixture/projects/incident/logs/generations.jsonl", "domain", GENERATION_OBJECT_ID, [GENERATION_OBJECT_ID, GENERATION_DOCUMENT_ID, GENERATION_REVISION_ID, GENERATION_RUN_ID, GENERATION_RUN_OBJECT_ID]],
      [SOURCE_ENTRY_ID, "workspaces/fixture/projects/incident/index.html", "object", null, [SOURCE_OBJECT_ID, SOURCE_ARTIFACT_ID, SOURCE_ARTIFACT_REVISION_ID]],
      [RENDER_ENTRY_ID, "workspaces/fixture/projects/incident/render/final.mp4", "object", null, [RENDER_OBJECT_ID, RENDER_ARTIFACT_ID, RENDER_ARTIFACT_REVISION_ID]],
    ] as const) {
      const file = path.join(sourceRoot, relative);
      const body = fs.readFileSync(file);
      incidentEntries.push({
        id,
        path: relative,
        kind: "file",
        disposition,
        state: disposition === "domain" ? "imported" : "verified",
        bytes: body.byteLength,
        sha: sha256(body),
        stat: fs.statSync(file),
        raw,
        refs: [...refs],
      });
    }
  }
  const entries: Array<{
    id: string;
    path: string;
    kind: "directory" | "file";
    disposition: string;
    state: string;
    bytes: number;
    sha: string | null;
    stat: fs.Stats;
    raw: string | null;
    refs: string[];
  }> = [{
    id: ENTRY_ID,
    path: "control.json",
    kind: "file",
    disposition: "domain",
    state: "imported",
    bytes: 2,
    sha: sha256("{}"),
    stat: controlStat,
    raw: OBJECT_ID,
    refs: [OBJECT_ID, ...(options.additionalRefs ?? [])],
  }, ...incidentEntries];
  if (options.unclassifiedEmpty) {
    entries.push({
      id: EXTRA_ID,
      path: "unknown.empty",
      kind: "file",
      disposition: "system",
      state: "excluded",
      bytes: 0,
      sha: EMPTY_SHA256,
      stat: fs.statSync(path.join(sourceRoot, "unknown.empty")),
      raw: null,
      refs: [],
    });
  }
  if (options.recognizedEmpty) {
    entries.push({
      id: EXTRA_ID,
      path: ".DS_Store",
      kind: "file",
      disposition: "system",
      state: "excluded",
      bytes: 0,
      sha: EMPTY_SHA256,
      stat: fs.statSync(path.join(sourceRoot, ".DS_Store")),
      raw: null,
      refs: [],
    });
  }
  if (options.pendingSecret) {
    const file = path.join(sourceRoot, "claude-api-key.bin");
    entries.push({
      id: EXTRA_ID,
      path: "claude-api-key.bin",
      kind: "file",
      disposition: "secret-recovery-only",
      state: "inventoried",
      bytes: fs.statSync(file).size,
      sha: options.unhashedSecret ? null as unknown as string : sha256(fs.readFileSync(file)),
      stat: fs.statSync(file),
      raw: null,
      refs: [],
    });
  }
  const inventoryDigest = createHash("sha256").update(entries.map((entry) => [
    sourceLocatorHash("ralphy", entry.path), entry.kind, entry.disposition,
    String(entry.stat.dev), String(entry.stat.ino), String(entry.stat.mode),
    String(entry.bytes), String(Math.trunc(entry.stat.mtimeMs)), entry.sha,
  ].join("\0")).sort().join("\n"), "utf8").digest("hex");
  db.prepare(
    `INSERT INTO migration_runs
     (id, stage_root_rel, recovery_root_rel, phase, source_entry_count, source_file_count,
      source_bytes, inventory_completed_at, created_at, updated_at)
     VALUES (?, 'stage/.ralphy', 'recovery/.ralphy', 'relations', ?, ?, ?, 1, 1, 1)`,
  ).run(
    RUN_ID,
    entries.length,
    entries.filter((entry) => entry.kind === "file").length,
    entries.reduce((sum, entry) => sum + entry.bytes, 0),
  );
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
       VALUES (?, ?, ?, ?, ?, ?, 'ralphy', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`,
    ).run(
      entry.id, RUN_ID, SOURCE_ID, entry.path, sourceLocatorHash("ralphy", entry.path), entry.kind,
      entry.disposition, String(entry.stat.dev), String(entry.stat.ino), entry.stat.mode,
      entry.bytes, Math.trunc(entry.stat.mtimeMs), entry.sha,
      JSON.stringify([...(entry.refs ?? (entry.raw ? [entry.raw] : []))].sort()), entry.raw,
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
    restoreProcessTools: installProcessTools(root.dir),
  };
  fixtures.push(fixture);
  return fixture;
}

async function importFixtureSecret(fixture: Fixture): Promise<void> {
  const sourceLocator = sourceLocatorHash("ralphy", "claude-api-key.bin");
  fixture.ctx.db.prepare(
    `UPDATE migration_entries SET target_refs_json = ?, updated_at = 2
     WHERE id = ? AND state = 'inventoried'`,
  ).run(JSON.stringify([SECRET_REF]), EXTRA_ID);
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_fixture-secret-plan', ?, 'MIGRATION_SECRET_IMPORT_PLANNED', 'info', ?, 2)`,
  ).run(RUN_ID, JSON.stringify({
    kind: "text",
    refs: [SECRET_REF],
    sourceEntryId: EXTRA_ID,
    sourceLocatorHash: sourceLocator,
  }));
  await createSecretStore({ dataRoot: fixture.storeRoot, keyProvider }).set(SECRET_REF, SECRET_VALUE);
  completeMigrationSecretImport(fixture.ctx.db, {
    runId: RUN_ID,
    sourceEntryId: EXTRA_ID,
    refs: [SECRET_REF],
    kind: "text",
  });
}

function installPromotedRunObject(
  fixture: Fixture,
  override: Partial<{ path: string; bytes: number; sha256: string; mime: string }>,
): void {
  const object = fixture.ctx.db.query<{
    bucket: string;
    key: string;
    bytes: number;
    sha256: string;
    mime: string;
  }, [string]>(
    "SELECT bucket, key, bytes, sha256, mime FROM objects WHERE id = ?",
  ).get(OBJECT_ID)!;
  fixture.ctx.db.prepare(
    `INSERT INTO runs (id, workspace_id, kind, state, created_at)
     VALUES (?, ?, 'fixture', 'pending', 1)`,
  ).run(LEGACY_RUN_ID, WORKSPACE_ID);
  fixture.ctx.db.prepare(
    `INSERT INTO run_objects
     (id, run_id, object_id, path, purpose, state, retention, bytes, sha256, mime, created_at)
     VALUES (?, ?, ?, ?, 'input', 'promoted', 'keep', ?, ?, ?, 1)`,
  ).run(
    RUN_OBJECT_ID,
    LEGACY_RUN_ID,
    OBJECT_ID,
    override.path ?? `${object.bucket}/${object.key}`,
    override.bytes ?? object.bytes,
    override.sha256 ?? object.sha256,
    override.mime ?? object.mime,
  );
}

function installJobAccountingFact(fixture: Fixture): void {
  fixture.ctx.db.prepare(
    `INSERT INTO runs (id, workspace_id, kind, label, state, metadata_json, created_at)
     VALUES (?, ?, 'legacy-job', 'Fixture legacy job', 'pending', ?, 2)`,
  ).run(LEGACY_RUN_ID, WORKSPACE_ID, JSON.stringify({ migrationRunId: RUN_ID, legacyJobId: 71071 }));
  fixture.ctx.db.prepare(
    `INSERT INTO jobs
     (id, run_id, kind, status, command, created_at, migration_hold_run_id)
     VALUES (71071, ?, 'legacy', 'pending', '["fixture"]', 2, ?)`,
  ).run(LEGACY_RUN_ID, RUN_ID);
  const job = fixture.ctx.db.query<Record<string, unknown>, []>("SELECT * FROM jobs WHERE id = 71071").get()!;
  const run = fixture.ctx.db.query<Record<string, unknown>, [string]>("SELECT * FROM runs WHERE id = ?").get(LEGACY_RUN_ID)!;
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_fixture-job-fact', ?, 'MIGRATION_JOB_ACCOUNTING_FACT', 'info', ?, 2)`,
  ).run(RUN_ID, JSON.stringify({
    sourceId: "source-ralphy",
    entryIds: [ENTRY_ID],
    jobs: [{
      id: 71071,
      runId: LEGACY_RUN_ID,
      status: "pending",
      hold: RUN_ID,
      digest: sha256(canonicalRow(job)),
      runDigest: sha256(canonicalRow(run)),
    }],
    logs: [],
    artifacts: [],
  }));
}

function installProductionAccountingFact(fixture: Fixture): void {
  const object = fixture.ctx.db.query<Record<string, unknown>, [string]>(
    "SELECT * FROM objects WHERE id = ?",
  ).get(OBJECT_ID)!;
  const detail = {
    entryId: ENTRY_ID,
    sourceLocatorHash: sourceLocatorHash("ralphy", "control.json"),
    refs: [OBJECT_ID],
    facts: [{ ref: OBJECT_ID, digest: sha256(canonicalRow(object)) }],
  };
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_fixture-production-fact', ?, 'MIGRATION_PRODUCTION_ACCOUNTING_FACT', 'info', ?, 2)`,
  ).run(RUN_ID, JSON.stringify(detail));
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_fixture-production-index', ?, 'MIGRATION_PRODUCTION_ACCOUNTING_INDEX', 'info', ?, 2)`,
  ).run(RUN_ID, JSON.stringify({
    entryIds: [ENTRY_ID],
    sourceFingerprint: {
      unitRecords: [],
      productionRecords: [],
      deliveryRecords: [],
      deliveryOccurrences: [],
      metricRecords: [],
      metricWinnerIds: [],
    },
    sourceFingerprintDigest: sha256(canonicalRow({
      unitRecords: [],
      productionRecords: [],
      deliveryRecords: [],
      deliveryOccurrences: [],
      metricRecords: [],
      metricWinnerIds: [],
    })),
  }));
}

function insertTask2d2Composition(fixture: Fixture): void {
  fixture.ctx.db.prepare(
    `INSERT INTO projects (id, workspace_id, slug, name, created_at, updated_at)
     VALUES (?, ?, 'supplemental', 'Supplemental', 1, 1)`,
  ).run(SUPPLEMENTAL_PROJECT_ID, WORKSPACE_ID);
  fixture.ctx.db.prepare(
    `INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at)
     VALUES (?, ?, 'recovered-video', 'video', 1, 1)`,
  ).run(SUPPLEMENTAL_COMPOSITION_ID, SUPPLEMENTAL_PROJECT_ID);
  fixture.ctx.db.prepare(
    `INSERT INTO composition_revisions
     (id, composition_id, revision_no, engine, engine_config_json, created_at)
     VALUES (?, ?, 1, 'hyperframes', ?, 1)`,
  ).run(SUPPLEMENTAL_REVISION_ID, SUPPLEMENTAL_COMPOSITION_ID, JSON.stringify({
    recovery: { version: "task-2d2-v1", migrationEntryId: ENTRY_ID },
  }));
}

function insertOrdinaryCompositionAndRun(fixture: Fixture): void {
  fixture.ctx.db.prepare(
    `INSERT INTO compositions (id, project_id, slug, kind, created_at, updated_at)
     VALUES (?, ?, 'ordinary', 'video', 1, 1)`,
  ).run(ORDINARY_COMPOSITION_ID, SUPPLEMENTAL_PROJECT_ID);
  fixture.ctx.db.prepare(
    `INSERT INTO composition_revisions
     (id, composition_id, revision_no, engine, created_at)
     VALUES (?, ?, 1, 'ordinary', 1)`,
  ).run(ORDINARY_REVISION_ID, ORDINARY_COMPOSITION_ID);
  fixture.ctx.db.prepare(
    `INSERT INTO runs (id, workspace_id, project_id, kind, state, created_at)
     VALUES (?, ?, ?, 'ordinary', 'pending', 1)`,
  ).run(ORDINARY_RUN_ID, WORKSPACE_ID, SUPPLEMENTAL_PROJECT_ID);
}

function installArtifactOnlyGenerationAccounting(fixture: Fixture): void {
  const refs = fixture.ctx.db.query<{ refs: string }, [string]>(
    "SELECT target_refs_json AS refs FROM migration_entries WHERE id = ?",
  ).get(GENERATION_ENTRY_ID)!;
  const parsedRefs = JSON.parse(refs.refs) as string[];
  const facts = parsedRefs.map((ref) => {
    const table = ({ obj: "objects", doc: "documents", drev: "document_revisions", run: "runs", robj: "run_objects" } as Record<string, string>)[ref.slice(0, ref.indexOf("_"))]!;
    const row = fixture.ctx.db.query<Record<string, unknown>, [string]>(
      `SELECT * FROM ${table} WHERE id = ?`,
    ).get(ref)!;
    return { ref, digest: sha256(canonicalRow(row)) };
  });
  const sourceFingerprint = {
    unitRecords: [],
    productionRecords: [],
    deliveryRecords: [],
    deliveryOccurrences: [],
    metricRecords: [],
    metricWinnerIds: [],
  };
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_artifact-only-generation-fact', ?, 'MIGRATION_PRODUCTION_ACCOUNTING_FACT', 'info', ?, 2)`,
  ).run(RUN_ID, JSON.stringify({
    entryId: GENERATION_ENTRY_ID,
    sourceLocatorHash: sourceLocatorHash(
      "ralphy",
      "workspaces/fixture/projects/incident/logs/generations.jsonl",
    ),
    refs: parsedRefs,
    facts,
  }));
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_artifact-only-generation-index', ?, 'MIGRATION_PRODUCTION_ACCOUNTING_INDEX', 'info', ?, 2)`,
  ).run(RUN_ID, JSON.stringify({
    entryIds: [GENERATION_ENTRY_ID],
    sourceFingerprint,
    sourceFingerprintDigest: sha256(canonicalRow(sourceFingerprint)),
  }));
}

function installOmittedBuildAccountingIndex(fixture: Fixture): void {
  const sourceFingerprint = {
    unitRecords: [],
    productionRecords: [{
      entryId: ENTRY_ID,
      rowOrdinal: 1,
      targetSlot: null,
      digest: "a".repeat(64),
      expected: {
        kind: "build",
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        buildId: BUILD_ID,
        compositionRevisionId: "crev_00000000-0000-4000-8000-000000000081",
        artifactRevisionId: "arev_00000000-0000-4000-8000-000000000082",
        runId: "run_00000000-0000-4000-8000-000000000083",
        attemptId: "attempt_00000000-0000-4000-8000-000000000084",
        outputId: "output_00000000-0000-4000-8000-000000000085",
        resultId: "result_00000000-0000-4000-8000-000000000086",
        profile: "legacy",
        outputRole: "output",
        createdAt: 1,
      },
    }],
    deliveryRecords: [],
    deliveryOccurrences: [],
    metricRecords: [],
    metricWinnerIds: [],
  };
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_fixture-production-index', ?, 'MIGRATION_PRODUCTION_ACCOUNTING_INDEX', 'info', ?, 2)`,
  ).run(RUN_ID, JSON.stringify({
    entryIds: [],
    sourceFingerprint,
    sourceFingerprintDigest: sha256(canonicalRow(sourceFingerprint)),
  }));
}

function installCrossRunProductionIssue(fixture: Fixture): void {
  const otherRunId = "mig_00000000-0000-4000-8000-000000000087";
  fixture.ctx.db.prepare(
    `INSERT INTO migration_runs
     (id, stage_root_rel, recovery_root_rel, phase, created_at, updated_at)
     VALUES (?, 'other-stage', 'other-recovery', 'audited', 1, 1)`,
  ).run(otherRunId);
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, line_no, detail_json, created_at)
     VALUES ('miss_other-run-build-issue', ?, 'MIGRATION_BUILD_BINDING_AMBIGUOUS', 'review', 1, ?, 2)`,
  ).run(otherRunId, JSON.stringify({ sourceLocatorHash: sourceLocatorHash("ralphy", "control.json"), lineNo: 1 }));
  installIssueExpectationIndex(fixture, "miss_other-run-build-issue");
}

function installIssueExpectationIndex(fixture: Fixture, issueId: string): void {
  const sourceFingerprint = {
    unitRecords: [],
    productionRecords: [{
      entryId: ENTRY_ID,
      rowOrdinal: 1,
      targetSlot: null,
      digest: "a".repeat(64),
      expected: { kind: "issue", issueId, code: "MIGRATION_BUILD_BINDING_AMBIGUOUS" },
    }],
    deliveryRecords: [],
    deliveryOccurrences: [],
    metricRecords: [],
    metricWinnerIds: [],
  };
  fixture.ctx.db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_fixture-production-index', ?, 'MIGRATION_PRODUCTION_ACCOUNTING_INDEX', 'info', ?, 2)`,
  ).run(RUN_ID, JSON.stringify({
    entryIds: [],
    sourceFingerprint,
    sourceFingerprintDigest: sha256(canonicalRow(sourceFingerprint)),
  }));
}

function installProcessTools(
  root: string,
  pid?: number,
  cwd?: string,
): () => void {
  const bin = path.join(root, `process-tools-${pid ?? "quiet"}`);
  fs.mkdirSync(bin, { mode: 0o700 });
  const ps = path.join(bin, "ps");
  const lsof = path.join(bin, "lsof");
  fs.writeFileSync(ps, "#!/bin/sh\nprintf '  1 launchd launchd\\n'\n");
  fs.writeFileSync(lsof, pid && cwd
    ? `#!/bin/sh\nprintf 'p${pid}\\ncsleep\\nfcwd\\nn${cwd}\\n'\n`
    : "#!/bin/sh\nprintf 'p1\\nclaunchd\\nfcwd\\nn/\\n'\n");
  fs.chmodSync(ps, 0o700);
  fs.chmodSync(lsof, 0o700);
  return setMigrationProcessToolsForTesting({ psPath: ps, lsofPath: lsof });
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalRow(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalRow).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalRow(row[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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
