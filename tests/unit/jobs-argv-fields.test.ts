// argv → diagnostic fields deriver (#428 part A). Pure.

import { describe, test, expect } from "bun:test";
import { deriveJobArgvFields } from "../../cli/lib/jobs/argv-fields.js";

describe("deriveJobArgvFields", () => {
  test("pulls slot / model / refCount / promptPreview from `--flag value` form", () => {
    const f = deriveJobArgvFields([
      "generate", "image",
      "--slot", "scene-01-image-hero",
      "--model", "openai/gpt-5.4-image-2",
      "--ref", "artifacts/refs/hero.png",
      "--ref", "artifacts/refs/style.png",
      "--prompt", "a cinematic hero shot",
    ]);
    expect(f.slot).toBe("scene-01-image-hero");
    expect(f.model).toBe("openai/gpt-5.4-image-2");
    expect(f.refCount).toBe(2);
    expect(f.promptPreview).toBe("a cinematic hero shot");
  });

  test("supports `--flag=value` form", () => {
    const f = deriveJobArgvFields(["generate", "--slot=s1", "--model=m1", "--ref=a.png"]);
    expect(f.slot).toBe("s1");
    expect(f.model).toBe("m1");
    expect(f.refCount).toBe(1);
  });

  test("--prompt-file shows a file marker, not raw text", () => {
    const f = deriveJobArgvFields(["generate", "--prompt-file", "prompts/s1.txt"]);
    expect(f.promptPreview).toBe("[file] prompts/s1.txt");
  });

  test("long prompt is truncated with an ellipsis", () => {
    const long = "x".repeat(200);
    const f = deriveJobArgvFields(["--prompt", long]);
    expect(f.promptPreview!.length).toBeLessThan(long.length);
    expect(f.promptPreview!.endsWith("…")).toBe(true);
  });

  test("absent flags return nulls / zero", () => {
    const f = deriveJobArgvFields(["echo", "hi"]);
    expect(f).toEqual({ slot: null, model: null, refCount: 0, promptPreview: null });
  });
});
