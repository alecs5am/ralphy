import { describe, test, expect } from "bun:test";
import {
  TemplateYamlSchema,
  validateSlug,
  isSupportedVersion,
  DENIED_SLUG_TOKENS,
  TEMPLATE_FORMATS,
} from "../../cli/lib/schemas/template.ts";

describe("Template schema (02.05.01)", () => {
  test("accepts a minimal valid template", () => {
    const ok = TemplateYamlSchema.safeParse({
      version: 1,
      id: "yap-talking-head",
      kind: "vibe-style",
      category: "b2b-saas",
      format: "video",
      name: "YAP Talking-Head",
      description: "single-idea direct-to-camera monologue",
    });
    expect(ok.success).toBe(true);
  });

  test("rejects a template without version", () => {
    const bad = TemplateYamlSchema.safeParse({
      id: "x", kind: "vibe-style", category: "b2b-saas", format: "video", name: "x", description: "x",
    });
    expect(bad.success).toBe(false);
  });

  test("rejects unknown kind", () => {
    const bad = TemplateYamlSchema.safeParse({
      version: 1, id: "x", kind: "free-form", category: "b2b-saas", format: "video", name: "x", description: "x",
    });
    expect(bad.success).toBe(false);
  });

  test("isSupportedVersion accepts 1, rejects others", () => {
    expect(isSupportedVersion(1)).toBe(true);
    expect(isSupportedVersion(2)).toBe(false);
    expect(isSupportedVersion("1")).toBe(false);
    expect(isSupportedVersion(undefined)).toBe(false);
  });
});

describe("Template format taxonomy (052)", () => {
  const base = {
    version: 1 as const,
    id: "some-template",
    kind: "vibe-style" as const,
    category: "b2b-saas" as const,
    name: "x",
    description: "x",
  };

  test("rejects a template missing format", () => {
    const bad = TemplateYamlSchema.safeParse(base);
    expect(bad.success).toBe(false);
  });

  test("rejects a format outside the enum", () => {
    const bad = TemplateYamlSchema.safeParse({ ...base, format: "hologram" });
    expect(bad.success).toBe(false);
  });

  test("accepts every member of TEMPLATE_FORMATS", () => {
    for (const format of TEMPLATE_FORMATS) {
      const res = TemplateYamlSchema.safeParse({ ...base, format });
      expect(res.success).toBe(true);
    }
  });

  test("style_of is optional and passes through when set", () => {
    const res = TemplateYamlSchema.safeParse({ ...base, format: "video", style_of: "general-video" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.style_of).toBe("general-video");
  });

  test("style_of defaults to undefined when absent", () => {
    const res = TemplateYamlSchema.safeParse({ ...base, format: "video" });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.style_of).toBeUndefined();
  });

  test("TEMPLATE_FORMATS includes the issue-052 enum (+ article, #526)", () => {
    expect([...TEMPLATE_FORMATS]).toEqual([
      "video",
      "image",
      "carousel",
      "fb-creative",
      "motion-design",
      "poster",
      "sticker-pack",
      "article",
    ]);
  });
});

describe("Slug discipline (02.06.02 / D-05)", () => {
  test("accepts archetypal slug", () => {
    const res = validateSlug("deadpan-monologue-pov");
    expect(res.ok).toBe(true);
  });

  test("rejects creator-name slug", () => {
    const res = validateSlug("hormozi-talking-head");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.token).toBe("hormozi");
  });

  test("rejects mid-string creator token (whole-token match)", () => {
    const res = validateSlug("mr-beast-style-tier-list");
    expect(res.ok).toBe(false);
  });

  test("does not falsely flag a benign substring", () => {
    // "rogan" is in the deny list. A slug like "arogant-pov" should NOT trip
    // because the matcher is whole-token (hyphen-delimited).
    const res = validateSlug("arogant-pov");
    expect(res.ok).toBe(true);
  });

  test("rejects non-kebab slug", () => {
    expect(validateSlug("UPPERCASE_BAD").ok).toBe(false);
    expect(validateSlug("trailing-").ok).toBe(false);
  });

  test("deny list is non-empty + lowercase", () => {
    expect(DENIED_SLUG_TOKENS.length).toBeGreaterThan(3);
    for (const t of DENIED_SLUG_TOKENS) {
      expect(t).toBe(t.toLowerCase());
    }
  });
});
