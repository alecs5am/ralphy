// ImageMagick optional runner — issue #101.
//
// ImageMagick is an OPTIONAL dependency (idea-001 dependency posture): used
// when present for native one-call still ops (#102 alpha-trim, #103 convert),
// with the existing ffmpeg/Chromium paths in cutout.ts kept as the fallback.
// Callers branch on `hasMagick()` for graceful fallback, or call
// `ensureMagick()` at sites with no fallback.
//
// Hard rules:
//  - Mirrors the ffmpeg runner in cutout.ts: same gen-log shape, same error
//    truncation, `provider: "imagemagick"`, cost_usd 0 (local).
//  - Binary resolution: `RALPHY_MAGICK_PATH` env override → IM7 `magick` on
//    PATH → IM6 `convert` on PATH → null. Probe result is cached per process.
//  - The runner is arg-order agnostic — callers pass full arg arrays (IM6
//    `convert <in> <ops> <out>` vs IM7 `magick <in> <ops> <out>`).

import { spawn, spawnSync } from "node:child_process";
import { logGeneration } from "../gen-log.js";
import type { ImagePostOptions } from "./cutout.js";

// Module-level probe cache: `undefined` = not probed yet, `string | null` =
// resolved result. PATH probes spawn a process, so we only pay once.
let cachedBinary: string | null | undefined;

/**
 * Test hook — set the cached binary directly (string), force "not installed"
 * (null), or clear the cache so the next `magickBinary()` call re-probes
 * (undefined). Lets tests run without ImageMagick installed.
 */
export function __setMagickBinaryForTest(value: string | null | undefined): void {
  cachedBinary = value;
}

function probe(name: string): boolean {
  const r = spawnSync(name, ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

/**
 * Resolve the ImageMagick binary: `RALPHY_MAGICK_PATH` env override → IM7
 * `magick` → IM6 `convert` → null. Cached after the first call.
 *
 * `RALPHY_MAGICK_PATH` is a TRUSTED override — returned as-is without
 * probing, so a broken value surfaces at spawn time, not resolve time.
 */
export function magickBinary(): string | null {
  if (cachedBinary !== undefined) return cachedBinary;
  const override = process.env.RALPHY_MAGICK_PATH;
  if (override) {
    cachedBinary = override;
    return cachedBinary;
  }
  if (probe("magick")) {
    cachedBinary = "magick";
    return cachedBinary;
  }
  if (probe("convert")) {
    cachedBinary = "convert";
    return cachedBinary;
  }
  cachedBinary = null;
  return cachedBinary;
}

/** Cheap truthy wrapper callers branch on for graceful ffmpeg fallback. */
export function hasMagick(): boolean {
  return magickBinary() !== null;
}

/** Returns the binary or throws — for call sites with no fallback path. */
export function ensureMagick(): string {
  const binary = magickBinary();
  if (!binary) {
    throw new Error(
      "ImageMagick not found (optional) — install via `brew install imagemagick`.",
    );
  }
  return binary;
}

/**
 * Spawn the resolved ImageMagick binary with `args`, collect stderr, and log
 * a gen-log line (provider "imagemagick", cost_usd 0) when a projectId is
 * set — exactly like `runFfmpeg` in cutout.ts.
 */
export async function runMagick(
  args: string[],
  meta: { endpoint: string; input: Record<string, unknown>; opts?: ImagePostOptions },
): Promise<{ stderr: string; durationMs: number }> {
  const binary = ensureMagick();
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args);
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    // RALPHY_MAGICK_PATH is trusted (never probed), so spawn itself can fail
    // (ENOENT on a bogus path) — reject instead of crashing on an unhandled
    // 'error' event.
    proc.on("error", (err) => {
      reject(new Error(`imagemagick spawn failed (${binary}): ${err.message}`));
    });
    proc.on("close", async (code) => {
      const durationMs = Date.now() - t0;
      if (meta.opts?.projectId) {
        await logGeneration(meta.opts.projectId, {
          provider: "imagemagick",
          model: meta.endpoint,
          endpoint: meta.endpoint,
          kind: "image",
          input: { project: meta.opts.projectId, ...meta.input },
          status: code === 0 ? "ok" : "error",
          error: code === 0 ? undefined : stderr.slice(0, 500),
          latency_ms: durationMs,
          cost_usd: 0,
          note: meta.opts.note,
        });
      }
      if (code === 0) resolve({ stderr, durationMs });
      else reject(new Error(`imagemagick exit ${code}: ${stderr.slice(0, 1000)}`));
    });
  });
}
