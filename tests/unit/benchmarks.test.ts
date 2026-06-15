// Golden benchmark-set gallery + loader (#419).
//
// Mirrors the AGENTS.md #13 guideline-gallery invariant: the gallery is
// non-empty and every shipped set parses, plus the loader is best-effort
// (skips a malformed file), get-by-mode resolves the mode→set link, and the
// three pilot sets exist with the required good + bad examples.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  listBenchmarkSlugs,
  listBenchmarkSets,
  getBenchmarkSet,
  benchmarkSetForMode,
  benchmarksDir,
} from "../../cli/lib/benchmarks.js";
import { parseBenchmarkSet, hasGoodAndBad } from "../../cli/lib/schemas/benchmark.js";
import { allContentModes } from "../../cli/lib/content-modes.js";

const PILOTS = ["app-store-image-pack", "product-ugc-review", "analog-horror-psa"] as const;

describe("benchmark gallery (#419)", () => {
  test("gallery is non-empty and every set parses against the schema", () => {
    const slugs = listBenchmarkSlugs();
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const raw = JSON.parse(
        fs.readFileSync(path.join(benchmarksDir(), slug, "benchmark.json"), "utf-8"),
      );
      // Throws on a malformed set — the gate.
      const set = parseBenchmarkSet(raw);
      // dir slug must match the recorded slug.
      expect(set.slug).toBe(slug);
    }
  });

  test("listBenchmarkSets returns every loadable set", () => {
    expect(listBenchmarkSets().length).toBe(listBenchmarkSlugs().length);
  });

  test("the three pilot sets exist with >=1 good and >=1 bad example", () => {
    for (const slug of PILOTS) {
      const set = getBenchmarkSet(slug);
      expect(set).not.toBeNull();
      expect(hasGoodAndBad(set!)).toBe(true);
      // Every example carries at least one concrete feature.
      for (const ex of set!.examples) expect(ex.features.length).toBeGreaterThan(0);
    }
  });

  test("get-by-mode resolves a mode's declared benchmark set", () => {
    // ad-creative-pack → app-store-image-pack (the populated pilot link).
    const set = benchmarkSetForMode("ad-creative-pack");
    expect(set?.slug).toBe("app-store-image-pack");
    // An unknown / unmapped mode resolves to null.
    expect(benchmarkSetForMode("podcast-video")).toBeNull();
    expect(benchmarkSetForMode(null)).toBeNull();
    expect(benchmarkSetForMode("not-a-real-mode")).toBeNull();
  });

  test("every mode-declared benchmarkSet slug points at a real, loadable set", () => {
    for (const mode of allContentModes()) {
      if (!mode.benchmarkSet) continue;
      expect(getBenchmarkSet(mode.benchmarkSet)).not.toBeNull();
    }
  });
});

describe("benchmark loader is best-effort", () => {
  let tmpSlug: string | null = null;

  afterEach(() => {
    if (tmpSlug) {
      fs.rmSync(path.join(benchmarksDir(), tmpSlug), { recursive: true, force: true });
      tmpSlug = null;
    }
  });

  test("a malformed set is skipped, not thrown — list keeps working", () => {
    tmpSlug = "zzz-malformed-fixture";
    const dir = path.join(benchmarksDir(), tmpSlug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "benchmark.json"), "{ not valid json", "utf-8");

    // The bad slug shows up in the raw dir listing...
    expect(listBenchmarkSlugs()).toContain(tmpSlug);
    // ...but getBenchmarkSet returns null instead of throwing...
    expect(getBenchmarkSet(tmpSlug)).toBeNull();
    // ...and listBenchmarkSets silently drops it (all loaded sets parse).
    expect(listBenchmarkSets().some((s) => s.slug === tmpSlug)).toBe(false);
  });
});
