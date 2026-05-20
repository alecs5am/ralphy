// Unit tests for cli/lib/eval/refs.ts (04.02.02).
//
// The classifier MUST:
//   • Return required:false for generic product / lifestyle work.
//   • Return required:true with kind="person" on named real humans.
//   • Return required:true with kind="brand-product" on recognizable brands.
//   • Return required:true with kind="ip" on recognizable IP / characters.
//   • Skip generic role labels ("a barista", "the founder", archetype slugs).

import { describe, test, expect } from "bun:test";
import {
  needsReference,
  flattenScenarioText,
  isGenericArchetype,
  checkReferenceGate,
} from "../../cli/lib/eval/refs.js";

describe("needsReference — no-gate (generic) cases", () => {
  test("generic coffee-shop pastry brief → required:false", () => {
    const r = needsReference(
      "Make me a TikTok about my coffee shop's new croissant — autumn vibe, founder on camera.",
    );
    expect(r.required).toBe(false);
  });

  test("workout app brief → required:false", () => {
    const r = needsReference(
      "15s ad for a no-name workout app, athletic woman in her 30s, gym setting.",
    );
    expect(r.required).toBe(false);
  });

  test("empty / whitespace input → required:false", () => {
    expect(needsReference("").required).toBe(false);
    expect(needsReference("   \n  ").required).toBe(false);
  });

  test("structured scenario with archetype persona → required:false", () => {
    const r = needsReference({
      name: "Founder testimonial",
      character: { name: "founder", role: "small business owner" },
      scenes: [
        { keyframe_prompt_brief: "Soft daylight, cozy cafe interior" },
        { keyframe_prompt_brief: "Hands plating a croissant on a wooden board" },
      ],
    });
    expect(r.required).toBe(false);
  });
});

describe("needsReference — person bucket", () => {
  test("'Elon Musk' triggers person gate", () => {
    const r = needsReference("Skit with Elon Musk roasting his own cybertruck");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("person");
    expect(r.matches?.[0]?.toLowerCase()).toContain("elon musk");
  });

  test("'MrBeast' triggers person gate (single token)", () => {
    const r = needsReference("Make it like a MrBeast challenge intro");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("person");
  });

  test("'Beyoncé' triggers person gate (accent + ascii forms)", () => {
    expect(needsReference("Lookalike of Beyonce").required).toBe(true);
    expect(needsReference("Lookalike of Beyoncé").required).toBe(true);
  });

  test("scenario.description carries the name", () => {
    const r = needsReference({
      name: "ceo-testimonial",
      description: "Voiceover as if read by Steve Jobs in his 1998 keynote tone",
      scenes: [{ keyframe_prompt_brief: "Black turtleneck, dark stage, single spotlight" }],
    });
    expect(r.required).toBe(true);
    expect(r.kind).toBe("person");
  });
});

describe("needsReference — brand-product bucket", () => {
  test("'Coca-Cola can' triggers brand-product gate", () => {
    const r = needsReference("Close-up of a Coca-Cola can sweating ice droplets");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("brand-product");
  });

  test("'iPhone 16' triggers brand-product gate", () => {
    const r = needsReference("Hands unboxing an iPhone 16 Pro Max on a marble desk");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("brand-product");
  });

  test("'Old Spice' triggers brand-product gate (the venom-bodywash trap)", () => {
    const r = needsReference("Old Spice style commercial — bare-chest guy on a horse");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("brand-product");
  });

  test("'McDonald's' triggers brand-product gate", () => {
    const r = needsReference("Time-lapse of a McDonald's fries box being assembled");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("brand-product");
  });

  test("scenario.brand field is included in the scan", () => {
    const r = needsReference({
      name: "Bodywash hero",
      brand: "Old Spice",
      scenes: [{ keyframe_prompt_brief: "Bare-chest guy on a horse in golden light" }],
    });
    expect(r.required).toBe(true);
    expect(r.kind).toBe("brand-product");
  });
});

describe("needsReference — ip bucket", () => {
  test("'Pikachu' triggers ip gate", () => {
    const r = needsReference("Pikachu does a TikTok dance");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("ip");
  });

  test("'Darth Vader' triggers ip gate", () => {
    const r = needsReference("Darth Vader reads bedtime stories");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("ip");
  });

  test("'Spider-Man' triggers ip gate (hyphenated)", () => {
    const r = needsReference("Spider-Man trying to make coffee");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("ip");
  });
});

describe("needsReference — priority + ordering", () => {
  test("person + brand together → person wins (clearest UX)", () => {
    const r = needsReference("Elon Musk drinks a Coca-Cola");
    expect(r.required).toBe(true);
    expect(r.kind).toBe("person");
  });

  test("brand + ip together → brand-product wins (real-world > fictional)", () => {
    const r = needsReference("Spider-Man holds an iPhone 16");
    expect(r.required).toBe(true);
    // Person bucket is empty, brand bucket is checked before ip.
    expect(r.kind).toBe("brand-product");
  });
});

describe("flattenScenarioText", () => {
  test("string input passes through", () => {
    expect(flattenScenarioText("hello world")).toBe("hello world");
  });

  test("scenario with character + scenes is concatenated", () => {
    const text = flattenScenarioText({
      name: "Project A",
      character: { name: "Engineer", role: "factory worker" },
      scenes: [
        { keyframe_prompt_brief: "shot one" },
        { motion_prompt: "shot two" },
        { voEn: "voice one" },
        { voRu: "voice two" },
      ],
    });
    expect(text).toContain("Project A");
    expect(text).toContain("Engineer");
    expect(text).toContain("factory worker");
    expect(text).toContain("shot one");
    expect(text).toContain("shot two");
    expect(text).toContain("voice one");
    expect(text).toContain("voice two");
  });
});

describe("isGenericArchetype", () => {
  test("known archetypes are generic", () => {
    expect(isGenericArchetype("barista")).toBe(true);
    expect(isGenericArchetype("founder")).toBe(true);
    expect(isGenericArchetype("it-remote")).toBe(true);
    expect(isGenericArchetype("a courier")).toBe(true);
  });

  test("named people are not generic", () => {
    expect(isGenericArchetype("Elon Musk")).toBe(false);
    expect(isGenericArchetype("Beyonce")).toBe(false);
  });

  test("empty / null is generic (no gate)", () => {
    expect(isGenericArchetype(undefined)).toBe(true);
    expect(isGenericArchetype("")).toBe(true);
    expect(isGenericArchetype("   ")).toBe(true);
  });
});

describe("checkReferenceGate", () => {
  test("generic brief → satisfied:true (no gate fires)", () => {
    const r = checkReferenceGate("Make me a generic coffee ad");
    expect(r.required).toBe(false);
    expect(r.satisfied).toBe(true);
  });

  test("named brand WITHOUT attached refs → satisfied:false", () => {
    const r = checkReferenceGate("Old Spice style hero shot", []);
    expect(r.required).toBe(true);
    expect(r.satisfied).toBe(false);
  });

  test("named brand WITH attached refs → satisfied:true", () => {
    const r = checkReferenceGate("Old Spice style hero shot", [
      { kind: "screenshot", id: "old-spice-logo-001" },
    ]);
    expect(r.required).toBe(true);
    expect(r.satisfied).toBe(true);
  });
});
