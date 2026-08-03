import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  afterDomainCommit,
  closeDomainDb,
  openDomainDb,
  withImmediateTransaction,
} from "../../cli/lib/store/db.js";
import { finishRun, finishRunInTransaction, startRun } from "../../cli/lib/store/runs.js";
import { createSecretStore } from "../../cli/lib/store/secrets.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { getRunAggregate } from "../helpers/run-aggregate.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const KEY = Buffer.alloc(32, 9);
const FILE_SECRET = Buffer.from("materialized-secret-bytes");

let root: TmpRoot | null = null;

afterEach(() => {
  closeDomainDb();
  root?.cleanup();
  root = null;
});

function fixture() {
  root = makeTmpRoot("ralphy-secret-materialization");
  const workspace = createWorkspace({ slug: "secrets", name: "Secrets" });
  const dataRoot = path.join(root.dir, ".ralphy");
  const store = createSecretStore({
    dataRoot,
    keyProvider: {
      lookupKey: async () => KEY,
      createKey: async () => KEY,
    },
  });
  return { dataRoot, store, workspace };
}

describe("Run secret materialization cleanup", () => {
  test("cannot materialize after terminalization wins the database lane", async () => {
    const { dataRoot, store, workspace } = fixture();
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    await store.setSecretFile("provider/upload", FILE_SECRET);
    const secretsDir = path.join(dataRoot, "tmp", run.id, "secrets");
    const realMkdirSync = fs.mkdirSync;
    let terminalized = false;
    let deferredFinish: Promise<void> | null = null;
    openDomainDb().exec("PRAGMA busy_timeout = 0");
    const mkdirSpy = spyOn(fs, "mkdirSync").mockImplementation(
      ((target: fs.PathLike, options?: fs.MakeDirectoryOptions | number | null) => {
        if (!terminalized && path.resolve(String(target)) === secretsDir) {
          try {
            finishRun(run.id, { state: "failed" });
            terminalized = true;
          } catch {
            deferredFinish = Promise.resolve().then(() => {
              finishRun(run.id, { state: "failed" });
              terminalized = true;
            });
          }
        }
        return realMkdirSync(target, options as fs.MakeDirectoryOptions);
      }) as typeof fs.mkdirSync,
    );

    try {
      await store.materializeSecretFile("provider/upload", run.id).catch(() => undefined);
      await deferredFinish;
    } finally {
      mkdirSpy.mockRestore();
    }
    expect(terminalized).toBe(true);
    expect(getRunAggregate(run.id).state).toBe("failed");
    expect(fs.existsSync(secretsDir)).toBe(false);
  });

  test("rejects symlinks in every materialization path component", async () => {
    const { dataRoot, store, workspace } = fixture();
    await store.setSecretFile("provider/upload", FILE_SECRET);
    const tmpRoot = path.join(dataRoot, "tmp");

    const tmpRun = startRun({ workspaceId: workspace.id, kind: "tmp-link" });
    const externalTmp = path.join(root!.dir, "external-tmp");
    fs.mkdirSync(externalTmp);
    fs.symlinkSync(externalTmp, tmpRoot);
    await expect(
      store.materializeSecretFile("provider/upload", tmpRun.id),
    ).rejects.toMatchObject({ code: "E_SECRET_STORE" });
    expect(fs.readdirSync(externalTmp)).toEqual([]);
    fs.unlinkSync(tmpRoot);
    fs.mkdirSync(tmpRoot);

    const runLink = startRun({ workspaceId: workspace.id, kind: "run-link" });
    const externalRun = path.join(root!.dir, "external-run");
    fs.mkdirSync(externalRun);
    fs.symlinkSync(externalRun, path.join(tmpRoot, runLink.id));
    await expect(
      store.materializeSecretFile("provider/upload", runLink.id),
    ).rejects.toMatchObject({ code: "E_SECRET_STORE" });
    expect(fs.readdirSync(externalRun)).toEqual([]);

    const secretsLink = startRun({ workspaceId: workspace.id, kind: "secrets-link" });
    const secretsLinkRunDir = path.join(tmpRoot, secretsLink.id);
    const externalSecrets = path.join(root!.dir, "external-secrets");
    fs.mkdirSync(secretsLinkRunDir);
    fs.mkdirSync(externalSecrets);
    fs.symlinkSync(externalSecrets, path.join(secretsLinkRunDir, "secrets"));
    await expect(
      store.materializeSecretFile("provider/upload", secretsLink.id),
    ).rejects.toMatchObject({ code: "E_SECRET_STORE" });
    expect(fs.readdirSync(externalSecrets)).toEqual([]);

    const markerLink = startRun({ workspaceId: workspace.id, kind: "marker-link" });
    const markerDir = path.join(tmpRoot, markerLink.id, "secrets");
    const externalMarker = path.join(root!.dir, "external-marker");
    fs.mkdirSync(markerDir, { recursive: true });
    fs.writeFileSync(externalMarker, "marker sentinel");
    fs.symlinkSync(
      externalMarker,
      path.join(markerDir, ".ralphy-secret-materialization.json"),
    );
    await expect(
      store.materializeSecretFile("provider/upload", markerLink.id),
    ).rejects.toMatchObject({ code: "E_SECRET_STORE" });
    expect(fs.readFileSync(externalMarker, "utf8")).toBe("marker sentinel");

    const fileLink = startRun({ workspaceId: workspace.id, kind: "file-link" });
    const fileDir = path.join(tmpRoot, fileLink.id, "secrets");
    const externalFile = path.join(root!.dir, "external-file");
    const fileName = `${createHash("sha256")
      .update("provider/upload")
      .digest("hex")}.secret`;
    fs.mkdirSync(fileDir, { recursive: true });
    fs.writeFileSync(externalFile, "file sentinel");
    fs.symlinkSync(externalFile, path.join(fileDir, fileName));
    await expect(
      store.materializeSecretFile("provider/upload", fileLink.id),
    ).rejects.toMatchObject({ code: "E_SECRET_STORE" });
    expect(fs.readFileSync(externalFile, "utf8")).toBe("file sentinel");
  });

  test("cleanup never follows a symlinked Run directory", () => {
    const { dataRoot, store, workspace } = fixture();
    const run = startRun({ workspaceId: workspace.id, kind: "cleanup-link" });
    const storeId = openDomainDb()
      .query<{ storeId: string }, []>(
        "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
      )
      .get()!.storeId;
    const externalRun = path.join(root!.dir, "external-cleanup-run");
    const externalSecrets = path.join(externalRun, "secrets");
    fs.mkdirSync(externalSecrets, { recursive: true });
    fs.writeFileSync(
      path.join(externalSecrets, ".ralphy-secret-materialization.json"),
      JSON.stringify({ version: 1, storeId, runId: run.id }),
    );
    fs.writeFileSync(path.join(externalSecrets, "evidence.bin"), "keep me");
    fs.mkdirSync(path.join(dataRoot, "tmp"), { recursive: true });
    fs.symlinkSync(externalRun, path.join(dataRoot, "tmp", run.id));
    openDomainDb()
      .prepare("UPDATE runs SET state = 'failed', ended_at = ? WHERE id = ?")
      .run(Date.now(), run.id);

    store.cleanup(run.id);

    expect(fs.readFileSync(path.join(externalSecrets, "evidence.bin"), "utf8")).toBe(
      "keep me",
    );
  });

  test("materializes mode-0600 files and removes them only after commit", async () => {
    const { dataRoot, store, workspace } = fixture();
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    await store.setSecretFile("provider/upload", FILE_SECRET);
    const locator = await store.materializeSecretFile("provider/upload", run.id);
    const materialized = path.join(dataRoot, locator);

    expect(locator.startsWith(`tmp/${run.id}/secrets/`)).toBe(true);
    expect(fs.readFileSync(materialized)).toEqual(FILE_SECRET);
    expect(fs.statSync(path.dirname(materialized)).mode & 0o777).toBe(0o700);
    expect(fs.statSync(materialized).mode & 0o777).toBe(0o600);

    expect(() =>
      withImmediateTransaction((db) => {
        finishRunInTransaction(db, run.id, { state: "failed" });
        throw new Error("force rollback");
      }),
    ).toThrow("force rollback");
    expect(getRunAggregate(run.id).state).toBe("pending");
    expect(fs.existsSync(materialized)).toBe(true);

    finishRun(run.id, { state: "failed" });
    expect(fs.existsSync(path.dirname(materialized))).toBe(false);
  });

  test("keeps a committed Run terminal when post-commit housekeeping fails", () => {
    const { workspace } = fixture();
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });

    expect(() =>
      withImmediateTransaction((db) => {
        finishRunInTransaction(db, run.id, { state: "failed" });
        afterDomainCommit(db, () => {
          throw new Error("private cleanup failure");
        });
      }),
    ).not.toThrow();
    expect(getRunAggregate(run.id).state).toBe("failed");
  });

  test("startup cleanup removes terminal and missing marked Runs only", async () => {
    const { dataRoot, store, workspace } = fixture();
    await store.setSecretFile("provider/upload", FILE_SECRET);
    const running = startRun({ workspaceId: workspace.id, kind: "running" });
    const terminal = startRun({ workspaceId: workspace.id, kind: "terminal" });
    const missing = startRun({ workspaceId: workspace.id, kind: "missing" });
    const runningPath = path.join(
      dataRoot,
      await store.materializeSecretFile("provider/upload", running.id),
    );
    const terminalPath = path.join(
      dataRoot,
      await store.materializeSecretFile("provider/upload", terminal.id),
    );
    const missingPath = path.join(
      dataRoot,
      await store.materializeSecretFile("provider/upload", missing.id),
    );
    const db = openDomainDb();
    db.prepare("UPDATE runs SET state = 'failed', ended_at = ? WHERE id = ?").run(
      Date.now(),
      terminal.id,
    );
    db.prepare("DELETE FROM runs WHERE id = ?").run(missing.id);
    const unmarked = path.join(dataRoot, "tmp", "ordinary", "secrets");
    fs.mkdirSync(unmarked, { recursive: true });
    fs.writeFileSync(path.join(unmarked, "evidence.bin"), "ordinary evidence");

    createSecretStore({
      dataRoot,
      keyProvider: {
        lookupKey: async () => KEY,
        createKey: async () => KEY,
      },
    });

    expect(fs.existsSync(runningPath)).toBe(true);
    expect(fs.existsSync(terminalPath)).toBe(false);
    expect(fs.existsSync(missingPath)).toBe(false);
    expect(fs.readFileSync(path.join(unmarked, "evidence.bin"), "utf8")).toBe(
      "ordinary evidence",
    );
  });

  test("keeps secret bytes out of SQLite, activity, Objects, RunObjects, and DTOs", async () => {
    const { dataRoot, store, workspace } = fixture();
    const run = startRun({ workspaceId: workspace.id, kind: "generation" });
    await store.set("provider/text", FILE_SECRET.toString("utf8"));
    await store.setSecretFile("provider/upload", FILE_SECRET);
    const locator = await store.materializeSecretFile("provider/upload", run.id);
    const db = openDomainDb();

    expect(fs.readFileSync(path.join(dataRoot, "ralphy.db")).includes(FILE_SECRET)).toBe(
      false,
    );
    expect(JSON.stringify(db.query("SELECT * FROM activity_events").all())).not.toContain(
      FILE_SECRET.toString("utf8"),
    );
    expect(db.query("SELECT COUNT(*) AS count FROM objects").get()).toEqual({ count: 0 });
    expect(db.query("SELECT COUNT(*) AS count FROM run_objects").get()).toEqual({
      count: 0,
    });
    expect(JSON.stringify(getRunAggregate(run.id))).not.toContain(
      FILE_SECRET.toString("utf8"),
    );
    expect(JSON.stringify(getRunAggregate(run.id))).not.toContain(locator);
  });
});
