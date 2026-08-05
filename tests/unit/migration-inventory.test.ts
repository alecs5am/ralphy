import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import { root, setRoot } from "../../cli/lib/paths.js";
import {
  acquireMaintenanceLock,
  assertMigrationQuiescent,
  auditMigration,
  createMigrationSourceRoot,
  inventoryLegacySource,
  releaseMaintenanceLock,
  scanMigrationProcesses,
  setMigrationLockFaultForTesting,
  setMigrationProcessToolsForTesting,
} from "../../cli/lib/migration/inventory.js";
import {
  inspectMigrationProcessIdentity,
  inspectMigrationProcessIdentityState,
} from "../../cli/lib/migration/process-identity.js";
import {
  cutoverMigration,
  migrationStatus,
  recoverCutover,
  resumeMigration,
  rollbackCutover,
  startMigration,
} from "../../cli/lib/migration/service.js";
import { verifyMigration } from "../../cli/lib/migration/verify.js";
import { buildLegacyLibrary, type LegacyFixture } from "../fixtures/migration/build-legacy-library.js";

type Snapshot = Record<string, {
  kind: "directory" | "file" | "other";
  device: string;
  inode: string;
  mode: number;
  size: number;
  mtimeMs: number;
  sha256?: string;
}>;

let fixture: LegacyFixture | null = null;
let fixtureRoot: string | null = null;

afterEach(() => {
  fixture?.cleanup();
  fixture = null;
  if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fixtureRoot = null;
});

describe("migration audit", () => {
  test("counts a checkpointed jobs database with a zero-byte WAL without writes", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rm-jobs-zero-wal-")));
    const source = path.join(fixtureRoot, ".ralphy");
    const jobsPath = path.join(source, "jobs.db");
    fs.mkdirSync(source);
    const jobs = new Database(jobsPath, { create: true });
    jobs.exec("PRAGMA journal_mode = WAL; CREATE TABLE jobs (status TEXT NOT NULL); INSERT INTO jobs VALUES ('done'); PRAGMA wal_checkpoint(TRUNCATE)");
    jobs.close();
    fs.writeFileSync(`${jobsPath}-wal`, "", { mode: 0o600 });
    const before = snapshotFiles([jobsPath, `${jobsPath}-wal`]);

    const audit = auditMigration({ sourceRoots: [{ kind: "ralphy", path: source }] });

    expect(audit.jobStatusCounts).toEqual({ done: 1 });
    expect(audit.blockers.some((issue) => issue.code === "MIGRATION_JOBS_WAL_UNMATERIALIZED")).toBe(false);
    expect(snapshotFiles([jobsPath, `${jobsPath}-wal`])).toEqual(before);
  });

  test("blocks an existing malformed registry but ignores candidates that are absent", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rm-registry-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const registry = path.join(source, "registry.json");
    fs.writeFileSync(registry, "{not-json\n");

    const malformed = auditMigration({ sourceRoots: [{ kind: "ralphy", path: source }] });
    expect(malformed.blockers.some((issue) => (
      issue.code === "MIGRATION_REGISTRY_UNREADABLE" && issue.severity === "block"
    ))).toBe(true);

    fs.unlinkSync(registry);
    const absent = auditMigration({ sourceRoots: [{ kind: "ralphy", path: source }] });
    expect(absent.blockers.some((issue) => issue.code === "MIGRATION_REGISTRY_UNREADABLE")).toBe(false);
  });

  test("blocks a registry whose projects value is not an array or object map", () => {
    const audit = auditRegistryProjects(42);

    expect(audit.blockers.some((issue) => (
      issue.code === "MIGRATION_REGISTRY_UNREADABLE" && issue.severity === "block"
    ))).toBe(true);
  });

  test("blocks malformed project entries in a registry array", () => {
    const audit = auditRegistryProjects(["valid-project", { workspace: "default" }]);

    expect(audit.blockers.some((issue) => issue.code === "MIGRATION_REGISTRY_UNREADABLE")).toBe(true);
  });

  test("blocks an object-map project whose embedded ID conflicts with its key", () => {
    const audit = auditRegistryProjects({ canonical: { id: "different" } });

    expect(audit.blockers.some((issue) => issue.code === "MIGRATION_REGISTRY_UNREADABLE")).toBe(true);
  });

  test("accepts valid array and object-map project registries", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rm-registry-valid-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "registry.json"), JSON.stringify({
      projects: ["array-string", { id: "array-object" }],
    }));
    fs.writeFileSync(path.join(source, "config.json"), JSON.stringify({
      projects: {
        "map-key": { workspace: "default" },
        "map-embedded": { id: "map-embedded", workspace: "default" },
      },
    }));

    const audit = auditMigration({ sourceRoots: [{ kind: "ralphy", path: source }] });

    expect(audit.registryProjects).toBe(4);
    expect(audit.blockers.some((issue) => issue.code === "MIGRATION_REGISTRY_UNREADABLE")).toBe(false);
  });

  test("reports complete live-shaped evidence without changing any source or sibling state", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rma-")));
    fixture = buildLegacyLibrary(fixtureRoot);
    const beforeTree = snapshotTree(fixtureRoot);
    const beforeListing = fs.readdirSync(path.dirname(fixture.paths.currentRoot)).sort();
    const beforeWal = snapshotFiles([
      fixture.paths.jobsDb,
      `${fixture.paths.jobsDb}-wal`,
      `${fixture.paths.jobsDb}-shm`,
    ]);

    const originalMkdtemp = fs.mkdtempSync;
    fs.mkdtempSync = (() => {
      throw new Error("audit attempted temporary filesystem materialization");
    }) as typeof fs.mkdtempSync;
    let audit: ReturnType<typeof auditMigration>;
    try {
      audit = auditMigration({ sourceRoots: fixture.sourceRoots });
    } finally {
      fs.mkdtempSync = originalMkdtemp;
    }

    expect({
      entries: audit.sourceEntries,
      files: audit.sourceFiles,
      bytes: audit.sourceBytes,
    }).toEqual({
      entries: fixture.expected.entries,
      files: fixture.expected.files,
      bytes: fixture.expected.bytes,
    });
    expect(audit.workspaces).toBe(2);
    expect(audit.physicalProjects).toBe(4);
    expect(audit.registryProjects).toBe(4);
    expect(audit.physicalOnlyProjects).toEqual([
      "legacy-physical-only",
      "physical-only-project",
    ]);
    expect(audit.registryOnlyProjects).toEqual([
      "legacy-registry-only",
      "registry-only-project",
    ]);
    expect(audit.cloneSupport).toBe("not-probed");
    expect(audit.requiredCopyBytes).toBe(
      fixture.expected.bytes + Math.max(2 * 1024 ** 3, Math.ceil(fixture.expected.bytes * 0.1)),
    );
    expect(audit.jobStatusCounts).toEqual({});
    expect(audit.blockers.some((issue) => (
      issue.code === "MIGRATION_JOBS_WAL_UNMATERIALIZED" && issue.severity === "block"
    ))).toBe(true);
    expect(audit.desktopCandidates).toEqual({ reviews: 1, secrets: 2, settings: 1 });
    expect(audit.processes.every((process) => (
      Object.keys(process).every((key) => ["category", "pid", "count"].includes(key))
    ))).toBe(true);

    expect(snapshotTree(fixtureRoot)).toEqual(beforeTree);
    expect(fs.readdirSync(path.dirname(fixture.paths.currentRoot)).sort()).toEqual(beforeListing);
    expect(snapshotFiles([
      fixture.paths.jobsDb,
      `${fixture.paths.jobsDb}-wal`,
      `${fixture.paths.jobsDb}-shm`,
    ])).toEqual(beforeWal);
    expect(fs.existsSync(path.join(fixtureRoot, ".ralphy-migration.lock"))).toBe(false);
    expect(fs.readdirSync(fixtureRoot).some((name) => /stage|journal|clone|probe/i.test(name))).toBe(false);
  });
});

describe("migration inventory", () => {
  test("records every legacy path once with immutable per-source digests and no ambient writes", async () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rmi-")));
    fixture = buildLegacyLibrary(fixtureRoot);
    const storeRoot = path.join(fixtureRoot, ".ralphy-staging", "mig_fixture", ".ralphy");
    const poisonRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rmp-"));
    const previousRoot = root();
    const previousCwd = process.cwd();
    fs.mkdirSync(path.join(poisonRoot, ".ralphy"), { recursive: true });
    fs.writeFileSync(path.join(poisonRoot, ".ralphy", "live-marker"), "untouched");
    const poisonBefore = snapshotTree(poisonRoot);
    const db = openDomainDbAt(storeRoot);
    const runId = "mig_fixture";
    const now = Date.now();
    db.prepare(
      `INSERT INTO migration_runs
       (id, stage_root_rel, recovery_root_rel, phase, created_at, updated_at)
       VALUES (?, '.ralphy-staging/mig_fixture/.ralphy', '.ralphy-recovery/mig_fixture/.ralphy', 'audited', ?, ?)`,
    ).run(runId, now, now);
    const lock = acquireMaintenanceLock({
      sourcePath: fixture.paths.currentRoot,
      runId,
    });
    try {
      setRoot(poisonRoot);
      process.chdir(poisonRoot);
      const inventory = await inventoryLegacySource({
        db,
        storeRoot,
        sourceRoots: fixture.sourceRoots.map(createMigrationSourceRoot),
        runId,
      });

      expect(inventory).toMatchObject({
        sourceEntries: fixture.expected.entries,
        sourceFiles: fixture.expected.files,
        sourceBytes: fixture.expected.bytes,
      });
      expect(inventory.inventoryDigest).toHaveLength(64);
      expect(db.query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM migration_entries WHERE migration_run_id = ?",
      ).get(runId)?.count).toBe(fixture.expected.entries);
      expect(db.query<{ sourceKind: string; count: number }, [string]>(
        `SELECT source_kind AS sourceKind, COUNT(*) AS count
         FROM migration_entries WHERE migration_run_id = ?
         GROUP BY source_kind ORDER BY source_kind`,
      ).all(runId)).toEqual([
        { sourceKind: "desktop", count: fixture.expected.bySource.desktop.entries },
        { sourceKind: "legacy-workspace", count: fixture.expected.bySource["legacy-workspace"].entries },
        { sourceKind: "ralphy", count: fixture.expected.bySource.ralphy.entries },
      ]);
      expect(db.query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM migration_sources WHERE migration_run_id = ? AND inventory_digest IS NOT NULL",
      ).get(runId)?.count).toBe(3);

      const rows = db.query<{
        sourceKind: string;
        sourcePath: string;
        entryKind: string;
        disposition: string;
        bytes: number;
        sha256: string | null;
      }, [string]>(
        `SELECT source_kind AS sourceKind, source_path AS sourcePath, entry_kind AS entryKind, disposition, bytes, sha256
         FROM migration_entries WHERE migration_run_id = ?`,
      ).all(runId);
      expect(rows.find((row) => row.sourcePath.endsWith("semantic-empty-directory"))).toMatchObject({
        entryKind: "directory",
        bytes: 0,
      });
      expect(rows.find((row) => row.sourcePath.endsWith("semantic-empty.md"))).toMatchObject({
        entryKind: "file",
        bytes: 0,
      });
      expect(rows.find((row) => row.sourcePath === "unknown.empty")).toMatchObject({
        disposition: "issue",
        bytes: 0,
      });
      expect(rows.find((row) => row.sourceKind === "desktop" && row.sourcePath === "foo-api-key.bin"))
        .toMatchObject({ disposition: "issue" });
      expect(rows.find((row) => row.sourceKind === "desktop" && row.sourcePath === "logs/desktop.log"))
        .toMatchObject({ disposition: "system" });
      expect(rows.find((row) => row.sourcePath === "config.json")?.sha256).toBe(
        fixture.expected.sha256["ralphy:config.json"],
      );
      expect(rows.find((row) => row.sourcePath.endsWith("render/master.mp4"))?.sha256).toBeNull();
      expect(rows.filter((row) => ["symlink", "fifo", "socket"].includes(row.entryKind))).toHaveLength(3);

      const repeated = await inventoryLegacySource({
        db,
        storeRoot,
        sourceRoots: fixture.sourceRoots.map(createMigrationSourceRoot),
        runId,
      });
      expect(repeated).toEqual(inventory);
      expect(db.query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM migration_entries WHERE migration_run_id = ?",
      ).get(runId)?.count).toBe(fixture.expected.entries);
      expect(snapshotTree(poisonRoot)).toEqual(poisonBefore);
      expect(fs.existsSync(path.join(storeRoot, "ralphy.db"))).toBe(true);
    } finally {
      process.chdir(previousCwd);
      setRoot(previousRoot);
      db.close();
      releaseMaintenanceLock(lock);
      fs.rmSync(poisonRoot, { recursive: true, force: true });
    }
  });
});

describe("migration maintenance lock", () => {
  test("resumes a quarantined stale lock without overwriting another owner", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rml-guard-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const original = acquireMaintenanceLock({ sourcePath: source, runId: "mig_guard" });
    releaseMaintenanceLock(original);
    const stale = {
      ...original,
      processIdentity: { ...original.processIdentity, pid: 999_999_999 },
      nonce: "stale-guarded-nonce",
    };
    const quarantinePath = `${original.path}.quarantine`;
    fs.writeFileSync(quarantinePath, `${JSON.stringify(stale)}\n`, { mode: 0o600 });
    const reclaimed = acquireMaintenanceLock({
      sourcePath: source,
      runId: "mig_guard",
      reclaim: "resume",
    });
    expect(fs.existsSync(quarantinePath)).toBe(false);
    releaseMaintenanceLock(reclaimed);
  });

  test("cleans every partial lock creation without unlinking a replacement inode", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rml-create-fault-")));
    const points = [
      "create-after-open",
      "create-after-write",
      "create-after-file-fsync",
      "create-after-parent-fsync",
    ] as const;
    for (const [index, point] of points.entries()) {
      const parent = path.join(fixtureRoot, String(index));
      const source = path.join(parent, ".ralphy");
      fs.mkdirSync(source, { recursive: true });
      const lockPath = path.join(parent, ".ralphy-migration.lock");
      const restore = setMigrationLockFaultForTesting((candidate) => {
        if (candidate === point) throw new Error(`fault:${point}`);
      });
      try {
        expect(() => acquireMaintenanceLock({ sourcePath: source, runId: `mig_create_${index}` }))
          .toThrow(`fault:${point}`);
      } finally {
        restore();
      }
      expect(fs.existsSync(lockPath)).toBe(false);
      const lock = acquireMaintenanceLock({ sourcePath: source, runId: `mig_create_${index}` });
      releaseMaintenanceLock(lock);
    }

    const parent = path.join(fixtureRoot, "replacement");
    const source = path.join(parent, ".ralphy");
    const displaced = path.join(parent, "created-inode");
    fs.mkdirSync(source, { recursive: true });
    const lockPath = path.join(parent, ".ralphy-migration.lock");
    const restore = setMigrationLockFaultForTesting((point) => {
      if (point !== "create-after-open") return;
      fs.renameSync(lockPath, displaced);
      fs.writeFileSync(lockPath, "replacement\n", { mode: 0o600 });
      throw new Error("replacement-race");
    });
    try {
      expect(() => acquireMaintenanceLock({ sourcePath: source, runId: "mig_replacement" }))
        .toThrow(/replacement-race/i);
    } finally {
      restore();
    }
    expect(fs.readFileSync(lockPath, "utf8")).toBe("replacement\n");
    expect(fs.existsSync(displaced)).toBe(true);
  });

  test("converges repeated acquire and release crashes through one deterministic quarantine", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rml-transition-fault-")));
    const acquirePoints = [
      "acquire-after-quarantine",
      "acquire-after-replacement",
      "acquire-before-quarantine-unlink",
    ] as const;
    for (const [index, point] of acquirePoints.entries()) {
      const parent = path.join(fixtureRoot, `acquire-${index}`);
      const source = path.join(parent, ".ralphy");
      fs.mkdirSync(source, { recursive: true });
      const original = acquireMaintenanceLock({ sourcePath: source, runId: `mig_acquire_${index}` });
      releaseMaintenanceLock(original);
      writeAbsentOwnerLock(original.path, { ...original, nonce: `stale-${index}` });
      let faults = 0;
      const restore = setMigrationLockFaultForTesting((candidate) => {
        if (candidate === point && faults < 2) {
          faults += 1;
          throw new Error(`fault:${point}`);
        }
      });
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          expect(() => acquireMaintenanceLock({
            sourcePath: source,
            runId: `mig_acquire_${index}`,
            reclaim: "resume",
          })).toThrow(`fault:${point}`);
          if (fs.existsSync(original.path)) markLockOwnerAbsent(original.path);
          expect(fs.readdirSync(parent).filter((name) => name.includes(".quarantine"))).toHaveLength(1);
        }
      } finally {
        restore();
      }
      const recovered = acquireMaintenanceLock({
        sourcePath: source,
        runId: `mig_acquire_${index}`,
        reclaim: "resume",
      });
      expect(fs.existsSync(`${original.path}.quarantine`)).toBe(false);
      releaseMaintenanceLock(recovered);
    }

    const releasePoints = ["release-after-quarantine", "release-before-quarantine-unlink"] as const;
    for (const [index, point] of releasePoints.entries()) {
      const parent = path.join(fixtureRoot, `release-${index}`);
      const source = path.join(parent, ".ralphy");
      fs.mkdirSync(source, { recursive: true });
      const lock = acquireMaintenanceLock({ sourcePath: source, runId: `mig_release_${index}` });
      let faults = 0;
      const restore = setMigrationLockFaultForTesting((candidate) => {
        if (candidate === point && faults < 2) {
          faults += 1;
          throw new Error(`fault:${point}`);
        }
      });
      try {
        expect(() => releaseMaintenanceLock(lock)).toThrow(`fault:${point}`);
        expect(() => releaseMaintenanceLock(lock)).toThrow(`fault:${point}`);
      } finally {
        restore();
      }
      releaseMaintenanceLock(lock);
      expect(fs.existsSync(lock.path)).toBe(false);
      expect(fs.existsSync(`${lock.path}.quarantine`)).toBe(false);
    }
  });

  test("never unlinks a replacement installed after exact delete validation", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rml-delete-race-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const lockPath = path.join(fixtureRoot, ".ralphy-migration.lock");
    const replacement = "replacement-after-validation\n";
    const restoreCreate = setMigrationLockFaultForTesting((point) => {
      if (point === "create-after-write") throw new Error("create-failure");
      if (point === "delete-after-validation") {
        fs.writeFileSync(lockPath, replacement, { mode: 0o600 });
      }
    });
    try {
      expect(() => acquireMaintenanceLock({ sourcePath: source, runId: "mig_delete_create" }))
        .toThrow(/create-failure/i);
    } finally {
      restoreCreate();
    }
    expect(fs.readFileSync(lockPath, "utf8")).toBe(replacement);
    fs.unlinkSync(lockPath);

    const lock = acquireMaintenanceLock({ sourcePath: source, runId: "mig_delete_release" });
    const quarantinePath = `${lock.path}.quarantine`;
    const restoreRelease = setMigrationLockFaultForTesting((point) => {
      if (point === "delete-after-validation") {
        fs.writeFileSync(quarantinePath, replacement, { mode: 0o600 });
      }
    });
    try {
      releaseMaintenanceLock(lock);
    } finally {
      restoreRelease();
    }
    expect(fs.readFileSync(quarantinePath, "utf8")).toBe(replacement);
  });

  test("blocks same-start owner drift and refuses release by a different live process identity", async () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rml-owner-drift-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const original = acquireMaintenanceLock({ sourcePath: source, runId: "mig_owner" });
    releaseMaintenanceLock(original);
    const drifted = {
      ...original,
      nonce: "same-start-drift",
      processIdentity: {
        ...original.processIdentity,
        parentPid: original.processIdentity.parentPid + 1,
      },
    };
    fs.writeFileSync(original.path, `${JSON.stringify(drifted)}\n`, { mode: 0o600 });
    expect(() => acquireMaintenanceLock({
      sourcePath: source,
      runId: "mig_owner",
      reclaim: "resume",
    })).toThrow(/held/i);
    expect(fs.existsSync(original.path)).toBe(true);
    fs.unlinkSync(original.path);

    const child = Bun.spawn(["/bin/sleep", "30"], { stdout: "ignore", stderr: "ignore" });
    try {
      const childIdentity = inspectMigrationProcessIdentity(child.pid);
      const forged = { ...original, nonce: "foreign-owner", processIdentity: childIdentity };
      fs.writeFileSync(original.path, `${JSON.stringify(forged)}\n`, { mode: 0o600 });
      expect(() => releaseMaintenanceLock(forged)).toThrow(/current process/i);
      expect(JSON.parse(fs.readFileSync(original.path, "utf8"))).toEqual(forged);
    } finally {
      child.kill();
      await child.exited;
      fs.rmSync(original.path, { force: true });
    }
  });

  test("treats failed or truncated process inspection as unknown and blocks quiescence", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rmu-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const tools = processTools(fixtureRoot, {
      ps: "exit 23",
      lsof: `printf '${"x".repeat(1024)}'`,
    });

    const failed = scanMigrationProcesses([source], { ...tools, lsofPath: "/usr/sbin/lsof" });
    expect(failed.status).toBe("unknown");
    expect(() => assertMigrationQuiescent([source], { ...tools, lsofPath: "/usr/sbin/lsof" })).toThrow(/unknown|unavailable/i);

    const truncated = scanMigrationProcesses([source], { ...tools, psPath: "/bin/ps", maxBuffer: 128 });
    expect(truncated.status).toBe("unknown");
    expect(JSON.stringify(truncated)).not.toContain(source);
  });

  test("does not classify an uninspectable lock owner as dead", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rmu-owner-")));
    expect(inspectMigrationProcessIdentityState(process.pid, { platform: "win32" })).toEqual({
      status: "unknown",
      reason: "Migration process identity platform is unsupported: win32",
    });
  });

  test("binds the exact process start and reclaims stale state only for the matching recovery action", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rml-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const lock = acquireMaintenanceLock({ sourcePath: source, runId: "mig_lock" });
    try {
      expect(fs.statSync(lock.path).mode & 0o777).toBe(0o600);
      expect(lock.processIdentity.startId.length).toBeGreaterThan(0);
      expect(JSON.parse(fs.readFileSync(lock.path, "utf8"))).toEqual(lock);
      expect(() => acquireMaintenanceLock({ sourcePath: source, runId: "mig_lock" })).toThrow();
      expect(() => releaseMaintenanceLock({ ...lock, nonce: "wrong" })).toThrow();
      expect(fs.existsSync(lock.path)).toBe(true);
    } finally {
      releaseMaintenanceLock(lock);
    }

    fs.writeFileSync(lock.path, `${JSON.stringify({
      ...lock,
      processIdentity: { ...lock.processIdentity, pid: 999_999_999 },
      nonce: "stale-nonce",
    })}\n`, { mode: 0o600 });
    expect(() => acquireMaintenanceLock({ sourcePath: source, runId: "mig_other", reclaim: "resume" })).toThrow();
    expect(() => acquireMaintenanceLock({ sourcePath: source, runId: "mig_lock" })).toThrow();
    const reclaimed = acquireMaintenanceLock({ sourcePath: source, runId: "mig_lock", reclaim: "resume" });
    expect(reclaimed.nonce).not.toBe("stale-nonce");
    releaseMaintenanceLock(reclaimed);

    const alias = path.join(fixtureRoot, "source-alias");
    fs.symlinkSync(source, alias);
    expect(() => acquireMaintenanceLock({ sourcePath: alias, runId: "mig_alias" })).toThrow(/symlink/i);
  });

  test("reports only redacted process identity and blocks a cwd below the source", async () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rmq-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const child = Bun.spawn(["/bin/sleep", "30"], { cwd: source, stdout: "ignore", stderr: "ignore" });
    try {
      let found: ReturnType<typeof scanMigrationProcesses> = { status: "ok", processes: [] };
      for (let attempt = 0; attempt < 20; attempt += 1) {
        found = scanMigrationProcesses([source]);
        if (found.status === "ok" && found.processes.some((entry) => entry.pid === child.pid)) break;
        await Bun.sleep(25);
      }
      expect(found.status).toBe("ok");
      if (found.status !== "ok") throw new Error(found.reason);
      expect(found.processes.some((entry) => entry.pid === child.pid && entry.category === "source-cwd")).toBe(true);
      expect(JSON.stringify(found)).not.toContain(source);
      expect(JSON.stringify(found)).not.toContain("sleep 30");
      expect(() => assertMigrationQuiescent([source])).toThrow(/quiescent/i);
    } finally {
      child.kill();
      await child.exited;
    }
  });
});

describe("migration service", () => {
  test("checkpoints the stage WAL before each final quiescence scan", async () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rm-wal-order-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);

    await withWalSensitiveProcessTools(fixtureRoot, async () => {
      const started = startMigration({
        sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
      });
      const resumed = await resumeMigration({
        runId: started.runId,
        sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
        lock: started.lock,
      });
      expect(resumed.status.phase).toBe("relations");
    });
  });

  test("status and invalid resume require an existing exact Run store without mutation", async () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rm-readonly-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const runId = "mig_missing";
    const storeRoot = path.join(fixtureRoot, ".ralphy-staging", runId, ".ralphy");
    const before = snapshotTree(fixtureRoot);

    expect(() => migrationStatus({ runId, sourcePath: source, storeRoot })).toThrow(/manifest|source|database|store|run|ENOENT/i);
    expect(snapshotTree(fixtureRoot)).toEqual(before);
    await expect(resumeMigration({
      runId,
      sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
    })).rejects.toThrow(/manifest|source|database|store|run|ENOENT/i);
    expect(snapshotTree(fixtureRoot)).toEqual(before);

    const arbitrary = path.join(fixtureRoot, "arbitrary", ".ralphy");
    expect(() => migrationStatus({ runId, sourcePath: source, storeRoot: arbitrary })).toThrow(/derived|exact|store/i);
    expect(snapshotTree(fixtureRoot)).toEqual(before);

    const db = openDomainDbAt(storeRoot);
    db.prepare(
      `INSERT INTO migration_runs
       (id, stage_root_rel, recovery_root_rel, phase, created_at, updated_at)
       VALUES (?, ?, ?, 'audited', ?, ?)`,
    ).run(runId, `.ralphy-staging/${runId}/.ralphy`, `.ralphy-recovery-${runId}`, Date.now(), Date.now());
    expect(fs.statSync(path.join(storeRoot, "ralphy.db-wal")).size).toBeGreaterThan(0);
    const walBefore = snapshotTree(fixtureRoot);
    expect(() => migrationStatus({ runId, sourcePath: source })).toThrow(/manifest|source|ENOENT/i);
    expect(snapshotTree(fixtureRoot)).toEqual(walBefore);
    db.close();
  });

  test("rejects incomplete verify, cutover, recover, and rollback without filesystem mutation", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rm-disabled-")));
    const source = path.join(fixtureRoot, "live", ".ralphy");
    const stage = path.join(fixtureRoot, "stage", ".ralphy");
    const verification = path.join(fixtureRoot, "verification", "record.json");
    const journal = path.join(fixtureRoot, "journal.json");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(source, "generation.txt"), "legacy");
    fs.writeFileSync(path.join(stage, "generation.txt"), "sqlite");
    fs.mkdirSync(path.dirname(verification));
    fs.writeFileSync(verification, JSON.stringify({ runId: "mig_disabled", verificationId: "verify_disabled", ok: true }), { mode: 0o600 });
    fs.writeFileSync(journal, "not-a-journal", { mode: 0o600 });
    const before = snapshotTree(fixtureRoot);

    expect(() => verifyMigration({
      storeRoot: stage,
      runId: "mig_disabled",
      verificationDir: path.join(fixtureRoot, "new-verification-output"),
    })).toThrow(/unavailable|disabled/i);
    expect(() => cutoverMigration({
      runId: "mig_disabled",
      verificationId: "f".repeat(64),
      verificationDir: path.dirname(verification),
      sourcePath: source,
    })).toThrow(/manifest|source|stage|run|verification|ENOENT/i);
    expect(() => recoverCutover({ sourcePath: source, runId: "mig_disabled" })).toThrow(/journal|unavailable|symlink/i);
    expect(() => rollbackCutover({ sourcePath: source, runId: "mig_disabled" })).toThrow(/journal|unavailable|symlink/i);
    expect(snapshotTree(fixtureRoot)).toEqual(before);
  });

  test("ledgers special-entry coverage issues instead of blocking before inventory", async () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rm-coverage-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "target.txt"), "target\n");
    fs.symlinkSync("target.txt", path.join(source, "legacy-link"));

    await withQuietProcessTools(fixtureRoot, async () => {
      const started = startMigration({
        sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
      });
      expect(started.audit.blockers.some((issue) => (
        issue.code === "MIGRATION_COVERAGE_ENTRY" && issue.severity === "review"
      ))).toBe(true);
      const resumed = await resumeMigration({
        runId: started.runId,
        sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
        lock: started.lock,
      });
      expect(resumed.status.blockingIssues).toBe(1);
    });
  });

  test("derives an isolated stage, inventories under one durable lock, and replays from frozen sources", async () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rms-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(path.join(source, "workspaces", "studio", "projects", "alpha"), { recursive: true });
    fs.writeFileSync(path.join(source, "registry.json"), `${JSON.stringify({
      projects: { alpha: { workspace: "studio" } },
    })}\n`);
    fs.writeFileSync(path.join(source, "workspaces", "studio", "projects", "alpha", "BRIEF.md"), "# Alpha\n");
    const sourceBefore = snapshotTree(source);

    await withQuietProcessTools(fixtureRoot, async () => {
      const started = startMigration({ sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }] });
      expect(started.storeRoot).toBe(
        path.join(fixtureRoot!, ".ralphy-staging", started.runId, ".ralphy"),
      );
      expect(started.cloneSupport).toBe("supported");
      expect(fs.existsSync(path.join(started.storeRoot, "ralphy.db"))).toBe(true);
      expect(fs.existsSync(path.join(fixtureRoot!, ".ralphy-migration.lock"))).toBe(true);

      const resumed = await resumeMigration({
        runId: started.runId,
        sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
        lock: started.lock,
      });
      expect(resumed.status.phase).toBe("relations");
      expect(resumed.inventory?.sourceFiles).toBe(2);
      const stageBeforeStatus = snapshotTree(path.dirname(started.storeRoot));
      expect(migrationStatus({ runId: started.runId, sourcePath: source }).phase).toBe("relations");
      expect(snapshotTree(path.dirname(started.storeRoot))).toEqual(stageBeforeStatus);

      const replayed = await resumeMigration({
        runId: started.runId,
        sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
      });
      expect(replayed.inventory).toBeNull();
      expect(replayed.status.phase).toBe("relations");
      expect(snapshotTree(source)).toEqual(sourceBefore);
    });
  });

  test("refuses caller-selected or broad mutation targets before creating state", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rmt-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    expect(() => startMigration({
      storeRoot: source,
      sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
    } as Parameters<typeof startMigration>[0])).toThrow(/derived|target|store/i);
    expect(fs.readdirSync(source)).toEqual([]);
    expect(() => startMigration({
      sourceRoots: [{ id: "ralphy", kind: "ralphy", path: path.parse(source).root }],
    })).toThrow(/broad|source|\.ralphy/i);
    const desktop = path.join(fixtureRoot, "desktop");
    fs.mkdirSync(desktop);
    expect(() => startMigration({
      sourceRoots: [
        { id: "duplicate", kind: "ralphy", path: source },
        { id: "duplicate", kind: "desktop", path: desktop },
      ],
    })).toThrow(/label|unique/i);
  });

  test("ships only the staged migration command surface", () => {
    const result = Bun.spawnSync([
      "bun",
      "run",
      path.resolve(import.meta.dir, "../../cli/index.ts"),
      "migrate",
      "--help",
    ], { cwd: path.resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" });
    const stdout = result.stdout.toString("utf8");
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("audit");
    expect(stdout).toContain("run");
    expect(stdout).not.toContain("\n  domain");
    expect(stdout).not.toContain("--dry-run");
    expect(stdout).not.toContain("--project");
  });
});

function snapshotFiles(files: string[]): Snapshot {
  return Object.fromEntries(files.map((file) => [file, snapshotEntry(file)]));
}

function writeAbsentOwnerLock(
  lockPath: string,
  lock: ReturnType<typeof acquireMaintenanceLock>,
): void {
  fs.writeFileSync(lockPath, `${JSON.stringify({
    ...lock,
    processIdentity: { ...lock.processIdentity, pid: 999_999_999 },
  })}\n`, { mode: 0o600 });
}

function markLockOwnerAbsent(lockPath: string): void {
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as ReturnType<typeof acquireMaintenanceLock>;
  writeAbsentOwnerLock(lockPath, lock);
}

async function withQuietProcessTools<T>(root: string, action: () => Promise<T>): Promise<T> {
  const bin = path.join(root, "quiet-bin");
  fs.mkdirSync(bin);
  const ps = path.join(bin, "ps");
  const lsof = path.join(bin, "lsof");
  fs.writeFileSync(ps, `#!/bin/sh\nif [ "$1" = "-o" ] && [ "$2" = "lstart=" ]; then exec /bin/ps "$@"; fi\nprintf ' 1 launchd launchd\\n'\n`);
  fs.writeFileSync(lsof, "#!/bin/sh\nprintf 'p1\\nclaunchd\\nfcwd\\nn/\\n'\n");
  fs.chmodSync(ps, 0o700);
  fs.chmodSync(lsof, 0o700);
  const restore = setMigrationProcessToolsForTesting({ psPath: ps, lsofPath: lsof });
  try {
    return await action();
  } finally {
    restore();
  }
}

function processTools(
  directory: string,
  bodies: { ps: string; lsof: string },
): { psPath: string; lsofPath: string } {
  const bin = path.join(directory, "process-tools");
  fs.mkdirSync(bin, { recursive: true });
  const psPath = path.join(bin, "ps");
  const lsofPath = path.join(bin, "lsof");
  fs.writeFileSync(psPath, `#!/bin/sh\n${bodies.ps}\n`);
  fs.writeFileSync(lsofPath, `#!/bin/sh\n${bodies.lsof}\n`);
  fs.chmodSync(psPath, 0o700);
  fs.chmodSync(lsofPath, 0o700);
  return { psPath, lsofPath };
}

function auditRegistryProjects(projects: unknown): ReturnType<typeof auditMigration> {
  fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rm-registry-shape-")));
  const source = path.join(fixtureRoot, ".ralphy");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "registry.json"), JSON.stringify({ projects }));
  return auditMigration({ sourceRoots: [{ kind: "ralphy", path: source }] });
}

async function withWalSensitiveProcessTools<T>(root: string, action: () => Promise<T>): Promise<T> {
  const tools = processTools(root, {
    ps: "printf ' 1 launchd launchd\\n'",
    lsof: `for wal in "${root}"/.ralphy-staging/*/.ralphy/ralphy.db-wal; do
  [ -e "$wal" ] || continue
  [ ! -s "$wal" ] || exit 23
done
printf 'p1\\nclaunchd\\nfcwd\\nn/\\n'`,
  });
  const restore = setMigrationProcessToolsForTesting(tools);
  try {
    return await action();
  } finally {
    restore();
  }
}

function snapshotTree(root: string): Snapshot {
  const result: Snapshot = {};
  const visit = (directory: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      result[relative] = snapshotEntry(absolute);
      if (result[relative]!.kind === "directory") visit(absolute);
    }
  };
  visit(root);
  return result;
}

function snapshotEntry(file: string): Snapshot[string] {
  const stat = fs.lstatSync(file);
  return {
    kind: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
    device: String(stat.dev),
    inode: String(stat.ino),
    mode: stat.mode,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ...(stat.isFile()
      ? { sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") }
      : {}),
  };
}
