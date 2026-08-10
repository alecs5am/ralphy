import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import {
  createSecretStore,
  type KeyProvider,
} from "../../cli/lib/store/secrets.js";
import { startRun } from "../../cli/lib/store/runs.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const FIXED_KEY = Buffer.alloc(32, 7);
const SECRET = "needle-secret-value";

let root: TmpRoot | null = null;

afterEach(() => {
  closeDomainDb();
  root?.cleanup();
  root = null;
});

function fixture(keyProvider: KeyProvider = fixedKeyProvider()) {
  root = makeTmpRoot("ralphy-secret-store");
  openDomainDb();
  const dataRoot = path.join(root.dir, ".ralphy");
  return { dataRoot, store: createSecretStore({ dataRoot, keyProvider }) };
}

function fixedKeyProvider(): KeyProvider {
  return {
    lookupKey: async () => FIXED_KEY,
    createKey: async () => FIXED_KEY,
  };
}

describe("root-bound encrypted secret store", () => {
  const macKeychainTest = process.platform === "darwin" ? test : test.skip;

  macKeychainTest("persists a newly created native keychain key", async () => {
    const { dataRoot } = fixture();
    const storeId = openDomainDb()
      .query<{ storeId: string }, []>(
        "SELECT store_id AS storeId FROM store_metadata WHERE singleton = 1",
      )
      .get()!.storeId;
    const service = `ralphy-domain-store-key:${storeId}`;

    try {
      const store = createSecretStore({ dataRoot });
      await store.set("provider/openrouter", SECRET);

      expect(await createSecretStore({ dataRoot }).read("provider/openrouter")).toBe(SECRET);
    } finally {
      const cleanup = Bun.spawn({
        cmd: [
          "/usr/bin/security",
          "delete-generic-password",
          "-s",
          service,
          "-a",
          "ralphy",
        ],
        stdout: "ignore",
        stderr: "ignore",
      });
      await cleanup.exited;
    }
  });

  test("rejects a relative data root even when it resolves to a valid store", () => {
    const { dataRoot } = fixture();
    const relativeRoot = path.relative(process.cwd(), dataRoot);

    expect(path.isAbsolute(relativeRoot)).toBe(false);
    expect(() =>
      createSecretStore({ dataRoot: relativeRoot, keyProvider: fixedKeyProvider() }),
    ).toThrow(expect.objectContaining({ code: "E_SECRET_STORE" }));
  });

  test("encrypts text values and supports set, read, has, and delete", async () => {
    const { dataRoot, store } = fixture();

    await store.set("provider/openrouter", SECRET);
    expect(await store.has("provider/openrouter")).toBe(true);
    expect(await store.read("provider/openrouter")).toBe(SECRET);

    const envelopeText = fs.readFileSync(path.join(dataRoot, "secrets.enc"), "utf8");
    expect(envelopeText).not.toContain(SECRET);
    expect(Object.keys(JSON.parse(envelopeText)).sort()).toEqual([
      "ciphertext",
      "iv",
      "tag",
      "version",
    ]);
    expect(fs.statSync(path.join(dataRoot, "secrets.enc")).mode & 0o777).toBe(0o600);

    await store.delete("provider/openrouter");
    expect(await store.has("provider/openrouter")).toBe(false);
    expect(await store.read("provider/openrouter")).toBeNull();
  });

  test("rejects invalid typed refs before every operation", async () => {
    const { store } = fixture();
    const invalid = [
      "",
      " ",
      "/provider/openrouter",
      "provider",
      "provider/../openrouter",
      "provider/open\0router",
      "unknown/openrouter",
      `provider/${"x".repeat(513)}`,
    ];

    for (const ref of invalid) {
      const operations = [
        () => store.set(ref, SECRET),
        () => store.read(ref),
        () => store.has(ref),
        () => store.delete(ref),
        () => store.setSecretFile(ref, Buffer.from(SECRET)),
        () => store.materializeSecretFile(ref, "run_123"),
      ];
      for (const operation of operations) {
        await expect(operation()).rejects.toMatchObject({ code: "E_SECRET_STORE" });
      }
    }
    expect(fs.existsSync(path.join(path.dirname(openDomainDb().filename), "secrets.enc"))).toBe(
      false,
    );
  });

  test("maps corrupt ciphertext and a missing existing key to safe errors", async () => {
    let createCalls = 0;
    const provider: KeyProvider = {
      lookupKey: async () => FIXED_KEY,
      createKey: async () => {
        createCalls += 1;
        return FIXED_KEY;
      },
    };
    const { dataRoot, store } = fixture(provider);
    await store.set("provider/openrouter", SECRET);
    const envelopePath = path.join(dataRoot, "secrets.enc");
    const envelope = JSON.parse(fs.readFileSync(envelopePath, "utf8"));
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    fs.writeFileSync(envelopePath, JSON.stringify(envelope), { mode: 0o600 });

    const corrupt = await store.read("provider/openrouter").catch((error) => error);
    expect(corrupt).toMatchObject({ code: "E_SECRET_STORE" });
    expect(String(corrupt)).not.toContain(SECRET);
    expect(String(corrupt)).not.toContain(dataRoot);

    const missingKeyStore = createSecretStore({
      dataRoot,
      keyProvider: {
        lookupKey: async () => null,
        createKey: async () => {
          createCalls += 1;
          return FIXED_KEY;
        },
      },
    });
    const missing = await missingKeyStore
      .read("provider/openrouter")
      .catch((error) => error);
    expect(missing).toMatchObject({ code: "E_SECRET_STORE" });
    expect(String(missing)).not.toContain(SECRET);
    expect(String(missing)).not.toContain(dataRoot);
    expect(createCalls).toBe(0);
  });

  test("rejects keys that are not exactly 32 bytes", async () => {
    for (const length of [31, 33]) {
      const { dataRoot, store } = fixture({
        lookupKey: async () => null,
        createKey: async () => Buffer.alloc(length),
      });
      await expect(store.set("provider/openrouter", SECRET)).rejects.toMatchObject({
        code: "E_SECRET_STORE",
      });
      expect(fs.existsSync(path.join(dataRoot, "secrets.enc"))).toBe(false);
      closeDomainDb();
      root?.cleanup();
      root = null;
    }
  });

  test("preserves concurrent text and file mutations across store instances", async () => {
    const { dataRoot, store } = fixture();
    const second = createSecretStore({ dataRoot, keyProvider: fixedKeyProvider() });

    await Promise.all([
      store.set("provider/alpha", "alpha-value"),
      second.set("provider/beta", "beta-value"),
      store.setSecretFile("provider/alpha-file", Buffer.from("alpha-file")),
      second.setSecretFile("provider/beta-file", Buffer.from("beta-file")),
    ]);

    expect(await store.read("provider/alpha")).toBe("alpha-value");
    expect(await store.read("provider/beta")).toBe("beta-value");
    expect(await store.has("provider/alpha-file")).toBe(true);
    expect(await store.has("provider/beta-file")).toBe(true);
    const alphaRun = startRun({ kind: "migration", label: "alpha-file" });
    const betaRun = startRun({ kind: "migration", label: "beta-file" });
    const alphaFile = path.join(
      dataRoot,
      await store.materializeSecretFile("provider/alpha-file", alphaRun.id),
    );
    const betaFile = path.join(
      dataRoot,
      await store.materializeSecretFile("provider/beta-file", betaRun.id),
    );
    expect(fs.readFileSync(alphaFile, "utf8")).toBe("alpha-file");
    expect(fs.readFileSync(betaFile, "utf8")).toBe("beta-file");
  });

  test("preserves independent-process mutations", async () => {
    const { dataRoot, store } = fixture();
    await store.set("provider/seed", "seed-value");
    const modulePath = path.join(process.cwd(), "cli/lib/store/secrets.ts");
    const workerSource = `
      import { createSecretStore } from ${JSON.stringify(modulePath)};
      const dataRoot = process.env.RALPHY_SECRET_TEST_ROOT;
      const ref = process.env.RALPHY_SECRET_TEST_REF;
      if (!dataRoot || !ref) throw new Error("missing worker input");
      const keyProvider = {
        lookupKey: async () => Buffer.alloc(32, 7),
        createKey: async () => Buffer.alloc(32, 7),
      };
      await createSecretStore({ dataRoot, keyProvider }).set(ref, ref);
    `;
    const workers = ["provider/process-a", "provider/process-b"].map((ref) =>
      Bun.spawn({
        cmd: ["bun", "-e", workerSource],
        cwd: process.cwd(),
        env: {
          ...process.env,
          RALPHY_SECRET_TEST_ROOT: dataRoot,
          RALPHY_SECRET_TEST_REF: ref,
        },
        stdout: "pipe",
        stderr: "pipe",
      }),
    );
    const statuses = await Promise.all(workers.map((worker) => worker.exited));
    const stderr = await Promise.all(
      workers.map((worker) => new Response(worker.stderr).text()),
    );

    expect({ statuses, stderr }).toEqual({ statuses: [0, 0], stderr: ["", ""] });
    expect(await store.read("provider/seed")).toBe("seed-value");
    expect(await store.read("provider/process-a")).toBe("provider/process-a");
    expect(await store.read("provider/process-b")).toBe("provider/process-b");
  });

  test("keeps ciphertext readable when the data root is renamed", async () => {
    const seenStoreIds: string[] = [];
    const provider: KeyProvider = {
      lookupKey: async (storeId) => {
        seenStoreIds.push(storeId);
        return FIXED_KEY;
      },
      createKey: async (storeId) => {
        seenStoreIds.push(storeId);
        return FIXED_KEY;
      },
    };
    const { dataRoot, store } = fixture(provider);
    await store.set("provider/openrouter", SECRET);
    closeDomainDb();
    const renamedRoot = path.join(root!.dir, "renamed-data-root");
    fs.renameSync(dataRoot, renamedRoot);

    const renamed = createSecretStore({ dataRoot: renamedRoot, keyProvider: provider });
    expect(await renamed.read("provider/openrouter")).toBe(SECRET);
    expect(new Set(seenStoreIds).size).toBe(1);
  });
});
