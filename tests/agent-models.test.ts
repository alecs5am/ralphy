import { describe, expect, test } from "vitest";

import {
  parseCodexModelCache,
  parseOpenRouterModels,
} from "../electron/agent/models";

describe("agent model catalogs", () => {
  test("keeps only visible bounded Codex picker models", () => {
    expect(parseCodexModelCache({
      models: [
        { slug: "gpt-5.6-sol", display_name: "GPT-5.6-Sol", visibility: "list" },
        { slug: "codex-auto-review", display_name: "Hidden", visibility: "hide" },
        { slug: "bad model", display_name: "Bad", visibility: "list" },
        { slug: "gpt-5.6-sol", display_name: "Duplicate", visibility: "list" },
      ],
    })).toEqual([
      { id: "default", label: "Codex default", description: "Uses your Codex configuration" },
      { id: "gpt-5.6-sol", label: "GPT-5.6-Sol", description: "Codex" },
    ]);
    expect(parseCodexModelCache(null)).toEqual([
      { id: "default", label: "Codex default", description: "Uses your Codex configuration" },
    ]);
  });

  test("accepts only text OpenRouter models with tool calling", () => {
    expect(parseOpenRouterModels({
      data: [
        {
          id: "openai/gpt-5.5",
          name: "OpenAI: GPT-5.5",
          context_length: 400000,
          supported_parameters: ["tools", "reasoning"],
          architecture: { output_modalities: ["text"] },
          pricing: { prompt: "0.00000175", completion: "0.000014" },
        },
        {
          id: "image/model",
          name: "Image only",
          supported_parameters: ["tools"],
          architecture: { output_modalities: ["image"] },
        },
        {
          id: "text/no-tools",
          name: "No tools",
          supported_parameters: ["temperature"],
          architecture: { output_modalities: ["text"] },
        },
      ],
    })).toEqual([{
      id: "openai/gpt-5.5",
      label: "OpenAI: GPT-5.5",
      description: "400K context · $1.75 / $14.00 per 1M",
    }]);
    expect(parseOpenRouterModels({ data: "broken" })).toEqual([]);
  });
});
