// Benchmark-set loader (#419). Mirrors the guideline loader idiom: reads the
// committed gallery under `<repo>/benchmarks/<slug>/benchmark.json`, parses each
// against the Zod schema, and is BEST-EFFORT — a malformed / unreadable file is
// skipped, never thrown, so one bad set can't crash `ralphy benchmark list`,
// style-lock scaffolding, or an eval/council seam.
//
// Consumed by: `ralphy benchmark list | show` (cli/commands/benchmark.ts), the
// content-mode → set resolver (`benchmarkSetForMode`), the STYLE_LOCK scaffold
// (cite the mode's set), and the eval/council seam (#457/#427 own deeper use).

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getContentMode } from "./content-modes.js";
import { type BenchmarkSet, parseBenchmarkSet } from "./schemas/benchmark.js";

/**
 * `<repo>/benchmarks/` — the committed gallery root. Anchored to THIS module's
 * location (`cli/lib/` → two dirs up), not the mutable `root()` (= cwd / a
 * project's `.ralphy/` data root): the gallery is repo-static and is read by
 * eval / council / style-lock that may run under a relocated root.
 */
export function benchmarksDir(): string {
  return path.join(import.meta.dir, "..", "..", "benchmarks");
}

/** All benchmark-set slugs on disk (sorted), skipping dotfiles. Never throws. */
export function listBenchmarkSlugs(): string[] {
  try {
    return readdirSync(benchmarksDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Load one set by slug, or null when missing / malformed (best-effort). */
export function getBenchmarkSet(slug: string): BenchmarkSet | null {
  try {
    const raw = readFileSync(path.join(benchmarksDir(), slug, "benchmark.json"), "utf-8");
    return parseBenchmarkSet(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Every loadable set in the gallery (malformed files skipped, stable order). */
export function listBenchmarkSets(): BenchmarkSet[] {
  return listBenchmarkSlugs()
    .map((slug) => getBenchmarkSet(slug))
    .filter((s): s is BenchmarkSet => s !== null);
}

/**
 * The benchmark set a content mode declares via its registry `benchmarkSet`
 * field, loaded from disk. Returns null when the mode is unknown, declares no
 * set, or the declared set is missing / malformed.
 */
export function benchmarkSetForMode(mode: string | null | undefined): BenchmarkSet | null {
  if (!mode) return null;
  const slug = getContentMode(mode)?.benchmarkSet;
  return slug ? getBenchmarkSet(slug) : null;
}
