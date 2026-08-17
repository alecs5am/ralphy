import { describe, expect, test } from "vitest";

import { aiBrandForModel } from "../src/components/AiBrandIcon";

describe("AI brand icons", () => {
  test("maps provider model ids to stable LobeHub brands", () => {
    expect(aiBrandForModel("openai/gpt-5.4", "openrouter")).toBe("openai");
    expect(aiBrandForModel("google/gemini-3-pro", "openrouter")).toBe("gemini");
    expect(aiBrandForModel("deepseek/deepseek-v3", "openrouter")).toBe("deepseek");
    expect(aiBrandForModel("qwen/qwen3-coder", "openrouter")).toBe("qwen");
    expect(aiBrandForModel("default", "codex")).toBe("codex");
    expect(aiBrandForModel("unknown/model", "openrouter")).toBe("openrouter");
  });
});
