export interface EffectSettings { amount: number }

const VISUAL_EFFECTS = {
  "vhs-overlay": { label: "Tracking", value: 58, source: "horror-corridor" },
  "chroma-split": { label: "Separation", value: 50, source: "night-city" },
  "film-grain": { label: "Grain", value: 45, source: "fashion-editorial" },
  "noir-grade": { label: "Intensity", value: 90, source: "editorial-portrait" },
  "voxel-dither": { label: "Pixel size", value: 50, source: "desert-racer" },
  "crt-scanlines": { label: "Scanlines", value: 60, source: "chrome-product" },
} as const;

export type VisualEffectId = keyof typeof VISUAL_EFFECTS;

export function effectStudio(id?: string) {
  if (!id || !Object.prototype.hasOwnProperty.call(VISUAL_EFFECTS, id)) return null;
  const effectId = id as VisualEffectId;
  const effect = VISUAL_EFFECTS[effectId];
  return { id: effectId, sourceUrl: `${import.meta.env.BASE_URL}explore/studio/${effect.source}.png`, label: effect.label, defaultSettings: { amount: effect.value } };
}

export function effectAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 50;
}

export const effectPixelSize = (amount: number) => 1 + Math.round(effectAmount(amount) * 0.18);
