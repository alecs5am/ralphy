// #454 — open-world mode compiler + provisional-mode profile.
//
// compileMode() wraps the existing classifyContentMode() and adds the
// known | ambiguous | unknown status + the closest media-format fallback;
// buildProvisionalMode() drafts a deterministic starting profile for an
// unknown ask. All fixtures are English (off-domain strings hit the
// nothing-scored / unknown path without any non-Latin text).

import { describe, test, expect } from "bun:test";
import {
  compileMode,
  inferClosestFormat,
  MEDIA_FORMATS,
} from "../../cli/lib/content-modes.js";
import {
  buildProvisionalMode,
  parseProvisionalMode,
} from "../../cli/lib/schemas/provisional-mode.js";

describe("compileMode — open-world status", () => {
  test("a strong, registered ask resolves to a known + supported mode", () => {
    const c = compileMode("a clean studio product shot of a perfume bottle");
    expect(c.status).toBe("known");
    expect(c.mode).toBe("product-shot");
    expect(c.supported).toBe(true);
    expect(c.closestFormat).toBe("image");
    expect(c.reasons.length).toBeGreaterThan(0);
  });

  test("a recognizable format ask still resolves known (can map after research)", () => {
    const c = compileMode("a 5-slide carousel explaining tax law");
    expect(c.status).toBe("known");
    expect(c.closestFormat).toBe("carousel");
  });

  test("a genuinely novel ask stays unknown — no content-mode claim", () => {
    const c = compileMode("a holographic interpretive dance NFT for my crypto DAO");
    expect(c.status).toBe("unknown");
    expect(c.mode).toBeNull();
    expect(c.supported).toBe(false); // never promise a mode for unknown
  });

  test("unknown ask still infers the closest MEDIA FORMAT to discover into", () => {
    const c = compileMode("generate a soothing rain ambient soundscape track");
    expect(c.status).toBe("unknown");
    expect(c.closestFormat).toBe("audio"); // a container hint, not a mode
    expect(MEDIA_FORMATS).toContain(c.closestFormat);
  });

  test("an off-domain non-content brief is unknown with no inferable container", () => {
    const c = compileMode("reconcile the quarterly ledger spreadsheet variances");
    expect(c.status).toBe("unknown");
    expect(c.closestFormat).toBe("unknown");
  });
});

describe("inferClosestFormat", () => {
  test("specific cues beat generic ones", () => {
    expect(inferClosestFormat("a swipe-through carousel deck")).toBe("carousel");
    expect(inferClosestFormat("a kinetic motion graphics intro")).toBe("motion-design");
    expect(inferClosestFormat("a podcast voiceover episode")).toBe("audio");
  });
  test("returns unknown when no container cue is present", () => {
    expect(inferClosestFormat("reconcile the ledger variances")).toBe("unknown");
  });
});

describe("buildProvisionalMode", () => {
  test("drafts a schema-valid, permanently-provisional skeleton for an unknown ask", () => {
    const brief = "a holographic interpretive dance NFT for my crypto DAO";
    const p = buildProvisionalMode(brief);
    // Round-trips through the schema.
    expect(() => parseProvisionalMode(p)).not.toThrow();
    // The load-bearing #454 rule: provisional may produce, never claims support parity.
    expect(p.supportLevel).toBe("provisional");
    expect(p.format).toBe("unknown");
    expect(p.brief).toBe(brief);
    expect(p.slug.startsWith("provisional-")).toBe(true);
    // Stricter checkpoints: at least the profile + pre-paid-gen gates, all blocking.
    expect(p.checkpointCadence.length).toBeGreaterThanOrEqual(2);
    expect(p.checkpointCadence.every((c) => c.blocking)).toBe(true);
    expect(p.checkpointCadence.some((c) => c.id === "pre-paid-gen")).toBe(true);
    // Always seeds risks + assumptions so the agent vets, never a blank page.
    expect(p.risks.length).toBeGreaterThan(0);
    expect(p.assumptions.length).toBeGreaterThan(0);
  });

  test("a video-format unknown seeds video quality gates", () => {
    const p = buildProvisionalMode("a fictional 8-bit dream-journal montage clip thing");
    expect(p.format).toBe("video");
    expect(p.qualityGates).toContain("scoreVideo");
  });
});
