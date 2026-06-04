// Block-kind + asset-sub presentation taxonomy (the prototype's RX.KIND / RX.SUB)
// plus the tiny per-format / per-block helpers shared across the v2 library
// screens. Pure presentation — not part of the data adapter. Block-kind glyphs
// are deliberately OFF the format wheel so a block chip never reads as a format
// chip (see the design handoff's block-accent token note).

import type { ComponentType } from "react";
import type { Block, BlockKind, Format, FormatId, RecipeKind, Unit, UnitMedia } from "@/lib/library-v2/types";
import {
  BakeIcon,
  EncodeIcon,
  FfmpegIcon,
  FramesIcon,
  OverlayIcon,
  PromptIcon,
} from "./icons";

export const KIND_META: Record<
  BlockKind,
  { label: string; plural: string; glyph: string }
> = {
  template: { label: "Template", plural: "Templates", glyph: "▦" },
  style: { label: "Style", plural: "Styles", glyph: "✸" },
  recipe: { label: "Recipe", plural: "Recipes", glyph: "❉" },
  asset: { label: "Asset", plural: "Assets", glyph: "◆" },
};

/** Per-recipeKind presentation (#082): a distinct icon + label + hue so a recipe
 *  reads its treatment class at a glance, BEFORE you read its name. The hue is an
 *  oklch token in the same chroma/lightness family as the format wheel but pulled
 *  one step muted (chroma 0.11) so it never out-shouts a format chip; the six
 *  hues are spread around the wheel and deliberately avoid the orange accent
 *  (~35-70) and the blue Blueprint tokens (~250). `var(--rk-<kind>)` /
 *  `var(--rk-<kind>-tint)` are defined in library2.css. */
export const RECIPE_KIND_META: Record<
  RecipeKind,
  { label: string; icon: ComponentType<{ s?: number }>; hue: string; tint: string }
> = {
  ffmpeg: { label: "ffmpeg filtergraph", icon: FfmpegIcon, hue: "var(--rk-ffmpeg)", tint: "var(--rk-ffmpeg-tint)" },
  encode: { label: "encode settings", icon: EncodeIcon, hue: "var(--rk-encode)", tint: "var(--rk-encode-tint)" },
  overlay: { label: "overlay recipe", icon: OverlayIcon, hue: "var(--rk-overlay)", tint: "var(--rk-overlay-tint)" },
  bake: { label: "ffmpeg bake recipe", icon: BakeIcon, hue: "var(--rk-bake)", tint: "var(--rk-bake-tint)" },
  hyperframes: { label: "HyperFrames snippet", icon: FramesIcon, hue: "var(--rk-hyperframes)", tint: "var(--rk-hyperframes-tint)" },
  prompt: { label: "prompt template", icon: PromptIcon, hue: "var(--rk-prompt)", tint: "var(--rk-prompt-tint)" },
};

/** Human label for a recipe block's treatment class. Shared by the recipe chip
 *  (IngredientPanel), the recipe page header badge, and RecipeDetail's artifact
 *  label. Falls back to a neutral string when the kind is absent (pre-#083). */
export function recipeKindLabel(kind: RecipeKind | undefined): string {
  return kind ? RECIPE_KIND_META[kind].label : "recipe artifact";
}

export const SUB_META: Record<string, { label: string; glyph: string }> = {
  character: { label: "Character", glyph: "☻" },
  location: { label: "Location", glyph: "⌖" },
  prop: { label: "Prop", glyph: "✛" },
  music: { label: "Music", glyph: "♪" },
};

/** Pivot-rail preposition per kind ("in a Style", "from a Template", …). */
export const PREPO: Record<BlockKind, string> = {
  style: "in",
  template: "from",
  recipe: "uses",
  asset: "with",
};

export const FILTER_KINDS: BlockKind[] = ["style", "template", "recipe", "asset"];

export function fhue(fmt: FormatId): string {
  return `var(--f-${fmt})`;
}

export function blockGlyph(b: Block): string {
  return b.kind === "asset" && b.sub
    ? (SUB_META[b.sub]?.glyph ?? KIND_META.asset.glyph)
    : KIND_META[b.kind].glyph;
}

export function blockKindLabel(b: Block): string {
  return b.kind === "asset" && b.sub
    ? (SUB_META[b.sub]?.label ?? KIND_META.asset.label)
    : KIND_META[b.kind].label;
}

/** First servable URL for a media item — storageUrl wins over src. */
export function mediaUrl(m: UnitMedia): string {
  const withStorage = m as UnitMedia & { storageUrl?: string };
  return withStorage.storageUrl ?? m.src;
}

/** The CSS aspect-ratio a unit's TILE renders at — the unit's own first-media
 *  aspect (so a 16/9 clip is landscape, 1/1 square, 9/16 portrait), falling back
 *  to the format default only when the unit has no media. Single source of tile
 *  aspect truth, shared by the tile shape AND the masonry height estimate. */
export function unitTileAspect(u: Unit, format: Format | undefined): string {
  return u.media?.[0]?.aspect ?? format?.aspect ?? "4 / 5";
}

/** Numeric W/H of a "W / H" CSS aspect string (e.g. "16 / 9" → 1.78). Falls back
 *  to 0.8 (4/5 portrait) when unparseable. */
export function aspectRatioNum(aspect: string): number {
  const [w, h] = aspect.split("/").map((n) => parseFloat(n.trim()));
  return w && h ? w / h : 0.8;
}

/** A multi-item unit's individual item renders as a single still / clip of its
 *  format family (mirrors the prototype's singleItemFormat). */
export function singleItemFormat(fmt: FormatId): FormatId {
  if (fmt === "sticker-pack") return "image";
  if (fmt === "carousel") return "poster";
  if (fmt === "fb-creative") return "image";
  if (fmt === "podcast-cuts") return "video";
  return fmt;
}
