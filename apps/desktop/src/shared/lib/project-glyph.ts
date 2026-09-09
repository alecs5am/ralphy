import type { CSSProperties } from "react";

function identityHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

// Identity colour: the hue comes from the name's slot, and the name also picks how far
// the tone sits between the slot's base and its highlight, so same-hue identities stay
// distinguishable without leaving the ramp.
function identityTone(name: string): string {
  const slot = projectGlyphSlot(name);
  const step = identityHash(name) % 5 * 11;
  return `color-mix(in oklab, var(--p${slot}) ${100 - step}%, var(--p${slot}-hi))`;
}

export function projectGlyphVars(name: string): CSSProperties {
  return { "--glyph-color": identityTone(name) } as CSSProperties;
}

export function projectGlyphSlot(name: string): number {
  return identityHash(name) % 8 + 1;
}

export function projectGlyphAsset(name: string): string {
  return `./assets/dither/g${projectGlyphSlot(name)}.png`;
}

// Identity colour: the hue comes from the workspace name, the base/highlight pair is the
// ramp defined in the palette. The highlight stays on the same hue so the grain reads as
// one material rather than two colours.
export function workspaceDitherVars(name: string): CSSProperties {
  return {
    "--workspace-color": identityTone(name),
    "--workspace-highlight": `var(--p${projectGlyphSlot(name)}-hi)`,
  } as CSSProperties;
}
