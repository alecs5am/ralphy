// Research bootstrap tests (#416).
//
// `chooseResearchDepth` is the deterministic depth decision the agent runs
// BEFORE the production plan: it composes the #412 content-mode
// `defaultResearchDepth` baseline with auto-triggers detected on the brief and
// returns the matched trigger list + a human reason. No LLM, no network.
//
// English-only-on-disk: every fixture brief is plain English. The "low-detail
// niche" case uses an off-domain English string (the worked pattern from
// template-suggest.test.ts), NOT a Russian utterance — it produces the same
// low-keyword path.

import { describe, test, expect } from "bun:test";
import {
  chooseResearchDepth,
  RESEARCH_TRIGGERS,
  DEPTH_ROUTING,
} from "../../cli/lib/research-bootstrap";
import {
  ProductBrandFactsSchema,
  parseProductBrandFacts,
  RESEARCH_FACTS_ARTIFACT,
} from "../../cli/lib/schemas/research-facts";
import { CONTENT_MODES } from "../../cli/lib/content-modes";

describe("chooseResearchDepth — the four issue routes", () => {
  test("(a) product URL → at least quick + product-url trigger", () => {
    const d = chooseResearchDepth({
      brief: "Make a few ads for my widget at https://acme-store.example.com/products/widget-pro",
    });
    expect(d.triggers).toContain("product-url");
    // product URL demands quick; mode baseline may push deeper but never lower.
    expect(["quick", "deep"]).toContain(d.depth);
    expect(d.reason).toContain("product URL");
  });

  test("(b) brand URL → at least quick + brand-url trigger", () => {
    const d = chooseResearchDepth({
      brief: "Build a hero banner grounded in https://example-brand.example.com",
    });
    expect(d.triggers).toContain("brand-url");
    expect(["quick", "deep"]).toContain(d.depth);
    expect(d.reason).toContain("brand URL");
  });

  test("(c) generic niche with no detail → deep + niche-low-detail trigger", () => {
    // Off-domain English, deliberately low on creative-detail markers.
    const d = chooseResearchDepth({ brief: "make content for the lawn care niche" });
    expect(d.triggers).toContain("niche-low-detail");
    expect(d.depth).toBe("deep");
    expect(d.reason).toContain("without enough creative detail");
  });

  test("(d) creator / reference URL → at least quick + creator-url trigger", () => {
    const d = chooseResearchDepth({
      brief: "Make one like this https://www.tiktok.com/@somecreator/video/123456",
    });
    expect(d.triggers).toContain("creator-url");
    expect(["quick", "deep"]).toContain(d.depth);
    expect(d.reason).toContain("creator");
  });

  test("(d') bare @handle is also a creator reference", () => {
    const d = chooseResearchDepth({ brief: "analyze @somecreator and match their style" });
    expect(d.triggers).toContain("creator-url");
  });
});

describe("chooseResearchDepth — composition with #412 defaultResearchDepth", () => {
  test("no trigger, high-detail brief respects the mode default (none)", () => {
    // A detailed restyle brief: restyle mode defaults to `none`; no trigger fires.
    const brief =
      "Restyle this uploaded photo into a clean swiss minimal aesthetic, keep the subject, 1:1 aspect, muted palette, crisp typography";
    const d = chooseResearchDepth({ brief, contentMode: "restyle" });
    expect(CONTENT_MODES["restyle"].defaultResearchDepth).toBe("none");
    expect(d.modeBaseline).toBe("none");
    expect(d.triggers).toEqual([]);
    expect(d.depth).toBe("none");
    expect(d.reason).toContain("skip research");
  });

  test("a mode whose default is deep stays deep even with no trigger", () => {
    expect(CONTENT_MODES["tv-ad"].defaultResearchDepth).toBe("deep");
    const d = chooseResearchDepth({
      brief: "produce a polished cinematic commercial spot with a clear concept and locked register and 30 second duration",
      contentMode: "tv-ad",
    });
    expect(d.modeBaseline).toBe("deep");
    expect(d.depth).toBe("deep");
  });

  test("a quick-default mode escalates to deep under a farm trigger", () => {
    // lifestyle-scene defaults to quick; a content-farm request escalates it.
    expect(CONTENT_MODES["lifestyle-scene"].defaultResearchDepth).toBe("quick");
    const d = chooseResearchDepth({
      brief: "build a content farm of lifestyle scenes for my brand",
      contentMode: "lifestyle-scene",
    });
    expect(d.triggers).toContain("multi-unit-farm");
    expect(d.depth).toBe("deep");
  });

  test("brand URL + farm request escalates quick → deep (the issue example)", () => {
    const d = chooseResearchDepth({
      brief: "Make a batch of 32 FB creatives for https://example-brand.example.com",
    });
    expect(d.triggers).toContain("brand-url");
    expect(d.triggers).toContain("multi-unit-farm");
    expect(d.depth).toBe("deep");
  });
});

describe("chooseResearchDepth — multi-unit + performance triggers", () => {
  test("explicit unitCount ≥ 4 fires the farm trigger → deep", () => {
    const d = chooseResearchDepth({
      brief: "lifestyle scenes for my coffee brand",
      contentMode: "lifestyle-scene",
      unitCount: 8,
    });
    expect(d.triggers).toContain("multi-unit-farm");
    expect(d.depth).toBe("deep");
  });

  test("a count phrase like '10 ads' fires the farm trigger", () => {
    const d = chooseResearchDepth({ brief: "make 10 ads for my pastry shop" });
    expect(d.triggers).toContain("multi-unit-farm");
    expect(d.depth).toBe("deep");
  });

  test("a platform performance goal fires the performance trigger → deep", () => {
    const d = chooseResearchDepth({
      brief: "I want a TikTok that goes viral and maximizes watch time and scroll-stop",
    });
    expect(d.triggers).toContain("platform-performance-goal");
    expect(d.depth).toBe("deep");
  });
});

describe("chooseResearchDepth — determinism + shape", () => {
  test("is deterministic for the same input", () => {
    const brief = "ads for https://acme-store.example.com/products/widget";
    const a = chooseResearchDepth({ brief });
    const b = chooseResearchDepth({ brief });
    expect(a).toEqual(b);
  });

  test("every fired trigger is a member of RESEARCH_TRIGGERS", () => {
    const d = chooseResearchDepth({
      brief: "batch of 12 viral TikToks like https://www.tiktok.com/@c/video/1 for https://b.example.com/products/x",
    });
    for (const t of d.triggers) expect(RESEARCH_TRIGGERS).toContain(t);
  });

  test("every depth has an existing-surface routing note (no new crawler)", () => {
    expect(DEPTH_ROUTING.none.surface).toContain("skip");
    expect(DEPTH_ROUTING.quick.surface).toContain("site-grounding");
    expect(DEPTH_ROUTING.deep.surface).toContain("research run");
  });

  test("empty brief with no mode → none, no triggers", () => {
    const d = chooseResearchDepth({ brief: "" });
    expect(d.depth).toBe("none");
    expect(d.triggers).toEqual([]);
  });
});

describe("ProductBrandFacts schema (#416)", () => {
  test("parses a representative facts object", () => {
    const obj = {
      depth: "quick",
      productFacts: ["95% OCR accuracy", "$0.003 per page"],
      brandAssets: ["Primary CTA blue #3B82F6", "Inter display + JetBrains Mono code"],
      audience: ["AI engineers", "document-pipeline builders"],
      proofPoints: ["100+ languages", "named logos: Cursor, Codex"],
      claimsToAvoid: ["No Python SDK — REST only"],
      visualReferences: [
        { url: "https://www.tiktok.com/@c/video/1", note: "hook in first 2s", refSlug: "ref-c-1" },
      ],
      platformFit: [
        { platform: "tiktok", aspect: "9:16", durationBand: "15-30s", note: "fast cuts" },
      ],
      sources: [{ id: "1", url: "https://example-brand.example.com", title: "Home" }],
    };
    const parsed = parseProductBrandFacts(obj);
    expect(parsed.version).toBe(1);
    expect(parsed.depth).toBe("quick");
    expect(parsed.productFacts.length).toBe(2);
    expect(parsed.visualReferences[0]!.url).toContain("tiktok.com");
    expect(parsed.platformFit[0]!.platform).toBe("tiktok");
    expect(typeof parsed.generatedAt).toBe("string");
  });

  test("an empty object parses to safe defaults", () => {
    const parsed = ProductBrandFactsSchema.parse({});
    expect(parsed.productFacts).toEqual([]);
    expect(parsed.brandAssets).toEqual([]);
    expect(parsed.sources).toEqual([]);
    expect(parsed.depth).toBe("quick");
  });

  test("rejects a malformed object (bad depth + non-string fact)", () => {
    expect(() =>
      ProductBrandFactsSchema.parse({ depth: "shallow", productFacts: [42] }),
    ).toThrow();
  });

  test("rejects a visual reference with no url", () => {
    expect(() =>
      ProductBrandFactsSchema.parse({ visualReferences: [{ note: "no url here" }] }),
    ).toThrow();
  });

  test("the facts artifact lands under artifacts/refs/", () => {
    expect(RESEARCH_FACTS_ARTIFACT).toBe("artifacts/refs/research-facts.json");
  });
});
