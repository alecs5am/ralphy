import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb, openDomainDbAt } from "../../cli/lib/store/db.js";
import {
  auditMigration,
  createMigrationSourceRoot,
  releaseMaintenanceLock,
  setMigrationProcessToolsForTesting,
} from "../../cli/lib/migration/inventory.js";
import { importScopesAndDocuments } from "../../cli/lib/migration/import.js";
import { cutoverMigration, migrationStatus, resumeMigration, rollbackCutover, startMigration } from "../../cli/lib/migration/service.js";
import { stageInventoryObjects } from "../../cli/lib/migration/staging.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot | null = null;
let restoreProcessTools: (() => void) | null = null;

afterEach(() => {
  closeDomainDb();
  restoreProcessTools?.();
  restoreProcessTools = null;
  root?.cleanup();
  root = null;
});

describe("domain migration primitives", () => {
  test("audits without creating the journal, then inventories and stages deterministically", async () => {
    root = makeTmpRoot("ralphy-migration");
    quietProcessTools(root.dir);
    const source = path.join(fs.realpathSync(root.dir), "source", ".ralphy");
    fs.mkdirSync(path.join(source, "projects", "alpha", "docs"), { recursive: true });
    fs.mkdirSync(path.join(source, "media"), { recursive: true });
    fs.writeFileSync(path.join(source, "projects", "alpha", "docs", "BRIEF.md"), "# Brief\n");
    fs.writeFileSync(path.join(source, "media", "hero.png"), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(source, "unknown.bin"), Buffer.from([4, 5]));

    const audit = auditMigration({ sourceRoots: [{ kind: "ralphy", path: source }] });
    expect(audit.sourceFiles).toBe(3);
    expect(fs.existsSync(path.join(root.dir, ".ralphy", "ralphy.db"))).toBe(false);

    const started = startMigration({
      sourceRoots: [{ id: "source", kind: "ralphy", path: source }],
    });
    const resumed = await resumeMigration({
      runId: started.runId,
      sourceRoots: [{ id: "source", kind: "ralphy", path: source }],
      lock: started.lock,
    });
    expect(resumed.inventory?.sourceFiles).toBe(3);
    const stageDb = openDomainDbAt(started.storeRoot);
    expect(stageDb.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_entries WHERE migration_run_id = ?",
    ).get(started.runId)?.count).toBeGreaterThan(3);
    expect(stageDb.query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE migration_run_id = ?",
    ).get(started.runId)?.count).toBe(1);

    fs.rmSync(path.join(source, "unknown.bin"));
    stageDb.prepare(
      "UPDATE migration_issues SET resolved_at = ? WHERE migration_run_id = ?",
    ).run(Date.now(), started.runId);
    stageDb.prepare(
      `UPDATE migration_entries
       SET disposition = 'recovery-only', state = 'excluded', terminal_at = ?, updated_at = ?
       WHERE migration_run_id = ? AND state = 'issue'`,
    ).run(Date.now(), Date.now(), started.runId);
    const ctx = {
      db: stageDb,
      storeRoot: started.storeRoot,
      sourceRoots: [{ id: "source", kind: "ralphy" as const, path: fs.realpathSync(source), device: BigInt(fs.statSync(source).dev), inode: BigInt(fs.statSync(source).ino) }],
      runId: started.runId,
    };
    const imported = importScopesAndDocuments(ctx);
    expect(imported.documents).toBe(1);
    const staged = await stageInventoryObjects(ctx);
    expect(staged.staged).toBe(2);
    stageDb.close();
    releaseMaintenanceLock(started.lock);
  });

  test("cutover and rollback stay disabled without changing either generation", () => {
    root = makeTmpRoot("ralphy-cutover");
    const live = path.join(root.dir, "live", ".ralphy");
    const stage = path.join(root.dir, "stage", ".ralphy");
    const verification = path.join(root.dir, "verification.json");
    fs.mkdirSync(live, { recursive: true });
    fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(live, "generation.txt"), "legacy");
    fs.writeFileSync(path.join(stage, "generation.txt"), "sqlite");
    fs.writeFileSync(verification, JSON.stringify({ runId: "mig_cutover", verificationId: "verify_cutover", ok: true }), { mode: 0o600 });

    expect(() => cutoverMigration({
      runId: "mig_cutover",
      verificationId: "verify_cutover",
      verificationPath: verification,
      sourcePath: live,
      stagePath: stage,
    })).toThrow(/unavailable|disabled/i);
    expect(() => rollbackCutover({ journalPath: path.join(root.dir, "missing-journal"), runId: "mig_cutover" })).toThrow(/unavailable|disabled/i);
    expect(fs.readFileSync(path.join(live, "generation.txt"), "utf8")).toBe("legacy");
    expect(fs.readFileSync(path.join(stage, "generation.txt"), "utf8")).toBe("sqlite");
  });

  test("migration service writes only to its derived store root", async () => {
    root = makeTmpRoot("ralphy-migration-explicit-root");
    quietProcessTools(root.dir);
    const source = path.join(fs.realpathSync(root.dir), "source", ".ralphy");
    fs.mkdirSync(source, { recursive: true });
    fs.writeFileSync(path.join(source, "BRIEF.md"), "# Explicit\n");

    const started = startMigration({
      sourceRoots: [{ id: "source", kind: "ralphy", path: source }],
    });
    await resumeMigration({
      runId: started.runId,
      sourceRoots: [{ id: "source", kind: "ralphy", path: source }],
      lock: started.lock,
    });

    expect(fs.existsSync(path.join(started.storeRoot, "ralphy.db"))).toBe(true);
    expect(fs.existsSync(path.join(root.dir, ".ralphy", "ralphy.db"))).toBe(false);
    expect(migrationStatus({ runId: started.runId, sourcePath: source }).phase).toBe("inventory");
    releaseMaintenanceLock(started.lock);
  });

  test("imports same-kind sources by immutable source identity", async () => {
    root = makeTmpRoot("ralphy-migration-source-identity");
    quietProcessTools(root.dir);
    const first = path.join(fs.realpathSync(root.dir), "first", ".ralphy");
    const second = path.join(fs.realpathSync(root.dir), "second");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    fs.writeFileSync(path.join(first, "BRIEF.md"), "first-source\n");
    fs.writeFileSync(path.join(second, "BRIEF.md"), "second-source\n");

    const sourceRoots = [
      { id: "first", kind: "ralphy" as const, path: first },
      { id: "second", kind: "ralphy" as const, path: second },
    ];
    const started = startMigration({ sourceRoots });
    await resumeMigration({ runId: started.runId, sourceRoots, lock: started.lock });
    const db = openDomainDbAt(started.storeRoot);
    try {
      importScopesAndDocuments({
        db,
        storeRoot: started.storeRoot,
        sourceRoots: sourceRoots.map(createMigrationSourceRoot),
        runId: started.runId,
      });
      const importedBodies = db.query<{ body: string }, [string]>(
        `SELECT revision.body FROM document_revisions revision
         JOIN documents document ON document.current_revision_id = revision.id
         WHERE document.slug LIKE 'brief-%' ORDER BY revision.body`,
      ).all();
      expect(importedBodies.map((row) => row.body)).toEqual(["first-source\n", "second-source\n"]);
    } finally {
      db.close();
      releaseMaintenanceLock(started.lock);
    }
  });
});

function quietProcessTools(directory: string): void {
  const bin = path.join(directory, "quiet-bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "ps"), `#!/bin/sh\nif [ "$1" = "-o" ] && [ "$2" = "lstart=" ]; then exec /bin/ps "$@"; fi\nprintf ' 1 launchd launchd\\n'\n`);
  fs.writeFileSync(path.join(bin, "lsof"), "#!/bin/sh\nprintf 'p1\\nclaunchd\\nfcwd\\nn/\\n'\n");
  fs.chmodSync(path.join(bin, "ps"), 0o700);
  fs.chmodSync(path.join(bin, "lsof"), 0o700);
  restoreProcessTools = setMigrationProcessToolsForTesting({
    psPath: path.join(bin, "ps"),
    lsofPath: path.join(bin, "lsof"),
  });
}
