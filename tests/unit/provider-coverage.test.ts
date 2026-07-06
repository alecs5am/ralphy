// #497 — per-(model, capability, provider) parameter-coverage matrix.
//
// Covers: coverageFor lookup, unknown-model degradation (no entry = no
// warning), the generate-path warning emission (console.error spy — no real
// model calls), and the cross-provider "who DOES support it" hint.

import { describe, test, expect, afterEach } from "bun:test";
import {
  PROVIDER_COVERAGE,
  coverageFor,
  coverageForModel,
  providersSupporting,
  coverageWarnings,
  emitCoverageWarnings,
} from "../../cli/lib/providers/coverage.js";

describe("coverageFor lookup", () => {
  test("returns the exact (model, cap, provider) entry", () => {
    const e = coverageFor("bytedance/seedance-2.0", "video", "openrouter");
    expect(e).toBeDefined();
    expect(e!.supportedParams).toContain("refs");
    expect(e!.supportedParams).not.toContain("refVideos");
    expect(e!.unsupportedParams).toContain("refVideos");
    expect(e!.source).toBe("hand-curated");
  });

  test("fal seedance r2v declares the full surface incl. refVideos", () => {
    const e = coverageFor("bytedance/seedance-2.0/reference-to-video", "video", "fal");
    expect(e).toBeDefined();
    expect(e!.supportedParams).toContain("refVideos");
    expect(e!.unsupportedParams).toEqual([]);
  });

  test("unknown model / provider / capability → undefined", () => {
    expect(coverageFor("acme/unknown-model-9000", "video", "openrouter")).toBeUndefined();
    expect(coverageFor("bytedance/seedance-2.0", "video", "acme")).toBeUndefined();
    expect(coverageFor("bytedance/seedance-2.0", "music", "openrouter")).toBeUndefined();
  });

  test("issue #497 seed set is present", () => {
    const triples = PROVIDER_COVERAGE.map((e) => `${e.provider}:${e.model}:${e.capability}`);
    for (const t of [
      "openrouter:bytedance/seedance-2.0:video",
      "fal:bytedance/seedance-2.0/reference-to-video:video",
      "openrouter:kwaivgi/kling-v3.0-pro:video",
      "openrouter:google/veo-3.1:video",
      "openrouter:google/gemini-3-pro-image-preview:image",
      "openrouter:openai/gpt-5.4-image-2:image",
      "elevenlabs:eleven_multilingual_v2:voice",
      "elevenlabs:elevenlabs-music:music",
      "elevenlabs:elevenlabs-sfx:sfx",
    ]) {
      expect(triples).toContain(t);
    }
  });
});

describe("family grouping + cross-provider hint", () => {
  test("coverageForModel returns family siblings across providers", () => {
    const rows = coverageForModel("bytedance/seedance-2.0");
    const providers = rows.map((r) => r.provider).sort();
    expect(providers).toEqual(["fal", "openrouter"]);
  });

  test("coverageForModel on an unknown model returns []", () => {
    expect(coverageForModel("acme/unknown-model-9000")).toEqual([]);
  });

  test("providersSupporting names fal for seedance refVideos", () => {
    const rows = providersSupporting("refVideos", "video", "seedance-2.0");
    expect(rows.length).toBe(1);
    expect(rows[0]!.provider).toBe("fal");
    expect(rows[0]!.model).toBe("bytedance/seedance-2.0/reference-to-video");
  });
});

describe("coverageWarnings (pure)", () => {
  test("refVideos on OR seedance warns and names the fal route", () => {
    const lines = coverageWarnings({
      provider: "openrouter",
      model: "bytedance/seedance-2.0",
      capability: "video",
      params: ["prompt", "refVideos"],
    });
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("refVideos");
    expect(lines[0]).toContain("--provider fal");
    expect(lines[0]).toContain("bytedance/seedance-2.0/reference-to-video");
  });

  test("refs on OR kling warns (no covering provider in the kling-v3.0 family)", () => {
    const lines = coverageWarnings({
      provider: "openrouter",
      model: "kwaivgi/kling-v3.0-pro",
      capability: "video",
      params: ["refs"],
    });
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("'refs'");
    expect(lines[0]).not.toContain("--provider");
  });

  test("fully supported params → no warnings", () => {
    const lines = coverageWarnings({
      provider: "fal",
      model: "bytedance/seedance-2.0/reference-to-video",
      capability: "video",
      params: ["firstFrame", "lastFrame", "refs", "refVideos", "generateAudio"],
    });
    expect(lines).toEqual([]);
  });

  test("unknown model degrades silently (no entry = no warning)", () => {
    const lines = coverageWarnings({
      provider: "openrouter",
      model: "acme/unknown-model-9000",
      capability: "video",
      params: ["refVideos", "refs", "generateAudio"],
    });
    expect(lines).toEqual([]);
  });
});

describe("emitCoverageWarnings (generate-path emission)", () => {
  const originalError = console.error;
  afterEach(() => {
    console.error = originalError;
  });

  test("writes [warn] lines to stderr via console.error and returns them", () => {
    const captured: string[] = [];
    console.error = (...args: unknown[]) => {
      captured.push(args.join(" "));
    };
    const lines = emitCoverageWarnings({
      provider: "openrouter",
      model: "bytedance/seedance-2.0",
      capability: "video",
      params: ["refVideos"],
    });
    expect(lines.length).toBe(1);
    expect(captured.length).toBe(1);
    expect(captured[0]).toStartWith("[warn] ");
    expect(captured[0]).toContain("refVideos");
  });

  test("unknown model emits nothing", () => {
    const captured: string[] = [];
    console.error = (...args: unknown[]) => {
      captured.push(args.join(" "));
    };
    const lines = emitCoverageWarnings({
      provider: "openrouter",
      model: "acme/unknown-model-9000",
      capability: "video",
      params: ["refVideos"],
    });
    expect(lines).toEqual([]);
    expect(captured).toEqual([]);
  });
});
