// Batch variance rotation-assignment coverage (#529) — cli/lib/eval/variance-pools.ts.
//
// The rotation must COVER the pools with no dimension starved: over a batch of
// >= pool size, every categorical pool value is used; target lengths spread
// across the range (not a constant); section orders vary. Pure — no fs, no env,
// no cwd mutation.
//
// English-only on disk.

import { describe, test, expect } from "bun:test";
import {
  assignBatchProfiles,
  assignVarianceProfile,
  varianceSlots,
  familyFor,
} from "../../cli/lib/eval/variance-pools.js";

describe("variance rotation coverage", () => {
  test("a 12-item article batch covers each categorical pool with no dimension starved", () => {
    const profiles = assignBatchProfiles("article", 12, "camp-a");
    const hooks = new Set(profiles.map((p) => p.hookType));
    const intros = new Set(profiles.map((p) => p.introStructure));
    const ctas = new Set(profiles.map((p) => p.ctaPhrasing));
    // The article pool has 6 hooks, 4 intros, 5 CTAs — a batch of 12 must hit every value.
    expect(hooks.size).toBe(6);
    expect(intros.size).toBe(4);
    expect(ctas.size).toBe(5);
  });

  test("target length is SAMPLED (spreads across the range, not a constant)", () => {
    const profiles = assignBatchProfiles("article", 20, "camp-len");
    const lengths = new Set(profiles.map((p) => p.targetLength));
    // Not all identical — a constant length is itself a tell.
    expect(lengths.size).toBeGreaterThan(1);
    for (const p of profiles) {
      expect(p.targetLength).toBeGreaterThanOrEqual(700);
      expect(p.targetLength).toBeLessThanOrEqual(2200);
      expect(p.targetLengthUnit).toBe("words");
    }
  });

  test("section order is a permutation of the pool sections (varies across items)", () => {
    const profiles = assignBatchProfiles("video", 8, "camp-sec");
    const orders = new Set(profiles.map((p) => p.sectionOrder.join(">")));
    expect(orders.size).toBeGreaterThan(1);
    // Every order is a full permutation (same members, reordered).
    const sorted0 = [...profiles[0]!.sectionOrder].sort().join(",");
    for (const p of profiles) {
      expect([...p.sectionOrder].sort().join(",")).toBe(sorted0);
    }
  });

  test("deterministic — same format+count+salt yields identical profiles", () => {
    const a = assignBatchProfiles("video", 6, "same");
    const b = assignBatchProfiles("video", 6, "same");
    expect(a).toEqual(b);
  });

  test("salt separates two same-size batches (not lockstep)", () => {
    const a = assignBatchProfiles("short", 5, "camp-x");
    const b = assignBatchProfiles("short", 5, "camp-y");
    // At least one item's sampled length or order differs between salts.
    const aKey = a.map((p) => `${p.targetLength}:${p.sectionOrder.join(">")}`).join("|");
    const bKey = b.map((p) => `${p.targetLength}:${p.sectionOrder.join(">")}`).join("|");
    expect(aKey).not.toBe(bKey);
  });

  test("format → family mapping resolves the four families", () => {
    expect(familyFor("article")).toBe("article");
    expect(familyFor("video")).toBe("video");
    expect(familyFor("motion-design")).toBe("video");
    expect(familyFor("podcast-cuts")).toBe("short");
    expect(familyFor("carousel")).toBe("still");
    expect(familyFor("poster")).toBe("still");
  });

  test("varianceSlots emits the template-string slots the prompt substitutes", () => {
    const p = assignVarianceProfile("article", 0, 3, "s");
    const slots = varianceSlots(p);
    expect(Object.keys(slots).sort()).toEqual(
      [
        "VARIANCE_CAPTION_FORMULA",
        "VARIANCE_CTA_PHRASING",
        "VARIANCE_HOOK_TYPE",
        "VARIANCE_INTRO_STRUCTURE",
        "VARIANCE_SECTION_ORDER",
        "VARIANCE_TARGET_LENGTH",
      ].sort(),
    );
    expect(slots.VARIANCE_TARGET_LENGTH).toContain("words");
    expect(slots.VARIANCE_SECTION_ORDER).toContain(">");
  });
});
