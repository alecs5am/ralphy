import { afterEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stageInventoryObjects } from "../../cli/lib/migration/staging.js";
import type { MigrationContext } from "../../cli/lib/migration/types.js";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import { newDomainId } from "../../cli/lib/store/ids.js";
import { prepareObject } from "../../cli/lib/store/internal-objects.js";
import { setRoot } from "../../cli/lib/paths.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("migration Object staging", () => {
  test("required cloning has no ordinary-copy fallback and ignores the ambient store", async () => {
    const fixture = setup("required-clone");
    const source = path.join(fixture.sourceRoot, "hero.bin");
    fs.writeFileSync(source, "immutable-source");
    const before = fileFacts(source);
    const modes: number[] = [];
    const failures = ["ENOTSUP", "EXDEV", "EIO"];
    let failure = 0;
    const copyFile = fs.promises.copyFile.bind(fs.promises);
    const copySpy = spyOn(fs.promises, "copyFile").mockImplementation(async (from, to, mode) => {
      modes.push(Number(mode));
      if (mode === (fs.constants.COPYFILE_FICLONE_FORCE | fs.constants.COPYFILE_EXCL)) {
        const error = new Error("forced clone unavailable") as NodeJS.ErrnoException;
        error.code = failures[failure++]!;
        throw error;
      }
      return copyFile(from, to, mode);
    });
    const unlinkSpy = spyOn(fs.promises, "unlink");
    try {
      for (const _code of failures) {
        await expect(prepareObject(fixture.db, fixture.storeRoot, {
          scope: { workspaceId: fixture.workspaceId },
          sourcePath: source,
          originalName: "hero.bin",
          mime: "application/octet-stream",
          storageClass: "durable",
          transfer: "copy",
          clonePolicy: "require",
        })).rejects.toThrow(/clone unavailable/i);
      }
    } finally {
      copySpy.mockRestore();
      unlinkSpy.mockRestore();
    }
    expect(modes).toEqual(failures.map(
      () => fs.constants.COPYFILE_FICLONE_FORCE | fs.constants.COPYFILE_EXCL,
    ));
    expect(unlinkSpy).not.toHaveBeenCalled();
    expect(fileFacts(source)).toEqual(before);
    expect(fs.existsSync(path.join(fixture.poisonRoot, ".ralphy", "buckets"))).toBe(false);
  });

  test("resumes promoted bytes with the persisted Object ID after the DB transaction aborts", async () => {
    const fixture = setup("resume");
    const sourcePath = "workspaces/acme/projects/demo/artifacts/images/hero.png";
    const source = fixture.writeSource(sourcePath, Buffer.from([1, 2, 3, 4]));
    const before = fileFacts(source);
    const entryId = fixture.addEntry({ sourcePath, disposition: "object", bytes: 4 });
    fixture.db.exec(`
      CREATE TRIGGER abort_staged_ledger
      BEFORE UPDATE OF state ON migration_entries
      WHEN NEW.state = 'staged'
      BEGIN SELECT RAISE(ABORT, 'injected ledger abort'); END;
    `);

    await expect(stageInventoryObjects(fixture.ctx)).rejects.toThrow(/ledger abort/i);
    const allocation = entry(fixture.ctx, entryId);
    const objectId = (JSON.parse(allocation.targetRefs) as string[]).find((id) => id.startsWith("obj_"));
    expect(objectId).toMatch(/^obj_/);
    expect(fixture.db.query("SELECT id FROM objects").all()).toEqual([]);
    const finalPath = path.join(fixture.storeRoot, allocation.targetPath!);
    expect(fs.existsSync(finalPath)).toBe(true);

    fixture.db.exec("DROP TRIGGER abort_staged_ledger");
    fs.writeFileSync(finalPath, "evil");
    await expect(stageInventoryObjects(fixture.ctx)).rejects.toThrow(/conflicts|digest/i);
    expect(fs.readFileSync(finalPath, "utf8")).toBe("evil");
    fs.writeFileSync(finalPath, Buffer.from([1, 2, 3, 4]));
    const summary = await stageInventoryObjects(fixture.ctx);
    expect(summary.staged).toBe(1);
    expect(fixture.db.query<{ id: string }, []>("SELECT id FROM objects").all()).toEqual([{ id: objectId! }]);
    expect(entry(fixture.ctx, entryId)).toMatchObject({ state: "verified", rawEvidenceObjectId: null });
    expect((await stageInventoryObjects(fixture.ctx)).staged).toBe(0);
    expect(fixture.db.query("SELECT id FROM objects").all()).toHaveLength(1);
    expect(fileFacts(source)).toEqual(before);
    expect(fs.existsSync(path.join(fixture.poisonRoot, ".ralphy", "buckets"))).toBe(false);
  });

  test("appends stable copy estimates and subtracts verified promoted bytes on resume", async () => {
    const fixture = setup("copy-estimate-replay");
    const sourcePath = "workspaces/acme/projects/demo/artifacts/images/hero.png";
    fixture.writeSource(sourcePath, Buffer.from([1, 2, 3, 4]));
    fixture.addEntry({ sourcePath, disposition: "object", bytes: 4 });
    fixture.db.exec(`
      CREATE TRIGGER abort_copy_ledger
      BEFORE UPDATE OF state ON migration_entries
      WHEN NEW.state = 'staged'
      BEGIN SELECT RAISE(ABORT, 'injected copy ledger abort'); END;
    `);

    await expect(stageInventoryObjects(fixture.ctx, {
      copyMode: "copy",
      freeBytes: 3 * 1024 ** 3,
    })).rejects.toThrow(/copy ledger abort/i);
    const first = copyEstimates(fixture.ctx);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ rawBytes: 4 });

    fixture.db.exec("DROP TRIGGER abort_copy_ledger");
    const resumed = await stageInventoryObjects(fixture.ctx, {
      copyMode: "copy",
      freeBytes: 2 * 1024 ** 3 + first[0]!.dbOverheadBytes,
    });
    expect(resumed.staged).toBe(1);
    const second = copyEstimates(fixture.ctx);
    expect(second).toHaveLength(2);
    expect(second).toContainEqual(first[0]!);
    expect(second.some((estimate) => estimate.rawBytes === 0)).toBe(true);

    await stageInventoryObjects(fixture.ctx, { copyMode: "copy", freeBytes: 3 * 1024 ** 3 });
    const completed = copyEstimates(fixture.ctx);
    expect(completed).toHaveLength(3);
    await stageInventoryObjects(fixture.ctx, { copyMode: "copy", freeBytes: 3 * 1024 ** 3 });
    expect(copyEstimates(fixture.ctx)).toEqual(completed);
  });

  test("registers raw evidence and decoded data URLs without storing base64 in SQLite", async () => {
    const fixture = setup("decoded");
    const sourcePath = "workspaces/acme/projects/demo/asset-manifest.json";
    const source = fixture.writeSource(sourcePath, JSON.stringify({
      preview: "data:text/plain;base64,aGVsbG8=",
    }));
    const entryId = fixture.addEntry({
      sourcePath,
      disposition: "domain",
      bytes: fs.statSync(source).size,
      targetPath: `migration-evidence/source/${"a".repeat(64)}.raw`,
      targetRefs: [fixture.projectId],
    });

    const summary = await stageInventoryObjects(fixture.ctx);
    expect(summary.staged).toBe(2);
    const row = entry(fixture.ctx, entryId);
    expect(row.state).toBe("imported");
    expect(row.rawEvidenceObjectId).toMatch(/^obj_/);
    const objects = fixture.db.query<{ id: string; sha256: string }, []>(
      "SELECT id, sha256 FROM objects ORDER BY id",
    ).all();
    expect(objects).toHaveLength(2);
    const decoded = objects.find((object) => object.id !== row.rawEvidenceObjectId)!;
    const decodedPath = fixture.db.query<{ bucket: string; key: string }, [string]>(
      "SELECT bucket, key FROM objects WHERE id = ?",
    ).get(decoded.id)!;
    expect(fs.readFileSync(path.join(fixture.storeRoot, decodedPath.bucket, decodedPath.key), "utf8")).toBe("hello");
    expect(JSON.stringify(fixture.db.query("SELECT * FROM migration_entries").all())).not.toContain("aGVsbG8=");
  });

  test("refuses poisoned decoded-temp and cache ancestors without writing outside the stage", async () => {
    const decodedFixture = setup("decoded-symlink");
    const controlPath = "workspaces/acme/projects/demo/asset-manifest.json";
    const control = decodedFixture.writeSource(controlPath, JSON.stringify({
      preview: "data:text/plain;base64,aGVsbG8=",
    }));
    const controlEntry = decodedFixture.addEntry({
      sourcePath: controlPath,
      disposition: "domain",
      bytes: fs.statSync(control).size,
      targetPath: `migration-evidence/source/${"a".repeat(64)}.raw`,
      targetRefs: [decodedFixture.projectId],
    });
    const decodedId = stableTestId(decodedFixture.ctx.runId, `${controlEntry}:data-url:0`);
    const outsideTmp = path.join(decodedFixture.poisonRoot, "outside-tmp");
    fs.mkdirSync(outsideTmp);
    fs.mkdirSync(path.join(decodedFixture.storeRoot, "tmp"), { recursive: true });
    fs.symlinkSync(outsideTmp, path.join(decodedFixture.storeRoot, "tmp", decodedId));

    await expect(stageInventoryObjects(decodedFixture.ctx)).rejects.toThrow(/symlink|unsafe/i);
    expect(fs.readdirSync(outsideTmp)).toEqual([]);

    const cacheFixture = setup("cache-symlink");
    const cachePath = "cache/library/catalog.bin";
    cacheFixture.writeSource(cachePath, "cache");
    cacheFixture.addEntry({ sourcePath: cachePath, disposition: "cache", bytes: 5 });
    const outsideCache = path.join(cacheFixture.poisonRoot, "outside-cache");
    fs.mkdirSync(outsideCache);
    fs.symlinkSync(outsideCache, path.join(cacheFixture.storeRoot, "cache"));

    await expect(stageInventoryObjects(cacheFixture.ctx)).rejects.toThrow(/symlink|unsafe/i);
    expect(fs.readdirSync(outsideCache)).toEqual([]);
  });

  test("stages exact malformed JSONL record bytes as a diagnostic RunObject", async () => {
    const fixture = setup("jsonl-diagnostic");
    const sourcePath = "workspaces/acme/projects/demo/logs/events.jsonl";
    const raw = Buffer.from('{"ok":1}\n{bad}\r\n{"ok":2}');
    const source = fixture.writeSource(sourcePath, raw);
    const entryId = fixture.addEntry({
      sourcePath,
      disposition: "domain",
      bytes: raw.length,
      targetPath: `migration-evidence/source/${"e".repeat(64)}.raw`,
      targetRefs: [fixture.projectId],
    });
    fixture.db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, migration_entry_id, code, severity, line_no, detail_json, created_at)
       VALUES (?, ?, NULL, 'MIGRATION_MALFORMED_JSONL', 'review', 2, ?, ?)`,
    ).run(
      newDomainId("miss"),
      fixture.ctx.runId,
      JSON.stringify({
        sourcePath,
        lineNo: 2,
        byteOffset: 9,
        byteLength: 7,
        delimiter: "crlf",
        sha256: "8f687c1546d88c3c605721655343e547efb6def71ef98faee4397ca71496b7dc",
        evidenceTargetPath: `migration-evidence/diagnostics/41cf6794ba4200b8/${"e".repeat(64)}-2.raw`,
      }),
      Date.now(),
    );

    const summary = await stageInventoryObjects(fixture.ctx);
    expect(summary.staged).toBe(2);
    expect(fixture.db.query("SELECT id FROM run_objects").all()).toHaveLength(1);
    const diagnostic = fixture.db.query<{ bucket: string; key: string }, []>(
      `SELECT object.bucket, object.key FROM objects object
       JOIN run_objects runObject ON runObject.object_id = object.id`,
    ).get()!;
    expect(fs.readFileSync(path.join(fixture.storeRoot, diagnostic.bucket, diagnostic.key))).toEqual(raw.subarray(9, 16));
    expect(fileFacts(source).bytes).toEqual(raw);
    expect((JSON.parse(entry(fixture.ctx, entryId).targetRefs) as string[]).some((id) => id.startsWith("robj_"))).toBe(true);
  });

  test("blocks copy mode before staging when free space is insufficient", async () => {
    const fixture = setup("space");
    const sourcePath = "workspaces/acme/projects/demo/artifacts/videos/clip.mp4";
    fixture.writeSource(sourcePath, "video");
    fixture.addEntry({ sourcePath, disposition: "object", bytes: 5 });
    const copySpy = spyOn(fs.promises, "copyFile");
    try {
      await expect(stageInventoryObjects(fixture.ctx, {
        copyMode: "copy",
        freeBytes: 1,
      })).rejects.toThrow(/insufficient free space/i);
      expect(copySpy).not.toHaveBeenCalled();
    } finally {
      copySpy.mockRestore();
    }
  });

  test("preflights decoded and database overhead before writing any staged byte", async () => {
    const fixture = setup("derived-space");
    const sourcePath = "workspaces/acme/projects/demo/asset-manifest.json";
    const source = fixture.writeSource(sourcePath, JSON.stringify({
      preview: "data:text/plain;base64,aGVsbG8=",
    }));
    const rawBytes = fs.statSync(source).size;
    fixture.addEntry({
      sourcePath,
      disposition: "domain",
      bytes: rawBytes,
      targetPath: `migration-evidence/source/${"f".repeat(64)}.raw`,
      targetRefs: [fixture.projectId],
    });
    const copySpy = spyOn(fs.promises, "copyFile");
    try {
      await expect(stageInventoryObjects(fixture.ctx, {
        copyMode: "copy",
        freeBytes: 2 * 1024 ** 3 + rawBytes,
      })).rejects.toThrow(/insufficient free space/i);
      expect(copySpy).not.toHaveBeenCalled();
    } finally {
      copySpy.mockRestore();
    }
    expect(fs.existsSync(path.join(fixture.storeRoot, "tmp"))).toBe(false);
    expect(fs.existsSync(path.join(fixture.storeRoot, "cache"))).toBe(false);
    const estimate = fixture.db.query<{ detail: string }, []>(
      "SELECT detail_json AS detail FROM migration_issues WHERE code = 'MIGRATION_COPY_SPACE_ESTIMATE'",
    ).get();
    expect(JSON.parse(estimate!.detail)).toMatchObject({ rawBytes, decodedBytes: 5 });
  });

  test("rejects a same-size divergent cache resume when inventory has no digest", async () => {
    const fixture = setup("cache-divergence");
    const sourcePath = "cache/library/catalog.bin";
    const source = fixture.writeSource(sourcePath, "cache");
    const before = fileFacts(source);
    const entryId = fixture.addEntry({ sourcePath, disposition: "cache", bytes: 5 });
    const locator = fixture.db.query<{ hash: string }, [string]>(
      "SELECT source_locator_hash AS hash FROM migration_entries WHERE id = ?",
    ).get(entryId)!.hash;
    const target = path.join(fixture.storeRoot, "cache", "migration", locator, "catalog.bin");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "evil!");

    await expect(stageInventoryObjects(fixture.ctx)).rejects.toThrow(/cache.*digest|conflict/i);
    expect(fs.readFileSync(target, "utf8")).toBe("evil!");
    expect(fileFacts(source)).toEqual(before);
  });

  test("does not clobber a cache target created during promotion", async () => {
    const fixture = setup("cache-race");
    const sourcePath = "cache/library/catalog.bin";
    const source = fixture.writeSource(sourcePath, "cache");
    const before = fileFacts(source);
    const entryId = fixture.addEntry({ sourcePath, disposition: "cache", bytes: 5 });
    const locator = fixture.db.query<{ hash: string }, [string]>(
      "SELECT source_locator_hash AS hash FROM migration_entries WHERE id = ?",
    ).get(entryId)!.hash;
    const target = path.join(fixture.storeRoot, "cache", "migration", locator, "catalog.bin");
    const copyFile = fs.promises.copyFile.bind(fs.promises);
    const copySpy = spyOn(fs.promises, "copyFile").mockImplementation(async (from, to, mode) => {
      await copyFile(from, to, mode);
      if (String(to).startsWith(`${target}.staged-`)) fs.writeFileSync(target, "racer");
    });
    try {
      await expect(stageInventoryObjects(fixture.ctx)).rejects.toThrow(/conflict/i);
    } finally {
      copySpy.mockRestore();
    }
    expect(fs.readFileSync(target, "utf8")).toBe("racer");
    expect(fileFacts(source)).toEqual(before);
  });

  test("keeps legacy work as RunObjects, clones reproducible cache, and never opens secrets", async () => {
    const fixture = setup("dispositions");
    const workPath = "workspaces/acme/projects/demo/tmp/frames/probe.png";
    const cachePath = "cache/library/catalog.bin";
    const systemPath = ".DS_Store";
    const secretPath = "tmp/ig-cookies.txt";
    const emptyPath = "workspaces/acme/projects/demo/BRIEF.md";
    fixture.writeSource(workPath, "frame");
    fixture.writeSource(cachePath, "cache");
    fixture.writeSource(systemPath, "system");
    const secret = fixture.writeSource(secretPath, "plaintext-secret");
    fixture.writeSource(emptyPath, "");
    const workId = fixture.addEntry({ sourcePath: workPath, disposition: "cache", bytes: 5 });
    const cacheId = fixture.addEntry({ sourcePath: cachePath, disposition: "cache", bytes: 5 });
    const systemId = fixture.addEntry({ sourcePath: systemPath, disposition: "system", bytes: 6 });
    const secretId = fixture.addEntry({ sourcePath: secretPath, disposition: "secret-recovery-only", bytes: 16 });
    const emptyId = fixture.addEntry({ sourcePath: emptyPath, disposition: "domain", bytes: 0, targetRefs: [fixture.projectId] });
    fs.chmodSync(secret, 0);

    const summary = await stageInventoryObjects(fixture.ctx);
    expect(summary.staged).toBe(1);
    expect(entry(fixture.ctx, workId).state).toBe("verified");
    expect(fixture.db.query("SELECT id FROM run_objects").all()).toHaveLength(1);
    const cache = entry(fixture.ctx, cacheId);
    expect(cache.state).toBe("excluded");
    expect(fs.readFileSync(path.join(fixture.storeRoot, cache.targetPath!), "utf8")).toBe("cache");
    expect(entry(fixture.ctx, systemId).state).toBe("excluded");
    expect(entry(fixture.ctx, secretId).state).toBe("inventoried");
    expect(entry(fixture.ctx, emptyId)).toMatchObject({
      state: "imported",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
  });
});

function setup(label: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ralphy-stage-${label}-`));
  const sourceRoot = path.join(root, "source", ".ralphy");
  const storeRoot = path.join(root, "stage", ".ralphy");
  const poisonRoot = path.join(root, "poison");
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(storeRoot, { recursive: true });
  fs.mkdirSync(path.join(poisonRoot, ".ralphy"), { recursive: true });
  const db = openDomainDbAt(storeRoot);
  const runId = newDomainId("mig");
  const sourceId = newDomainId("mentry");
  const workspaceId = newDomainId("ws");
  const projectId = newDomainId("prj");
  const now = Date.now();
  db.prepare(
    `INSERT INTO migration_runs
     (id, stage_root_rel, recovery_root_rel, phase, source_bytes, created_at, updated_at)
     VALUES (?, ?, ?, 'import', 0, ?, ?)`,
  ).run(runId, `.ralphy-staging/${runId}/.ralphy`, `.ralphy-recovery/${runId}/.ralphy`, now, now);
  const sourceStat = fs.statSync(sourceRoot);
  db.prepare(
    `INSERT INTO migration_sources
     (id, migration_run_id, source_kind, source_label, canonical_path_hash,
      source_device, source_inode, source_mode, inventory_digest, created_at)
     VALUES (?, ?, 'ralphy', 'source', ?, ?, ?, ?, ?, ?)`,
  ).run(sourceId, runId, "b".repeat(64), String(sourceStat.dev), String(sourceStat.ino), sourceStat.mode, "c".repeat(64), now);
  db.prepare(
    `INSERT INTO workspaces (id, slug, name, metadata_json, created_at, updated_at)
     VALUES (?, 'acme', 'Acme', ?, ?, ?)`,
  ).run(workspaceId, JSON.stringify({ migrationRunId: runId, migrationSourceLabel: "source" }), now, now);
  db.prepare(
    `INSERT INTO projects (id, workspace_id, slug, name, state, metadata_json, created_at, updated_at)
     VALUES (?, ?, 'demo', 'Demo', 'active', ?, ?, ?)`,
  ).run(projectId, workspaceId, JSON.stringify({ migrationRunId: runId, migrationSourceLabel: "source" }), now, now);
  const ctx: MigrationContext = {
    db,
    storeRoot,
    sourceRoots: [{
      id: "source",
      kind: "ralphy",
      path: sourceRoot,
      device: BigInt(sourceStat.dev),
      inode: BigInt(sourceStat.ino),
    }],
    runId,
  };
  setRoot(poisonRoot);
  cleanups.push(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    db,
    ctx,
    sourceRoot,
    storeRoot,
    poisonRoot,
    workspaceId,
    projectId,
    writeSource(relative: string, contents: string | Buffer) {
      const target = path.join(sourceRoot, ...relative.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
      return target;
    },
    addEntry(input: {
      sourcePath: string;
      disposition: string;
      bytes: number;
      targetPath?: string;
      targetRefs?: string[];
    }) {
      const target = path.join(sourceRoot, ...input.sourcePath.split("/"));
      const stat = fs.statSync(target);
      const id = newDomainId("mentry");
      db.prepare(
        `INSERT INTO migration_entries
         (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
          entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
          bytes, mtime_ms, target_path, target_refs_json, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'file', 'ralphy', ?, ?, ?, ?, ?, ?, ?, ?, 'inventoried', ?, ?)`,
      ).run(
        id,
        runId,
        sourceId,
        input.sourcePath,
        newDomainId("obj").replace(/[^0-9a-f]/gi, "").padEnd(64, "d").slice(0, 64),
        input.disposition,
        String(stat.dev),
        String(stat.ino),
        stat.mode,
        input.bytes,
        Math.trunc(stat.mtimeMs),
        input.targetPath ?? null,
        JSON.stringify([...(input.targetRefs ?? [])].sort()),
        now,
        now,
      );
      db.prepare("UPDATE migration_runs SET source_bytes = source_bytes + ? WHERE id = ?").run(input.bytes, runId);
      return id;
    },
  };
}

function entry(ctx: MigrationContext, id: string) {
  return ctx.db.query<{
    state: string;
    targetPath: string | null;
    targetRefs: string;
    rawEvidenceObjectId: string | null;
    sha256: string | null;
  }, [string]>(
    `SELECT state, target_path AS targetPath, target_refs_json AS targetRefs,
            raw_evidence_object_id AS rawEvidenceObjectId, sha256
     FROM migration_entries WHERE id = ?`,
  ).get(id)!;
}

function fileFacts(file: string) {
  const stat = fs.statSync(file);
  return { bytes: fs.readFileSync(file), mtimeMs: stat.mtimeMs, mode: stat.mode };
}

function copyEstimates(ctx: MigrationContext): Array<{
  rawBytes: number;
  decodedBytes: number;
  diagnosticBytes: number;
  dbOverheadBytes: number;
  requiredCopyBytes: number;
}> {
  return ctx.db.query<{ detail: string }, []>(
    `SELECT detail_json AS detail FROM migration_issues
     WHERE code = 'MIGRATION_COPY_SPACE_ESTIMATE' ORDER BY id`,
  ).all().map((row) => JSON.parse(row.detail));
}

function stableTestId(runId: string, key: string): string {
  const hex = new Bun.CryptoHasher("sha256").update(`${runId}\0${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = "8";
  const value = hex.join("");
  return `obj_${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
