import type { ProjectReference } from "../api/ipc";
import type { MediaRef } from "../../../electron/ralphy/types";

/**
 * One media record on its way from a project to the Create page.
 *
 * Create is a workspace page and media lives on a project page, so carrying a reference between
 * them means a route change, and a route change unmounts the sender. The request therefore
 * outlives both screens: the media panel leaves it here and navigates, and Create picks it up on
 * the way in. It is taken rather than read, so a later visit to Create does not re-adopt a
 * reference the operator has since removed.
 *
 * `intent` is what the operator asked for, not what the model is: "animate" means they picked a
 * still and want it moving, so Create switches to video before adding it as the opening frame.
 */
export interface GenerationHandoff {
  project: ProjectReference;
  ref: MediaRef;
  label: string;
  intent: "animate" | "reference";
}

let pending: GenerationHandoff | null = null;

export function requestGeneration(request: GenerationHandoff): void {
  pending = request;
}

export function takeGeneration(): GenerationHandoff | null {
  const request = pending;
  pending = null;
  return request;
}
