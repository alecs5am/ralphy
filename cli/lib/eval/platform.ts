// Platform spec validator (#443).
//
// A good render that fails an upload spec (wrong aspect, over-duration,
// unsupported codec, over the file-size cap, text under the platform UI chrome)
// is not production-ready. This gate checks the final media against the
// DECLARED target platforms (TikTok / Reels / Shorts / Meta ad / App Store
// screenshot / Amazon listing image / generic web) and reports CONCRETE fixes —
// "H.264 required; got vp9 — re-encode", not "codec may be unsupported".
//
// It is the direct sibling of the OCR (#439) / hook (#440) / caption-sync (#441)
// / claims (#442) gates: same shape, same `Finding`/`Verdict` machinery, same
// append-only report. Unlike them it is MOSTLY DETERMINISTIC — probe the media
// metadata and compare to a spec table. No vision / LLM pass. The only injectable
// seam is the media PROBE (so fixtures don't spawn ffprobe). Safe-area is a
// declared geometric check (does a declared text/safe inset fit the platform's
// reserved UI band), not a vision read.
//
// It does NOT fork a parallel pipeline:
//   • the `Finding` shape + `score()`/`Verdict` from findings.ts,
//   • `probeVideo` from probe.ts + the `image-size` header read (the SAME reader
//     `cli/commands/unit.ts` already uses) for the default probe,
//   • findings emit under the EXISTING `format.` prefix — already keyed by the
//     scorecard `platformFit` dimension (#427) and owned by the editor in the
//     repair plan (#409 EDITOR_PREFIXES), so they fold in with zero new wiring.
//
// The #423 distribution pack carries the platform NAME taxonomy (publish-copy
// sections, no media specs). This module owns the SPEC table — it is the first
// place per-platform aspect/resolution/duration/codec/filesize/safe-area live.

import path from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { imageSize } from "image-size";
import { projectDir, artifactKindDir } from "../paths.js";
import { score } from "./findings.js";
import { probeVideo } from "./probe.js";
import type { Finding, Verdict } from "./types.js";

/** Project-relative location the platform-spec report is persisted to. */
export const PLATFORM_SPEC_ARTIFACT = "platform-spec.json" as const;

const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

// ─── Platform spec table ───────────────────────────────────────────────────────
//
// One profile per supported target. Each carries the publishable constraints the
// issue enumerates. `null` on any field = "no constraint on this axis". Aspect is
// a list of allowed W:H ratios (matched within a small tolerance so 1080x1922
// still reads as 9:16). Codecs are container-video / audio codec allow-lists
// (empty = not applicable, e.g. a still image has no codec).

/** Which media kind a platform expects (drives video-only vs image-only checks). */
export type PlatformMediaKind = "video" | "image";

export interface PlatformProfile {
  /** Human label for the report / fix text. */
  label: string;
  /** The media kind this platform publishes. */
  kind: PlatformMediaKind;
  /** Allowed aspect ratios as [w, h] pairs (matched within `ASPECT_TOL`). */
  aspects: Array<[number, number]>;
  /** Minimum [w, h] in px (null = no floor). */
  minResolution: [number, number] | null;
  /** Maximum [w, h] in px (null = no ceiling). */
  maxResolution: [number, number] | null;
  /** Duration window in seconds for video platforms (null = n/a). */
  durationSec: { min: number | null; max: number | null } | null;
  /** Max file size in MB (null = no cap). */
  maxFileSizeMb: number | null;
  /** Allowed video codecs (lower-case ffprobe names). Empty = n/a (image). */
  videoCodecs: string[];
  /** Allowed audio codecs. Empty = n/a / no-audio-required. */
  audioCodecs: string[];
  /**
   * Reserved UI safe-area inset as a fraction of the frame, per edge. A declared
   * text/safe inset SMALLER than this sits under the platform chrome. null = no
   * documented chrome (web / listing images).
   */
  safeAreaInset: { top: number; bottom: number; left: number; right: number } | null;
  /** Metadata keys the platform requires on the distribution pack (caption/title…). */
  requiredMetadata: string[];
}

/** Relative tolerance for aspect-ratio matching (1080x1922 still reads as 9:16). */
const ASPECT_TOL = 0.03;

export const PLATFORM_PROFILES: Record<string, PlatformProfile> = {
  tiktok: {
    label: "TikTok",
    kind: "video",
    aspects: [[9, 16]],
    minResolution: [720, 1280],
    maxResolution: [1080, 1920],
    durationSec: { min: 3, max: 600 },
    maxFileSizeMb: 287,
    videoCodecs: ["h264"],
    audioCodecs: ["aac"],
    // Right action rail + bottom caption bar are the heavy chrome zones.
    safeAreaInset: { top: 0.06, bottom: 0.16, left: 0.05, right: 0.12 },
    requiredMetadata: ["caption"],
  },
  reels: {
    label: "Instagram Reels",
    kind: "video",
    aspects: [[9, 16]],
    minResolution: [720, 1280],
    maxResolution: [1080, 1920],
    durationSec: { min: 3, max: 90 },
    maxFileSizeMb: 250,
    videoCodecs: ["h264", "hevc"],
    audioCodecs: ["aac"],
    safeAreaInset: { top: 0.08, bottom: 0.2, left: 0.05, right: 0.08 },
    requiredMetadata: ["caption"],
  },
  shorts: {
    label: "YouTube Shorts",
    kind: "video",
    aspects: [[9, 16]],
    minResolution: [720, 1280],
    maxResolution: [1080, 1920],
    durationSec: { min: 1, max: 180 },
    maxFileSizeMb: 256,
    videoCodecs: ["h264", "hevc", "vp9"],
    audioCodecs: ["aac", "opus"],
    safeAreaInset: { top: 0.06, bottom: 0.12, left: 0.05, right: 0.05 },
    requiredMetadata: ["title"],
  },
  "meta-ad": {
    label: "Meta (Facebook/Instagram) ad",
    kind: "image",
    aspects: [[1, 1], [4, 5], [9, 16]],
    minResolution: [600, 600],
    maxResolution: null,
    durationSec: null,
    maxFileSizeMb: 30,
    videoCodecs: [],
    audioCodecs: [],
    safeAreaInset: null,
    requiredMetadata: ["primaryText"],
  },
  "app-store-screenshot": {
    label: "App Store screenshot",
    kind: "image",
    // 6.7" iPhone portrait/landscape, the App Store's required sizes.
    aspects: [[1290, 2796], [2796, 1290]],
    minResolution: [1242, 2208],
    maxResolution: [2796, 2796],
    durationSec: null,
    maxFileSizeMb: 8,
    videoCodecs: [],
    audioCodecs: [],
    safeAreaInset: null,
    requiredMetadata: ["title"],
  },
  "amazon-listing-image": {
    label: "Amazon listing image",
    kind: "image",
    aspects: [[1, 1]],
    // Amazon requires the longest side ≥ 1000px to enable zoom.
    minResolution: [1000, 1000],
    maxResolution: [10000, 10000],
    durationSec: null,
    maxFileSizeMb: 10,
    videoCodecs: [],
    audioCodecs: [],
    safeAreaInset: null,
    requiredMetadata: [],
  },
  web: {
    label: "Generic web",
    kind: "image",
    aspects: [[16, 9], [1, 1], [4, 5], [9, 16], [3, 2]],
    minResolution: null,
    maxResolution: null,
    durationSec: null,
    maxFileSizeMb: 5,
    videoCodecs: ["h264", "vp9", "av1"],
    audioCodecs: ["aac", "opus"],
    safeAreaInset: null,
    requiredMetadata: [],
  },
};

export const PLATFORM_KEYS = Object.keys(PLATFORM_PROFILES);

/** True when `value` names a known platform profile. */
export function isPlatformKey(value: unknown): value is string {
  return typeof value === "string" && value in PLATFORM_PROFILES;
}

// ─── Probe seam (injectable, default = ffprobe + image-size) ───────────────────

/** Normalised media facts a probe returns (the only thing the validator needs). */
export interface MediaFacts {
  kind: PlatformMediaKind;
  width: number;
  height: number;
  /** Seconds (videos only; null for images). */
  durationSec: number | null;
  /** File size in bytes. */
  fileSizeBytes: number;
  /** Lower-case ffprobe codec names (videos only). */
  videoCodec: string | null;
  audioCodec: string | null;
}

/**
 * The injectable probe: read one media file's facts. Default reads videos via
 * `probeVideo` (ffprobe) and images via the `image-size` header read — the SAME
 * reader the unit catalog uses. Tests pass a fake so fixtures never spawn
 * ffprobe / touch a real file.
 */
export type MediaProbe = (absPath: string) => MediaFacts;

const defaultProbe: MediaProbe = (absPath) => {
  const ext = path.extname(absPath).toLowerCase();
  const fileSizeBytes = statSync(absPath).size;
  if (VIDEO_EXT.has(ext)) {
    const v = probeVideo(absPath);
    return {
      kind: "video",
      width: v.resolution.w,
      height: v.resolution.h,
      durationSec: v.durationSec,
      fileSizeBytes,
      videoCodec: v.codec.video.toLowerCase(),
      audioCodec: v.codec.audio === "?" ? null : v.codec.audio.toLowerCase(),
    };
  }
  const { width, height } = imageSize(readFileSync(absPath));
  return {
    kind: "image",
    width: width ?? 0,
    height: height ?? 0,
    durationSec: null,
    fileSizeBytes,
    videoCodec: null,
    audioCodec: null,
  };
};

// ─── Report shape ──────────────────────────────────────────────────────────────

/** One declared safe-area inset (fraction per edge) the user asserts their copy fits inside. */
export interface DeclaredSafeArea {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface PlatformCheckResult {
  /** Project-relative path of the media checked. */
  media: string;
  /** The platform this result is for. */
  platform: string;
  /** Findings this media+platform pair contributed (already Finding-shaped). */
  findings: Finding[];
}

export interface PlatformSpecReport {
  schemaVersion: "1.0";
  projectId: string;
  /** The platforms validated against. */
  platforms: string[];
  /** False when there is no media to check → pass-through. */
  applicable: boolean;
  /** pass | warn | fail (from the eval `score()` over the collected findings). */
  verdict: Verdict;
  /** The single hard blocker the readiness path (#427) + unit formation consult. */
  blocksShip: boolean;
  /** One-line reason for the verdict / blocksShip decision. */
  reason: string;
  /** Per-media-per-platform results. */
  results: PlatformCheckResult[];
  /** All findings, flattened (the fixer/readiness path consumes these). */
  findings: Finding[];
}

// ─── Aspect helper ──────────────────────────────────────────────────────────────

/** True when w:h matches one of `aspects` within `ASPECT_TOL`. */
function matchesAnyAspect(w: number, h: number, aspects: Array<[number, number]>): boolean {
  if (w <= 0 || h <= 0) return false;
  const ratio = w / h;
  return aspects.some(([aw, ah]) => {
    const target = aw / ah;
    return Math.abs(ratio - target) / target <= ASPECT_TOL;
  });
}

/** Render an aspect list as "9:16" / "1:1 or 4:5 or 9:16" for fix text. */
function aspectLabel(aspects: Array<[number, number]>): string {
  return aspects.map(([w, h]) => `${w}:${h}`).join(" or ");
}

// ─── Media discovery ────────────────────────────────────────────────────────────

/**
 * Find the media to validate. Explicit `media` wins. Otherwise: the render
 * (render/final.mp4) plus every still under artifacts/images and video under
 * artifacts/videos. Returns project-relative paths. Never throws.
 */
function discoverMedia(projectId: string): string[] {
  const root = projectDir(projectId);
  const out: string[] = [];
  const final = path.join(root, "render", "final.mp4");
  if (existsSync(final)) out.push(path.relative(root, final));
  for (const kind of ["videos", "images"] as const) {
    try {
      const dir = artifactKindDir(projectId, kind);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).sort()) {
        const abs = path.join(dir, f);
        const ext = path.extname(f).toLowerCase();
        try {
          if (statSync(abs).isFile() && (VIDEO_EXT.has(ext) || IMAGE_EXT.has(ext))) {
            out.push(path.relative(root, abs));
          }
        } catch {
          // ignore unreadable entry
        }
      }
    } catch {
      // ignore missing kind dir
    }
  }
  return out;
}

// ─── The gate ──────────────────────────────────────────────────────────────────

/**
 * Validate a project's final media against the declared target platforms. Pure
 * read — never mutates. `probe` is INJECTABLE (default = ffprobe + image-size)
 * so fixtures run with NO ffprobe. A hard spec violation (wrong aspect,
 * over-duration, unsupported codec, over-filesize, resolution out of range) is a
 * `fail` (blocks ship). A declared safe-area that doesn't clear the chrome, or a
 * missing required-metadata key, is a `warn`.
 */
export function validatePlatformSpec(input: {
  projectId: string;
  platforms: string[];
  /** Explicit project-relative media to check (default: auto-discover). */
  media?: string[];
  /** A declared safe/text inset the user asserts their copy fits within. */
  declaredSafeArea?: DeclaredSafeArea;
  /** Distribution-pack metadata present per platform (drives required-metadata warns). */
  presentMetadata?: Record<string, string[]>;
  probe?: MediaProbe;
}): PlatformSpecReport {
  const { projectId } = input;
  const probe = input.probe ?? defaultProbe;
  const root = projectDir(projectId);

  // — Resolve + validate the platform list. Unknown names are dropped with a warn.
  const findings: Finding[] = [];
  let nextId = 1;
  const add = (x: Omit<Finding, "id">): Finding => {
    const f: Finding = { id: `PLT${nextId++}`, ...x };
    findings.push(f);
    return f;
  };

  const platforms: string[] = [];
  for (const p of input.platforms) {
    if (isPlatformKey(p)) platforms.push(p);
    else
      add({
        category: "format.unknown-platform",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Unknown target platform "${p}" — no spec to validate against.`,
        fixHint: `Use one of: ${PLATFORM_KEYS.join(", ")}.`,
        fixCommand: null,
      });
  }

  const media = input.media ?? discoverMedia(projectId);
  const results: PlatformCheckResult[] = [];

  if (platforms.length === 0 || media.length === 0) {
    const { verdict } = score(findings);
    return {
      schemaVersion: "1.0",
      projectId,
      platforms,
      applicable: false,
      verdict,
      blocksShip: false,
      reason:
        platforms.length === 0
          ? "no valid target platform supplied — platform-spec gate not applicable (pass --platform <list>)."
          : "no final media found (render/final.mp4 / artifacts/{images,videos}) — platform-spec gate not applicable (render or generate media first).",
      results,
      findings,
    };
  }

  for (const rel of media) {
    const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
    let facts: MediaFacts;
    try {
      facts = probe(abs);
    } catch (e) {
      add({
        category: "format.probe-failed",
        severity: "warn",
        sceneIndex: null,
        timestampSec: null,
        message: `Could not probe ${rel}: ${(e as Error).message}`,
        fixHint: "Ensure ffprobe is installed (brew install ffmpeg) and the file is a valid media file.",
        fixCommand: null,
      });
      continue;
    }

    for (const platform of platforms) {
      const before = findings.length;
      checkMediaAgainstProfile(rel, facts, platform, PLATFORM_PROFILES[platform]!, input, add);
      results.push({ media: rel, platform, findings: findings.slice(before) });
    }
  }

  const { verdict } = score(findings);
  const blocksShip = verdict === "fail";
  const failCount = findings.filter((f) => f.severity === "fail").length;

  return {
    schemaVersion: "1.0",
    projectId,
    platforms,
    applicable: true,
    verdict,
    blocksShip,
    reason: blocksShip
      ? `${failCount} platform spec violation(s) — wrong aspect / resolution / duration / codec / file-size. Blocks ship-ready until the media is conformed to the target platform.`
      : verdict === "warn"
        ? "platform spec warnings present (safe-area / metadata / resolution recommendation). Review before publishing; not a hard block."
        : `media conforms to the target platform spec(s): ${platforms.join(", ")}.`,
    results,
    findings,
  };
}

/**
 * Run every deterministic spec check for one media file against one platform.
 * Emits CONCRETE fixes. Mutates `findings` through the passed `add`.
 */
function checkMediaAgainstProfile(
  rel: string,
  facts: MediaFacts,
  platform: string,
  profile: PlatformProfile,
  input: { declaredSafeArea?: DeclaredSafeArea; presentMetadata?: Record<string, string[]> },
  add: (x: Omit<Finding, "id">) => Finding,
): void {
  const where = `${rel} for ${profile.label}`;
  const base = { sceneIndex: null, timestampSec: null } as const;

  // — Media-kind mismatch (video on an image platform or vice-versa) is a fail.
  if (facts.kind !== profile.kind) {
    add({
      ...base,
      category: "format.media-kind",
      severity: "fail",
      message: `${where}: this platform expects ${profile.kind}, but ${rel} is ${facts.kind}.`,
      fixHint: `Supply a ${profile.kind} for ${profile.label} (or drop ${platform} from the target list for this asset).`,
      fixCommand: null,
    });
    return; // the remaining checks assume the right kind
  }

  // — Aspect ratio.
  if (!matchesAnyAspect(facts.width, facts.height, profile.aspects)) {
    const want = profile.aspects[0]!;
    const targetW = profile.maxResolution?.[0] ?? facts.width;
    const targetH = Math.round((targetW * want[1]) / want[0]);
    add({
      ...base,
      category: "format.aspect-ratio",
      severity: "fail",
      message: `${where}: aspect ${facts.width}x${facts.height} is not ${aspectLabel(profile.aspects)}.`,
      fixHint: `Crop/scale to ${aspectLabel(profile.aspects)} (e.g. ${targetW}x${targetH}). For video: ffmpeg crop+scale; for stills: re-generate or re-crop to the target ratio.`,
      fixCommand: null,
    });
  }

  // — Resolution floor / ceiling.
  if (profile.minResolution) {
    const [minW, minH] = profile.minResolution;
    if (facts.width < minW || facts.height < minH) {
      add({
        ...base,
        category: "format.resolution",
        severity: "fail",
        message: `${where}: ${facts.width}x${facts.height} is below the ${minW}x${minH} minimum.`,
        fixHint: `Re-render / re-generate at ≥ ${minW}x${minH} (upscaling a smaller source loses detail — prefer regenerating at full size).`,
        fixCommand: null,
      });
    }
  }
  if (profile.maxResolution) {
    const [maxW, maxH] = profile.maxResolution;
    if (facts.width > maxW || facts.height > maxH) {
      add({
        ...base,
        category: "format.resolution",
        severity: "fail",
        message: `${where}: ${facts.width}x${facts.height} exceeds the ${maxW}x${maxH} maximum.`,
        fixHint: `Scale down to ≤ ${maxW}x${maxH} (ffmpeg/imagemagick scale, preserving aspect).`,
        fixCommand: null,
      });
    }
  }

  // — Duration window (video platforms only).
  if (profile.kind === "video" && profile.durationSec && facts.durationSec !== null) {
    const { min, max } = profile.durationSec;
    if (max !== null && facts.durationSec > max) {
      add({
        ...base,
        category: "format.duration",
        severity: "fail",
        message: `${where}: ${facts.durationSec.toFixed(1)}s exceeds the ${max}s maximum.`,
        fixHint: `Trim to ≤ ${max}s (re-cut the timeline / drop a beat).`,
        fixCommand: null,
      });
    } else if (min !== null && facts.durationSec < min) {
      add({
        ...base,
        category: "format.duration",
        severity: "fail",
        message: `${where}: ${facts.durationSec.toFixed(1)}s is under the ${min}s minimum.`,
        fixHint: `Extend to ≥ ${min}s (hold a beat / add an outro) or this platform rejects the upload.`,
        fixCommand: null,
      });
    }
  }

  // — File size cap.
  if (profile.maxFileSizeMb !== null) {
    const sizeMb = facts.fileSizeBytes / (1024 * 1024);
    if (sizeMb > profile.maxFileSizeMb) {
      add({
        ...base,
        category: "format.file-size",
        severity: "fail",
        message: `${where}: ${sizeMb.toFixed(1)}MB exceeds the ${profile.maxFileSizeMb}MB cap.`,
        fixHint:
          profile.kind === "video"
            ? `Re-encode at a lower bitrate to land under ${profile.maxFileSizeMb}MB (e.g. ffmpeg -crf 24, or two-pass to a target size).`
            : `Compress / re-export the image under ${profile.maxFileSizeMb}MB (drop to JPEG/WebP or lower quality).`,
        fixCommand: null,
      });
    }
  }

  // — Codecs (video platforms only).
  if (profile.kind === "video") {
    if (profile.videoCodecs.length && facts.videoCodec && !profile.videoCodecs.includes(facts.videoCodec)) {
      add({
        ...base,
        category: "format.codec",
        severity: "fail",
        message: `${where}: video codec ${facts.videoCodec} is unsupported (allowed: ${profile.videoCodecs.join(", ")}).`,
        fixHint: `${profile.videoCodecs[0]!.toUpperCase()} required; got ${facts.videoCodec} — re-encode (ffmpeg -c:v libx264 for H.264).`,
        fixCommand: null,
      });
    }
    if (profile.audioCodecs.length && facts.audioCodec && !profile.audioCodecs.includes(facts.audioCodec)) {
      add({
        ...base,
        category: "format.codec",
        severity: "fail",
        message: `${where}: audio codec ${facts.audioCodec} is unsupported (allowed: ${profile.audioCodecs.join(", ")}).`,
        fixHint: `Re-encode the audio to ${profile.audioCodecs[0]} (ffmpeg -c:a aac).`,
        fixCommand: null,
      });
    }
  }

  // — Safe-area: a declared text/safe inset that does NOT clear the platform's
  //   reserved UI chrome (text would sit under the app UI). Warn — it is a
  //   placement recommendation, not an upload rejection.
  if (profile.safeAreaInset && input.declaredSafeArea) {
    const d = input.declaredSafeArea;
    const tight: string[] = [];
    for (const edge of ["top", "bottom", "left", "right"] as const) {
      const need = profile.safeAreaInset[edge];
      const have = d[edge];
      if (typeof have === "number" && have < need) {
        tight.push(`${edge} ${(have * 100).toFixed(0)}% < ${(need * 100).toFixed(0)}%`);
      }
    }
    if (tight.length) {
      add({
        ...base,
        category: "format.safe-area",
        severity: "warn",
        message: `${where}: declared safe inset is tighter than the platform UI chrome (${tight.join(", ")}) — text may sit under the app UI.`,
        fixHint: `Pull copy inside the ${profile.label} safe band (top ≥ ${(profile.safeAreaInset.top * 100).toFixed(0)}%, bottom ≥ ${(profile.safeAreaInset.bottom * 100).toFixed(0)}%, sides ≥ left ${(profile.safeAreaInset.left * 100).toFixed(0)}% / right ${(profile.safeAreaInset.right * 100).toFixed(0)}%).`,
        fixCommand: null,
      });
    }
  }

  // — Required metadata: warn when the distribution pack lacks a key the platform needs.
  if (profile.requiredMetadata.length) {
    const present = new Set(input.presentMetadata?.[platform] ?? []);
    const missing = profile.requiredMetadata.filter((k) => !present.has(k));
    if (missing.length && input.presentMetadata !== undefined) {
      add({
        ...base,
        category: "format.metadata",
        severity: "warn",
        message: `${where}: missing required metadata ${missing.join(", ")} in the distribution pack.`,
        fixHint: `Add ${missing.join(", ")} for ${platform} (package the unit: \`ralphy unit package <project> <slug>\`).`,
        fixCommand: null,
      });
    }
  }
}
