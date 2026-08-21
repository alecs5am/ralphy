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
  const slot = projectGlyphSlot(name);
  return {
    "--glyph-color": `color-mix(in oklab, var(--p${slot}) ${55 + hash % 41}%, var(--p${slot % 8 + 1}))`,
  } as CSSProperties;
}

export function projectGlyphSlot(name: string): number {
  return identityHash(name) % 8 + 1;
}

export function projectGlyphAsset(name: string): string {
  return `./assets/dither/g${projectGlyphSlot(name)}.png`;
}

export function workspaceDitherVars(name: string): CSSProperties {
  const hash = identityHash(name);
  const slot = projectGlyphSlot(name);
  return {
    "--workspace-color": `color-mix(in oklab, var(--p${slot}) ${55 + hash % 41}%, var(--p${slot % 8 + 1}))`,
    "--workspace-highlight": `var(--p${slot % 8 + 1})`,
  } as CSSProperties;
}
