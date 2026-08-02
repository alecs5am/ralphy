import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  consumerCredentialDigest,
  decodeConsumerToken,
  farmIdentityDigest,
  parseFarmIdentity,
  serializeFarmIdentity,
  type FarmIdentityV1,
} from "../../cli/lib/store/consumers.js";

const GOLDEN_PATH = "npm/contracts/farm-identity-v1.golden.json";

type Golden = {
  version: 1;
  tokenHex: string;
  identity: string;
  credentialDigest: string;
  identityDigest: string;
};

function readGolden(file = GOLDEN_PATH): Golden {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Golden;
}

let temporaries: string[] = [];

afterEach(() => {
  for (const dir of temporaries) fs.rmSync(dir, { recursive: true, force: true });
  temporaries = [];
});

function makeTemp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaries.push(dir);
  return dir;
}

describe("farm identity v1 golden contract", () => {
  test("core reproduces both fixed digests from the checked-in bytes", () => {
    const golden = readGolden();
    const identity = parseFarmIdentity(golden.identity);
    expect(identity).toEqual({
      version: 1,
      namespace: "farm",
      storeId: "store_golden_v1",
      consumerId: "consumer_golden_v1",
      migrationId: "migration_golden_v1",
      stageDigest: "1".repeat(64),
      credentialDigest: golden.credentialDigest,
    });
    expect(serializeFarmIdentity(identity)).toBe(golden.identity);
    expect(farmIdentityDigest(golden.identity)).toBe(golden.identityDigest);

    const token = Buffer.from(golden.tokenHex, "hex");
    expect(token.byteLength).toBe(32);
    const tokenBase64url = token.toString("base64url");
    expect(tokenBase64url).toHaveLength(43);
    expect(consumerCredentialDigest(tokenBase64url)).toBe(golden.credentialDigest);
    expect(decodeConsumerToken(tokenBase64url).equals(token)).toBe(true);
  });

  test("rejects reordered keys, whitespace, a trailing newline, or a changed fact", () => {
    const golden = readGolden();
    const identity = parseFarmIdentity(golden.identity);
    const reordered = JSON.stringify({
      namespace: identity.namespace,
      version: identity.version,
      storeId: identity.storeId,
      consumerId: identity.consumerId,
      migrationId: identity.migrationId,
      stageDigest: identity.stageDigest,
      credentialDigest: identity.credentialDigest,
    });
    for (const candidate of [
      reordered,
      JSON.stringify(JSON.parse(golden.identity), null, 2),
      `${golden.identity}\n`,
      ` ${golden.identity}`,
      golden.identity.replace("store_golden_v1", "store other"),
      golden.identity.replace('"version":1', '"version":2'),
      golden.identity.replace('"namespace":"farm"', '"namespace":"other"'),
      golden.identity.replace(golden.credentialDigest, golden.credentialDigest.toUpperCase()),
      golden.identity.replace('"migrationId":"migration_golden_v1",', ""),
      golden.identity.replace("}", ',"extra":1}'),
    ]) {
      expect(() => parseFarmIdentity(candidate)).toThrow(/farm identity/i);
    }
    expect(farmIdentityDigest(reordered)).not.toBe(golden.identityDigest);
  });

  test("rejects a non-canonical or wrong-length consumer token", () => {
    const token = Buffer.from("00".repeat(32), "hex").toString("base64url");
    for (const candidate of [
      `${token}=`,
      token.slice(0, 42),
      `${token}A`,
      token.replace("A", "+"),
      Buffer.alloc(31).toString("base64url"),
    ]) {
      expect(() => decodeConsumerToken(candidate)).toThrow(/consumer token/i);
    }
  });

  test("serializes a freshly generated identity without the golden sample facts", () => {
    const identity: FarmIdentityV1 = {
      version: 1,
      namespace: "farm",
      storeId: "store_runtime",
      consumerId: "consumer_runtime",
      migrationId: "migration_runtime",
      stageDigest: "a".repeat(64),
      credentialDigest: consumerCredentialDigest(
        Buffer.alloc(32, 7).toString("base64url"),
      ),
    };
    const canonical = serializeFarmIdentity(identity);
    expect(parseFarmIdentity(canonical)).toEqual(identity);
    const golden = readGolden();
    expect(canonical).not.toContain("golden");
    expect(farmIdentityDigest(canonical)).not.toBe(golden.identityDigest);
  });

  test("rejects unbounded identifiers and non-hex digests", () => {
    const base: FarmIdentityV1 = parseFarmIdentity(readGolden().identity);
    for (const broken of [
      { ...base, storeId: "" },
      { ...base, storeId: `${"a".repeat(129)}` },
      { ...base, storeId: "-leading-dash" },
      { ...base, consumerId: "has space" },
      { ...base, migrationId: "has/slash" },
      { ...base, stageDigest: "z".repeat(64) },
      { ...base, credentialDigest: "a".repeat(63) },
    ]) {
      expect(() => serializeFarmIdentity(broken)).toThrow(/farm identity/i);
    }
  });
});

describe("published npm contract subpath", () => {
  test("packs the golden into the tarball and resolves the exact subpath", () => {
    const staging = makeTemp("ralphy-pack-");
    const pack = spawnSync("bun", ["pm", "pack", "--destination", staging], {
      cwd: path.resolve("npm"),
      encoding: "utf8",
    });
    expect(pack.status).toBe(0);
    const tarball = fs
      .readdirSync(staging)
      .find((entry) => entry.endsWith(".tgz"));
    expect(tarball).toBeDefined();
    const tarballPath = path.join(staging, tarball!);

    const listed = spawnSync("tar", ["-tf", tarballPath], { encoding: "utf8" });
    expect(listed.status).toBe(0);
    expect(listed.stdout.split("\n")).toContain(
      "package/contracts/farm-identity-v1.golden.json",
    );

    const extracted = makeTemp("ralphy-extract-");
    expect(
      spawnSync("tar", ["-xf", tarballPath, "-C", extracted], {
        encoding: "utf8",
      }).status,
    ).toBe(0);
    const packed = path.join(
      extracted,
      "package/contracts/farm-identity-v1.golden.json",
    );
    expect(fs.readFileSync(packed)).toEqual(fs.readFileSync(GOLDEN_PATH));
    expect(readGolden(packed)).toEqual(readGolden());

    const manifest = JSON.parse(
      fs.readFileSync(path.join(extracted, "package/package.json"), "utf8"),
    ) as { exports: Record<string, string>; bin: Record<string, string> };
    expect(manifest.exports["./contracts/farm-identity-v1.golden.json"]).toBe(
      "./contracts/farm-identity-v1.golden.json",
    );
    expect(manifest.bin.ralphy).toBe("bin/ralphy.js");
    expect(
      fs.existsSync(
        path.join(
          extracted,
          "package",
          manifest.exports["./contracts/farm-identity-v1.golden.json"]!,
        ),
      ),
    ).toBe(true);
  });
});
