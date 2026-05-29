// Unit tests for the --size mismatch warning + --aspect natural-size lookup
// (notes/issues/051). Validates the pure helpers without hitting OpenRouter.

import { describe, test, expect } from "bun:test";
import {
  naturalSizeFor,
  sizeMismatchWarning,
} from "../../cli/lib/providers/openrouter.js";

describe("naturalSizeFor", () => {
  test("gpt-5.4-image-2 9:16 → 1024x1536", () => {
    expect(naturalSizeFor("openai/gpt-5.4-image-2", "9:16")).toBe("1024x1536");
  });

  test("gpt-5.4-image-2 1:1 → 1024x1024", () => {
    expect(naturalSizeFor("openai/gpt-5.4-image-2", "1:1")).toBe("1024x1024");
  });

  test("gemini-3-pro-image-preview 9:16 → 768x1376", () => {
    expect(naturalSizeFor("google/gemini-3-pro-image-preview", "9:16")).toBe("768x1376");
  });

  test("unknown model → undefined", () => {
    expect(naturalSizeFor("some/unknown-model", "9:16")).toBeUndefined();
  });

  test("known model + unknown aspect → undefined", () => {
    expect(naturalSizeFor("openai/gpt-5.4-image-2", "42:17")).toBeUndefined();
  });
});

describe("sizeMismatchWarning", () => {
  test("matching natural size → undefined (no warning)", () => {
    expect(
      sizeMismatchWarning("openai/gpt-5.4-image-2", "1024x1536", "9:16"),
    ).toBeUndefined();
  });

  test("mismatched size on gpt-5.4-image-2 → warning string", () => {
    const w = sizeMismatchWarning(
      "openai/gpt-5.4-image-2",
      "1290x2796",
      "9:16",
    );
    expect(w).toBeDefined();
    expect(w).toContain("1290x2796");
    expect(w).toContain("1024x1536");
    expect(w).toContain("9:16");
  });

  test("gemini natural 9:16 vs requested 1080x1920 → warning", () => {
    const w = sizeMismatchWarning(
      "google/gemini-3-pro-image-preview",
      "1080x1920",
      "9:16",
    );
    expect(w).toBeDefined();
    expect(w).toContain("768x1376");
  });

  test("unknown model → undefined (no false positive)", () => {
    expect(
      sizeMismatchWarning("some/unknown-model", "1024x1024", "1:1"),
    ).toBeUndefined();
  });

  test("aspect undefined → no warning", () => {
    expect(
      sizeMismatchWarning("openai/gpt-5.4-image-2", "1024x1024", undefined),
    ).toBeUndefined();
  });
});
