// Source attribution + copyright hygiene (#543) — deterministic lib tests.
//
// Covers: the attribution block builders per platform shape (description vs
// frontmatter), the explicit opt-out (no block), the workspace-policy
// read/write, and the deterministic copyright-hygiene classifier (a scraped
// `artifacts/refs/` source embedded → fail; all-generated → pass; the CV
// watermark seam is documented-not-implemented). Tmp-root + env hygiene per
// #545: no process.env mutation, cwd untouched, isolated .ralphy root.

import { describe, test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { workspaceDir, workspaceManifestPath } from "../../cli/lib/paths";
import {
  buildSourcesBlock,
  buildSourcesFrontmatterBlock,
  injectAttribution,
  dedupeSources,
  readAttributionConfig,
  writeAttributionConfig,
  DISABLED_ATTRIBUTION_CONFIG,
  type AttributionSource,
} from "../../cli/lib/publish/attribution";
import { checkCopyrightHygiene, isScrapedSourcePath } from "../../cli/lib/publish/hygiene";
import type { UnitManifest } from "../../cli/lib/schemas/unit";

let tmp: TmpRoot;
afterEach(() => tmp?.cleanup());

const SOURCES: AttributionSource[] = [
  { url: "https://news.example/story", outlet: "The Example", author: "A. Writer" },
  { url: "https://blog.example/post", outlet: "Example Blog" },
  { url: "https://bare.example/x" },
];

// ─── attribution block builders (per-platform shape) ─────────────────────────

describe("attribution block builders", () => {
  test("description block: heading + one credit line per source", () => {
    tmp = makeTmpRoot("ralphy-attr");
    const block = buildSourcesBlock(SOURCES);
    expect(block).toStartWith("Sources:");
    expect(block).toContain("- The Example — A. Writer: https://news.example/story");
    expect(block).toContain("- Example Blog: https://blog.example/post");
    expect(block).toContain("- https://bare.example/x"); // bare url, no prefix
  });

  test("custom heading is honored", () => {
    tmp = makeTmpRoot("ralphy-attr");
    expect(buildSourcesBlock(SOURCES, "Original reporting:")).toStartWith("Original reporting:");
  });

  test("frontmatter block: a sources: YAML list of quoted URLs (article shape)", () => {
    tmp = makeTmpRoot("ralphy-attr");
    const block = buildSourcesFrontmatterBlock(SOURCES);
    expect(block).toStartWith("sources:");
    expect(block).toContain('  - "https://news.example/story"');
    expect(block).toContain('  - "https://blog.example/post"');
    // The frontmatter shape is DISTINCT from the description shape.
    expect(block).not.toContain("The Example — A. Writer");
  });

  test("empty sources → empty block (no dangling header), both shapes", () => {
    tmp = makeTmpRoot("ralphy-attr");
    expect(buildSourcesBlock([])).toBe("");
    expect(buildSourcesFrontmatterBlock([])).toBe("");
    expect(injectAttribution("body", [])).toBe("body");
  });

  test("injectAttribution appends after a blank line, preserves existing copy", () => {
    tmp = makeTmpRoot("ralphy-attr");
    const out = injectAttribution("Watch this recap.", SOURCES);
    expect(out).toStartWith("Watch this recap.\n\nSources:");
  });

  test("dedupeSources drops dup URLs (first wins) + urlless entries", () => {
    tmp = makeTmpRoot("ralphy-attr");
    const uniq = dedupeSources([
      { url: "https://a" },
      { url: "https://a", outlet: "later" },
      { url: "" } as AttributionSource,
      { url: "https://b" },
    ]);
    expect(uniq.map((s) => s.url)).toEqual(["https://a", "https://b"]);
  });
});

// ─── workspace policy (opt-out) ──────────────────────────────────────────────

describe("attribution workspace policy", () => {
  test("absent block reads back ENABLED by default (on out of the box)", () => {
    tmp = makeTmpRoot("ralphy-attr");
    fs.mkdirSync(workspaceDir("default"), { recursive: true });
    fs.writeFileSync(workspaceManifestPath("default"), JSON.stringify({ slug: "default" }));
    expect(readAttributionConfig("default").enabled).toBe(true);
    expect(readAttributionConfig("default").heading).toBe("Sources:");
  });

  test("explicit opt-out disables injection", () => {
    tmp = makeTmpRoot("ralphy-attr");
    writeAttributionConfig("default", { enabled: false });
    expect(readAttributionConfig("default").enabled).toBe(false);
  });

  test("requireOnPublish + heading round-trip through workspace.json", () => {
    tmp = makeTmpRoot("ralphy-attr");
    writeAttributionConfig("default", { requireOnPublish: true, heading: "Credits:" });
    const c = readAttributionConfig("default");
    expect(c.requireOnPublish).toBe(true);
    expect(c.heading).toBe("Credits:");
    expect(c.enabled).toBe(true);
  });

  test("DISABLED_ATTRIBUTION_CONFIG is the no-op default", () => {
    expect(DISABLED_ATTRIBUTION_CONFIG.enabled).toBe(false);
  });
});

// ─── copyright hygiene (deterministic core) ──────────────────────────────────

function unit(over: Partial<UnitManifest>): UnitManifest {
  return {
    slug: "hero-cut",
    format: "video",
    media: [],
    created: "2026-07-09T00:00:00.000Z",
    ...over,
  } as UnitManifest;
}

describe("copyright hygiene check", () => {
  test("isScrapedSourcePath recognizes the refs tier only", () => {
    expect(isScrapedSourcePath("artifacts/refs/scraped-photo.jpg")).toBe(true);
    expect(isScrapedSourcePath("units/hero/artifacts/refs/x.png")).toBe(true);
    expect(isScrapedSourcePath("artifacts/images/gen-01.png")).toBe(false);
    expect(isScrapedSourcePath("artifacts/videos/clip.mp4")).toBe(false);
  });

  test("clean generated unit PASSES (all media from generated tiers)", () => {
    const r = checkCopyrightHygiene(
      unit({
        media: ["scene-01.png", "final.mp4"],
        source_assets: ["artifacts/images/scene-01.png", "artifacts/videos/final.mp4"],
      }),
    );
    expect(r.verdict).toBe("pass");
    expect(r.flags).toHaveLength(0);
    expect(r.examined).toBe(2);
  });

  test("a scraped-source embed FAILS (media copied out of artifacts/refs/)", () => {
    const r = checkCopyrightHygiene(
      unit({
        media: ["hero.jpg", "final.mp4"],
        source_assets: ["artifacts/refs/source-photo.jpg", "artifacts/videos/final.mp4"],
      }),
    );
    expect(r.verdict).toBe("fail");
    expect(r.flags).toHaveLength(1);
    expect(r.flags[0]!.code).toBe("scraped-source-embedded");
    expect(r.flags[0]!.severity).toBe("fail");
    expect(r.flags[0]!.media).toBe("hero.jpg");
  });

  test("a unit with NO source_assets is not flagged (absence is not a signal)", () => {
    const r = checkCopyrightHygiene(unit({ media: ["final.mp4"] }));
    expect(r.verdict).toBe("pass");
  });

  test("the CV watermark/logo detection is a documented SEAM, not implemented", () => {
    const r = checkCopyrightHygiene(unit({ media: ["final.mp4"] }));
    expect(r.watermarkSeam.checked).toBe(false);
    expect(r.watermarkSeam.note).toContain("vision/CV");
  });
});
