import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  authenticateConsumer,
  readFarmIdentity,
  revokeConsumerAuthority,
  type ConsumerAuthority,
} from "../../cli/lib/store/consumer-auth.js";
import { requestDigest } from "../../cli/lib/store/canonical-json.js";
import {
  findConsumerOperation,
  listRunResults,
  startConsumerOperationRun,
} from "../../cli/lib/store/consumer-runs.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { finishRun } from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import {
  endAgentSession,
  endConsumerSession,
  startConsumerSession,
} from "../../cli/lib/store/sessions.js";
import { verifyDomainStore } from "../../cli/lib/store/verify.js";
import {
  installFarmConsumer,
  prepareFarmConsumer,
  serializeFarmIdentity,
} from "../helpers/consumer-auth.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let roots: TmpRoot[] = [];

function makeRoot(label: string): TmpRoot {
  const root = makeTmpRoot(`ralphy-consumer-auth-${label}`);
  roots.push(root);
  return root;
}

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("consumer identity authentication", () => {
  test("authenticates generated runtime facts and returns opaque authority", () => {
    const root = makeRoot("runtime");
    const prepared = prepareFarmConsumer(root, { tokenByte: 19 });

    expect(readFarmIdentity()).toEqual(prepared.identity);
    expect(prepared.identity.storeId).toMatch(/^store_[0-9a-f]{32}$/);
    expect(prepared.identity.consumerId).toBe("consumer_farm");

    const authority = prepared.authenticate();
    expect(Object.keys(authority)).toEqual([]);
    expect(Object.isFrozen(authority)).toBe(true);
  });

  test("uses one fixed path-free failure for malformed tokens and identity facts", () => {
    const malformed = makeRoot("malformed-token");
    const prepared = prepareFarmConsumer(malformed);
    for (const token of [
      prepared.token.slice(1),
      `${prepared.token}=`,
      `+${prepared.token.slice(1)}`,
      Buffer.alloc(32, 8).toString("base64url"),
    ]) {
      expect(() => authenticateConsumer("farm", token)).toThrow(
        "Consumer authentication failed",
      );
    }

    fs.writeFileSync(prepared.identityPath, `${prepared.canonical}\n`);
    fs.chmodSync(prepared.identityPath, 0o600);
    let failure: unknown;
    try {
      prepared.authenticate();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Consumer authentication failed");
    expect((failure as Error).message).not.toContain(rootPath(malformed));
    expect((failure as Error).message).not.toContain(prepared.token);

    closeDomainDb();
    const wrongStore = makeRoot("wrong-store");
    const wrongStoreIdentity = prepareFarmConsumer(wrongStore, {
      identity: { storeId: "store_00000000000000000000000000000000" },
    });
    expect(wrongStoreIdentity.identity.storeId).not.toBe(
      openDomainDb()
        .query<
          { storeId: string },
          []
        >("SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1")
        .get()!.storeId,
    );
    expect(wrongStoreIdentity.authenticate).toThrow(
      "Consumer authentication failed",
    );

    closeDomainDb();
    const wrongPrincipal = makeRoot("wrong-principal");
    const wrongPrincipalIdentity = prepareFarmConsumer(wrongPrincipal, {
      consumerId: "consumer_identity",
      principalId: "consumer_bound",
    });
    expect(wrongPrincipalIdentity.authenticate).toThrow(
      "Consumer authentication failed",
    );

    closeDomainDb();
    const disabledRoot = makeRoot("disabled-principal");
    const disabled = prepareFarmConsumer(disabledRoot);
    openDomainDb()
      .prepare("UPDATE consumer_principals SET disabled_at = ? WHERE id = ?")
      .run(Date.now(), disabled.identity.consumerId);
    expect(disabled.authenticate).toThrow(
      "Consumer authentication failed",
    );
  });

  test("zeroes decoded token bytes on success and canonicality rejection", () => {
    const root = makeRoot("token-zeroing");
    const prepared = prepareFarmConsumer(root);
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const finalIndex = alphabet.indexOf(prepared.token.at(-1)!);
    const nonCanonical = `${prepared.token.slice(0, -1)}${alphabet[finalIndex + 1]}`;
    const tokenHex = Buffer.from(prepared.token, "base64url").toString("hex");
    const mutableBuffer = Buffer.prototype as unknown as {
      fill: (...args: unknown[]) => Buffer;
    };
    const originalFill = mutableBuffer.fill;
    let tokenZeroes = 0;
    mutableBuffer.fill = function (this: Buffer, ...args: unknown[]): Buffer {
      if (
        args[0] === 0 &&
        this.byteLength === 32 &&
        this.toString("hex") === tokenHex
      ) {
        tokenZeroes += 1;
      }
      return originalFill.apply(this, args);
    };
    try {
      expect(prepared.authenticate()).toBeObject();
      expect(() => authenticateConsumer("farm", nonCanonical)).toThrow(
        "Consumer authentication failed",
      );
    } finally {
      mutableBuffer.fill = originalFill;
    }
    expect(tokenZeroes).toBeGreaterThanOrEqual(2);
  });

  test("rejects a UTF-8 BOM before an otherwise canonical identity", () => {
    const root = makeRoot("bom");
    const prepared = prepareFarmConsumer(root);
    fs.writeFileSync(
      prepared.identityPath,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(prepared.canonical)]),
    );
    fs.chmodSync(prepared.identityPath, 0o600);

    expect(prepared.authenticate).toThrow("Consumer authentication failed");
  });

  test("rejects unsafe parent and leaf types, ownership, mode, and size", () => {
    const modeRoot = makeRoot("mode");
    const wrongMode = prepareFarmConsumer(modeRoot);
    fs.chmodSync(wrongMode.identityPath, 0o644);
    expect(readFarmIdentity).toThrow("Consumer identity is unavailable");

    closeDomainDb();
    const sizeRoot = makeRoot("size");
    const wrongSize = prepareFarmConsumer(sizeRoot);
    fs.writeFileSync(wrongSize.identityPath, "");
    fs.chmodSync(wrongSize.identityPath, 0o600);
    expect(readFarmIdentity).toThrow("Consumer identity is unavailable");
    fs.writeFileSync(wrongSize.identityPath, Buffer.alloc(4097));
    fs.chmodSync(wrongSize.identityPath, 0o600);
    expect(readFarmIdentity).toThrow("Consumer identity is unavailable");

    closeDomainDb();
    const regularRoot = makeRoot("regular");
    const nonRegular = prepareFarmConsumer(regularRoot);
    fs.rmSync(nonRegular.identityPath);
    fs.mkdirSync(nonRegular.identityPath, { mode: 0o700 });
    expect(readFarmIdentity).toThrow("Consumer identity is unavailable");

    closeDomainDb();
    const leafRoot = makeRoot("leaf-symlink");
    const leaf = prepareFarmConsumer(leafRoot);
    const external = path.join(leafRoot.dir, "external-identity.json");
    fs.writeFileSync(external, leaf.canonical, { mode: 0o600 });
    fs.rmSync(leaf.identityPath);
    fs.symlinkSync(external, leaf.identityPath);
    expect(readFarmIdentity).toThrow("Consumer identity is unavailable");

    closeDomainDb();
    const parentRoot = makeRoot("parent-symlink");
    const parent = prepareFarmConsumer(parentRoot);
    const moved = path.join(parentRoot.dir, "external-farm");
    fs.renameSync(parent.farmPath, moved);
    fs.symlinkSync(moved, parent.farmPath, "dir");
    expect(readFarmIdentity).toThrow("Consumer identity is unavailable");

    closeDomainDb();
    const parentModeRoot = makeRoot("parent-mode");
    const parentMode = prepareFarmConsumer(parentModeRoot);
    fs.chmodSync(parentMode.farmPath, 0o777);
    expect(readFarmIdentity).toThrow("Consumer identity is unavailable");

    closeDomainDb();
    const ownerRoot = makeRoot("owner");
    const owner = prepareFarmConsumer(ownerRoot);
    const mutableFs = fs as unknown as { fstatSync: typeof fs.fstatSync };
    const originalFstat = mutableFs.fstatSync;
    mutableFs.fstatSync = ((descriptor: number, options?: unknown) => {
      const stat = originalFstat(descriptor, options as never);
      if (stat.isFile() && stat.size === Buffer.byteLength(owner.canonical)) {
        return new Proxy(stat, {
          get(target, property, receiver) {
            if (property === "uid") return target.uid + 1;
            return Reflect.get(target, property, receiver);
          },
        });
      }
      return stat;
    }) as typeof fs.fstatSync;
    try {
      expect(readFarmIdentity).toThrow("Consumer identity is unavailable");
    } finally {
      mutableFs.fstatSync = originalFstat;
    }

    closeDomainDb();
    const parentOwnerRoot = makeRoot("parent-owner");
    const parentOwner = prepareFarmConsumer(parentOwnerRoot);
    const canonicalParent = fs.realpathSync(parentOwner.farmPath);
    const mutableLstat = fs as unknown as { lstatSync: typeof fs.lstatSync };
    const originalLstat = mutableLstat.lstatSync;
    mutableLstat.lstatSync = ((...args: Parameters<typeof fs.lstatSync>) => {
      const stat = originalLstat(...args);
      if (path.resolve(String(args[0])) === canonicalParent) {
        return new Proxy(stat, {
          get(target, property, receiver) {
            if (property === "uid") return target.uid + 1;
            return Reflect.get(target, property, receiver);
          },
        });
      }
      return stat;
    }) as typeof fs.lstatSync;
    try {
      expect(readFarmIdentity).toThrow("Consumer identity is unavailable");
    } finally {
      mutableLstat.lstatSync = originalLstat;
    }
  });

  test("rejects a parent size change at the opened-directory snapshot", () => {
    const root = makeRoot("parent-size");
    const prepared = prepareFarmConsumer(root);
    const parent = fs.lstatSync(prepared.farmPath);
    const mutableFs = fs as unknown as { fstatSync: typeof fs.fstatSync };
    const originalFstat = mutableFs.fstatSync;
    let changed = false;
    mutableFs.fstatSync = ((...args: Parameters<typeof fs.fstatSync>) => {
      const stat = originalFstat(...args);
      if (stat.isDirectory() && stat.dev === parent.dev && stat.ino === parent.ino) {
        changed = true;
        return new Proxy(stat, {
          get(target, property, receiver) {
            if (property === "size") return target.size + 1;
            return Reflect.get(target, property, receiver);
          },
        });
      }
      return stat;
    }) as typeof fs.fstatSync;
    let failure: unknown;
    try {
      readFarmIdentity();
    } catch (error) {
      failure = error;
    } finally {
      mutableFs.fstatSync = originalFstat;
    }

    expect(changed).toBe(true);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("Consumer identity is unavailable");
  });

  test("detects leaf and parent replacement races", () => {
    const leafRoot = makeRoot("leaf-race");
    const leaf = prepareFarmConsumer(leafRoot);
    const mutableFs = fs as unknown as { readSync: typeof fs.readSync };
    const originalRead = mutableFs.readSync;
    let truncated = false;
    mutableFs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
      const count = originalRead(...args);
      if (!truncated && count > 0) {
        truncated = true;
        fs.ftruncateSync(
          args[0] as number,
          Buffer.byteLength(leaf.canonical) - 1,
        );
      }
      return count;
    }) as typeof fs.readSync;
    try {
      expect(readFarmIdentity).toThrow("Consumer identity is unavailable");
    } finally {
      mutableFs.readSync = originalRead;
    }
    expect(truncated).toBe(true);

    closeDomainDb();
    const parentRoot = makeRoot("parent-race");
    const parent = prepareFarmConsumer(parentRoot);
    const poison = path.join(parentRoot.dir, "poison-farm");
    fs.mkdirSync(poison, { mode: 0o700 });
    fs.writeFileSync(path.join(poison, "identity.json"), parent.canonical, {
      mode: 0o600,
    });
    const originalParentRead = mutableFs.readSync;
    let swapped = false;
    mutableFs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
      const count = originalParentRead(...args);
      if (!swapped && count > 0) {
        swapped = true;
        fs.renameSync(parent.farmPath, `${parent.farmPath}-original`);
        fs.symlinkSync(poison, parent.farmPath, "dir");
      }
      return count;
    }) as typeof fs.readSync;
    try {
      expect(readFarmIdentity).toThrow("Consumer identity is unavailable");
    } finally {
      mutableFs.readSync = originalParentRead;
    }
    expect(swapped).toBe(true);
  });

  test("opens identity relative to the pinned original parent on Darwin", () => {
    if (process.platform !== "darwin") return;
    const root = makeRoot("darwin-parent-aba");
    const prepared = prepareFarmConsumer(root);
    const replacementFarm = path.join(root.dir, "replacement-farm");
    const parkedFarm = path.join(root.dir, "parked-farm");
    const replacement = {
      ...prepared.identity,
      migrationId: "migration_replacement",
    };
    fs.mkdirSync(replacementFarm, { mode: 0o700 });
    fs.writeFileSync(
      path.join(replacementFarm, "identity.json"),
      serializeFarmIdentity(replacement),
      { mode: 0o600 },
    );

    const canonicalFarm = fs.realpathSync(prepared.farmPath);
    const canonicalIdentity = path.join(canonicalFarm, "identity.json");
    const originalParent = fs.lstatSync(prepared.farmPath);
    const mutableFs = fs as unknown as {
      openSync: typeof fs.openSync;
      fstatSync: typeof fs.fstatSync;
    };
    const originalOpen = mutableFs.openSync;
    const originalFstat = mutableFs.fstatSync;
    let swapped = false;
    let restored = false;
    const swapIn = () => {
      fs.renameSync(prepared.farmPath, parkedFarm);
      fs.renameSync(replacementFarm, prepared.farmPath);
      swapped = true;
    };
    const restore = () => {
      fs.renameSync(prepared.farmPath, replacementFarm);
      fs.renameSync(parkedFarm, prepared.farmPath);
      restored = true;
    };
    mutableFs.openSync = ((...args: Parameters<typeof fs.openSync>) => {
      const target = path.resolve(String(args[0]));
      if (!swapped && target === canonicalFarm) {
        const descriptor = originalOpen(...args);
        swapIn();
        return descriptor;
      }
      if (!swapped && target === canonicalIdentity) {
        swapIn();
        try {
          return originalOpen(...args);
        } finally {
          restore();
        }
      }
      return originalOpen(...args);
    }) as typeof fs.openSync;
    mutableFs.fstatSync = ((...args: Parameters<typeof fs.fstatSync>) => {
      const stat = originalFstat(...args);
      if (
        swapped &&
        !restored &&
        stat.isDirectory() &&
        stat.dev === originalParent.dev &&
        stat.ino === originalParent.ino
      ) {
        restore();
      }
      return stat;
    }) as typeof fs.fstatSync;
    try {
      expect(readFarmIdentity()).toEqual(prepared.identity);
    } finally {
      mutableFs.openSync = originalOpen;
      mutableFs.fstatSync = originalFstat;
      if (swapped && !restored) restore();
    }
    expect(swapped).toBe(true);
    expect(restored).toBe(true);
  });

  test("opens only identity.json and never traverses a poison descendant tree", () => {
    const root = makeRoot("poison");
    const prepared = prepareFarmConsumer(root);
    const poisonNames = ["buckets", "tmp", "cache"];
    for (const name of poisonNames) {
      const directory = path.join(prepared.farmPath, name, "poison");
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "secret.txt"), "must-not-read");
    }
    fs.writeFileSync(
      path.join(prepared.farmPath, "auth.token"),
      prepared.token,
    );
    fs.writeFileSync(path.join(prepared.farmPath, "journal.jsonl"), "private");
    fs.writeFileSync(
      path.join(prepared.farmPath, "large.bin"),
      Buffer.alloc(8192),
    );
    fs.symlinkSync("missing", path.join(prepared.farmPath, "broken-link"));
    const outside = path.join(root.dir, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.txt"), "outside");
    fs.symlinkSync(
      outside,
      path.join(prepared.farmPath, "outside-link"),
      "dir",
    );
    const requestedDataRoot = path.resolve(root.dir, ".ralphy");
    const canonicalDataRoot = fs.realpathSync(requestedDataRoot);
    const canonicalFarm = fs.realpathSync(prepared.farmPath);
    const canonicalIdentity = path.join(canonicalFarm, "identity.json");
    const mutableFs = fs as unknown as {
      openSync: typeof fs.openSync;
      fstatSync: typeof fs.fstatSync;
      readSync: typeof fs.readSync;
      readFileSync: typeof fs.readFileSync;
      readdirSync: typeof fs.readdirSync;
      statSync: typeof fs.statSync;
      lstatSync: typeof fs.lstatSync;
      realpathSync: typeof fs.realpathSync;
    };
    const originals = {
      openSync: mutableFs.openSync,
      fstatSync: mutableFs.fstatSync,
      readSync: mutableFs.readSync,
      readFileSync: mutableFs.readFileSync,
      readdirSync: mutableFs.readdirSync,
      statSync: mutableFs.statSync,
      lstatSync: mutableFs.lstatSync,
      realpathSync: mutableFs.realpathSync,
    };
    const touched: Array<{ operation: string; value: string }> = [];
    const record = (operation: string, value: unknown) => {
      if (typeof value === "string") touched.push({ operation, value });
    };
    mutableFs.openSync = ((...args: Parameters<typeof fs.openSync>) => {
      record("openSync", args[0]);
      return originals.openSync(...args);
    }) as typeof fs.openSync;
    let descriptorStats = 0;
    mutableFs.fstatSync = ((...args: Parameters<typeof fs.fstatSync>) => {
      descriptorStats += 1;
      return originals.fstatSync(...args);
    }) as typeof fs.fstatSync;
    let descriptorReads = 0;
    mutableFs.readSync = ((...args: Parameters<typeof fs.readSync>) => {
      descriptorReads += 1;
      return originals.readSync(...args);
    }) as typeof fs.readSync;
    mutableFs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
      record("readFileSync", args[0]);
      return originals.readFileSync(...args);
    }) as typeof fs.readFileSync;
    mutableFs.readdirSync = ((...args: Parameters<typeof fs.readdirSync>) => {
      record("readdirSync", args[0]);
      return originals.readdirSync(...args);
    }) as typeof fs.readdirSync;
    mutableFs.statSync = ((...args: Parameters<typeof fs.statSync>) => {
      record("statSync", args[0]);
      return originals.statSync(...args);
    }) as typeof fs.statSync;
    mutableFs.lstatSync = ((...args: Parameters<typeof fs.lstatSync>) => {
      record("lstatSync", args[0]);
      return originals.lstatSync(...args);
    }) as typeof fs.lstatSync;
    mutableFs.realpathSync = ((...args: Parameters<typeof fs.realpathSync>) => {
      record("realpathSync", args[0]);
      return originals.realpathSync(...args);
    }) as typeof fs.realpathSync;
    try {
      expect(prepared.authenticate()).toBeObject();
    } finally {
      mutableFs.openSync = originals.openSync;
      mutableFs.fstatSync = originals.fstatSync;
      mutableFs.readSync = originals.readSync;
      mutableFs.readFileSync = originals.readFileSync;
      mutableFs.readdirSync = originals.readdirSync;
      mutableFs.statSync = originals.statSync;
      mutableFs.lstatSync = originals.lstatSync;
      mutableFs.realpathSync = originals.realpathSync;
    }
    const allowed = ({ operation, value }: (typeof touched)[number]) => {
      if (/^\/(?:proc\/self|dev)\/fd\/\d+(?:\/identity\.json)?$/.test(value)) {
        return operation === "openSync" || operation === "realpathSync";
      }
      const resolved = path.resolve(value);
      if (operation === "openSync") {
        return resolved === canonicalFarm || resolved === canonicalIdentity;
      }
      if (operation === "lstatSync") return resolved === canonicalFarm;
      if (operation === "realpathSync") {
        return (
          resolved === requestedDataRoot ||
          resolved === canonicalDataRoot ||
          resolved === canonicalFarm
        );
      }
      return false;
    };
    expect(
      touched.filter((entry) => !allowed(entry)),
    ).toEqual([]);
    expect(
      touched.some(({ operation, value }) =>
        operation === "openSync" && path.resolve(value) === canonicalFarm
      ),
    ).toBe(true);
    expect(descriptorStats).toBeGreaterThan(0);
    expect(descriptorReads).toBeGreaterThan(0);
  });
});

describe("consumer connection authority", () => {
  test("owns Sessions and external operations until explicit revocation", () => {
    const root = makeRoot("authority");
    const farm = installFarmConsumer(root);
    const secondAuthority = authenticateConsumer("farm", farm.token);
    const workspace = createWorkspace({ slug: "client", name: "Client" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "campaign",
      name: "Campaign",
    });
    const session = startConsumerSession(farm.authority, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    expect(() => endAgentSession(session.id)).toThrow(/consumer Session/i);
    expect(() =>
      startConsumerSession({} as ConsumerAuthority, {
        workspaceId: workspace.id,
      }),
    ).toThrow("Consumer authority is not live");

    const external = {
      runId: "farm-run",
      nodeId: "node-1",
      attempt: 1,
      operation: "generation",
      idempotencyKey: "key-1",
    };
    const started = startConsumerOperationRun(farm.authority, {
      sessionId: session.id,
      workspaceId: workspace.id,
      projectId: project.id,
      kind: "generation",
      external,
      requestDigest: requestDigest({ prompt: "hello" }),
    });
    expect(() =>
      startConsumerOperationRun(secondAuthority, {
        sessionId: session.id,
        workspaceId: workspace.id,
        projectId: project.id,
        kind: "generation",
        external,
        requestDigest: requestDigest({ prompt: "hello" }),
      }),
    ).toThrow("Consumer Session is not owned by this authority");
    expect(() => endConsumerSession(secondAuthority, session.id)).toThrow(
      "Consumer Session is not owned by this authority",
    );
    expect(() =>
      findConsumerOperation(secondAuthority, {
        sessionId: session.id,
        workspaceId: workspace.id,
        projectId: project.id,
        idempotencyKey: external.idempotencyKey,
      }),
    ).toThrow("Consumer Session is not owned by this authority");
    expect(() =>
      listRunResults({
        context: {
          sessionId: session.id,
          consumerAuthority: secondAuthority,
        },
        runId: started.run.id,
        limit: 10,
      }),
    ).toThrow("Consumer Session is not owned by this authority");

    const reconnect = startConsumerSession(secondAuthority, {
      workspaceId: workspace.id,
      projectId: project.id,
    });
    expect(
      findConsumerOperation(secondAuthority, {
        sessionId: reconnect.id,
        workspaceId: workspace.id,
        projectId: project.id,
        idempotencyKey: external.idempotencyKey,
      }).run.id,
    ).toBe(started.run.id);
    expect(
      listRunResults({
        context: {
          sessionId: reconnect.id,
          consumerAuthority: secondAuthority,
        },
        runId: started.run.id,
        limit: 10,
      }).items,
    ).toEqual([]);

    revokeConsumerAuthority(secondAuthority);
    expect(() => revokeConsumerAuthority(secondAuthority)).not.toThrow();
    expect(() =>
      startConsumerSession(secondAuthority, { workspaceId: workspace.id }),
    ).toThrow("Consumer authority is not live");
    expect(() => endConsumerSession(secondAuthority, reconnect.id)).toThrow(
      "Consumer authority is not live",
    );
    expect(() =>
      findConsumerOperation(secondAuthority, {
        sessionId: reconnect.id,
        workspaceId: workspace.id,
        projectId: project.id,
        idempotencyKey: external.idempotencyKey,
      }),
    ).toThrow("Consumer authority is not live");

    expect(() => endConsumerSession(farm.authority, session.id)).toThrow(
      /active Run/i,
    );
    finishRun(started.run.id, { state: "cancelled" });
    expect(endConsumerSession(farm.authority, session.id).endedAt).toBeNumber();
  });

  test("rejects authority after DB reopen and across data roots", () => {
    const firstRoot = makeRoot("authority-root-a");
    const firstFarm = installFarmConsumer(firstRoot);
    const firstWorkspace = createWorkspace({ slug: "first", name: "First" });

    closeDomainDb();
    openDomainDb();
    expect(() =>
      startConsumerSession(firstFarm.authority, {
        workspaceId: firstWorkspace.id,
      }),
    ).toThrow("Consumer authority is not live");

    const reopenedAuthority = authenticateConsumer("farm", firstFarm.token);
    expect(
      startConsumerSession(reopenedAuthority, {
        workspaceId: firstWorkspace.id,
      }).agent,
    ).toBe("consumer:farm");

    const secondRoot = makeRoot("authority-root-b");
    installFarmConsumer(secondRoot, { tokenByte: 23 });
    const secondWorkspace = createWorkspace({ slug: "second", name: "Second" });
    expect(() =>
      startConsumerSession(reopenedAuthority, {
        workspaceId: secondWorkspace.id,
      }),
    ).toThrow("Consumer authority is not live");
  });

  test("enforces bounded principal IDs in SQL and verifier recovery", () => {
    makeRoot("principal-id");
    const db = openDomainDb();
    expect(() =>
      db
        .prepare(
          `INSERT INTO consumer_principals
         (id, namespace, identity_digest, created_at)
         VALUES (' bad', 'bad-id', ?, 1)`,
        )
        .run("b".repeat(64)),
    ).toThrow(/constraint/i);
    expect(() =>
      db.prepare(
        `INSERT INTO consumer_principals
         (id, namespace, identity_digest, created_at)
         VALUES (x'626164', 'blob-id', ?, 1)`,
      ).run("b".repeat(64)),
    ).toThrow(/constraint/i);

    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare(
      `INSERT INTO consumer_principals
       (id, namespace, identity_digest, created_at)
       VALUES (' bad', 'bad-id', ?, 1)`,
    ).run("b".repeat(64));
    db.exec("PRAGMA ignore_check_constraints = OFF");
    expect(verifyDomainStore().sessionProvenanceIssues).toContainEqual({
      entityType: "consumer-principal",
      entityId: " bad",
      reason: "invalid-consumer-principal",
    });
  });

  test("rejects a BLOB principal identity digest in direct SQL", () => {
    makeRoot("principal-digest-blob");
    const db = openDomainDb();
    expect(() =>
      db.exec(
        `INSERT INTO consumer_principals
         (id, namespace, identity_digest, created_at)
         VALUES ('consumer_blob_digest', 'blob-digest',
                 CAST('${"e".repeat(64)}' AS BLOB), 1)`,
      ),
    ).toThrow(/constraint/i);
  });

  test("routes a bypassed BLOB principal digest through closed provenance", () => {
    makeRoot("principal-digest-blob-verifier");
    const db = openDomainDb();
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.exec(
      `INSERT INTO consumer_principals
       (id, namespace, identity_digest, created_at)
       VALUES ('consumer_blob_digest', 'blob-digest',
               CAST('${"f".repeat(64)}' AS BLOB), 1)`,
    );
    db.exec("PRAGMA ignore_check_constraints = OFF");

    expect(verifyDomainStore().sessionProvenanceIssues).toContainEqual({
      entityType: "consumer-principal",
      entityId: "consumer_blob_digest",
      reason: "invalid-consumer-principal",
    });
  });

  test("verifies principal timestamps and consumer Session ownership scope", () => {
    makeRoot("verifier-scope");
    const workspace = createWorkspace({ slug: "owner", name: "Owner" });
    const otherWorkspace = createWorkspace({ slug: "other", name: "Other" });
    const foreignProject = createProject({
      workspaceId: otherWorkspace.id,
      slug: "foreign",
      name: "Foreign",
    });
    const db = openDomainDb();
    db.exec("DROP TRIGGER agent_sessions_project_scope_insert");
    const invalidTimestamp = db.prepare(
      `INSERT INTO consumer_principals
       (id, namespace, identity_digest, created_at)
       VALUES ('consumer_time', 'time', ?, 1.5)`,
    );
    expect(() => invalidTimestamp.run("c".repeat(64))).toThrow(/constraint/i);
    db.exec("PRAGMA ignore_check_constraints = ON");
    invalidTimestamp.run("c".repeat(64));
    db.exec("PRAGMA ignore_check_constraints = OFF");
    db.prepare(
      `INSERT INTO consumer_principals
       (id, namespace, identity_digest, created_at)
       VALUES ('consumer_scope', 'scope', ?, 1)`,
    ).run("d".repeat(64));
    db.prepare(
      `INSERT INTO agent_sessions
       (id, workspace_id, project_id, agent, consumer_principal_id, started_at)
       VALUES ('session_bad_scope', ?, ?, 'consumer:scope', 'consumer_scope', 1)`,
    ).run(workspace.id, foreignProject.id);

    const issues = verifyDomainStore().sessionProvenanceIssues;
    expect(issues).toContainEqual({
      entityType: "consumer-principal",
      entityId: "consumer_time",
      reason: "invalid-consumer-principal",
    });
    expect(issues).toContainEqual({
      entityType: "agent-session",
      entityId: "session_bad_scope",
      reason: "consumer-session-ownership-mismatch",
    });
  });

  test("guards consumer Session timestamps in direct SQL", () => {
    const root = makeRoot("session-timestamps");
    const farm = installFarmConsumer(root);
    const workspace = createWorkspace({ slug: "time", name: "Time" });
    const db = openDomainDb();
    db.exec("DROP TRIGGER agent_sessions_open_insert");
    expect(() =>
      db.prepare(
        `INSERT INTO agent_sessions
         (id, workspace_id, agent, consumer_principal_id, started_at)
         VALUES ('session_fractional', ?, 'consumer:farm', ?, 1.5)`,
      ).run(workspace.id, farm.identity.consumerId),
    ).toThrow(/constraint/i);
    expect(() =>
      db.prepare(
        `INSERT INTO agent_sessions
         (id, workspace_id, agent, consumer_principal_id, started_at, ended_at)
         VALUES ('session_ended_max', ?, 'consumer:farm', ?, 1, 9007199254740992)`,
      ).run(workspace.id, farm.identity.consumerId),
    ).toThrow(/constraint/i);

  });

  test("routes bypassed consumer Session timestamps through provenance", () => {
    const root = makeRoot("session-timestamps-verifier");
    const farm = installFarmConsumer(root);
    const workspace = createWorkspace({ slug: "time", name: "Time" });
    const db = openDomainDb();
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare(
      `INSERT INTO agent_sessions
       (id, workspace_id, agent, consumer_principal_id, started_at)
       VALUES ('session_fractional', ?, 'consumer:farm', ?, 1.5)`,
    ).run(workspace.id, farm.identity.consumerId);
    db.exec("PRAGMA ignore_check_constraints = OFF");
    expect(verifyDomainStore().sessionProvenanceIssues).toContainEqual({
      entityType: "agent-session",
      entityId: "session_fractional",
      reason: "consumer-session-ownership-mismatch",
    });
  });

  test("rolls back a consumer Session when ownership registration fails", () => {
    const root = makeRoot("session-registration-rollback");
    const farm = installFarmConsumer(root);
    const workspace = createWorkspace({ slug: "rollback", name: "Rollback" });
    const db = openDomainDb();
    db.exec(
      `CREATE TRIGGER inject_consumer_registration_failure
       AFTER INSERT ON agent_sessions
       WHEN NEW.consumer_principal_id IS NOT NULL
       BEGIN
         UPDATE consumer_principals
         SET disabled_at = NEW.started_at
         WHERE id = NEW.consumer_principal_id;
       END`,
    );

    expect(() =>
      startConsumerSession(farm.authority, { workspaceId: workspace.id }),
    ).toThrow("Consumer authority is not live");
    expect(
      db.query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM agent_sessions WHERE consumer_principal_id IS NOT NULL",
      ).get()!.count,
    ).toBe(0);
    expect(
      db.query<{ disabledAt: number | null }, [string]>(
        "SELECT disabled_at AS disabledAt FROM consumer_principals WHERE id = ?",
      ).get(farm.identity.consumerId)!.disabledAt,
    ).toBeNull();

    db.exec("DROP TRIGGER inject_consumer_registration_failure");
    const session = startConsumerSession(farm.authority, {
      workspaceId: workspace.id,
    });
    expect(endConsumerSession(farm.authority, session.id).endedAt).toBeNumber();
  });

  test("removes Session membership when transaction commit fails", () => {
    const root = makeRoot("session-registration-commit-failure");
    const farm = installFarmConsumer(root);
    const workspace = createWorkspace({ slug: "commit-failure", name: "Commit Failure" });
    const db = openDomainDb();
    db.exec(
      `CREATE TABLE injected_commit_parent (id TEXT PRIMARY KEY);
       CREATE TABLE injected_commit_child (
         parent_id TEXT REFERENCES injected_commit_parent(id)
           DEFERRABLE INITIALLY DEFERRED
       );
       CREATE TRIGGER inject_consumer_commit_failure
       AFTER INSERT ON agent_sessions
       WHEN NEW.consumer_principal_id IS NOT NULL
       BEGIN
         INSERT INTO injected_commit_child (parent_id) VALUES ('missing');
       END`,
    );

    const mutableDb = db as unknown as { prepare: typeof db.prepare };
    const originalPrepare = mutableDb.prepare;
    let failedSessionId: string | null = null;
    mutableDb.prepare = ((query: string) => {
      const statement = originalPrepare.call(db, query);
      if (!query.includes("INSERT INTO agent_sessions")) return statement;
      const originalRun = statement.run.bind(statement);
      statement.run = ((...values: Parameters<typeof statement.run>) => {
        failedSessionId = String(values[0]);
        return originalRun(...values);
      }) as typeof statement.run;
      return statement;
    }) as typeof db.prepare;
    try {
      expect(() =>
        startConsumerSession(farm.authority, { workspaceId: workspace.id }),
      ).toThrow(/foreign key/i);
    } finally {
      mutableDb.prepare = originalPrepare;
    }
    expect(failedSessionId).not.toBeNull();
    expect(
      db.query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM agent_sessions WHERE id = ?",
      ).get(failedSessionId!)!.count,
    ).toBe(0);

    db.exec("DROP TRIGGER inject_consumer_commit_failure");
    db.prepare(
      `INSERT INTO agent_sessions
       (id, workspace_id, agent, consumer_principal_id, started_at)
       VALUES (?, ?, 'consumer:farm', ?, ?)`,
    ).run(
      failedSessionId!,
      workspace.id,
      farm.identity.consumerId,
      Date.now(),
    );
    expect(() =>
      endConsumerSession(farm.authority, failedSessionId!),
    ).toThrow("Consumer Session is not owned by this authority");
  });
});

function rootPath(root: TmpRoot): string {
  return path.join(root.dir, ".ralphy");
}
