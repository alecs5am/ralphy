// Hailuo / MiniMax adapter — uses a `subject, environment, action, camera`
// order; tolerates Russian directly which is rare among i2v models.
//
// References:
//   MODELS.md (hailuo-02 row)

import { gestureToProse } from "../../schemas/gestures.js";
import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";

export const hailuoAdapter: Adapter = (input: NormalizedPrompt): AdapterOutput => {
  const parts: string[] = [];
  parts.push(input.subject);
  parts.push(input.setting);
  parts.push(input.action);
  parts.push(input.camera);
  parts.push(input.lighting);
  parts.push(input.style);
  if (input.motion) parts.push(input.motion);
  const gestureProse = gestureToProse(input.gesture);
  if (gestureProse) parts.push(gestureProse);
  if (input.dialogue) {
    const tone = input.dialogueTone ?? "neutral";
    parts.push(`dialogue (${tone}): "${input.dialogue}"`);
  }
  if (input.notes) parts.push(input.notes);
  return { prompt: parts.filter(Boolean).join(", "), adapter: "hailuo-02" };
};
