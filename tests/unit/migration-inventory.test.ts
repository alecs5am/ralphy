import { afterEach, describe, expect, test } from "bun:test";
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
} from "../../cli/lib/migration/inventory.js";
import {
  migrationStatus,
  resumeMigration,
  startMigration,
} from "../../cli/lib/migration/service.js";
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

    const audit = auditMigration({ sourceRoots: fixture.sourceRoots });

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
    expect(audit.jobStatusCounts).toEqual({ pending: 1 });
    expect(audit.desktopCandidates).toEqual({ reviews: 1, secrets: 1, settings: 1 });
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
        sourcePath: string;
        entryKind: string;
        disposition: string;
        bytes: number;
        sha256: string | null;
      }, [string]>(
        `SELECT source_path AS sourcePath, entry_kind AS entryKind, disposition, bytes, sha256
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
  test("binds the exact process start and reclaims stale state only for the matching recovery action", () => {
    fixtureRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rml-")));
    const source = path.join(fixtureRoot, ".ralphy");
    fs.mkdirSync(source);
    const lock = acquireMaintenanceLock({ sourcePath: source, runId: "mig_lock" });
    try {
      expect(fs.statSync(lock.path).mode & 0o777).toBe(0o600);
      expect(lock.processStartIdentity.length).toBeGreaterThan(0);
      expect(JSON.parse(fs.readFileSync(lock.path, "utf8"))).toEqual(lock);
      expect(() => acquireMaintenanceLock({ sourcePath: source, runId: "mig_lock" })).toThrow();
      expect(() => releaseMaintenanceLock({ ...lock, nonce: "wrong" })).toThrow();
      expect(fs.existsSync(lock.path)).toBe(true);
    } finally {
      releaseMaintenanceLock(lock);
    }

    fs.writeFileSync(lock.path, `${JSON.stringify({
      ...lock,
      pid: 999_999_999,
      processStartIdentity: "dead-process",
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
      let found: ReturnType<typeof scanMigrationProcesses> = [];
      for (let attempt = 0; attempt < 20; attempt += 1) {
        found = scanMigrationProcesses([source]);
        if (found.some((entry) => entry.pid === child.pid)) break;
        await Bun.sleep(25);
      }
      expect(found.some((entry) => entry.pid === child.pid && entry.category === "source-cwd")).toBe(true);
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
      expect(resumed.status.phase).toBe("inventory");
      expect(resumed.inventory?.sourceFiles).toBe(2);
      expect(migrationStatus({ runId: started.runId, storeRoot: started.storeRoot })?.phase).toBe("inventory");

      const replayed = await resumeMigration({
        runId: started.runId,
        sourceRoots: [{ id: "ralphy", kind: "ralphy", path: source }],
        lock: started.lock,
      });
      expect(replayed.inventory).toEqual(resumed.inventory);
      expect(snapshotTree(source)).toEqual(sourceBefore);
      releaseMaintenanceLock(started.lock);
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

async function withQuietProcessTools<T>(root: string, action: () => Promise<T>): Promise<T> {
  const bin = path.join(root, "quiet-bin");
  fs.mkdirSync(bin);
  const ps = path.join(bin, "ps");
  const lsof = path.join(bin, "lsof");
  fs.writeFileSync(ps, `#!/bin/sh\nif [ "$1" = "-o" ] && [ "$2" = "lstart=" ]; then exec /bin/ps "$@"; fi\nexit 0\n`);
  fs.writeFileSync(lsof, "#!/bin/sh\nexit 0\n");
  fs.chmodSync(ps, 0o700);
  fs.chmodSync(lsof, 0o700);
  const previousPath = process.env.PATH;
  process.env.PATH = `${bin}:${previousPath ?? ""}`;
  try {
    return await action();
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
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
