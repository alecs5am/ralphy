import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const ARCHIVE_PATH = "/Users/maximovchinnikov/Downloads/Ralphy дизайн система (11).zip";
const HANDOFF_DIRECTORY = "design_handoff_instrument";
const HANDOFF_HTML = "Ralphy Instrument System.dc.html";

export const REFERENCE_SHA256 = "fe371e93e3d778bbd9d7e5621d200ff4298e386edbbc20d3e971941c004c0804";
export const EVIDENCE_ROOT = resolve(".superpowers/sdd/nothing-instrument");
export const REFERENCE_ROOT = join(EVIDENCE_ROOT, "reference", HANDOFF_DIRECTORY);

function isInside(root, path) {
  const pathFromRoot = relative(root, path);
  return pathFromRoot !== "" && !pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !pathFromRoot.startsWith(sep);
}

async function sha256(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

async function run(command) {
  if (globalThis.Bun) {
    const process = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const [exitCode, stderr] = await Promise.all([process.exited, new Response(process.stderr).text()]);
    if (exitCode !== 0) throw new Error(`${command[0]} failed: ${stderr.trim()}`);
    return new Response(process.stdout).text();
  }

  const { spawn } = await import("node:child_process");
  return new Promise((resolveOutput, reject) => {
    const process = spawn(command[0], command.slice(1));
    let stdout = "";
    let stderr = "";
    process.stdout.on("data", (chunk) => { stdout += chunk; });
    process.stderr.on("data", (chunk) => { stderr += chunk; });
    process.on("error", reject);
    process.on("close", (exitCode) => {
      if (exitCode !== 0) reject(new Error(`${command[0]} failed: ${stderr.trim()}`));
      else resolveOutput(stdout);
    });
  });
}

async function archiveEntries() {
  const output = await run(["unzip", "-Z1", ARCHIVE_PATH]);
  const entries = output.split("\n").filter(Boolean);
  if (entries.length === 0) throw new Error("Instrument handoff archive is empty");

  for (const entry of entries) {
    if (!entry.startsWith(`${HANDOFF_DIRECTORY}/`) || entry.includes("../") || entry.startsWith("/")) {
      throw new Error(`Instrument handoff archive has unsafe entry: ${entry}`);
    }
  }
  return entries.filter((entry) => !entry.endsWith("/"));
}

async function assertRegularFile(path, label) {
  const metadata = await lstat(path);
  if (!metadata.isFile()) throw new Error(`${label} is not a regular file: ${path}`);
}

async function assertExtractedTree(entries) {
  const expectedPaths = new Set(entries.map((entry) => resolve(join(EVIDENCE_ROOT, "reference", entry))));
  for (const path of expectedPaths) {
    if (!isInside(EVIDENCE_ROOT, path)) throw new Error(`Archive entry escaped evidence root: ${path}`);
    await assertRegularFile(path, "Extracted handoff entry");
  }

  const stack = [REFERENCE_ROOT];
  while (stack.length > 0) {
    const directory = stack.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (!isInside(EVIDENCE_ROOT, resolve(path)) || !isInside(REFERENCE_ROOT, resolve(path))) {
        throw new Error(`Extraction escaped reference root: ${path}`);
      }
      if (entry.isSymbolicLink()) throw new Error(`Extraction contains a symlink: ${path}`);
      if (entry.isDirectory()) stack.push(path);
      else if (!entry.isFile()) throw new Error(`Extraction contains an unsupported entry: ${path}`);
    }
  }
}

async function assertReference(entries) {
  await assertRegularFile(join(REFERENCE_ROOT, "README.md"), "Instrument README");
  await assertRegularFile(join(REFERENCE_ROOT, "design-v2.md"), "Instrument v2 design");
  const htmlPath = join(REFERENCE_ROOT, HANDOFF_HTML);
  await assertRegularFile(htmlPath, "Instrument HTML reference");
  const html = await readFile(htmlPath, "utf8");
  for (const section of ["3a", "3b"]) {
    if (!html.includes(`href=\"#${section}\"`) || !html.includes(`id: dark ? \"3b\" : \"3a\"`)) {
      throw new Error(`Instrument HTML is missing rendered section ${section}`);
    }
  }

  const mediaAssets = entries.filter((entry) => entry.startsWith(`${HANDOFF_DIRECTORY}/uploads/media-assets/`));
  if (mediaAssets.length === 0) throw new Error("Instrument handoff has no local media assets");
  await assertExtractedTree(entries);
  return {
    readme: join(REFERENCE_ROOT, "README.md"),
    mediaSections: ["3a", "3b"],
    localMediaAssets: mediaAssets.map((entry) => join(EVIDENCE_ROOT, "reference", entry)),
  };
}

async function directoryEntries(path) {
  try {
    return await readdir(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function prepareInstrumentEvidence() {
  await assertRegularFile(ARCHIVE_PATH, "Instrument handoff archive");
  const actualHash = await sha256(ARCHIVE_PATH);
  if (actualHash !== REFERENCE_SHA256) {
    throw new Error(`Instrument handoff hash mismatch: expected ${REFERENCE_SHA256}, received ${actualHash}`);
  }

  const entries = await archiveEntries();
  const referenceParent = dirname(REFERENCE_ROOT);
  await mkdir(EVIDENCE_ROOT, { recursive: true });
  const existingReference = await directoryEntries(REFERENCE_ROOT);
  if (existingReference !== null) {
    if (existingReference.length === 0) throw new Error(`Refusing empty pre-existing reference directory: ${REFERENCE_ROOT}`);
    try {
      return await assertReference(entries);
    } catch (error) {
      throw new Error(`Refusing non-empty mismatched reference directory: ${REFERENCE_ROOT}`, { cause: error });
    }
  }

  const parentEntries = await directoryEntries(referenceParent);
  if (parentEntries !== null && parentEntries.length > 0) {
    throw new Error(`Refusing non-empty reference parent directory: ${referenceParent}`);
  }
  await mkdir(referenceParent, { recursive: true });
  await run(["ditto", "-x", "-k", ARCHIVE_PATH, referenceParent]);
  return assertReference(entries);
}

if (import.meta.main) {
  await prepareInstrumentEvidence();
  console.log(REFERENCE_ROOT);
}
