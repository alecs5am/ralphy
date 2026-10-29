// Caption presets (#565): readability limits and colour contrast derived from
// a preset's `caption` metadata in catalog/manifest.json. The caption gate
// (#441, cli/lib/eval/captions-gate.ts) takes these limits via
// `ralphy eval captions <project> --caption-preset <id>`.

import { loadCatalogManifest } from "./manifest.js";
import type { CaptionPreset, CatalogItem } from "./schema.js";
import { DEFAULT_CAPTION_LIMITS, type CaptionReadabilityLimits } from "../eval/captions-gate.js";
import { raiseError } from "../errors/index.js";

/** WCAG 2.x relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = v.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** WCAG contrast ratio (1..21) between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

/** Minimum ratios: caption text is large, but it sits on moving footage, so the body-text 4.5 bar applies to the text itself. */
export const CAPTION_CONTRAST_MIN = { text: 4.5, highlight: 3 } as const;

export type CaptionContrast = { text: number; highlight: number; boxText: number | null; ok: boolean; problems: string[] };

/**
 * Contrast of a preset's colours. `background` is what the glyphs sit on: the
 * outline / shadow colour, or the band / box colour. With a `box` highlight the
 * active word's text sits on the highlight colour instead, so that pair is
 * checked too.
 */
export function captionContrast(p: CaptionPreset): CaptionContrast {
  const text = contrastRatio(p.colors.text, p.colors.background);
  const highlight = contrastRatio(p.colors.highlight, p.colors.background);
  const boxText = p.highlight === "box" ? contrastRatio(p.colors.text, p.colors.highlight) : null;
  const problems: string[] = [];
  if (text < CAPTION_CONTRAST_MIN.text) problems.push(`text ${p.colors.text} on ${p.colors.background} is ${text}:1 (< ${CAPTION_CONTRAST_MIN.text})`);
  if (p.highlight !== "none" && p.highlight !== "box" && highlight < CAPTION_CONTRAST_MIN.highlight) {
    problems.push(`highlight ${p.colors.highlight} on ${p.colors.background} is ${highlight}:1 (< ${CAPTION_CONTRAST_MIN.highlight})`);
  }
  if (boxText !== null && boxText < CAPTION_CONTRAST_MIN.text) problems.push(`text ${p.colors.text} on box ${p.colors.highlight} is ${boxText}:1 (< ${CAPTION_CONTRAST_MIN.text})`);
  return { text, highlight, boxText, ok: problems.length === 0, problems };
}

/**
 * Gate limits for a preset: a window carrying more words than the preset shows
 * is crowded for that style (fail at about twice that), and the preset's own
 * on-screen floor replaces the generic 600 ms.
 */
export function captionLimitsFromPreset(id: string, p: CaptionPreset): CaptionReadabilityLimits {
  return {
    tooShortWarnMs: p.minOnScreenMs,
    tooShortFailMs: Math.max(200, Math.round(p.minOnScreenMs * 0.6)),
    overcrowdedWarnWords: p.wordsPerScreen,
    overcrowdedFailWords: Math.min(DEFAULT_CAPTION_LIMITS.overcrowdedFailWords, p.wordsPerScreen * 2 + 1),
    source: `preset:${id}`,
  };
}

export async function captionPresetLimitsById(id: string): Promise<CaptionReadabilityLimits> {
  const manifest = await loadCatalogManifest();
  const item = manifest.items.find((i: CatalogItem) => i.id === id && i.kind === "caption");
  if (!item || !item.caption) raiseError("E_NOT_FOUND", { kind: "caption preset", id });
  return captionLimitsFromPreset(item.id, item.caption);
}
