// Seedance adapter — covers `bytedance/seedance-2.0`. Seedance prefers a
// motion-forward shape with the action verb leading and explicit physics cues
// at the end (it's the strongest of our adapters at "running / falling / fast
// camera moves" — see VG model picks memory).
//
// References:
//   MODELS.md (seedance row)

import { gestureToProse } from "../../schemas/gestures.js";
import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";

export const seedanceAdapter: Adapter = (input: NormalizedPrompt): AdapterOutput => {
  const parts: string[] = [];
  // Motion-forward lead.
  if (input.motion) parts.push(input.motion);
  parts.push(`${input.subject} ${input.action} in ${input.setting}`);
  parts.push(input.camera);
  parts.push(input.lighting);
  parts.push(input.style);
  const gestureProse = gestureToProse(input.gesture);
  if (gestureProse) parts.push(gestureProse);
  if (input.dialogue) {
    const tone = input.dialogueTone ?? "neutral";
    parts.push(`speaks (${tone}): "${input.dialogue}"`);
  }
  if (input.notes) parts.push(input.notes);
  return { prompt: parts.filter(Boolean).join(", "), adapter: "seedance-2" };
};
