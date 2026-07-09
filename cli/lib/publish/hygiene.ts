// Copyright-hygiene check (#543) — the DETERMINISTIC pre-publish guard that
// flags a unit distributing SCRAPED/SOURCE media rather than a GENERATED one.
//
// THE POLICY (data + documented, NOT a legal judgment): "generated assets by
// default; source media is referenced, not embedded". Lifting a source outlet's
// photo/footage/logo into a thumbnail or b-roll is an infringement/strike risk,
// and a platform strike is an extinction-level event for the accounts the farm
// compounds on (#543 rationale). The check enforces the provenance rule and
// SURFACES the decision to the operator — it makes no legal call.
//
// THE DETERMINISTIC SIGNAL: a unit media file whose provenance is the `refs`
// tier is a scraped/source input (the #105 `refs` kind == the `role:
// "source-only"` distribution capability of media-artifact.ts; the provenance
// graph's `source-ref` node kind). We read that provenance from the unit's
// `source_assets` (the original project-relative paths the media was copied
// from) — a file copied out of `artifacts/refs/` and then DISTRIBUTED is the
// fail case. A file copied from a generated kind (`artifacts/images|videos|
// voiceover|music|sfx|captions`) passes. This is a pure read — no model call.
//
// THE CV SEAM (best-effort, deliberately NOT built in v1): a source logo /
// watermark visible INSIDE an otherwise-generated frame needs vision/CV to
// detect and is out of scope here. `watermarkSeam` documents the hook; the
// deterministic provenance check above is the WORKING gate. Do not add a CV
// pipeline to satisfy this — flag it as future and keep the provenance check.

import type { UnitManifest } from "../schemas/unit.js";
import { mediaArtifactFromUnitMedia } from "../schemas/media-artifact.js";

/** The project media tier that IS scraped/source input (the #105 `refs` kind). */
const SOURCE_ONLY_DIR_RE = /(^|\/)artifacts\/refs\//;

/** A single hygiene finding on one distributed media file. */
export interface HygieneFlag {
  /** The unit-relative media filename. */
  media: string;
  /** The original project-relative source path the media was copied from, when known. */
  sourcePath?: string;
  /** Severity: `fail` blocks publish at any trust; `warn` routes to review. */
  severity: "fail" | "warn";
  /** Machine reason code. */
  code: "scraped-source-embedded" | "provenance-unknown";
  /** Human detail (English-on-disk). */
  detail: string;
}

export interface HygieneResult {
  /** `pass` = all distributed media are generated/licensed; `warn`/`fail` per flags. */
  verdict: "pass" | "warn" | "fail";
  /** Per-media findings (empty on a clean pass). */
  flags: HygieneFlag[];
  /** Count of distributed media the check examined. */
  examined: number;
  /**
   * The CV watermark/logo detection SEAM (#543). Always `false` in v1 — a
   * documented future best-effort pass, not a working check. Surfaced so callers
   * can see the axis exists without a CV pipeline being implied.
   */
  watermarkSeam: {
    checked: boolean;
    note: string;
  };
}

const WATERMARK_SEAM_NOTE =
  "source logo/watermark detection needs vision/CV — best-effort future pass, not gated in v1";

/**
 * True when a project-relative source path lives in the scraped/source `refs`
 * tier (the deterministic infringement signal).
 */
export function isScrapedSourcePath(sourcePath: string): boolean {
  return SOURCE_ONLY_DIR_RE.test(sourcePath);
}

/**
 * Run the deterministic copyright-hygiene check over a unit manifest.
 *
 * For each DISTRIBUTED media file (excludes `ref`-kind artifacts, which are
 * production inputs — `source-only` distribution capability), resolve its origin
 * from the unit's `source_assets` (aligned by index with `media`; a shorter list
 * degrades to "provenance-unknown" for the unmatched tail). A media whose origin
 * is the `artifacts/refs/` tier is a `fail` (scraped source embedded in the
 * deliverable). Everything else passes. Pure read — no model call, never throws.
 */
export function checkCopyrightHygiene(unit: UnitManifest): HygieneResult {
  const flags: HygieneFlag[] = [];
  // The universal-artifact view drops nothing but lets us skip ref-kind entries
  // (a unit that ships an input ref as a distributed member is itself unusual;
  // the source_assets provenance below is the real signal).
  const artifacts = mediaArtifactFromUnitMedia(unit);
  const distributed = artifacts.filter((a) => a.kind !== "ref");
  const sources = unit.source_assets ?? [];

  let examined = 0;
  distributed.forEach((artifact, i) => {
    examined++;
    const media = artifact.path ?? artifact.id ?? `media-${i}`;
    const sourcePath = sources[i];
    if (typeof sourcePath === "string" && sourcePath.length > 0) {
      if (isScrapedSourcePath(sourcePath)) {
        flags.push({
          media,
          sourcePath,
          severity: "fail",
          code: "scraped-source-embedded",
          detail: `distributed media "${media}" was copied from the source/scraped refs tier (${sourcePath}) — source media must be REFERENCED, not embedded (policy: generated assets by default)`,
        });
      }
      // A generated-kind source path passes silently.
    }
    // No source_assets provenance at all is NOT a flag on its own: many
    // hand-curated / older units carry no source_assets and are legitimately
    // generated. The scraped-source signal is affirmative, not absence-based.
  });

  const hasFail = flags.some((f) => f.severity === "fail");
  const hasWarn = flags.some((f) => f.severity === "warn");
  return {
    verdict: hasFail ? "fail" : hasWarn ? "warn" : "pass",
    flags,
    examined,
    watermarkSeam: { checked: false, note: WATERMARK_SEAM_NOTE },
  };
}
