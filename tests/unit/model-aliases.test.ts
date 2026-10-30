// #592 — model shorthand + retired-id redirects (cli/lib/model-aliases.ts).
//
// The Gemini API shut `google/gemini-3-pro-image-preview` down on 2026-06-25;
// the default moved to the GA `google/gemini-3-pro-image`. The old full id must
// keep working everywhere a `--model` is resolved, without rewriting history.

import { describe, expect, test } from "bun:test";
import {
  aliasesFor,
  canonicalSlugs,
  lookupAlias,
  resolveModelAlias,
  retiredIdsFor,
} from "../../cli/lib/model-aliases.js";

describe("model aliases — retired full ids (#592)", () => {
  test("the retired Gemini preview id resolves to the GA id", () => {
    expect(resolveModelAlias("google/gemini-3-pro-image-preview")).toBe("google/gemini-3-pro-image");
    expect(resolveModelAlias("Google/Gemini-3-Pro-Image-Preview")).toBe("google/gemini-3-pro-image");
    expect(lookupAlias("google/gemini-3-pro-image-preview")).toEqual({
      canonical: "google/gemini-3-pro-image",
      matched: true,
    });
  });

  test("a connector-prefixed retired id keeps its prefix", () => {
    expect(resolveModelAlias("openrouter:google/gemini-3-pro-image-preview")).toBe("openrouter:google/gemini-3-pro-image");
    expect(resolveModelAlias("openrouter:openai/gpt-5.4-image-2")).toBe("openrouter:openai/gpt-5.4-image-2");
  });

  test("live full ids pass through untouched", () => {
    expect(resolveModelAlias("google/gemini-3-pro-image")).toBe("google/gemini-3-pro-image");
    expect(resolveModelAlias("openai/gpt-5.4-image-2")).toBe("openai/gpt-5.4-image-2");
    expect(resolveModelAlias("vendor/unknown-model")).toBe("vendor/unknown-model");
    expect(resolveModelAlias(undefined)).toBeUndefined();
  });

  test("Gemini shorthand now lands on the GA id", () => {
    for (const s of ["nano banana pro", "nano-banana", "banana", "gemini-3-pro-image", "gemini-3-pro-image-preview"]) {
      expect(resolveModelAlias(s)).toBe("google/gemini-3-pro-image");
    }
  });

  test("the retired id is listed as an alias of its successor", () => {
    expect(aliasesFor("google/gemini-3-pro-image")).toContain("google/gemini-3-pro-image-preview");
    expect(retiredIdsFor("google/gemini-3-pro-image")).toEqual(["google/gemini-3-pro-image-preview"]);
    expect(retiredIdsFor("openai/gpt-5.4-image-2")).toEqual([]);
    expect(canonicalSlugs()).toContain("google/gemini-3-pro-image");
    expect(canonicalSlugs()).not.toContain("google/gemini-3-pro-image-preview");
  });

  test("shorthand for the newly registered models", () => {
    expect(resolveModelAlias("seedream")).toBe("bytedance-seed/seedream-5-0-pro");
    expect(resolveModelAlias("flux-3")).toBe("black-forest-labs/flux-3-image");
    expect(resolveModelAlias("sunburst")).toBe("openai/gpt-image-2.5-sunburst");
    expect(resolveModelAlias("seedance-2.5")).toBe("bytedance/seedance-2.5");
    expect(resolveModelAlias("wan-3")).toBe("alibaba/wan-3.0");
    expect(resolveModelAlias("hailuo-3-max")).toBe("minimax/hailuo-3-max");
    expect(resolveModelAlias("avatar-iv")).toBe("heygen/avatar-iv");
  });
});
