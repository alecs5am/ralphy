import { describe, test, expect } from "bun:test";
import {
  TemplateYamlSchema,
  validateSlug,
  isSupportedVersion,
  DENIED_SLUG_TOKENS,
} from "../../cli/lib/schemas/template.ts";

describe("Template schema (02.05.01)", () => {
  test("accepts a minimal valid template", () => {
    const ok = TemplateYamlSchema.safeParse({
      version: 1,
      id: "yap-talking-head",
      kind: "vibe-style",
      category: "b2b-saas",
      name: "YAP Talking-Head",
      description: "single-idea direct-to-camera monologue",
    });
    expect(ok.success).toBe(true);
  });

  test("rejects a template without version", () => {
    const bad = TemplateYamlSchema.safeParse({
      id: "x", kind: "vibe-style", category: "b2b-saas", name: "x", description: "x",
    });
    expect(bad.success).toBe(false);
  });

  test("rejects unknown kind", () => {
    const bad = TemplateYamlSchema.safeParse({
      version: 1, id: "x", kind: "free-form", category: "b2b-saas", name: "x", description: "x",
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
