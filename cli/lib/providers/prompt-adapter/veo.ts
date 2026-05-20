// Veo adapter (02.01.04). Veo-3.1 expects prompts in a strict 7-part skeleton:
//   1. Shot framing & motion
//   2. Style
//   3. Lighting
//   4. Character
//   5. Location
//   6. Action
//   7. Dialogue
//
// References:
//   docs/prompts/video/veo.md
//   roadmap/02-prompts-and-templates/SPEC.md#020104

import { gestureToProse } from "../../schemas/gestures.js";
import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";

export const veoAdapter: Adapter = (input: NormalizedPrompt): AdapterOutput => {
  const parts: string[] = [];

  // 1. Shot framing & motion
  const shotBits: string[] = [input.camera];
  if (input.motion) shotBits.push(input.motion);
  parts.push(`Shot: ${shotBits.join(", ")}.`);

  // 2. Style
  parts.push(`Style: ${input.style}.`);

  // 3. Lighting
  parts.push(`Lighting: ${input.lighting}.`);

  // 4. Character
  parts.push(`Character: ${input.subject}.`);

  // 5. Location
  parts.push(`Location: ${input.setting}.`);

  // 6. Action
  const actionBits: string[] = [input.action];
  const gestureProse = gestureToProse(input.gesture);
  if (gestureProse) actionBits.push(gestureProse);
  parts.push(`Action: ${actionBits.join("; ")}.`);

  // 7. Dialogue
  if (input.dialogue) {
    const tone = input.dialogueTone ?? "neutral";
    parts.push(`Dialogue (${tone}): "${input.dialogue}"`);
  }

  if (input.notes) parts.push(`Director notes: ${input.notes}.`);

  return { prompt: parts.join(" "), adapter: "veo-3" };
};
