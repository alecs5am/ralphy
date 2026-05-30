// Bulk URL fetcher used by `ralphy ref pull <url-list>` (#048).
//
// Downloads N URLs in parallel into a destination dir, deduplicates by sha256,
// auto-names by `<domain>-<basename>.<ext>`, and never overwrites existing
// files (AGENTS invariant #14): on sha256 match it skips; on name collision
// with different content it appends a numeric suffix.
//
// No project knowledge — pure download + naming. Callers (the `ref pull`
// command) wrap each result with a gen-log row.

import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export type BulkFetchResult = {
  url: string;
  status: "downloaded" | "skipped-duplicate" | "skipped-existing" | "error";
  dest?: string;        // absolute path on disk, when status is downloaded / skipped-*
  filename?: string;    // basename relative to destDir
  sha256?: string;
  bytes?: number;
  error?: string;
};

export type BulkFetchOptions = {
  urls: string[];
  destDir: string;
  concurrency?: number;     // default 4
  timeoutMs?: number;       // default 30_000
  userAgent?: string;       // default "ralphy-cli/1.0"
  onProgress?: (r: BulkFetchResult) => void;
};

/**
 * Derive a filesystem-safe `<domain>-<basename>.<ext>` name from a URL.
 * Extension is taken from the URL's basename (NOT recomputed from the full
 * "<host>-<stem>" — a host like "127.0.0.1" would otherwise fool path.extname).
 * Examples:
 *   https://example.com/a/b/foo.png         → example.com-foo.png
 *   https://www.apple.com/v/screenshots/x.jpg → apple.com-x.jpg
 *   https://example.com/                    → example.com-index
 *   https://example.com/path?q=1            → example.com-path
 *   http://127.0.0.1/no-ext                 → 127.0.0.1-no-ext   (no ext)
 */
export function urlToFilename(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return kebab(rawUrl) || "download";
  }
  const host = u.hostname.replace(/^www\./, "") || "download";
  // Decode percent-escapes so spaces / unicode in the original filename
  // survive ("Some Image.PNG" arrives via pathname as "Some%20Image.PNG").
  const segments = u.pathname.split("/").filter(Boolean).map((s) => {
    try { return decodeURIComponent(s); } catch { return s; }
  });
  let base = segments[segments.length - 1] ?? "";
  if (!base) base = "index";
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  const cleanStem = kebab(stem) || "file";
  const cleanExt = ext.replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
  // Host parts kebab into the prefix; we keep `.` chars in host (so "1.2.3.4"
  // and "sub.example.com" still read naturally). The extension we know is
  // ONLY whatever was on the basename — never re-derived from the joined name.
  return `${kebabHost(host)}-${cleanStem}${cleanExt}`;
}

/** Host kebab: lowercase, allow dots, replace everything else. */
function kebabHost(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** Lowercase + replace non-[a-z0-9.] with `-`, collapse repeats, trim. */
function kebab(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

async function sha256OfBuf(buf: Uint8Array): Promise<string> {
  return createHash("sha256").update(buf).digest("hex");
}

async function sha256OfFile(file: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(file);
    return createHash("sha256").update(buf).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Resolve a non-colliding destination path for a candidate filename + buffer.
 * If the candidate doesn't exist → use it.
 * If it exists AND has the same sha256 → return existing path with `existed: true`.
 * If it exists AND has a different sha256 → append `-2`, `-3`, … to the stem.
 */
export async function resolveDestPath(
  destDir: string,
  filename: string,
  bufSha: string,
): Promise<{ dest: string; existed: boolean }> {
  const ext = path.extname(filename);
  const stem = filename.slice(0, filename.length - ext.length);
  let suffix = 1;
  // Up to a very generous cap to avoid infinite loops on a pathological dir.
  while (suffix < 1000) {
    const candidate = suffix === 1 ? filename : `${stem}-${suffix}${ext}`;
    const full = path.join(destDir, candidate);
    const existing = await sha256OfFile(full);
    if (existing == null) return { dest: full, existed: false };
    if (existing === bufSha) return { dest: full, existed: true };
    suffix += 1;
  }
  // Pathological — fall back to a hashed name so we still land.
  return { dest: path.join(destDir, `${stem}-${bufSha.slice(0, 8)}${ext}`), existed: false };
}

/**
 * Download one URL with a hard timeout. Returns the body buffer + final
 * content-type (used as a hint for filename extension fix-ups).
 */
async function fetchOne(
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<{ buf: Uint8Array; contentType: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const ab = await res.arrayBuffer();
    return {
      buf: new Uint8Array(ab),
      contentType: (res.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "",
    };
  } finally {
    clearTimeout(t);
  }
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "application/zip": ".zip",
  "application/pdf": ".pdf",
};

/**
 * If the derived filename has no extension, infer one from the content-type.
 * IMPORTANT: callers pass `hasExt` because path.extname is unreliable on names
 * containing literal dots in the host segment (e.g. "127.0.0.1-foo" → ".1-foo"
 * is NOT a real extension). We track ext presence at urlToFilename time.
 */
function ensureExt(filename: string, contentType: string, hasExt: boolean): string {
  if (hasExt) return filename;
  const ext = EXT_BY_MIME[contentType.toLowerCase()];
  return ext ? `${filename}${ext}` : filename;
}

/** Reports whether the URL's basename carries a real extension. */
function urlHasExt(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    const base = segs[segs.length - 1] ?? "";
    return path.extname(base).length > 0;
  } catch {
    return false;
  }
}

/**
 * Run a fixed-concurrency loop over an array of jobs. Order of results matches
 * the input array.
 */
async function pmap<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers: Promise<void>[] = [];
  const lim = Math.max(1, Math.min(n, items.length));
  for (let w = 0; w < lim; w++) {
    workers.push(
      (async () => {
        while (true) {
          const i = idx++;
          if (i >= items.length) return;
          out[i] = await fn(items[i] as T, i);
        }
      })(),
    );
  }
  await Promise.all(workers);
  return out;
}

/**
 * Bulk-download URLs into `destDir`. Idempotent: re-running on the same
 * inputs is a no-op (every URL resolves to `skipped-duplicate` /
 * `skipped-existing`).
 */
export async function bulkFetch(opts: BulkFetchOptions): Promise<BulkFetchResult[]> {
  const concurrency = opts.concurrency ?? 4;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const userAgent = opts.userAgent ?? "ralphy-cli/1.0";
  await fs.mkdir(opts.destDir, { recursive: true });

  // Track sha256 of completed downloads in this run so duplicate URLs that
  // resolve to the same blob also dedupe within-batch (not just against disk).
  const seenSha = new Map<string, string>(); // sha256 → dest path

  const run = async (url: string): Promise<BulkFetchResult> => {
    try {
      const { buf, contentType } = await fetchOne(url, timeoutMs, userAgent);
      const sha = await sha256OfBuf(buf);
      const bytes = buf.byteLength;
      if (seenSha.has(sha)) {
        // Another worker is already writing (or has written) this blob.
        // Wait briefly for it to finalize its dest path so we report a
        // useful filename. seenSha values may be "" while in-flight.
        let primaryDest = seenSha.get(sha) || "";
        for (let i = 0; i < 50 && !primaryDest; i++) {
          // 50 ticks × 10ms = 500ms upper bound; small to keep tests fast.
          await new Promise((res) => setTimeout(res, 10));
          primaryDest = seenSha.get(sha) || "";
        }
        const r: BulkFetchResult = {
          url,
          status: "skipped-duplicate",
          dest: primaryDest || undefined,
          filename: primaryDest ? path.basename(primaryDest) : undefined,
          sha256: sha,
          bytes,
        };
        opts.onProgress?.(r);
        return r;
      }
      // Reserve this sha in the in-batch dedupe map BEFORE any await on the
      // disk side, so a sibling worker that also fetched the same blob takes
      // the duplicate branch on its next tick. JS is single-threaded, so the
      // check above + set here is atomic until the first await.
      seenSha.set(sha, "");
      const baseName = ensureExt(urlToFilename(url), contentType, urlHasExt(url));
      const { dest, existed } = await resolveDestPath(opts.destDir, baseName, sha);
      if (!existed) {
        await fs.writeFile(dest, buf);
      }
      seenSha.set(sha, dest);
      const r: BulkFetchResult = {
        url,
        status: existed ? "skipped-existing" : "downloaded",
        dest,
        filename: path.basename(dest),
        sha256: sha,
        bytes,
      };
      opts.onProgress?.(r);
      return r;
    } catch (e: any) {
      const r: BulkFetchResult = {
        url,
        status: "error",
        error: e?.message ?? String(e),
      };
      opts.onProgress?.(r);
      return r;
    }
  };

  return pmap(opts.urls, concurrency, run);
}

/**
 * Read a URL-list file: one URL per line, blank lines + lines starting with
 * `#` are ignored. Whitespace trimmed.
 */
export async function readUrlList(file: string): Promise<string[]> {
  const text = await fs.readFile(file, "utf8");
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}
