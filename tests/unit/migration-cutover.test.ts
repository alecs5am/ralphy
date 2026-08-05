import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as cutoverJournal from "../../cli/lib/migration/cutover-journal.js";
import type { MigrationLock } from "../../cli/lib/migration/types.js";
import type {
  MigrationProcessIdentity,
  MigrationProcessIdentityInspection,
} from "../../cli/lib/migration/process-identity.js";
import { openDomainDbAt } from "../../cli/lib/store/db.js";
import { createBridgeMethods } from "../../cli/lib/bridge/methods.js";
import { getStoreIdentity } from "../../cli/lib/store/sessions.js";
import { completeMigrationSecretImport } from "../../cli/lib/migration/import.js";
import {
  acquireMaintenanceLock,
  createMigrationSourceRoot,
  inventoryLegacySource,
  releaseMaintenanceLock,
} from "../../cli/lib/migration/inventory.js";
import {
  importDesktopStateAndSecrets,
  importExecutionAndOperations,
  importProductionAndDelivery,
  importScopesAndDocuments,
} from "../../cli/lib/migration/import.js";
import { stageInventoryObjects } from "../../cli/lib/migration/staging.js";
import { freezeMigration, verifyMigration } from "../../cli/lib/migration/verify.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

type FaultPoint =
  | "journal-temp-create"
  | "journal-temp-write"
  | "journal-file-fsync"
  | "journal-rename"
  | "journal-parent-fsync"
  | "journal-publish-linked"
  | "source-rename"
  | "recovery-chmod"
  | "recovery-fsync"
  | "install-rename"
  | "restore-rename"
  | "restore-stage-fsync"
  | "installed-smoke"
  | "installed-moved"
  | "smoke-passed"
  | "cutover-lock-acquired"
  | "cutover-lock-before-release"
  | "lock-temp-create"
  | "lock-temp-write"
  | "lock-file-fsync"
  | "lock-publish"
  | "lock-parent-fsync"
  | "lock-publish-linked"
  | "reconcile-before-commit"
  | "reconcile-commit"
  | "reconcile-checkpoint"
  | "reconcile-reverify"
  | "reconcile-journal"
  | "rollback-first-rename"
  | "rollback-second-rename"
  | "rollback-new-moved"
  | "rollback-rolled-back"
  | "rollback-restore-rename";

type CompleteJournalApi = typeof cutoverJournal & {
  migrationCutoverPaths(sourcePath: string, runId: string): {
    stagePath: string;
    recoveryPath: string;
    rollbackPath: string;
    journalPath: string;
    authorizationPath: string;
    authorizationClaimPath: string;
    authorizationDonePath: string;
  };
  setCutoverJournalFaultForTesting(fault: ((point: FaultPoint) => void) | null): () => void;
  setCutoverJournalReadFaultForTesting(fault: (() => void) | null): () => void;
  setCutoverJournalFileReadObserverForTesting(observer: ((bytes: number) => void) | null): () => void;
  setCutoverJournalProcessInspectorForTesting(input: {
    currentPid(): number;
    inspect(pid: number): MigrationProcessIdentityInspection;
  }): () => void;
  assertStartupJournalReady(sourcePath: string): void;
  createVerifiedCutoverJournal(input: {
    runId: string;
    sourcePath: string;
    verificationId: string;
    verificationDir: string;
  }): cutoverJournal.CutoverJournal;
};

type AuthorizationApi = {
  desktopAuthorizationPaths(sourcePath: string, runId: string): {
    authorizationPath: string;
    claimPath: string;
    donePath: string;
  };
  inspectProcessIdentity(pid: number): MigrationProcessIdentityInspection;
  setDesktopAuthorizationProcessInspectorForTesting(input: {
    currentPid(): number;
    inspect(pid: number): MigrationProcessIdentityInspection;
  }): () => void;
  setDesktopAuthorizationFaultForTesting(fault: ((point:
    | "record-temp-create" | "record-write" | "record-file-fsync"
    | "record-publish" | "record-parent-fsync") => void) | null): () => void;
  writeDesktopHandoffAuthorization(input: {
    sourcePath: string;
    runId: string;
    lock: MigrationLock;
    stagedRoot: string;
    encryptedSourcePath: string;
    sourceEntryId: string;
    ref: string;
    helperProcess: { readonly pid: number };
  }): { path: string; claimPath: string; donePath: string; nonce: string };
  claimDesktopHandoffAuthorization(input: {
    sourcePath: string;
    runId: string;
    nonce: string;
    stagedRoot: string;
    encryptedSourcePath: string;
    sourceEntryId: string;
    ref: string;
    kind: "text" | "file";
  }): Promise<{ claimNonce: string }>;
  completeDesktopHandoffAuthorization(input: {
    sourcePath: string;
    runId: string;
    nonce: string;
    claimNonce: string;
  }): void;
  runDesktopSecretHandoff(input: {
    sourcePath: string;
    runId: string;
    lock: MigrationLock;
    stagedRoot: string;
    encryptedSourcePath: string;
    sourceEntryId: string;
    ref: string;
    kind: "text" | "file";
    desktopExecutable: string;
    timeoutMs: number;
    afterExecutableValidationForTesting?(): void;
    afterSpawnForTesting?(pid: number): void;
    afterRequestBytesReleasedForTesting?(bytes: Uint8Array): void;
  }): Promise<{ completed: true }>;
};

let root: TmpRoot | null = null;
let restoreFault: (() => void) | null = null;
let restoreInspector: (() => void) | null = null;
let restoreReadObserver: (() => void) | null = null;

afterEach(() => {
  restoreFault?.();
  restoreFault = null;
  restoreInspector?.();
  restoreInspector = null;
  restoreReadObserver?.();
  restoreReadObserver = null;
  root?.cleanup();
  root = null;
});

describe("cutover path and crash invariants", () => {
  test("derives every mutating path from the exact source and Run ID", async () => {
    const fixture = await generations("paths");
    const api = cutoverJournal as CompleteJournalApi;
    expect(typeof api.migrationCutoverPaths).toBe("function");
    expect(api.migrationCutoverPaths(fixture.source, fixture.runId)).toEqual({
      stagePath: fixture.stage,
      recoveryPath: fixture.recovery,
      rollbackPath: fixture.rollback,
      journalPath: fixture.journal,
      authorizationPath: path.join(fixture.parent, ".ralphy-migration-private", fixture.runId, "desktop-authorization.json"),
      authorizationClaimPath: path.join(fixture.parent, ".ralphy-migration-private", fixture.runId, "desktop-authorization.claim.json"),
      authorizationDonePath: path.join(fixture.parent, ".ralphy-migration-private", fixture.runId, "desktop-authorization.done.json"),
    });
  });

  test("does not publish a journal when exclusive temp creation fails", async () => {
    const fixture = await generations("journal-temp-create");
    const api = cutoverJournal as CompleteJournalApi;
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "journal-temp-create") throw new Error("injected:journal-temp-create");
    });
    expect(() => createPreparedJournal(api, fixture)).toThrow(/journal-temp-create/);
    expect(fs.existsSync(fixture.journal)).toBe(false);
  });

  for (const scenario of [
    { point: "journal-temp-write", published: false },
    { point: "journal-file-fsync", published: false },
    { point: "journal-rename", published: false },
    { point: "journal-parent-fsync", published: true },
  ] as const) {
    test(`initial journal creation is recoverable when ${scenario.point} fails`, async () => {
      const fixture = await generations(`initial-${scenario.point}`);
      const api = cutoverJournal as CompleteJournalApi;
      restoreFault = api.setCutoverJournalFaultForTesting((point) => {
        if (point === scenario.point) throw new Error(`injected:initial-${point}`);
      });
      expect(() => createPreparedJournal(api, fixture)).toThrow(/injected:initial/);
      expect(fs.existsSync(fixture.journal)).toBe(scenario.published);
      if (scenario.published) expect(api.readCutoverJournal(fixture.journal).state).toBe("prepared");
      expect(fs.readdirSync(fixture.parent).filter((name) => name.includes("journal.json.tmp"))).toEqual([]);
      assertGenerationState(fixture, { source: "legacy", stage: "sqlite" });
    });
  }

  test("supports a normal mode-0775 source parent while deriving and protecting every path", async () => {
    const fixture = await generations("parent-0775");
    const api = cutoverJournal as CompleteJournalApi;
    fs.chmodSync(fixture.parent, 0o775);
    const journal = createPreparedJournal(api, fixture);
    expect(journal.journalPath).toBe(fixture.journal);
    expect(fs.statSync(fixture.parent).mode & 0o777).toBe(0o775);
    expect(fs.statSync(fixture.journal).mode & 0o777).toBe(0o600);
    expect(() => (api.createVerifiedCutoverJournal as unknown as (input: Record<string, unknown>) => unknown)({
      runId: fixture.runId,
      sourcePath: fixture.source,
      verificationId: fixture.verificationId,
      verificationDir: fixture.verificationDir,
      stagePath: path.join(fixture.parent, "caller-stage"),
    })).toThrow(/caller|derived|field|option|path/i);
  });

  test("hashes large generation files through bounded stable descriptor reads", async () => {
    const fixture = await generations("streaming-tree-hash");
    const api = cutoverJournal as CompleteJournalApi;
    const reads: number[] = [];
    restoreReadObserver = api.setCutoverJournalFileReadObserverForTesting((bytes) => reads.push(bytes));
    const journal = createPreparedJournal(api, fixture);
    expect(journal.stageTreeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(Math.max(...reads)).toBeLessThanOrEqual(64 * 1024);
    expect(reads.filter((bytes) => bytes === 64 * 1024).length).toBeGreaterThanOrEqual(3);
    expect(reads.reduce((sum, bytes) => sum + bytes, 0)).toBeGreaterThan(200_000);
  });

  for (const scenario of [
    { point: "journal-temp-create", locations: { recovery: "legacy", stage: "sqlite" }, state: "prepared" },
    { point: "journal-temp-write", locations: { recovery: "legacy", stage: "sqlite" }, state: "prepared" },
    { point: "journal-file-fsync", locations: { recovery: "legacy", stage: "sqlite" }, state: "prepared" },
    { point: "journal-rename", locations: { recovery: "legacy", stage: "sqlite" }, state: "prepared" },
    { point: "journal-parent-fsync", locations: { recovery: "legacy", stage: "sqlite" }, state: "source-moved" },
    { point: "source-rename", locations: { source: "legacy", stage: "sqlite" }, state: "prepared" },
    { point: "recovery-chmod", locations: { recovery: "legacy", stage: "sqlite" }, state: "source-moved" },
    { point: "recovery-fsync", locations: { recovery: "legacy", stage: "sqlite" }, state: "source-moved" },
    { point: "install-rename", locations: { recovery: "legacy", stage: "sqlite" }, state: "recovery-durable" },
    { point: "installed-smoke", locations: { source: "legacy", stage: "sqlite" }, state: "rolled-back" },
    { point: "restore-rename", locations: { source: "sqlite", recovery: "legacy" }, state: "restore-failed" },
  ] as const) {
    test(`leaves the exact recoverable generations when ${scenario.point} fails`, async () => {
      const fixture = await generations(scenario.point);
      const api = cutoverJournal as CompleteJournalApi;
      const created = createPreparedJournal(api, fixture);
      let reached = false;
      restoreFault = api.setCutoverJournalFaultForTesting((actual) => {
        if (scenario.point === "restore-rename" && actual === "installed-smoke") {
          throw new Error("injected:installed-smoke-for-restore");
        }
        if (actual === scenario.point) {
          reached = true;
          throw new Error(`injected:${scenario.point}`);
        }
      });

      expect(() => api.executeCutover(created)).toThrow(/injected:/);
      expect(reached).toBe(true);
      assertGenerationState(fixture, scenario.locations);
      expect(api.readCutoverJournal(fixture.journal).state).toBe(scenario.state);
      expect(fs.statSync(fixture.journal).mode & 0o777).toBe(0o600);
      if (scenario.point === "journal-temp-create") {
        restoreFault?.();
        restoreFault = null;
        expect(api.rollbackCutover(fixture.journal).state).toBe("rolled-back");
        assertGenerationState(fixture, { source: "legacy", stage: "sqlite" });
      }
    });
  }

  test("normalizes a prepared journal after the source rename before running the untouched-source recovery gate", async () => {
    const fixture = await generations("prepared-source-moved-service-gate");
    const api = cutoverJournal as CompleteJournalApi;
    const created = createPreparedJournal(api, fixture);
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "journal-temp-create") throw new Error("injected:prepared-source-moved");
    });
    expect(() => api.executeCutover(created)).toThrow(/injected:prepared-source-moved/);
    restoreFault();
    restoreFault = null;
    let gateCalled = false;
    const installed = api.recoverCutover(fixture.journal, () => {
      gateCalled = true;
      throw new Error("untouched-source recovery gate must not run after source rename");
    });
    expect(gateCalled).toBe(false);
    expect(installed.state).toBe("installed");
  });

  test("never overwrites an existing initial journal or leaves a temp behind", async () => {
    const fixture = await generations("journal-create-no-overwrite");
    const api = cutoverJournal as CompleteJournalApi;
    createPreparedJournal(api, fixture);
    const before = fs.readFileSync(fixture.journal);
    const inode = String(fs.statSync(fixture.journal).ino);
    expect(() => createPreparedJournal(api, fixture)).toThrow(/exists|already|journal/i);
    expect(fs.readFileSync(fixture.journal)).toEqual(before);
    expect(String(fs.statSync(fixture.journal).ino)).toBe(inode);
    expect(fs.readdirSync(fixture.parent).filter((name) => name.includes("journal.json.tmp"))).toEqual([]);
  });

  test("initial journal publication never overwrites a final path created in its publish race", async () => {
    const fixture = await generations("journal-exclusive-publish-race");
    const api = cutoverJournal as CompleteJournalApi;
    let attackerInode = "";
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point !== "journal-rename") return;
      fs.writeFileSync(fixture.journal, "attacker-final\n", { mode: 0o600, flag: "wx" });
      attackerInode = String(fs.statSync(fixture.journal).ino);
    });
    expect(() => createPreparedJournal(api, fixture)).toThrow(/exists|publish|exclusive|journal/i);
    expect(fs.readFileSync(fixture.journal, "utf8")).toBe("attacker-final\n");
    expect(String(fs.statSync(fixture.journal).ino)).toBe(attackerInode);
  });

  test("recovers an exact journal final+temp hardlink pair after hard exit between link and unlink", async () => {
    const fixture = await generations("journal-linked-hard-exit");
    const api = cutoverJournal as CompleteJournalApi;
    const moduleUrl = pathToFileURL(path.resolve("cli/lib/migration/cutover-journal.ts")).href;
    const child = Bun.spawnSync([
      process.execPath,
      "--eval",
      `import { createVerifiedCutoverJournal, setCutoverJournalFaultForTesting } from ${JSON.stringify(moduleUrl)};
       setCutoverJournalFaultForTesting((point) => { if (point === "journal-publish-linked") process.exit(88); });
       createVerifiedCutoverJournal(${JSON.stringify({
         runId: fixture.runId, sourcePath: fixture.source, verificationId: fixture.verificationId,
         verificationDir: fixture.verificationDir,
       })});`,
    ], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test" }, stdout: "pipe", stderr: "pipe" });
    expect(child.exitCode).toBe(88);
    expect(fs.statSync(fixture.journal).nlink).toBe(2);
    expect(fs.readdirSync(fixture.parent).filter((name) => name.startsWith(`${path.basename(fixture.journal)}.tmp-`))).toHaveLength(1);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("prepared");
    expect(fs.statSync(fixture.journal).nlink).toBe(1);
    expect(fs.readdirSync(fixture.parent).filter((name) => name.startsWith(`${path.basename(fixture.journal)}.tmp-`))).toEqual([]);
  }, 30_000);

  for (const scenario of [
    { point: "installed-moved", state: "installed-moved", reconciled: false },
    { point: "smoke-passed", state: "smoke-passed", reconciled: false },
  ] as const) {
    test(`persists and exposes ${scenario.state} before later mutation`, async () => {
      const fixture = await generations(scenario.point);
      const api = cutoverJournal as CompleteJournalApi;
      const prepared = createPreparedJournal(api, fixture);
      const frozen = generationBytes(fixture.stage);
      restoreFault = api.setCutoverJournalFaultForTesting((point) => {
        if (point === scenario.point) throw new Error(`injected:${point}`);
      });
      expect(() => api.executeCutover(prepared)).toThrow(/injected:/);
      expect(api.readCutoverJournal(fixture.journal).state).toBe(scenario.state);
      assertGenerationState(fixture, { source: "sqlite", recovery: "legacy" });
      expect(generationBytes(fixture.source)).toEqual(frozen);
      expect(cutoverDbState(fixture.source, fixture.runId)).toEqual({
        phase: "ready", cutoverAt: null, cutoverActivityId: null, events: [],
      });
    });
  }

  test("read-only smoke failure restores the exact frozen generation bytes", async () => {
    const fixture = await generations("smoke-byte-rollback");
    const api = cutoverJournal as CompleteJournalApi;
    const frozen = generationBytes(fixture.stage);
    const prepared = createPreparedJournal(api, fixture);
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "installed-smoke") throw new Error("injected:installed-smoke");
    });
    expect(() => api.executeCutover(prepared)).toThrow(/installed-smoke/);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("rolled-back");
    expect(generationBytes(fixture.stage)).toEqual(frozen);
    expect(cutoverDbState(fixture.stage, fixture.runId)).toMatchObject({ phase: "ready", cutoverAt: null, events: [] });
  });

  test("recovers when the journal lags the installed rename by a temp-create transition fault", async () => {
    const fixture = await generations("journal-lag-install");
    const api = cutoverJournal as CompleteJournalApi;
    const prepared = createPreparedJournal(api, fixture);
    let writes = 0;
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "journal-temp-create" && ++writes === 3) throw new Error("injected:lag-install");
    });
    expect(() => api.executeCutover(prepared)).toThrow(/lag-install/);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("recovery-durable");
    assertGenerationState(fixture, { source: "sqlite", recovery: "legacy" });
    restoreFault(); restoreFault = null;
    expect(api.recoverCutover(fixture.journal).state).toBe("installed");
  });

  test("recovers when the journal lags the smoke-failure source-to-stage rename", async () => {
    const fixture = await generations("journal-lag-smoke-restore");
    const api = cutoverJournal as CompleteJournalApi;
    const prepared = createPreparedJournal(api, fixture);
    let writes = 0;
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "installed-smoke") throw new Error("injected:smoke");
      if (point === "journal-temp-write" && ++writes === 4) throw new Error("injected:lag-smoke-restore");
    });
    expect(() => api.executeCutover(prepared)).toThrow(/lag-smoke-restore/);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("installed-moved");
    assertGenerationState(fixture, { stage: "sqlite", recovery: "legacy" });
    restoreFault(); restoreFault = null;
    expect(api.recoverCutover(fixture.journal).state).toBe("rolled-back");
  });

  test("recovers when an installed rollback journal lags both successful renames", async () => {
    const fixture = await installedGenerations("journal-lag-installed-rollback");
    const api = cutoverJournal as CompleteJournalApi;
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "journal-file-fsync") throw new Error("injected:lag-installed-rollback");
    });
    expect(() => api.rollbackCutover(fixture.journal)).toThrow(/lag-installed-rollback/);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("installed");
    assertGenerationState(fixture, { source: "legacy", rollback: "sqlite" });
    restoreFault(); restoreFault = null;
    expect(api.recoverCutover(fixture.journal).state).toBe("rolled-back");
  });

  test("recovers when source-moved rollback journal lags original restoration", async () => {
    const fixture = await generations("journal-lag-source-rollback");
    const api = cutoverJournal as CompleteJournalApi;
    await leaveSourceMoved(api, fixture);
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "journal-rename") throw new Error("injected:lag-source-rollback");
    });
    expect(() => api.rollbackCutover(fixture.journal)).toThrow(/lag-source-rollback/);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("source-moved");
    assertGenerationState(fixture, { source: "legacy", stage: "sqlite" });
    restoreFault(); restoreFault = null;
    expect(api.recoverCutover(fixture.journal).state).toBe("rolled-back");
  });

  test("normalizes restore-failed when the sqlite generation already reached stage", async () => {
    const fixture = await generations("journal-lag-restore-failed-stage");
    const api = cutoverJournal as CompleteJournalApi;
    const prepared = createPreparedJournal(api, fixture);
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "installed-smoke") throw new Error("injected:smoke");
      if (point === "restore-stage-fsync") throw new Error("injected:restore-stage-fsync");
    });
    expect(() => api.executeCutover(prepared)).toThrow(/restore-stage-fsync/);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("restore-failed");
    assertGenerationState(fixture, { stage: "sqlite", recovery: "legacy" });
    restoreFault(); restoreFault = null;
    expect(api.recoverCutover(fixture.journal).state).toBe("rolled-back");
    assertGenerationState(fixture, { source: "legacy", stage: "sqlite" });
  });

  test("normalizes restore-new-moved when the legacy generation already reached source", async () => {
    const fixture = await generations("journal-lag-restore-new-final");
    const api = cutoverJournal as CompleteJournalApi;
    const prepared = createPreparedJournal(api, fixture);
    let writes = 0;
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "installed-smoke") throw new Error("injected:smoke");
      if (point === "journal-temp-write" && ++writes === 5) throw new Error("injected:restore-final-journal");
    });
    expect(() => api.executeCutover(prepared)).toThrow(/restore-final-journal/);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("restore-new-moved");
    assertGenerationState(fixture, { source: "legacy", stage: "sqlite" });
    restoreFault(); restoreFault = null;
    expect(api.recoverCutover(fixture.journal).state).toBe("rolled-back");
  });

  for (const startingState of ["installed-moved", "smoke-passed"] as const) {
    test(`normalizes rollback journal lag from ${startingState}`, async () => {
      const fixture = await generations(`journal-lag-rollback-${startingState}`);
      const api = cutoverJournal as CompleteJournalApi;
      const prepared = createPreparedJournal(api, fixture);
      restoreFault = api.setCutoverJournalFaultForTesting((point) => {
        if (point === startingState) throw new Error(`injected:${startingState}`);
      });
      expect(() => api.executeCutover(prepared)).toThrow(new RegExp(startingState));
      restoreFault(); restoreFault = null;
      expect(api.readCutoverJournal(fixture.journal).state).toBe(startingState);
      restoreFault = api.setCutoverJournalFaultForTesting((point) => {
        if (point === "journal-file-fsync") throw new Error(`injected:rollback-${startingState}`);
      });
      expect(() => api.rollbackCutover(fixture.journal)).toThrow(/injected:rollback/);
      expect(api.readCutoverJournal(fixture.journal).state).toBe(startingState);
      assertGenerationState(fixture, { source: "legacy", rollback: "sqlite" });
      restoreFault(); restoreFault = null;
      expect(api.recoverCutover(fixture.journal).state).toBe("rolled-back");
    });
  }

  test("failed smoke restoration is explicitly non-ready and recover restores without overwrite", async () => {
    const fixture = await generations("restore-failed-recover");
    const api = cutoverJournal as CompleteJournalApi;
    const frozen = generationBytes(fixture.stage);
    const prepared = createPreparedJournal(api, fixture);
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "installed-smoke") throw new Error("injected:smoke");
      if (point === "restore-rename") throw new Error("injected:restore");
    });
    expect(() => api.executeCutover(prepared)).toThrow(/injected:/);
    expect(api.readCutoverJournal(fixture.journal).state).toBe("restore-failed");
    assertGenerationState(fixture, { source: "sqlite", recovery: "legacy" });
    expect(generationBytes(fixture.source)).toEqual(frozen);
    expect(() => api.assertStartupJournalReady(fixture.source)).toThrow(/restore|interrupted|ready/i);
    restoreFault();
    restoreFault = null;
    expect(api.recoverCutover(fixture.journal).state).toBe("rolled-back");
    assertGenerationState(fixture, { source: "legacy", stage: "sqlite" });
    expect(generationBytes(fixture.stage)).toEqual(frozen);
  });

  test("rejects canonical envelope tampering and unsafe journal file identities", async () => {
    const fixture = await generations("journal-envelope");
    const api = cutoverJournal as CompleteJournalApi;
    createPreparedJournal(api, fixture);
    const original = fs.readFileSync(fixture.journal);
    const envelope = JSON.parse(original.toString("utf8")) as Record<string, unknown>;
    const verificationPath = path.join(fixture.verificationDir,
      `migration-${fixture.runId}.verification-${fixture.verificationId}.json`);
    const freezePath = path.join(fixture.verificationDir, `migration-${fixture.runId}.freeze.json`);
    const verificationBytes = fs.readFileSync(verificationPath);
    const freezeBytes = fs.readFileSync(freezePath);
    const verificationStat = fs.statSync(verificationPath);
    const freezeStat = fs.statSync(freezePath);
    const verification = JSON.parse(verificationBytes.toString("utf8")) as Record<string, unknown>;
    const freeze = JSON.parse(freezeBytes.toString("utf8")) as Record<string, unknown>;
    expect(envelope.sourceIdentities).toEqual([fixture.desktopSourceIdentity]);
    expect(envelope.verificationRecord).toEqual({
      path: verificationPath,
      directory: {
        pathHash: Bun.SHA256.hash(fixture.verificationDir, "hex"),
        device: String(fs.statSync(fixture.verificationDir).dev),
        inode: String(fs.statSync(fixture.verificationDir).ino),
        mode: fs.statSync(fixture.verificationDir).mode & 0o777,
        uid: fs.statSync(fixture.verificationDir).uid,
      },
      file: { device: String(verificationStat.dev), inode: String(verificationStat.ino), mode: 0o600,
        uid: verificationStat.uid, nlink: 1, bytes: verificationStat.size },
      sha256: createHash("sha256").update(verificationBytes).digest("hex"),
    });
    expect(envelope.freezeRecord).toEqual({
      path: freezePath,
      id: verification.freezeId,
      file: { device: String(freezeStat.dev), inode: String(freezeStat.ino), mode: 0o600,
        uid: freezeStat.uid, nlink: 1, bytes: freezeStat.size },
      sha256: createHash("sha256").update(freezeBytes).digest("hex"),
      database: freeze.database,
      wal: freeze.wal,
      shm: freeze.shm,
    });
    const exactKeys = [
      "id", "version", "runId", "verificationId", "verificationNonce", "freezeId", "nonce",
      "state", "transition", "sourcePath", "stagePath", "recoveryPath", "rollbackPath", "journalPath",
      "source", "stage", "sourceIdentities", "verificationRecord", "freezeRecord", "storeId",
      "databaseDigest", "contentDigest", "stageTreeDigest", "inventoryDigests", "coreVersion",
      "schemaVersion", "contractVersion", "consumers", "originalMode", "recoveryMode", "createdAt", "updatedAt",
    ].sort();
    expect(Object.keys(envelope).sort()).toEqual(exactKeys);
    for (const field of [
      "id", "version", "runId", "verificationId", "verificationNonce", "freezeId", "nonce", "state", "transition", "sourcePath", "stagePath",
      "recoveryPath", "rollbackPath", "journalPath", "source", "stage", "sourceIdentities",
      "verificationRecord", "freezeRecord", "storeId", "databaseDigest", "contentDigest", "inventoryDigests", "coreVersion",
      "stageTreeDigest", "schemaVersion", "contractVersion", "consumers", "originalMode", "recoveryMode", "createdAt", "updatedAt",
    ]) {
      const changed = structuredClone(envelope);
      changed[field] = field === "transition" ? 99 : `tampered-${field}`;
      fs.writeFileSync(fixture.journal, `${JSON.stringify(changed)}\n`, { mode: 0o600 });
      expect(() => api.readCutoverJournal(fixture.journal), field).toThrow(/journal/i);
    }
    for (const mutate of [
      (value: Record<string, unknown>) => { delete value.verificationRecord; },
      (value: Record<string, unknown>) => { value.extra = true; },
      (value: Record<string, unknown>) => { (value.stage as Record<string, unknown>).inode = "999"; },
      (value: Record<string, unknown>) => {
        ((value.sourceIdentities as Array<Record<string, unknown>>)[0]!).inode = "999";
      },
      (value: Record<string, unknown>) => { (value.verificationRecord as Record<string, unknown>).sha256 = "0".repeat(64); },
      (value: Record<string, unknown>) => {
        const freeze = value.freezeRecord as Record<string, unknown>;
        (freeze.database as Record<string, unknown>).sha256 = "1".repeat(64);
      },
      (value: Record<string, unknown>) => { (value.inventoryDigests as Record<string, unknown>).extra = "2".repeat(64); },
    ]) {
      const changed = structuredClone(envelope);
      mutate(changed);
      fs.writeFileSync(fixture.journal, `${JSON.stringify(changed)}\n`, { mode: 0o600 });
      expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/journal/i);
    }
    for (const mutate of [
      (value: Record<string, unknown>) => { ((value.sourceIdentities as Array<Record<string, unknown>>)[0]!).inode = "999"; },
      (value: Record<string, unknown>) => { ((value.sourceIdentities as Array<Record<string, unknown>>)[0]!).extra = true; },
      (value: Record<string, unknown>) => { ((value.verificationRecord as Record<string, any>).directory).mode = 0o777; },
      (value: Record<string, unknown>) => { ((value.verificationRecord as Record<string, any>).directory).extra = true; },
      (value: Record<string, unknown>) => { ((value.verificationRecord as Record<string, any>).file).inode = "999"; },
      (value: Record<string, unknown>) => { ((value.verificationRecord as Record<string, any>).file).extra = true; },
      (value: Record<string, unknown>) => { ((value.freezeRecord as Record<string, any>).file).inode = "999"; },
      (value: Record<string, unknown>) => { ((value.freezeRecord as Record<string, any>).file).extra = true; },
      (value: Record<string, unknown>) => { ((value.freezeRecord as Record<string, any>).database).sha256 = "3".repeat(64); },
      (value: Record<string, unknown>) => { ((value.freezeRecord as Record<string, any>).database).extra = true; },
      (value: Record<string, unknown>) => { (value.inventoryDigests as Record<string, unknown>).extra = "4".repeat(64); },
      (value: Record<string, unknown>) => {
        const digests = value.inventoryDigests as Record<string, unknown>;
        digests[Object.keys(digests)[0]!] = "5".repeat(64);
      },
    ]) {
      const changed = structuredClone(envelope);
      mutate(changed);
      const resealed = resealJournalEnvelope(changed);
      fs.writeFileSync(fixture.journal, `${JSON.stringify(resealed)}\n`, { mode: 0o600 });
      expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/journal|identity|binding|digest/i);
    }
    fs.writeFileSync(fixture.journal, JSON.stringify(envelope, null, 2), { mode: 0o600 });
    expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/canonical|journal/i);
    const reversed = Object.fromEntries(Object.entries(envelope).reverse());
    fs.writeFileSync(fixture.journal, `${JSON.stringify(reversed)}\n`, { mode: 0o600 });
    expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/canonical|journal/i);
    fs.writeFileSync(fixture.journal, `${original.toString("utf8")}trailing`, { mode: 0o600 });
    expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/canonical|journal/i);
    fs.writeFileSync(fixture.journal, original, { mode: 0o600 });
    fs.chmodSync(fixture.journal, 0o644);
    expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/0600|mode/i);
    fs.chmodSync(fixture.journal, 0o600);
    const hardlink = `${fixture.journal}.hardlink`;
    fs.linkSync(fixture.journal, hardlink);
    expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/link|identity/i);
    fs.unlinkSync(hardlink);
    const target = `${fixture.journal}.target`;
    fs.renameSync(fixture.journal, target);
    fs.symlinkSync(target, fixture.journal);
    expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/symlink|journal/i);
  });

  test("rejects a journal replacement between pinned read and revalidation", async () => {
    const fixture = await generations("journal-replacement");
    const api = cutoverJournal as CompleteJournalApi;
    createPreparedJournal(api, fixture);
    const replacement = `${fixture.journal}.replacement`;
    fs.copyFileSync(fixture.journal, replacement);
    fs.chmodSync(replacement, 0o600);
    restoreFault = api.setCutoverJournalReadFaultForTesting(() => {
      fs.renameSync(replacement, fixture.journal);
    });
    expect(() => api.readCutoverJournal(fixture.journal)).toThrow(/changed|identity|replacement/i);
  });

  for (const stale of ["verification", "freeze", "database"] as const) {
    test(`rejects stale or replaced ${stale} evidence before publishing a journal`, async () => {
      const fixture = await generations(`journal-stale-${stale}`);
      const api = cutoverJournal as CompleteJournalApi;
      if (stale === "database") {
        fs.appendFileSync(path.join(fixture.stage, "ralphy.db"), Buffer.from([0]));
      } else {
        const recordPath = stale === "verification"
          ? path.join(fixture.verificationDir, `migration-${fixture.runId}.verification-${fixture.verificationId}.json`)
          : path.join(fixture.verificationDir, `migration-${fixture.runId}.freeze.json`);
        const replacement = `${recordPath}.replacement`;
        const record = JSON.parse(fs.readFileSync(recordPath, "utf8")) as Record<string, unknown>;
        record[stale === "verification" ? "verifiedAt" : "frozenAt"] = 1;
        fs.writeFileSync(replacement, `${JSON.stringify(record)}\n`, { mode: 0o600 });
        fs.renameSync(replacement, recordPath);
      }
      expect(() => createPreparedJournal(api, fixture)).toThrow(/verification|freeze|database|digest|stale|changed/i);
      expect(fs.existsSync(fixture.journal)).toBe(false);
    });
  }

  test("recovery beside an absent live name blocks unknown lock owners and reclaims only full-identity PID reuse", async () => {
    const fixture = await generations("journal-lock-pid-reuse");
    const api = cutoverJournal as CompleteJournalApi;
    const prepared = createPreparedJournal(api, fixture);
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point === "recovery-chmod") throw new Error("injected:recovery-chmod");
    });
    expect(() => api.executeCutover(prepared)).toThrow(/recovery-chmod/);
    restoreFault();
    restoreFault = null;
    assertGenerationState(fixture, { recovery: "legacy", stage: "sqlite" });

    const current = identity(61_000, 1, 91);
    const reused = { ...current, startId: "test:1700000000:90" };
    const journalStat = fs.statSync(fixture.journal);
    const lockPath = path.join(fixture.parent, ".ralphy-migration.lock");
    fs.writeFileSync(lockPath, `${JSON.stringify({
      version: 1,
      kind: "cutover-journal-lock",
      runId: fixture.runId,
      nonce: "00000000-0000-4000-8000-000000000001",
      journalPath: fixture.journal,
      journalDevice: String(journalStat.dev),
      journalInode: String(journalStat.ino),
      processIdentity: reused,
      createdAt: Date.now(),
    })}\n`, { mode: 0o600, flag: "wx" });
    restoreInspector = api.setCutoverJournalProcessInspectorForTesting({
      currentPid: () => current.pid,
      inspect: () => present(reused),
    });
    expect(() => api.recoverCutover(fixture.journal)).toThrow(/lock|held|owner/i);
    assertGenerationState(fixture, { recovery: "legacy", stage: "sqlite" });
    restoreInspector();
    restoreInspector = api.setCutoverJournalProcessInspectorForTesting({
      currentPid: () => current.pid,
      inspect: () => ({ status: "unknown", reason: "injected" }),
    });
    expect(() => api.recoverCutover(fixture.journal)).toThrow(/lock|unknown|owner/i);
    assertGenerationState(fixture, { recovery: "legacy", stage: "sqlite" });
    restoreInspector();
    restoreInspector = api.setCutoverJournalProcessInspectorForTesting({
      currentPid: () => current.pid,
      inspect: (pid) => pid === current.pid ? present(current) : { status: "absent" },
    });
    expect(api.recoverCutover(fixture.journal).state).toBe("installed");
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  for (const owner of ["absent", "executable-drift"] as const) {
    test(`recovery reclaims a stale journal lock after ${owner}`, async () => {
      const fixture = await generations(`journal-lock-${owner}`);
      const api = cutoverJournal as CompleteJournalApi;
      await leaveSourceMoved(api, fixture);
      const current = identity(62_000, 1, 94);
      const stale = owner === "executable-drift"
        ? { ...current, executable: { ...current.executable, inode: "999999" } }
        : identity(63_000, 1, 95);
      writeCutoverLock(fixture, stale);
      restoreInspector = api.setCutoverJournalProcessInspectorForTesting({
        currentPid: () => current.pid,
        inspect: (pid) => pid === stale.pid
          ? owner === "absent" ? { status: "absent" } : present(current)
          : present(current),
      });
      expect(api.recoverCutover(fixture.journal).state).toBe("installed");
      expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(false);
    });
  }

  for (const unsafe of ["mode", "hardlink", "symlink"] as const) {
    test(`recovery rejects an unsafe ${unsafe} journal lock without mutating generations`, async () => {
      const fixture = await generations(`journal-lock-${unsafe}`);
      const api = cutoverJournal as CompleteJournalApi;
      await leaveSourceMoved(api, fixture);
      const stale = identity(64_000, 1, 96);
      const lockPath = writeCutoverLock(fixture, stale);
      if (unsafe === "mode") fs.chmodSync(lockPath, 0o644);
      if (unsafe === "hardlink") fs.linkSync(lockPath, `${lockPath}.hardlink`);
      if (unsafe === "symlink") {
        fs.renameSync(lockPath, `${lockPath}.target`);
        fs.symlinkSync(`${lockPath}.target`, lockPath);
      }
      restoreInspector = api.setCutoverJournalProcessInspectorForTesting({
        currentPid: () => 65_000,
        inspect: () => ({ status: "absent" }),
      });
      expect(() => api.recoverCutover(fixture.journal)).toThrow(/lock|mode|link|identity/i);
      assertGenerationState(fixture, { recovery: "legacy", stage: "sqlite" });
    });
  }

  test("recovery refuses journal replacement after binding its exact lock", async () => {
    const fixture = await generations("journal-lock-journal-replacement");
    const api = cutoverJournal as CompleteJournalApi;
    await leaveSourceMoved(api, fixture);
    const replacement = `${fixture.journal}.replacement`;
    fs.copyFileSync(fixture.journal, replacement);
    fs.chmodSync(replacement, 0o600);
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point !== "cutover-lock-acquired") return;
      fs.renameSync(replacement, fixture.journal);
    });
    expect(() => api.recoverCutover(fixture.journal)).toThrow(/journal|changed|identity/i);
    assertGenerationState(fixture, { recovery: "legacy", stage: "sqlite" });
  });

  test("recovery refuses a replacement live name after binding its exact lock", async () => {
    const fixture = await generations("journal-lock-live-replacement");
    const api = cutoverJournal as CompleteJournalApi;
    await leaveSourceMoved(api, fixture);
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point !== "cutover-lock-acquired") return;
      fs.mkdirSync(fixture.source);
      fs.writeFileSync(path.join(fixture.source, "generation.txt"), "attacker");
    });
    expect(() => api.recoverCutover(fixture.journal)).toThrow(/source|exists|identity|state/i);
    expect(fs.readFileSync(path.join(fixture.source, "generation.txt"), "utf8")).toBe("attacker");
    expect(fs.readFileSync(path.join(fixture.recovery, "generation.txt"), "utf8")).toBe("legacy");
    expect(fs.readFileSync(path.join(fixture.stage, "generation.txt"), "utf8")).toBe("sqlite");
  });

  test("release deletes only the unchanged owned journal lock", async () => {
    const fixture = await generations("journal-lock-release-replacement");
    const api = cutoverJournal as CompleteJournalApi;
    await leaveSourceMoved(api, fixture);
    const lockPath = path.join(fixture.parent, ".ralphy-migration.lock");
    restoreFault = api.setCutoverJournalFaultForTesting((point) => {
      if (point !== "cutover-lock-before-release") return;
      fs.renameSync(lockPath, `${lockPath}.owned`);
      fs.writeFileSync(lockPath, "replacement\n", { mode: 0o600, flag: "wx" });
    });
    expect(() => api.recoverCutover(fixture.journal)).toThrow(/lock|changed|owned|identity/i);
    expect(fs.readFileSync(lockPath, "utf8")).toBe("replacement\n");
  });

  test("hard exit during lock temp publication leaves no invalid final lock and recovery proceeds", async () => {
    const fixture = await generations("journal-lock-hard-exit");
    const api = cutoverJournal as CompleteJournalApi;
    createPreparedJournal(api, fixture);
    const moduleUrl = pathToFileURL(path.resolve("cli/lib/migration/cutover-journal.ts")).href;
    const child = Bun.spawnSync([
      process.execPath,
      "--eval",
      `import { executeCutover, setCutoverJournalFaultForTesting } from ${JSON.stringify(moduleUrl)};
       setCutoverJournalFaultForTesting((point) => { if (point === "lock-temp-write") process.exit(87); });
       executeCutover(${JSON.stringify(fixture.journal)});`,
    ], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test" }, stdout: "pipe", stderr: "pipe" });
    expect(child.exitCode).toBe(87);
    const lockPath = path.join(fixture.parent, ".ralphy-migration.lock");
    expect(fs.existsSync(lockPath)).toBe(false);
    assertGenerationState(fixture, { source: "legacy", stage: "sqlite" });
    expect(api.executeCutover(fixture.journal).state).toBe("installed");
    expect(fs.existsSync(lockPath)).toBe(false);
  }, 30_000);

  test("recovers an exact lock final+temp hardlink pair after hard exit between link and unlink", async () => {
    const fixture = await generations("journal-lock-linked-hard-exit");
    const api = cutoverJournal as CompleteJournalApi;
    createPreparedJournal(api, fixture);
    const moduleUrl = pathToFileURL(path.resolve("cli/lib/migration/cutover-journal.ts")).href;
    const child = Bun.spawnSync([
      process.execPath,
      "--eval",
      `import { executeCutover, setCutoverJournalFaultForTesting } from ${JSON.stringify(moduleUrl)};
       setCutoverJournalFaultForTesting((point) => { if (point === "lock-publish-linked") process.exit(89); });
       executeCutover(${JSON.stringify(fixture.journal)});`,
    ], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test" }, stdout: "pipe", stderr: "pipe" });
    expect(child.exitCode).toBe(89);
    const lockPath = path.join(fixture.parent, ".ralphy-migration.lock");
    expect(fs.statSync(lockPath).nlink).toBe(2);
    expect(fs.readdirSync(fixture.parent).filter((name) => name.startsWith(".ralphy-migration.lock.tmp-"))).toHaveLength(1);
    expect(api.executeCutover(fixture.journal).state).toBe("installed");
    expect(fs.existsSync(lockPath)).toBe(false);
    expect(fs.readdirSync(fixture.parent).filter((name) => name.startsWith(".ralphy-migration.lock.tmp-"))).toEqual([]);
  }, 30_000);

  test("rejects extra lock and process identity fields before owner reclaim", async () => {
    const fixture = await generations("journal-lock-exact-schema");
    const api = cutoverJournal as CompleteJournalApi;
    await leaveSourceMoved(api, fixture);
    const owner = identity(67_000, 1, 98);
    const lockPath = writeCutoverLock(fixture, owner);
    for (const nested of ["lock", "process", "executable"] as const) {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as Record<string, any>;
      if (nested === "lock") lock.extra = true;
      if (nested === "process") lock.processIdentity.extra = true;
      if (nested === "executable") lock.processIdentity.executable.extra = true;
      fs.writeFileSync(lockPath, `${JSON.stringify(lock)}\n`, { mode: 0o600 });
      restoreInspector = api.setCutoverJournalProcessInspectorForTesting({
        currentPid: () => 67_001,
        inspect: () => ({ status: "absent" }),
      });
      expect(() => api.recoverCutover(fixture.journal)).toThrow(/lock|identity|invalid/i);
      restoreInspector(); restoreInspector = null;
      writeCutoverLockContents(lockPath, fixture, owner);
    }
    assertGenerationState(fixture, { recovery: "legacy", stage: "sqlite" });
  });

  for (const ownerState of ["exact", "unknown", "absent", "pid-reused"] as const) {
    test(`rollback journal lock handles ${ownerState} owner without ambiguous mutation`, async () => {
      const fixture = await installedGenerations(`rollback-lock-${ownerState}`);
      const api = cutoverJournal as CompleteJournalApi;
      const installedBytes = generationBytes(fixture.source);
      const recoveryBytes = generationBytes(fixture.recovery);
      const current = identity(68_000, 1, 100);
      const owner = ownerState === "pid-reused" ? { ...current, startId: "test:1700000000:99" } : identity(69_000, 1, 101);
      const lockPath = writeCutoverLock(fixture, owner);
      restoreInspector = api.setCutoverJournalProcessInspectorForTesting({
        currentPid: () => current.pid,
        inspect: (pid) => {
          if (pid === current.pid) return present(current);
          if (ownerState === "unknown") return { status: "unknown", reason: "injected" };
          if (ownerState === "absent") return { status: "absent" };
          return present(ownerState === "pid-reused" ? current : owner);
        },
      });
      if (ownerState === "exact" || ownerState === "unknown") {
        expect(() => api.rollbackCutover(fixture.journal)).toThrow(/lock|owner|held|unknown/i);
        expect(generationBytes(fixture.source)).toEqual(installedBytes);
        expect(generationBytes(fixture.recovery)).toEqual(recoveryBytes);
        expect(fs.existsSync(lockPath)).toBe(true);
      } else {
        expect(api.rollbackCutover(fixture.journal).state).toBe("rolled-back");
        assertGenerationState(fixture, { source: "legacy", rollback: "sqlite" });
        expect(fs.existsSync(lockPath)).toBe(false);
      }
    });
  }

  test("rollback preserves v2, restores the original mode, and is idempotent", async () => {
    const fixture = await installedGenerations("rollback-success");
    const rolledBack = cutoverJournal.rollbackCutover(fixture.journal);
    expect(rolledBack.state).toBe("rolled-back");
    assertGenerationState(fixture, { source: "legacy", rollback: "sqlite" });
    expect(fs.statSync(fixture.source).mode & 0o777).toBe(fixture.originalMode);
    expect(cutoverJournal.rollbackCutover(fixture.journal).state).toBe("rolled-back");
  });

  test("installed smoke reads the real frozen store then reconciles exactly once", async () => {
    const fixture = await generations("installed-reconciliation");
    const api = cutoverJournal as CompleteJournalApi;
    const prepared = createPreparedJournal(api, fixture);
    const frozenBytes = generationBytes(fixture.stage);
    const installed = api.executeCutover(prepared) as cutoverJournal.CutoverJournal & {
      installedDatabaseDigest: string;
      installedContentDigest: string;
      cutoverAt: number;
      cutoverActivityId: number;
    };
    expect(installed.state).toBe("installed");
    expect(installed.installedDatabaseDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(installed.installedContentDigest).toMatch(/^[a-f0-9]{64}$/);
    const db = openDomainDbAt(fixture.source);
    try {
      expect(db.query<{ cutoverAt: number | null }, [string]>(
        "SELECT cutover_at AS cutoverAt FROM migration_runs WHERE id = ?",
      ).get(fixture.runId)?.cutoverAt).toEqual(expect.any(Number));
      const event = db.query<{ id: number; createdAt: number; payload: string }, [string]>(
        `SELECT id, created_at AS createdAt, payload_json AS payload FROM activity_events
         WHERE entity_type = 'migration_run' AND entity_id = ? AND action = 'cutover'`,
      ).get(fixture.runId);
      expect(event).toEqual({
        id: installed.cutoverActivityId,
        createdAt: installed.cutoverAt,
        payload: JSON.stringify({ journal: prepared.nonce }),
      });
    } finally {
      db.close();
    }
    expect(frozenBytes.databaseDigest).toBe(prepared.databaseDigest);
    const installedBytes = generationBytes(fixture.source);
    expect(installed.installedDatabaseDigest).toBe(installedBytes.databaseDigest);
    expect(installed.installedContentDigest).toBe(installedBytes.treeDigest);
    const replay = api.executeCutover(fixture.journal) as typeof installed;
    expect(replay.installedDatabaseDigest).toBe(installed.installedDatabaseDigest);
    expect(replay.installedContentDigest).toBe(installed.installedContentDigest);
    expect(replay.cutoverAt).toBe(installed.cutoverAt);
    expect(replay.cutoverActivityId).toBe(installed.cutoverActivityId);
    expect(generationBytes(fixture.source)).toEqual(installedBytes);
  });

  for (const point of [
    "reconcile-before-commit", "reconcile-commit", "reconcile-checkpoint", "reconcile-reverify", "reconcile-journal",
  ] as const) {
    test(`replays exactly one reconciliation after ${point} fails`, async () => {
      const fixture = await generations(point);
      const api = cutoverJournal as CompleteJournalApi;
      const prepared = createPreparedJournal(api, fixture);
      let reached = false;
      restoreFault = api.setCutoverJournalFaultForTesting((actual) => {
        if (actual === point) { reached = true; throw new Error(`injected:${point}`); }
      });
      expect(() => api.executeCutover(prepared)).toThrow(/injected:/);
      expect(reached).toBe(true);
      const interrupted = api.readCutoverJournal(fixture.journal) as cutoverJournal.CutoverJournal & {
        cutoverAt?: number; cutoverActivityId?: number;
      };
      expect(interrupted.state).toBe(point === "reconcile-journal" ? "installed" : "smoke-passed");
      assertGenerationState(fixture, { source: "sqlite", recovery: "legacy" });
      const beforeRecovery = cutoverDbState(fixture.source, fixture.runId);
      if (point === "reconcile-before-commit") {
        expect(beforeRecovery).toEqual({ phase: "ready", cutoverAt: null, cutoverActivityId: null, events: [] });
      } else {
        expect(beforeRecovery.phase).toBe("cutover");
        expect(beforeRecovery.cutoverAt).toBe(interrupted.cutoverAt);
        expect(beforeRecovery.events).toHaveLength(1);
        expect(beforeRecovery.events[0]).toMatchObject({
          id: beforeRecovery.cutoverActivityId,
          createdAt: beforeRecovery.cutoverAt,
          payload: JSON.stringify({ journal: prepared.nonce }),
        });
      }
      restoreFault();
      restoreFault = null;
      const installed = api.recoverCutover(fixture.journal) as cutoverJournal.CutoverJournal & {
        cutoverAt: number; cutoverActivityId: number; installedDatabaseDigest: string;
      };
      expect(installed.state).toBe("installed");
      const installedBytes = generationBytes(fixture.source);
      expect(installed.installedDatabaseDigest).toBe(installedBytes.databaseDigest);
      expect((installed as cutoverJournal.CutoverJournal & { installedContentDigest: string }).installedContentDigest)
        .toBe(installedBytes.treeDigest);
      const db = openDomainDbAt(fixture.source);
      try {
        const rows = db.query<{ id: number; createdAt: number; payload: string }, [string]>(
          `SELECT id, created_at AS createdAt, payload_json AS payload FROM activity_events
           WHERE entity_type = 'migration_run' AND entity_id = ? AND action = 'cutover' ORDER BY id`,
        ).all(fixture.runId);
        expect(rows).toEqual([{ id: installed.cutoverActivityId, createdAt: installed.cutoverAt,
          payload: JSON.stringify({ journal: prepared.nonce }) }]);
      } finally { db.close(); }
      const first = fs.readFileSync(fixture.journal);
      const generation = generationBytes(fixture.source);
      const replay = api.recoverCutover(fixture.journal);
      expect(replay.state).toBe("installed");
      expect(fs.readFileSync(fixture.journal)).toEqual(first);
      expect(generationBytes(fixture.source)).toEqual(generation);
    });
  }

  test("recovers a real hard exit after reconciliation COMMIT with WAL and stale lock", async () => {
    const fixture = await generations("reconcile-hard-exit");
    const api = cutoverJournal as CompleteJournalApi;
    createPreparedJournal(api, fixture);
    const moduleUrl = pathToFileURL(path.resolve("cli/lib/migration/cutover-journal.ts")).href;
    const child = Bun.spawnSync([
      process.execPath,
      "--eval",
      `import { executeCutover, setCutoverJournalFaultForTesting } from ${JSON.stringify(moduleUrl)};
       setCutoverJournalFaultForTesting((point) => { if (point === "reconcile-commit") process.exit(86); });
       executeCutover(${JSON.stringify(fixture.journal)});`,
    ], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: "test" }, stdout: "pipe", stderr: "pipe" });
    expect(child.exitCode).toBe(86);
    expect(fs.statSync(path.join(fixture.source, "ralphy.db-wal")).size).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(true);
    const installed = api.recoverCutover(fixture.journal) as cutoverJournal.CutoverJournal & {
      cutoverAt: number; cutoverActivityId: number;
    };
    expect(installed.state).toBe("installed");
    expect(cutoverDbState(fixture.source, fixture.runId)).toEqual({
      phase: "cutover",
      cutoverAt: installed.cutoverAt,
      cutoverActivityId: installed.cutoverActivityId,
      events: [{ id: installed.cutoverActivityId, createdAt: installed.cutoverAt,
        payload: JSON.stringify({ journal: installed.nonce }) }],
    });
    expect(fs.existsSync(path.join(fixture.parent, ".ralphy-migration.lock"))).toBe(false);
  }, 30_000);

  for (const scenario of [
    { point: "rollback-first-rename", locations: { source: "sqlite", recovery: "legacy" }, state: "installed" },
    { point: "rollback-second-rename", locations: { source: "sqlite", recovery: "legacy" }, state: "installed" },
    { point: "rollback-restore-rename", locations: { rollback: "sqlite", recovery: "legacy" }, state: "rollback-new-moved" },
  ] as const) {
    test(`rollback remains recoverable when ${scenario.point} fails`, async () => {
      const fixture = await installedGenerations(scenario.point);
      const api = cutoverJournal as CompleteJournalApi;
      let reached = false;
      restoreFault = api.setCutoverJournalFaultForTesting((actual) => {
        if (scenario.point === "rollback-restore-rename" && actual === "rollback-second-rename") {
          throw new Error("injected:rollback-second-for-restore");
        }
        if (actual === scenario.point) {
          reached = true;
          throw new Error(`injected:${scenario.point}`);
        }
      });
      expect(() => api.rollbackCutover(fixture.journal)).toThrow(/injected:/);
      expect(reached).toBe(true);
      assertGenerationState(fixture, scenario.locations);
      expect(api.readCutoverJournal(fixture.journal).state).toBe(scenario.state);
    });
  }

  for (const scenario of [
    { point: "rollback-new-moved", state: "rollback-new-moved" },
    { point: "rollback-rolled-back", state: "rolled-back" },
  ] as const) {
    test(`rollback journal checkpoint ${scenario.point} is deterministic`, async () => {
      const fixture = await installedGenerations(scenario.point);
      const api = cutoverJournal as CompleteJournalApi;
      restoreFault = api.setCutoverJournalFaultForTesting((point) => {
        if (point === scenario.point) throw new Error(`injected:${point}`);
      });
      expect(() => api.rollbackCutover(fixture.journal)).toThrow(/injected:/);
      expect(api.readCutoverJournal(fixture.journal).state).toBe(scenario.state);
      assertGenerationState(fixture, { source: "legacy", rollback: "sqlite" });
      restoreFault();
      restoreFault = null;
      expect(api.recoverCutover(fixture.journal).state).toBe("rolled-back");
      assertGenerationState(fixture, { source: "legacy", rollback: "sqlite" });
    });
  }
});

describe("Desktop safeStorage authorization", () => {
  test("derives owner-only value-free records and completes one exclusive claim", async () => {
    const fixture = authorizationFixture("single-use");
    fs.chmodSync(fixture.parent, 0o775);
    const api = await authorizationApi();
    installProcessInspector(api, fixture.identities, fixture.currentPid);
    const authorization = api.writeDesktopHandoffAuthorization(fixture.input);
    const expectedPaths = api.desktopAuthorizationPaths(fixture.input.sourcePath, fixture.input.runId);
    expect(authorization).toMatchObject({
      path: expectedPaths.authorizationPath,
      claimPath: expectedPaths.claimPath,
      donePath: expectedPaths.donePath,
    });
    expect(fs.statSync(authorization.path).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.dirname(authorization.path)).mode & 0o777).toBe(0o700);
    const raw = fs.readFileSync(authorization.path, "utf8");
    expect(raw).not.toContain("fixture-secret-value");
    expect(raw).not.toContain(fixture.input.encryptedSourcePath);
    expect(raw).toContain(fixture.encryptedPathHash);

    fixture.currentPid.value = fixture.bridge.pid;
    const claim = await api.claimDesktopHandoffAuthorization({
      sourcePath: fixture.input.sourcePath,
      runId: fixture.input.runId,
      nonce: authorization.nonce,
      stagedRoot: fixture.input.stagedRoot,
      encryptedSourcePath: fixture.input.encryptedSourcePath,
      sourceEntryId: fixture.input.sourceEntryId,
      ref: fixture.input.ref,
      kind: "text",
    });
    expect(fs.statSync(authorization.claimPath).mode & 0o777).toBe(0o600);
    expect(() => api.completeDesktopHandoffAuthorization({
      sourcePath: fixture.input.sourcePath,
      runId: fixture.input.runId,
      nonce: authorization.nonce,
      claimNonce: claim.claimNonce,
    })).toThrow(/ledger|entry|complete/i);
    const ledgerDb = openDomainDbAt(fixture.input.stagedRoot);
    try {
      completeMigrationSecretImport(ledgerDb, {
        runId: fixture.input.runId,
        sourceEntryId: fixture.input.sourceEntryId,
        refs: [fixture.input.ref],
        kind: "text",
        requiredSourceKind: "desktop",
      });
    } finally {
      ledgerDb.close();
    }
    api.completeDesktopHandoffAuthorization({
      sourcePath: fixture.input.sourcePath,
      runId: fixture.input.runId,
      nonce: authorization.nonce,
      claimNonce: claim.claimNonce,
    });
    expect(fs.statSync(authorization.donePath).mode & 0o777).toBe(0o600);
    await expect(api.claimDesktopHandoffAuthorization({
      sourcePath: fixture.input.sourcePath,
      runId: fixture.input.runId,
      nonce: authorization.nonce,
      stagedRoot: fixture.input.stagedRoot,
      encryptedSourcePath: fixture.input.encryptedSourcePath,
      sourceEntryId: fixture.input.sourceEntryId,
      ref: fixture.input.ref,
      kind: "text",
    })).rejects.toThrow(/claim|done|used|authorization/i);
  });

  test("rejects nonce, lock, process, store, envelope, source, and request drift", async () => {
    const changes: readonly ((fixture: AuthorizationFixture, authorization: { path: string; nonce: string }) => void)[] = [
      (_fixture, authorization) => { authorization.nonce = "wrong"; },
      (fixture) => { fixture.identities.set(fixture.controller.pid, present(identity(fixture.controller.pid, 1, 9))); },
      (fixture) => { fixture.identities.set(fixture.helper.pid, present(identity(fixture.helper.pid, 999, 3))); },
      (fixture) => { fixture.identities.set(fixture.bridge.pid, present(identity(fixture.bridge.pid, 999, 4))); },
      (fixture) => { fixture.lock.nonce = "replaced-lock"; rewriteLock(fixture.lock); },
      (fixture) => { fs.renameSync(fixture.input.stagedRoot, `${fixture.input.stagedRoot}-old`); fs.mkdirSync(fixture.input.stagedRoot); },
      (fixture) => { fs.appendFileSync(fixture.input.encryptedSourcePath, "replacement"); },
      (fixture) => {
        const original = `${fixture.input.encryptedSourcePath}.original`;
        fs.renameSync(fixture.input.encryptedSourcePath, original);
        fs.copyFileSync(original, fixture.input.encryptedSourcePath);
        fs.chmodSync(fixture.input.encryptedSourcePath, 0o600);
      },
      (fixture) => { mutateJson(fixture.authorizationPath, (value) => ({ ...value, version: 999 })); },
      (fixture) => { mutateJson(fixture.authorizationPath, (value) => ({ ...value, state: "done" })); },
      (fixture) => { mutateJson(fixture.authorizationPath, (value) => ({ ...value, stagedStoreId: "store_wrong" })); },
      (fixture) => { fixture.request.sourceEntryId = "mentry_wrong"; },
      (fixture) => { fixture.request.ref = "provider/anthropic/workspace/wrong/workspace/wrong"; },
      (fixture) => { fixture.request.ref = "provider/openrouter/workspace/ws_fixture/workspace/ws_fixture"; },
      (fixture) => { fixture.request.kind = "file"; },
    ];
    const api = await authorizationApi();
    for (const [index, change] of changes.entries()) {
      const fixture = authorizationFixture(`binding-${index}`);
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      const authorization = api.writeDesktopHandoffAuthorization(fixture.input);
      fixture.authorizationPath = authorization.path;
      fixture.currentPid.value = fixture.bridge.pid;
      const mutable = { path: authorization.path, nonce: authorization.nonce };
      change(fixture, mutable);
      await expect(api.claimDesktopHandoffAuthorization({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        nonce: mutable.nonce,
        stagedRoot: fixture.input.stagedRoot,
        encryptedSourcePath: fixture.input.encryptedSourcePath,
        ...fixture.request,
      })).rejects.toThrow(/authorization|identity|process|binding|nonce|lock|source|store|version|state/i);
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });

  test("rejects byte-identical encrypted-source substitution before authorization creation", async () => {
    const api = await authorizationApi();
    for (const location of ["same-root", "other-root"] as const) {
      const fixture = authorizationFixture(`source-substitute-${location}`);
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      const substituteRoot = location === "same-root"
        ? path.dirname(fixture.input.encryptedSourcePath)
        : path.join(fixture.parent, "unbound-desktop-root");
      fs.mkdirSync(substituteRoot, { recursive: true });
      const substitute = path.join(substituteRoot, "byte-identical.bin");
      fs.copyFileSync(fixture.input.encryptedSourcePath, substitute);
      fs.chmodSync(substitute, 0o600);
      fixture.input.encryptedSourcePath = substitute;

      expect(() => api.writeDesktopHandoffAuthorization(fixture.input))
        .toThrow(/source|entry|identity|path|binding/i);
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });

  test("fails closed for unknown inspection and reclaims only absent exact processes", async () => {
    const api = await authorizationApi();
    const fixture = authorizationFixture("unknown");
    installProcessInspector(api, fixture.identities, fixture.currentPid);
    const authorization = api.writeDesktopHandoffAuthorization(fixture.input);
    fixture.currentPid.value = fixture.bridge.pid;
    fixture.identities.set(fixture.helper.pid, { status: "unknown", reason: "permission denied" });
    await expect(api.claimDesktopHandoffAuthorization({
      sourcePath: fixture.input.sourcePath,
      runId: fixture.input.runId,
      nonce: authorization.nonce,
      stagedRoot: fixture.input.stagedRoot,
      encryptedSourcePath: fixture.input.encryptedSourcePath,
      ...fixture.request,
    })).rejects.toThrow(/unknown|process|authorization/i);

    restoreInspector?.();
    const dead = authorizationFixture("dead-reclaim");
    installProcessInspector(api, dead.identities, dead.currentPid);
    const first = api.writeDesktopHandoffAuthorization(dead.input);
    dead.identities.set(dead.controller.pid, { status: "absent" });
    dead.identities.set(dead.helper.pid, { status: "absent" });
    const replacementController = identity(44_000, 1, 8);
    dead.identities.set(replacementController.pid, present(replacementController));
    dead.currentPid.value = replacementController.pid;
    dead.lock = {
      ...dead.lock,
      nonce: "replacement-lock-nonce",
      previousNonce: dead.lock.nonce,
      processIdentity: replacementController,
      createdAt: dead.lock.createdAt + 1,
    };
    dead.input.lock = dead.lock;
    const replacementHelper = identity(45_000, replacementController.pid, 9);
    dead.identities.set(replacementHelper.pid, present(replacementHelper));
    dead.input.helperProcess = { pid: replacementHelper.pid };
    rewriteLock(dead.lock);
    const second = api.writeDesktopHandoffAuthorization(dead.input);
    expect(second.nonce).not.toBe(first.nonce);
  });

  test("rejects mode drift, symlinks, replacement races, and concurrent replay", async () => {
    const api = await authorizationApi();
    for (const kind of ["mode", "symlink", "hardlink", "parent-mode", "replacement", "concurrent"] as const) {
      const fixture = authorizationFixture(kind);
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      const authorization = api.writeDesktopHandoffAuthorization(fixture.input);
      fixture.currentPid.value = fixture.bridge.pid;
      const claim = () => api.claimDesktopHandoffAuthorization({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        nonce: authorization.nonce,
        stagedRoot: fixture.input.stagedRoot,
        encryptedSourcePath: fixture.input.encryptedSourcePath,
        ...fixture.request,
      });
      if (kind === "mode") {
        fs.chmodSync(authorization.path, 0o644);
        await expect(claim()).rejects.toThrow(/mode|authorization/i);
      } else if (kind === "symlink") {
        const real = `${authorization.path}.real`;
        fs.renameSync(authorization.path, real);
        fs.symlinkSync(real, authorization.path);
        await expect(claim()).rejects.toThrow(/symlink|authorization/i);
      } else if (kind === "hardlink") {
        fs.linkSync(authorization.path, `${authorization.path}.alias`);
        await expect(claim()).rejects.toThrow(/link|authorization|identity/i);
      } else if (kind === "parent-mode") {
        fs.chmodSync(path.dirname(authorization.path), 0o755);
        await expect(claim()).rejects.toThrow(/parent|mode|authorization/i);
      } else if (kind === "replacement") {
        const raw = fs.readFileSync(authorization.path);
        fs.unlinkSync(authorization.path);
        fs.writeFileSync(authorization.path, raw, { mode: 0o600 });
        await expect(claim()).rejects.toThrow(/replac|identity|authorization/i);
      } else {
        const results = await Promise.allSettled([claim(), claim()]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      }
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });

  test("never reclaims same-owner replacement claim or done records", async () => {
    const api = await authorizationApi();
    for (const target of ["claim", "done"] as const) {
      const fixture = authorizationFixture(`reclaim-replacement-${target}`);
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      const authorization = api.writeDesktopHandoffAuthorization(fixture.input);
      fixture.currentPid.value = fixture.bridge.pid;
      const claim = await api.claimDesktopHandoffAuthorization({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        nonce: authorization.nonce,
        stagedRoot: fixture.input.stagedRoot,
        encryptedSourcePath: fixture.input.encryptedSourcePath,
        ...fixture.request,
      });
      const db = openDomainDbAt(fixture.input.stagedRoot);
      try {
        completeMigrationSecretImport(db, {
          runId: fixture.input.runId,
          sourceEntryId: fixture.input.sourceEntryId,
          refs: [fixture.input.ref],
          kind: "text",
          requiredSourceKind: "desktop",
        });
      } finally {
        db.close();
      }
      api.completeDesktopHandoffAuthorization({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        nonce: authorization.nonce,
        claimNonce: claim.claimNonce,
      });
      const replacement = target === "claim" ? authorization.claimPath : authorization.donePath;
      const raw = fs.readFileSync(replacement);
      fs.unlinkSync(replacement);
      fs.writeFileSync(replacement, raw, { mode: 0o600 });
      const replacementInode = String(fs.lstatSync(replacement).ino);
      fixture.currentPid.value = fixture.controller.pid;
      expect(() => api.writeDesktopHandoffAuthorization(fixture.input)).toThrow(/replac|identity|authorization/i);
      expect(fs.existsSync(replacement)).toBe(true);
      expect(String(fs.lstatSync(replacement).ino)).toBe(replacementInode);
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });

  test("reclaims an incomplete claim only after the exact helper and bridge are gone or PID-reused", async () => {
    const api = await authorizationApi();
    for (const bridgeState of ["present", "unknown", "reused", "identity-drift"] as const) {
      const fixture = authorizationFixture(`reclaim-bridge-${bridgeState}`);
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      const authorization = api.writeDesktopHandoffAuthorization(fixture.input);
      fixture.currentPid.value = fixture.bridge.pid;
      await api.claimDesktopHandoffAuthorization({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        nonce: authorization.nonce,
        stagedRoot: fixture.input.stagedRoot,
        encryptedSourcePath: fixture.input.encryptedSourcePath,
        ...fixture.request,
      });
      fixture.identities.set(fixture.controller.pid, { status: "absent" });
      fixture.identities.set(fixture.helper.pid, { status: "absent" });
      if (bridgeState === "unknown") {
        fixture.identities.set(fixture.bridge.pid, { status: "unknown", reason: "permission denied" });
      } else if (bridgeState === "reused") {
        fixture.identities.set(fixture.bridge.pid, present(identity(fixture.bridge.pid, 1, 99)));
      } else if (bridgeState === "identity-drift") {
        fixture.identities.set(fixture.bridge.pid, present({
          ...fixture.bridge,
          executable: { ...fixture.bridge.executable, pathHash: "f".repeat(64) },
        }));
      }
      const controller = identity(48_000, 1, 70);
      const helper = identity(49_000, controller.pid, 71);
      fixture.identities.set(controller.pid, present(controller));
      fixture.identities.set(helper.pid, present(helper));
      fixture.currentPid.value = controller.pid;
      fixture.lock = {
        ...fixture.lock,
        nonce: `fresh-lock-${bridgeState}`,
        previousNonce: null,
        processIdentity: controller,
        createdAt: fixture.lock.createdAt + 10,
      };
      fixture.input.lock = fixture.lock;
      fixture.input.helperProcess = { pid: helper.pid };
      rewriteLock(fixture.lock);
      if (bridgeState === "reused" || bridgeState === "identity-drift") {
        expect(api.writeDesktopHandoffAuthorization(fixture.input).nonce).not.toBe(authorization.nonce);
      } else {
        expect(() => api.writeDesktopHandoffAuthorization(fixture.input)).toThrow(/owned|process|unknown|authorization/i);
        expect(fs.existsSync(authorization.claimPath)).toBe(true);
      }
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });

  test("terminal done records are reclaimable with same-timestamp current or fresh exact locks only after descendants exit", async () => {
    const api = await authorizationApi();
    for (const controllerState of ["current", "fresh"] as const) {
      const fixture = authorizationFixture(`terminal-reclaim-${controllerState}`);
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      const authorization = api.writeDesktopHandoffAuthorization(fixture.input);
      fixture.currentPid.value = fixture.bridge.pid;
      const claim = await api.claimDesktopHandoffAuthorization({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        nonce: authorization.nonce,
        stagedRoot: fixture.input.stagedRoot,
        encryptedSourcePath: fixture.input.encryptedSourcePath,
        ...fixture.request,
      });
      const db = openDomainDbAt(fixture.input.stagedRoot);
      try {
        completeMigrationSecretImport(db, {
          runId: fixture.input.runId,
          sourceEntryId: fixture.input.sourceEntryId,
          refs: [fixture.input.ref],
          kind: "text",
          requiredSourceKind: "desktop",
        });
      } finally {
        db.close();
      }
      api.completeDesktopHandoffAuthorization({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        nonce: authorization.nonce,
        claimNonce: claim.claimNonce,
      });
      retargetAuthorizationFixtureToSecondEntry(fixture);
      fixture.identities.set(fixture.helper.pid, { status: "absent" });
      fixture.identities.set(fixture.bridge.pid, { status: "absent" });
      const controller = controllerState === "current" ? fixture.controller : identity(50_000, 1, 80);
      if (controllerState === "fresh") {
        fixture.identities.set(fixture.controller.pid, { status: "absent" });
        fixture.identities.set(controller.pid, present(controller));
      }
      const helper = identity(51_000, controller.pid, 81);
      fixture.identities.set(helper.pid, present(helper));
      fixture.currentPid.value = controller.pid;
      fixture.lock = {
        ...fixture.lock,
        nonce: `terminal-fresh-${controllerState}`,
        previousNonce: null,
        processIdentity: controller,
        createdAt: fixture.lock.createdAt,
      };
      fixture.input.lock = fixture.lock;
      fixture.input.helperProcess = { pid: helper.pid };
      rewriteLock(fixture.lock);
      expect(api.writeDesktopHandoffAuthorization(fixture.input).nonce).not.toBe(authorization.nonce);
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });

  test("recovers unpublished and atomically published authorization records at every write fault", async () => {
    const api = await authorizationApi();
    for (const point of [
      "record-temp-create", "record-write", "record-file-fsync", "record-publish", "record-parent-fsync",
    ] as const) {
      const fixture = authorizationFixture(`record-fault-${point}`);
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      let reached = false;
      restoreFault = api.setDesktopAuthorizationFaultForTesting((actual) => {
        if (actual === point) {
          reached = true;
          throw new Error(`injected:${point}`);
        }
      });
      expect(() => api.writeDesktopHandoffAuthorization(fixture.input)).toThrow(/record creation|injected/i);
      expect(reached).toBe(true);
      restoreFault();
      restoreFault = null;
      if (fs.existsSync(api.desktopAuthorizationPaths(fixture.input.sourcePath, fixture.input.runId).authorizationPath)) {
        fixture.identities.set(fixture.controller.pid, { status: "absent" });
        fixture.identities.set(fixture.helper.pid, { status: "absent" });
        const controller = identity(46_000, 1, 60);
        const helper = identity(47_000, controller.pid, 61);
        fixture.identities.set(controller.pid, present(controller));
        fixture.identities.set(helper.pid, present(helper));
        fixture.currentPid.value = controller.pid;
        fixture.lock = {
          ...fixture.lock,
          nonce: `replacement-${point}`,
          previousNonce: fixture.lock.nonce,
          processIdentity: controller,
          createdAt: fixture.lock.createdAt + 1,
        };
        fixture.input.lock = fixture.lock;
        fixture.input.helperProcess = { pid: helper.pid };
        rewriteLock(fixture.lock);
      }
      const recovered = api.writeDesktopHandoffAuthorization(fixture.input);
      expect(fs.statSync(recovered.path).mode & 0o777).toBe(0o600);
      expect(fs.existsSync(`${recovered.path}.tmp`)).toBe(false);
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });

  test("production inspection returns the high-resolution executable-bound current identity", async () => {
    const api = await authorizationApi();
    const inspection = api.inspectProcessIdentity(process.pid);
    expect(inspection.status).toBe("present");
    if (inspection.status !== "present") throw new Error("current process identity unavailable");
    expect(inspection.identity).toMatchObject({
      pid: process.pid,
      parentPid: expect.any(Number),
      uid: typeof process.getuid === "function" ? process.getuid() : 0,
      startId: expect.stringMatching(/^(?:darwin:\d+:\d+|linux:\d+)$/u),
      executable: {
        pathHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        device: expect.any(String),
        inode: expect.any(String),
        mode: expect.any(Number),
        uid: expect.any(Number),
        nlink: expect.any(Number),
      },
    });
  });

  test("the controller rejects helper output, nonzero exit, signal, timeout, and executable substitution", async () => {
    const api = await authorizationApi();
    for (const scenario of [
      "stdout", "stderr", "nonzero", "signal", "timeout", "noop", "symlink", "executable-replacement",
      "observed-executable-mismatch", "flood", "descendant-noop",
    ] as const) {
      const fixture = authorizationFixture(`helper-${scenario}`);
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      const executable = path.join(fixture.parent, `desktop-${scenario}`);
      const descendantPidPath = path.join(fixture.parent, `desktop-${scenario}.child-pid`);
      const body = scenario === "stdout"
        ? "process.stdout.write('unexpected')"
        : scenario === "stderr"
          ? "process.stderr.write('unexpected')"
          : scenario === "nonzero"
            ? "process.exit(7)"
          : scenario === "signal"
              ? "process.kill(process.pid, 'SIGTERM')"
              : scenario === "timeout" || scenario === "symlink"
                ? "await Bun.sleep(5000)"
                : "";
      const executableSource = scenario === "timeout"
        ? "#!/bin/sh\n/bin/sleep 5\n"
        : scenario === "flood"
          ? "#!/bin/sh\nwhile :; do /usr/bin/yes flood; done\n"
          : scenario === "descendant-noop"
            ? `#!${process.execPath}\nimport fs from "node:fs";\nconst child = Bun.spawn(["/bin/sleep", "5"], { stdout: "ignore", stderr: "ignore" });\nfs.writeFileSync(${JSON.stringify(descendantPidPath)}, String(child.pid));\nprocess.exit(0);\n`
          : `#!/usr/bin/env bun\nawait Bun.stdin.text();\n${body};\n`;
      fs.writeFileSync(executable, executableSource, { mode: 0o700 });
      let selected = executable;
      if (scenario === "symlink") {
        selected = `${executable}.link`;
        fs.symlinkSync(executable, selected);
      }
      let released: Uint8Array | null = null;
      let spawned = false;
      let spawnedPid: number | null = null;
      await expect(api.runDesktopSecretHandoff({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        lock: fixture.lock,
        stagedRoot: fixture.input.stagedRoot,
        encryptedSourcePath: fixture.input.encryptedSourcePath,
        sourceEntryId: fixture.input.sourceEntryId,
        ref: fixture.input.ref,
        kind: "text",
        desktopExecutable: selected,
        timeoutMs: scenario === "descendant-noop" ? 2_000 : 50,
        afterExecutableValidationForTesting: scenario === "executable-replacement" ? () => {
          fs.renameSync(executable, `${executable}.original`);
          fs.writeFileSync(executable, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
        } : undefined,
        afterSpawnForTesting: (pid) => {
          spawned = true;
          spawnedPid = pid;
          fixture.identities.set(pid, present(scenario === "observed-executable-mismatch"
            ? identity(pid, fixture.controller.pid, 51)
            : identityForExecutable(pid, fixture.controller.pid, executable)));
        },
        afterRequestBytesReleasedForTesting: (bytes) => { released = Uint8Array.from(bytes); },
      })).rejects.toThrow(/output|exit|signal|timeout|executable|symlink|authorization|replac/i);
      if (scenario === "symlink" || scenario === "executable-replacement") {
        expect(spawned).toBe(false);
      } else if (scenario === "observed-executable-mismatch") {
        expect(spawned).toBe(true);
        expect(released).toBeNull();
      } else {
        expect(spawned).toBe(true);
        expect(released).not.toBeNull();
        expect([...released!].every((byte) => byte === 0)).toBe(true);
      }
      if (spawnedPid !== null) expect(processIsAbsent(spawnedPid)).toBe(true);
      if (scenario === "descendant-noop") {
        const descendantPid = Number(fs.readFileSync(descendantPidPath, "utf8").trim());
        expect(processIsAbsent(descendantPid)).toBe(true);
      }
      const db = openDomainDbAt(fixture.input.stagedRoot);
      try {
        expect(db.query<{ state: string }, [string]>(
          "SELECT state FROM migration_entries WHERE id = ?",
        ).get(fixture.input.sourceEntryId)?.state).toBe("inventoried");
      } finally {
        db.close();
      }
      expect(fs.existsSync(api.desktopAuthorizationPaths(
        fixture.input.sourcePath,
        fixture.input.runId,
      ).donePath)).toBe(false);
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });

  test("the controller accepts only helper to actual bridge completion and sends metadata only", async () => {
    const api = await authorizationApi();
    const fixture = authorizationFixture("helper-success");
    const controllerInspection = api.inspectProcessIdentity(process.pid);
    if (controllerInspection.status !== "present") throw new Error("current controller identity unavailable");
    fixture.lock = {
      ...fixture.lock,
      nonce: "production-controller-lock",
      processIdentity: controllerInspection.identity,
      createdAt: Date.now(),
    };
    fixture.input.lock = fixture.lock;
    rewriteLock(fixture.lock);

    const secret = fs.readFileSync(fixture.input.encryptedSourcePath, "utf8");
    const executable = await buildDesktopHelper(fixture, secret);
    let released: Uint8Array | null = null;
    let spawnedCommand: readonly string[] | null = null;
    const previousSentinel = process.env.RALPHY_AUTH_TEST_PROVIDER_SECRET;
    process.env.RALPHY_AUTH_TEST_PROVIDER_SECRET = "must-not-reach-helper";
    try {
      const result = await api.runDesktopSecretHandoff({
        sourcePath: fixture.input.sourcePath,
        runId: fixture.input.runId,
        lock: fixture.lock,
        stagedRoot: fixture.input.stagedRoot,
        encryptedSourcePath: fixture.input.encryptedSourcePath,
        sourceEntryId: fixture.input.sourceEntryId,
        ref: fixture.input.ref,
        kind: "text",
        desktopExecutable: executable,
        timeoutMs: 10_000,
        beforeSpawnForTesting: (command) => { spawnedCommand = [...command]; },
        afterRequestBytesReleasedForTesting: (bytes) => { released = Uint8Array.from(bytes); },
      });
      expect(result).toEqual({ completed: true });
    } finally {
      if (previousSentinel === undefined) delete process.env.RALPHY_AUTH_TEST_PROVIDER_SECRET;
      else process.env.RALPHY_AUTH_TEST_PROVIDER_SECRET = previousSentinel;
    }
    expect(spawnedCommand).toEqual([executable, "--migration-secret-handoff"]);
    expect(released).not.toBeNull();
    expect([...released!].every((byte) => byte === 0)).toBe(true);

    const paths = api.desktopAuthorizationPaths(fixture.input.sourcePath, fixture.input.runId);
    expect(fs.statSync(paths.donePath).mode & 0o777).toBe(0o600);
    for (const sidecar of [paths.authorizationPath, paths.claimPath, paths.donePath]) {
      const raw = fs.readFileSync(sidecar, "utf8");
      expect(raw).not.toContain(secret);
      expect(raw).not.toContain(fixture.input.encryptedSourcePath);
    }
    const db = openDomainDbAt(fixture.input.stagedRoot);
    try {
      expect(db.query<{ disposition: string; state: string }, [string]>(
        "SELECT disposition, state FROM migration_entries WHERE id = ?",
      ).get(fixture.input.sourceEntryId)).toEqual({ disposition: "secret-imported", state: "excluded" });
    } finally {
      db.close();
    }

    const { createSecretStore } = await import("../../cli/lib/store/secrets.js");
    expect(await createSecretStore({
      dataRoot: fixture.input.stagedRoot,
      keyProvider: {
        lookupKey: async () => Buffer.alloc(32, 19),
        createKey: async () => Buffer.alloc(32, 19),
      },
    }).read(fixture.input.ref)).toBe(secret);
  }, 30_000);

  test("a cleanly released lock can reclaim a failed helper authorization and retry", async () => {
    const api = await authorizationApi();
    const fixture = authorizationFixture("helper-retry");
    const controller = api.inspectProcessIdentity(process.pid);
    if (controller.status !== "present") throw new Error("current controller identity unavailable");
    fixture.lock = {
      ...fixture.lock,
      nonce: "first-production-lock",
      processIdentity: controller.identity,
      createdAt: Date.now(),
    };
    fixture.input.lock = fixture.lock;
    rewriteLock(fixture.lock);
    const noop = await buildNoopDesktopHelper(fixture);
    await expect(api.runDesktopSecretHandoff({
      sourcePath: fixture.input.sourcePath,
      runId: fixture.input.runId,
      lock: fixture.lock,
      stagedRoot: fixture.input.stagedRoot,
      encryptedSourcePath: fixture.input.encryptedSourcePath,
      sourceEntryId: fixture.input.sourceEntryId,
      ref: fixture.input.ref,
      kind: "text",
      desktopExecutable: noop,
      timeoutMs: 10_000,
    })).rejects.toThrow(/done|authorization|ledger/i);

    fixture.lock = {
      ...fixture.lock,
      nonce: "fresh-lock-after-clean-release",
      previousNonce: null,
      createdAt: fixture.lock.createdAt + 1,
    };
    fixture.input.lock = fixture.lock;
    rewriteLock(fixture.lock);
    const secret = fs.readFileSync(fixture.input.encryptedSourcePath, "utf8");
    const helper = await buildDesktopHelper(fixture, secret);
    await expect(api.runDesktopSecretHandoff({
      sourcePath: fixture.input.sourcePath,
      runId: fixture.input.runId,
      lock: fixture.lock,
      stagedRoot: fixture.input.stagedRoot,
      encryptedSourcePath: fixture.input.encryptedSourcePath,
      sourceEntryId: fixture.input.sourceEntryId,
      ref: fixture.input.ref,
      kind: "text",
      desktopExecutable: helper,
      timeoutMs: 10_000,
    })).resolves.toEqual({ completed: true });
  }, 30_000);

  test("the actual bridge zeroizes decoded file bytes after success and secret-store failure", async () => {
    const api = await authorizationApi();
    for (const outcome of ["success", "failure"] as const) {
      const fixture = authorizationFixture(`file-zero-${outcome}`, "file");
      installProcessInspector(api, fixture.identities, fixture.currentPid);
      const authorization = api.writeDesktopHandoffAuthorization(fixture.input);
      fixture.currentPid.value = fixture.bridge.pid;
      let released: Uint8Array | null = null;
      const method = createBridgeMethods({
        dataRoot: fixture.input.stagedRoot,
        keyProvider: outcome === "success" ? {
          lookupKey: async () => Buffer.alloc(32, 19),
          createKey: async () => Buffer.alloc(32, 19),
        } : {
          lookupKey: async () => null,
          createKey: async () => { throw new Error("injected secret-store failure"); },
        },
        afterMigrationSecretFileBytesReleasedForTesting: (bytes) => { released = Uint8Array.from(bytes); },
      }).get("migration.secret.import")!;
      const operation = method.handle({
        sourcePath: fixture.input.sourcePath,
        encryptedSourcePath: fixture.input.encryptedSourcePath,
        authorizationNonce: authorization.nonce,
        runId: fixture.input.runId,
        sourceEntryId: fixture.input.sourceEntryId,
        ref: fixture.input.ref,
        kind: "file",
        base64: Buffer.from("decoded-file-secret").toString("base64"),
      }, bridgeMethodContext());
      if (outcome === "success") await expect(operation).resolves.toMatchObject({ completed: true, kind: "file" });
      else await expect(operation).rejects.toThrow(/secret-store failure|unavailable/i);
      expect(released).not.toBeNull();
      expect([...released!].every((byte) => byte === 0)).toBe(true);
      restoreInspector?.();
      restoreInspector = null;
      root?.cleanup();
      root = null;
    }
  });
});

type GenerationFixture = Awaited<ReturnType<typeof generations>>;

async function generations(label: string): Promise<{
  parent: string;
  source: string;
  stage: string;
  recovery: string;
  rollback: string;
  journal: string;
  runId: string;
  originalMode: number;
  inode: Record<"legacy" | "sqlite", string>;
  verificationDir: string;
  verificationId: string;
  desktopSource: string;
  desktopSourceIdentity: {
    kind: string; label: string; pathHash: string; device: string; inode: string; mode: number; inventoryDigest: string;
  };
}> {
  root = makeTmpRoot(`ralphy-task8-cutover-${label}`);
  const parent = fs.realpathSync(root.dir);
  const runId = "mig_task8";
  const source = path.join(parent, ".ralphy");
  const stage = path.join(parent, ".ralphy-staging", runId, ".ralphy");
  const recovery = path.join(parent, `.ralphy-recovery-${runId}`);
  const rollback = path.join(parent, `.ralphy-rollback-new-${runId}`);
  const journal = path.join(parent, `.ralphy-migration-${runId}.journal.json`);
  fs.mkdirSync(source, { recursive: true, mode: 0o750 });
  fs.chmodSync(source, 0o750);
  const desktopSource = path.join(parent, "desktop-empty");
  fs.mkdirSync(desktopSource);
  fs.mkdirSync(stage, { recursive: true });
  fs.writeFileSync(path.join(source, "generation.txt"), "legacy");
  fs.writeFileSync(path.join(stage, "generation.txt"), "sqlite");
  fs.writeFileSync(path.join(stage, "large-generation.bin"), Buffer.alloc(200_000, 7));
  const db = openDomainDbAt(stage);
  const now = Date.now();
  db.prepare(
    `INSERT INTO migration_runs
     (id, stage_root_rel, recovery_root_rel, phase, frozen_at, created_at, updated_at)
     VALUES (?, ?, ?, 'audited', NULL, ?, ?)`,
  ).run(runId, `.ralphy-staging/${runId}/.ralphy`, `.ralphy-recovery-${runId}`, now, now);
  const sourceRoot = createMigrationSourceRoot({ id: "ralphy", kind: "ralphy", path: source });
  const desktopRoot = createMigrationSourceRoot({ id: "desktop", kind: "desktop", path: desktopSource });
  const lock = acquireMaintenanceLock({ sourcePath: source, runId });
  const context = { db, storeRoot: stage, sourceRoots: [sourceRoot, desktopRoot], runId };
  const verificationDir = path.join(parent, "verification");
  let verificationId: string;
  let desktopSourceIdentity!: {
    kind: string; label: string; pathHash: string; device: string; inode: string; mode: number; inventoryDigest: string;
  };
  try {
    await inventoryLegacySource(context);
    desktopSourceIdentity = db.query<{
      kind: string; label: string; pathHash: string; device: string; inode: string; mode: number; inventoryDigest: string;
    }, [string]>(
      `SELECT source_kind AS kind, source_label AS label, canonical_path_hash AS pathHash,
              source_device AS device, source_inode AS inode, source_mode AS mode,
              inventory_digest AS inventoryDigest
       FROM migration_sources WHERE migration_run_id = ? AND source_kind = 'desktop'`,
    ).get(runId)!;
    importScopesAndDocuments(context);
    await stageInventoryObjects(context);
    importExecutionAndOperations(context);
    await stageInventoryObjects(context);
    importProductionAndDelivery(context);
    await importDesktopStateAndSecrets(context);
    await stageInventoryObjects(context);
    await freezeMigration(context, { verificationDir });
    verificationId = verifyMigration({ storeRoot: stage, runId, verificationDir }).id;
  } finally {
    releaseMaintenanceLock(lock);
    try { db.close(); } catch { /* freeze closes the staged database */ }
  }
  return {
    parent, source, stage, recovery, rollback, journal, runId, originalMode: 0o750,
    verificationDir, verificationId, desktopSource, desktopSourceIdentity,
    inode: {
      legacy: String(fs.statSync(source).ino),
      sqlite: String(fs.statSync(stage).ino),
    },
  };
}

async function installedGenerations(label: string): Promise<GenerationFixture> {
  const fixture = await generations(label);
  const api = cutoverJournal as CompleteJournalApi;
  expect(api.executeCutover(createPreparedJournal(api, fixture)).state).toBe("installed");
  return fixture;
}

function createPreparedJournal(api: CompleteJournalApi, fixture: GenerationFixture): cutoverJournal.CutoverJournal {
  expect(typeof api.createVerifiedCutoverJournal).toBe("function");
  return api.createVerifiedCutoverJournal({
    runId: fixture.runId,
    sourcePath: fixture.source,
    verificationId: fixture.verificationId,
    verificationDir: fixture.verificationDir,
  });
}

async function leaveSourceMoved(api: CompleteJournalApi, fixture: GenerationFixture): Promise<void> {
  const prepared = createPreparedJournal(api, fixture);
  const restore = api.setCutoverJournalFaultForTesting((point) => {
    if (point === "recovery-chmod") throw new Error("injected:recovery-chmod");
  });
  try {
    expect(() => api.executeCutover(prepared)).toThrow(/recovery-chmod/);
  } finally { restore(); }
  expect(api.readCutoverJournal(fixture.journal).state).toBe("source-moved");
  assertGenerationState(fixture, { recovery: "legacy", stage: "sqlite" });
}

function writeCutoverLock(fixture: GenerationFixture, processIdentity: MigrationProcessIdentity): string {
  const lockPath = path.join(fixture.parent, ".ralphy-migration.lock");
  const value = cutoverLockValue(fixture, processIdentity);
  fs.writeFileSync(lockPath, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
  return lockPath;
}

function writeCutoverLockContents(
  lockPath: string,
  fixture: GenerationFixture,
  processIdentity: MigrationProcessIdentity,
): void {
  fs.writeFileSync(lockPath, `${JSON.stringify(cutoverLockValue(fixture, processIdentity))}\n`, { mode: 0o600 });
}

function cutoverLockValue(fixture: GenerationFixture, processIdentity: MigrationProcessIdentity): Record<string, unknown> {
  const journalStat = fs.statSync(fixture.journal);
  return {
    version: 1,
    kind: "cutover-journal-lock",
    runId: fixture.runId,
    nonce: `00000000-0000-4000-8000-${String(processIdentity.pid).padStart(12, "0")}`,
    journalPath: fixture.journal,
    journalDevice: String(journalStat.dev),
    journalInode: String(journalStat.ino),
    processIdentity,
    createdAt: Date.now(),
  };
}

function assertGenerationState(
  fixture: GenerationFixture,
  expected: Partial<Record<"source" | "stage" | "recovery" | "rollback", "legacy" | "sqlite">>,
): void {
  for (const location of ["source", "stage", "recovery", "rollback"] as const) {
    const absolute = fixture[location];
    const marker = expected[location];
    expect(fs.existsSync(absolute)).toBe(marker !== undefined);
    if (!marker) continue;
    expect(fs.readFileSync(path.join(absolute, "generation.txt"), "utf8")).toBe(marker);
    expect(String(fs.statSync(absolute).ino)).toBe(fixture.inode[marker]);
    expect(String(fs.statSync(absolute).dev)).toBe(String(fs.statSync(fixture.parent).dev));
  }
}

function generationBytes(rootPath: string): { databaseDigest: string; treeDigest: string } {
  const files: Array<{ relative: string; bytes: number; sha256: string }> = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(rootPath, absolute).split(path.sep).join("/");
      if (entry.isDirectory()) { visit(absolute); continue; }
      if (!entry.isFile()) continue;
      const bytes = fs.readFileSync(absolute);
      files.push({ relative, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  };
  visit(rootPath);
  return {
    databaseDigest: files.find((file) => file.relative === "ralphy.db")?.sha256 ?? "",
    treeDigest: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
  };
}

function resealJournalEnvelope(value: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...body } = value;
  return { id: createHash("sha256").update(JSON.stringify(body)).digest("hex"), ...body };
}

function cutoverDbState(storeRoot: string, runId: string): {
  phase: string;
  cutoverAt: number | null;
  cutoverActivityId: number | null;
  events: Array<{ id: number; createdAt: number; payload: string }>;
} {
  const databasePath = path.join(storeRoot, "ralphy.db");
  const walPath = `${databasePath}-wal`;
  const walHasFrames = fs.existsSync(walPath) && fs.statSync(walPath).size > 0;
  const image = walHasFrames ? null : fs.readFileSync(databasePath);
  if (image && image[18] === 2 && image[19] === 2) { image[18] = 1; image[19] = 1; }
  const db = walHasFrames
    ? new Database(databasePath, { readonly: true, strict: true })
    : Database.deserialize(image!, { readonly: true });
  try {
    const run = db.query<{ phase: string; cutoverAt: number | null; cutoverActivityId: number | null }, [string]>(
      `SELECT phase, cutover_at AS cutoverAt, cutover_activity_id AS cutoverActivityId
       FROM migration_runs WHERE id = ?`,
    ).get(runId)!;
    const events = db.query<{ id: number; createdAt: number; payload: string }, [string]>(
      `SELECT id, created_at AS createdAt, payload_json AS payload FROM activity_events
       WHERE entity_type = 'migration_run' AND entity_id = ? AND action = 'cutover' ORDER BY id`,
    ).all(runId);
    return { ...run, events };
  } finally { db.close(); }
}

type MutablePid = { value: number };
type AuthorizationFixture = ReturnType<typeof authorizationFixture>;

function authorizationFixture(label: string, kind: "text" | "file" = "text") {
  root = makeTmpRoot(`ralphy-task8-auth-${label}`);
  const parent = fs.realpathSync(root.dir);
  const sourcePath = path.join(parent, ".ralphy");
  const stagedRoot = path.join(parent, ".ralphy-staging", "mig_task8", ".ralphy");
  const encryptedSourcePath = path.join(parent, "desktop", "claude-api-key.bin");
  fs.mkdirSync(sourcePath, { recursive: true });
  fs.mkdirSync(stagedRoot, { recursive: true });
  fs.mkdirSync(path.dirname(encryptedSourcePath), { recursive: true });
  fs.writeFileSync(encryptedSourcePath, "fixture-encrypted-blob", { mode: 0o600 });
  const db = openDomainDbAt(stagedRoot);
  const stagedStoreId = getStoreIdentity(db).storeId;
  seedAuthorizationLedger(db, {
    runId: "mig_task8",
    sourcePath,
    encryptedSourcePath,
    sourceEntryId: "mentry_desktop",
    ref: "provider/anthropic/workspace/ws_fixture/workspace/ws_fixture",
    kind,
  });
  db.close();
  const controller = identity(41_000, 1, 2);
  const helper = identity(42_000, controller.pid, 3);
  const bridge = identity(43_000, helper.pid, 4);
  const identities = new Map<number, MigrationProcessIdentityInspection>([
    [controller.pid, present(controller)], [helper.pid, present(helper)], [bridge.pid, present(bridge)],
  ]);
  const currentPid: MutablePid = { value: controller.pid };
  const sourceStat = fs.statSync(sourcePath);
  const lock = {
    path: path.join(parent, ".ralphy-migration.lock"),
    runId: "mig_task8",
    nonce: "lock-nonce",
    previousNonce: null,
    sourcePath,
    sourceDevice: String(sourceStat.dev),
    sourceInode: String(sourceStat.ino),
    processIdentity: controller,
    createdAt: 1,
  } satisfies MigrationLock;
  rewriteLock(lock);
  const encryptedPathHash = Bun.SHA256.hash(encryptedSourcePath, "hex");
  return {
    parent, controller, helper, bridge, identities, currentPid, lock, stagedStoreId, encryptedPathHash,
    authorizationPath: "",
    request: {
      sourceEntryId: "mentry_desktop",
      ref: "provider/anthropic/workspace/ws_fixture/workspace/ws_fixture",
      kind: kind as "text" | "file",
    },
    input: {
      sourcePath,
      runId: lock.runId,
      lock,
      stagedRoot,
      encryptedSourcePath,
      sourceEntryId: "mentry_desktop",
      ref: "provider/anthropic/workspace/ws_fixture/workspace/ws_fixture",
      helperProcess: { pid: helper.pid },
    },
  };
}

function identity(pid: number, parentPid: number, microseconds: number): MigrationProcessIdentity {
  return {
    pid,
    parentPid,
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    startId: `test:1700000000:${microseconds}`,
    executable: {
      pathHash: Bun.SHA256.hash(`/fixture/executable/${pid}`, "hex"),
      device: "1",
      inode: String(pid),
      mode: 0o755,
      uid: typeof process.getuid === "function" ? process.getuid() : 0,
      nlink: 1,
    },
  };
}

function present(identity: MigrationProcessIdentity): MigrationProcessIdentityInspection {
  return { status: "present", identity };
}

function processIsAbsent(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

function bridgeMethodContext() {
  return {
    consumerSessions: new Set<string>(),
    activitySubscriptions: new Map<string, { sequence: number; ready: boolean }>(),
    helloComplete: true,
    markHello() {},
    setAuthority() {},
  };
}

function identityForExecutable(
  pid: number,
  parentPid: number,
  executablePath: string,
): MigrationProcessIdentity {
  const stat = fs.statSync(executablePath);
  return {
    ...identity(pid, parentPid, 50),
    executable: {
      pathHash: Bun.SHA256.hash(fs.realpathSync(executablePath), "hex"),
      device: String(stat.dev),
      inode: String(stat.ino),
      mode: stat.mode & 0o7777,
      uid: stat.uid,
      nlink: stat.nlink,
    },
  };
}

function installProcessInspector(
  api: AuthorizationApi,
  identities: Map<number, MigrationProcessIdentityInspection>,
  currentPid: MutablePid,
): void {
  restoreInspector = api.setDesktopAuthorizationProcessInspectorForTesting({
    currentPid: () => currentPid.value,
    inspect: (pid) => identities.get(pid) ?? { status: "absent" },
  });
}

function rewriteLock(lock: MigrationLock): void {
  fs.writeFileSync(lock.path, `${JSON.stringify(lock)}\n`, { mode: 0o600 });
  fs.chmodSync(lock.path, 0o600);
}

function seedAuthorizationLedger(db: ReturnType<typeof openDomainDbAt>, input: {
  runId: string;
  sourcePath: string;
  encryptedSourcePath: string;
  sourceEntryId: string;
  ref: string;
  kind: "text" | "file";
}): void {
  const now = Date.now();
  const sourceStat = fs.statSync(path.dirname(input.encryptedSourcePath));
  const fileStat = fs.statSync(input.encryptedSourcePath);
  const sourceId = "msrc_desktop";
  db.prepare(
    `INSERT INTO migration_runs (id, phase, created_at, updated_at)
     VALUES (?, 'relations', ?, ?)`,
  ).run(input.runId, now, now);
  db.prepare(
    `INSERT INTO migration_sources
     (id, migration_run_id, source_kind, source_label, canonical_path_hash,
      source_device, source_inode, source_mode, inventory_digest, created_at)
     VALUES (?, ?, 'desktop', 'desktop', ?, ?, ?, ?, ?, ?)`,
  ).run(
    sourceId,
    input.runId,
    Bun.SHA256.hash(path.dirname(input.encryptedSourcePath), "hex"),
    String(sourceStat.dev),
    String(sourceStat.ino),
    sourceStat.mode,
    Bun.SHA256.hash("fixture-inventory", "hex"),
    now,
  );
  db.prepare(
    `INSERT INTO migration_entries
     (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
      entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
      bytes, mtime_ms, target_refs_json, state, created_at, updated_at)
     VALUES (?, ?, ?, 'claude-api-key.bin', ?, 'file', 'desktop', 'secret-recovery-only',
       ?, ?, ?, ?, ?, ?, 'inventoried', ?, ?)`,
  ).run(
    input.sourceEntryId,
    input.runId,
    sourceId,
    Bun.SHA256.hash("claude-api-key.bin", "hex"),
    String(fileStat.dev),
    String(fileStat.ino),
    fileStat.mode,
    fileStat.size,
    Math.trunc(fileStat.mtimeMs),
    JSON.stringify([input.ref]),
    now,
    now,
  );
  db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_plan', ?, 'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED', 'info', ?, ?)`,
  ).run(input.runId, JSON.stringify({
    kind: input.kind,
    refs: [input.ref],
    sourceEntryId: input.sourceEntryId,
    sourceLocatorHash: Bun.SHA256.hash("claude-api-key.bin", "hex"),
  }), now);
  db.prepare(
    `INSERT INTO migration_issues
     (id, migration_run_id, code, severity, detail_json, created_at)
     VALUES ('miss_required', ?, 'MIGRATION_DESKTOP_SECRET_HANDOFF_REQUIRED', 'block', ?, ?)`,
  ).run(input.runId, JSON.stringify({
    sourceEntryId: input.sourceEntryId,
    sourceLocatorHash: Bun.SHA256.hash("claude-api-key.bin", "hex"),
  }), now);
  db.prepare(
    `INSERT INTO workspaces (id, slug, name, metadata_json, created_at, updated_at)
     VALUES ('ws_fixture', 'fixture', 'Fixture', ?, ?, ?)`,
  ).run(JSON.stringify({ migrationRunId: input.runId }), now, now);
}

function retargetAuthorizationFixtureToSecondEntry(fixture: AuthorizationFixture): void {
  const encryptedSourcePath = path.join(path.dirname(fixture.input.encryptedSourcePath), "openrouter-api-key.bin");
  fs.writeFileSync(encryptedSourcePath, "second-fixture-encrypted-blob", { mode: 0o600 });
  const stat = fs.lstatSync(encryptedSourcePath);
  const sourceEntryId = "mentry_desktop_second";
  const ref = "provider/openrouter/workspace/ws_fixture/workspace/ws_fixture";
  const now = Date.now();
  const db = openDomainDbAt(fixture.input.stagedRoot);
  try {
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, created_at, updated_at)
       VALUES (?, ?, 'msrc_desktop', 'openrouter-api-key.bin', ?, 'file', 'desktop',
        'secret-recovery-only', ?, ?, ?, ?, ?, ?, 'inventoried', ?, ?)`,
    ).run(
      sourceEntryId,
      fixture.input.runId,
      Bun.SHA256.hash("openrouter-api-key.bin", "hex"),
      String(stat.dev),
      String(stat.ino),
      stat.mode,
      stat.size,
      Math.trunc(stat.mtimeMs),
      JSON.stringify([ref]),
      now,
      now,
    );
    db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, code, severity, detail_json, created_at)
       VALUES ('miss_plan_second', ?, 'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED', 'info', ?, ?)`,
    ).run(fixture.input.runId, JSON.stringify({
      kind: "text", refs: [ref], sourceEntryId,
      sourceLocatorHash: Bun.SHA256.hash("openrouter-api-key.bin", "hex"),
    }), now);
    db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, code, severity, detail_json, created_at)
       VALUES ('miss_required_second', ?, 'MIGRATION_DESKTOP_SECRET_HANDOFF_REQUIRED', 'block', ?, ?)`,
    ).run(fixture.input.runId, JSON.stringify({
      sourceEntryId,
      sourceLocatorHash: Bun.SHA256.hash("openrouter-api-key.bin", "hex"),
    }), now);
  } finally {
    db.close();
  }
  fixture.input.encryptedSourcePath = encryptedSourcePath;
  fixture.input.sourceEntryId = sourceEntryId;
  fixture.input.ref = ref;
  fixture.request.sourceEntryId = sourceEntryId;
  fixture.request.ref = ref;
}


function mutateJson(file: string, mutate: (value: Record<string, unknown>) => Record<string, unknown>): void {
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(file, `${JSON.stringify(mutate(value))}\n`, { mode: 0o600 });
}

async function authorizationApi(): Promise<AuthorizationApi> {
  return await import("../../cli/lib/migration/desktop-authorization.js") as AuthorizationApi;
}

async function buildDesktopHelper(fixture: AuthorizationFixture, secret: string): Promise<string> {
  const helperSourcePath = path.join(fixture.parent, "desktop-helper.ts");
  const executable = path.join(fixture.parent, "desktop-helper");
  const bridgeMethodsUrl = pathToFileURL(path.join(import.meta.dir, "../../cli/lib/bridge/methods.ts")).href;
  const bridgeSource = `
    import fs from "node:fs";
    import { createBridgeMethods } from ${JSON.stringify(bridgeMethodsUrl)};
    const metadata = JSON.parse(await Bun.stdin.text());
    const encryptedSourcePath = ${JSON.stringify(fixture.input.encryptedSourcePath)};
    const value = fs.readFileSync(encryptedSourcePath, "utf8");
    const method = createBridgeMethods({
      dataRoot: ${JSON.stringify(fixture.input.stagedRoot)},
      keyProvider: {
        lookupKey: async () => Buffer.alloc(32, 19),
        createKey: async () => Buffer.alloc(32, 19),
      },
    }).get("migration.secret.import");
    if (!method) throw new Error("migration.secret.import is missing");
    const result = await method.handle({
      sourcePath: ${JSON.stringify(fixture.input.sourcePath)},
      authorizationNonce: metadata.authorizationNonce,
      encryptedSourcePath,
      runId: metadata.runId,
      sourceEntryId: metadata.sourceEntryId,
      ref: metadata.ref,
      kind: metadata.kind,
      value,
    }, {
      consumerSessions: new Set(),
      activitySubscriptions: new Map(),
      helloComplete: true,
      markHello() {},
      setAuthority() {},
    });
    if (JSON.stringify(result) !== JSON.stringify({
      ref: metadata.ref,
      kind: metadata.kind,
      completed: true,
    })) throw new Error("migration.secret.import result is invalid");
  `;
  const helperSource = `
    if (process.env.RALPHY_AUTH_TEST_PROVIDER_SECRET !== undefined) {
      throw new Error("controller leaked provider environment");
    }
    const raw = await Bun.stdin.text();
    if (raw.includes(${JSON.stringify(secret)})
      || raw.includes(${JSON.stringify(fixture.input.encryptedSourcePath)})) {
      throw new Error("controller request contains source data");
    }
    const metadata = JSON.parse(raw);
    const keys = Object.keys(metadata).sort();
    const expected = ["authorizationNonce", "kind", "ref", "runId", "sourceEntryId", "stagedRoot", "v"];
    if (JSON.stringify(keys) !== JSON.stringify(expected)
      || metadata.v !== 1
      || metadata.stagedRoot !== ${JSON.stringify(fixture.input.stagedRoot)}) {
      throw new Error("controller request is not exact metadata");
    }
    const bridge = Bun.spawn({
      cmd: [${JSON.stringify(process.execPath)}, "-e", ${JSON.stringify(bridgeSource)}],
      stdin: new Blob([raw]),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(bridge.stdout).text(),
      new Response(bridge.stderr).text(),
      bridge.exited,
    ]);
    if (stdout !== "" || stderr !== "" || exitCode !== 0) {
      throw new Error("bridge child failed: " + stdout + stderr);
    }
  `;
  fs.writeFileSync(helperSourcePath, helperSource, { mode: 0o600 });
  const built = Bun.spawnSync({
    cmd: [process.execPath, "build", "--compile", helperSourcePath, "--outfile", executable],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (built.exitCode !== 0) throw new Error(`Desktop helper build failed: ${built.stderr.toString()}`);
  fs.chmodSync(executable, 0o700);
  return executable;
}

async function buildNoopDesktopHelper(fixture: AuthorizationFixture): Promise<string> {
  const source = path.join(fixture.parent, "desktop-noop-helper.ts");
  const executable = path.join(fixture.parent, "desktop-noop-helper");
  fs.writeFileSync(source, "await Bun.stdin.text();\n", { mode: 0o600 });
  const built = Bun.spawnSync({
    cmd: [process.execPath, "build", "--compile", source, "--outfile", executable],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (built.exitCode !== 0) throw new Error(`Desktop noop helper build failed: ${built.stderr.toString()}`);
  fs.chmodSync(executable, 0o700);
  return executable;
}
