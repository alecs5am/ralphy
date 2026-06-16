// Reference-pack lint + contact-sheet generator (#449).
//
// Two synthetic packs (the issue's two fixtures), exercised through INJECTED
// seams — NO filesystem read, NO image-size, NO network, NO ffmpeg:
//   • the file PROBE is injected (keyed on entry path) for lint,
//   • the contact-sheet RUNNER is injected so the montage never spawns ffmpeg.
//
//   1. HEALTHY pack → every ref resolves, supported format, ample resolution,
//      unique bytes, provenance present, required type satisfied → no findings.
//   2. BROKEN pack → missing file + unsupported format + tiny resolution +
//      duplicate hash + suspicious temp path + missing provenance + missing
//      required type → asserts EACH finding category fires + the verdict fails.
//
// Plus the contact-sheet grouping (one row per type, image-only) + the
// reportMissingForMode reuse. English-only-on-disk.

import { describe, test, expect } from "bun:test";
import { RefPackSchema, type RefPackEntry, type RefPack } from "../../cli/lib/schemas/ref-pack";
import {
  lintRefPack,
  planContactSheet,
  buildRefPackContactSheet,
  type RefProbe,
  type RefProbeResult,
  type ContactSheetRunner,
} from "../../cli/lib/ref-pack-lint";
import type { ContactSheetInput } from "../../cli/lib/ffmpeg-recipes";

const cats = (r: { findings: Array<{ category: string }> }) => r.findings.map((f) => f.category);

/** A healthy probe result: present, large, unique-hash image. */
function ok(over: Partial<RefProbeResult> = {}): RefProbeResult {
  return { exists: true, sizeBytes: 1_000_000, width: 1024, height: 1024, sha256: "h-default", ...over };
}

/** Build a probe keyed on entry path from a map. Unmapped paths read as healthy. */
function probeFrom(map: Record<string, RefProbeResult>): RefProbe {
  return (e: RefPackEntry) => map[e.path] ?? ok({ sha256: `h-${e.path}` });
}

function pack(entries: RefPackEntry[], projectId = "test-001"): RefPack {
  return RefPackSchema.parse({ projectId, entries });
}

// ─── Fixture 1: HEALTHY pack ────────────────────────────────────────────────────

describe("lintRefPack — healthy pack (#449)", () => {
  const HEALTHY = pack([
    { type: "product", path: "artifacts/refs/product-packshot.png", source: "user upload", locked: true },
    { type: "brand", path: "artifacts/refs/brand-logo.png", source: "https://example.com/logo.png", locked: false },
    { type: "style", path: "artifacts/refs/moodboard.png", source: "research-facts", locked: false, note: "the register" },
  ]);

  test("no findings, verdict pass, ok true", () => {
    const r = lintRefPack({
      pack: HEALTHY,
      probe: probeFrom({
        "artifacts/refs/product-packshot.png": ok({ sha256: "h-product" }),
        "artifacts/refs/brand-logo.png": ok({ sha256: "h-brand" }),
        "artifacts/refs/moodboard.png": ok({ sha256: "h-style" }),
      }),
    });
    expect(r.findings).toEqual([]);
    expect(r.verdict).toBe("pass");
    expect(r.ok).toBe(true);
    expect(r.total).toBe(3);
  });

  test("with a satisfied mode → still clean", () => {
    // ad-creative-pack requires brand + product; both present.
    const r = lintRefPack({
      pack: HEALTHY,
      mode: "ad-creative-pack",
      probe: probeFrom({
        "artifacts/refs/product-packshot.png": ok({ sha256: "h-product" }),
        "artifacts/refs/brand-logo.png": ok({ sha256: "h-brand" }),
        "artifacts/refs/moodboard.png": ok({ sha256: "h-style" }),
      }),
    });
    expect(cats(r)).not.toContain("ref.missing-required-type");
    expect(r.verdict).toBe("pass");
  });
});

// ─── Fixture 2: BROKEN pack — every finding fires ────────────────────────────────

describe("lintRefPack — broken pack fires every finding (#449)", () => {
  // One entry per defect (plus a duplicate pair for the hash check).
  const BROKEN = pack([
    // missing file (fail)
    { type: "product", path: "artifacts/refs/gone.png", source: "user upload", locked: false },
    // unsupported format (fail) — .psd is not a ref media format
    { type: "style", path: "artifacts/refs/layered.psd", source: "user upload", locked: false },
    // tiny resolution (warn)
    { type: "benchmark", path: "artifacts/refs/thumb.png", source: "user upload", locked: false },
    // suspicious temp path (warn)
    { type: "style", path: "/tmp/screenshot-2026.png", source: "user upload", locked: false },
    // missing provenance (warn) — no source, no note
    { type: "style", path: "artifacts/refs/orphan.png", source: "", locked: false },
    // duplicate-hash pair (warn) — same sha256
    { type: "style", path: "artifacts/refs/dup-a.png", source: "user upload", locked: false },
    { type: "style", path: "artifacts/refs/dup-b.png", source: "user upload", locked: false },
  ]);

  const PROBE = probeFrom({
    "artifacts/refs/gone.png": { exists: false, sizeBytes: 0, width: null, height: null, sha256: null },
    "artifacts/refs/layered.psd": ok({ sha256: "h-psd" }),
    "artifacts/refs/thumb.png": ok({ width: 64, height: 64, sha256: "h-thumb" }),
    "/tmp/screenshot-2026.png": ok({ sha256: "h-tmp" }),
    "artifacts/refs/orphan.png": ok({ sha256: "h-orphan" }),
    "artifacts/refs/dup-a.png": ok({ sha256: "h-shared" }),
    "artifacts/refs/dup-b.png": ok({ sha256: "h-shared" }),
  });

  test("each defect category fires + verdict fail", () => {
    // ad-creative-pack requires brand + product; the pack has no `brand` type at
    // all → fires the missing-required-type finding alongside the file defects.
    const r = lintRefPack({ pack: BROKEN, mode: "ad-creative-pack", probe: PROBE });
    const found = cats(r);
    expect(found).toContain("ref.missing-file");
    expect(found).toContain("ref.unsupported-format");
    expect(found).toContain("ref.tiny-resolution");
    expect(found).toContain("ref.duplicate-hash");
    expect(found).toContain("ref.suspicious-temp-path");
    expect(found).toContain("ref.missing-provenance");
    expect(found).toContain("ref.missing-required-type");
    expect(r.verdict).toBe("fail");
    expect(r.ok).toBe(false);
    expect(r.findings.every((f) => f.id.startsWith("REF"))).toBe(true);
    // Every finding carries a concrete fix.
    expect(r.findings.every((f) => f.fixHint.length > 0)).toBe(true);
  });

  test("missing-required-type reuses reportMissingForMode (#426)", () => {
    // ad-creative-pack requires brand + product. The pack has a `product` entry
    // (the missing file) but NO `brand` → brand is the missing required type.
    const r = lintRefPack({ pack: BROKEN, mode: "ad-creative-pack", probe: PROBE });
    const missingType = r.findings.filter((f) => f.category === "ref.missing-required-type");
    expect(missingType.length).toBeGreaterThan(0);
    expect(missingType.some((f) => f.message.includes("brand"))).toBe(true);
    expect(missingType.every((f) => f.severity === "fail")).toBe(true);
  });

  test("duplicate-hash names both paths once", () => {
    const r = lintRefPack({ pack: BROKEN, probe: PROBE });
    const dup = r.findings.filter((f) => f.category === "ref.duplicate-hash");
    expect(dup).toHaveLength(1);
    expect(dup[0]!.message).toContain("dup-a.png");
    expect(dup[0]!.message).toContain("dup-b.png");
  });
});

// ─── Edge cases ──────────────────────────────────────────────────────────────────

describe("lintRefPack — edges (#449)", () => {
  test("empty pack → pass, ok, no findings", () => {
    const r = lintRefPack({ pack: pack([]) });
    expect(r.total).toBe(0);
    expect(r.verdict).toBe("pass");
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.reason).toContain("empty");
  });

  test("no pack at all (absent projectId path) → pass-through reason", () => {
    const r = lintRefPack({ projectId: "nope-999", pack: undefined, probe: () => ok() });
    // readRefPack returns null for a project with no pack on disk.
    expect(r.verdict).toBe("pass");
    expect(r.reason).toContain("no reference pack");
  });

  test("video / audio refs are not flagged tiny-resolution (no dims)", () => {
    const r = lintRefPack({
      pack: pack([
        { type: "source-video", path: "artifacts/refs/reel.mp4", source: "tiktok", locked: false },
        { type: "music", path: "artifacts/refs/trend.mp3", source: "trend pool", locked: false },
      ]),
      probe: probeFrom({
        "artifacts/refs/reel.mp4": ok({ width: null, height: null, sha256: "h-reel" }),
        "artifacts/refs/trend.mp3": ok({ width: null, height: null, sha256: "h-music" }),
      }),
    });
    expect(cats(r)).not.toContain("ref.tiny-resolution");
    expect(cats(r)).not.toContain("ref.unsupported-format");
    expect(r.verdict).toBe("pass");
  });

  test(".v2 scratch marker in path → suspicious-temp-path", () => {
    const r = lintRefPack({
      pack: pack([{ type: "style", path: "artifacts/refs/mood.v2.png", source: "user upload", locked: false }]),
      probe: () => ok({ sha256: "h-v2" }),
    });
    expect(cats(r)).toContain("ref.suspicious-temp-path");
  });
});

// ─── Contact sheet — grouping + injected runner ──────────────────────────────────

describe("planContactSheet — group by type, image-only (#449)", () => {
  const P = pack([
    { type: "product", path: "artifacts/refs/p1.png", source: "x", locked: false },
    { type: "product", path: "artifacts/refs/p2.png", source: "x", locked: false },
    { type: "style", path: "artifacts/refs/s1.png", source: "x", locked: false },
    // video + audio are excluded from the montage (xstack stacks stills only).
    { type: "source-video", path: "artifacts/refs/reel.mp4", source: "x", locked: false },
    { type: "music", path: "artifacts/refs/trend.mp3", source: "x", locked: false },
  ]);

  test("two groups (product ×2, style ×1), cols = widest group", () => {
    const plan = planContactSheet(P, (e) => `/abs/${e.path}`);
    expect(plan.groups.map((g) => g.type).sort()).toEqual(["product", "style"]);
    expect(plan.cols).toBe(2);
    const product = plan.groups.find((g) => g.type === "product")!;
    expect(product.srcs).toEqual(["/abs/artifacts/refs/p1.png", "/abs/artifacts/refs/p2.png"]);
    // Row-major srcs pad the 1-wide style row out to 2 cols so it starts fresh.
    expect(plan.srcs).toHaveLength(4);
  });

  test("a pack with no image refs → empty plan", () => {
    const noImg = pack([
      { type: "source-video", path: "artifacts/refs/reel.mp4", source: "x", locked: false },
      { type: "music", path: "artifacts/refs/trend.mp3", source: "x", locked: false },
    ]);
    const plan = planContactSheet(noImg, (e) => e.path);
    expect(plan.srcs).toEqual([]);
    expect(plan.cols).toBe(0);
  });
});

describe("buildRefPackContactSheet — reuses the #049 recipe via injected runner", () => {
  test("calls the runner with grouped srcs + cols, returns its path", async () => {
    const P = pack([
      { type: "product", path: "artifacts/refs/p1.png", source: "x", locked: false },
      { type: "style", path: "artifacts/refs/s1.png", source: "x", locked: false },
    ]);
    let captured: ContactSheetInput | null = null;
    const fakeRun: ContactSheetRunner = async (input) => {
      captured = input;
      return input.dst;
    };
    const r = await buildRefPackContactSheet({
      pack: P,
      dst: "/abs/contact-sheet.png",
      resolve: (e) => `/abs/${e.path}`,
      run: fakeRun,
    });
    expect(r.path).toBe("/abs/contact-sheet.png");
    expect(captured!.srcs.length).toBeGreaterThan(0);
    expect(captured!.cols).toBe(1);
    expect(r.groups.map((g) => g.type).sort()).toEqual(["product", "style"]);
  });

  test("no image refs → path null, runner never called", async () => {
    const P = pack([{ type: "music", path: "artifacts/refs/trend.mp3", source: "x", locked: false }]);
    let called = false;
    const r = await buildRefPackContactSheet({
      pack: P,
      dst: "/abs/contact-sheet.png",
      resolve: (e) => e.path,
      run: async (i) => { called = true; return i.dst; },
    });
    expect(r.path).toBeNull();
    expect(called).toBe(false);
  });
});
