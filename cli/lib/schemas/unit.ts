// Unit manifest Zod schema (#069). A `unit.json` is the project-side mirror of
// the library-v2 Unit entity (`landing/lib/library-v2/types.ts`): a finished,
// curated deliverable assembled from copies of selected `artifacts/` files. It
// lives at `<project>/units/<slug>/unit.json` and feeds the
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

/**
 * Platform-shaped social post copy + a trending-hashtag set (#403). Written by
 * `ralphy unit caption`. The LLM drafts the per-platform copy (source-grounded
 * from the unit's media / provenance / brief, in the target-audience language);
 * the per-niche hashtag bank (`cli/lib/social/hashtag-bank.ts`) supplies the
 * `hashtags` spine. One invocation shapes all three platforms:
 *   • tiktok  — one hook line + 3-5 tags inline.
 *   • reels   — a fuller caption + 10-15 tags.
 *   • shorts  — a ≤40-char title.
 * Optional/additive — older `unit.json` files predate it and must still validate.
 */
export const UnitCaptionSchema = z.object({
  /** Per-platform shaped copy. */
  platform: z.object({
    /** TikTok: one hook line (+ a few tags appended at render time). */
    tiktok: z.string(),
    /** Reels: a fuller caption body. */
    reels: z.string(),
    /** Shorts: a ≤40-char title. */
    shorts: z.string(),
  }),
  /** The merged, deduped, ordered hashtag set (niche + format + broad-reach). */
  hashtags: z.array(z.string()),
  /** Target-audience language the copy was authored in (e.g. "English"). */
  language: z.string(),
  /** Resolved niche key (from the hashtag bank) used to pick the tag spine. */
  niche: z.string().optional(),
  /** ISO timestamp the caption was drafted. */
  created: z.string().optional(),
});

export type UnitCaption = z.infer<typeof UnitCaptionSchema>;

/**
 * One publish attempt against one target platform (#501). Written by
 * `ralphy publish` / the `publish` node executor after pushing the unit to
 * Postiz. The `publish` array on the manifest is APPEND-ONLY: every attempt
 * (including failed ones) appends a new record; existing records are never
 * rewritten or dropped.
 */
export const UnitPublishRecordSchema = z.object({
  /** Target platform ("youtube" | "tiktok" | "instagram" | "x"). */
  target: z.string(),
  /** The bound Postiz integration (account) id, when binding succeeded. */
  integrationId: z.string().nullable(),
  /** Provider post id (null when the attempt failed before creation). */
  postId: z.string().nullable(),
  /**
   * `idempotent-skip` (#531): the exactly-once publish ledger already carried a
   * `published`/`scheduled` record for this (unit, target, slot), so the target
   * was NOT re-fired. Recorded in the provenance (append-only) so a re-run's
   * skip is visible; carries the ledger's postId/scheduleAt.
   */
  status: z.enum(["scheduled", "published", "failed", "idempotent-skip"]),
  /** ISO datetime the post is scheduled for (null = posted immediately). */
  scheduleAt: z.string().nullable(),
  /** Failure detail for status "failed". */
  error: z.string().optional(),
  /** ISO timestamp of the attempt. */
  at: z.string(),
  /** Publishing backend ("postiz" today; a direct connector is a named follow-up). */
  backend: z.string().default("postiz"),
});

export type UnitPublishRecord = z.infer<typeof UnitPublishRecordSchema>;

export const UnitManifestSchema = z.object({
  slug: z.string().regex(SLUG_RE, "unit slug must be kebab-case"),
  format: z.enum(UNIT_FORMATS),
  /** Ordered filenames relative to the unit dir (the copied media). */
  media: z.array(z.string()),
  /** Per-file intrinsic aspect + kind, keyed by filename. Optional/additive. */
  media_meta: z.record(z.string(), UnitMediaMetaSchema).optional(),
  provenance: UnitProvenanceSchema.optional(),
  /**
   * Provenance GRAPH (#420) — the filename of the sibling `provenance.json` that
   * holds the rich reproduction chain (brief → research → style lock → prompts →
   * refs → generated assets → render → eval → council → repair → final media).
   * Stored as a SIBLING file (not inlined) to keep `unit.json` compact; this
   * field is just the pointer. Optional/additive — old units omit it and still
   * validate. See `cli/lib/schemas/provenance-graph.ts` for the storage rationale.
   *
   * ponytail: the publish path (landing/scripts/publish-entity.ts → UnitManifest)
   * does not yet read `provenance_graph` / the sibling provenance.json when
   * building public library entities (#420 scope item). It is deliberately
   * deferred: publish-entity lives in the landing app (out of scope for this CLI
   * change) and currently passes unknown fields through untouched, so nothing
   * breaks. To wire it: add `provenance_graph?: string` to that interface and
   * upload the sibling provenance.json alongside the unit's media + JSON.
   */
  provenance_graph: z.string().optional(),
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
  /** Platform-shaped social copy + hashtags (#403). Optional/additive. */
  caption: UnitCaptionSchema.optional(),
  /** Prior captions, archived append-only when `unit caption --force` re-drafts. */
  caption_versions: z.array(UnitCaptionSchema).optional(),
  /** Publish provenance (#501): one record per publish attempt. APPEND-only. */
  publish: z.array(UnitPublishRecordSchema).optional(),
});

export type UnitManifest = z.infer<typeof UnitManifestSchema>;

/** True when `slug` is a legal kebab-case unit slug. */
export function isValidUnitSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
