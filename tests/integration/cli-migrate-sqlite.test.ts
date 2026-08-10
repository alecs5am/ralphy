import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  acquireMaintenanceLock,
  releaseMaintenanceLock,
  setMigrationProcessToolsForTesting,
} from "../../cli/lib/migration/inventory.js";
import * as migrationService from "../../cli/lib/migration/service.js";
import { completeMigrationSecretImport } from "../../cli/lib/migration/import.js";
import {
  migrationCutoverPaths,
  readCutoverJournal,
} from "../../cli/lib/migration/cutover-journal.js";
import { resolveDataRoot } from "../../cli/lib/context.js";
import { createBridgeMethods } from "../../cli/lib/bridge/methods.js";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

type CompleteMigrationService = typeof migrationService & {
  verifyOrFreezeMigration(input: {
    runId: string;
    sourcePath: string;
    verificationDir: string;
  }): Promise<{
    id: string;
    verifiedAt: number;
    databaseDigest: string;
    contentDigest: string;
    inventoryDigests: unknown;
    consumers: { farm: null };
  }>;
};

let root: TmpRoot | null = null;
let restoreProcessTools: (() => void) | null = null;
const PROCESS_TOOLS_PRELOAD = "migration-process-tools-preload.ts";

afterEach(() => {
  restoreProcessTools?.();
  restoreProcessTools = null;
  root?.cleanup();
  root = null;
});

describe("resumable SQLite migration controller", () => {
  test("keeps ordinary no-store discovery stable below a non-user-owned ancestor", () => {
    expect(() => resolveDataRoot({ cwd: "/private/tmp" })).toThrow(/migration.*incomplete/i);
    expect(() => resolveDataRoot({ root: "/private/tmp/ralphy-missing-parent/.ralphy" }))
      .toThrow(/invalid input/i);
    const command = runCli("/private/tmp", ["status"]);
    expect(command.exitCode).toBe(0);
    expect(command.stderr).not.toMatch(/cutover source parent|identity or owner/i);
  });

  test("runs the complete monotonic pipeline and releases the inherited lock", async () => {
    const fixture = migrationFixture("complete");
    quietProcessTools(fixture.source);
    const before = snapshotTree(fixture.source);
    const started = migrationService.startMigration({
      sourceRoots: fixture.sourceRoots,
    });
    const steps: string[] = [];

    const resumed = await migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
      lock: started.lock,
      afterStepForTesting: (step: string) => steps.push(step),
    } as Parameters<typeof migrationService.resumeMigration>[0]);

    expect(resumed.status.phase).toBe("relations");
    expect(steps).toEqual([
      "inventory",
      "scopes",
      "stage-initial",
      "jobs",
      "stage-after-jobs",
      "production",
      "desktop",
      "desktop-handoffs",
      "stage-final",
    ]);
    expect(snapshotTree(fixture.source)).toEqual(before);
    expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(false);
    const db = openDomainDbAt(started.storeRoot);
    try {
      expect(db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM jobs").get()?.count).toBe(1);
      const jobProject = db.query<{ jobProjectId: string | null; projectId: string | null; projectSlug: string | null }, []>(
        `SELECT jobs.project_id AS jobProjectId, projects.id AS projectId, projects.slug AS projectSlug
         FROM jobs LEFT JOIN projects ON projects.id = jobs.project_id`,
      ).get();
      expect(jobProject).toEqual({
        jobProjectId: expect.stringMatching(/^prj_/u),
        projectId: expect.stringMatching(/^prj_/u),
        projectSlug: "alpha",
      });
      expect(db.query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM documents WHERE title = 'Desktop Agent Session preferences'",
      ).get()?.count).toBe(1);
      for (const sourcePath of ["jobs.db", "state.json"]) {
        const entry = db.query<{ state: string; objectId: string | null; targetPath: string | null; disposition: string }, [string, string]>(
          `SELECT state, raw_evidence_object_id AS objectId, target_path AS targetPath, disposition FROM migration_entries
           WHERE migration_run_id = ? AND source_path = ?`,
        ).get(started.runId, sourcePath);
        if (!entry?.objectId) throw new Error(`Missing late evidence for ${sourcePath}: ${JSON.stringify(entry)}`);
        expect(entry).toMatchObject({
          state: "imported",
          objectId: expect.stringMatching(/^obj_/u),
        });
      }
    } finally {
      db.close();
    }
  });

  test("fails closed on pending Desktop handoffs, invokes every exact plan, and replays without handoff", async () => {
    const fixture = migrationFixture("desktop-handoffs", { desktopSecrets: true });
    quietProcessTools(fixture.source);
    const started = migrationService.startMigration({ sourceRoots: fixture.sourceRoots });

    await expect(migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
      lock: started.lock,
    })).rejects.toThrow(/Desktop.*helper|handoff.*executable/i);

    const invoked: Array<{ sourceEntryId: string; encryptedSourcePath: string; ref: string; kind: string }> = [];
    const completed = await migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
      desktopHandoffRunnerForTesting: async (input) => {
        invoked.push({
          sourceEntryId: input.sourceEntryId,
          encryptedSourcePath: input.encryptedSourcePath,
          ref: input.ref,
          kind: input.kind,
        });
        const db = openDomainDbAt(input.stagedRoot);
        try {
          completeMigrationSecretImport(db, {
            runId: input.runId,
            sourceEntryId: input.sourceEntryId,
            refs: [input.ref],
            kind: input.kind,
            requiredSourceKind: "desktop",
          });
        } finally {
          db.close();
        }
        return { completed: true as const };
      },
    });
    expect(completed.status.phase).toBe("relations");
    expect(invoked).toHaveLength(2);
    expect(invoked.map((item) => path.basename(item.encryptedSourcePath)).sort()).toEqual([
      "claude-api-key.bin", "openrouter-api-key.bin",
    ]);
    expect(invoked.every((item) => item.kind === "text" && item.ref.startsWith("provider/"))).toBe(true);

    await migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
      desktopHandoffRunnerForTesting: async () => {
        throw new Error("completed Desktop handoff replayed");
      },
    });
  }, 30_000);

  test("releases an internally acquired lock when quiescence fails", async () => {
    const fixture = migrationFixture("error-cleanup");
    quietProcessTools(fixture.source);
    const started = migrationService.startMigration({
      sourceRoots: fixture.sourceRoots,
    });
    releaseMaintenanceLock(started.lock);
    restoreProcessTools?.();
    blockingProcessTools(fixture.source);

    await expect(migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
    })).rejects.toThrow(/quiescent/i);
    expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(false);
  });

  test("freezes once and makes every later verification byte-neutral", async () => {
    const fixture = migrationFixture("verify-once");
    quietProcessTools(fixture.source);
    const started = migrationService.startMigration({
      sourceRoots: fixture.sourceRoots,
    });
    await migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
      lock: started.lock,
    });
    fs.mkdirSync(fixture.verificationDir, { mode: 0o700 });
    const service = migrationService as CompleteMigrationService;

    const first = await service.verifyOrFreezeMigration({
      runId: started.runId,
      sourcePath: fixture.source,
      verificationDir: fixture.verificationDir,
    });
    const stageAfterFirst = snapshotTree(started.storeRoot);
    const recordsAfterFirst = verificationRecords(fixture.verificationDir);
    const second = await service.verifyOrFreezeMigration({
      runId: started.runId,
      sourcePath: fixture.source,
      verificationDir: fixture.verificationDir,
    });

    expect(snapshotTree(started.storeRoot)).toEqual(stageAfterFirst);
    expect(second.id).not.toBe(first.id);
    expect(second.verifiedAt).toBeGreaterThanOrEqual(first.verifiedAt);
    expect(verificationRecords(fixture.verificationDir)).toHaveLength(recordsAfterFirst.length + 1);
    expect(second).toMatchObject({
      databaseDigest: first.databaseDigest,
      contentDigest: first.contentDigest,
      inventoryDigests: first.inventoryDigests,
      consumers: { farm: null },
    });
  });

  test("exposes the exact public run, resume, status, and verify shape", () => {
    const fixture = migrationFixture("public-cli", { jobs: false });
    const beforeAudit = snapshotTree(fixture.parent);
    const audit = runCli(fixture.parent, [
      "migrate", "audit", "--source", fixture.source, "--desktop-source", fixture.desktopSource,
    ]);
    expect(audit.exitCode).toBe(0);
    expect(snapshotTree(fixture.parent)).toEqual(beforeAudit);

    const run = runCli(fixture.parent, [
      "migrate", "run", "--source", fixture.source, "--desktop-source", fixture.desktopSource,
      "--desktop-executable", process.execPath,
    ]);
    if (run.exitCode !== 0) throw new Error(`${run.stderr}\naudit=${audit.stdout}`);
    expect(run.exitCode).toBe(0);
    const started = JSON.parse(run.stdout) as { runId: string; status: { phase: string } };
    expect(started.status.phase).toBe("relations");
    const stage = path.join(fixture.parent, ".ralphy-staging", started.runId, ".ralphy");
    const sourceManifest = path.join(
      fixture.parent, ".ralphy-migration-private", started.runId, "sources.json",
    );
    expect(fs.existsSync(path.join(stage, "ralphy.db"))).toBe(true);
    expect(fs.statSync(sourceManifest).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(false);

    const status = runCli(fixture.parent, [
      "migrate", "status", "--run-id", started.runId, "--source", fixture.source,
    ]);
    expect(status.exitCode).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({ runId: started.runId, phase: "relations" });

    const resume = runCli(fixture.parent, [
      "migrate", "resume", "--run-id", started.runId, "--source", fixture.source,
      "--desktop-source", fixture.desktopSource,
    ]);
    if (resume.exitCode !== 0) throw new Error(resume.stderr);
    expect(resume.exitCode).toBe(0);
    expect(JSON.parse(resume.stdout)).toMatchObject({ status: { phase: "relations" } });

    fs.mkdirSync(fixture.verificationDir, { mode: 0o700 });
    const verify = runCli(fixture.parent, [
      "migrate", "verify", "--run-id", started.runId, "--source", fixture.source,
      "--verification-dir", fixture.verificationDir,
    ]);
    if (verify.exitCode !== 0) throw new Error(verify.stderr);
    expect(verify.exitCode).toBe(0);
    const verified = JSON.parse(verify.stdout) as { id: string; runId: string; consumers: { farm: null } };
    expect(verified).toMatchObject({ runId: started.runId, consumers: { farm: null } });

    const beforeCutover = snapshotTree(fixture.parent);
    const callerStore = runCli(fixture.parent, [
      "migrate", "verify", "--run-id", started.runId, "--source", fixture.source,
      "--verification-dir", fixture.verificationDir, "--store-root", stage,
    ]);
    expect(callerStore.exitCode).not.toBe(0);
    expect(callerStore.stderr).toMatch(/unknown option/i);
    expect(snapshotTree(fixture.parent)).toEqual(beforeCutover);
    for (const retired of ["--stage", "--journal", "--verification-record", "--recovery", "--rollback-generation"]) {
      const rejected = runCli(fixture.parent, [
        "migrate", "cutover", "--run-id", started.runId, "--confirm", started.runId,
        "--verification-id", verified.id, "--verification-dir", fixture.verificationDir,
        "--source", fixture.source, retired, fixture.source,
      ]);
      expect(rejected.exitCode).not.toBe(0);
      expect(rejected.stderr).toMatch(/unknown option/i);
      expect(snapshotTree(fixture.parent)).toEqual(beforeCutover);
    }

    const badConfirmation = runCli(fixture.parent, [
      "migrate", "cutover", "--run-id", started.runId, "--confirm", "mig_wrong",
      "--verification-id", verified.id, "--verification-dir", fixture.verificationDir,
      "--source", fixture.source,
    ]);
    expect(badConfirmation.exitCode).not.toBe(0);
    expect(snapshotTree(fixture.parent)).toEqual(beforeCutover);

    const staleVerification = runCli(fixture.parent, [
      "migrate", "cutover", "--run-id", started.runId, "--confirm", started.runId,
      "--verification-id", "f".repeat(64), "--verification-dir", fixture.verificationDir,
      "--source", fixture.source,
    ]);
    expect(staleVerification.exitCode).not.toBe(0);
    expect(snapshotTree(fixture.parent)).toEqual(beforeCutover);

    const cutover = runCli(fixture.parent, [
      "migrate", "cutover", "--run-id", started.runId, "--confirm", started.runId,
      "--verification-id", verified.id, "--verification-dir", fixture.verificationDir,
      "--source", fixture.source,
    ]);
    if (cutover.exitCode !== 0) throw new Error(cutover.stderr);
    expect(JSON.parse(cutover.stdout)).toMatchObject({ runId: started.runId, state: "installed" });
    expect(fs.existsSync(path.join(fixture.source, "ralphy.db"))).toBe(true);
  }, 30_000);

  test("CLI run fails before creating an undiscoverable Desktop handoff Run", () => {
    const fixture = migrationFixture("cli-desktop-helper-required", { desktopSecrets: true });
    const before = snapshotTree(fixture.parent);
    const result = runCli(fixture.parent, [
      "migrate", "run", "--source", fixture.source, "--desktop-source", fixture.desktopSource,
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/desktop-executable|Desktop.*executable/i);
    expect(snapshotTree(fixture.parent)).toEqual(before);
  });

  test("blocks ordinary CLI and bridge startup on an unsafe journal, while derived recovery and rollback remain available", async () => {
    const fixture = migrationFixture("startup-cutover-guard", { jobs: false });
    quietProcessTools(fixture.source);
    const started = migrationService.startMigration({ sourceRoots: fixture.sourceRoots });
    await migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
      lock: started.lock,
    });
    fs.mkdirSync(fixture.verificationDir, { mode: 0o700 });
    const verified = await migrationService.verifyOrFreezeMigration({
      runId: started.runId,
      sourcePath: fixture.source,
      verificationDir: fixture.verificationDir,
    });
    const publicationCrash = createHardCrashPreparedCutover({
      sourcePath: fixture.source,
      runId: started.runId,
      verificationId: verified.id,
      verificationDir: fixture.verificationDir,
    });
    if (publicationCrash.exitCode !== 86) {
      throw new Error(`prepared cutover crash exited ${publicationCrash.exitCode}:\n${publicationCrash.stderr}`);
    }
    const journal = readCutoverJournal(migrationCutoverPaths(fixture.source, started.runId).journalPath);
    expect(journal.state).toBe("prepared");

    const sourceAlias = path.join(fixture.parent, "source-alias");
    fs.symlinkSync(fixture.source, sourceAlias);
    expect(() => resolveDataRoot({ root: fixture.source })).toThrow(/cutover|interrupt|prepared/i);
    expect(() => resolveDataRoot({ root: sourceAlias })).toThrow(/cutover|interrupt|prepared/i);
    expect(() => createBridgeMethods({ dataRoot: fixture.source })).toThrow(/cutover|interrupt|prepared/i);
    expect(() => createBridgeMethods({ dataRoot: sourceAlias })).toThrow(/cutover|interrupt|prepared/i);
    const nonMigration = runCli(fixture.parent, [
      "--root", fixture.source, "queue", "list",
    ]);
    if (nonMigration.exitCode === 0) {
      throw new Error(`unsafe-journal CLI unexpectedly succeeded:\n${nonMigration.stdout}\n${nonMigration.stderr}`);
    }
    expect(nonMigration.stderr).toMatch(/cutover|interrupt|prepared/i);
    const ordinary = runCli(fixture.parent, [
      "migrate", "status", "--run-id", started.runId, "--source", fixture.source,
    ]);
    expect(ordinary.exitCode).not.toBe(0);
    expect(ordinary.stderr).toMatch(/cutover|interrupt|prepared/i);

    const preparedTree = snapshotTree(fixture.parent);
    for (const action of ["recover", "rollback"] as const) {
      const badConfirmation = runCli(fixture.parent, [
        "migrate", action, "--run-id", started.runId, "--confirm", "mig_wrong",
        "--source", fixture.source,
      ]);
      expect(badConfirmation.exitCode).not.toBe(0);
      expect(snapshotTree(fixture.parent)).toEqual(preparedTree);

      const callerJournal = runCli(fixture.parent, [
        "migrate", action, "--run-id", started.runId, "--confirm", started.runId,
        "--source", fixture.source, "--journal", journal.journalPath,
      ]);
      expect(callerJournal.exitCode).not.toBe(0);
      expect(callerJournal.stderr).toMatch(/unknown option/i);
      expect(snapshotTree(fixture.parent)).toEqual(preparedTree);
    }

    const recover = runCli(fixture.parent, [
      "migrate", "recover", "--run-id", started.runId, "--confirm", started.runId,
      "--source", fixture.source,
    ]);
    if (recover.exitCode !== 0) throw new Error(recover.stderr);
    expect(JSON.parse(recover.stdout)).toMatchObject({ runId: started.runId, state: "installed" });

    const rollback = runCli(fixture.parent, [
      "migrate", "rollback", "--run-id", started.runId, "--confirm", started.runId,
      "--source", fixture.source,
    ]);
    if (rollback.exitCode !== 0) throw new Error(rollback.stderr);
    expect(JSON.parse(rollback.stdout)).toMatchObject({ runId: started.runId, state: "rolled-back" });
    expect(readCutoverJournal(migrationCutoverPaths(fixture.source, started.runId).journalPath).state).toBe("rolled-back");
    expect(fs.existsSync(path.join(fixture.source, "registry.json"))).toBe(true);

    const liveLock = acquireMaintenanceLock({ sourcePath: fixture.source, runId: started.runId, reclaim: "recover" });
    const liveBlocked = runCli(fixture.parent, [
      "migrate", "recover", "--run-id", started.runId, "--confirm", started.runId,
      "--source", fixture.source,
    ]);
    expect(liveBlocked.exitCode).not.toBe(0);
    expect(liveBlocked.stderr).toMatch(/live exact owner|already held/i);
    releaseMaintenanceLock(liveLock);
  }, 60_000);

  test("pins every optional source in a private manifest across fresh commands", () => {
    const fixture = migrationFixture("source-manifest", { jobs: false });
    const run = runCli(fixture.parent, [
      "migrate", "run", "--source", fixture.source, "--desktop-source", fixture.desktopSource,
      "--desktop-executable", process.execPath,
    ]);
    if (run.exitCode !== 0) throw new Error(run.stderr);
    expect(run.exitCode).toBe(0);
    const { runId } = JSON.parse(run.stdout) as { runId: string };
    const manifest = sourceManifestPath(fixture.parent, runId);

    const omitted = runCli(fixture.parent, [
      "migrate", "resume", "--run-id", runId, "--source", fixture.source,
    ]);
    expect(omitted.exitCode).not.toBe(0);

    const substitute = path.join(fixture.parent, "other-desktop");
    fs.mkdirSync(substitute);
    expect(runCli(fixture.parent, [
      "migrate", "resume", "--run-id", runId, "--source", fixture.source,
      "--desktop-source", substitute,
    ]).exitCode).not.toBe(0);

    fs.renameSync(fixture.desktopSource, `${fixture.desktopSource}-original`);
    fs.mkdirSync(fixture.desktopSource);
    fs.mkdirSync(fixture.verificationDir, { mode: 0o700 });
    expect(runCli(fixture.parent, [
      "migrate", "verify", "--run-id", runId, "--source", fixture.source,
      "--verification-dir", fixture.verificationDir,
    ]).exitCode).not.toBe(0);

    fs.chmodSync(manifest, 0o644);
    expect(runCli(fixture.parent, [
      "migrate", "status", "--run-id", runId, "--source", fixture.source,
    ]).exitCode).not.toBe(0);
  }, 30_000);

  test("rejects a source-manifest symlink or replacement during pinned validation", async () => {
    const fixture = migrationFixture("source-manifest-race");
    quietProcessTools(fixture.source);
    const started = migrationService.startMigration({ sourceRoots: fixture.sourceRoots });
    releaseMaintenanceLock(started.lock);
    const manifest = sourceManifestPath(fixture.parent, started.runId);
    const real = `${manifest}.real`;
    fs.renameSync(manifest, real);
    fs.symlinkSync(real, manifest);
    await expect(migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
    })).rejects.toThrow(/manifest|symlink|source/i);

    fs.unlinkSync(manifest);
    fs.renameSync(real, manifest);
    await expect(migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
      afterSourceManifestOpenForTesting: () => {
        const replacement = `${manifest}.replacement`;
        fs.writeFileSync(replacement, fs.readFileSync(manifest), { mode: 0o600 });
        fs.renameSync(replacement, manifest);
      },
    } as Parameters<typeof migrationService.resumeMigration>[0])).rejects.toThrow(/manifest|replac|identity/i);
  });

  test("rejects optional-source identity drift before the first inventory write", async () => {
    const fixture = migrationFixture("source-manifest-initial-drift");
    quietProcessTools(fixture.source);
    const started = migrationService.startMigration({ sourceRoots: fixture.sourceRoots });
    const originalMode = fs.statSync(fixture.desktopSource).mode & 0o777;
    fs.chmodSync(fixture.desktopSource, originalMode === 0o700 ? 0o750 : 0o700);
    try {
      await expect(migrationService.resumeMigration({
        runId: started.runId,
        sourceRoots: fixture.sourceRoots,
        lock: started.lock,
      })).rejects.toThrow(/manifest|identity|source/i);
      const db = openDomainDbAt(started.storeRoot);
      try {
        expect(db.query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM migration_sources WHERE migration_run_id = ?",
        ).get(started.runId)?.count).toBe(0);
      } finally {
        db.close();
      }
    } finally {
      fs.chmodSync(fixture.desktopSource, originalMode);
      releaseMaintenanceLock(started.lock);
    }
  });

  test("rejects optional-source inode replacement before the first inventory write", async () => {
    const fixture = migrationFixture("source-manifest-initial-replacement");
    quietProcessTools(fixture.source);
    const started = migrationService.startMigration({ sourceRoots: fixture.sourceRoots });
    const displaced = `${fixture.desktopSource}-displaced`;
    fs.renameSync(fixture.desktopSource, displaced);
    fs.mkdirSync(fixture.desktopSource);
    fs.copyFileSync(path.join(displaced, "state.json"), path.join(fixture.desktopSource, "state.json"));
    try {
      await expect(migrationService.resumeMigration({
        runId: started.runId,
        sourceRoots: fixture.sourceRoots,
        lock: started.lock,
      })).rejects.toThrow(/manifest|identity|source/i);
      const db = openDomainDbAt(started.storeRoot);
      try {
        expect(db.query<{ count: number }, [string]>(
          "SELECT COUNT(*) AS count FROM migration_sources WHERE migration_run_id = ?",
        ).get(started.runId)?.count).toBe(0);
      } finally {
        db.close();
      }
    } finally {
      releaseMaintenanceLock(started.lock);
    }
  });

  test("resumes every committed phase in a fresh process without duplicate semantic state", async () => {
    const phases = [
      "inventory",
      "scopes",
      "stage-initial",
      "jobs",
      "stage-after-jobs",
      "production",
      "desktop",
      "desktop-handoffs",
      "stage-final",
    ] as const;
    const clean = migrationFixture("phase-clean");
    quietProcessTools(clean.source);
    const cleanStarted = migrationService.startMigration({ sourceRoots: clean.sourceRoots });
    await migrationService.resumeMigration({
      runId: cleanStarted.runId,
      sourceRoots: clean.sourceRoots,
      lock: cleanStarted.lock,
    });
    const expected = migrationSemanticSummary(cleanStarted.storeRoot, cleanStarted.runId);
    cleanupActiveFixture();

    for (const phase of phases) {
      const fixture = migrationFixture(`phase-crash-${phase}`);
      const crashed = runHardCrashMigration(fixture, phase);
      if (crashed.exitCode !== 86) throw new Error(`phase=${phase}\n${crashed.stderr}`);
      const started = JSON.parse(fs.readFileSync(crashed.resultPath, "utf8")) as {
        runId: string;
        storeRoot: string;
      };
      const walPath = path.join(started.storeRoot, "ralphy.db-wal");
      if (phase !== "desktop-handoffs") expect(fs.statSync(walPath).size).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(true);
      const inventoryBefore = readInventoryDigestsInChild(started.storeRoot, started.runId);

      const resumed = runCli(fixture.parent, [
        "migrate", "resume", "--run-id", started.runId, "--source", fixture.source,
        "--desktop-source", fixture.desktopSource,
      ]);
      if (resumed.exitCode !== 0) throw new Error(`phase=${phase}\n${resumed.stderr}`);
      expect(JSON.parse(resumed.stdout)).toMatchObject({ status: { phase: "relations" } });
      expect(migrationSemanticSummary(started.storeRoot, started.runId)).toEqual(expected);
      expect(migrationInventoryDigests(started.storeRoot, started.runId)).toEqual(inventoryBefore);
      expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(false);
      cleanupActiveFixture();
    }
  }, 90_000);

  test("stops before every phase mutation when the exact lock is replaced", async () => {
    const phases = migrationPhaseSteps();
    for (const phase of phases) {
      const fixture = migrationFixture(`phase-lock-${phase}`);
      quietProcessTools(fixture.source);
      const started = migrationService.startMigration({ sourceRoots: fixture.sourceRoots });
      const displaced = `${started.lock.path}.exact-owner`;
      let stageAtGate: Record<string, string> | null = null;
      await expect(migrationService.resumeMigration({
        runId: started.runId,
        sourceRoots: fixture.sourceRoots,
        lock: started.lock,
        beforeStepForTesting: (next) => {
          if (next !== phase) return;
          stageAtGate = snapshotTree(started.storeRoot);
          fs.renameSync(started.lock.path, displaced);
          fs.writeFileSync(started.lock.path, `${JSON.stringify({
            ...started.lock,
            nonce: `replacement-${phase}`,
          })}\n`, { mode: 0o600 });
        },
      } as Parameters<typeof migrationService.resumeMigration>[0])).rejects.toThrow(/lock|identity|owned/i);
      expect(stageAtGate).not.toBeNull();
      expect(snapshotTree(started.storeRoot)).toEqual(stageAtGate!);
      expect(JSON.parse(fs.readFileSync(started.lock.path, "utf8"))).toMatchObject({ nonce: `replacement-${phase}` });
      expect(fs.existsSync(displaced)).toBe(true);
      cleanupActiveFixture();
    }
  }, 60_000);

  test("stops after every committed phase when an exact source writer appears", async () => {
    const phases = migrationPhaseSteps();
    for (const phase of phases) {
      const fixture = migrationFixture(`phase-writer-${phase}`);
      const marker = path.join(fixture.parent, "writer.pid");
      controllableWriterProcessTools(fixture.source, marker);
      const started = migrationService.startMigration({ sourceRoots: fixture.sourceRoots });
      let writer: ReturnType<typeof Bun.spawn> | null = null;
      const completedSteps: string[] = [];
      try {
        await expect(migrationService.resumeMigration({
          runId: started.runId,
          sourceRoots: fixture.sourceRoots,
          lock: started.lock,
          afterStepForTesting: (completed) => {
            completedSteps.push(completed);
            if (completed !== phase) return;
            writer = Bun.spawn(["/bin/sleep", "30"], { cwd: fixture.source, stdout: "ignore", stderr: "ignore" });
            fs.writeFileSync(marker, String(writer.pid));
          },
        })).rejects.toThrow(/quiescent|writer|source/i);
        expect(completedSteps).toEqual(phases.slice(0, phases.indexOf(phase) + 1));
        expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(false);
      } finally {
        if (writer) {
          writer.kill();
          await writer.exited;
        }
        cleanupActiveFixture();
      }
    }
  }, 60_000);

  test("rejects WAL and SHM symlinks or hardlinks before crash recovery touches them", () => {
    for (const suffix of ["-wal", "-shm"] as const) {
      for (const kind of ["symlink", "hardlink"] as const) {
        const fixture = migrationFixture(`sidecar-${suffix.slice(1)}-${kind}`);
        const crashed = runHardCrashMigration(fixture, "inventory");
        expect(crashed.exitCode).toBe(86);
        const started = JSON.parse(fs.readFileSync(crashed.resultPath, "utf8")) as {
          runId: string;
          storeRoot: string;
        };
        const sidecar = path.join(started.storeRoot, `ralphy.db${suffix}`);
        const sentinel = `${sidecar}.external-sentinel`;
        if (kind === "symlink") {
          fs.renameSync(sidecar, sentinel);
          fs.symlinkSync(sentinel, sidecar);
        } else {
          fs.linkSync(sidecar, sentinel);
        }
        const before = fileSnapshot(sentinel);
        const lockPath = path.join(fixture.parent, ".ralphy-migration.lock");
        const lockBefore = fileSnapshot(lockPath);

        const resumed = runCli(fixture.parent, [
          "migrate", "resume", "--run-id", started.runId, "--source", fixture.source,
          "--desktop-source", fixture.desktopSource,
        ]);
        expect(resumed.exitCode).not.toBe(0);
        expect(resumed.stderr).toMatch(/sqlite|identity|symlink|unsafe|link/i);
        expect(fileSnapshot(sentinel)).toEqual(before);
        expect(fileSnapshot(lockPath)).toEqual(lockBefore);
        cleanupActiveFixture();
      }
    }
  }, 60_000);

  test("rejects resume after freeze without changing one staged byte", async () => {
    const fixture = migrationFixture("frozen-resume");
    quietProcessTools(fixture.source);
    const started = migrationService.startMigration({ sourceRoots: fixture.sourceRoots });
    await migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
      lock: started.lock,
    });
    fs.mkdirSync(fixture.verificationDir, { mode: 0o700 });
    await (migrationService as CompleteMigrationService).verifyOrFreezeMigration({
      runId: started.runId,
      sourcePath: fixture.source,
      verificationDir: fixture.verificationDir,
    });
    const frozen = snapshotTree(started.storeRoot);

    await expect(migrationService.resumeMigration({
      runId: started.runId,
      sourceRoots: fixture.sourceRoots,
    })).rejects.toThrow(/frozen|terminal|resume/i);
    expect(snapshotTree(started.storeRoot)).toEqual(frozen);
    expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(false);
  });
});

function migrationFixture(label: string, options: { jobs?: boolean; desktopSecrets?: boolean } = {}): {
  parent: string;
  source: string;
  desktopSource: string;
  verificationDir: string;
  sourceRoots: Array<{ id: string; kind: "ralphy" | "desktop"; path: string }>;
} {
  root = makeTmpRoot(`ralphy-task8-${label}`);
  const parent = fs.realpathSync(root.dir);
  const source = path.join(parent, ".ralphy");
  fs.mkdirSync(path.join(source, "workspaces", "studio", "projects", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(source, "registry.json"), `${JSON.stringify({
    currentWorkspace: "studio",
    projects: { alpha: { workspace: "studio" } },
  })}\n`);
  fs.writeFileSync(
    path.join(source, "workspaces", "studio", "projects", "alpha", "BRIEF.md"),
    "# Alpha\n",
  );
  if (options.jobs !== false) createLegacyJobsDb(path.join(source, "jobs.db"));
  const desktopSource = path.join(parent, "desktop-data");
  fs.mkdirSync(desktopSource);
  fs.writeFileSync(path.join(desktopSource, "state.json"), `${JSON.stringify({
    version: 1,
    kind: "agent-session-preferences",
    workspace: "studio",
    project: "alpha",
    preferences: { theme: "dark", density: "compact" },
  })}\n`);
  if (options.desktopSecrets) {
    fs.writeFileSync(path.join(desktopSource, "claude-api-key.bin"), Buffer.from([1, 2, 3, 4, 5]));
    fs.writeFileSync(path.join(desktopSource, "openrouter-api-key.bin"), Buffer.from([6, 7, 8, 9, 10]));
  }
  return {
    parent,
    source,
    desktopSource,
    verificationDir: path.join(parent, "verification"),
    sourceRoots: [
      { id: "ralphy", kind: "ralphy", path: source },
      { id: "desktop", kind: "desktop", path: desktopSource },
    ],
  };
}

function createLegacyJobsDb(file: string): void {
  const program = `
    import { Database } from "bun:sqlite";
    const db = new Database(${JSON.stringify(file)}, { create: true });
    db.exec(\`
      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        command TEXT NOT NULL,
        project_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE job_logs (
        id INTEGER PRIMARY KEY,
        job_id INTEGER NOT NULL,
        line TEXT NOT NULL
      );
    \`);
    db.prepare("INSERT INTO jobs (id, status, command, project_id, created_at) VALUES (1, 'pending', '{}', 'alpha', 1700000000000)").run();
    db.prepare("INSERT INTO job_logs (id, job_id, line) VALUES (1, 1, 'legacy')").run();
    db.close();
  `;
  const result = Bun.spawnSync(["bun", "-e", program], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString("utf8"));
}

function verificationRecords(directory: string): string[] {
  return fs.readdirSync(directory)
    .filter((name) => name.includes(".verification-"))
    .sort();
}

function migrationSemanticSummary(storeRoot: string, runId: string): unknown {
  const db = new Database(path.join(storeRoot, "ralphy.db"), { readonly: true, strict: true });
  try {
    const tables = [
      "migration_sources", "migration_entries", "migration_issues", "workspaces", "projects",
      "documents", "document_revisions", "jobs", "job_logs", "objects", "run_objects",
    ];
    const counts = Object.fromEntries(tables.map((table) => [
      table,
      db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count,
    ]));
    return {
      counts,
      sources: db.query(
        `SELECT source_kind, source_label
         FROM migration_sources WHERE migration_run_id = ? ORDER BY source_kind, source_label`,
      ).all(runId),
      entries: db.query(
        `SELECT source_kind, source_path, source_locator_hash, disposition, state, bytes
         FROM migration_entries WHERE migration_run_id = ? ORDER BY source_kind, source_path`,
      ).all(runId),
      issues: db.query(
        `SELECT code, severity, resolved_at IS NOT NULL AS resolved, COUNT(*) AS count
         FROM migration_issues WHERE migration_run_id = ?
         GROUP BY code, severity, resolved ORDER BY code, severity, resolved`,
      ).all(runId),
      objects: db.query("SELECT sha256, mime, bytes FROM objects ORDER BY sha256, mime, bytes").all(),
      documents: db.query("SELECT kind, slug, title FROM documents ORDER BY kind, slug, title").all(),
      jobs: db.query(
        `SELECT jobs.status, jobs.kind, jobs.command, projects.slug AS project_slug
         FROM jobs LEFT JOIN projects ON projects.id = jobs.project_id
         ORDER BY jobs.status, jobs.kind, jobs.command, project_slug`,
      ).all(),
    };
  } finally {
    db.close(false);
  }
}

function migrationInventoryDigests(storeRoot: string, runId: string): unknown[] {
  const db = new Database(path.join(storeRoot, "ralphy.db"), { readonly: true, strict: true });
  try {
    return db.query(
      `SELECT source_kind, source_label, inventory_digest
       FROM migration_sources WHERE migration_run_id = ? ORDER BY source_kind, source_label`,
    ).all(runId);
  } finally {
    db.close(false);
  }
}

function readInventoryDigestsInChild(storeRoot: string, runId: string): unknown[] {
  const program = `
    import { Database } from "bun:sqlite";
    const db = new Database(${JSON.stringify(path.join(storeRoot, "ralphy.db"))}, { readonly: true, strict: true });
    db.exec("PRAGMA query_only = ON");
    const rows = db.query(\`SELECT source_kind, source_label, inventory_digest
      FROM migration_sources WHERE migration_run_id = ? ORDER BY source_kind, source_label\`).all(${JSON.stringify(runId)});
    db.close(false);
    process.stdout.write(JSON.stringify(rows));
  `;
  const result = Bun.spawnSync(["bun", "-e", program], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString("utf8"));
  return JSON.parse(result.stdout.toString("utf8")) as unknown[];
}

function cleanupActiveFixture(): void {
  restoreProcessTools?.();
  restoreProcessTools = null;
  root?.cleanup();
  root = null;
}

function sourceManifestPath(parent: string, runId: string): string {
  return path.join(parent, ".ralphy-migration-private", runId, "sources.json");
}

function migrationPhaseSteps(): readonly string[] {
  return [
    "inventory", "scopes", "stage-initial", "jobs", "stage-after-jobs",
    "production", "desktop", "desktop-handoffs", "stage-final",
  ];
}

function fileSnapshot(file: string): { mode: number; bytes: number; sha256: string } {
  const stat = fs.statSync(file);
  return {
    mode: stat.mode,
    bytes: stat.size,
    sha256: Bun.SHA256.hash(fs.readFileSync(file), "hex"),
  };
}

function runCli(cwd: string, args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = Bun.spawnSync(bunWithProcessTools([
    "run",
    path.resolve(import.meta.dir, "../../cli/index.ts"),
    "--json",
    ...args,
  ]), { cwd, stdout: "pipe", stderr: "pipe", env: process.env });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
  };
}

function runHardCrashMigration(
  fixture: ReturnType<typeof migrationFixture>,
  phase: string,
): { exitCode: number; stdout: string; stderr: string; resultPath: string } {
  const serviceUrl = new URL("../../cli/lib/migration/service.ts", import.meta.url).href;
  const resultPath = path.join(fixture.parent, `hard-crash-${phase}.json`);
  const program = `
    import fs from "node:fs";
    import { resumeMigration, startMigration } from ${JSON.stringify(serviceUrl)};
    const started = startMigration({ sourceRoots: ${JSON.stringify(fixture.sourceRoots)} });
    fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ runId: started.runId, storeRoot: started.storeRoot }));
    await resumeMigration({
        runId: started.runId,
        sourceRoots: ${JSON.stringify(fixture.sourceRoots)},
        lock: started.lock,
        afterStepForTesting: (completed) => {
          if (completed === ${JSON.stringify(phase)}) process.exit(86);
        },
      });
    process.stderr.write("hard-crash seam was not reached\\n");
    process.exit(2);
  `;
  const result = Bun.spawnSync(bunWithProcessTools(["-e", program]), {
    cwd: fixture.parent,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString("utf8"),
    stderr: result.stderr.toString("utf8"),
    resultPath,
  };
}

function createHardCrashPreparedCutover(input: {
  sourcePath: string;
  runId: string;
  verificationId: string;
  verificationDir: string;
}): { exitCode: number; stderr: string } {
  const serviceUrl = new URL("../../cli/lib/migration/service.ts", import.meta.url).href;
  const program = `
    import { cutoverMigration } from ${JSON.stringify(serviceUrl)};
    cutoverMigration({
      sourcePath: ${JSON.stringify(input.sourcePath)},
      runId: ${JSON.stringify(input.runId)},
      verificationId: ${JSON.stringify(input.verificationId)},
      verificationDir: ${JSON.stringify(input.verificationDir)},
      afterJournalPublishedForTesting: () => process.exit(86),
    });
  `;
  const result = Bun.spawnSync(bunWithProcessTools(["-e", program]), {
    cwd: path.dirname(input.sourcePath),
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });
  return { exitCode: result.exitCode, stderr: result.stderr.toString("utf8") };
}

function quietProcessTools(source: string): void {
  setProcessTools(source, false);
}

function blockingProcessTools(source: string): void {
  setProcessTools(source, true);
}

function setProcessTools(source: string, blocked: boolean): void {
  const bin = path.join(root!.dir, blocked ? "blocking-bin" : "quiet-bin");
  fs.mkdirSync(bin, { recursive: true });
  const ps = path.join(bin, "ps");
  const lsof = path.join(bin, "lsof");
  fs.writeFileSync(ps, `#!/bin/sh\nif [ "$1" = "-o" ] && [ "$2" = "lstart=" ]; then exec /bin/ps "$@"; fi\nprintf ' 1 launchd launchd\\n'\n`);
  fs.writeFileSync(lsof, blocked
    ? `#!/bin/sh\nprintf 'p999999\\nctest\\nf3\\nn${source}\\n'\n`
    : "#!/bin/sh\nprintf 'p1\\nclaunchd\\nfcwd\\nn/\\n'\n");
  fs.chmodSync(ps, 0o700);
  fs.chmodSync(lsof, 0o700);
  const inventoryUrl = new URL("../../cli/lib/migration/inventory.ts", import.meta.url).href;
  fs.writeFileSync(path.join(root!.dir, PROCESS_TOOLS_PRELOAD), `
    import { setMigrationProcessToolsForTesting } from ${JSON.stringify(inventoryUrl)};
    setMigrationProcessToolsForTesting({
      psPath: ${JSON.stringify(ps)},
      lsofPath: ${JSON.stringify(lsof)},
    });
  `);
  restoreProcessTools = setMigrationProcessToolsForTesting({ psPath: ps, lsofPath: lsof });
}

function bunWithProcessTools(args: string[]): string[] {
  const preload = root && path.join(root.dir, PROCESS_TOOLS_PRELOAD);
  return preload && fs.existsSync(preload)
    ? ["bun", `--preload=${preload}`, ...args]
    : ["bun", ...args];
}

function controllableWriterProcessTools(source: string, marker: string): void {
  const bin = path.join(root!.dir, "controlled-writer-bin");
  fs.mkdirSync(bin, { recursive: true });
  const ps = path.join(bin, "ps");
  const lsof = path.join(bin, "lsof");
  fs.writeFileSync(ps, "#!/bin/sh\nprintf ' 1 launchd launchd\\n'\n");
  fs.writeFileSync(lsof, `#!/bin/sh
if [ -f ${JSON.stringify(marker)} ]; then
  pid=$(/bin/cat ${JSON.stringify(marker)})
  printf 'p%s\\nctest\\nfcwd\\nn%s\\n' "$pid" ${JSON.stringify(source)}
else
  printf 'p1\\nclaunchd\\nfcwd\\nn/\\n'
fi
`);
  fs.chmodSync(ps, 0o700);
  fs.chmodSync(lsof, 0o700);
  restoreProcessTools = setMigrationProcessToolsForTesting({ psPath: ps, lsofPath: lsof });
}

function snapshotTree(directory: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const visit = (current: string, relative: string): void => {
    for (const name of fs.readdirSync(current).sort()) {
      const absolute = path.join(current, name);
      const child = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        snapshot[child] = `directory:${stat.mode & 0o777}`;
        visit(absolute, child);
      } else if (stat.isFile()) {
        snapshot[child] = `file:${stat.mode & 0o777}:${Bun.SHA256.hash(fs.readFileSync(absolute), "hex")}`;
      } else {
        snapshot[child] = "other";
      }
    }
  };
  visit(directory, "");
  return snapshot;
}
