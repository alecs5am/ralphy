// Pika adapter (02.01.05). Pika responds best to a `subject + action +
// setting + style + camera` order, in that sequence, comma-delimited.
//
// References:
//   docs/prompts/video/pika.md

import { gestureToProse } from "../../schemas/gestures.js";
import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";

export const pikaAdapter: Adapter = (input: NormalizedPrompt): AdapterOutput => {
  const bits: string[] = [];
  bits.push(input.subject);
  bits.push(input.action);
  bits.push(input.setting);
  bits.push(input.style);
  bits.push(input.camera);
  bits.push(input.lighting);
  if (input.motion) bits.push(input.motion);
  const gestureProse = gestureToProse(input.gesture);
  if (gestureProse) bits.push(gestureProse);
  if (input.dialogue) {
    const tone = input.dialogueTone ?? "neutral";
    bits.push(`spoken ${tone}: "${input.dialogue}"`);
  }
  if (input.notes) bits.push(input.notes);
  return { prompt: bits.filter(Boolean).join(", "), adapter: "pika-2" };
};
