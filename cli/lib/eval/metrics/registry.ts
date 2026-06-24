// Metric-adapter registry (#485).
//
// Mirrors the provider connector registry (cli/lib/providers/registry.ts):
// a flat list in priority order, plus lookup helpers. Adding a media metric =
// adding a file under metrics/ + one line here. Registration order is priority.

import { ttsWerAdapter } from "./tts-wer.js";
import { imageAestheticAdapter } from "./image-aesthetic.js";
import type { Capability } from "../../providers/types.js";
import type { MetricAdapter } from "./types.js";

export type { MetricAdapter, MetricResult, MetricInput, MetricStatus } from "./types.js";

// Registration order = priority. Voice intelligibility first (it has a live,
// cheap path), then the image aesthetic seam (na until a scorer is wired).
const ADAPTERS: MetricAdapter[] = [ttsWerAdapter, imageAestheticAdapter];

/** All registered metric adapters, in priority order. */
export function listMetricAdapters(): MetricAdapter[] {
  return ADAPTERS;
}

/** Look up an adapter by id, or undefined when unknown. */
export function getMetricAdapter(id: string): MetricAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}

/** Adapters that score a given capability, in priority order. */
export function adaptersForCapability(cap: Capability): MetricAdapter[] {
  return ADAPTERS.filter((a) => a.capability === cap);
}
