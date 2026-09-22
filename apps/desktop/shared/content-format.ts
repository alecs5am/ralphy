export const DEFAULT_CONTENT_ASPECT_RATIO = "9:16" as const;
export const DEFAULT_CONTENT_ASPECT = 9 / 16;

/**
 * The card shapes a media grid can be drawn in.
 *
 * 9:16 is the default because that is what the product makes, but a project holds landscape
 * renders, square covers and 4:5 feed posts too, and every one of them was being letterboxed
 * into a vertical card. The list is the shapes people publish in, not every ratio that exists.
 */
export const CONTENT_ASPECTS = [
  { id: "9:16", label: "Vertical · 9:16", ratio: 9 / 16 },
  { id: "4:5", label: "Portrait · 4:5", ratio: 4 / 5 },
  { id: "1:1", label: "Square · 1:1", ratio: 1 },
  { id: "4:3", label: "Classic · 4:3", ratio: 4 / 3 },
  { id: "16:9", label: "Wide · 16:9", ratio: 16 / 9 },
] as const;

export type ContentAspectId = (typeof CONTENT_ASPECTS)[number]["id"];

export function contentAspect(id: string): number {
  return CONTENT_ASPECTS.find((entry) => entry.id === id)?.ratio ?? DEFAULT_CONTENT_ASPECT;
}
