// landing/lib/library-v2/types.ts
//
// Library v2 — the Units feed data model (issue: "Library v2 — feed of finished
// UNITS backed by reusable BLOCKS"). Pure types, fs-free, so a client island can
// import them without dragging node:fs into the browser bundle.
//
// The model has five entities (see the design handoff README):
//   Format  — the SHAPE of a deliverable (how many media items + aspect).
//   Unit    — a finished deliverable in a Format, holding 1..N media items.
//   Block   — a reusable building block, one of four kinds:
//     Template — the STRUCTURE / skeleton only, style-agnostic.
//     Style    — the visual look / register.
//     Recipe   — a composable effect / treatment (many per Unit).
//     Asset    — concrete reusable media, by `sub` kind.
//
// A Unit = exactly 1 Template + 1 Style + N Recipes + M Assets, in a Format.
// That ingredient list is the Unit's PROVENANCE (the factual blocks that made
// it). The swap menu offers APPLICABLE blocks (other blocks of the same kind
// that fit a slot; for assets, the same `sub`).
//
// This file matches the `window.RX` shape spec in the prototype's `lib2/data.js`
// exactly — the catalog there is illustrative, the shape is the contract.

/** The eight media formats. Each format dictates the shape of a Unit (item count
 *  + aspect). Mirrors the prototype FORMATS list verbatim. */
export type FormatId =
  | "video"
  | "carousel"
  | "sticker-pack"
  | "podcast-cuts"
  | "fb-creative"
  | "motion-design"
  | "poster"
  | "image";

/** A media format: a SHAPE. `unit` is the per-item noun ("clip", "slides").
 *  `glyph` + `aspect` drive the card iconography and tile aspect-ratio. */
export interface Format {
  id: FormatId;
  label: string;
  glyph: string;
  aspect: string;
  unit: string;
  blurb: string;
}

/** The four block kinds. `template` is the only single-value-per-unit axis
 *  alongside `style`; `recipe` and `asset` are multi-value. */
export type BlockKind = "template" | "style" | "recipe" | "asset";

/** Asset sub-kinds. A swap fits same-sub only (swap a location for a location). */
export type AssetSub = "character" | "location" | "prop" | "music";

/** A reusable building block. `sub` is present ONLY on assets. `refs` is an
 *  optional list of reference-example media paths surfaced on the block page —
 *  left empty in this migration pass (wiring reference media comes later). */
export interface Block {
  kind: BlockKind;
  id: string;
  name: string;
  blurb: string;
  /** Only on assets. */
  sub?: AssetSub;
  /** Reference-example media for the block page. Empty in this pass. */
  refs?: string[];
}

/** A single resolved, web-servable media item for a Unit. */
export interface UnitMedia {
  /** Public URL the gallery renders (e.g. `/showcase/<slug>/...`). */
  src: string;
  kind: "image" | "video";
  /** CSS aspect-ratio ("W / H"). */
  aspect: string;
  /** Poster frame for a video tile, when one exists. */
  poster?: string;
  /** Supabase Storage public URL (set when published/seeded). The adapter
   *  prefers this over the local `src` when present (mediaUrl). */
  storageUrl?: string;
}

/** A finished deliverable. `templateId` + `styleId` are single; `recipeIds` +
 *  `assetIds` are many. `mediaCount` is derived from the format default when not
 *  explicit. `media` carries the real on-disk paths (the ONLY source of Units in
 *  this migration). `hero` flags the feed's lead unit. */
export interface Unit {
  id: string;
  format: FormatId;
  title: string;
  blurb: string;
  date?: string;
  templateId: string;
  styleId: string;
  recipeIds: string[];
  assetIds: string[];
  /** Item count: actual file count for packs/carousels/cuts/sets when known,
   *  else the format default (DEFAULT_N). */
  mediaCount: number;
  /** Real on-disk media paths. */
  media?: UnitMedia[];
  hero?: boolean;
}

/** The four block arrays, deduped, keyed by kind. */
export interface BlocksByKind {
  template: Block[];
  style: Block[];
  recipe: Block[];
  asset: Block[];
}

// ── Relation function signatures (the relations the UI needs) ────────────────

/** Units whose provenance includes the given block (and the synthetic
 *  `"format"` kind for the format cards). */
export type UnitsUsingFn = (
  kind: BlockKind | "format",
  id: string,
) => Unit[];

/** Other blocks of the same kind that fit a slot on a unit (the swap menu).
 *  For assets, fit = same `sub`. `currentId` is excluded from the result. */
export type ApplicableFn = (
  kind: BlockKind,
  unit: Unit | undefined,
  currentId?: string,
  sub?: AssetSub,
) => Block[];

/** Unit-count per block of a kind, keyed by block id — for menu badges. */
export type CountsFn = (kind: BlockKind) => Record<string, number>;

/** Unit-count per format, for the format cards. */
export type FmtCounts = Record<FormatId, number>;
