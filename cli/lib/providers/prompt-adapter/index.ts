// Prompt-adapter dispatcher (02.01.01). Given a model id, returns the matching
// per-model adapter. Unknown models fall back to the Pika-style generic
// (subject + action + setting + style + camera) which is the broadest-applicable
// shape for video models.
//
// To add a new model family: write `<family>.ts` exporting an `Adapter`, then
// pattern-match its id prefix below.

import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";
import { klingAdapter } from "./kling.js";
import { lumaAdapter } from "./luma.js";
import { veoAdapter } from "./veo.js";
import { runwayAdapter } from "./runway.js";
import { pikaAdapter } from "./pika.js";
import { soraAdapter } from "./sora.js";
import { seedanceAdapter } from "./seedance.js";
import { hailuoAdapter } from "./hailuo.js";

export type { Adapter, NormalizedPrompt, AdapterOutput };
export { klingAdapter, lumaAdapter, veoAdapter, runwayAdapter, pikaAdapter, soraAdapter, seedanceAdapter, hailuoAdapter };

/**
 * Pick the adapter for the given OpenRouter / provider model id. Match is by
 * prefix so future model bumps (kling-v3.1, veo-3.2) inherit automatically.
 */
export function adapterFor(modelId: string): Adapter {
  const lc = modelId.toLowerCase();
  if (lc.includes("kwaivgi/kling") || lc.includes("kling-v3") || lc.includes("kling-v4")) {
    return klingAdapter;
  }
  if (lc.includes("luma/") || lc.includes("luma-ray") || lc.includes("ray-2") || lc.includes("ray-3")) {
    return lumaAdapter;
  }
  if (lc.includes("google/veo") || lc.includes("veo-3") || lc.includes("veo-4")) {
    return veoAdapter;
  }
  if (lc.includes("runway/") || lc.includes("gen-4") || lc.includes("gen-5")) {
    return runwayAdapter;
  }
  if (lc.includes("pika/") || lc.includes("pika-2") || lc.includes("pika-labs")) {
    return pikaAdapter;
  }
  if (lc.includes("openai/sora") || lc.includes("sora-2") || lc.includes("sora-turbo")) {
    return soraAdapter;
  }
  if (lc.includes("bytedance/seedance") || lc.includes("seedance")) {
    return seedanceAdapter;
  }
  if (lc.includes("minimax/hailuo") || lc.includes("hailuo")) {
    return hailuoAdapter;
  }
  // Default to the Pika shape — broadest-applicable, no model-specific syntax.
  return pikaAdapter;
}

/** Run the adapter pipeline end-to-end. Thin convenience over `adapterFor()`. */
export function shapePrompt(modelId: string, input: NormalizedPrompt): AdapterOutput {
  return adapterFor(modelId)(input);
}
