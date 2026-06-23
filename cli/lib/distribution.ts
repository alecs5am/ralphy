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
  profileKeyFor,
  type DistributionPack,
  type DistributionPlatform,
  type DistributionReadiness,
  type PlatformSection,
  type PlatformSpecStatus,
} from "./schemas/distribution-pack.js";
import {
  PLATFORM_PROFILES,
  validatePlatformSpec,
  type MediaProbe,
  type PlatformSpecReport,
} from "./eval/platform.js";
import { buildScorecard } from "./scorecard.js";

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
  /**
   * #458 #2: injectable media probe forwarded to the #443 platform validator
   * (default = ffprobe + image-size). Fixtures pass a fake so no ffprobe runs.
   */
  probe?: MediaProbe;
  /**
   * #458 #5: an explicit user reason to bypass a non-`ship` readiness verdict.
   * When set, the pack is marked shippable despite a `repair`/`needs-user-
   * decision`/`blocked` verdict, and the reason is recorded on the pack.
   */
  bypassReadiness?: string;
}

export interface BuildDistributionPackResult {
  pack: DistributionPack;
  manifest: UnitManifest;
  /** The on-disk unit dir (the command copies media relative to this). */
  unitDir: string;
  /** True when the caption was drafted here (unit had none); false = reused. */
  draftedCaption: boolean;
  /** #458 #2: the full #443 platform-spec report the per-section status was derived from. */
  specReport: PlatformSpecReport;
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
  const targets = platformsForFormat(manifest.format);
  const platforms: Partial<Record<DistributionPlatform, PlatformSection>> = {};
  for (const platform of targets) {
    platforms[platform] = sectionFor(platform, caption);
  }

  const { thumbnail, note } = pickThumbnail(unitDir, manifest.media, input.thumbnail);

  // #458 #2 — channel profiles. Validate the unit's media against the #443
  // platform-spec table, ONE platform at a time and only against the media whose
  // KIND the platform posts (a still cover in a video bundle is not a Shorts
  // upload, so it must not fail the video spec). Pure read; the probe is
  // injectable so fixtures never spawn ffprobe.
  const specReport = validatePerPlatform(input.projectId, unitDir, targets, manifest.media, input.probe);

  // Fold the per-platform spec verdict + export requirements onto each section.
  for (const platform of targets) {
    const profileKey = profileKeyFor(platform);
    const status = specStatusForPlatform(specReport, profileKey);
    const notes = specNotesForPlatform(specReport, profileKey);
    platforms[platform] = {
      ...platforms[platform]!,
      specStatus: status,
      ...(notes.length && { specNotes: notes }),
      outputFilenames: mediaForProfile(manifest.media, profileKey),
      exportRequirements: exportRequirementsFor(profileKey),
    };
  }

  // #458 #5 — readiness dependency. The #427 scorecard is a pure best-effort
  // file read (zero model calls). A non-`ship` verdict leaves the pack
  // not-shippable unless the user explicitly bypasses it.
  const readiness = readReadiness(input.projectId, input.bypassReadiness);

  const pack = DistributionPackSchema.parse({
    projectId: input.projectId,
    slug: manifest.slug,
    format: manifest.format,
    platforms,
    thumbnail,
    selectedMedia: manifest.media,
    publishNote: note,
    readiness,
    shippable: readiness.verdict === "ship" || readiness.bypassed,
    archive: null, // the command fills this after it writes the zip.
  });

  return { pack, manifest, unitDir, draftedCaption, specReport };
}

/** Project-relative media basenames whose kind matches the platform profile's kind. */
function mediaForProfile(media: string[], profileKey: string): string[] {
  const kind = PLATFORM_PROFILES[profileKey]?.kind;
  if (!kind) return media;
  const isImage = (m: string) => IMAGE_EXTS.has(path.extname(m).toLowerCase());
  return media.filter((m) => (kind === "image" ? isImage(m) : !isImage(m)));
}

/**
 * Validate each target platform against ONLY its kind-matching media, and merge
 * the per-platform reports into one. A platform with no media of its kind yields
 * an `na` section (no posted asset to check). Mirrors `validatePlatformSpec`'s
 * own report shape so the scorecard/handoff consume it unchanged.
 */
function validatePerPlatform(
  projectId: string,
  unitDir: string,
  targets: DistributionPlatform[],
  media: string[],
  probe?: MediaProbe,
): PlatformSpecReport {
  const merged: PlatformSpecReport = {
    schemaVersion: "1.0",
    projectId,
    platforms: [],
    applicable: false,
    verdict: "pass",
    blocksShip: false,
    reason: "",
    results: [],
    findings: [],
  };
  let worst: PlatformSpecStatus = "pass";
  for (const platform of targets) {
    const profileKey = profileKeyFor(platform);
    merged.platforms.push(profileKey);
    const kindMedia = mediaForProfile(media, profileKey);
    if (kindMedia.length === 0) continue; // na — no posted asset of this kind
    const r = validatePlatformSpec({
      projectId,
      platforms: [profileKey],
      media: kindMedia.map((m) => path.join(unitDir, m)),
      probe,
    });
    if (!r.applicable) continue;
    merged.applicable = true;
    merged.results.push(...r.results);
    merged.findings.push(...r.findings);
    if (r.verdict === "fail") worst = "fail";
    else if (r.verdict === "warn" && worst !== "fail") worst = "warn";
  }
  merged.verdict = worst === "fail" ? "fail" : worst === "warn" ? "warn" : "pass";
  merged.blocksShip = merged.verdict === "fail";
  merged.reason = !merged.applicable
    ? "no posted media of any target-platform kind — platform-spec gate not applicable."
    : merged.verdict === "fail"
      ? "one or more channels failed the upload spec (aspect / resolution / duration / codec / file-size)."
      : merged.verdict === "warn"
        ? "platform spec warnings (safe-area / resolution recommendation) — review before publishing."
        : `media conforms to the target channel spec(s): ${merged.platforms.join(", ")}.`;
  return merged;
}

/** The worst per-platform spec status from the #443 report (pass<warn<fail; na = no media). */
function specStatusForPlatform(report: PlatformSpecReport, profileKey: string): PlatformSpecStatus {
  if (!report.applicable) return "na";
  const findings = report.results
    .filter((r) => r.platform === profileKey)
    .flatMap((r) => r.findings);
  if (findings.some((f) => f.severity === "fail")) return "fail";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return report.results.some((r) => r.platform === profileKey) ? "pass" : "na";
}

/** Concrete spec fix hints for one platform, from the #443 report. */
function specNotesForPlatform(report: PlatformSpecReport, profileKey: string): string[] {
  return report.results
    .filter((r) => r.platform === profileKey)
    .flatMap((r) => r.findings)
    .map((f) => `${f.message} (${f.fixHint})`);
}

/** Readable hard export requirements for a channel, from the #443 profile table. */
function exportRequirementsFor(profileKey: string): string[] {
  const p = PLATFORM_PROFILES[profileKey];
  if (!p) return [];
  const reqs: string[] = [];
  reqs.push(`aspect ${p.aspects.map(([w, h]) => `${w}:${h}`).join(" or ")}`);
  if (p.minResolution) reqs.push(`min ${p.minResolution[0]}x${p.minResolution[1]}`);
  if (p.durationSec && (p.durationSec.min !== null || p.durationSec.max !== null)) {
    reqs.push(`duration ${p.durationSec.min ?? 0}-${p.durationSec.max ?? "∞"}s`);
  }
  if (p.videoCodecs.length) reqs.push(`codec ${p.videoCodecs.join("/")}`);
  if (p.maxFileSizeMb !== null) reqs.push(`max ${p.maxFileSizeMb}MB`);
  return reqs;
}

/**
 * Read the #427 readiness scorecard (pure file read, zero model calls) into the
 * pack's readiness block. A scorecard read failure degrades to a
 * `needs-user-decision` verdict — never throws. A `bypass` reason marks the pack
 * shippable despite a non-`ship` verdict.
 */
function readReadiness(projectId: string, bypass?: string): DistributionReadiness {
  let verdict = "needs-user-decision";
  let reason = "Could not read the readiness scorecard.";
  let polished: boolean | null = null;
  try {
    const card = buildScorecard({ projectId });
    verdict = card.verdict;
    reason = card.reason;
    polished = card.polished;
  } catch {
    /* best-effort — a scorecard read failure leaves the default non-ship verdict */
  }
  const bypassed = verdict !== "ship" && typeof bypass === "string" && bypass.length > 0;
  return {
    verdict,
    reason,
    polished,
    bypassed,
    bypassReason: bypassed ? bypass! : null,
  };
}
