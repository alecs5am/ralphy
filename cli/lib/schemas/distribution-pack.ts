// Distribution-pack Zod schema (#423). A `distribution-pack.json` is the
// project-side, platform-ready packaging of a finished Unit: per-platform
// captions / titles / hashtags (sourced from the unit's `UnitCaption`, #403),
// a thumbnail / poster-frame pick, the ordered selected-media bundle, and a
// short publish note. It is the last-mile handoff that turns a rendered Unit
// into something a user can post / upload / hand to a buyer.
//
// Where the JSON lands:
//   • <project>/units/<slug>/distribution-pack.json  (beside unit.json)
//   • <project>/units/<slug>/DISTRIBUTION.md         (the readable handoff)
//   • <project>/units/<slug>/distribution/           (COPIES of the deliverables)
//
// Additive + append-only (AGENTS.md #14): re-packaging auto-versions
// (`distribution-pack.v2.json`, the prior is never overwritten). The pack
// COPIES from the unit's media — it never moves or mutates a source file.
//
// Schema style mirrors `cli/lib/schemas/{ref-pack,unit,production-contract}.ts`:
// a Zod object with inline-doc comments, exported `z.infer` types, sane
// defaults so a best-effort assembly still parses, and a `parseDistributionPack()`.
// English-only-on-disk.

import { z } from "zod";

// ─── Platform taxonomy ───────────────────────────────────────────────────────

/**
 * The five distribution platforms a pack can carry. Which ones are emitted is
 * driven by the unit's `format` (a carousel/image/fb-creative has no Shorts
 * title, an app-store section only fits image-pack formats, …) — see
 * `platformsForFormat()` below. Append, never repurpose.
 */
export const DISTRIBUTION_PLATFORMS = [
  "tiktok",
  "reels",
  "shorts",
  "meta",
  "app-store",
] as const;
export type DistributionPlatform = (typeof DISTRIBUTION_PLATFORMS)[number];

/** True when `value` is a legal platform key. */
export function isDistributionPlatform(value: unknown): value is DistributionPlatform {
  return typeof value === "string" && (DISTRIBUTION_PLATFORMS as readonly string[]).includes(value);
}

// ─── A per-platform section ───────────────────────────────────────────────────

/**
 * The spec/safe-area validation verdict a platform section carries (#458 #2).
 * Sourced from the #443 platform-spec validator (`cli/lib/eval/platform.ts`) —
 * never re-derived here. `na` = the validator had no media to check this
 * platform against; the section still ships its copy.
 */
export const PlatformSpecStatusSchema = z.enum(["pass", "warn", "fail", "na"]);
export type PlatformSpecStatus = z.infer<typeof PlatformSpecStatusSchema>;

/**
 * One platform's publish-ready fields. All optional/additive: a platform only
 * fills the fields that make sense for it (TikTok = a hook caption + tags;
 * Shorts = a ≤40-char title; Meta = ad primary text + CTA variants). Sourced
 * from the unit's `UnitCaption` (#403) — never re-derived here.
 */
export const PlatformSectionSchema = z.object({
  /** The post caption / body (TikTok hook, Reels caption). */
  caption: z.string().optional(),
  /** The post / video title (Shorts ≤40-char title, app-store listing title). */
  title: z.string().optional(),
  /** The hashtag set (shaped per platform; from the unit's caption bank). */
  hashtags: z.array(z.string()).optional(),
  /** Meta-ad-only: the ad primary text. */
  primaryText: z.string().optional(),
  /** Meta-ad-only: CTA button-text variants to A/B. */
  ctaVariants: z.array(z.string()).optional(),

  // ─── #458 additive: channel-profile validation + export shape ───────────────

  /**
   * #458 #2: the #443 platform-spec verdict for THIS platform's media — does the
   * bundle meet the channel's aspect / resolution / duration / codec / file-size
   * / safe-area spec. `na` when there was no media to validate.
   */
  specStatus: PlatformSpecStatusSchema.optional(),
  /** #458 #2: concrete spec-violation / safe-area fix hints for this platform. */
  specNotes: z.array(z.string()).optional(),
  /** #458 #1: the deliverable filenames (in the copied bundle) this platform posts. */
  outputFilenames: z.array(z.string()).optional(),
  /** #458 #1: the channel's hard export requirements (aspect, codec, max size, …) as readable strings. */
  exportRequirements: z.array(z.string()).optional(),
});
export type PlatformSection = z.infer<typeof PlatformSectionSchema>;

// ─── Readiness block (#458 #5) ────────────────────────────────────────────────

/**
 * The pack's readiness verdict, sourced verbatim from the #427 scorecard
 * (`buildScorecard`) — never re-derived here. Gates the top-level `shippable`
 * flag. `verdict` is the scorecard's own four-value verdict.
 */
export const DistributionReadinessSchema = z.object({
  /** The scorecard verdict: ship | repair | needs-user-decision | blocked. */
  verdict: z.string().default("needs-user-decision"),
  /** One-line reason for the verdict (the scorecard's own reason string). */
  reason: z.string().default(""),
  /** The scorecard's `polished` boolean (null = nothing rendered/evaluated yet). */
  polished: z.boolean().nullable().default(null),
  /** True when the user explicitly bypassed a non-ship readiness verdict. */
  bypassed: z.boolean().default(false),
  /** The user-supplied bypass reason, when `bypassed`. */
  bypassReason: z.string().nullable().default(null),
});
export type DistributionReadiness = z.infer<typeof DistributionReadinessSchema>;

// ─── The top-level pack object ─────────────────────────────────────────────────

export const DistributionPackSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The project id the pack belongs to. */
  projectId: z.string().default(""),
  /** The unit slug this pack packages. */
  slug: z.string().default(""),
  /** The unit format the platform sections were shaped from. */
  format: z.string().default(""),
  /** ISO timestamp of assembly. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** Per-platform publish-ready sections (only the platforms that fit the format). */
  platforms: z.record(z.enum(DISTRIBUTION_PLATFORMS), PlatformSectionSchema).default({}),
  /** The chosen thumbnail / poster-frame (unit-relative path), or null with a note. */
  thumbnail: z.string().nullable().default(null),
  /** The ordered selected media (unit-relative paths), copied into `distribution/`. */
  selectedMedia: z.array(z.string()).default([]),
  /** A short human publish note (English-on-disk). */
  publishNote: z.string().default(""),

  // ─── #458 additive: readiness gate + packaged archive ───────────────────────

  /**
   * #458 #5: the readiness verdict (from the #427 scorecard), or null when the
   * scorecard could not be read. Gates `shippable`.
   */
  readiness: DistributionReadinessSchema.nullable().default(null),
  /**
   * #458 #5: the pack is ship-ready only when the readiness verdict is `ship`
   * OR the user explicitly bypassed it. A `repair` / `blocked` / `needs-user-
   * decision` verdict with no bypass leaves this false — the copy + bundle still
   * assemble, but the pack is flagged not-yet-shippable.
   */
  shippable: z.boolean().default(false),
  /**
   * #458 #3: the unit-relative path of the packaged ZIP of the copied bundle,
   * or null when the JSON was assembled without the command-side zip step.
   */
  archive: z.string().nullable().default(null),
});
export type DistributionPack = z.infer<typeof DistributionPackSchema>;

/** The unit-relative basename the pack JSON / handoff / copy dir / zip use. */
export const DISTRIBUTION_PACK_FILE = "distribution-pack.json" as const;
export const DISTRIBUTION_HANDOFF_FILE = "DISTRIBUTION.md" as const;
export const DISTRIBUTION_COPY_DIR = "distribution" as const;
/** The unit-relative basename of the packaged ZIP (#458 #3). `<slug>` is filled per-unit. */
export const distributionZipName = (slug: string): string => `${slug}-distribution.zip`;

/**
 * Map a distribution-pack platform key to its #443 platform-profile key
 * (`cli/lib/eval/platform.ts`). The pack taxonomy (`meta`, `app-store`) is the
 * publish-copy view; the validator owns the richer spec taxonomy. Append, never
 * repurpose.
 */
export function profileKeyFor(platform: DistributionPlatform): string {
  switch (platform) {
    case "meta":
      return "meta-ad";
    case "app-store":
      return "app-store-screenshot";
    default:
      return platform; // tiktok / reels / shorts share the key
  }
}

/**
 * Which platforms a unit format distributes to. The mapping is intentionally
 * simple and driven by the format alone:
 *   • video / podcast-cuts / motion-design → the three short-video platforms.
 *   • fb-creative                          → meta only (it IS a Meta ad creative).
 *   • carousel                             → tiktok + reels (swipe formats; no Shorts title).
 *   • image / poster / sticker-pack        → reels + meta + app-store (static stills).
 * Unknown formats fall back to the full short-video trio.
 */
export function platformsForFormat(format: string): DistributionPlatform[] {
  switch (format) {
    case "video":
    case "podcast-cuts":
    case "motion-design":
      return ["tiktok", "reels", "shorts"];
    case "fb-creative":
      return ["meta"];
    case "carousel":
      return ["tiktok", "reels"];
    case "image":
    case "poster":
    case "sticker-pack":
      return ["reels", "meta", "app-store"];
    default:
      return ["tiktok", "reels", "shorts"];
  }
}

/**
 * Parse + validate an unknown value into a DistributionPack. Throws a ZodError
 * on a malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch
 * and pass `error.message` as `detail`.
 */
export function parseDistributionPack(input: unknown): DistributionPack {
  return DistributionPackSchema.parse(input);
}
