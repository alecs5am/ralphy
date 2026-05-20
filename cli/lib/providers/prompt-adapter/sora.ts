// Sora adapter (02.01.05). Sora rewards short, physics-rich nouns and uses
// "camera-as-perspective" syntax — "bodycam perspective", "drone perspective",
// not "handheld camera shot". The adapter prepends the camera as a perspective
// noun and uses tight, declarative sentences for everything else.
//
// References:
//   docs/prompts/video/sora.md

import { gestureToProse } from "../../schemas/gestures.js";
import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";

function asPerspective(camera: string): string {
  // Map common camera idioms onto Sora's perspective phrasing.
  const lc = camera.toLowerCase();
  if (lc.includes("bodycam") || lc.includes("body cam")) return "bodycam perspective";
  if (lc.includes("drone")) return "drone perspective";
  if (lc.includes("selfie") || lc.includes("front-cam") || lc.includes("front cam")) {
    return "selfie perspective";
  }
  if (lc.includes("pov") || lc.includes("first-person") || lc.includes("first person")) {
    return "first-person POV perspective";
  }
  if (lc.includes("dolly")) return "dolly perspective";
  return `${camera} perspective`;
}

export const soraAdapter: Adapter = (input: NormalizedPrompt): AdapterOutput => {
  const sentences: string[] = [];
  sentences.push(`${asPerspective(input.camera)}.`);
  sentences.push(`${input.subject} ${input.action}.`);
  sentences.push(`${input.setting}.`);
  sentences.push(`${input.lighting}.`);
  sentences.push(`${input.style}.`);
  if (input.motion) sentences.push(`${input.motion}.`);
  const gestureProse = gestureToProse(input.gesture);
  if (gestureProse) sentences.push(`${gestureProse}.`);
  if (input.dialogue) {
    const tone = input.dialogueTone ?? "neutral";
    sentences.push(`Voice (${tone}): "${input.dialogue}".`);
  }
  if (input.notes) sentences.push(`${input.notes}.`);
  return { prompt: sentences.join(" "), adapter: "sora" };
};
