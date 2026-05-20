// Shared types for the per-model prompt adapter (02.01.01). Every adapter
// consumes a single `NormalizedPrompt` shape — the art-director's intent —
// and emits the per-model prompt string the provider expects.
//
// Why an internal normalized shape: model APIs disagree on order, syntax,
// and which fields are mandatory. The adapter is the one place where those
// differences live; everything upstream (scenarist + art-director) works
// against this stable shape. New models add an adapter file; existing call
// sites don't change.

import type { Gesture } from "../../schemas/gestures.js";

export type NormalizedPrompt = {
  /** Who / what is in frame. The most-important slot for downstream "lock identity". */
  subject: string;
  /** What the subject does. Verb-phrase. */
  action: string;
  /** Where this happens. */
  setting: string;
  /** One-line camera direction (e.g. "selfie 35mm, eye-level, handheld"). */
  camera: string;
  /** Lighting direction (e.g. "soft window light, key from screen-left"). */
  lighting: string;
  /** Visual style / film register (e.g. "Kodak Portra 400, naturalistic, NOT glossy"). */
  style: string;
  /** Dialogue line, if any. Adapters inject this with the model's syntax (Kling bracketed, Veo prose). */
  dialogue?: string;
  /** Speaker tone for the dialogue (e.g. "deadpan", "hyped"). Defaults to neutral. */
  dialogueTone?: string;
  /** Motion direction (e.g. "slow push-in", "static handheld"). */
  motion?: string;
  /** Gesture from the canonical enum. */
  gesture?: Gesture;
  /** Optional ref descriptors (filename hints, not file contents). */
  refs?: string[];
  /** Target clip duration in seconds. */
  durationS?: number;
  /** Aspect ratio — most adapters surface this verbatim. */
  aspectRatio?: "9:16" | "16:9" | "1:1";
  /** Free-text "director intent" appended to the prompt body per [02-D-01]. */
  notes?: string;
};

/** Output of an adapter — the provider-ready string. */
export type AdapterOutput = {
  /** The shaped prompt string the provider expects. */
  prompt: string;
  /** Adapter id (e.g. "kling-v3", "veo-3.1"). For provenance. */
  adapter: string;
};

/** Signature every per-model adapter exports. */
export type Adapter = (input: NormalizedPrompt) => AdapterOutput;
