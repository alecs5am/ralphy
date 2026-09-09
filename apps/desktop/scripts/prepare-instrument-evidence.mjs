import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const ARCHIVE_PATH = "/Users/maximovchinnikov/Downloads/Ralphy дизайн система (11).zip";
const HANDOFF_DIRECTORY = "design_handoff_instrument";
const HANDOFF_HTML = "Ralphy Instrument System.dc.html";
const HANDOFF_PREFIX = `${HANDOFF_DIRECTORY}/`;

export const REFERENCE_SHA256 = "fe371e93e3d778bbd9d7e5621d200ff4298e386edbbc20d3e971941c004c0804";
export const EVIDENCE_ROOT = resolve(".superpowers/sdd/nothing-instrument");
export const REFERENCE_ROOT = join(EVIDENCE_ROOT, "reference", HANDOFF_DIRECTORY);

function isInside(root, path) {
  const fromRoot = relative(root, path);
  return fromRoot === "" || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !fromRoot.startsWith(sep));
}

function digest(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function lstatOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoSymlinksInPath(path, label) {
  let current = resolve(path);
  while (true) {
    const metadata = await lstatOrNull(current);
    if (metadata?.isSymbolicLink()) throw new Error(`${label} contains a symlink: ${current}`);
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function ensureRealDirectory(path, label) {
  const target = resolve(path);
  await assertNoSymlinksInPath(target, label);
  const missing = [];
  let current = target;
  while (true) {
    const metadata = await lstatOrNull(current);
    if (metadata !== null) {
      if (metadata.isSymbolicLink()) throw new Error(`${label} contains a symlink: ${current}`);
      if (!metadata.isDirectory()) throw new Error(`${label} is not a directory: ${current}`);
      break;
    }
    missing.push(current);
    const parent = dirname(current);
    if (parent === current) throw new Error(`Cannot create ${label}: ${target}`);
    current = parent;
  }
  for (const directory of missing.reverse()) await mkdir(directory);
  const canonical = await realpath(target);
  if (!isInside(await realpath(dirname(target)), canonical)) throw new Error(`${label} escaped its parent: ${target}`);
  return canonical;
}

async function run(command, binary = false) {
  if (globalThis.Bun) {
    const process = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).arrayBuffer(),
      new Response(process.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(`${command[0]} failed: ${stderr.trim()}`);
    const output = Buffer.from(stdout);
    return binary ? output : output.toString("utf8");
  }

  const { spawn } = await import("node:child_process");
  return new Promise((resolveOutput, reject) => {
    const process = spawn(command[0], command.slice(1));
    const chunks = [];
    let stderr = "";
    process.stdout.on("data", (chunk) => chunks.push(chunk));
    process.stderr.on("data", (chunk) => { stderr += chunk; });
    process.on("error", reject);
    process.on("close", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`${command[0]} failed: ${stderr.trim()}`));
      else {
        const output = Buffer.concat(chunks);
        resolveOutput(binary ? output : output.toString("utf8"));
      }
    });
  });
}

async function archiveManifest(archivePath) {
  const output = await run(["unzip", "-Z1", archivePath]);
  const entries = output.split("\n").filter(Boolean).filter((entry) => !entry.endsWith("/"));
  if (entries.length === 0) throw new Error("Instrument handoff archive is empty");

  const manifest = [];
  for (const entry of entries) {
    const relativePath = entry.slice(HANDOFF_PREFIX.length);
    if (!entry.startsWith(HANDOFF_PREFIX) || entry.includes("\\") || relativePath === "" || relativePath.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new Error(`Instrument handoff archive has unsafe entry: ${entry}`);
    }
    const contents = await run(["unzip", "-p", archivePath, entry], true);
    if (contents.length === 0) throw new Error(`Instrument handoff archive has zero-byte entry: ${entry}`);
    manifest.push({ relativePath, sha256: digest(contents), size: contents.length });
  }
  return manifest;
}

async function assertRegularFile(path, label) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) throw new Error(`${label} is a symlink: ${path}`);
  if (!metadata.isFile()) throw new Error(`${label} is not a regular file: ${path}`);
  return metadata;
}

async function extractedFiles(referenceRoot, evidenceRoot) {
  const files = new Map();
  const stack = [{ directory: referenceRoot, relativePath: "" }];
  while (stack.length > 0) {
    const { directory, relativePath } = stack.pop();
    const directoryMetadata = await lstat(directory);
    if (directoryMetadata.isSymbolicLink()) throw new Error(`Extraction contains a symlink: ${directory}`);
    if (!directoryMetadata.isDirectory()) throw new Error(`Extraction path is not a directory: ${directory}`);
    const canonicalDirectory = await realpath(directory);
    if (!isInside(evidenceRoot, canonicalDirectory) || !isInside(referenceRoot, canonicalDirectory)) {
      throw new Error(`Extraction escaped reference root: ${directory}`);
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) throw new Error(`Extraction contains a symlink: ${path}`);
      const canonicalPath = await realpath(path);
      if (!isInside(evidenceRoot, canonicalPath) || !isInside(referenceRoot, canonicalPath)) {
        throw new Error(`Extraction escaped reference root: ${path}`);
      }
      if (metadata.isDirectory()) stack.push({ directory: path, relativePath: entryRelativePath });
      else if (metadata.isFile()) files.set(entryRelativePath, { path, size: metadata.size });
      else throw new Error(`Extraction contains an unsupported entry: ${path}`);
    }
  }
  return files;
}

async function assertReference({ referenceRoot, evidenceRoot, manifest }) {
  const files = await extractedFiles(referenceRoot, evidenceRoot);
  const expected = new Map(manifest.map((entry) => [entry.relativePath, entry]));
  if (files.size !== expected.size || [...files.keys()].some((path) => !expected.has(path))) {
    throw new Error(`Instrument reference manifest does not match archive at ${referenceRoot}`);
  }
  for (const [relativePath, entry] of expected) {
    const extracted = files.get(relativePath);
    if (extracted.size !== entry.size || extracted.size === 0 || await sha256(extracted.path) !== entry.sha256) {
      throw new Error(`Instrument reference file differs from archive: ${relativePath}`);
    }
  }

  await assertRegularFile(join(referenceRoot, "README.md"), "Instrument README");
  await assertRegularFile(join(referenceRoot, "design-v2.md"), "Instrument v2 design");
  const htmlPath = join(referenceRoot, HANDOFF_HTML);
  await assertRegularFile(htmlPath, "Instrument HTML reference");
  const html = await readFile(htmlPath, "utf8");
  for (const section of ["3a", "3b"]) {
    if (!html.includes(`href=\"#${section}\"`) || !html.includes(`id: dark ? \"3b\" : \"3a\"`)) {
      throw new Error(`Instrument HTML is missing rendered section ${section}`);
    }
  }

  const mediaAssets = manifest.filter((entry) => entry.relativePath.startsWith("uploads/media-assets/"));
  if (mediaAssets.length === 0) throw new Error("Instrument handoff has no local media assets");
  return {
    readme: join(referenceRoot, "README.md"),
    mediaSections: ["3a", "3b"],
    localMediaAssets: mediaAssets.map((entry) => join(referenceRoot, entry.relativePath)),
  };
}

async function assertExpectedReferenceParent(referenceParent, referenceRoot) {
  const parentMetadata = await lstatOrNull(referenceParent);
  if (parentMetadata === null) return false;
  if (parentMetadata.isSymbolicLink()) throw new Error(`Reference parent contains a symlink: ${referenceParent}`);
  if (!parentMetadata.isDirectory()) throw new Error(`Reference parent is not a directory: ${referenceParent}`);
  const names = await readdir(referenceParent);
  if (names.length !== 1 || names[0] !== HANDOFF_DIRECTORY) {
    throw new Error(`Refusing unexpected reference parent directory: ${referenceParent}`);
  }
  const rootMetadata = await lstatOrNull(referenceRoot);
  if (rootMetadata === null || rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new Error(`Refusing non-empty mismatched reference directory: ${referenceRoot}`);
  }
  return true;
}

export async function prepareInstrumentEvidence({ archivePath = ARCHIVE_PATH, evidenceRoot = EVIDENCE_ROOT } = {}) {
  await assertRegularFile(archivePath, "Instrument handoff archive");
  const actualHash = await sha256(archivePath);
  if (actualHash !== REFERENCE_SHA256) {
    throw new Error(`Instrument handoff hash mismatch: expected ${REFERENCE_SHA256}, received ${actualHash}`);
  }
  const manifest = await archiveManifest(archivePath);
  const requestedEvidenceRoot = resolve(evidenceRoot);
  const canonicalEvidenceRoot = await ensureRealDirectory(requestedEvidenceRoot, "Evidence root");
  const referenceParent = join(canonicalEvidenceRoot, "reference");
  const referenceRoot = join(referenceParent, HANDOFF_DIRECTORY);

  if (await assertExpectedReferenceParent(referenceParent, referenceRoot)) {
    try {
      const result = await assertReference({ referenceRoot, evidenceRoot: canonicalEvidenceRoot, manifest });
      return {
        ...result,
        readme: join(requestedEvidenceRoot, "reference", HANDOFF_DIRECTORY, "README.md"),
        localMediaAssets: manifest
          .filter((entry) => entry.relativePath.startsWith("uploads/media-assets/"))
          .map((entry) => join(requestedEvidenceRoot, "reference", HANDOFF_DIRECTORY, entry.relativePath)),
      };
    } catch (error) {
      throw new Error(`Refusing non-empty mismatched reference directory: ${referenceRoot}`, { cause: error });
    }
  }

  const stagingParent = await mkdtemp(join(canonicalEvidenceRoot, ".instrument-stage-"));
  const canonicalStagingParent = await realpath(stagingParent);
  if (!isInside(canonicalEvidenceRoot, canonicalStagingParent)) {
    throw new Error(`Staging extraction escaped evidence root: ${stagingParent}`);
  }
  await run(["ditto", "-x", "-k", archivePath, canonicalStagingParent]);
  const stagingRoot = join(canonicalStagingParent, HANDOFF_DIRECTORY);
  await assertReference({ referenceRoot: stagingRoot, evidenceRoot: canonicalEvidenceRoot, manifest });
  const stagingEntries = await readdir(canonicalStagingParent);
  if (stagingEntries.length !== 1 || stagingEntries[0] !== HANDOFF_DIRECTORY) {
    throw new Error(`Staging extraction has unexpected entries: ${canonicalStagingParent}`);
  }
  await rename(canonicalStagingParent, referenceParent);
  const canonicalReferenceRoot = await realpath(referenceRoot);
  if (!isInside(canonicalEvidenceRoot, canonicalReferenceRoot)) {
    throw new Error(`Published reference escaped evidence root: ${referenceRoot}`);
  }
  return {
    ...(await assertReference({ referenceRoot: canonicalReferenceRoot, evidenceRoot: canonicalEvidenceRoot, manifest })),
    readme: join(requestedEvidenceRoot, "reference", HANDOFF_DIRECTORY, "README.md"),
    localMediaAssets: manifest
      .filter((entry) => entry.relativePath.startsWith("uploads/media-assets/"))
      .map((entry) => join(requestedEvidenceRoot, "reference", HANDOFF_DIRECTORY, entry.relativePath)),
  };
}

if (import.meta.main) {
  await prepareInstrumentEvidence();
  console.log(REFERENCE_ROOT);
}
