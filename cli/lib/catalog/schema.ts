// Motion catalog schemas (#563). Two manifests:
//
// 1. The ITEM manifest (`catalog/manifest.json`, repo-tracked): one entry per
//    reusable transition / motion element. Each entry points at a HyperFrames
//    fragment under `catalog/items/<kind>/<id>.html` and declares its typed
//    params (they become `data-composition-variables` on the preview build).
// 2. The SFX manifest (`.ralphy/catalog/sfx/manifest.json`, local data root,
//    gitignored): the harvested, deduped, tagged, loudness-normalized SFX pack.
//    The binaries stay out of git; item entries reference SFX by stable id.
//
// Kinds `layout` (#564) and `caption` (#565) are reserved so those issues add
// items to the same manifest without a schema change.

import { z } from "zod";

export const CATALOG_KINDS = ["transition", "element", "layout", "caption"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export const CATALOG_ENERGIES = ["calm", "medium", "high"] as const;
export type CatalogEnergy = (typeof CATALOG_ENERGIES)[number];

export const CATALOG_MOODS = [
  "energetic",
  "playful",
  "editorial",
  "dramatic",
  "tech",
  "edgy",
  "warm",
  "premium",
  "clean",
  "retro",
] as const;
export type CatalogMood = (typeof CATALOG_MOODS)[number];

export const SFX_TAGS = [
  "whoosh",
  "swoosh",
  "hit",
  "impact",
  "riser",
  "pop",
  "glitch",
  "click",
  "ambience",
  "foley",
  "vocal",
  "misc",
] as const;
export type SfxTag = (typeof SFX_TAGS)[number];

const ID_RE = /^[a-z][a-z0-9-]*$/;

/** One typed parameter. Mirrors the HyperFrames `data-composition-variables` entry shape. */
export const CatalogParamSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/, "param ids are camelCase identifiers"),
    type: z.enum(["string", "number", "color", "boolean", "enum"]),
    label: z.string().min(1),
    default: z.union([z.string(), z.number(), z.boolean()]),
    min: z.number().optional(),
    max: z.number().optional(),
    options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  })
  .superRefine((p, ctx) => {
    const t = typeof p.default;
    const want = p.type === "number" ? "number" : p.type === "boolean" ? "boolean" : "string";
    if (t !== want) {
      ctx.addIssue({ code: "custom", message: `param ${p.id}: default must be a ${want}` });
    }
    if (p.type === "enum" && (!p.options || !p.options.some((o) => o.value === p.default))) {
      ctx.addIssue({ code: "custom", message: `param ${p.id}: enum default must be one of options` });
    }
    if (p.type === "color" && typeof p.default === "string" && !/^#[0-9a-fA-F]{6}$/.test(p.default)) {
      ctx.addIssue({ code: "custom", message: `param ${p.id}: color default must be #rrggbb` });
    }
  });
export type CatalogParam = z.infer<typeof CatalogParamSchema>;

/** Where the SFX lands relative to the item's own start (seconds), and at what gain. */
export const CatalogSfxCueSchema = z.object({
  id: z.string().regex(/^sfx-[a-z]+-[0-9a-f]{8}$/, "sfx ids look like sfx-<tag>-<8 hex>"),
  at: z.number().min(-1).max(10),
  volume: z.number().min(0).max(1),
  /** Optional playback cap (s) for a long source; maps to data-duration on the <audio>. */
  trim: z.number().positive().max(10).optional(),
});
export type CatalogSfxCue = z.infer<typeof CatalogSfxCueSchema>;

export const CatalogItemSchema = z.object({
  id: z.string().regex(ID_RE),
  kind: z.enum(CATALOG_KINDS),
  name: z.string().min(1),
  summary: z.string().min(1),
  /** Fragment path relative to `catalog/`. */
  source: z.string().regex(/^items\/(transition|element|layout|caption)\/[a-z][a-z0-9-]*\.html$/),
  /** JS function the fragment defines: `function <fn>(tl, o)`. */
  fn: z.string().regex(/^catalog_[a-z0-9_]+$/),
  /** Seconds the effect occupies (transition: swap window; element: entrance to settle). */
  duration: z.number().positive().max(10),
  /** Transitions only: offset (s) inside the window where the outgoing scene is swapped out. */
  cutAt: z.number().min(0).max(10).optional(),
  energy: z.enum(CATALOG_ENERGIES),
  moods: z.array(z.enum(CATALOG_MOODS)).min(1),
  tags: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]*$/)).default([]),
  aspect: z.literal("9:16"),
  params: z.array(CatalogParamSchema),
  whenToUse: z.string().min(1),
  whenNotToUse: z.string().min(1),
  sfx: CatalogSfxCueSchema.nullable(),
  /** Preview path relative to the catalog data root (`.ralphy/catalog/`). */
  preview: z.string().regex(/^previews\/[a-z][a-z0-9-]*\.mp4$/),
  /** #558 ledger link; null until performance data exists. */
  ledger: z.string().nullable().default(null),
});
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const CatalogManifestSchema = z
  .object({
    version: z.literal(1),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    items: z.array(CatalogItemSchema),
  })
  .superRefine((m, ctx) => {
    const seen = new Set<string>();
    for (const item of m.items) {
      if (seen.has(item.id)) ctx.addIssue({ code: "custom", message: `duplicate item id: ${item.id}` });
      seen.add(item.id);
      if (!item.source.startsWith(`items/${item.kind}/`)) {
        ctx.addIssue({ code: "custom", message: `${item.id}: source must live under items/${item.kind}/` });
      }
      if (item.preview !== `previews/${item.id}.mp4`) {
        ctx.addIssue({ code: "custom", message: `${item.id}: preview must be previews/${item.id}.mp4` });
      }
      if (item.kind === "transition" && item.cutAt === undefined) {
        ctx.addIssue({ code: "custom", message: `${item.id}: transitions declare cutAt` });
      }
      if (item.cutAt !== undefined && item.cutAt > item.duration) {
        ctx.addIssue({ code: "custom", message: `${item.id}: cutAt exceeds duration` });
      }
      const ids = new Set<string>();
      for (const p of item.params) {
        if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: `${item.id}: duplicate param ${p.id}` });
        ids.add(p.id);
      }
    }
  });
export type CatalogManifest = z.infer<typeof CatalogManifestSchema>;

export const SfxEntrySchema = z.object({
  id: z.string().regex(/^sfx-[a-z]+-[0-9a-f]{8}$/),
  tag: z.enum(SFX_TAGS),
  /** Normalized copy, relative to `.ralphy/catalog/sfx/`. */
  file: z.string(),
  /** sha256 of the original source bytes (content-hash dedupe key). */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Coarse RMS-envelope fingerprint (audio dedupe key), hex. */
  fingerprint: z.string(),
  durationSec: z.number().nonnegative(),
  source: z.object({
    workspace: z.string(),
    project: z.string(),
    file: z.string(),
  }),
  /** Other source copies collapsed into this entry (exact or fingerprint match). */
  duplicates: z.array(z.object({ workspace: z.string(), project: z.string(), file: z.string(), match: z.enum(["sha256", "fingerprint"]) })),
  loudness: z.object({
    target: z.number(),
    truePeak: z.number(),
    before: z.object({ meanDb: z.number().nullable(), peakDb: z.number().nullable(), lufs: z.number().nullable() }),
    after: z.object({ meanDb: z.number().nullable(), peakDb: z.number().nullable(), lufs: z.number().nullable() }),
  }),
});
export type SfxEntry = z.infer<typeof SfxEntrySchema>;

export const SfxManifestSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  stats: z.object({
    scanned: z.number().int().nonnegative(),
    skippedRaw: z.number().int().nonnegative(),
    unique: z.number().int().nonnegative(),
    sha256Duplicates: z.number().int().nonnegative(),
    fingerprintDuplicates: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    byTag: z.record(z.string(), z.number().int().nonnegative()),
  }),
  entries: z.array(SfxEntrySchema),
});
export type SfxManifest = z.infer<typeof SfxManifestSchema>;
