// Mode-completeness smoke tests — issue #446.
//
// #446 is the CONSOLIDATING completeness smoke that ties the whole production
// contract together PER MODE: routing + #418 contract compile + required
// artifacts + research depth + ref requirements + quality gates + Unit shape +
// doc/guideline coverage. A mode does not count as "supported" unless all of
// these work together. This file pins:
//
//   (1) the repo passes the smoke — EVERY supported mode is complete on every
//       axis (and `scanned` equals the supported-mode count);
//   (2) `deriveBriefForMode` produces a brief from registry keywords (no
//       hand-maintained fixture map) that classifies to the mode;
//   (3) the smoke has TEETH — a synthetic supported-mode-shaped object missing a
//       gate / doc / Unit shape is flagged by the per-mode scorer (mirrors the
//       mode-guidelines teeth test), proving the smoke isn't a rubber stamp.
//
// English-only on disk: every fixture string is plain English. The #418 contract
// compile inside `smokeModes` STUBS the LLM enrichment — NO live network.

import { describe, test, expect } from "bun:test";
import path from "node:path";
import {
  supportedContentModes,
  classifyContentMode,
  type ContentModeEntry,
} from "../../cli/lib/content-modes.js";
import {
  smokeModes,
  scoreModeSmoke,
  deriveBriefForMode,
  KNOWN_QUALITY_GATES,
} from "../../scripts/smoke-modes.js";

const REPO = path.resolve(import.meta.dir, "..", "..");

// ─── (1) The repo passes the smoke — every supported mode is complete ────────

describe("mode-completeness smoke (#446)", () => {
  test("every supported mode passes every completeness axis", async () => {
    const report = await smokeModes(REPO);
    expect(
      report.offenders,
      `incomplete supported modes:\n${report.offenders
        .map((o) => `  ${o.mode}: ${o.missing.join("; ")}`)
        .join("\n")}`,
    ).toEqual([]);
    expect(report.ok).toBe(true);
  });

  test("scanned count equals the number of supported modes", async () => {
    const report = await smokeModes(REPO);
    expect(report.scanned).toBe(supportedContentModes().length);
  });
});

// ─── (2) Brief derivation is registry-driven (no hand-maintained map) ────────

describe("derived briefs classify to their mode (#446)", () => {
  for (const entry of supportedContentModes()) {
    test(`deriveBriefForMode("${entry.mode}") classifies to ${entry.mode}, non-ambiguous`, () => {
      const brief = deriveBriefForMode(entry);
      expect(brief.length).toBeGreaterThan(0);
      const r = classifyContentMode(brief);
      expect(r.mode).toBe(entry.mode);
      expect(r.ambiguous).toBe(false);
    });
  }
});

// ─── (3) The smoke has TEETH — a synthetic incomplete mode is flagged ────────

describe("smoke scorer has teeth (#446)", () => {
  // A minimal complete contract stand-in for the synthetic entry (so the
  // contract axis passes and we isolate the registry-data axes the teeth probe).
  function fakeContract(over: Partial<Record<string, unknown>> = {}) {
    return {
      mode: "synthetic-smoke-mode",
      support: { supported: true, closestSupportedMode: null, reason: "" },
      format: "image",
      requiredArtifacts: ["BRIEF.md", "PRODUCTION_PLAN.md"],
      ...over,
    } as unknown as Parameters<typeof scoreModeSmoke>[0]["contract"];
  }

  // A fully-complete synthetic supported-mode entry — the baseline the teeth
  // tests strip pieces from. Format `image`, one image gate, refs declared.
  function fakeEntry(over: Partial<ContentModeEntry> = {}): ContentModeEntry {
    return {
      mode: "synthetic-smoke-mode",
      summary: "",
      supported: true,
      implementationUnit: { kind: "skill", skills: ["poster"], guidelines: [], cliVerbs: ["generate image"], note: "" },
      supportedFormats: ["image"],
      requiredInputs: ["topic or product"],
      optionalInputs: [],
      defaultResearchDepth: "quick",
      roleChain: ["intake", "art-director"],
      templateLookup: { primaryFormat: "image", tagQuery: [] },
      guidelineOrStyleLock: { required: false, guidelineSlugs: [], note: "" },
      qualityGates: ["scoreImage"],
      expectedUnitShape: { format: "image", minMedia: 1, maxMedia: 3, note: "" },
      keywords: ["synthetic smoke mode"],
      ...over,
    } as ContentModeEntry;
  }

  // A classification that routes correctly + a schema-valid contract: isolate
  // the registry-data failures so the teeth tests measure the intended axis.
  const goodClassification = {
    mode: "synthetic-smoke-mode" as never,
    confidence: 1,
    ambiguous: false,
    alternatives: [] as never[],
    scores: [] as never[],
  };
  const baseArgs = {
    entry: fakeEntry(),
    classification: goodClassification as ReturnType<typeof classifyContentMode>,
    contract: fakeContract(),
    schemaValid: true,
    coverageOk: true,
  };

  test("a fully-complete synthetic mode has NO missing pieces", () => {
    expect(scoreModeSmoke(baseArgs)).toEqual([]);
  });

  test("a mode with NO quality gate is flagged", () => {
    const missing = scoreModeSmoke({ ...baseArgs, entry: fakeEntry({ qualityGates: [] }) });
    expect(missing.some((m) => /no quality gates/.test(m))).toBe(true);
  });

  test("a mode with an UNKNOWN quality gate is flagged", () => {
    const missing = scoreModeSmoke({ ...baseArgs, entry: fakeEntry({ qualityGates: ["scoreVibes"] }) });
    expect(missing.some((m) => /unknown quality gate/.test(m))).toBe(true);
    // The known set is exactly the three canonical refuse-not-warn gates.
    expect([...KNOWN_QUALITY_GATES].sort()).toEqual(["scoreImage", "scoreScenario", "scoreVideo"]);
  });

  test("a mode with NO doc/guideline coverage is flagged", () => {
    const missing = scoreModeSmoke({ ...baseArgs, coverageOk: false });
    expect(missing.some((m) => /no quality guidance/.test(m))).toBe(true);
  });

  test("a mode whose contract omits PRODUCTION_PLAN.md is flagged", () => {
    const missing = scoreModeSmoke({
      ...baseArgs,
      contract: fakeContract({ requiredArtifacts: ["BRIEF.md"] }),
    });
    expect(missing.some((m) => /PRODUCTION_PLAN\.md/.test(m))).toBe(true);
  });

  test("a mode with an invalid Unit shape (minMedia 0) is flagged", () => {
    const missing = scoreModeSmoke({
      ...baseArgs,
      entry: fakeEntry({ expectedUnitShape: { format: "image", minMedia: 0, maxMedia: 3, note: "" } }),
    });
    expect(missing.some((m) => /minMedia/.test(m))).toBe(true);
  });

  test("a mode with no requiredInputs is flagged", () => {
    const missing = scoreModeSmoke({ ...baseArgs, entry: fakeEntry({ requiredInputs: [] }) });
    expect(missing.some((m) => /no requiredInputs/.test(m))).toBe(true);
  });

  test("a brief that routes to the WRONG mode is flagged", () => {
    const missing = scoreModeSmoke({
      ...baseArgs,
      classification: { ...goodClassification, mode: "tv-ad" as never } as ReturnType<typeof classifyContentMode>,
    });
    expect(missing.some((m) => /not routable/.test(m))).toBe(true);
  });
});
