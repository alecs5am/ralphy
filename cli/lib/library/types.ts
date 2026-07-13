// cli/lib/library/types.ts
//
// The PUBLIC content-library entity model, mirrored from
// `ralphy-web/lib/library-v2/types.ts` (the canonical contract). The CLI reads the
// library from the static `library.json` on Bunny CDN (see ./client.ts), so it
// needs the same entity shapes — but it MUST NOT import across repository
// boundaries. These interfaces are therefore a deliberate, self-contained copy.
//
// Post Style-removal (#082): the entity model is Unit + Block (kind ∈
// `template | recipe | asset` — the former `style` kind was demoted to a unit
// Tag) + Blueprint + Format. Format has no DB table; it is a static enum/list
// exposed by the client.

/** The media formats. Each dictates the shape of a Unit (item count + aspect). */
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
 *  `glyph` + `aspect` drive card iconography and tile aspect-ratio. */
export interface Format {
  id: FormatId;
  label: string;
  glyph: string;
  aspect: string;
  unit: string;
  blurb: string;
}

/** The three block kinds (the former `style` kind was demoted to a unit Tag). */
export type BlockKind = "template" | "recipe" | "asset";

/** Asset sub-kinds. A swap fits same-sub only. */
export type AssetSub = "character" | "location" | "prop" | "music";

/** The concrete treatment class of an enriched recipe block (#082). */
export type RecipeKind =
  | "ffmpeg"
  | "encode"
  | "overlay"
  | "bake"
  | "hyperframes"
  | "prompt";

/** A live/visual demo for an enriched recipe block (#082). */
export interface BlockRecipeDemo {
  kind: "hyperframes" | "media";
  html?: string;
  storageUrl?: string;
  beforeUrl?: string;
  afterUrl?: string;
  posterUrl?: string;
}

/** A reusable building block. `sub` is present ONLY on assets. The
 *  `recipeKind` / `body` / `artifact` / `params` / `demo` fields are the
 *  enriched-recipe payload (#082), present ONLY on `kind:"recipe"` blocks. In
 *  the DB the enriched payload lives in the row's `data` jsonb; the client
 *  merges those keys onto the entity. */
export interface Block {
  kind: BlockKind;
  id: string;
  name: string;
  blurb: string;
  /** Only on assets. */
  sub?: AssetSub;
  /** Reference-example media for the block page. */
  refs?: string[];
  createdAt?: string;
  /** Recipe-only (#082): the treatment class. */
  recipeKind?: RecipeKind;
  /** Recipe-only (#082): markdown how-to. */
  body?: string;
  /** Recipe-only (#082): the copyable reusable code. */
  artifact?: string;
  /** Recipe-only (#082): named knobs/values for the artifact. */
  params?: Record<string, unknown>;
  /** Recipe-only (#082): a live (HyperFrames) or visual (media) demo. */
  demo?: BlockRecipeDemo;
  /** Any other keys carried by the row's `data` jsonb. */
  [extra: string]: unknown;
}

/** A single resolved, web-servable media item for a Unit. */
export interface UnitMedia {
  src: string;
  kind: "image" | "video";
  aspect: string;
  poster?: string;
  /** Supabase Storage public URL (preferred over `src` when present). */
  storageUrl?: string;
}

/** A finished deliverable. The look is carried in `tags`. */
export interface Unit {
  id: string;
  format: FormatId;
  title: string;
  blurb: string;
  date?: string;
  /** Real on-disk / Storage media paths. */
  media?: UnitMedia[];
  /** Item count for the format. */
  mediaCount: number;
  hero?: boolean;
  createdAt?: string;
  /** Filter-only textual descriptors, INCLUDING the unit's look/register. */
  tags?: string[];
}

/** A per-unit, reproduction-grade recipe (#074). In the DB the full payload
 *  lives in the row's `data` jsonb (the six reproduction axes); the client
 *  merges those keys onto the entity. 1:1 with a Unit via `unitId`. */
export interface Blueprint {
  unitId: string;
  createdAt?: string;
  /** The six reproduction axes (scenario / prompts / composition / assets /
   *  modelStack / recipes / costRollupUsd / schemaVersion / …) merged from the
   *  row's `data` jsonb. Kept open so the CLI does not couple to the full
   *  Blueprint schema, which lives in cli/lib/schemas/blueprint.ts. */
  [axis: string]: unknown;
}
