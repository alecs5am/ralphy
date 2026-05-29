// Provider-agnostic plumbing shared by every connector: asset file writing,
// append-only slot protection, reference-image resolution + C2PA stripping,
// failure logging, upstream-error rewriting, and the missing-key guard.
//
// Connector implementations (openrouter.ts, elevenlabs.ts, third-party) import
// from here so the disk + log + key-gate behavior stays identical across
// providers — the cost-log / asset-manifest / append-only invariants live in one
// place, not copied per provider.

import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { logGeneration } from "../gen-log.js";
import { projectsDir } from "../paths.js";
import { raiseError } from "../errors/index.js";
import type { CommonInput } from "./types.js";

/**
 * Refuse cleanly when a connector's API key is absent. Replaces the old
 * hardcoded `requireCapability("llm-openrouter")` call inside generators — the
 * connector owns its env-var knowledge, so a third-party provider file can gate
 * on its own key without touching the central capability registry.
 */
export function requireProviderKey(opts: { envVar: string; label: string; signupUrl: string }): void {
  if (process.env[opts.envVar]) return;
  raiseError("E_PROVIDER_UNAVAILABLE", {
    provider: opts.label,
    detail: `${opts.envVar} is not set. Get a key at ${opts.signupUrl} and run "ralphy setup".`,
  });
}

/**
 * Rewrite confusing upstream errors into actionable messages. The OpenRouter
 * 403 "Key limit exceeded (total limit)" is the worst offender — appstore
 * postmortem spent ~30 min debugging credits when the real cause was a
 * per-endpoint concurrent-call cap (gpt-5.4-image-2 = 1). Several others got
 * similar treatment so future agents don't repeat the debug cycle.
 */
export function rewriteUpstreamError(model: string, status: number, rawText: string): string {
  const lower = rawText.toLowerCase();
  if (status === 403 && lower.includes("key limit exceeded")) {
    return (
      `OpenRouter 403 "Key limit exceeded" — this is misleading. The literal cause is a per-endpoint ` +
      `CONCURRENT-CALL cap on your API key, not a credits issue. ` +
      `For ${model}: run image batches at --concurrency 1 OR swap to google/gemini-3-pro-image-preview ` +
      `(tolerates ≥4 parallel). Raw upstream: ${rawText.slice(0, 200)}`
    );
  }
  if (status === 429 && lower.includes("concurrent_limit_exceeded")) {
    return (
      `Concurrent-limit exceeded (HTTP 429). ElevenLabs Music caps at 2-in-flight per subscription; ` +
      `serialize the gen or reduce --concurrency. Raw upstream: ${rawText.slice(0, 200)}`
    );
  }
  if (status === 400 && lower.includes("not in a valid base64 format")) {
    return (
      `Provider rejected the base64 payload with "not in a valid base64 format". ` +
      `Common cause is C2PA / EXIF metadata in the ref image — the C2PA strip in resolveImageRef() ` +
      `should have caught this. If it didn't, the source file may have a non-standard chunk format. ` +
      `Try seedance-2.0 as the multi-frame fallback. Raw upstream: ${rawText.slice(0, 200)}`
    );
  }
  return `${status}: ${rawText.slice(0, 500)}`;
}

export function assetPath(projectId: string, kind: string, filename: string): string {
  return path.join(projectsDir(), projectId, "assets", kind, filename);
}

/**
 * Append-only protection for asset slots. Before any generator overwrites
 * `destPath`, archive the existing file to `<base>.v{N}<ext>` where N is the
 * next free version number. Caller passes `overwrite=true` to bypass.
 *
 * Returns the archived path (or null if nothing existed or overwrite was opted-in).
 * Emits a stderr line so the agent / user can see what happened.
 *
 * Cross-cutting fix: 6 of 10 postmortems traced lost artifacts to silent overwrite.
 */
export async function protectExistingAsset(
  destPath: string,
  overwrite: boolean | undefined,
): Promise<string | null> {
  if (overwrite) return null;
  try {
    await fs.access(destPath);
  } catch {
    return null;
  }
  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);
  // Find the highest existing <base>.v{N}<ext> so we don't clobber a previous archive.
  let maxV = 0;
  try {
    const siblings = await fs.readdir(dir);
    const escapedBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedExt = ext.replace(/\./g, "\\.");
    const rx = new RegExp(`^${escapedBase}\\.v(\\d+)${escapedExt}$`);
    for (const s of siblings) {
      const m = rx.exec(s);
      if (m) maxV = Math.max(maxV, Number(m[1]));
    }
  } catch {
    // dir doesn't exist? unreachable since destPath exists; defensive only.
  }
  const archivedPath = path.join(dir, `${base}.v${maxV + 1}${ext}`);
  await fs.rename(destPath, archivedPath);
  // eslint-disable-next-line no-console
  console.error(
    `ralphy: existing asset auto-archived → ${archivedPath} (pass --force-overwrite to disable)`,
  );
  return archivedPath;
}

export async function downloadTo(url: string, dest: string): Promise<string> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Download ${resp.status} on ${url}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(dest, buf);
  return dest;
}

export async function writeImageFromUrlOrDataUri(
  urlOrDataUri: string,
  dest: string,
): Promise<string> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  if (urlOrDataUri.startsWith("data:")) {
    const comma = urlOrDataUri.indexOf(",");
    if (comma === -1) throw new Error("Malformed data: URI in image response");
    const meta = urlOrDataUri.slice(5, comma);
    const payload = urlOrDataUri.slice(comma + 1);
    const isBase64 = /;base64$/i.test(meta);
    const buf = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
    await fs.writeFile(dest, buf);
    return dest;
  }
  return downloadTo(urlOrDataUri, dest);
}

/**
 * Strip C2PA / EXIF / XMP / IPTC metadata from an image buffer before it goes into
 * an i2v base64 payload. OpenRouter video providers (Kling especially on --last-frame,
 * also seedance occasionally) reject payloads with `caBX` C2PA chunks as "File is
 * not in a valid base64 format" — playdate + flipper + venom + glitter-cream all hit
 * this. Cached by sha256 so repeated `--ref` uses of the same image don't re-strip.
 *
 * Best-effort: if ffmpeg is missing or fails, returns the original buf so the
 * pipeline doesn't break — the agent will then see the upstream 400 with a clearer
 * hint elsewhere.
 */
async function stripImageMetadata(srcBuf: Buffer, ext: string): Promise<Buffer> {
  const normalized = ext === "jpeg" ? "jpg" : ext;
  if (!["png", "jpg", "webp"].includes(normalized)) return srcBuf;

  const sha = crypto.createHash("sha256").update(srcBuf).digest("hex").slice(0, 16);
  const cacheDir = path.join(os.tmpdir(), "ralphy-stripped-refs");
  const cachedOut = path.join(cacheDir, `${sha}.${normalized}`);

  try {
    return await fs.readFile(cachedOut);
  } catch {
    /* cache miss — fall through */
  }

  await fs.mkdir(cacheDir, { recursive: true });
  const cachedIn = path.join(cacheDir, `${sha}.in.${normalized}`);
  await fs.writeFile(cachedIn, srcBuf);

  // JPEG: copy stream (preserves quality); PNG/WEBP: re-encode (lossless / near-lossless,
  // but necessary because C2PA lives in non-image chunks that -c copy preserves).
  const args =
    normalized === "jpg"
      ? ["-y", "-hide_banner", "-loglevel", "error", "-i", cachedIn, "-map_metadata", "-1", "-c", "copy", cachedOut]
      : normalized === "png"
        ? ["-y", "-hide_banner", "-loglevel", "error", "-i", cachedIn, "-map_metadata", "-1", "-compression_level", "100", cachedOut]
        : ["-y", "-hide_banner", "-loglevel", "error", "-i", cachedIn, "-map_metadata", "-1", "-quality", "95", cachedOut];

  const result = spawnSync("ffmpeg", args);
  await fs.unlink(cachedIn).catch(() => {});

  if (result.status !== 0) {
    // ffmpeg failed — return original buf, downstream will still try
    return srcBuf;
  }

  return await fs.readFile(cachedOut);
}

export async function resolveImageRef(ref: string): Promise<string> {
  if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("data:")) {
    return ref;
  }
  const rawBuf = await fs.readFile(ref);
  const ext = path.extname(ref).slice(1).toLowerCase();
  // Strip C2PA / EXIF before base64 — OpenRouter video providers reject payloads
  // with `caBX` C2PA chunks. See stripImageMetadata() for the rationale.
  const buf = await stripImageMetadata(rawBuf, ext);
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

export async function logFailure(
  input: CommonInput,
  provider: string,
  model: string,
  kind: "image" | "video" | "voiceover" | "music" | "sfx",
  body: Record<string, unknown>,
  err: unknown,
  t0: number,
): Promise<void> {
  await logGeneration(input.projectId, {
    slot: input.slot,
    provider,
    model,
    endpoint: model,
    kind,
    input: { slot: input.slot, project: input.projectId, ...body },
    status: "error",
    error: err instanceof Error ? err.message : String(err),
    latency_ms: Date.now() - t0,
    cost_usd: 0,
    note: input.note ?? input.slot,
  });
}
