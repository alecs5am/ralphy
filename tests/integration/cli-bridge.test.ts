import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { createBridgeMethods } from "../../cli/lib/bridge/methods.js";
import { runBridge } from "../../cli/lib/bridge/server.js";
import { latestActivitySequence } from "../../cli/lib/store/activity.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { createProject } from "../../cli/lib/store/scopes.js";
import { installConsumer, prepareConsumer } from "../helpers/consumer-auth.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot;
const bridgeKeyProvider = {
  lookupKey: async () => Buffer.alloc(32, 19),
  createKey: async () => Buffer.alloc(32, 19),
};
const repoRoot = path.resolve(import.meta.dir, "../..");

afterEach(() => {
  closeDomainDb();
  root.cleanup();
});

async function run(input: string): Promise<string> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const chunks: Buffer[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  const server = runBridge({
    dataRoot: `${root.dir}/.ralphy`,
    input: stdin,
    output: stdout,
    methods: createBridgeMethods({ dataRoot: `${root.dir}/.ralphy`, keyProvider: bridgeKeyProvider }),
  });
  stdin.end(input);
  await server;
  return Buffer.concat(chunks).toString("utf8");
}

describe("stdio bridge", () => {
  test("returns hello over JSONL and keeps stdout JSON-only", async () => {
    root = makeTmpRoot("ralphy-bridge");
    createWorkspace({ slug: "primary", name: "Primary" });
    const output = await run('{"v":1,"id":"hello","method":"system.hello"}\n');
    const response = JSON.parse(output) as {
      id: string;
      ok: boolean;
      result: {
        limits: { maxFrameBytes: number };
        capabilities: string[];
        consumerNamespaces?: unknown;
        consumers?: unknown;
      };
    };
    expect(response.id).toBe("hello");
    expect(response.ok).toBe(true);
    expect(response.result.limits.maxFrameBytes).toBe(1_048_576);
    expect(response.result.consumerNamespaces).toBeUndefined();
    expect(response.result.consumers).toBeUndefined();
    expect(response.result.capabilities).not.toContain("migration.consumer.map");
    expect(output.trim().split("\n")).toHaveLength(1);
  });

  test("CLI bridge opens a root with multiple Workspaces without inferring scope", () => {
    root = makeTmpRoot("ralphy-bridge-multi-workspace");
    createWorkspace({ slug: "first", name: "First" });
    createWorkspace({ slug: "second", name: "Second" });
    closeDomainDb();

    const result = spawnSync(process.execPath, [
      path.join(repoRoot, "cli/index.ts"),
      "bridge",
      "--stdio",
      "--root",
      path.join(root.dir, ".ralphy"),
    ], {
      cwd: root.dir,
      encoding: "utf8",
      input: '{"v":1,"id":"hello","method":"system.hello"}\n',
    });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      id: "hello",
      ok: true,
      result: { startup: { state: "ready", migration: "complete" } },
    });
  });

  test("does not expose the superseded Farm migration map", async () => {
    root = makeTmpRoot("ralphy-bridge-no-farm-map");
    createWorkspace({ slug: "primary", name: "Primary" });
    const output = await run([
      '{"v":1,"id":"hello","method":"system.hello"}',
      '{"v":1,"id":"map","method":"migration.consumer.map","params":{}}',
    ].join("\n") + "\n");
    const responses = output.trim().split("\n").map((line) => JSON.parse(line) as {
      id: string;
      ok: boolean;
      error?: { code: string };
    });
    expect(responses.find((response) => response.id === "map")).toMatchObject({
      id: "map",
      ok: false,
      error: { code: "E_PROTOCOL_INVALID" },
    });
  });

  test("rejects duplicate live ids fatally", async () => {
    root = makeTmpRoot("ralphy-bridge-duplicate");
    createWorkspace({ slug: "primary", name: "Primary" });
    const output = await run([
      '{"v":1,"id":"hello","method":"system.hello"}',
      '{"v":1,"id":"hello","method":"system.hello"}',
    ].join("\n") + "\n");
    const responses = output.trim().split("\n").map((line) => JSON.parse(line) as { id: string | null; ok: boolean; error?: { code: string } });
    expect(responses.some((response) => response.id === null && response.error?.code === "E_PROTOCOL_INVALID")).toBe(true);
  });

  test("globally resumes activity while authenticated reads stay scoped", async () => {
    root = makeTmpRoot("ralphy-bridge-activity");
    const first = createWorkspace({ slug: "first", name: "First" });
    const second = createWorkspace({ slug: "second", name: "Second" });
    const afterSequence = latestActivitySequence();
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    let resolveLines: (() => void) | undefined;
    stdout.on("data", (chunk: Buffer) => {
      lines.push(...Buffer.from(chunk).toString("utf8").trim().split("\n").filter(Boolean));
      resolveLines?.();
      resolveLines = undefined;
    });
    const server = runBridge({ dataRoot: `${root.dir}/.ralphy`, input: stdin, output: stdout });
    stdin.write('{"v":1,"id":"hello","method":"system.hello"}\n');
    stdin.write(`${JSON.stringify({
      v: 1,
      id: "sub",
      method: "activity.subscribe",
      params: { subscriptionId: "s1", afterSequence },
    })}\n`);
    await new Promise<void>((resolve) => {
      if (lines.length >= 2) resolve();
      else resolveLines = resolve;
    });
    createProject({ workspaceId: first.id, slug: "first-project", name: "First Project" });
    createProject({ workspaceId: second.id, slug: "second-project", name: "Second Project" });
    await new Promise<void>((resolve) => {
      const check = () => {
        if (lines.length >= 4) resolve();
        else setTimeout(check, 10);
      };
      check();
    });
    stdin.end();
    await server;
    const frames = lines.map((line) => JSON.parse(line) as {
      event?: string;
      id?: string;
      sequence?: number;
    });
    const subscriptionSequences = frames
      .filter((frame) => frame.event === "activity")
      .map((frame) => frame.sequence!);
    expect(frames[1]?.id).toBe("sub");
    expect(subscriptionSequences).toHaveLength(2);

    const methods = createBridgeMethods({ dataRoot: `${root.dir}/.ralphy` });
    const trusted = {
      consumerSessions: new Set<string>(),
      activitySubscriptions: new Map<string, { sequence: number; ready: boolean }>(),
      helloComplete: true,
      markHello() {},
      setAuthority() {},
    };
    const firstPage = await methods.get("activity.list")!.handle({
      afterSequence,
      limit: 1,
    }, trusted) as { items: { sequence: number }[]; nextCursor: number | null };
    const secondPage = await methods.get("activity.list")!.handle({
      afterSequence: firstPage.nextCursor,
      limit: 1,
    }, trusted) as { items: { sequence: number }[]; nextCursor: number | null };
    expect([...firstPage.items, ...secondPage.items].map((item) => item.sequence))
      .toEqual(subscriptionSequences);
    expect(secondPage.items[0]!.sequence).toBeGreaterThan(firstPage.items[0]!.sequence);

    const consumer = installConsumer(root);
    const authenticated = { ...trusted, authority: consumer.authority };
    expect(() => methods.get("activity.list")!.handle({
      afterSequence,
      limit: 10,
    }, authenticated)).toThrow(/scope|context/i);
    expect(() => methods.get("activity.subscribe")!.handle({
      subscriptionId: "authenticated",
      afterSequence,
    }, authenticated)).toThrow(/trusted|authenticated/i);
    const scoped = await methods.get("activity.list")!.handle({
      context: { workspaceId: first.id },
      afterSequence,
      limit: 10,
    }, authenticated) as { items: { workspaceId: string | null }[] };
    expect(scoped.items).toHaveLength(1);
    expect(scoped.items[0]!.workspaceId).toBe(first.id);
  });

  test("does not authenticate a connection while its trusted-root activity subscription exists", async () => {
    root = makeTmpRoot("ralphy-bridge-activity-auth-transition");
    const workspace = createWorkspace({ slug: "primary", name: "Primary" });
    const consumer = prepareConsumer(root);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    let buffered = "";
    stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString("utf8");
      const parts = buffered.split("\n");
      buffered = parts.pop()!;
      lines.push(...parts.filter(Boolean));
    });
    const frames = () => lines.map((line) => JSON.parse(line) as {
      id?: string;
      ok?: boolean;
      event?: string;
    });
    const waitFor = async (id: string): Promise<void> => {
      const deadline = Date.now() + 2_000;
      while (!frames().some((frame) => frame.id === id)) {
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${id}`);
        await Bun.sleep(5);
      }
    };
    const server = runBridge({ dataRoot: `${root.dir}/.ralphy`, input: stdin, output: stdout });

    stdin.write('{"v":1,"id":"hello","method":"system.hello"}\n');
    await waitFor("hello");
    stdin.write(`${JSON.stringify({
      v: 1,
      id: "sub",
      method: "activity.subscribe",
      params: { subscriptionId: "root", afterSequence: latestActivitySequence() },
    })}\n`);
    await waitFor("sub");
    stdin.write(`${JSON.stringify({
      v: 1,
      id: "auth-blocked",
      method: "consumer.authenticate",
      params: { namespace: consumer.namespace, tokenBase64url: consumer.token },
    })}\n`);
    await waitFor("auth-blocked");
    expect(frames().find((frame) => frame.id === "auth-blocked")?.ok).toBe(false);

    stdin.write('{"v":1,"id":"unsub","method":"activity.unsubscribe","params":{"subscriptionId":"root"}}\n');
    await waitFor("unsub");
    stdin.write(`${JSON.stringify({
      v: 1,
      id: "auth",
      method: "consumer.authenticate",
      params: { namespace: consumer.namespace, tokenBase64url: consumer.token },
    })}\n`);
    await waitFor("auth");
    expect(frames().find((frame) => frame.id === "auth")?.ok).toBe(true);

    createProject({ workspaceId: workspace.id, slug: "after-auth", name: "After Auth" });
    await Bun.sleep(100);
    stdin.end();
    await server;
    expect(frames().filter((frame) => frame.event === "activity")).toEqual([]);
  });

  test("rejects migration secrets without Desktop authorization and never returns their values", async () => {
    root = makeTmpRoot("ralphy-bridge-secret-import");
    const workspace = createWorkspace({ slug: "primary", name: "Primary" });
    const migrationId = "mig_00000000-0000-4000-8000-000000000031";
    const sourceEntryId = "mentry_00000000-0000-4000-8000-000000000031";
    const db = openDomainDb();
    const now = Date.now();
    const ref = `provider/openrouter/workspace/${workspace.id}/workspace/${workspace.id}`;
    db.prepare("UPDATE workspaces SET metadata_json = ? WHERE id = ?")
      .run(JSON.stringify({ migrationRunId: migrationId, migrationSourceLabel: "desktop-source" }), workspace.id);
    db.prepare(
      `INSERT INTO migration_runs (id, phase, created_at, updated_at)
       VALUES (?, 'relations', ?, ?)`,
    ).run(migrationId, now, now);
    db.prepare(
      `INSERT INTO migration_sources
       (id, migration_run_id, source_kind, source_label, canonical_path_hash,
        source_device, source_inode, source_mode, created_at)
       VALUES ('desktop-source', ?, 'desktop', 'desktop-source', ?, '1', '2', 16877, ?)`,
    ).run(migrationId, "a".repeat(64), now);
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, created_at, updated_at)
       VALUES (?, ?, 'desktop-source', 'openrouter-api-key.bin', ?, 'file', 'desktop',
        'secret-recovery-only', '1', '3', 33152, 4, ?, ?, 'inventoried', ?, ?)`,
    ).run(sourceEntryId, migrationId, "b".repeat(64), now, JSON.stringify([ref]), now, now);
    db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, code, severity, detail_json, created_at)
       VALUES ('miss_00000000-0000-4000-8000-000000000031', ?,
        'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED', 'info', ?, ?)`,
    ).run(migrationId, JSON.stringify({
      kind: "text",
      refs: [ref],
      sourceEntryId,
      sourceLocatorHash: "b".repeat(64),
    }), now);
    const secret = "bridge-secret-value";
    const output = await run([
      '{"v":1,"id":"hello","method":"system.hello"}',
      JSON.stringify({
        v: 1,
        id: "import",
        method: "migration.secret.import",
        params: {
          runId: migrationId,
          sourceEntryId,
          ref,
          kind: "text",
          value: secret,
        },
      }),
    ].join("\n") + "\n");
    expect(output).not.toContain(secret);
    const encryptedPath = path.join(root.dir, ".ralphy", "secrets.enc");
    expect(fs.existsSync(encryptedPath)).toBe(false);
    expect(db.query<{ disposition: string; state: string; refs: string }, [string]>(
      `SELECT disposition, state, target_refs_json AS refs
       FROM migration_entries WHERE id = ?`,
    ).get(sourceEntryId)).toEqual({
      disposition: "secret-recovery-only",
      state: "inventoried",
      refs: JSON.stringify([ref]),
    });
    const response = JSON.parse(output.trim().split("\n").at(-1)!) as { ok: boolean; error?: { code: string } };
    expect(response).toMatchObject({ ok: false, error: { code: "E_INTERNAL" } });
    fs.writeFileSync(encryptedPath, "");

    const accountEntryId = "mentry_00000000-0000-4000-8000-000000000032";
    const accountHash = "c".repeat(64);
    const accountRef = `provider/openrouter/workspace/${workspace.id}/account/missing-account`;
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, created_at, updated_at)
       VALUES (?, ?, 'desktop-source', 'account-ref.bin', ?, 'file', 'desktop',
        'secret-recovery-only', '1', '4', 33152, 4, ?, ?, 'inventoried', ?, ?)`,
    ).run(accountEntryId, migrationId, accountHash, now, JSON.stringify([accountRef]), now, now);
    db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, code, severity, detail_json, created_at)
       VALUES ('miss_00000000-0000-4000-8000-000000000032', ?,
        'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED', 'info', ?, ?)`,
    ).run(migrationId, JSON.stringify({
      kind: "text", refs: [accountRef], sourceEntryId: accountEntryId, sourceLocatorHash: accountHash,
    }), now);
    const encryptedBefore = fs.readFileSync(path.join(root.dir, ".ralphy", "secrets.enc"));
    const rejectedOutput = await run([
      '{"v":1,"id":"hello","method":"system.hello"}',
      JSON.stringify({
        v: 1,
        id: "invalid-account",
        method: "migration.secret.import",
        params: {
          runId: migrationId,
          sourceEntryId: accountEntryId,
          ref: accountRef,
          kind: "text",
          value: "must-not-be-written",
        },
      }),
    ].join("\n") + "\n");
    const rejected = JSON.parse(rejectedOutput.trim().split("\n").at(-1)!) as {
      ok: boolean;
      error?: { code: string };
    };
    expect(rejected).toMatchObject({ ok: false, error: { code: "E_INTERNAL" } });
    expect(fs.readFileSync(path.join(root.dir, ".ralphy", "secrets.enc"))).toEqual(encryptedBefore);
    expect(db.query<{ state: string }, [string]>(
      "SELECT state FROM migration_entries WHERE id = ?",
    ).get(accountEntryId)?.state).toBe("inventoried");

    const providerEntryId = "mentry_00000000-0000-4000-8000-000000000033";
    const providerHash = "d".repeat(64);
    const providerRef = `provider/not-runtime/workspace/${workspace.id}/workspace/${workspace.id}`;
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, created_at, updated_at)
       VALUES (?, ?, 'desktop-source', 'not-runtime-api-key.bin', ?, 'file', 'desktop',
        'secret-recovery-only', '1', '5', 33152, 4, ?, ?, 'inventoried', ?, ?)`,
    ).run(providerEntryId, migrationId, providerHash, now, JSON.stringify([providerRef]), now, now);
    db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, code, severity, detail_json, created_at)
       VALUES ('miss_00000000-0000-4000-8000-000000000033', ?,
        'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED', 'info', ?, ?)`,
    ).run(migrationId, JSON.stringify({
      kind: "text", refs: [providerRef], sourceEntryId: providerEntryId, sourceLocatorHash: providerHash,
    }), now);
    const providerOutput = await run([
      '{"v":1,"id":"hello","method":"system.hello"}',
      JSON.stringify({
        v: 1,
        id: "invalid-provider",
        method: "migration.secret.import",
        params: {
          runId: migrationId,
          sourceEntryId: providerEntryId,
          ref: providerRef,
          kind: "text",
          value: "must-not-be-written",
        },
      }),
    ].join("\n") + "\n");
    expect(JSON.parse(providerOutput.trim().split("\n").at(-1)!)).toMatchObject({
      ok: false,
      error: { code: "E_INTERNAL" },
    });
    expect(fs.readFileSync(path.join(root.dir, ".ralphy", "secrets.enc"))).toEqual(encryptedBefore);
    expect(db.query<{ state: string }, [string]>(
      "SELECT state FROM migration_entries WHERE id = ?",
    ).get(providerEntryId)?.state).toBe("inventoried");

    const fileEntryId = "mentry_00000000-0000-4000-8000-000000000034";
    const fileHash = "e".repeat(64);
    const fileRef = `provider/elevenlabs/workspace/${workspace.id}/workspace/${workspace.id}`;
    db.prepare(
      `INSERT INTO migration_entries
       (id, migration_run_id, migration_source_id, source_path, source_locator_hash,
        entry_kind, source_kind, disposition, source_device, source_inode, source_mode,
        bytes, mtime_ms, target_refs_json, state, created_at, updated_at)
       VALUES (?, ?, 'desktop-source', 'protocol-file.bin', ?, 'file', 'desktop',
        'secret-recovery-only', '1', '6', 33152, 4, ?, ?, 'inventoried', ?, ?)`,
    ).run(fileEntryId, migrationId, fileHash, now, JSON.stringify([fileRef]), now, now);
    db.prepare(
      `INSERT INTO migration_issues
       (id, migration_run_id, code, severity, detail_json, created_at)
       VALUES ('miss_00000000-0000-4000-8000-000000000034', ?,
        'MIGRATION_DESKTOP_SECRET_HANDOFF_PLANNED', 'info', ?, ?)`,
    ).run(migrationId, JSON.stringify({
      kind: "file", refs: [fileRef], sourceEntryId: fileEntryId, sourceLocatorHash: fileHash,
    }), now);
    const importSecret = createBridgeMethods({
      dataRoot: path.join(root.dir, ".ralphy"),
      keyProvider: bridgeKeyProvider,
    })
      .get("migration.secret.import")!;
    const context = {
      consumerSessions: new Set<string>(),
      activitySubscriptions: new Map<string, { sequence: number; ready: boolean }>(),
      helloComplete: true,
      markHello() {},
      close() {},
    };
    await expect(importSecret.handle({
      runId: migrationId,
      sourceEntryId: fileEntryId,
      ref: fileRef,
      kind: "file",
      base64: "YR==",
    }, context)).rejects.toThrow();
    await expect(importSecret.handle({
      runId: migrationId,
      sourceEntryId: fileEntryId,
      ref: fileRef,
      kind: "file",
      base64: Buffer.alloc(1024 * 1024 + 1).toString("base64"),
    }, context)).rejects.toThrow();
    expect(db.query<{ state: string }, [string]>(
      "SELECT state FROM migration_entries WHERE id = ?",
    ).get(fileEntryId)?.state).toBe("inventoried");
    await expect(importSecret.handle({
      runId: migrationId,
      sourceEntryId: fileEntryId,
      ref: fileRef,
      kind: "file",
      base64: "YQ==",
    }, context)).rejects.toThrow(/authorization/i);
  });
});
