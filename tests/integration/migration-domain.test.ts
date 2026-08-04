import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { auditMigration } from "../../cli/lib/migration/inventory.js";
import { importScopesAndDocuments } from "../../cli/lib/migration/import.js";
import { cutoverMigration, resumeMigration, rollbackCutover, startMigration } from "../../cli/lib/migration/service.js";
import { stageInventoryObjects } from "../../cli/lib/migration/staging.js";
import { freezeMigration, verifyMigration } from "../../cli/lib/migration/verify.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot | null = null;

afterEach(() => {
  closeDomainDb();
  root?.cleanup();
  root = null;
});

describe("domain migration primitives", () => {
  test("audits without creating the journal, then inventories and stages deterministically", () => {
    root = makeTmpRoot("ralphy-migration");
    const source = path.join(root.dir, "source");
    const verification = path.join(root.dir, "verification");
    fs.mkdirSync(path.join(source, "projects", "alpha", "docs"), { recursive: true });
    fs.mkdirSync(path.join(source, "media"), { recursive: true });
    fs.writeFileSync(path.join(source, "projects", "alpha", "docs", "BRIEF.md"), "# Brief\n");
    fs.writeFileSync(path.join(source, "media", "hero.png"), Buffer.from([1, 2, 3]));
    fs.writeFileSync(path.join(source, "unknown.bin"), Buffer.from([4, 5]));

    const audit = auditMigration({ sourceRoots: [{ kind: "ralphy", path: source }] });
    expect(audit.sourceFiles).toBe(3);
    expect(fs.existsSync(path.join(root.dir, ".ralphy", "ralphy.db"))).toBe(false);

    const started = startMigration({
      storeRoot: path.join(root.dir, ".ralphy"),
      sourceRoots: [{ id: "source", kind: "ralphy", path: source }],
    });
    const resumed = resumeMigration({
      runId: started.runId,
      storeRoot: path.join(root.dir, ".ralphy"),
      sourceRoots: [{ id: "source", kind: "ralphy", path: source }],
    });
    expect(resumed.inventory?.sourceFiles).toBe(3);
    expect(openDomainDb().query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_entries WHERE migration_run_id = ?",
    ).get(started.runId)?.count).toBeGreaterThan(3);
    expect(openDomainDb().query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM migration_issues WHERE migration_run_id = ?",
    ).get(started.runId)?.count).toBe(1);

    fs.rmSync(path.join(source, "unknown.bin"));
    openDomainDb().prepare(
      "UPDATE migration_issues SET resolved_at = ? WHERE migration_run_id = ?",
    ).run(Date.now(), started.runId);
    const ctx = {
      db: openDomainDb(),
      storeRoot: path.join(root.dir, ".ralphy"),
      sourceRoots: [{ id: "source", kind: "ralphy" as const, path: fs.realpathSync(source), device: BigInt(fs.statSync(source).dev), inode: BigInt(fs.statSync(source).ino) }],
      runId: started.runId,
    };
    const imported = importScopesAndDocuments(ctx);
    expect(imported.documents).toBe(1);
    const staged = stageInventoryObjects(ctx);
    expect(staged.staged).toBe(1);
    const frozen = freezeMigration(ctx, { verificationDir: verification });
    expect(frozen.entryCount).toBeGreaterThan(0);
    const verified = verifyMigration({ storeRoot: path.join(root.dir, ".ralphy"), runId: started.runId, verificationDir: verification });
    expect(verified.ok).toBe(true);
    expect(verified.verificationId).toHaveLength(32);
    expect(fs.statSync(verified.recordPath).mode & 0o777).toBe(0o600);
    expect(fs.statSync(frozen.recordPath).mode & 0o777).toBe(0o600);
  });

  test("cutover is journaled and rollback restores the original generation", () => {
    root = makeTmpRoot("ralphy-cutover");
    const live = path.join(root.dir, "live", ".ralphy");
    const stage = path.join(root.dir, "stage", ".ralphy");
    const verification = path.join(root.dir, "verification.json");
    fs.mkdirSync(live, { recursive: true });
    fs.mkdirSync(stage, { recursive: true });
    fs.writeFileSync(path.join(live, "generation.txt"), "legacy");
    fs.writeFileSync(path.join(stage, "generation.txt"), "sqlite");
    fs.writeFileSync(verification, JSON.stringify({ runId: "mig_cutover", verificationId: "verify_cutover", ok: true }), { mode: 0o600 });

    const journal = cutoverMigration({
      runId: "mig_cutover",
      verificationId: "verify_cutover",
      verificationPath: verification,
      sourcePath: live,
      stagePath: stage,
    });
    expect(journal.state).toBe("installed");
    expect(fs.readFileSync(path.join(live, "generation.txt"), "utf8")).toBe("sqlite");
    expect(fs.readFileSync(path.join(journal.recoveryPath, "generation.txt"), "utf8")).toBe("legacy");
    expect(fs.statSync(journal.journalPath).mode & 0o777).toBe(0o600);

    const rolledBack = rollbackCutover({ journalPath: journal.journalPath, runId: "mig_cutover" });
    expect(rolledBack.state).toBe("rolled-back");
    expect(fs.readFileSync(path.join(live, "generation.txt"), "utf8")).toBe("legacy");
    expect(fs.readFileSync(path.join(journal.rollbackPath, "generation.txt"), "utf8")).toBe("sqlite");
  });
});
