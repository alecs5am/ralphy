// Production-mode compiler + `production-contract.json` tests (#418).
//
// The compiler is the COMPOSITION layer (cli/lib/production/compiler.ts): it
// calls `buildProductionPlan` (#407) and folds the plan + the content-mode
// registry into one forward-looking ProductionContract. It does NOT touch the
// filesystem (that is `evaluateContract` / `project status --contract`).
//
// Tests STUB the enrichment fn (no live network, no mock.module on a shared lib
// — #072), exactly like production-plan.test.ts. English-only-on-disk: every
// fixture brief / slug is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { compileProductionContract } from "../../cli/lib/production/compiler";
import {
  parseProductionContract,
  type ProductionContract,
} from "../../cli/lib/schemas/production-contract";
import { getContentMode, isModeSupported } from "../../cli/lib/content-modes";
import type { Candidate } from "../../cli/lib/templater/suggest";
import type { LlmEnrichment } from "../../cli/lib/schemas/production-plan";
import { projectDir } from "../../cli/lib/paths";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

// A compact catalog the ranker scores against (mirrors production-plan.test.ts).
const CANDIDATES: Candidate[] = [
  {
    slug: "clean-dtc-product-shot",
    name: "Clean DTC Product Shot",
    description: "A clean studio still of a product on a controlled background — e-commerce hero.",
    tags: ["product-shot", "studio", "e-commerce", "still", "image"],
    doc: "",
    meta: { source: "public", kind: "template", format: "image" },
  },
  {
    slug: "fb-ad-pack-general",
    name: "FB Ad Pack",
    description: "A batch of static performance creatives / ad pack for a single brand.",
    tags: ["fb-creative", "meta-ads", "performance", "ad-pack"],
    doc: "",
    meta: { source: "public", kind: "template", format: "fb-creative" },
  },
  {
    slug: "carousel-general",
    name: "Carousel General",
    description: "A multi-slide swipe-through carousel deck with baked text.",
    tags: ["carousel", "slides", "swipe", "deck", "multi-slide"],
    doc: "",
    meta: { source: "public", kind: "template", format: "carousel" },
  },
  {
    slug: "ugc-review-general",
    name: "UGC Review",
    description: "A talking-head creator review / testimonial of a product.",
    tags: ["ugc", "review", "testimonial", "talking-head", "video"],
    doc: "",
    meta: { source: "public", kind: "template", format: "video" },
  },
  {
    slug: "podcast-explainer-longform",
    name: "Podcast Explainer Longform",
    description: "A long-form faceless overlay-driven video built on top of a podcast / audio.",
    tags: ["podcast", "long-form", "audio-explainer", "faceless", "overlay"],
    doc: "",
    meta: { source: "public", kind: "template", format: "video" },
  },
];

function cannedEnrichment(over: Partial<LlmEnrichment> = {}): LlmEnrichment {
  return {
    targetAudienceLanguage: "English",
    register: "",
    sceneCount: 5,
    durationSec: 25,
    firstCheckpoint: "scene-01 anchor -> wait for go",
    vibe: "",
    ...over,
  };
}

async function compile(projectId: string, brief: string): Promise<ProductionContract> {
  const enrich = async () => cannedEnrichment();
  const { contract } = await compileProductionContract(
    { projectId, brief },
    { candidates: CANDIDATES, enrich },
  );
  return contract;
}

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("ralphy-contract-418");
});
afterEach(() => {
  tmp.cleanup();
});

// ─── Composition: does not duplicate the registry, reads off it ─────────────────

describe("compileProductionContract — composition", () => {
  test("contract role chain / gates / Unit shape match the registry entry", async () => {
    const c = await compile("c-review", "a ugc review video for my skincare product");
    expect(() => parseProductionContract(c)).not.toThrow();
    expect(c.mode).toBe("ugc-review");
    const entry = getContentMode("ugc-review")!;
    // Read straight off the registry — not re-invented.
    expect(c.roleChain).toEqual(entry.roleChain);
    expect(c.evalGates).toEqual(entry.qualityGates);
    expect(c.unitShape?.format).toBe(entry.expectedUnitShape.format);
    expect(c.requiredRefTypes).toEqual(entry.requiredRefTypes ?? []);
    expect(c.benchmarkSet).toBe(entry.benchmarkSet ?? null);
    expect(c.researchDepth).toBe(entry.defaultResearchDepth);
  });

  test("council gates are the two CONTRACT_PHASES council phase ids", async () => {
    const c = await compile("c-council", "a ugc review video for my product");
    expect(c.councilGates).toEqual(["council-preflight", "council-polish"]);
  });

  test("required artifacts come from CONTRACT_PHASES (video keeps scenario)", async () => {
    const c = await compile("c-video", "a ugc review video for my product");
    expect(c.format).toBe("video");
    expect(c.requiredArtifacts).toContain("scenario.json");
    expect(c.requiredArtifacts).toContain("PRODUCTION_PLAN.md");
    expect(c.requiredArtifacts).toContain("render/final.mp4");
    expect(c.requiredArtifacts).toContain("eval.json");
  });

  test("image-pack (non-video) format drops the scenario artifact", async () => {
    const c = await compile("c-image", "a clean studio product shot on white");
    expect(c.format).toBe("image");
    expect(c.requiredArtifacts).not.toContain("scenario.json");
    // Still carries the cross-format required artifacts.
    expect(c.requiredArtifacts).toContain("PRODUCTION_PLAN.md");
    expect(c.requiredArtifacts).toContain("asset-manifest.json");
  });

  test("model stack + estimate are passed through from the plan (not re-derived)", async () => {
    const enrich = async () => cannedEnrichment({ sceneCount: 6, durationSec: 30 });
    const { contract, plan } = await compileProductionContract(
      { projectId: "c-stack", brief: "a ugc review video for my product" },
      { candidates: CANDIDATES, enrich },
    );
    expect(contract.modelStack).toEqual(plan.modelStack);
    expect(contract.estimate).toEqual(plan.estimate);
    expect(contract.estimate.costHighUsd).toBeGreaterThanOrEqual(contract.estimate.costLowUsd);
  });
});

// ─── The five fixture modes ─────────────────────────────────────────────────────

describe("compileProductionContract — fixture modes", () => {
  const FIXTURES: Array<{ mode: string; brief: string; format: string }> = [
    { mode: "product-shot", brief: "a clean studio product shot on white background", format: "image" },
    { mode: "ad-creative-pack", brief: "make a set of facebook creatives / ad pack for acme.example.com cold traffic", format: "fb-creative" },
    { mode: "social-carousel", brief: "a 7 slide swipe-through carousel deck about productivity", format: "carousel" },
    { mode: "ugc-review", brief: "a ugc review / testimonial video for my skincare product", format: "video" },
    { mode: "podcast-video", brief: "make a long form faceless video from this podcast audio", format: "video" },
  ];

  for (const fx of FIXTURES) {
    test(`${fx.mode}: supported contract with registry-sourced shape`, async () => {
      const c = await compile(`c-${fx.mode}`, fx.brief);
      expect(() => parseProductionContract(c)).not.toThrow();
      expect(c.mode).toBe(fx.mode);
      expect(c.support.supported).toBe(true);
      expect(c.support.closestSupportedMode).toBeNull();
      expect(isModeSupported(fx.mode)).toBe(true);

      const entry = getContentMode(fx.mode)!;
      // Role chain, gates, Unit shape are the registry's, not re-invented.
      expect(c.roleChain).toEqual(entry.roleChain);
      expect(c.evalGates).toEqual(entry.qualityGates);
      expect(c.unitShape).toEqual({
        format: entry.expectedUnitShape.format,
        minMedia: entry.expectedUnitShape.minMedia,
        maxMedia: entry.expectedUnitShape.maxMedia,
        note: entry.expectedUnitShape.note,
      });
      // Format matches the expected deliverable container.
      expect(c.format).toBe(fx.format);
      // Required artifacts always include the plan + the manifest.
      expect(c.requiredArtifacts).toContain("PRODUCTION_PLAN.md");
      expect(c.requiredArtifacts).toContain("asset-manifest.json");
    });
  }
});

// ─── The unsupported / unclassified refusal (#413 hard requirement) ─────────────

describe("compileProductionContract — unsupported-mode refusal", () => {
  test("an unsupported mode → supported:false + closest supported mode (NOT a fake-support contract)", async () => {
    // "personal-clipper" is a deferred gap (supported:false). A clear clipper
    // brief classifies into it.
    const c = await compile("c-clip", "cut my long stream into vertical shorts / clips");
    expect(c.mode).toBe("personal-clipper");
    expect(isModeSupported("personal-clipper")).toBe(false);
    expect(c.support.supported).toBe(false);
    // The refusal carries a CONCRETE closest supported mode, not a silent fallback.
    expect(c.support.closestSupportedMode).not.toBeNull();
    expect(isModeSupported(c.support.closestSupportedMode!)).toBe(true);
    expect(c.support.reason).toContain("not a first-class route");
    // The closest suggestion is a real supported mode, never the unsupported one.
    expect(c.support.closestSupportedMode).not.toBe("personal-clipper");
  });

  test("an unclassified brief → supported:false + disambiguation reason + closest mode", async () => {
    const c = await compile("c-vague", "crispy midnight bleachers vibe with quiet rivers");
    // Nothing classifies confidently.
    expect(c.mode === null || c.support.supported === false).toBe(true);
    if (c.mode === null) {
      expect(c.support.supported).toBe(false);
      expect(c.support.reason).toContain("did not classify");
      expect(c.support.closestSupportedMode).not.toBeNull();
      // No route declared for an unclassified mode.
      expect(c.roleChain).toEqual([]);
      expect(c.unitShape).toBeNull();
    }
  });

  test("amazon-listing (deferred gap) refuses with a closest supported image mode", async () => {
    const c = await compile("c-amazon", "amazon listing images with main and infographic slots");
    expect(c.mode).toBe("amazon-listing");
    expect(c.support.supported).toBe(false);
    expect(c.support.closestSupportedMode).not.toBeNull();
    expect(isModeSupported(c.support.closestSupportedMode!)).toBe(true);
  });
});

// ─── CLI surface: `project plan` also writes production-contract.json ────────────

function writeEmptyLibrary(dir: string): string {
  const libPath = path.join(dir, "library.json");
  fs.writeFileSync(
    libPath,
    JSON.stringify({ schemaVersion: 1, formats: [], units: [], blocks: [], blueprints: [] }),
  );
  return `file://${libPath}`;
}

describe("ralphy project plan — emits production-contract.json (CLI smoke, --no-llm)", () => {
  const PROJECT = "contract-cli-418";

  function seedProject(rootDir: string) {
    const regPath = path.join(rootDir, ".ralphy", "registry.json");
    fs.writeFileSync(
      regPath,
      JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Contract CLI", workspace: "default" } } }),
    );
    fs.mkdirSync(projectDir(PROJECT), { recursive: true });
  }

  function runPlan(rootDir: string, libUrl: string, args: string[]) {
    return spawnSync("bun", ["run", CLI, "--cwd", rootDir, "--json", "project", "plan", ...args], {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env, RALPHY_LIBRARY_URL: libUrl },
    });
  }

  test("writes production-contract.json + includes contract in JSON output", () => {
    seedProject(tmp.dir);
    const libUrl = writeEmptyLibrary(tmp.dir);
    const r = runPlan(tmp.dir, libUrl, [PROJECT, "--brief", "a ugc review video for my product", "--no-llm"]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.contract).toBeTruthy();
    expect(json.contract.mode).toBe("ugc-review");
    expect(json.contract.support.supported).toBe(true);

    const contractPath = path.join(projectDir(PROJECT), "production-contract.json");
    expect(fs.existsSync(contractPath)).toBe(true);
    const written = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    expect(() => parseProductionContract(written)).not.toThrow();
  });

  test("second plan auto-versions the contract (preserves .v1, never overwrites)", () => {
    seedProject(tmp.dir);
    const libUrl = writeEmptyLibrary(tmp.dir);
    const contractPath = path.join(projectDir(PROJECT), "production-contract.json");

    const r1 = runPlan(tmp.dir, libUrl, [PROJECT, "--brief", "a ugc review video for my product", "--no-llm"]);
    expect(r1.status).toBe(0);
    const first = fs.readFileSync(contractPath, "utf8");

    const r2 = runPlan(tmp.dir, libUrl, [PROJECT, "--brief", "a clean studio product shot on white", "--no-llm"]);
    expect(r2.status).toBe(0);

    const archived = path.join(projectDir(PROJECT), "production-contract.v1.json");
    expect(fs.existsSync(archived)).toBe(true);
    expect(fs.readFileSync(archived, "utf8")).toBe(first);
    // Live file now holds the second contract (different mode).
    const live = JSON.parse(fs.readFileSync(contractPath, "utf8"));
    expect(live.mode).toBe("product-shot");
  });
});
