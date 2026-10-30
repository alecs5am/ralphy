// #592 — provider refusals land in generations.jsonl as ONE blocked row with
// the provider-reported cost or an unknown cost (never a made-up $0).
//
// No network: fetch is mocked, and the Run-backed path is driven through
// produceArtifactRevision() (the same logRefusal() the generate wrapper calls).

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { readGenerations, normalizeGenerationEntry } from "../../cli/lib/gen-log.js";
import { produceArtifactRevision } from "../../cli/lib/artifact-production.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { generateImage, generateVideo } from "../../cli/lib/providers/openrouter.js";
import { providerHttpError, TerminalProviderError } from "../../cli/lib/providers/shared.js";
import {
  attachProviderCost,
  compactRequestBody,
  markRefusal,
  providerCostOf,
  refusalOf,
  refusalRow,
} from "../../cli/lib/providers/refusal.js";
import { actualSpendUsd, budgetSummary, unknownCostCalls } from "../../cli/lib/spend.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const SEEDANCE_PRIVACY =
  'OpenRouter videos submit 400: {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image may contain real person."}}';
const DESTINATION = { kind: "project" as const, id: "refusal-001" };

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
let tmp: TmpRoot | undefined;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-refusal-592");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  closeDomainDb();
  tmp?.cleanup();
  tmp = undefined;
});

describe("refusalOf — what counts as a refusal", () => {
  test("provider safety / privacy / IP / ToS messages are refusals with a reason", () => {
    const cases: Array<[string, string]> = [
      [SEEDANCE_PRIVACY, "safety-input"],
      ["OpenRouter video failed: The request failed because the output video may be related to copyright restrictions.", "copyright"],
      ["OpenRouter video failed: Input data is suspected of being involved in IP infringement", "copyright"],
      ["OpenRouter video failed: output new_sensitive (1027)", "safety-output"],
      ["ElevenLabs Music 400: {\"detail\":{\"status\":\"bad_prompt\"}}\n  prompt_suggestion: an upbeat beat", "tos-content"],
      ["OpenRouter image refused (model=google/gemini-3-pro-image, finish_reason=IMAGE_SAFETY)", "safety-output"],
    ];
    for (const [message, reason] of cases) {
      expect(refusalOf(new Error(message))).toEqual({ reason });
    }
  });

  test("transient, constraint and unknown errors are not refusals", () => {
    for (const message of [
      "fetch failed: ECONNRESET",
      "OpenRouter videos submit 503: ",
      "kling-v3.0-pro prompt cap is 2500 chars; got 3000",
      "OpenRouter videos submit 401: invalid key",
    ]) {
      expect(refusalOf(new Error(message))).toBeNull();
    }
  });

  test("a connector-marked refusal wins even when the message is opaque", () => {
    const err = markRefusal(new TerminalProviderError("finish_reason=content_filter"), { costUsd: 0.01 });
    expect(refusalOf(err)).toEqual({ reason: "policy" });
    expect(providerCostOf(err)).toBe(0.01);
  });
});

describe("refusalRow — the blocked row shape", () => {
  test("unknown cost: no cost_usd, cost_source unknown, blocked:<reason> error", () => {
    const row = refusalRow(DESTINATION, {
      provider: "openrouter",
      model: "bytedance/seedance-2.0",
      kind: "video",
      slot: "scene-03-vid",
      input: { prompt: "a dancer", durationSec: 5 },
      err: providerHttpError(SEEDANCE_PRIVACY, 400),
      latencyMs: 812,
    })!;
    expect(row.status).toBe("blocked");
    expect(row.error!.startsWith("blocked:safety-input: OpenRouter videos submit 400")).toBe(true);
    expect(row.failureClass).toBe("moderation");
    expect(row.cost_source).toBe("unknown");
    expect("cost_usd" in row).toBe(false);
    expect(row.input).toMatchObject({ prompt: "a dancer", durationSec: 5, slot: "scene-03-vid", project: "refusal-001" });
    expect(row.attempt).toBe(1);
  });

  test("a provider-reported cost is kept, including 0", () => {
    for (const cost of [0.42, 0]) {
      const err = attachProviderCost(new Error("OpenRouter video failed: output new_sensitive (1027)"), cost);
      const row = refusalRow(DESTINATION, { provider: "openrouter", model: "minimax/hailuo-3-max", kind: "video", err })!;
      expect(row.cost_usd).toBe(cost);
      expect(row.cost_source).toBe("provider");
    }
    // Invalid reported costs are ignored, not coerced.
    const err = attachProviderCost(new Error("output new_sensitive (1027)"), -1);
    expect(refusalRow(DESTINATION, { provider: "openrouter", model: "m", kind: "video", err })!.cost_source).toBe("unknown");
  });

  test("non-refusals build no row", () => {
    expect(refusalRow(DESTINATION, { provider: "openrouter", model: "m", kind: "image", err: new Error("fetch failed") })).toBeNull();
  });

  test("request bodies drop inline ref bytes", () => {
    expect(compactRequestBody({
      model: "bytedance/seedance-2.0",
      prompt: "p",
      duration: 5,
      generate_audio: false,
      frame_images: [{ image_url: { url: "data:image/png;base64,AAAA" } }],
      image: "data:image/png;base64,BBBB",
      image_config: { aspect_ratio: "9:16" },
    })).toEqual({
      model: "bytedance/seedance-2.0",
      prompt: "p",
      duration: 5,
      generate_audio: false,
      frame_images_count: 1,
      image_config_count: 1,
    });
  });

  test("the normalizer keeps the blocked status and cost source", () => {
    const row = normalizeGenerationEntry({ provider: "fal", model: "m", endpoint: "m", kind: "video", status: "blocked", cost_source: "unknown", input: {} });
    expect(row.status).toBe("blocked");
    expect(row.cost_source).toBe("unknown");
    expect(row.cost_usd).toBeUndefined();
  });
});

describe("Run-backed refusals write one blocked row (#592)", () => {
  function storeProject(): string {
    const workspace = createWorkspace({ slug: "default", name: "Default" });
    return createProject({ workspaceId: workspace.id, slug: "refusals", name: "Refusals" }).id;
  }

  test("a submit-time 400 privacy refusal lands with an unknown cost; spend stays a floor", async () => {
    const projectId = storeProject();
    await expect(produceArtifactRevision({
      scope: { projectId },
      runKind: "video.extend",
      requestedOutput: "scene-02-vid.mp4",
      artifactKind: "video",
      mime: "video/mp4",
      provider: "openrouter",
      model: "bytedance/seedance-2.0",
      produce: async () => { throw providerHttpError(SEEDANCE_PRIVACY, 400); },
    })).rejects.toThrow();

    const rows = await readGenerations(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("blocked");
    expect(rows[0]!.error).toContain("InputImageSensitiveContentDetected");
    expect(rows[0]!.input.slot).toBe("scene-02-vid");
    expect(rows[0]!.cost_usd).toBeUndefined();
    expect(unknownCostCalls(rows)).toBe(1);
    expect(await actualSpendUsd(projectId)).toBe(0);
    expect((await budgetSummary(projectId)).unknownCostCalls).toBe(1);
  });

  test("a billed refusal is counted once in actual spend", async () => {
    const projectId = storeProject();
    await expect(produceArtifactRevision({
      scope: { projectId },
      runKind: "video.extend",
      requestedOutput: "scene-04-vid.mp4",
      artifactKind: "video",
      mime: "video/mp4",
      provider: "openrouter",
      model: "bytedance/seedance-2.5",
      produce: async () => {
        throw attachProviderCost(new Error("OpenRouter video failed: the output video may be related to copyright restrictions"), 1.17);
      },
    })).rejects.toThrow();
    const rows = await readGenerations(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ status: "blocked", cost_usd: 1.17, cost_source: "provider" });
    expect(await actualSpendUsd(projectId)).toBeCloseTo(1.17, 6);
  });

  test("a non-refusal failure writes no gen-log row", async () => {
    const projectId = storeProject();
    await expect(produceArtifactRevision({
      scope: { projectId },
      runKind: "video.extend",
      requestedOutput: "scene-05-vid.mp4",
      artifactKind: "video",
      mime: "video/mp4",
      provider: "openrouter",
      model: "kwaivgi/kling-v3.0-pro",
      produce: async () => { throw new Error("fetch failed: ECONNRESET"); },
    })).rejects.toThrow();
    expect(await readGenerations(projectId)).toHaveLength(0);
  });
});

describe("OpenRouter connector refusals (#592)", () => {
  test("an IMAGE_SAFETY finish is terminal (no retry) and carries the billed cost", async () => {
    process.env.OPENROUTER_API_KEY = "fixture-key";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json({
        id: "gen-refused",
        usage: { cost: 0.0134 },
        choices: [{ finish_reason: "stop", native_finish_reason: "IMAGE_SAFETY", message: { content: "" } }],
      });
    }) as typeof fetch;
    let caught: unknown;
    try {
      await generateImage({
        runId: "refusal", outputPath: path.join(tmp!.dir, ".ralphy/tmp/refusal/scene-01.png"),
        slot: "scene-01", prompt: "a cryptid", model: "google/gemini-3-pro-image",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TerminalProviderError);
    expect(calls).toBe(1);
    expect(providerCostOf(caught)).toBe(0.0134);
    expect(refusalOf(caught)?.reason).toBe("safety-output");
  });

  test("a bare empty image payload is still a transient retry, not a refusal", async () => {
    process.env.OPENROUTER_API_KEY = "fixture-key";
    process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json({ choices: [{ finish_reason: null, message: { content: "" } }] });
    }) as typeof fetch;
    try {
      await expect(generateImage({
        runId: "refusal", outputPath: path.join(tmp!.dir, ".ralphy/tmp/refusal/scene-02.png"),
        slot: "scene-02", prompt: "a cube", model: "google/gemini-3-pro-image",
      })).rejects.toThrow(/no images\[0\]/);
    } finally {
      delete process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
    }
    expect(calls).toBe(3);
  });

  test("image-only models are sent modalities [\"image\"]", async () => {
    process.env.OPENROUTER_API_KEY = "fixture-key";
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] } }] });
    }) as typeof fetch;
    for (const model of ["bytedance-seed/seedream-5-0-pro", "google/gemini-3-pro-image"]) {
      await generateImage({
        runId: "modal", outputPath: path.join(tmp!.dir, ".ralphy/tmp/modal/x.png"),
        slot: "x", prompt: "a cube", model, noRetry: true,
      });
    }
    expect(bodies.map((b) => b.modalities)).toEqual([["image"], ["image", "text"]]);
  });

  test("off the Run path, a submit-time 400 refusal is logged by the connector", async () => {
    process.env.OPENROUTER_API_KEY = "fixture-key";
    globalThis.fetch = (async () =>
      new Response(SEEDANCE_PRIVACY.replace("OpenRouter videos submit 400: ", ""), { status: 400 })) as typeof fetch;
    await expect(generateVideo({
      projectId: "loose-001", slot: "scene-06-vid", prompt: "a dancer",
      model: "bytedance/seedance-2.0", durationSec: 5,
    })).rejects.toThrow(/400/);
    const rows = await readGenerations("loose-001");
    expect(rows).toHaveLength(1);
    expect(rows[0]!).toMatchObject({ status: "blocked", cost_source: "unknown", model: "bytedance/seedance-2.0" });
    expect(rows[0]!.input).toMatchObject({ prompt: "a dancer", duration: 5, slot: "scene-06-vid" });
  });
});
