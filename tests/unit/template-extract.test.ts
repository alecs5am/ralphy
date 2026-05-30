// Unit tests for cli/lib/templater/extract.ts (issue #033).
//
// Covers the pure helpers in isolation — no disk, no spawn:
//   • extractSlotsFromScenario — brand/persona/VO substitution
//   • buildTemplateManifest    — v1 manifest synthesis from scenario shape
//   • readmeFromPostmortem     — Lessons-learned extraction with fallback stub
//   • extractCompositionVariables — data-composition-variables JSON parse
//   • isHeavyRef / poolDestForSlug

import { describe, test, expect } from "bun:test";
import {
  extractSlotsFromScenario,
  buildTemplateManifest,
  readmeFromPostmortem,
  extractCompositionVariables,
  isHeavyRef,
  poolDestForSlug,
  HEAVY_REF_BYTES,
  manifestToJson,
  sampleRemixDoc,
} from "../../cli/lib/templater/extract.js";

describe("extractSlotsFromScenario", () => {
  test("substitutes brand / persona / name into {{slots}}", () => {
    const scenario = {
      id: "spring-002",
      name: "ZenFlow Onboarding Reel",
      brand: "zenflow",
      persona: "maxim",
      scenes: [],
    };
    const { scenario: patched, slots } = extractSlotsFromScenario(scenario);
    expect(slots.brand).toBe("zenflow");
    expect(slots.persona).toBe("maxim");
    expect(slots.project_name).toBe("ZenFlow Onboarding Reel");
    expect((patched as any).brand).toBe("{{brand}}");
    expect((patched as any).persona).toBe("{{persona}}");
    expect((patched as any).name).toBe("{{project_name}}");
    // Untouched keys preserved.
    expect((patched as any).id).toBe("spring-002");
  });

  test("substitutes per-scene voiceover.text", () => {
    const scenario = {
      brand: "acme",
      scenes: [
        { id: "scene-01", type: "hook", voiceover: { text: "Hello world", persona: "x" } },
        { id: "scene-02", type: "content", voiceover: { text: "Buy now" } },
      ],
    };
    const { scenario: patched, slots } = extractSlotsFromScenario(scenario);
    expect(slots.scene_01_voiceover).toBe("Hello world");
    expect(slots.scene_02_voiceover).toBe("Buy now");
    const ps = (patched as any).scenes;
    expect(ps[0].voiceover.text).toBe("{{scene_01_voiceover}}");
    expect(ps[1].voiceover.text).toBe("{{scene_02_voiceover}}");
    // Sibling fields on voiceover preserved.
    expect(ps[0].voiceover.persona).toBe("x");
  });

  test("no-op on non-object input", () => {
    const { scenario, slots } = extractSlotsFromScenario(null);
    expect(scenario).toBeNull();
    expect(Object.keys(slots)).toHaveLength(0);
  });

  test("skips scenes without voiceover.text", () => {
    const scenario = {
      scenes: [
        { id: "scene-01", type: "hook" },
        { id: "scene-02", voiceover: { persona: "x" } },
      ],
    };
    const { slots } = extractSlotsFromScenario(scenario);
    expect(Object.keys(slots)).toHaveLength(0);
  });
});

describe("buildTemplateManifest", () => {
  test("produces a valid v1 manifest from a scenario", () => {
    const m = buildTemplateManifest({
      slug: "extracted-demo",
      category: "entertainment-viral",
      kind: "vibe-style",
      name: "Extracted Demo",
      description: "A demo extracted template.",
      tags: ["demo", "test"],
      scenario: {
        scenes: [
          { id: "scene-01", type: "hook", durationSec: 3, label: "Hook" },
          { id: "scene-02", type: "content", durationSec: 12, label: "Body" },
          { id: "scene-03", type: "outro", durationSec: 5, label: "CTA" },
        ],
      },
    });
    expect(m.version).toBe(1);
    expect(m.id).toBe("extracted-demo");
    expect(m.category).toBe("entertainment-viral");
    expect(m.kind).toBe("vibe-style");
    expect(m.tags).toEqual(["demo", "test"]);
    expect(m.scenes).toHaveLength(3);
    expect(m.scenes[0].role).toBe("hook");
    expect(m.scenes[1].role).toBe("body");
    expect(m.scenes[2].role).toBe("cta");
    expect(m.scenes[1].duration_s).toBe(12);
    expect(m.scenes[0].direction).toBe("Hook");
  });

  test("defaults name + description when omitted", () => {
    const m = buildTemplateManifest({
      slug: "tokyo-night-loop",
      category: "cinematic-narrative",
    });
    expect(m.kind).toBe("vibe-style");
    expect(m.name).toBe("Tokyo Night Loop");
    expect(m.description.length).toBeGreaterThan(0);
  });

  test("rejects banned slug tokens", () => {
    expect(() => buildTemplateManifest({ slug: "hormozi-style", category: "b2b-saas" })).toThrow();
  });

  test("rejects invalid category", () => {
    expect(() => buildTemplateManifest({ slug: "ok-slug", category: "nope" as any })).toThrow();
  });

  test("drops malformed scenes silently", () => {
    const m = buildTemplateManifest({
      slug: "drop-bad-scenes",
      category: "dtc-commerce",
      scenario: {
        scenes: [
          { id: "scene-01", type: "hook", durationSec: 3 },
          { id: "not-a-scene", type: "hook", durationSec: 2 }, // bad id
          { id: "scene-03", type: "hook", durationSec: 999 }, // duration > 120
          null,
        ],
      },
    });
    expect(m.scenes).toHaveLength(1);
    expect(m.scenes[0].id).toBe("scene-01");
  });

  test("manifestToJson round-trips", () => {
    const m = buildTemplateManifest({ slug: "round-trip", category: "creator-lifestyle" });
    const json = manifestToJson(m);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe("round-trip");
    expect(parsed.version).toBe(1);
  });
});

describe("readmeFromPostmortem", () => {
  test("extracts Lessons learned section", () => {
    const pm = [
      "# Postmortem",
      "",
      "## Chat history",
      "blah",
      "",
      "## Lessons learned",
      "",
      "1. Don't ship at 3am.",
      "2. Always run lint.",
      "",
      "## Next section",
      "more",
    ].join("\n");
    const readme = readmeFromPostmortem({ slug: "demo", category: "b2b-saas", postmortem: pm, projectId: "demo-001" });
    expect(readme).toContain("# demo");
    expect(readme).toContain("Lessons learned");
    expect(readme).toContain("Don't ship at 3am");
    expect(readme).toContain("Always run lint");
    expect(readme).not.toContain("Next section");
    expect(readme).toContain("demo-001");
  });

  test("matches case-insensitively + 'Lesson learned' singular", () => {
    const pm = "## lessons LEARNED\n\nbody\n";
    const readme = readmeFromPostmortem({ slug: "x", category: "b2b-saas", postmortem: pm });
    expect(readme).toContain("body");
  });

  test("falls back to stub when no Lessons section", () => {
    const readme = readmeFromPostmortem({ slug: "stub-test", category: "b2b-saas", postmortem: "## Chat\nblah" });
    expect(readme).toContain("# stub-test");
    expect(readme).toContain("TODO: run `/postmortem`");
  });

  test("falls back to stub when postmortem missing", () => {
    const readme = readmeFromPostmortem({ slug: "no-pm", category: "b2b-saas" });
    expect(readme).toContain("# no-pm");
    expect(readme).toContain("TODO: run `/postmortem`");
  });
});

describe("extractCompositionVariables", () => {
  test("parses data-composition-variables JSON array", () => {
    const html = `<html data-composition-variables='[{"id":"x","type":"string","default":"hi"}]'><head></head></html>`;
    const vars = extractCompositionVariables(html);
    expect(vars).not.toBeNull();
    expect(vars!.length).toBe(1);
    expect((vars![0] as any).id).toBe("x");
  });

  test("returns null when attribute missing", () => {
    expect(extractCompositionVariables("<html><head></head></html>")).toBeNull();
  });

  test("returns null on malformed JSON", () => {
    expect(extractCompositionVariables(`<html data-composition-variables='[not json'>`)).toBeNull();
  });
});

describe("misc helpers", () => {
  test("isHeavyRef threshold at 1MB", () => {
    expect(isHeavyRef(HEAVY_REF_BYTES)).toBe(true);
    expect(isHeavyRef(HEAVY_REF_BYTES - 1)).toBe(false);
    expect(isHeavyRef(0)).toBe(false);
  });

  test("poolDestForSlug builds the right path", () => {
    const p = poolDestForSlug("/tmp/ralphy-assets", "demo-slug", "master.png");
    expect(p).toBe("/tmp/ralphy-assets/pool/demo-slug/master.png");
  });

  test("sampleRemixDoc contains the ralphy template use command", () => {
    const doc = sampleRemixDoc({ slug: "demo-slug", category: "b2b-saas" });
    expect(doc).toContain("ralphy template use demo-slug");
    expect(doc).toContain("ralphy render");
  });
});
