// Luma adapter (02.01.03). Luma's Ray-2 family responds well to a trailing
// "reinforcer" sentence that repeats the most important visual element —
// this counteracts the model's tendency to drift mid-clip.
//
// References:
//   docs/prompts/video/luma.md
//   roadmap/02-prompts-and-templates/SPEC.md#020103

import { gestureToProse } from "../../schemas/gestures.js";
import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";

function firstNoun(text: string): string {
  // Naive: pick the first whitespace-delimited token that's >3 chars and
  // doesn't look like a stop word. Good enough for the reinforcer hint —
  // Luma is forgiving here.
  const STOP = new Set(["with", "from", "into", "that", "this", "they", "their"]);
  for (const t of text.split(/[\s,.;:]+/u)) {
    const w = t.trim().toLowerCase();
    if (w.length > 3 && !STOP.has(w)) return w;
  }
  return text.split(/\s+/u)[0] ?? "";
}

export const lumaAdapter: Adapter = (input: NormalizedPrompt): AdapterOutput => {
  const parts: string[] = [];
  parts.push(input.subject);
  parts.push(input.action);
  parts.push(`in ${input.setting}`);
  parts.push(`shot ${input.camera}`);
  parts.push(`lit by ${input.lighting}`);
  parts.push(`styled ${input.style}`);
  const gestureProse = gestureToProse(input.gesture);
  if (gestureProse) parts.push(gestureProse);
  if (input.motion) parts.push(input.motion);
  if (input.dialogue) {
    const tone = input.dialogueTone ?? "neutral";
    parts.push(`speaks in a ${tone} tone: "${input.dialogue}"`);
  }
  if (input.notes) parts.push(input.notes);

  const body = parts.filter(Boolean).join(", ");

  // Trailing reinforcer — repeats the subject + first noun in style.
  const styleNoun = firstNoun(input.style);
  const reinforcer = `The ${input.subject} stays the focus${styleNoun ? `, ${styleNoun} register held throughout` : ""}.`;

  return { prompt: `${body}. ${reinforcer}`, adapter: "luma-ray" };
};
