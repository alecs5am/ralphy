/* Ralphy's routing pack, from this app's bundle into the user's library.
 *
 * A user who downloads only the desktop app has no ugc-cli checkout, so the
 * AGENTS.md router and its playbooks have to travel inside the app. They are
 * vendored into resources/prompt-pack by scripts/vendor-prompt-pack.mjs through
 * the CLI's `prompts export` contract, and installed here on launch -- the
 * block Ralphy writes into the agent's instruction file points at the installed
 * copy, so without this step that routing names paths that do not exist.
 *
 * Idempotent by digest: a reinstall reads and hashes, and writes nothing.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** The manifest the export verb wrote beside the files. */
interface PackManifest {
  packVersion: number;
  cliVersion: string;
  totalBytes: number;
  files: { path: string; bytes: number; sha256: string }[];
}

export interface PackState {
  /** Where the pack lives in the library, whether or not it is installed. */
  root: string;
  installed: boolean;
  cliVersion: string | null;
  files: number;
  bytes: number;
  /** Set when the app carries no vendored pack -- a build mistake, not a user state. */
  unavailable: string | null;
}

const MANIFEST = "manifest.json";

/** The pack inside the app: packaged next to the app's other resources, or in the checkout. */
export function bundledPack(resourcesPath: string, appPath: string, packaged: boolean): string {
  return packaged ? join(resourcesPath, "prompt-pack") : join(appPath, "resources", "prompt-pack");
}

/** Where the pack lands: beside the library's own state, so it moves with the library. */
export function packRoot(libraryRoot: string): string {
  return join(libraryRoot, "prompts");
}

async function manifest(dir: string): Promise<PackManifest | null> {
  const raw = await readFile(join(dir, MANIFEST), "utf8").catch(() => null);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as PackManifest;
    return Array.isArray(value.files) ? value : null;
  } catch {
    return null;
  }
}

export async function readPackState(libraryRoot: string, bundled: string): Promise<PackState> {
  const root = packRoot(libraryRoot);
  const installed = await manifest(root);
  const source = await manifest(bundled);
  return {
    root,
    installed: installed !== null,
    cliVersion: installed?.cliVersion ?? null,
    files: installed?.files.length ?? 0,
    bytes: installed?.totalBytes ?? 0,
    unavailable: source === null ? `No prompt pack in this build at ${bundled}` : null,
  };
}

/**
 * Copy the bundled pack into the library. Returns what the library now holds.
 *
 * A file the bundled manifest no longer lists is removed: a playbook the router
 * stopped naming is worse than a missing one, because nothing tells the agent it
 * is stale.
 */
export async function installPack(libraryRoot: string, bundled: string): Promise<PackState> {
  const source = await manifest(bundled);
  const root = packRoot(libraryRoot);
  if (source === null) return await readPackState(libraryRoot, bundled);

  const before = await manifest(root);
  for (const file of source.files) {
    const target = join(root, file.path);
    const existing = await readFile(target).catch(() => null);
    if (existing !== null && createHash("sha256").update(existing).digest("hex") === file.sha256) continue;
    const body = await readFile(join(bundled, file.path)).catch(() => null);
    if (body === null) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
  const keep = new Set(source.files.map((file) => file.path));
  for (const stale of (before?.files ?? []).map((file) => file.path)) {
    if (!keep.has(stale)) await rm(join(root, stale), { force: true });
  }
  await mkdir(root, { recursive: true });
  await writeFile(join(root, MANIFEST), `${JSON.stringify(source, null, 2)}\n`);
  return await readPackState(libraryRoot, bundled);
}
