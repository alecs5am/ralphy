import { afterEach, describe, expect, test } from "bun:test";
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
