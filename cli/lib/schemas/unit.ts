// Unit manifest Zod schema (#069). A `unit.json` is the project-side mirror of
// the library-v2 Unit entity (`ralphy-web/lib/library-v2/types.ts`): a finished,
// curated deliverable assembled from copies of selected `artifacts/` files. It
// lives at `<project>/units/<slug>/unit.json` and feeds the
// publish path (#056) without re-deriving provenance.
//
// `units/` is append-only (AGENTS.md invariant #14): a new slug = new dir, a
// re-create on an existing slug = a `.v2` dir, `add` appends to `media`. The
// schema itself is structural; the append-only discipline lives in the command.

import { z } from "zod";

/**
 * The nine media formats. Mirrors `FormatId` in
 * `ralphy-web/lib/library-v2/types.ts` member-for-member so a `unit.json` written
 * here is directly consumable by the library-v2 graph. The CLI keeps its own
 * copy (no cross-package import) but the members must stay in lockstep.
 *
 * `article` (#526) is the first NON-media format: the deliverable is a markdown
 * body file (+ optional hero / inline images produced by the existing image
 * pipeline), not a still / clip. Its per-format metadata lives on the optional
 * `article` field below (frontmatter: title, description, slug, tags, canonical
 * URL, hero ref) — `media[0]` is the body `.md`, any further entries are images.
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
  "article",
  "post",
  "thread",
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
    /**
     * Attribution sources (#543) — the citable source url/outlet/author a
     * news-farm unit borrows from, carried from the source-facts / research
     * facts onto the deliverable. The publish-time attribution policy
     * (workspace `attribution` block) injects these as a "Sources:" block into
     * the description / caption / frontmatter. Optional/additive — a unit with
     * no borrowed material carries none, and older `unit.json` files predate it
     * and must still validate.
     */
    sources: z
      .array(
        z.object({
          url: z.string().min(1),
          outlet: z.string().optional(),
          author: z.string().optional(),
        }),
      )
      .optional(),
    /**
     * Performance-selection axes (#532) — the creative choices the campaign
     * picker (#528) + variance planner (#529) made for this unit, stamped at
     * production time so the selection loop (`cli/lib/selection.ts`) can join
     * measured analytics back to what was chosen and bias future picks toward
     * winners. All optional/additive — a unit produced outside a campaign /
     * variance flow carries none, and older `unit.json` files predate the block
     * and must still validate. Values are pool labels / cell fields, never
     * free-form prose.
     */
    selection: z
      .object({
        /** Opener shape from the variance profile (`VarianceProfile.hookType`). */
        hookType: z.string().optional(),
        /** Coarse length bucket (short | medium | long) — `lengthBand()`. */
        lengthBand: z.string().optional(),
        /** Campaign cell creative angle. */
        angle: z.string().optional(),
        /** Campaign cell thesis id. */
        thesis: z.string().optional(),
        /** Media format (mirrors the manifest `format`, carried for attribution). */
        format: z.string().optional(),
      })
      .partial()
      .optional(),
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
 * Article frontmatter metadata (#526) — the SEO/GEO-shaped header a `article`
 * unit carries alongside its markdown body (`media[0]`). Maps to the Medium /
 * GitHub-Pages / static-site frontmatter a publisher writes: `title` +
 * `description` are the search-snippet pair, `slug` the URL stub, `tags` the
 * topic facets, `canonicalUrl` the canonical-URL slot (filled at publish time,
 * empty until then), `hero` the optional unit-relative hero image filename.
 * Optional/additive — only `article`-format units carry it; older `unit.json`
 * files predate it and must still validate.
 */
export const UnitArticleMetaSchema = z.object({
  /** SEO title / H1 — the search-result headline. */
  title: z.string(),
  /** Meta description — the search-snippet body (~150-160 chars). */
  description: z.string(),
  /** URL slug (kebab-case), the article's path stub. */
  slug: z.string().regex(SLUG_RE, "article slug must be kebab-case"),
  /** Topic tags / keywords the article targets. */
  tags: z.array(z.string()),
  /** Canonical URL slot — the published home. Empty string until published. */
  canonicalUrl: z.string(),
  /** Optional unit-relative hero image filename (a member of `media`). */
  hero: z.string().optional(),
  /** Unit-relative filename of the markdown body (a member of `media`). */
  body: z.string(),
});

export type UnitArticleMeta = z.infer<typeof UnitArticleMetaSchema>;

export const UNIT_TEXT_DESTINATIONS = [
  "telegram",
  "x",
  "threads",
  "devto",
  "medium",
  "x-article",
] as const;

export const UnitTextSchema = z.object({
  body: z.string().min(1),
  destinations: z.array(z.enum(UNIT_TEXT_DESTINATIONS)).min(1),
});

export type UnitText = z.infer<typeof UnitTextSchema>;

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
   * The public URL of the published post, when the target returns one (#527
   * article rails — github-pages / devto / hashnode carry a real `url`; media
   * targets today carry only a `postId`). Optional/additive; consumed by
   * campaign cross-linking (#528) to resolve sibling URLs honestly. Older
   * `unit.json` files predate it and must still validate.
   */
  url: z.string().nullable().optional(),
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
   * ponytail: the ralphy-web publish path consumes this UnitManifest
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
   *  kept in lockstep with `Unit.tags` in ralphy-web/lib/library-v2/types.ts. */
  tags: z.array(z.string()).optional(),
  /** Original project-relative paths the media was copied from. */
  source_assets: z.array(z.string()).optional(),
  /** ISO timestamp the unit was formed. */
  created: z.string(),
  title: z.string().optional(),
  blurb: z.string().optional(),
  /**
   * Article frontmatter (#526) — present on `article`-format units, absent on
   * media units. Optional/additive; the `unit create --format article` path
   * populates it, `media[0]` is the body `.md` it names via `article.body`.
   */
  article: UnitArticleMetaSchema.optional(),
  /** Inline written deliverable and its intended publication rails. */
  text: UnitTextSchema.optional(),
  /** Platform-shaped social copy + hashtags (#403). Optional/additive. */
  caption: UnitCaptionSchema.optional(),
  /** Prior captions, archived append-only when `unit caption --force` re-drafts. */
  caption_versions: z.array(UnitCaptionSchema).optional(),
  /** Publish provenance (#501): one record per publish attempt. APPEND-only. */
  publish: z.array(UnitPublishRecordSchema).optional(),
}).superRefine((manifest, ctx) => {
  const allowed =
    manifest.format === "post"
      ? new Set(["telegram", "x", "threads"])
      : manifest.format === "thread"
        ? new Set(["x", "threads"])
        : manifest.format === "article"
          ? new Set(["devto", "medium", "x-article"])
          : null;

  if ((manifest.format === "post" || manifest.format === "thread") && !manifest.text) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text"],
      message: `${manifest.format} units require text`,
    });
    return;
  }
  if (!manifest.text) return;
  if (!allowed) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["text", "destinations"],
      message: `${manifest.format} units do not accept text destinations`,
    });
    return;
  }
  for (const destination of manifest.text.destinations) {
    if (!allowed.has(destination)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text", "destinations"],
        message: `${destination} is not a destination for ${manifest.format} units`,
      });
    }
  }
});

export type UnitManifest = z.infer<typeof UnitManifestSchema>;

/** True when `slug` is a legal kebab-case unit slug. */
export function isValidUnitSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}
