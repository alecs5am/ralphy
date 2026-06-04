// Unit manifest Zod schema (#069). A `unit.json` is the project-side mirror of
// the library-v2 Unit entity (`landing/lib/library-v2/types.ts`): a finished,
// curated deliverable assembled from copies of selected `assets/` files. It
// lives at `workspace/projects/<id>/units/<slug>/unit.json` and feeds the
// publish path (#056) without re-deriving provenance.
//
// `units/` is append-only (AGENTS.md invariant #14): a new slug = new dir, a
// re-create on an existing slug = a `.v2` dir, `add` appends to `media`. The
// schema itself is structural; the append-only discipline lives in the command.

import { z } from "zod";

/**
 * The eight media formats. Mirrors `FormatId` in
 * `landing/lib/library-v2/types.ts` member-for-member so a `unit.json` written
 * here is directly consumable by the library-v2 graph. The CLI keeps its own
 * copy (no cross-package import) but the members must stay in lockstep.
 */
export const UNIT_FORMATS = [
  "video",
  "carousel",
  "sticker-pack",
  "podcast-cuts",
  "fb-creative",
  "motion-design",
  "poster",
  "image",
] as const;
export type UnitFormat = (typeof UNIT_FORMATS)[number];

/** Slug regex — kebab-case only (matches the template slug convention). */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/u;

/**
 * Provenance: the factual blocks that made the unit. `template` + `style` are
 * single-value axes; `recipes` + `assets` are multi-value. All optional — a
 * hand-curated unit may carry no provenance at all.
 */
export const UnitProvenanceSchema = z
  .object({
    template: z.string().optional(),
    style: z.string().optional(),
    recipes: z.array(z.string()).optional(),
    assets: z.array(z.string()).optional(),
  })
  .partial();

export type UnitProvenance = z.infer<typeof UnitProvenanceSchema>;

/**
 * Per-file media metadata, keyed by the unit-relative filename. Optional and
 * additive (older `unit.json` files predate it and must still validate). Each
 * entry carries the file's intrinsic `aspect` ("W / H", omitted when detection
 * failed) and its `kind` (image vs video). Populated by `unit create` / `add`
 * via header-read (`image-size`) for images and `ffprobe` for videos.
 */
export const UnitMediaMetaSchema = z.object({
  aspect: z.string().optional(),
  kind: z.enum(["image", "video"]),
});

export type UnitMediaMeta = z.infer<typeof UnitMediaMetaSchema>;

export const UnitManifestSchema = z.object({
  slug: z.string().regex(SLUG_RE, "unit slug must be kebab-case"),
  format: z.enum(UNIT_FORMATS),
  /** Ordered filenames relative to the unit dir (the copied media). */
  media: z.array(z.string()),
  /** Per-file intrinsic aspect + kind, keyed by filename. Optional/additive. */
  media_meta: z.record(z.string(), UnitMediaMetaSchema).optional(),
  provenance: UnitProvenanceSchema.optional(),
  /** Tags (#082): textual descriptors for finding similar videos. Filter-only —
   *  carried into the published Unit + the units `tags` column. Optional/additive,
   *  kept in lockstep with `Unit.tags` in landing/lib/library-v2/types.ts. */
  tags: z.array(z.string()).optional(),
  /** Original project-relative paths the media was copied from. */
  source_assets: z.array(z.string()).optional(),
  /** ISO timestamp the unit was formed. */
  created: z.string(),
  title: z.string().optional(),
  blurb: z.string().optional(),
});

export type UnitManifest = z.infer<typeof UnitManifestSchema>;

/** True when `slug` is a legal kebab-case unit slug. */
export function isValidUnitSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
