import { afterEach, expect, test } from "bun:test";
import path from "node:path";
import { generateImage, generateVideo } from "../../cli/lib/providers/openrouter.js";
import { providerCompletionFacts } from "../../cli/lib/artifact-production.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
let tmp: TmpRoot | undefined;
afterEach(() => { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = originalKey; tmp?.cleanup(); });

test.each([0, 0.183, undefined, -1, "0.2"])("image generation preserves billed cost or labels an estimate: %s", async (cost) => {
  tmp = makeTmpRoot("image-billing"); process.env.OPENROUTER_API_KEY = "fixture-key";
  globalThis.fetch = (async () => Response.json({ id: "gen-billing-image", usage: { cost }, choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,aW1hZ2U=" } }] } }] })) as typeof fetch;
  const result = await generateImage({ runId: "billing", outputPath: path.join(tmp.dir, ".ralphy/tmp/billing/image.png"), slot: "image", prompt: "A cube", model: "google/gemini-2.5-flash-image", noRetry: true });
  const billed = typeof cost === "number" && cost >= 0;
  expect(result.costUsd).toBe(billed ? cost : 0.02);
  expect(result.costSource).toBe(billed ? "provider" : "estimate");
  expect(providerCompletionFacts(result, result.model, "image/png")).toMatchObject({ providerRequestId: "gen-billing-image", costSource: result.costSource });
});

test("video uses the final provider usage instead of a duration price estimate", async () => {
  tmp = makeTmpRoot("video-billing"); process.env.OPENROUTER_API_KEY = "fixture-key";
  let calls = 0;
  globalThis.fetch = (async () => ++calls === 1 ? Response.json({ id: "job-billing-video", status: "completed", usage: { cost: 0.12 } }) : new Response("video")) as typeof fetch;
  const result = await generateVideo({ runId: "billing", outputPath: path.join(tmp.dir, ".ralphy/tmp/billing/video.mp4"), slot: "video", prompt: "A rotating cube", model: "google/veo-3.1-lite", durationSec: 4, noRetry: true });
  expect(result).toMatchObject({ costUsd: 0.12, costSource: "provider", providerRequestId: "job-billing-video" });
  expect(calls).toBe(2);
});
