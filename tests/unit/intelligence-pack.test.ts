// #455 — universal intelligence pack: schema round-trip + defaults, the
// required-intelligence matrix, the composer, and provenance/origin round-trip.

import { describe, test, expect } from "bun:test";
import {
  parseIntelligencePack,
  buildIntelligencePack,
  requiredIntelligenceFor,
  missingRequirements,
  allFacts,
  originsPresent,
  INTELLIGENCE_FIELDS,
  INTELLIGENCE_PACK_ARTIFACT,
  type IntelligenceFact,
} from "../../cli/lib/schemas/intelligence-pack.js";
import { parseProductBrandFacts } from "../../cli/lib/schemas/research-facts.js";
import { parseRefPack } from "../../cli/lib/schemas/ref-pack.js";
import { parseBenchmarkSet } from "../../cli/lib/schemas/benchmark.js";

const userFact = (value: string): IntelligenceFact => ({
  value,
  source: "intake",
  provenance: "user said so",
  confidence: 0.9,
  origin: "user",
});
const crawledFact = (value: string): IntelligenceFact => ({
  value,
  source: "https://example.com/docs",
  provenance: "site-grounding crawl",
  confidence: 0.7,
  origin: "crawled",
});

describe("IntelligencePack schema", () => {
  test("fills defaults and round-trips", () => {
    const pack = parseIntelligencePack({ projectId: "demo-001" });
    expect(pack.version).toBe(1);
    expect(pack.projectId).toBe("demo-001");
    expect(pack.brand).toEqual([]);
    expect(pack.product).toEqual([]);
    expect(pack.competitors).toEqual([]);
    expect(pack.platformConstraints).toEqual([]);
    expect(typeof pack.generatedAt).toBe("string");
    // Composed artifacts are optional — absent by default.
    expect(pack.research).toBeUndefined();
    expect(pack.refPack).toBeUndefined();
    expect(pack.benchmark).toBeUndefined();
    // Full round-trip through the parser is stable.
    expect(parseIntelligencePack(JSON.parse(JSON.stringify(pack)))).toEqual(pack);
  });

  test("fact defaults fill but origin is required", () => {
    const pack = parseIntelligencePack({ product: [{ value: "95% OCR accuracy", origin: "crawled" }] });
    expect(pack.product[0].source).toBe("");
    expect(pack.product[0].provenance).toBe("");
    expect(pack.product[0].confidence).toBe(0.5);
    expect(pack.product[0].origin).toBe("crawled");
    // origin has no default — it must be supplied.
    expect(() => parseIntelligencePack({ product: [{ value: "x" }] })).toThrow();
    // confidence is bounded 0-1.
    expect(() => parseIntelligencePack({ product: [{ value: "x", origin: "user", confidence: 2 }] })).toThrow();
  });

  test("artifact path constant", () => {
    expect(INTELLIGENCE_PACK_ARTIFACT).toBe("INTELLIGENCE_PACK.json");
  });
});

describe("provenance / origin round-trip", () => {
  test("user-provided and crawled facts stay distinguishable", () => {
    const pack = buildIntelligencePack({
      product: [userFact("Free tier"), crawledFact("$0.003 per page")],
      claims: [{ value: "REST only — no Python SDK", source: "/docs", provenance: "crawl", confidence: 0.8, origin: "crawled" }],
      openRisks: [{ value: "palette unverified", source: "", provenance: "agent guess", confidence: 0.3, origin: "inferred" }],
    });
    expect(pack.product.find((f) => f.value === "Free tier")!.origin).toBe("user");
    expect(pack.product.find((f) => f.value === "$0.003 per page")!.origin).toBe("crawled");
    expect(originsPresent(pack).sort()).toEqual(["crawled", "inferred", "user"]);
    // Survives a JSON round-trip with origins intact.
    const reparsed = parseIntelligencePack(JSON.parse(JSON.stringify(pack)));
    expect(originsPresent(reparsed).sort()).toEqual(["crawled", "inferred", "user"]);
  });

  test("allFacts flattens facts nested in competitors and platform constraints", () => {
    const pack = buildIntelligencePack({
      brand: [userFact("brand blue #0055ff")],
      competitors: [{ name: "Rival", url: "https://rival.com", takeaway: crawledFact("they own the cheap tier") }],
      platformConstraints: [{ platform: "tiktok", aspect: "9:16", note: userFact("hook in first 2s") }],
    });
    const flat = allFacts(pack);
    expect(flat.map((f) => f.value).sort()).toEqual([
      "brand blue #0055ff",
      "hook in first 2s",
      "they own the cheap tier",
    ]);
  });
});

describe("composer wraps the existing artifacts", () => {
  const research = parseProductBrandFacts({
    depth: "deep",
    productFacts: ["95% OCR accuracy"],
    sources: [{ id: "1", url: "https://example.com" }],
  });
  const refPack = parseRefPack({
    projectId: "demo-001",
    entries: [{ type: "product", path: "artifacts/refs/hero.png", locked: true }],
  });
  const benchmark = parseBenchmarkSet({
    slug: "product-ugc-review",
    name: "Product UGC review",
    mode: "ugc-review",
    format: "video",
    examples: [
      { label: "good", features: ["problem-first hook"] },
      { label: "bad", features: ["slow open"] },
    ],
  });

  test("embeds research / refPack / benchmark verbatim and records pointers", () => {
    const pack = buildIntelligencePack({
      projectId: "demo-001",
      mode: "ugc-review",
      research,
      researchFactsRef: "artifacts/refs/research-facts.json",
      refPack,
      refPackRef: "ref-pack.json",
      benchmark,
      contactSheetRef: "artifacts/refs/contact-sheet.png",
    });
    expect(pack.research).toEqual(research);
    expect(pack.refPack).toEqual(refPack);
    expect(pack.benchmark).toEqual(benchmark);
    expect(pack.researchFactsRef).toBe("artifacts/refs/research-facts.json");
    expect(pack.refPackRef).toBe("ref-pack.json");
    expect(pack.contactSheetRef).toBe("artifacts/refs/contact-sheet.png");
    // Benchmark slug is taken from the set itself.
    expect(pack.benchmarkSlug).toBe("product-ugc-review");
  });

  test("composes nothing into a valid empty pack when no inputs given", () => {
    const pack = buildIntelligencePack();
    expect(pack.research).toBeUndefined();
    expect(pack.refPack).toBeUndefined();
    expect(pack.benchmark).toBeUndefined();
    expect(pack.benchmarkSlug).toBeUndefined();
    expect(allFacts(pack)).toEqual([]);
  });

  test("composer output always validates", () => {
    const pack = buildIntelligencePack({ research, refPack });
    expect(() => parseIntelligencePack(pack)).not.toThrow();
  });
});

describe("requiredIntelligenceFor (the required-ref matrix, #3)", () => {
  test("commercial mode requires product + refPack", () => {
    // ugc-review declares requiredRefTypes ["product"] → fidelity-gated.
    const req = requiredIntelligenceFor("ugc-review");
    expect(req).toContain("product");
    expect(req).toContain("refPack");
  });

  test("brand-anchored deep-research mode requires brand + research too", () => {
    // ad-creative-pack: requiredRefTypes ["brand","product"], defaultResearchDepth "deep".
    const req = requiredIntelligenceFor("ad-creative-pack");
    expect(req).toEqual(expect.arrayContaining(["product", "brand", "refPack", "research"]));
  });

  test("generic craft mode requires nothing", () => {
    // typography-animation: no real-entity anchor, research depth "none".
    expect(requiredIntelligenceFor("typography-animation")).toEqual([]);
  });

  test("unknown mode requires nothing", () => {
    expect(requiredIntelligenceFor("not-a-mode")).toEqual([]);
  });

  test("required fields are a subset of the declared field set, in stable order", () => {
    const req = requiredIntelligenceFor("ad-creative-pack");
    for (const f of req) expect(INTELLIGENCE_FIELDS).toContain(f);
    // Order matches INTELLIGENCE_FIELDS (no duplicates, ascending index).
    const idx = req.map((f) => INTELLIGENCE_FIELDS.indexOf(f));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });
});

describe("missingRequirements (planning block/downgrade signal)", () => {
  const product = parseProductBrandFacts({});
  const refPack = parseRefPack({ entries: [{ type: "product", path: "artifacts/refs/hero.png" }] });
  const emptyRefPack = parseRefPack({ entries: [] });

  test("empty pack is missing every required field for the mode", () => {
    const pack = buildIntelligencePack({ mode: "ugc-review" });
    expect(missingRequirements(pack)).toEqual(requiredIntelligenceFor("ugc-review"));
  });

  test("a satisfied pack reports no missing fields", () => {
    const pack = buildIntelligencePack({
      mode: "ugc-review",
      product: [userFact("the product is a coffee grinder")],
      refPack,
    });
    expect(missingRequirements(pack)).toEqual([]);
  });

  test("an empty-entries refPack does NOT satisfy the refPack requirement", () => {
    const pack = buildIntelligencePack({
      mode: "ugc-review",
      product: [userFact("x")],
      refPack: emptyRefPack,
    });
    expect(missingRequirements(pack)).toContain("refPack");
  });

  test("a deep research mode still misses research until research is composed", () => {
    const pack = buildIntelligencePack({
      mode: "ad-creative-pack",
      brand: [crawledFact("brand red")],
      product: [crawledFact("product X")],
      refPack,
    });
    expect(missingRequirements(pack)).toEqual(["research"]);
    const filled = buildIntelligencePack({
      mode: "ad-creative-pack",
      brand: [crawledFact("brand red")],
      product: [crawledFact("product X")],
      refPack,
      research: parseProductBrandFacts({ depth: "deep" }),
    });
    expect(missingRequirements(filled)).toEqual([]);
    // Unused binding kept readable.
    expect(product.version).toBe(1);
  });

  test("an explicit mode argument overrides the pack's recorded mode", () => {
    const pack = buildIntelligencePack({ mode: "typography-animation" });
    expect(missingRequirements(pack)).toEqual([]); // craft mode, nothing required
    expect(missingRequirements(pack, "ugc-review")).toEqual(requiredIntelligenceFor("ugc-review"));
  });

  test("a pack with no mode requires nothing", () => {
    const pack = buildIntelligencePack({ product: [userFact("x")] });
    expect(missingRequirements(pack)).toEqual([]);
  });
});
