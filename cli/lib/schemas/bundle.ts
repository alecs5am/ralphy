// Workspace-bundle manifest schema (#502) — the deployable template zip.
//
// A bundle is a trained workspace's production know-how packaged as one zip
// (docs/workspace-bundle.md; design: docs/architecture/farm-node-graph.md
// "Template bundle (the zip)"). This module owns the SHAPE of `manifest.yaml`
// only — collection, readiness gates, and zip I/O live in cli/lib/bundle.ts.
//
// The manifest is serialized as YAML in the zip (the design tree names it
// manifest.yaml; the `yaml` package is already a dependency per D-03). The
// graph spec itself stays JSON (`pipeline.json`, D-03).

import { z } from "zod";
import type { Capability } from "../providers/types.js";
import { NOTIFY_EVENTS, NOTIFY_CHANNELS } from "./notifications.js";

/** Trust-ladder default the importing farm starts the workspace at. */
export const TRUST_LEVELS = ["L0", "L1", "L2"] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

/**
 * Semver-ish: MAJOR.MINOR[.PATCH][-prerelease]. Looser than strict semver on
 * purpose — a bundle author bumping "1.1" by hand should not be rejected.
 */
const SEMVERISH_RE = /^\d+\.\d+(\.\d+)?(-[A-Za-z0-9.-]+)?$/;
export const SemverIshSchema = z
  .string()
  .regex(SEMVERISH_RE, { message: "must be a semver-ish version (e.g. 1.0.0)" });

/**
 * The capability axis, mirrored from cli/lib/providers/types.ts. The
 * `satisfies` clause keeps every listed value a real Capability at compile
 * time (a renamed capability breaks the build here, not at import time).
 */
export const CAPABILITY_VALUES = [
  "text",
  "image",
  "video",
  "voice",
  "music",
  "sfx",
  "transcribe",
] as const satisfies readonly Capability[];

/**
 * One required (model, capability, provider) triple — the #497 coverage-matrix
 * key the bundle's graph nodes bind to. Import checks each against
 * `coverageFor()` and NAMES the gaps before materializing anything.
 */
export const CoverageTripleSchema = z.object({
  model: z.string().min(1),
  capability: z.enum(CAPABILITY_VALUES),
  provider: z.string().min(1),
});
export type CoverageTriple = z.infer<typeof CoverageTripleSchema>;

export const BundleManifestSchema = z.object({
  /** Bundle name — also the default workspace slug at import (override with --as). */
  name: z.string().min(1),
  /** Bundle version (semver-ish), bumped by the author on re-export. */
  version: SemverIshSchema,
  /** Minimum ralphy version that can import this bundle (compared to VERSION). */
  ralphyVersionFloor: SemverIshSchema,
  /** Connector env-var NAMES the graph needs configured (e.g. OPENROUTER_API_KEY). */
  requiredConnectorKeys: z.array(z.string().min(1)).default([]),
  /** (model, capability, provider) triples the graph's media nodes bind to. */
  requiredCoverage: z.array(CoverageTripleSchema).default([]),
  /** #520: the union of the graph's `http` nodes' allowed_hosts — the
   *  bundle's declared outbound-host surface (import consent surface). */
  httpAllowedHosts: z.array(z.string().min(1)).default([]),
  /** Trust-ladder starting level for the imported workspace. */
  trustDefault: z.enum(TRUST_LEVELS).default("L0"),
  /**
   * #518: the bundled notifications DEFAULT — the event → channel mapping and
   * digest time a bundle author ships, landed as the imported workspace's
   * `notifications` block. QUIET (secrets — chat id / webhook URL / bot token —
   * are NEVER bundled): the operator fills `channels` post-import to switch it
   * on. Only the mapping + digest time ride the bundle.
   */
  notificationsDefault: z
    .object({
      events: z.record(z.enum(NOTIFY_EVENTS), z.array(z.enum(NOTIFY_CHANNELS))).default({}),
      digestTime: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional(),
    })
    .optional(),
});
export type BundleManifest = z.infer<typeof BundleManifestSchema>;

/** Parse + validate an unknown value into a BundleManifest (throws ZodError). */
export function parseBundleManifest(raw: unknown): BundleManifest {
  return BundleManifestSchema.parse(raw);
}

/**
 * Compare two semver-ish versions numerically per dot segment (missing
 * segments count as 0; a prerelease suffix is ignored — floors are authored
 * against releases). Returns <0, 0, >0 like a comparator.
 */
export function compareSemverIsh(a: string, b: string): number {
  const nums = (v: string) =>
    v
      .split("-")[0]!
      .split(".")
      .map((s) => parseInt(s, 10) || 0);
  const [x, y] = [nums(a), nums(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
