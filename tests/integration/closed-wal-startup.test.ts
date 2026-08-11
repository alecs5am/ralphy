import { Database } from "bun:sqlite";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  resolveCommandContext,
  resolveDataRoot,
} from "../../cli/lib/context.js";
import { setRoot } from "../../cli/lib/paths.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
let root: TmpRoot | undefined;

afterEach(() => {
  closeDomainDb();
  root?.cleanup();
  root = undefined;
  setRoot(REPO);
});

describe("closed WAL startup", () => {
  test("resolves a schema-v6 WAL store after both sidecars are gone", () => {
    const fixture = createSchemaFixture("ralphy-closed-wal-context");
    const image = closeAsStandaloneWal(fixture);

    expect([image[18], image[19]]).toEqual([2, 2]);
    expect(fs.existsSync(`${fixture.databasePath}-wal`)).toBe(false);
    expect(fs.existsSync(`${fixture.databasePath}-shm`)).toBe(false);
    let directOpenError: unknown;
    let direct: Database | null = null;
    try {
      direct = new Database(fixture.databasePath, { readonly: true });
      direct.query("SELECT store_id FROM store_metadata").get();
    } catch (error) {
      directOpenError = error;
    } finally {
      direct?.close();
    }
    expect(directOpenError).toMatchObject({ code: "SQLITE_CANTOPEN" });

    expect(resolveDataRoot({ root: fixture.dataRoot })).toMatchObject({
      dataRoot: fs.realpathSync.native(fixture.dataRoot),
      storeId: fixture.storeId,
    });
    expect(
      resolveCommandContext({
        dataRoot: fixture.dataRoot,
        workspaceId: fixture.workspace.id,
      }),
    ).toEqual({ kind: "scope", workspaceId: fixture.workspace.id });
    expect(fs.existsSync(`${fixture.databasePath}-wal`)).toBe(false);
    expect(fs.existsSync(`${fixture.databasePath}-shm`)).toBe(false);
  });

  test("answers system.hello without rewriting a closed WAL database", () => {
    const fixture = createSchemaFixture("ralphy-closed-wal-hello");
    const before = closeAsStandaloneWal(fixture);

    const result = spawnSync(process.execPath, [
      path.join(REPO, "cli", "index.ts"),
      "bridge",
      "--stdio",
      "--root",
      fixture.dataRoot,
    ], {
      cwd: root!.dir,
      encoding: "utf8",
      input: '{"v":1,"id":"hello","method":"system.hello"}\n',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      id: "hello",
      ok: true,
      result: {
        storeId: fixture.storeId,
        startup: { state: "ready", migration: "complete" },
      },
    });
    expect(fs.readFileSync(fixture.databasePath)).toEqual(before);
  });

  test("keeps the ordinary read-only path for an active WAL store", () => {
    const fixture = createSchemaFixture("ralphy-active-wal-context");

    expect(fs.existsSync(`${fixture.databasePath}-wal`)).toBe(true);
    expect(fs.existsSync(`${fixture.databasePath}-shm`)).toBe(true);
    expect(resolveDataRoot({ root: fixture.dataRoot }).storeId).toBe(
      fixture.storeId,
    );
    expect(
      resolveCommandContext({
        dataRoot: fixture.dataRoot,
        workspaceId: fixture.workspace.id,
      }),
    ).toEqual({ kind: "scope", workspaceId: fixture.workspace.id });
  });

  test("does not ignore a committed WAL sidecar", () => {
    const fixture = createSchemaFixture("ralphy-wal-sidecar-context");
    fixture.db.query("PRAGMA wal_checkpoint(TRUNCATE)").get();
    const checkpointedMain = fs.readFileSync(fixture.databasePath);
    createWorkspace({ slug: "pending", name: "Pending" });
    const committedWal = fs.readFileSync(`${fixture.databasePath}-wal`);
    expect(committedWal.byteLength).toBeGreaterThan(32);
    closeDomainDb();
    fs.writeFileSync(fixture.databasePath, checkpointedMain);
    fs.writeFileSync(`${fixture.databasePath}-wal`, committedWal);
    fs.rmSync(`${fixture.databasePath}-shm`, { force: true });

    expectMigrationIncomplete(() =>
      resolveDataRoot({ root: fixture.dataRoot })
    );
  });

  test("does not snapshot while an SHM sidecar exists", () => {
    const fixture = createSchemaFixture("ralphy-shm-sidecar-context");
    closeAsStandaloneWal(fixture);
    fs.writeFileSync(`${fixture.databasePath}-shm`, "occupied");

    expectMigrationIncomplete(() =>
      resolveDataRoot({ root: fixture.dataRoot })
    );
  });

  test("treats a dangling WAL symlink as an existing sidecar", () => {
    const fixture = createSchemaFixture("ralphy-dangling-wal-context");
    closeAsStandaloneWal(fixture);
    const sidecar = `${fixture.databasePath}-wal`;
    fs.symlinkSync(path.join(root!.dir, "missing-wal-target"), sidecar);

    expect(fs.lstatSync(sidecar).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(sidecar)).toBe(false);
    expectMigrationIncomplete(() =>
      resolveDataRoot({ root: fixture.dataRoot })
    );
  });

  test("detects a sidecar created and removed during the snapshot read", () => {
    const fixture = createSchemaFixture("ralphy-transient-wal-context");
    closeAsStandaloneWal(fixture);
    const originalRead = fs.readFileSync.bind(fs);
    let mutated = false;
    const readSpy = spyOn(fs, "readFileSync").mockImplementation((
      (target: fs.PathOrFileDescriptor, ...args: unknown[]) => {
        if (!mutated && typeof target === "number") {
          mutated = true;
          const sidecar = `${fixture.databasePath}-wal`;
          fs.writeFileSync(sidecar, "transient");
          fs.rmSync(sidecar);
        }
        return Reflect.apply(originalRead, fs, [target, ...args]);
      }
    ) as typeof fs.readFileSync);
    try {
      expectMigrationIncomplete(() =>
        resolveDataRoot({ root: fixture.dataRoot })
      );
      expect(mutated).toBe(true);
    } finally {
      readSpy.mockRestore();
    }
  });

  test("does not normalize a mixed journal header", () => {
    const fixture = createSchemaFixture("ralphy-mixed-header-context");
    const image = closeAsStandaloneWal(fixture);
    image[18] = 1;
    fs.writeFileSync(fixture.databasePath, image);

    expectMigrationIncomplete(() =>
      resolveDataRoot({ root: fixture.dataRoot })
    );
  });

  test("rejects a closed WAL snapshot with an unrelated corrupt table", () => {
    const fixture = createSchemaFixture("ralphy-corrupt-wal-context");
    const pageSize = fixture.db
      .query<{ page_size: number }, []>("PRAGMA page_size")
      .get()?.page_size ?? 4096;
    const rootPage = fixture.db
      .query<{ rootPage: number }, []>(
        "SELECT rootpage AS rootPage FROM sqlite_schema WHERE name = 'migration_issues'",
      )
      .get()!.rootPage;
    closeAsStandaloneWal(fixture);
    const descriptor = fs.openSync(fixture.databasePath, "r+");
    try {
      fs.writeSync(
        descriptor,
        Buffer.from([0]),
        0,
        1,
        (rootPage - 1) * pageSize,
      );
    } finally {
      fs.closeSync(descriptor);
    }

    expectMigrationIncomplete(() =>
      resolveDataRoot({ root: fixture.dataRoot })
    );
  });

  test("does not admit a closed WAL store on schema 5", () => {
    const fixture = createSchemaFixture("ralphy-schema-five-context");
    fixture.db.exec(`
      DROP TABLE migration_entry_supplemental_refs;
      DELETE FROM schema_migrations WHERE version = 6;
      PRAGMA user_version = 5;
    `);
    expect(
      fixture.db.query<{ version: number }, []>(
        "SELECT MAX(version) AS version FROM schema_migrations",
      ).get()!.version,
    ).toBe(5);
    closeAsStandaloneWal(fixture);

    expectMigrationIncomplete(() =>
      resolveDataRoot({ root: fixture.dataRoot })
    );
  });

  test("does not admit a partially versioned closed WAL store", () => {
    const fixture = createSchemaFixture("ralphy-partial-schema-context");
    fixture.db.exec("PRAGMA user_version = 5");
    expect(
      fixture.db.query<{ version: number }, []>(
        "SELECT MAX(version) AS version FROM schema_migrations",
      ).get()!.version,
    ).toBe(6);
    closeAsStandaloneWal(fixture);

    expectMigrationIncomplete(() =>
      resolveDataRoot({ root: fixture.dataRoot })
    );
  });
});

type SchemaFixture = {
  dataRoot: string;
  databasePath: string;
  workspace: ReturnType<typeof createWorkspace>;
  storeId: string;
  db: Database;
};

function createSchemaFixture(prefix: string): SchemaFixture {
  root = makeTmpRoot(prefix);
  const dataRoot = path.join(root.dir, ".ralphy");
  const workspace = createWorkspace({ slug: "primary", name: "Primary" });
  const db = openDomainDb();
  const storeId = db
    .query<{ storeId: string }, []>(
      "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
    )
    .get()!.storeId;
  expect(
    db.query<{ version: number }, []>(
      "SELECT MAX(version) AS version FROM schema_migrations",
    ).get()!.version,
  ).toBe(6);
  return {
    dataRoot,
    databasePath: path.join(dataRoot, "ralphy.db"),
    workspace,
    storeId,
    db,
  };
}

function closeAsStandaloneWal(fixture: SchemaFixture): Buffer {
  fixture.db.query("PRAGMA wal_checkpoint(TRUNCATE)").get();
  closeDomainDb();
  fs.rmSync(`${fixture.databasePath}-wal`, { force: true });
  fs.rmSync(`${fixture.databasePath}-shm`, { force: true });
  return fs.readFileSync(fixture.databasePath);
}

function expectMigrationIncomplete(operation: () => unknown): void {
  let actual: unknown;
  try {
    operation();
  } catch (error) {
    actual = error;
  }
  expect(actual).toMatchObject({ code: "E_MIGRATION_INCOMPLETE" });
}
