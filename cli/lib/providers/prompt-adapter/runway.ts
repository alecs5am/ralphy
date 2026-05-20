// Runway adapter (02.01.05). Runway Gen-4 splits refs into
// `subjectReference[]` vs `styleReference[]`; the adapter emits prose with a
// trailing role-tagged ref hint that the provider integration can route.
//
// References:
//   docs/prompts/video/runway.md
//   roadmap/02-prompts-and-templates/SPEC.md#020105

import { gestureToProse } from "../../schemas/gestures.js";
import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";

export const runwayAdapter: Adapter = (input: NormalizedPrompt): AdapterOutput => {
  const parts: string[] = [];

  // Subject reference first — the identity anchor.
  parts.push(`Subject: ${input.subject}.`);
  parts.push(`Action: ${input.action}.`);
  parts.push(`Setting: ${input.setting}.`);

  // Style reference (camera + lighting + style)
  parts.push(`Style: ${input.style}; ${input.camera}; ${input.lighting}.`);

  if (input.motion) parts.push(`Motion: ${input.motion}.`);

  const gestureProse = gestureToProse(input.gesture);
  if (gestureProse) parts.push(`Gesture: ${gestureProse}.`);

  if (input.dialogue) {
    const tone = input.dialogueTone ?? "neutral";
    parts.push(`Dialogue (${tone}): "${input.dialogue}".`);
  }

  if (input.notes) parts.push(`Notes: ${input.notes}.`);

  // Temporal-consistency hint — Runway responds to the explicit reminder.
  parts.push("Temporal consistency: identity locked across the clip.");

  return { prompt: parts.join(" "), adapter: "runway-gen-4" };
};
