// Product & brand fidelity gate (#422).
//
// Fixtures use a STUBBED analyzer — NO paid generation, NO network. Each flow
// the issue calls out is exercised:
//   1. matching product → pass, blocksShip:false.
//   2. drifted product / logo → fail + blocksShip:true (refuse, not warn).
//   3. claimsToAvoid violation caught (a fail finding).
//   4. missing required product ref flagged (commercial mode, no product ref).
//   5. non-commercial mode → applicable:false pass-through.
//
// Plus the registry-derived `requiresFidelityGate` partition. English-only.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir } from "../../cli/lib/paths";
import { checkFidelity, type FidelityAnalyzer } from "../../cli/lib/eval/fidelity";
import { requiresFidelityGate } from "../../cli/lib/content-modes";
import { buildRefPack, addManualEntry } from "../../cli/lib/ref-pack";
import { REF_PACK_ARTIFACT } from "../../cli/lib/schemas/ref-pack";

function seed(project: string, rel: string, body = "x") {
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

/** Write a locked product (+ optional brand) ref pack for the project. */
function seedLockedPack(project: string, opts: { product?: boolean; brand?: boolean } = { product: true }) {
  if (opts.product) seed(project, "artifacts/refs/product-packshot.png");
  if (opts.brand) seed(project, "artifacts/refs/brand-logo.png");
  let pack = buildRefPack(project);
  if (opts.product) pack = addManualEntry(pack, { path: "artifacts/refs/product-packshot.png", type: "product", lock: true });
  if (opts.brand) pack = addManualEntry(pack, { path: "artifacts/refs/brand-logo.png", type: "brand", lock: true });
  fs.writeFileSync(path.join(projectDir(project), REF_PACK_ARTIFACT), JSON.stringify(pack, null, 2));
}

function seedFacts(project: string, facts: Record<string, unknown>) {
  seed(project, "artifacts/refs/research-facts.json", JSON.stringify({ version: 1, ...facts }));
}

// A pass-everything analyzer + a builder for targeted-failure analyzers.
const allPass: FidelityAnalyzer = async () => ({
  productIdentity: true,
  packagingLogo: true,
  colorPalette: true,
  claimAccuracy: true,
  prohibitedClaimsClear: true,
  issues: [],
});

describe("requiresFidelityGate — registry-derived commercial partition (#422)", () => {
  test("commercial modes are gated", () => {
    for (const m of [
      "product-shot", "lifestyle-scene", "closeup-product-with-person",
      "ad-creative-pack", "ugc-review", "tutorial-ugc", "unboxing-ugc",
      "tv-ad", "conceptual-product", "amazon-listing",
    ]) {
      expect(requiresFidelityGate(m)).toBe(true);
    }
  });
  test("generic / craft modes are NOT gated", () => {
    for (const m of [
      "pinterest-pin", "hero-banner", "social-carousel", "restyle",
      "cartoon-animation", "motion-design", "typography-animation",
      "podcast-video", "personal-clipper",
    ]) {
      expect(requiresFidelityGate(m)).toBe(false);
    }
  });
  test("unknown mode → not gated", () => {
    expect(requiresFidelityGate("not-a-mode")).toBe(false);
  });
});

describe("checkFidelity — non-commercial pass-through", () => {
  let tmp: TmpRoot;
  beforeEach(() => { tmp = makeTmpRoot("ralphy-fidelity-na"); });
  afterEach(() => tmp.cleanup());

  test("a carousel project returns applicable:false, pass, blocksShip:false", async () => {
    const P = "carousel-001";
    seed(P, "artifacts/images/slide-01.png");
    const r = await checkFidelity({ projectId: P, mode: "social-carousel", analyze: allPass });
    expect(r.applicable).toBe(false);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.findings).toEqual([]);
  });

  test("no mode resolved → not applicable", async () => {
    const r = await checkFidelity({ projectId: "x-001", mode: null, analyze: allPass });
    expect(r.applicable).toBe(false);
    expect(r.blocksShip).toBe(false);
  });
});

describe("checkFidelity — matching product passes", () => {
  let tmp: TmpRoot;
  const P = "glitter-cream-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-fidelity-pass");
    seedLockedPack(P, { product: true });
    seed(P, "artifacts/images/hero-01.png");
    seed(P, "artifacts/images/hero-02.png");
  });
  afterEach(() => tmp.cleanup());

  test("all checks pass → pass, blocksShip:false, both assets recorded", async () => {
    const r = await checkFidelity({ projectId: P, mode: "ugc-review", analyze: allPass });
    expect(r.applicable).toBe(true);
    expect(r.verdict).toBe("pass");
    expect(r.blocksShip).toBe(false);
    expect(r.assets).toHaveLength(2);
    expect(r.lockedRefs).toContain("artifacts/refs/product-packshot.png");
    expect(r.requiredRefs.satisfied).toBe(true);
  });
});

describe("checkFidelity — drifted product/logo fails + blocks ship", () => {
  let tmp: TmpRoot;
  const P = "flipper-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-fidelity-drift");
    seedLockedPack(P, { product: true, brand: true });
    seed(P, "artifacts/images/hero-01.png");
  });
  afterEach(() => tmp.cleanup());

  test("wrong product identity + wrong logo → fail + blocksShip", async () => {
    const drift: FidelityAnalyzer = async () => ({
      productIdentity: false,
      packagingLogo: false,
      colorPalette: true,
      claimAccuracy: true,
      prohibitedClaimsClear: true,
      issues: [],
    });
    const r = await checkFidelity({ projectId: P, mode: "ad-creative-pack", analyze: drift });
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    const cats = r.findings.map((f) => f.category);
    expect(cats).toContain("fidelity.product-identity");
    expect(cats).toContain("fidelity.packaging-logo");
    expect(r.findings.every((f) => f.id.startsWith("FID"))).toBe(true);
  });

  test("palette drift alone is a warn, not a ship-block", async () => {
    const paletteOnly: FidelityAnalyzer = async () => ({
      productIdentity: true,
      packagingLogo: true,
      colorPalette: false,
      claimAccuracy: true,
      prohibitedClaimsClear: true,
      issues: [],
    });
    const r = await checkFidelity({ projectId: P, mode: "ad-creative-pack", analyze: paletteOnly });
    // Palette drift surfaces a warn-severity finding, never a ship block.
    expect(r.blocksShip).toBe(false);
    const palette = r.findings.find((f) => f.category === "fidelity.color-palette");
    expect(palette?.severity).toBe("warn");
  });
});

describe("checkFidelity — claimsToAvoid violation caught", () => {
  let tmp: TmpRoot;
  const P = "sotaocr-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-fidelity-claims");
    seedLockedPack(P, { product: true });
    seedFacts(P, { claimsToAvoid: ["no Python SDK — REST only"], productFacts: ["95% OCR accuracy"] });
    seed(P, "artifacts/images/creative-01.png");
  });
  afterEach(() => tmp.cleanup());

  test("a prohibited claim on an asset is a fail that blocks ship", async () => {
    const violator: FidelityAnalyzer = async () => ({
      productIdentity: true,
      packagingLogo: true,
      colorPalette: true,
      claimAccuracy: true,
      prohibitedClaimsClear: false,
      issues: [],
    });
    const r = await checkFidelity({ projectId: P, mode: "ad-creative-pack", analyze: violator });
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("fidelity.prohibited-claim");
  });
});

describe("checkFidelity — missing required product ref flagged", () => {
  let tmp: TmpRoot;
  const P = "appstore-001";
  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-fidelity-missing");
    // No product ref pack, no product ref on disk.
    seed(P, "artifacts/images/screenshot-01.png");
  });
  afterEach(() => tmp.cleanup());

  test("product-shot mode without a product ref → fail + blocksShip", async () => {
    const r = await checkFidelity({ projectId: P, mode: "product-shot", analyze: allPass });
    expect(r.requiredRefs.missing).toEqual(["product"]);
    expect(r.verdict).toBe("fail");
    expect(r.blocksShip).toBe(true);
    expect(r.findings.map((f) => f.category)).toContain("fidelity.missing-required-ref");
  });
});
