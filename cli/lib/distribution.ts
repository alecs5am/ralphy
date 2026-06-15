// Distribution-pack builder (#423) — the read + assemble half of
// `ralphy unit package`.
//
// Reads `units/<slug>/unit.json`, derives the per-platform publish sections
// from the unit's `UnitCaption` (#403) — reusing an existing `unit.json.caption`
// verbatim, and only DRAFTING one via `buildUnitCaption` when the unit has none
// — picks the thumbnail, and assembles a `DistributionPack`. Pure read + assemble:
// the command owns every filesystem write (the JSON, the handoff, the COPY).
//
// Testability mirrors the caption builder (#403): the caption draft fn is
// INJECTABLE, so unit tests stub it with canned copy (no live LLM, no paid gen).
//
// COPY-not-move + append-only are command-side concerns (mirroring `unit.ts`);
// this builder never touches disk beyond the unit.json + media header reads.

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { projectDir } from "./paths.js";
import {
  UnitManifestSchema,
  type UnitManifest,
  type UnitCaption,
} from "./schemas/unit.js";
import {
  buildUnitCaption,
  type CaptionContext,
  type CaptionDraftFn,
} from "./social/caption.js";
import {
  DistributionPackSchema,
  platformsForFormat,
  type DistributionPack,
  type DistributionPlatform,
  type PlatformSection,
} from "./schemas/distribution-pack.js";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

/** Default Meta-ad CTA-button variants to A/B. Generic, format-agnostic. */
const DEFAULT_META_CTAS = ["Learn More", "Shop Now", "Sign Up"] as const;

export interface BuildDistributionPackInput {
  projectId: string;
  /** Unit slug (the dir under `units/`). */
  slug: string;
  /** Injected caption draft fn — used ONLY when the unit has no caption. */
  draftFn?: CaptionDraftFn;
  /** Override the thumbnail pick (unit-relative path). */
  thumbnail?: string;
  /** Language forwarded to the caption draft fallback. */
  language?: string;
  /** Extra grounding text forwarded to the caption draft fallback. */
  brief?: string;
}

export interface BuildDistributionPackResult {
  pack: DistributionPack;
  manifest: UnitManifest;
  /** The on-disk unit dir (the command copies media relative to this). */
  unitDir: string;
  /** True when the caption was drafted here (unit had none); false = reused. */
  draftedCaption: boolean;
}

/** Read + validate `units/<slug>/unit.json`, or null if absent/malformed. */
async function readUnitManifest(unitDir: string): Promise<UnitManifest | null> {
  const fp = path.join(unitDir, "unit.json");
  if (!existsSync(fp)) return null;
  try {
    return UnitManifestSchema.parse(JSON.parse(await fs.readFile(fp, "utf8")));
  } catch {
    return null;
  }
}

/** Build one platform's section from the unit caption, shaped per platform. */
function sectionFor(platform: DistributionPlatform, caption: UnitCaption): PlatformSection {
  const { tiktok, reels, shorts } = caption.platform;
  switch (platform) {
    case "tiktok":
      return { caption: tiktok, hashtags: caption.hashtags };
    case "reels":
      return { caption: reels, hashtags: caption.hashtags };
    case "shorts":
      return { title: shorts, hashtags: caption.hashtags };
    case "meta":
      // Ad primary text = the fuller reels caption; CTA variants are A/B fodder.
      return { primaryText: reels, ctaVariants: [...DEFAULT_META_CTAS] };
    case "app-store":
      // App-store / listing register: the short title + the descriptive body.
      return { title: shorts, caption: reels };
  }
}

/**
 * Pick the thumbnail (unit-relative path): the `--thumbnail` override if it
 * resolves, else the first image in the unit's media, else null. Returns the
 * path + a note explaining the pick (the note feeds the pack's publishNote).
 */
function pickThumbnail(
  unitDir: string,
  media: string[],
  override?: string,
): { thumbnail: string | null; note: string } {
  if (override) {
    if (existsSync(path.join(unitDir, override))) {
      return { thumbnail: override, note: `Thumbnail: ${override} (override).` };
    }
    return { thumbnail: null, note: `Thumbnail override '${override}' not found in the unit.` };
  }
  const firstImage = media.find((m) => IMAGE_EXTS.has(path.extname(m).toLowerCase()));
  if (firstImage) return { thumbnail: firstImage, note: `Thumbnail: ${firstImage} (first image).` };
  return { thumbnail: null, note: "No image in the unit for a thumbnail — provide one with --thumbnail." };
}

/**
 * Build a distribution pack for one unit. Best-effort + read-only: returns the
 * assembled (schema-valid) pack plus the manifest and unit dir the command
 * needs to do the COPY. Throws only when the unit doesn't exist.
 */
export async function buildDistributionPack(
  input: BuildDistributionPackInput,
): Promise<BuildDistributionPackResult> {
  const unitDir = path.join(projectDir(input.projectId), "units", input.slug);
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) {
    throw new Error(`unit '${input.slug}' not found in project '${input.projectId}'`);
  }

  // Caption copy: reuse the unit's existing caption (#403) verbatim; only draft
  // a fresh one when the unit has none. Never duplicate caption/hashtag logic.
  let caption = manifest.caption;
  let draftedCaption = false;
  if (!caption) {
    const nicheHint = [
      manifest.provenance?.style,
      manifest.provenance?.template,
      ...(manifest.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ");
    const ctx: CaptionContext = {
      projectId: input.projectId,
      slug: manifest.slug,
      format: manifest.format,
      language: input.language ?? "English",
      niche: nicheHint || undefined,
      title: manifest.title,
      blurb: manifest.blurb,
      tags: manifest.tags,
      brief: input.brief ?? manifest.blurb,
    };
    caption = await buildUnitCaption({ ctx, draft: input.draftFn });
    draftedCaption = true;
  }

  // Per-platform sections, driven by the unit format.
  const platforms: Partial<Record<DistributionPlatform, PlatformSection>> = {};
  for (const platform of platformsForFormat(manifest.format)) {
    platforms[platform] = sectionFor(platform, caption);
  }

  const { thumbnail, note } = pickThumbnail(unitDir, manifest.media, input.thumbnail);

  // ponytail: #443 (platform-spec validator — safe-area / aspect / filesize)
  // would validate `pack` here before it ships. Out of scope for #423; the seam
  // is this assembled, schema-valid pack — wire the validator in and surface its
  // findings on the pack / handoff.
  const pack = DistributionPackSchema.parse({
    projectId: input.projectId,
    slug: manifest.slug,
    format: manifest.format,
    platforms,
    thumbnail,
    selectedMedia: manifest.media,
    publishNote: note,
  });

  return { pack, manifest, unitDir, draftedCaption };
}
