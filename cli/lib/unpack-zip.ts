// Brand-zip flattener used by `ralphy assets unpack <zip>` (#048).
//
// Shells out to the system `unzip` (present on macOS and every major Linux
// distro by default) — preferred over a JS-side zip parser because:
//   1. zero new deps,
//   2. handles every quirk of real-world brand zips (encrypted, big, mixed
//      encodings) without us reimplementing zip64.
//
// Flow:
//   1. `unzip -Z1 <zip>` to enumerate entries (one path per line).
//   2. Filter out `__MACOSX/`, `.DS_Store`, `Thumbs.db`.
//   3. For each remaining entry → extract via `unzip -p <zip> <entry>`
//      into <destDir>/<kebab-flat-name><ext>, suffixing on collision.
//   4. Compute sha256 of each landed file for the summary table.
//
// AGENTS invariant #14: never overwrite. Numeric-suffix on name collision.

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export type UnpackEntry = {
  originalPath: string;
  flatName: string;
  dest: string;          // absolute path on disk
  bytes: number;
  sha256: string;
};

export type UnpackResult = {
  zip: string;
  destDir: string;
  entries: UnpackEntry[];
  skipped: string[];     // filtered-out (__MACOSX/, .DS_Store, Thumbs.db, dirs)
  errors: Array<{ entry: string; error: string }>;
};

const NOISE_PREFIXES = ["__MACOSX/"];
const NOISE_BASENAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

function isNoise(entryPath: string): boolean {
  if (NOISE_PREFIXES.some((p) => entryPath.startsWith(p))) return true;
  const base = path.posix.basename(entryPath);
  if (NOISE_BASENAMES.has(base)) return true;
  // Hidden macOS resource forks like `._foo.png`
  if (base.startsWith("._")) return true;
  return false;
}

function isDirectoryEntry(entryPath: string): boolean {
  return entryPath.endsWith("/");
}

/**
 * Turn a zip-internal path into a flat kebab-case filename:
 *   "Brand Assets/Logos/Logo Primary.svg" → "logos-logo-primary.svg"
 *   "twitch/Glitch Icons/glitch-purple.png" → "glitch-icons-glitch-purple.png"
 *   "logo.svg" → "logo.svg"
 *
 * Strategy: drop the FIRST path segment (typically the brand-pack name, which
 * is redundant since we're already landing in `<project>/brand/`). Join the
 * remaining segments with `-`, kebab-case, preserve extension.
 */
export function flattenEntryName(entryPath: string): string {
  const segments = entryPath.split("/").filter(Boolean);
  if (segments.length === 0) return "file";
  // If only one segment, just kebab the stem.
  const meaningful = segments.length > 1 ? segments.slice(1) : segments;
  // Recompose into one string, then kebab.
  const joined = meaningful.join("-");
  const ext = path.extname(joined);
  const stem = joined.slice(0, joined.length - ext.length);
  const cleanStem = stem
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
  return (cleanStem || "file") + cleanExt;
}

async function sha256OfFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Resolve a non-colliding filename in destDir. If the candidate exists with
 * different content, append `-2`, `-3`, … until free. Caller writes the file.
 */
async function uniqueDest(destDir: string, filename: string, bufSha: string): Promise<string> {
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let suffix = 1;
  while (suffix < 1000) {
    const candidate = suffix === 1 ? filename : `${stem}-${suffix}${ext}`;
    const full = path.join(destDir, candidate);
    try {
      const existing = await sha256OfFile(full);
      if (existing === bufSha) return full;     // same content → reuse
      suffix += 1;                              // collision → bump
    } catch {
      return full;                              // free
    }
  }
  return path.join(destDir, `${stem}-${bufSha.slice(0, 8)}${ext}`);
}

/** List zip entries via `unzip -Z1`. Returns posix-style paths. */
export function listZipEntries(zipPath: string): string[] {
  const r = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`unzip -Z1 failed (status ${r.status}): ${r.stderr || r.stdout}`);
  }
  return r.stdout.split(/\r?\n/).filter(Boolean);
}

/** Extract one entry's bytes via `unzip -p`. */
function readZipEntry(zipPath: string, entry: string): Buffer {
  const r = spawnSync("unzip", ["-p", zipPath, entry], { encoding: "buffer" });
  if (r.status !== 0) {
    throw new Error(`unzip -p failed for ${entry}: status ${r.status}`);
  }
  return r.stdout as Buffer;
}

/**
 * Unpack `zipPath` into `destDir` with brand-pack normalization. Idempotent
 * on re-run: identical content lands on the same flat name.
 */
export async function unpackBrandZip(zipPath: string, destDir: string): Promise<UnpackResult> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = listZipEntries(zipPath);

  // Two-pass collision tracker: when two distinct entries flatten to the same
  // name, we need stable ordering. Pre-resolve names with hash data so the
  // order matches the zip's central directory.
  const usedFlat = new Set<string>();
  const flatNames = new Map<string, string>(); // entry → flat candidate
  for (const e of entries) {
    if (isNoise(e) || isDirectoryEntry(e)) continue;
    let name = flattenEntryName(e);
    // Pre-collision: if `name` already mapped to another entry, bump now.
    // The buffer-aware sha-skip happens in the second pass.
    if (usedFlat.has(name)) {
      const ext = path.extname(name);
      const stem = name.slice(0, name.length - ext.length);
      let i = 2;
      while (usedFlat.has(`${stem}-${i}${ext}`)) i++;
      name = `${stem}-${i}${ext}`;
    }
    usedFlat.add(name);
    flatNames.set(e, name);
  }

  const out: UnpackEntry[] = [];
  const skipped: string[] = [];
  const errors: Array<{ entry: string; error: string }> = [];

  for (const entry of entries) {
    if (isNoise(entry) || isDirectoryEntry(entry)) {
      skipped.push(entry);
      continue;
    }
    try {
      const buf = readZipEntry(zipPath, entry);
      const sha = createHash("sha256").update(buf).digest("hex");
      const flat = flatNames.get(entry) ?? flattenEntryName(entry);
      const dest = await uniqueDest(destDir, flat, sha);
      // uniqueDest returns an existing-same-sha path or a free path; only
      // write when not already on disk with this sha.
      let needWrite = true;
      try {
        const existingSha = await sha256OfFile(dest);
        if (existingSha === sha) needWrite = false;
      } catch { /* not on disk yet */ }
      if (needWrite) await fs.writeFile(dest, buf);
      out.push({
        originalPath: entry,
        flatName: path.basename(dest),
        dest,
        bytes: buf.byteLength,
        sha256: sha,
      });
    } catch (e: any) {
      errors.push({ entry, error: e?.message ?? String(e) });
    }
  }

  return { zip: zipPath, destDir, entries: out, skipped, errors };
}
