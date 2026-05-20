// Per [02-D-06](roadmap/02-prompts-and-templates/OPEN-QUESTIONS.md#d-06):
// `Scene.gesture` is a finite enum (10-12 named gestures). Niche or one-off
// gesture intent goes into `Scene.notes` (the free-text escape hatch). Adapters
// that don't recognize a value MUST silently omit the gesture directive — never
// throw — so future enum extensions are forward-compatible.

/**
 * Canonical gesture enum used by `Scene.gesture` (02.04.03).
 *
 * Each entry is paired with a one-line semantic definition in `GESTURE_DEFS`
 * below; per-model prompt adapters consume that vocabulary when translating
 * the enum into the model's natural language (e.g. Kling's bracketed-character
 * tag, Veo's prose action line).
 */
export const GESTURES = [
  "point-camera",
  "nod",
  "head-shake",
  "laugh",
  "shrug",
  "lean-in",
  "hand-product-reveal",
  "eye-roll",
  "facepalm",
  "thumbs-up",
  "palm-open",
  "pause-still",
] as const;

export type Gesture = (typeof GESTURES)[number];

export const GESTURE_DEFS: Record<Gesture, string> = {
  "point-camera": "Index finger jabs straight at lens — direct address, accusatory or emphatic.",
  "nod": "Single deliberate downward head tilt — agreement / 'yes' / pause beat.",
  "head-shake": "Two-three side-to-side head turns — denial / 'no' / disbelief.",
  "laugh": "Open-mouth genuine laugh, eyes crinkle, shoulders may bounce.",
  "shrug": "Shoulders lift to ears, palms open at chest height — 'I dunno' / dismissive.",
  "lean-in": "Upper body tilts toward camera, head slightly forward — confidential / intimate beat.",
  "hand-product-reveal": "Hand enters frame holding product, presents at chest height, holds for 0.5-1s.",
  "eye-roll": "Eyes track up-right then back — sarcasm / 'ugh' beat.",
  "facepalm": "Open palm slaps forehead and holds — exasperation / 'I cannot believe this'.",
  "thumbs-up": "Closed fist, thumb extended skyward, held at chest height — approval / closer.",
  "palm-open": "Single open palm facing camera at chest height — 'wait' / 'hold on' / open-handed talk.",
  "pause-still": "Deliberate no-motion beat (~0.5-1s) — comedic timing / 'let that sink in'.",
};

/** Returns true iff `value` is a member of the canonical enum. */
export function isGesture(value: unknown): value is Gesture {
  return typeof value === "string" && (GESTURES as readonly string[]).includes(value);
}

/**
 * Translate the enum into model-friendly prose. Adapters call this when shaping
 * the per-model prompt; unknown values return `null` so the adapter can omit
 * the gesture directive (per D-06: "unknown enum values are silently omitted,
 * never error").
 */
export function gestureToProse(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!isGesture(value)) return null;
  return GESTURE_DEFS[value];
}
