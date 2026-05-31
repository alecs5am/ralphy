// Block-kind + asset-sub presentation taxonomy (the prototype's RX.KIND / RX.SUB)
// plus the tiny per-format / per-block helpers shared across the v2 library
// screens. Pure presentation — not part of the data adapter. Block-kind glyphs
// are deliberately OFF the format wheel so a block chip never reads as a format
// chip (see the design handoff's block-accent token note).

import type { Block, BlockKind, FormatId, UnitMedia } from "@/lib/library-v2/types";

export const KIND_META: Record<
  BlockKind,
  { label: string; plural: string; glyph: string }
> = {
  template: { label: "Template", plural: "Templates", glyph: "▦" },
  style: { label: "Style", plural: "Styles", glyph: "✸" },
  recipe: { label: "Recipe", plural: "Recipes", glyph: "❉" },
  asset: { label: "Asset", plural: "Assets", glyph: "◆" },
};

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

/** A multi-item unit's individual item renders as a single still / clip of its
 *  format family (mirrors the prototype's singleItemFormat). */
export function singleItemFormat(fmt: FormatId): FormatId {
  if (fmt === "sticker-pack") return "image";
  if (fmt === "carousel") return "poster";
  if (fmt === "fb-creative") return "image";
  if (fmt === "podcast-cuts") return "video";
  return fmt;
}
