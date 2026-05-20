// Kling adapter (02.01.02). Kling-v3.0 expects prompts in the order:
//   Scene → Character → Shot → Motion → Dialogue → Progression
// and treats dialogue as `[Speaker, tone]: "line"`. Music is auto-baked
// unless the prompt explicitly bans it — see memory "Kling no-music".
//
// References:
//   docs/prompts/video/kling.md
//   roadmap/02-prompts-and-templates/SPEC.md#020102

import { gestureToProse } from "../../schemas/gestures.js";
import type { Adapter, NormalizedPrompt, AdapterOutput } from "./types.js";

function formatDialogue(input: NormalizedPrompt): string | null {
  if (!input.dialogue) return null;
  const tone = (input.dialogueTone ?? "neutral").trim();
  // Speaker tag — the subject string up to the first comma, capped so we
  // don't dump the full character description into the bracket.
  const speakerRaw = input.subject.split(/[,.]/)[0]?.trim() ?? "Speaker";
  const speaker = speakerRaw.length > 32 ? speakerRaw.slice(0, 32) : speakerRaw;
  return `[${speaker}, ${tone}]: "${input.dialogue.trim()}"`;
}

export const klingAdapter: Adapter = (input: NormalizedPrompt): AdapterOutput => {
  const parts: string[] = [];

  // Scene
  parts.push(`Scene: ${input.setting}.`);

  // Character
  parts.push(`Character: ${input.subject}.`);

  // Shot
  parts.push(`Shot: ${input.camera}. Lighting: ${input.lighting}. Style: ${input.style}.`);

  // Motion (combines explicit motion + gesture prose)
  const motionBits: string[] = [];
  if (input.motion) motionBits.push(input.motion);
  const gestureProse = gestureToProse(input.gesture);
  if (gestureProse) motionBits.push(gestureProse);
  motionBits.push(input.action);
  parts.push(`Motion: ${motionBits.join("; ")}.`);

  // Dialogue (Kling-specific bracketed form)
  const dialogue = formatDialogue(input);
  if (dialogue) parts.push(`Dialogue: ${dialogue}`);

  // Progression — duration + aspect.
  const progBits: string[] = [];
  if (input.durationS) progBits.push(`${input.durationS}s clip`);
  if (input.aspectRatio) progBits.push(`${input.aspectRatio}`);
  // Kling auto-bakes ambient music; explicit ban prevents drift on UGC video.
  progBits.push("no background music, SFX only");
  parts.push(`Progression: ${progBits.join(", ")}.`);

  // Director intent
  if (input.notes) parts.push(`Director notes: ${input.notes}.`);

  return { prompt: parts.join(" "), adapter: "kling-v3" };
};
