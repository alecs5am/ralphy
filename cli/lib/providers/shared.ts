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
 *
 * #007: the 403 surface now distinguishes "concurrent-call limit" (the actual
 * cause, NOT a $ balance issue) from balance-class 402. The in-process
 * semaphore (`concurrency.ts`) self-throttles on top of this, so this message
 * fires only when the per-key cap is hit DESPITE the semaphore (e.g. multiple
 * `ralphy` processes sharing one OR key).
 */
export function rewriteUpstreamError(model: string, status: number, rawText: string): string {
  const lower = rawText.toLowerCase();
  if (
    status === 403 &&
    (lower.includes("key limit exceeded") || lower.includes("total limit"))
  ) {
    return (
      `OpenRouter concurrent-call limit on ${model}; try --concurrency 1 or switch model. ` +
      `(This is NOT a $ balance issue — check 'ralphy doctor' for credits.) ` +
      `Raw upstream: ${rawText.slice(0, 200)}`
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

/**
 * Probe an image buffer for pixel dimensions via ffprobe. Returns null when
 * ffprobe is missing / fails — caller treats that as "skip resize" rather than
 * blowing up the i2v submit.
 */
async function probeImageDimensions(
  buf: Buffer,
  ext: string,
): Promise<{ width: number; height: number } | null> {
  const normalized = ext === "jpeg" ? "jpg" : ext;
  if (!["png", "jpg", "webp"].includes(normalized)) return null;
  const sha = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const cacheDir = path.join(os.tmpdir(), "ralphy-probe-refs");
  await fs.mkdir(cacheDir, { recursive: true });
  const tmpIn = path.join(cacheDir, `${sha}.${normalized}`);
  try {
    await fs.writeFile(tmpIn, buf);
    const result = spawnSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=s=x:p=0",
        tmpIn,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0) return null;
    const out = (result.stdout ?? "").trim();
    const m = out.match(/^(\d+)x(\d+)$/);
    if (!m) return null;
    return { width: Number(m[1]), height: Number(m[2]) };
  } catch {
    return null;
  } finally {
    await fs.unlink(tmpIn).catch(() => {});
  }
}

/**
 * Resize an oversized PNG / WEBP buffer down to fit within a target box (default
 * 720×1280 — the natural anchor size for kling / seedance / veo 9:16) and
 * re-encode as JPG. Re-encoding to JPG shrinks 700KB PNG anchors to ~80KB,
 * which is what every i2v provider expects on the wire.
 *
 * Returns the resized JPG buffer + new dimensions + new ext. Falls back to the
 * original buffer when ffmpeg is missing / fails (best-effort, same as the
 * C2PA strip — the pipeline must not break on a tooling gap, the agent will
 * see the upstream 400 elsewhere).
 *
 * Cached by sha256 so repeated `--ref` uses of the same image don't re-encode.
 */
async function resizeForI2VAnchor(
  srcBuf: Buffer,
  ext: string,
  targetMax: { width: number; height: number },
): Promise<{ buf: Buffer; ext: "jpg"; width: number; height: number } | null> {
  const normalized = ext === "jpeg" ? "jpg" : ext;
  if (!["png", "jpg", "webp"].includes(normalized)) return null;

  const sha = crypto.createHash("sha256").update(srcBuf).digest("hex").slice(0, 16);
  const cacheDir = path.join(os.tmpdir(), "ralphy-resized-refs");
  const cachedOut = path.join(
    cacheDir,
    `${sha}.${targetMax.width}x${targetMax.height}.jpg`,
  );

  try {
    const cached = await fs.readFile(cachedOut);
    const probed = await probeImageDimensions(cached, "jpg");
    if (probed) {
      return { buf: cached, ext: "jpg", width: probed.width, height: probed.height };
    }
  } catch {
    /* cache miss — fall through */
  }

  await fs.mkdir(cacheDir, { recursive: true });
  const cachedIn = path.join(cacheDir, `${sha}.in.${normalized}`);
  await fs.writeFile(cachedIn, srcBuf);

  // scale=w:h:force_original_aspect_ratio=decrease preserves aspect so we don't
  // squish a 1080×1920 anchor into a non-9:16 grid. -map_metadata -1 also strips
  // any residual EXIF the C2PA-strip pass missed. -q:v 4 ≈ 80-90 quality, the
  // sweet spot for ~80KB outputs on a 720×1280 portrait.
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", cachedIn,
    "-vf", `scale=${targetMax.width}:${targetMax.height}:force_original_aspect_ratio=decrease`,
    "-map_metadata", "-1",
    "-q:v", "4",
    cachedOut,
  ];

  const result = spawnSync("ffmpeg", args);
  await fs.unlink(cachedIn).catch(() => {});
  if (result.status !== 0) return null;

  const outBuf = await fs.readFile(cachedOut);
  const probed = await probeImageDimensions(outBuf, "jpg");
  if (!probed) return { buf: outBuf, ext: "jpg", width: targetMax.width, height: targetMax.height };
  return { buf: outBuf, ext: "jpg", width: probed.width, height: probed.height };
}

/**
 * Telemetry shape for pre-processing an i2v reference image. Mirrored into
 * `input.preprocess` on the `generations.jsonl` row so postmortems can see the
 * lineage of any anchor that hit the wire.
 */
export type RefPreprocessInfo = {
  /** True when the C2PA / EXIF strip pass actually re-encoded the buffer. */
  c2pa_stripped: boolean;
  /** True when the source exceeded the i2v target box and was downscaled to JPG. */
  resized: boolean;
  /** Source pixel dimensions, when ffprobe could determine them. */
  src_dimensions?: { width: number; height: number };
  /** Output pixel dimensions after resize (omitted when no resize happened). */
  out_dimensions?: { width: number; height: number };
  /** Source byte size on disk before any pre-processing. */
  src_bytes: number;
  /** Final byte size sent to the provider after both passes. */
  out_bytes: number;
  /** Final MIME / encoding ("image/png" → "image/jpeg" after resize). */
  out_mime: string;
};

/**
 * Resolve a single ref string for an IMAGE-generation call (multi-ref, style
 * transfer, etc.). Strips C2PA but does NOT resize — image-gen tolerates large
 * refs and they sometimes carry detail the model needs.
 */
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

/** Default target box for i2v anchors — matches kling / seedance / veo 9:16 natural input. */
export const I2V_ANCHOR_TARGET = { width: 720, height: 1280 } as const;

/**
 * Resolve a ref string for a VIDEO i2v anchor (firstFrame / lastFrame / image
 * on `generateVideo`). Two-step pre-processing: (1) strip C2PA / EXIF (load-
 * bearing — Kling rejects `caBX` chunks as "not in a valid base64 format"), and
 * (2) if the source PNG exceeds the model's natural anchor box, downscale +
 * re-encode as JPG (~80KB) so the wire payload stays tiny.
 *
 * Originals on disk are NEVER overwritten — preprocessed bytes live in a tmp
 * cache under `os.tmpdir()/ralphy-{stripped,resized}-refs/`. AGENTS invariant #14.
 *
 * Returns the data: URL to pass through and an info struct the caller logs
 * into `input.preprocess`. http/https/data: refs are passed through verbatim
 * with `c2pa_stripped: false, resized: false` so manifest rows still record the
 * decision.
 */
export async function resolveImageRefForVideo(
  ref: string,
  opts: { targetMax?: { width: number; height: number } } = {},
): Promise<{ url: string; info: RefPreprocessInfo }> {
  if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("data:")) {
    // Remote / inline refs skip pre-processing — we can't know their byte / pixel size
    // cheaply and rewriting a data: URL through ffmpeg defeats the caller passing one in.
    return {
      url: ref,
      info: {
        c2pa_stripped: false,
        resized: false,
        src_bytes: 0,
        out_bytes: 0,
        out_mime: ref.startsWith("data:") ? ref.slice(5, ref.indexOf(";")) || "application/octet-stream" : "application/octet-stream",
      },
    };
  }

  const rawBuf = await fs.readFile(ref);
  const srcExt = path.extname(ref).slice(1).toLowerCase();
  const srcBytes = rawBuf.byteLength;
  const srcDims = await probeImageDimensions(rawBuf, srcExt);

  // Step 1: C2PA / EXIF strip.
  const stripped = await stripImageMetadata(rawBuf, srcExt);
  const c2paStripped = stripped !== rawBuf && !stripped.equals(rawBuf);

  // Step 2: resize when source exceeds the target box. PNG / WEBP that
  // matches-or-fits skips the resize → caller still gets a tiny payload via
  // the C2PA-strip pass.
  const target = opts.targetMax ?? I2V_ANCHOR_TARGET;
  let finalBuf = stripped;
  type OutExt = "jpg" | "png" | "webp";
  const normalizedSrcExt: OutExt =
    srcExt === "jpeg" || srcExt === "jpg"
      ? "jpg"
      : srcExt === "webp"
        ? "webp"
        : "png";
  let finalExt: OutExt = normalizedSrcExt;
  let outDims: { width: number; height: number } | undefined;
  let resized = false;
  const oversized =
    srcDims && (srcDims.width > target.width || srcDims.height > target.height);
  if (oversized) {
    const result = await resizeForI2VAnchor(stripped, srcExt, target);
    if (result) {
      finalBuf = result.buf;
      finalExt = "jpg";
      outDims = { width: result.width, height: result.height };
      resized = true;
    }
  }

  const mime: string =
    finalExt === "jpg"
      ? "image/jpeg"
      : finalExt === "webp"
        ? "image/webp"
        : "image/png";

  return {
    url: `data:${mime};base64,${finalBuf.toString("base64")}`,
    info: {
      c2pa_stripped: c2paStripped,
      resized,
      src_dimensions: srcDims ?? undefined,
      out_dimensions: outDims,
      src_bytes: srcBytes,
      out_bytes: finalBuf.byteLength,
      out_mime: mime,
    },
  };
}

export async function logFailure(
  input: CommonInput,
  provider: string,
  model: string,
  kind: "image" | "video" | "voiceover" | "music" | "sfx",
  body: Record<string, unknown>,
  err: unknown,
  t0: number,
  attempt = 1,
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
    attempt,
    note: input.note ?? input.slot,
  });
}

// ─── transient-error retry helper (#005) ────────────────────────────────────
//
// Background: every multi-slot session re-discovers the same handful of
// transient provider blips — TLS handshake hiccups, ECONNRESET / ETIMEDOUT /
// DNS class, 5xx with empty body, OR 200-OK responses with missing payload
// (gemini "skeleton null"), MALFORMED_FUNCTION_CALL — and silently drops one
// slot in an otherwise running batch. Six postmortems trace lost artifacts to
// exactly this failure mode (#005 sources).
//
// Strategy: wrap every provider submission in `retryTransient()` with an
// exponential backoff (1s → 4s → 16s by default, 2 retries). Only RETRY a
// classified-transient error; terminal classes (4xx semantic, content-policy,
// ToS bad_prompt — #006 owns that one) throw on the first attempt so the
// caller sees the real reason without burning N more API calls.
//
// Logging: each FAILED attempt is written to `generations.jsonl` with
// `status: "error"` and `attempt: N` (1-indexed). The SUCCESSFUL attempt is
// logged once with `attempt: <final-N>`. Append-only — no row is rewritten.
//
// Stub-file invariant (AGENTS #14): on final failure, the connector throws
// without writing a stub asset. This module never touches disk on the error
// path beyond the JSONL log.

/**
 * Mark an error as terminal to bypass the retry loop. Connector code throws
 * one of these for content-policy / 4xx semantic / ToS rejections so the
 * outer `retryTransient()` doesn't burn N more API calls on a guaranteed-no.
 */
export class TerminalProviderError extends Error {
  readonly terminal = true as const;
  constructor(message: string) {
    super(message);
    this.name = "TerminalProviderError";
  }
}

/**
 * Mark a 200-OK-but-empty-payload (gemini skeleton-null, gpt-image empty
 * images[], `MALFORMED_FUNCTION_CALL` on chat-completions) as transient.
 * Connector code throws this from the response-parsing branch so `classify()`
 * sees it as retry-eligible without us having to grep the message text.
 */
export class TransientPayloadError extends Error {
  readonly transient = true as const;
  constructor(message: string) {
    super(message);
    this.name = "TransientPayloadError";
  }
}

const TRANSIENT_CODE_SET = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ENETUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

const TRANSIENT_MESSAGE_HINTS = [
  "unknown certificate verification error",
  "tls",
  "handshake",
  "socket hang up",
  "fetch failed",
  "network",
  "stream was destroyed",
  "premature close",
  "malformed_function_call",
];

/**
 * Classify an error as transient (retry-eligible) or terminal. The classifier
 * is intentionally conservative — if we can't recognize an error as transient,
 * we treat it as terminal so we don't burn budget retrying a real failure.
 *
 * Transient classes (return `true`):
 *  - TransientPayloadError sentinel (200-OK-but-empty-payload, skeleton-null)
 *  - errno on TRANSIENT_CODE_SET (TLS / ECONNRESET / ETIMEDOUT / DNS)
 *  - message matches TRANSIENT_MESSAGE_HINTS
 *  - 5xx with empty / very short body
 *
 * Terminal classes (return `false`):
 *  - TerminalProviderError sentinel (4xx semantic, content-policy, ToS)
 *  - everything else
 */
export function classifyError(err: unknown): "transient" | "terminal" {
  if (err instanceof TerminalProviderError) return "terminal";
  if (err instanceof TransientPayloadError) return "transient";
  if (!(err instanceof Error)) return "terminal";

  const code = (err as Error & { code?: string; cause?: { code?: string } }).code
    ?? (err as Error & { cause?: { code?: string } }).cause?.code;
  if (code && TRANSIENT_CODE_SET.has(code)) return "transient";

  const msg = err.message.toLowerCase();
  for (const hint of TRANSIENT_MESSAGE_HINTS) {
    if (msg.includes(hint)) return "transient";
  }

  // 5xx-with-empty-body: connector code constructs the error message as
  // `<provider> <status>: <body>` — match the 5xx prefix + trailing empty body.
  const fiveXx = /\b5\d{2}\b/.exec(err.message);
  if (fiveXx) {
    // Heuristic: HTTP 5xx errors with no meaningful body are gateway / proxy blips.
    // Body lives after the first ":" in the connector's error message convention.
    const colonIdx = err.message.indexOf(":");
    const body = colonIdx >= 0 ? err.message.slice(colonIdx + 1).trim() : "";
    if (body.length < 40) return "transient";
    if (/bad gateway|gateway timeout|service unavailable/i.test(err.message)) return "transient";
  }

  return "terminal";
}

export type RetryOptions = {
  /** Max retries (so total attempts = retries + 1). Default 2 → 3 attempts. */
  retries?: number;
  /** Backoff schedule in ms. Default [1000, 4000, 16000]. Index = attempt - 1. */
  backoffMs?: number[];
  /** When true, bypass retries entirely (--no-retry). Total attempts = 1. */
  noRetry?: boolean;
  /**
   * Called before each retry sleep — connectors use this to write an
   * `attempt: N` error row to `generations.jsonl` without re-doing the logFailure
   * plumbing inside `retryTransient`.
   */
  onTransientFailure?: (err: unknown, attempt: number) => Promise<void> | void;
  /** Injectable sleeper. Default uses real `setTimeout`. Tests pass a fake. */
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_BACKOFF_MS = [1000, 4000, 16000];

/**
 * Tests set RALPHY_TEST_RETRY_BACKOFF_MS to a comma-separated list (e.g. "0,0,0")
 * to short-circuit the backoff schedule without rewiring every connector to thread
 * a `backoffMs` arg. Production code never reads this — env vars are inspected
 * lazily per call so tests can flip the value mid-suite.
 */
function envBackoffOverride(): number[] | undefined {
  const raw = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parts.length > 0 ? parts : undefined;
}

export async function retryTransient<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.noRetry ? 0 : opts.retries ?? 2;
  const backoff = opts.backoffMs ?? envBackoffOverride() ?? DEFAULT_BACKOFF_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const klass = classifyError(err);
      if (klass === "terminal") throw err;
      if (attempt > retries) throw err;
      if (opts.onTransientFailure) {
        try {
          await opts.onTransientFailure(err, attempt);
        } catch {
          /* logging is best-effort — never let it mask the original */
        }
      }
      const wait = backoff[attempt - 1] ?? backoff[backoff.length - 1] ?? 1000;
      await sleep(wait);
    }
  }
  // Unreachable — the loop either returns or throws.
  throw lastErr;
}
