import type { CSSProperties } from "react";

function identityHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function projectGlyphVars(name: string): CSSProperties {
  const hash = identityHash(name);
  return {
    "--glyph-color": `oklch(0.76 0.1 ${hash % 360})`,
  } as CSSProperties;
}

export function projectGlyphSlot(name: string): number {
  return identityHash(name) % 8 + 1;
}

export function workspaceDitherVars(name: string): CSSProperties {
  const hue = identityHash(name) % 360;
  return {
    "--workspace-color": `oklch(0.66 0.14 ${hue})`,
    "--workspace-highlight": `oklch(0.8 0.1 ${hue})`,
  } as CSSProperties;
}
