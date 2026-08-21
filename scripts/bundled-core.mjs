import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

export const APPROVED_CORE_SOURCE = "/Users/maximovchinnikov/github/ralphy/ralphy-desktop/release/Ralphy Media.app/Contents/Resources/bin/ralphy";
export const APPROVED_CORE_VERSION = "0.3.0";
export const APPROVED_CORE_SHA256 = "a843e2805b4b0a49d02f7afe46cdd5693d81184c14d560af836be93283d85679";

export async function validateCoreSource(path) {
  const metadata = await lstat(path);
  if (!metadata.isFile()) throw new Error(`Core source is not a regular file: ${path}`);
  await access(path, constants.X_OK);
}

export async function sha256File(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

export async function readApprovedCoreBytes(path = APPROVED_CORE_SOURCE) {
  await validateCoreSource(path);
  const [bytes, sha256, version] = await Promise.all([
    readFile(path),
    sha256File(path),
    Promise.resolve(execFileSync(path, ["--version"], { encoding: "utf8" }).trim()),
  ]);
  if (version !== APPROVED_CORE_VERSION || sha256 !== APPROVED_CORE_SHA256) {
    throw new Error(`Unapproved Ralphy Core: expected ${APPROVED_CORE_VERSION}/${APPROVED_CORE_SHA256}, received ${version}/${sha256}`);
  }
  return bytes;
}

export async function verifyPackagedCore(appPath) {
  const resources = join(resolve(appPath), "Contents/Resources");
  const core = join(resources, "bin/ralphy");
  const manifest = JSON.parse(await readFile(join(resources, "ralphy-core.json"), "utf8"));
  await validateCoreSource(core);
  const version = execFileSync(core, ["--version"], { encoding: "utf8" }).trim();
  const sha256 = await sha256File(core);
  if (version !== APPROVED_CORE_VERSION || sha256 !== APPROVED_CORE_SHA256
    || manifest.version !== APPROVED_CORE_VERSION || manifest.sha256 !== APPROVED_CORE_SHA256) {
    throw new Error("Packaged Ralphy Core does not match the approved 0.3.0 pin");
  }
  return { core, version, sha256 };
}

if (process.argv[1] === new URL(import.meta.url).pathname && process.argv[2] === "--verify-packaged") {
  const result = await verifyPackagedCore(process.argv[3]);
  console.log(`BUNDLED_CORE_OK ${result.version} ${result.sha256}`);
}
