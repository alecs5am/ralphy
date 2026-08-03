import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  createCredentialResolver,
  credentialSecretRef,
  POSTIZ_CREDENTIAL,
  safeChildEnvironment,
} from "../../cli/lib/providers/credentials.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import {
  createWorkspace,
  getSocialAccountCredentialState,
  upsertSocialAccount,
  updateSocialAccountCredential,
} from "../../cli/lib/store/scopes.js";
import {
  createSecretStore,
  type KeyProvider,
} from "../../cli/lib/store/secrets.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const FIXED_KEY = Buffer.alloc(32, 29);
const SET_VALUES = [
  "task-2b-concurrent-set-alpha",
  "task-2b-concurrent-set-beta",
] as const;
const CLEAR_VALUE = "task-2b-concurrent-clear-seed";

let roots: TmpRoot[] = [];

afterEach(() => {
  closeDomainDb();
  for (const root of roots) root.cleanup();
  roots = [];
});

describe("account credential concurrency", () => {
  test("two processes setting one row version leave exactly the winner secret", async () => {
    const fixture = createFixture();
    const results = await runRace(fixture, "set", 1, [...SET_VALUES]);

    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(results.find((result) => !result.ok)?.code).toBe("E_CONFLICT");
    expect(getSocialAccountCredentialState(fixture)).toMatchObject({
      relinkRequired: false,
      rowVersion: 2,
    });
    const stored = await fixture.secretStore.read(fixture.ref);
    expect(stored).not.toBeNull();
    expect(SET_VALUES.map(hash)).toContain(hash(stored!));
  });

  test("two processes clearing one row version leave a safely missing account", async () => {
    const fixture = createFixture();
    await fixture.secretStore.set(fixture.ref, CLEAR_VALUE);
    updateSocialAccountCredential({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
      credentialRef: fixture.ref,
      expectedRowVersion: 1,
    });

    const results = await runRace(fixture, "clear", 2, ["", ""]);

    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(results.find((result) => !result.ok)?.code).toBe("E_CONFLICT");
    expect(getSocialAccountCredentialState(fixture)).toEqual({
      credentialRef: null,
      relinkRequired: false,
      rowVersion: 3,
    });
    expect(await fixture.secretStore.read(fixture.ref)).toBeNull();
  });

  test("failed set restores both the account row and encrypted envelope", async () => {
    const fixture = createFixture();
    const resolver = failingResolver(fixture);

    const error = await resolver
      .set("postiz", SET_VALUES[0], {
        accountId: fixture.accountId,
        expectedRowVersion: 1,
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "E_SECRET_STORE" });
    expect(getSocialAccountCredentialState(fixture)).toEqual({
      credentialRef: null,
      relinkRequired: false,
      rowVersion: 1,
    });
    expect(await fixture.secretStore.read(fixture.ref)).toBeNull();
  });

  test("failed clear restores both the account row and encrypted envelope", async () => {
    const fixture = createFixture();
    await fixture.secretStore.set(fixture.ref, CLEAR_VALUE);
    updateSocialAccountCredential({
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountId,
      credentialRef: fixture.ref,
      expectedRowVersion: 1,
    });
    const resolver = failingResolver(fixture);

    const error = await resolver
      .clear("postiz", {
        accountId: fixture.accountId,
        expectedRowVersion: 2,
      })
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ code: "E_SECRET_STORE" });
    expect(getSocialAccountCredentialState(fixture)).toEqual({
      credentialRef: fixture.ref,
      relinkRequired: false,
      rowVersion: 2,
    });
    const stored = await fixture.secretStore.read(fixture.ref);
    expect(stored).not.toBeNull();
    expect(hash(stored!)).toBe(hash(CLEAR_VALUE));
  });
});

type Fixture = {
  root: TmpRoot;
  dataRoot: string;
  workspaceId: string;
  accountId: string;
  ref: string;
  secretStore: ReturnType<typeof createSecretStore>;
};

function createFixture(): Fixture {
  const root = makeTmpRoot("ralphy-account-credential-race");
  roots.push(root);
  const workspace = createWorkspace({
    slug: `credential-race-${crypto.randomUUID()}`,
    name: "Credential race",
  });
  const account = upsertSocialAccount({
    workspaceId: workspace.id,
    platform: "postiz",
    externalId: crypto.randomUUID(),
  });
  const dataRoot = path.join(root.dir, ".ralphy");
  const ref = credentialSecretRef("postiz", {
    kind: "scope",
    workspaceId: workspace.id,
    accountId: account.id,
  });
  const secretStore = createSecretStore({
    dataRoot,
    keyProvider: fixedKeyProvider(),
  });
  return {
    root,
    dataRoot,
    workspaceId: workspace.id,
    accountId: account.id,
    ref,
    secretStore,
  };
}

function failingResolver(fixture: Fixture) {
  return createCredentialResolver({
    dataRoot: fixture.dataRoot,
    context: { kind: "scope", workspaceId: fixture.workspaceId },
    secretStore: createSecretStore({
      dataRoot: fixture.dataRoot,
      keyProvider: fixedKeyProvider(),
      commitMutation: () => {
        throw new Error("injected commit failure");
      },
    }),
    descriptors: [POSTIZ_CREDENTIAL],
    capturedEnvironment: new Map(),
  });
}

async function runRace(
  fixture: Fixture,
  operation: "set" | "clear",
  expectedRowVersion: number,
  values: [string, string],
): Promise<Array<{ ok: boolean; code?: string }>> {
  closeDomainDb();
  const releasePath = path.join(fixture.root.dir, `${crypto.randomUUID()}.release`);
  const readyPaths = values.map((_, index) =>
    path.join(fixture.root.dir, `${crypto.randomUUID()}-${index}.ready`),
  );
  const workerSource = accountWorkerSource();
  const workers = readyPaths.map((readyPath, index) => {
    const child = Bun.spawn({
      cmd: ["bun", "--no-env-file", "-e", workerSource],
      cwd: process.cwd(),
      env: {
        ...safeChildEnvironment({ inherited: process.env }),
        RALPHY_TEST_ROOT: fixture.root.dir,
        RALPHY_TEST_DATA_ROOT: fixture.dataRoot,
        RALPHY_TEST_WORKSPACE: fixture.workspaceId,
        RALPHY_TEST_ACCOUNT: fixture.accountId,
        RALPHY_TEST_EXPECTED_VERSION: String(expectedRowVersion),
        RALPHY_TEST_OPERATION: operation,
        RALPHY_TEST_READY: readyPath,
        RALPHY_TEST_RELEASE: releasePath,
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    child.stdin.write(values[index]!);
    child.stdin.end();
    return child;
  });

  try {
    const deadline = Date.now() + 3_000;
    while (!readyPaths.every(fs.existsSync)) {
      if (Date.now() >= deadline) throw new Error("credential workers missed barrier");
      await Bun.sleep(5);
    }
    fs.writeFileSync(releasePath, "release");
    return await Promise.all(
      workers.map(async (worker) => {
        const [exitCode, stdout, stderr] = await Promise.all([
          worker.exited,
          new Response(worker.stdout).text(),
          new Response(worker.stderr).text(),
        ]);
        if (exitCode !== 0) throw new Error(`credential worker failed: ${stderr}`);
        return JSON.parse(stdout.trim()) as { ok: boolean; code?: string };
      }),
    );
  } finally {
    for (const worker of workers) {
      if (worker.exitCode === null) worker.kill();
    }
    await Promise.all(workers.map((worker) => worker.exited));
  }
}

function accountWorkerSource(): string {
  const credentialsPath = path.join(
    process.cwd(),
    "cli/lib/providers/credentials.ts",
  );
  const pathsPath = path.join(process.cwd(), "cli/lib/paths.ts");
  const secretsPath = path.join(process.cwd(), "cli/lib/store/secrets.ts");
  return `
    import fs from "node:fs";
    import { createCredentialResolver, POSTIZ_CREDENTIAL } from ${JSON.stringify(credentialsPath)};
    import { setRoot } from ${JSON.stringify(pathsPath)};
    import { createSecretStore } from ${JSON.stringify(secretsPath)};

    const root = process.env.RALPHY_TEST_ROOT;
    const dataRoot = process.env.RALPHY_TEST_DATA_ROOT;
    const workspaceId = process.env.RALPHY_TEST_WORKSPACE;
    const accountId = process.env.RALPHY_TEST_ACCOUNT;
    const operation = process.env.RALPHY_TEST_OPERATION;
    const readyPath = process.env.RALPHY_TEST_READY;
    const releasePath = process.env.RALPHY_TEST_RELEASE;
    const expectedRowVersion = Number(process.env.RALPHY_TEST_EXPECTED_VERSION);
    if (!root || !dataRoot || !workspaceId || !accountId || !operation ||
        !readyPath || !releasePath || !Number.isSafeInteger(expectedRowVersion)) {
      throw new Error("missing credential race fixture");
    }
    setRoot(root);
    const secretStore = createSecretStore({
      dataRoot,
      keyProvider: {
        lookupKey: async () => Buffer.alloc(32, 29),
        createKey: async () => Buffer.alloc(32, 29),
      },
    });
    const resolver = createCredentialResolver({
      dataRoot,
      context: { kind: "scope", workspaceId },
      secretStore,
      descriptors: [POSTIZ_CREDENTIAL],
      capturedEnvironment: new Map(),
    });
    const value = (await new Response(Bun.stdin.stream()).text()).trim();
    fs.writeFileSync(readyPath, "ready");
    const wait = new Int32Array(new SharedArrayBuffer(4));
    while (!fs.existsSync(releasePath)) Atomics.wait(wait, 0, 0, 10);
    try {
      const target = { accountId, expectedRowVersion };
      if (operation === "set") await resolver.set("postiz", value, target);
      else await resolver.clear("postiz", target);
      console.log(JSON.stringify({ ok: true }));
    } catch (error) {
      console.log(JSON.stringify({
        ok: false,
        code: error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "E_UNKNOWN",
      }));
    }
  `;
}

function fixedKeyProvider(): KeyProvider {
  return {
    lookupKey: async () => FIXED_KEY,
    createKey: async () => FIXED_KEY,
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
