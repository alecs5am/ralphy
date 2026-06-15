// Reference-pack builder (#426).
//
// Three fixture flows the issue calls out, each exercising a different slice:
//   1. product-UGC      — classification of product / model / brand refs + the
//                         locked super-original discipline + the per-mode
//                         missing-required-types report.
//   2. app-store image  — a packshot + benchmark image pack; missing model-person
//                         is not required here, missing product would be.
//   3. analog-horror    — a single approved style PROTOTYPE the batch anchors to.
//
// Plus: schema round-trip, append-only merge (manual lock survives a rebuild),
// and the best-effort guarantee (bare project → empty pack, no crash).
//
// English-only-on-disk: every fixture filename / string is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import {
  buildRefPack,
  mergeRefPack,
  addManualEntry,
  classifyRefByName,
  reportMissingForMode,
  readRefPack,
  renderRefPackMd,
} from "../../cli/lib/ref-pack";
import {
  RefPackSchema,
  lockedRefs,
  refTypesPresent,
  missingRequiredRefTypes,
} from "../../cli/lib/schemas/ref-pack";

function seed(project: string, rel: string, body = "x") {
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

describe("classifyRefByName — filename heuristic", () => {
  test("real-entity types", () => {
    expect(classifyRefByName("brand-logo.png")).toBe("brand");
    expect(classifyRefByName("product-packshot.jpg")).toBe("product");
    expect(classifyRefByName("model-jane.png")).toBe("model-person");
  });
  test("pipeline outputs", () => {
    expect(classifyRefByName("hero-master.png")).toBe("generated-master");
    expect(classifyRefByName("approved-prototype.png")).toBe("selected-prototype");
  });
  test("craft refs", () => {
    expect(classifyRefByName("benchmark-competitor.jpg")).toBe("benchmark");
    expect(classifyRefByName("source-reel.mp4")).toBe("source-video");
    expect(classifyRefByName("moodboard.png")).toBe("style");
  });
  test("audio extension → music regardless of name", () => {
    expect(classifyRefByName("trend.mp3")).toBe("music");
    expect(classifyRefByName("brand.wav")).toBe("music");
  });
  test("video extension defaults to source-video", () => {
    expect(classifyRefByName("clip-001.mp4")).toBe("source-video");
  });
  test("unknown name falls back to style (safe craft default)", () => {
    expect(classifyRefByName("untitled-1.png")).toBe("style");
  });
});

// ─── Fixture 1: product-UGC ───────────────────────────────────────────────────────

describe("product-UGC pack (#426)", () => {
  let tmp: TmpRoot;
  const PROJECT = "glitter-cream-001";

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-refpack-ugc");
    seed(PROJECT, "artifacts/refs/product-packshot.png");
    seed(PROJECT, "artifacts/refs/model-jane.png");
    seed(PROJECT, "artifacts/refs/brand-logo.png");
    seed(PROJECT, "artifacts/refs/moodboard.png");
    // A non-media file in refs/ must be ignored.
    seed(PROJECT, "artifacts/refs/research-facts.json", "{}");
  });
  afterEach(() => tmp.cleanup());

  test("classifies the gathered refs by type and ignores non-media", () => {
    const pack = buildRefPack(PROJECT);
    expect(RefPackSchema.safeParse(pack).success).toBe(true);
    expect(pack.entries).toHaveLength(4);
    const types = refTypesPresent(pack).sort();
    expect(types).toEqual(["brand", "model-person", "product", "style"]);
  });

  test("locked super-original retrieval", () => {
    let pack = buildRefPack(PROJECT);
    pack = addManualEntry(pack, { path: "artifacts/refs/product-packshot.png", type: "product", lock: true });
    pack = addManualEntry(pack, { path: "artifacts/refs/model-jane.png", type: "model-person", lock: true });
    const locked = lockedRefs(pack).map((e) => e.path).sort();
    expect(locked).toEqual(["artifacts/refs/model-jane.png", "artifacts/refs/product-packshot.png"]);
  });

  test("ugc-review mode report: product present → satisfied", () => {
    const pack = buildRefPack(PROJECT);
    const r = reportMissingForMode(pack, "ugc-review");
    expect(r.required).toEqual(["product"]);
    expect(r.missing).toEqual([]);
    expect(r.satisfied).toBe(true);
  });

  test("ad-creative-pack mode report: brand+product present → satisfied", () => {
    const pack = buildRefPack(PROJECT);
    const r = reportMissingForMode(pack, "ad-creative-pack");
    expect(r.required.sort()).toEqual(["brand", "product"]);
    expect(r.satisfied).toBe(true);
  });
});

// ─── Fixture 2: App-Store / image pack ────────────────────────────────────────────

describe("App-Store image pack (#426)", () => {
  let tmp: TmpRoot;
  const PROJECT = "appstore-takeaminute-001";

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-refpack-appstore");
    seed(PROJECT, "artifacts/refs/benchmark-competitor-1.jpg");
    seed(PROJECT, "artifacts/refs/benchmark-competitor-2.jpg");
    seed(PROJECT, "artifacts/refs/style-screenshot.png");
    // No product ref here — used to assert the missing-types report.
  });
  afterEach(() => tmp.cleanup());

  test("gathers benchmark + style refs", () => {
    const pack = buildRefPack(PROJECT);
    const types = refTypesPresent(pack).sort();
    expect(types).toEqual(["benchmark", "style"]);
  });

  test("product-shot mode report: product missing → not satisfied", () => {
    const pack = buildRefPack(PROJECT);
    const r = reportMissingForMode(pack, "product-shot");
    expect(r.required).toEqual(["product"]);
    expect(r.missing).toEqual(["product"]);
    expect(r.satisfied).toBe(false);
  });

  test("a mode with no declared required types is vacuously satisfied", () => {
    const pack = buildRefPack(PROJECT);
    const r = reportMissingForMode(pack, "motion-design");
    expect(r.required).toEqual([]);
    expect(r.satisfied).toBe(true);
  });
});

// ─── Fixture 3: analog-horror style prototype ─────────────────────────────────────

describe("analog-horror style prototype pack (#426)", () => {
  let tmp: TmpRoot;
  const PROJECT = "analog-horror-mirror-001";

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-refpack-horror");
    seed(PROJECT, "artifacts/refs/approved-prototype.png");
  });
  afterEach(() => tmp.cleanup());

  test("the single approved frame classifies as selected-prototype", () => {
    const pack = buildRefPack(PROJECT);
    expect(pack.entries).toHaveLength(1);
    expect(pack.entries[0]!.type).toBe("selected-prototype");
  });

  test("locking the prototype makes it the verbatim anchor", () => {
    let pack = buildRefPack(PROJECT);
    pack = addManualEntry(pack, { path: "artifacts/refs/approved-prototype.png", type: "selected-prototype", lock: true });
    expect(lockedRefs(pack)).toHaveLength(1);
    expect(lockedRefs(pack)[0]!.path).toBe("artifacts/refs/approved-prototype.png");
  });
});

// ─── Append-only merge + best-effort ──────────────────────────────────────────────

describe("mergeRefPack — append-only (#426)", () => {
  let tmp: TmpRoot;
  const PROJECT = "merge-001";

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-refpack-merge");
    seed(PROJECT, "artifacts/refs/product-packshot.png");
  });
  afterEach(() => tmp.cleanup());

  test("a manual lock survives a rebuild merge", () => {
    let pack = buildRefPack(PROJECT);
    pack = addManualEntry(pack, { path: "artifacts/refs/product-packshot.png", type: "product", lock: true, note: "the hero" });
    // A new ref appears on disk, then we rebuild + merge.
    seed(PROJECT, "artifacts/refs/style-mood.png");
    const merged = mergeRefPack(pack, buildRefPack(PROJECT));
    // Existing locked entry preserved (lock + note kept), new ref appended.
    const product = merged.entries.find((e) => e.path === "artifacts/refs/product-packshot.png")!;
    expect(product.locked).toBe(true);
    expect(product.note).toBe("the hero");
    expect(merged.entries.some((e) => e.path === "artifacts/refs/style-mood.png")).toBe(true);
  });

  test("merge never drops an existing entry", () => {
    const existing = RefPackSchema.parse({
      projectId: PROJECT,
      entries: [{ type: "music", path: "artifacts/refs/trend.mp3", source: "manual", locked: false }],
    });
    const merged = mergeRefPack(existing, buildRefPack(PROJECT));
    expect(merged.entries.some((e) => e.path === "artifacts/refs/trend.mp3")).toBe(true);
  });
});

describe("best-effort guarantees (#426)", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-refpack-bare");
  });
  afterEach(() => tmp.cleanup());

  test("a bare project yields an empty pack, no crash", () => {
    const BARE = "bare-426";
    fs.mkdirSync(projectDir(BARE), { recursive: true });
    const pack = buildRefPack(BARE);
    expect(pack.entries).toEqual([]);
    expect(missingRequiredRefTypes(pack, ["product"])).toEqual(["product"]);
  });

  test("readRefPack returns null when absent", () => {
    const BARE = "bare-read-426";
    fs.mkdirSync(projectDir(BARE), { recursive: true });
    expect(readRefPack(BARE)).toBeNull();
  });

  test("REF_PACK.md renders the empty + populated cases", () => {
    const empty = RefPackSchema.parse({ projectId: "p", entries: [] });
    expect(renderRefPackMd(empty)).toContain("No references gathered yet");
    const full = RefPackSchema.parse({
      projectId: "p",
      entries: [{ type: "product", path: "artifacts/refs/h.png", source: "x", locked: true }],
    });
    const md = renderRefPackMd(full);
    expect(md).toContain("## product");
    expect(md).toContain("[locked]");
  });
});
