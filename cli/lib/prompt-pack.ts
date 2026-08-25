// The routing pack: the AGENTS.md router and every playbook it names, copied
// out of this CLI's own package and into the user's library.
//
// Why this exists: `skill install` writes a block into the agent's instruction
// file that says "read <repo>/AGENTS.md" and "playbooks live under
// docs/playbooks/". Both are repo-relative, and an agent runs in the user's
// home or their project — not in a ugc-cli checkout. On every machine without
// a checkout the routing pointed nowhere, so the router and 71 playbooks sat in
// the repository as dead weight. Installing them under `.ralphy/prompts/`
// with the repo-relative layout intact makes the pack root the `<repo>` the
// router already assumes, so every link inside it resolves unchanged.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import url from "node:url";

import { workspace } from "./paths.js";

export const PACK_VERSION = 1;

/** One file in the pack, as the manifest records it. */
export interface PackFile {
  /** Repo-relative, and therefore also pack-relative. */
  path: string;
  bytes: number;
  sha256: string;
}

export interface PackManifest {
  packVersion: number;
  cliVersion: string;
  installedAt: number;
  /** The checkout or installed package the copy came from. */
  source: string;
  root: string;
  totalBytes: number;
  files: PackFile[];
}

/** This CLI's own package root: `cli/lib/prompt-pack.ts` → `../..`. */
export function packSource(): string {
  return path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..", "..");
}

/** Where the pack lands. The library root, so `--root` and the env override apply. */
export function packRoot(): string {
  return path.join(workspace(), "prompts");
}

/* The router names playbooks and top-level docs. Everything under
   docs/playbooks/ comes along whether or not the router names it directly --
   a playbook routes onward to its own siblings -- and anything else has to be
   named to be shipped, or the pack turns into a copy of the repository. */
const ROUTER = "AGENTS.md";
const PLAYBOOKS = path.join("docs", "playbooks");

/** A markdown reference worth following: a real repo path, not a placeholder. */
function shippable(token: string): boolean {
  if (!token.endsWith(".md") || token.length > 200) return false;
  if (/[<>*{}]|\.ralphy|:\/\//.test(token)) return false;
  return token === ROUTER || token.startsWith("docs/");
}

async function walk(dir: string, root: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full, root));
    else if (entry.name.endsWith(".md")) found.push(path.relative(root, full));
  }
  return found;
}

/**
 * The pack's file list, relative to `source`: the router, the whole playbook
 * tree, and the transitive closure of `docs/**` files those two name.
 */
export async function packFiles(source: string): Promise<string[]> {
  const queue = [ROUTER, ...await walk(path.join(source, PLAYBOOKS), source)];
  const kept = new Set<string>();
  while (queue.length > 0) {
    const rel = queue.shift()!;
    if (kept.has(rel)) continue;
    const text = await fs.readFile(path.join(source, rel), "utf-8").catch(() => null);
    if (text === null) continue;
    kept.add(rel);
    for (const raw of text.split(/[\s`'"()[\],;]+/)) {
      const token = raw.replace(/[.,;:]+$/, "");
      if (shippable(token)) queue.push(token);
    }
  }
  return [...kept].sort();
}

export async function readManifest(root = packRoot()): Promise<PackManifest | null> {
  const raw = await fs.readFile(path.join(root, "manifest.json"), "utf-8").catch(() => null);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as PackManifest;
  } catch {
    return null;
  }
}

/**
 * Copy the pack into the library. Idempotent: a file whose digest already
 * matches is left alone, so a reinstall is a no-op and the mtime of an
 * untouched playbook does not move.
 */
export async function installPack(input: {
  source?: string;
  root?: string;
  cliVersion: string;
}): Promise<PackManifest & { written: number; removed: number }> {
  const source = input.source ?? packSource();
  const root = input.root ?? packRoot();
  const wanted = await packFiles(source);
  const before = await readManifest(root);

  const files: PackFile[] = [];
  let written = 0;
  for (const rel of wanted) {
    const body = await fs.readFile(path.join(source, rel));
    const sha256 = createHash("sha256").update(body).digest("hex");
    files.push({ path: rel, bytes: body.byteLength, sha256 });
    const target = path.join(root, rel);
    const existing = await fs.readFile(target).catch(() => null);
    if (existing !== null && createHash("sha256").update(existing).digest("hex") === sha256) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    written += 1;
  }

  /* A file the pack dropped between releases has to leave the library too --
     a stale playbook the router no longer names is worse than a missing one,
     because the agent cannot tell it is stale. */
  let removed = 0;
  const keep = new Set(wanted);
  for (const stale of (before?.files ?? []).map((file) => file.path)) {
    if (keep.has(stale)) continue;
    await fs.rm(path.join(root, stale), { force: true });
    removed += 1;
  }

  const manifest: PackManifest = {
    packVersion: PACK_VERSION,
    cliVersion: input.cliVersion,
    installedAt: Date.now(),
    source,
    root,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...manifest, written, removed };
}
