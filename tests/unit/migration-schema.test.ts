import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import {
  closeDomainDb,
  openDomainDb,
} from "../../cli/lib/store/db.js";
import { sourceLocatorHash } from "../../cli/lib/migration/inventory.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const RUN_ID = "mig_schema";
const OTHER_RUN_ID = "mig_other";
const SOURCE_ID = "migration-source";
const OTHER_SOURCE_ID = "other-source";
const LOCATOR_HASH =
  "8e2e017b7a4dbe19a5b8455f662d40a389ee89d067e5969133a60d18792156df";
const SAME_RALPHY_HASH =
  "001653c69f8fe5dd84d0fdfead4c275b155b58d92216482a7b52e0380f842395";
const SAME_DESKTOP_HASH =
  "af1e641c61fcb8f4d24e234e62995d1977fcd88659757edf0b71d2b2dc4ed982";

let roots: TmpRoot[] = [];

function database(): Database {
  const root = makeTmpRoot("ralphy-migration-schema");
  roots.push(root);
  const db = openDomainDb();
  insertRun(db, RUN_ID);
  insertRun(db, OTHER_RUN_ID);
  insertSource(db, {
    id: SOURCE_ID,
    runId: RUN_ID,
    kind: "ralphy",
    device: "1",
    inode: "10",
  });
  insertSource(db, {
    id: OTHER_SOURCE_ID,
    runId: OTHER_RUN_ID,
    kind: "desktop",
    device: "2",
    inode: "20",
  });
  return db;
}

function insertRun(db: Database, id: string): void {
  db.prepare(
    `INSERT INTO migration_runs (id, phase, created_at, updated_at)
     VALUES (?, 'audited', 1, 1)`,
  ).run(id);
}

function insertSource(
  db: Database,
  input: {
    id: string;
    runId: string;
    kind: "ralphy" | "legacy-workspace" | "desktop";
    device: string;
    inode: string;
  },
): void {
  db.prepare(
    `INSERT INTO migration_sources
     (id, migration_run_id, source_kind, source_label, canonical_path_hash,
      source_device, source_inode, source_mode, created_at)
     VALUES (?, ?, ?, 'source', ?, ?, ?, 448, 1)`,
  ).run(input.id, input.runId, input.kind, "a".repeat(64), input.device, input.inode);
}

function insertEntry(
  db: Database,
  input: {
    id?: string;
    runId?: string;
    sourceId?: string;
    sourceKind?: "ralphy" | "legacy-workspace" | "desktop";
    sourcePath?: string;
    locatorHash?: string;
    disposition?: string;
    state?: string;
    targetRefsJson?: string | null;
    terminalAt?: number | null;
  } = {},
): void {
  db.prepare(
    `INSERT INTO migration_entries
     (id, migration_run_id, migration_source_id, source_path,
      source_locator_hash, entry_kind, source_kind, disposition,
      source_device, source_inode, source_mode, bytes, mtime_ms, sha256,
      target_path, target_refs_json, raw_evidence_object_id, state,
      error_code, terminal_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'file', ?, ?, '1', '100', 420, 3, 1, NULL,
             NULL, ?, NULL, ?, NULL, ?, 1, 1)`,
  ).run(
    input.id ?? "entry",
    input.runId ?? RUN_ID,
    input.sourceId ?? SOURCE_ID,
    input.sourcePath ?? "project/file.txt",
    input.locatorHash ?? LOCATOR_HASH,
    input.sourceKind ?? "ralphy",
    input.disposition ?? "domain",
    input.targetRefsJson ?? null,
    input.state ?? "inventoried",
    input.terminalAt ?? null,
  );
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("migration journal schema", () => {
  test("hashes only normalized relative POSIX source locators", () => {
    expect(sourceLocatorHash("ralphy", "unknown.bin")).toBe(
      "bbc73c04d0ed53b58ca328a48469551a62bfce650febb3a672262712fc3cfcf5",
    );
    for (const locator of [
      "/absolute",
      "C:/drive",
      "https://example.test/file",
      "data:text/plain,hello",
      "../escape",
      "nested/../escape",
      "nested//empty",
      "nested\\windows",
      "cafe\u0301.txt",
      "nul\0byte",
    ]) {
      expect(() => sourceLocatorHash("ralphy", locator)).toThrow();
    }
  });

  test("creates the journal and enforces its source foreign keys", () => {
    const db = database();
    expect(
      db.query("SELECT name FROM sqlite_master WHERE name = 'migration_entries'").get(),
    ).not.toBeNull();
    expect(() =>
      db.query(`INSERT INTO migration_entries
        (id, migration_run_id, migration_source_id, source_path,
         source_locator_hash, entry_kind, source_kind, disposition,
         source_device, source_inode, source_mode, bytes, mtime_ms,
         state, created_at, updated_at)
        VALUES ('entry', 'missing', 'missing-source', 'x',
                '${"a".repeat(64)}', 'file', 'ralphy', 'object',
                '1', '1', 420, 0, 1, 'inventoried', 1, 1)`).run(),
    ).toThrow();
    expect(() =>
      insertEntry(db, {
        runId: RUN_ID,
        sourceId: OTHER_SOURCE_ID,
        sourceKind: "desktop",
      }),
    ).toThrow();
    expect(() => insertEntry(db, { sourceKind: "desktop" })).toThrow();
  });

  test("accepts the same relative path from distinct source roots", () => {
    const db = database();
    insertEntry(db, {
      id: "ralphy-entry",
      sourcePath: "same/path",
      locatorHash: SAME_RALPHY_HASH,
    });
    insertSource(db, {
      id: "desktop-same-run",
      runId: RUN_ID,
      kind: "desktop",
      device: "2",
      inode: "21",
    });
    insertEntry(db, {
      id: "desktop-entry",
      sourceId: "desktop-same-run",
      sourceKind: "desktop",
      sourcePath: "same/path",
      locatorHash: SAME_DESKTOP_HASH,
    });
    expect(
      db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM migration_entries").get(),
    ).toEqual({ count: 2 });
  });

  test("rejects unsafe source locators", () => {
    const db = database();
    for (const sourcePath of [
      "",
      ".",
      "/absolute",
      "../escape",
      "nested/../escape",
      "nested//empty",
      "nested\\windows",
      "C:/drive",
      "https://example.test/file",
      "data:text/plain,hello",
    ]) {
      expect(() => insertEntry(db, { id: `bad-${sourcePath}`, sourcePath })).toThrow();
    }
  });

  test("couples dispositions to states and requires terminal timestamps", () => {
    const db = database();
    const invalid = [
      { disposition: "domain", state: "verified", terminalAt: 2 },
      { disposition: "object", state: "imported", terminalAt: 2 },
      { disposition: "cache", state: "verified", terminalAt: 2 },
      { disposition: "issue", state: "inventoried", terminalAt: null },
      { disposition: "object", state: "verified", terminalAt: null },
      { disposition: "object", state: "inventoried", terminalAt: 2 },
    ];
    for (const [index, entry] of invalid.entries()) {
      expect(() => insertEntry(db, { id: `invalid-${index}`, ...entry })).toThrow();
    }
    insertEntry(db, {
      id: "domain-terminal",
      disposition: "domain",
      state: "imported",
      targetRefsJson: '["doc_00000000-0000-4000-8000-000000000001"]',
      terminalAt: 2,
    });
    insertEntry(db, {
      id: "secret-terminal",
      sourcePath: "secret.txt",
      locatorHash: "bc495ce3e2cf787359542e10a7a9a7b677d34d3cd5bb8139fe28b4b679f34cb3",
      disposition: "secret-imported",
      state: "excluded",
      targetRefsJson: '["provider/x/access-token"]',
      terminalAt: 2,
    });
  });

  test("accepts only canonical sorted unique target references", () => {
    const db = database();
    for (const [index, targetRefsJson] of [
      "{}",
      '["doc_00000000-0000-4000-8000-000000000002", "doc_00000000-0000-4000-8000-000000000001"]',
      '["doc_00000000-0000-4000-8000-000000000001","doc_00000000-0000-4000-8000-000000000001"]',
      '["not-a-domain-id"]',
      '["provider/../token"]',
      '[1]',
    ].entries()) {
      expect(() =>
        insertEntry(db, {
          id: `refs-${index}`,
          targetRefsJson,
        }),
      ).toThrow();
    }
    insertEntry(db, {
      id: "canonical-refs",
      targetRefsJson:
        '["doc_00000000-0000-4000-8000-000000000001","provider/x/access-token"]',
    });
  });

  test("rejects replacement, identity edits, backward transitions, and terminal edits", () => {
    const db = database();
    db.exec("PRAGMA recursive_triggers = OFF");
    expect(() =>
      db.prepare(
        `INSERT OR REPLACE INTO migration_sources
         (id, migration_run_id, source_kind, source_label, canonical_path_hash,
          source_device, source_inode, source_mode, created_at)
         VALUES (?, ?, 'ralphy', 'replacement', ?, '1', '10', 448, 1)`,
      ).run(SOURCE_ID, RUN_ID, "b".repeat(64)),
    ).toThrow(/append-only|immutable/i);

    insertEntry(db);
    expect(() =>
      db.prepare("UPDATE migration_entries SET source_inode = 'changed' WHERE id = 'entry'").run(),
    ).toThrow(/immutable/i);
    db.prepare(
      `UPDATE migration_entries
       SET state = 'imported', target_refs_json = ?, terminal_at = 2, updated_at = 2
       WHERE id = 'entry'`,
    ).run('["doc_00000000-0000-4000-8000-000000000001"]');
    expect(() =>
      db.prepare("UPDATE migration_entries SET state = 'inventoried' WHERE id = 'entry'").run(),
    ).toThrow(/terminal|transition/i);
    expect(() =>
      db.prepare("UPDATE migration_entries SET terminal_at = 3 WHERE id = 'entry'").run(),
    ).toThrow(/terminal|immutable/i);
    expect(() =>
      db.prepare("DELETE FROM migration_entries WHERE id = 'entry'").run(),
    ).toThrow(/append-only/i);

    db.prepare("UPDATE migration_runs SET phase = 'inventory', updated_at = 2 WHERE id = ?").run(RUN_ID);
    expect(() =>
      db.prepare("UPDATE migration_runs SET phase = 'audited', updated_at = 3 WHERE id = ?").run(RUN_ID),
    ).toThrow(/transition/i);
    db.prepare("UPDATE migration_runs SET phase = 'failed', updated_at = 3 WHERE id = ?").run(RUN_ID);
    expect(() =>
      db.prepare("UPDATE migration_runs SET phase = 'inventory', updated_at = 4 WHERE id = ?").run(RUN_ID),
    ).toThrow(/terminal|transition/i);
  });

  test("allows an issue decision to move forward only after blockers resolve", () => {
    const db = database();
    insertEntry(db, {
      id: "issue-entry",
      sourcePath: "unknown.bin",
      locatorHash: "bbc73c04d0ed53b58ca328a48469551a62bfce650febb3a672262712fc3cfcf5",
      disposition: "issue",
      state: "issue",
      terminalAt: 2,
    });
    expect(() =>
      db.prepare("UPDATE migration_runs SET phase = 'import', updated_at = 2 WHERE id = ?").run(RUN_ID),
    ).toThrow(/issue/i);
    db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, migration_entry_id, code, severity,
        detail_json, created_at)
       VALUES ('issue-1', ?, 'issue-entry', 'unknown', 'block',
               '{"reason":"unknown"}', 2)`,
    ).run(RUN_ID);
    expect(() =>
      db.prepare(
        "UPDATE migration_entries SET updated_at = 3 WHERE id = 'issue-entry'",
      ).run(),
    ).toThrow(/terminal|immutable/i);
    expect(() =>
      db.prepare(
        `UPDATE migration_entries
         SET target_path = 'staged/unknown.bin', updated_at = 3
         WHERE id = 'issue-entry'`,
      ).run(),
    ).toThrow(/terminal|immutable/i);
    expect(() =>
      db.prepare(
        `UPDATE migration_entries
         SET terminal_at = 3, updated_at = 3 WHERE id = 'issue-entry'`,
      ).run(),
    ).toThrow(/terminal|immutable/i);
    expect(() =>
      db.prepare(
        `INSERT INTO migration_issues
         (id, migration_run_id, migration_entry_id, code, severity,
          detail_json, created_at)
         VALUES ('issue-2', ?, 'issue-entry', 'duplicate-decision', 'review',
                 '{"reason":"duplicate"}', 2)`,
      ).run(RUN_ID),
    ).toThrow(/issue|decision/i);
    expect(() =>
      db.prepare(
        `UPDATE migration_entries
         SET disposition = 'recovery-only', state = 'excluded', terminal_at = 3,
             updated_at = 3 WHERE id = 'issue-entry'`,
      ).run(),
    ).toThrow(/unresolved/i);
    db.prepare("UPDATE migration_issues SET resolved_at = 3 WHERE id = 'issue-1'").run();
    db.prepare(
      `UPDATE migration_entries
       SET disposition = 'recovery-only', state = 'excluded', terminal_at = 3,
           updated_at = 3 WHERE id = 'issue-entry'`,
    ).run();
    expect(() =>
      db.prepare("UPDATE migration_entries SET disposition = 'issue', state = 'issue' WHERE id = 'issue-entry'").run(),
    ).toThrow(/terminal|transition/i);
  });
});

describe("legacy migration fixture", () => {
  test("builds the complete live-shaped source surface with exact accounting", async () => {
    const modulePath = "../fixtures/migration/build-legacy-library.js";
    const fixtureModule = await import(modulePath).catch(() => null);
    expect(fixtureModule).not.toBeNull();
    if (fixtureModule === null) return;

    const root = makeTmpRoot("ralphy-legacy-fixture");
    roots.push(root);
    const fixture = fixtureModule.buildLegacyLibrary(root.dir);
    try {
      expect(fixture.sourceRoots.map((source: { kind: string }) => source.kind)).toEqual([
        "ralphy",
        "legacy-workspace",
        "desktop",
      ]);
      for (const source of fixture.sourceRoots) {
        expect(inventory(source.path)).toEqual(fixture.expected.bySource[source.kind]);
      }
      expect(fixture.expected.entries).toBeGreaterThan(180);
      expect(fixture.expected.files).toBeGreaterThan(130);
      expect(fixture.expected.bytes).toBeGreaterThan(667_395);
      expect(Object.keys(fixture.expected.sha256)).toHaveLength(fixture.expected.files);
      expect(
        fixture.expected.sha256[
          "ralphy:workspaces/studio/projects/registered-project/unknown-empty-file"
        ],
      ).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");

      const registry = JSON.parse(fs.readFileSync(fixture.paths.registry, "utf8"));
      expect(Object.keys(registry.projects).sort()).toEqual([
        "registered-project",
        "registry-only-project",
      ]);
      expect(fs.existsSync(fixture.paths.registeredProject)).toBe(true);
      expect(fs.existsSync(fixture.paths.physicalOnlyProject)).toBe(true);
      expect(fs.existsSync(path.join(fixture.paths.currentRoot, "workspaces/studio/projects/registry-only-project"))).toBe(false);
      expect(fs.existsSync(fixture.paths.legacyRoot)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(fixture.paths.assetManifest, "utf8"));
      expect(path.isAbsolute(manifest.assets[0].path)).toBe(true);
      expect(manifest.assets[1].dataUrl).toStartWith("data:image/png;base64,");
      expect(fs.readFileSync(fixture.paths.jsonl, "utf8").split("\n").slice(0, 3)).toEqual([
        '{"id":"before","status":"failed"}',
        '{"id":"malformed",',
        '{"id":"after","status":"succeeded"}',
      ]);

      expect(JSON.parse(fs.readFileSync(fixture.paths.carousel, "utf8")).media).toHaveLength(8);
      expect(JSON.parse(fs.readFileSync(fixture.paths.stickerPack, "utf8")).media).toHaveLength(32);
      const repeatedPack = JSON.parse(fs.readFileSync(fixture.paths.repeatedPack, "utf8"));
      expect(repeatedPack.media).toHaveLength(40);
      expect(new Set(repeatedPack.media).size).toBe(10);
      expect(fs.statSync(fixture.paths.instagramCookies).size).toBe(667_395);

      for (const projectRoot of [
        fixture.paths.registeredProject,
        path.join(fixture.paths.legacyRoot, "projects", "legacy-registered"),
      ]) {
        const productionManifest = JSON.parse(
          fs.readFileSync(path.join(projectRoot, "production.json"), "utf8"),
        );
        const productionRecord = JSON.parse(
          fs.readFileSync(path.join(projectRoot, "production", "records.jsonl"), "utf8").trim(),
        );
        expect(productionManifest.productions[0].id).toBe(productionRecord.id);
        expect(productionManifest.productions[0].sourceRevision).not.toBe(
          productionRecord.sourceRevision,
        );
        expect(fs.existsSync(path.join(projectRoot, productionManifest.productions[0].output))).toBe(true);
        expect(fs.existsSync(path.join(projectRoot, productionRecord.output))).toBe(true);

        const deliveryManifest = JSON.parse(
          fs.readFileSync(path.join(projectRoot, "delivery.json"), "utf8"),
        );
        const deliveryRecord = JSON.parse(
          fs.readFileSync(path.join(projectRoot, "delivery", "records.jsonl"), "utf8").trim(),
        );
        expect(deliveryManifest.attempts[0].id).toBe(deliveryRecord.id);
        expect(deliveryManifest.attempts[0].providerPublicationId).not.toBe(
          deliveryRecord.providerPublicationId,
        );

        for (const candidate of [
          "composition/offer.v2.html",
          "composition/offer-v2.html",
          "composition/offer.r2.html",
          "composition/offer-final.html",
          "composition/offer-final2.html",
          "composition/offer.v3.html",
        ]) {
          expect(fs.existsSync(path.join(projectRoot, candidate))).toBe(true);
        }
        expect(fs.statSync(path.join(projectRoot, "composition/offer.v3.html")).size).toBe(0);
      }

      const jobs = new Database(fixture.paths.jobsDb, { readonly: true });
      expect(jobs.query("SELECT status FROM jobs").get()).toEqual({ status: "pending" });
      jobs.close();
      expect(fs.statSync(`${fixture.paths.jobsDb}-wal`).size).toBeGreaterThan(0);
      expect(fs.lstatSync(fixture.paths.symlink).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(fixture.paths.fifo).isFIFO()).toBe(true);
      expect(fs.lstatSync(fixture.paths.socket).isSocket()).toBe(true);

      for (const relative of [
        "farm/ingestion/cursor.json",
        "farm/topics/index.json",
        "farm/workflows/daily.json",
        "farm/runs/run-1/canvas.json",
        "farm/studio/project-board.json",
        ".scratch",
        "scratch",
        "tmp-scripts",
        "web-videos",
        "media-library",
        "_research",
        "_fx-probe",
        "references",
        "research",
        "memory",
        "daemon",
      ]) {
        expect(fs.existsSync(path.join(fixture.paths.currentRoot, relative))).toBe(true);
      }
    } finally {
      fixture.cleanup();
    }
  });
});

function inventory(root: string): { entries: number; files: number; bytes: number } {
  let entries = 0;
  let files = 0;
  let bytes = 0;
  const walk = (directory: string): void => {
    for (const name of fs.readdirSync(directory).sort()) {
      const entry = path.join(directory, name);
      const stat = fs.lstatSync(entry);
      entries += 1;
      if (stat.isDirectory()) walk(entry);
      else if (stat.isFile()) {
        files += 1;
        bytes += stat.size;
      }
    }
  };
  walk(root);
  return { entries, files, bytes };
}
