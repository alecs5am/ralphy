// Universal media-artifact model Zod schema (#461).
//
// A `MediaArtifact` is the storage-agnostic, format-agnostic descriptor for ONE
// produced media output — a still, a video cut, an audio-only clip, a caption
// track, a slide deck, an interactive HTML scene, a data file, an input ref, or
// a packaged bundle — plus a `custom` extension escape for kinds the taxonomy
// has not grown yet. Today every project mode (#454 open-world content) invents
// its own folder conventions + metadata; this schema gives projects, Units (#069),
// provenance (#420), eval (gate registry), and distribution (#458) a SINGLE stable
// shape to describe arbitrary outputs without hardcoding `mp4` / `png`.
//
// It is the local half of the §4 "Artifact" shape named in the cloud-factory
// design seam (#462): `{ uri | path, kind, mime, slot, role, provenance, ... }`,
// storage-agnostic by design (a `uri` OR a project-relative `path`, never a
// local path baked into the contract).
//
// THIS SCHEMA DOES NOT REPLACE `unit.ts`. A Unit (`cli/lib/schemas/unit.ts`)
// stays the curated, ordered deliverable manifest; a MediaArtifact is the richer
// per-output descriptor. The `mediaArtifactFromUnitMedia()` adapter maps the
// EXISTING `unit.json` `media[]` + `media_meta{}` entries INTO `MediaArtifact[]`
// without rewriting any storage (the #461 migration-plan item — show current
// manifests map in, do not migrate them). Append-only history (AGENTS.md #14) is
// preserved because the adapter is read-only over the manifest.
//
// Schema style mirrors `cli/lib/schemas/{workflow,image-pack,unit}.ts`: a Zod
// object with inline-doc comments, exported `z.infer` types, sane `.default()`s,
// a `parseMediaArtifact()`. The kind→capability maps are authored as plain const
// DATA (the eval-mapping + distribution-mapping seams, #461 acceptance 4+5) — not
// full integrations: a gate registry / distribution pack reads the flags, this
// file does not call them. English-only-on-disk.

import { z } from "zod";
import type { UnitManifest } from "./unit.js";

// ─── Artifact-kind taxonomy ──────────────────────────────────────────────────

/**
 * The universal artifact kinds (#461 acceptance 1). Append, never repurpose —
 * downstream eval/distribution maps key off these strings.
 *
 *   • image            — a single still (png/jpg/webp/svg).
 *   • video            — a moving-image cut (mp4/webm/mov).
 *   • audio            — audio-only output: voiceover, music, sfx, a podcast cut.
 *   • captions         — a timed text track (srt/vtt/ass) — standalone, also
 *                        attachable to a video via `textTracks`.
 *   • document         — a paged/flow document (pdf/md/html-doc).
 *   • slide-deck       — an ordered slide set (a carousel, a pitch deck).
 *   • html-interactive — an interactive HTML/WebGL/3D scene (a HyperFrames
 *                        composition source, a game-like preview).
 *   • data             — a structured data file (json/csv/jsonl) shipped as output.
 *   • ref              — an INPUT reference the output was produced against
 *                        (mirrors the `refs` artifact kind / `artifacts/refs/`).
 *   • package          — a packaged bundle of other artifacts (a distribution
 *                        pack, a zip, a multi-file deliverable).
 *   • custom           — an extension escape for a not-yet-taxonomized kind; the
 *                        concrete label lives in `customKind`.
 */
export const MEDIA_ARTIFACT_KINDS = [
  "image",
  "video",
  "audio",
  "captions",
  "document",
  "slide-deck",
  "html-interactive",
  "data",
  "ref",
  "package",
  "custom",
] as const;
export type MediaArtifactKind = (typeof MEDIA_ARTIFACT_KINDS)[number];

/** True when `value` is a legal artifact kind. */
export function isMediaArtifactKind(value: unknown): value is MediaArtifactKind {
  return typeof value === "string" && (MEDIA_ARTIFACT_KINDS as readonly string[]).includes(value);
}

// ─── Sub-shapes ──────────────────────────────────────────────────────────────

/**
 * A timed text track carried by (or alongside) an artifact — captions/subtitles
 * for a video, a transcript for audio. `path`/`uri` point at the track file;
 * `format` is the on-disk encoding; `language` is a BCP-47-ish tag.
 */
export const TextTrackSchema = z.object({
  kind: z.enum(["captions", "subtitles", "transcript"]).default("captions"),
  /** Track file location (one of the two, like the parent — see refine below). */
  path: z.string().optional(),
  uri: z.string().optional(),
  format: z.enum(["srt", "vtt", "ass", "json"]).default("srt"),
  /** Language tag (e.g. "en", "en-US"). Optional — single-language default. */
  language: z.string().optional(),
});
export type TextTrack = z.infer<typeof TextTrackSchema>;

/**
 * Provenance links (#420) — how the artifact was produced + what it descends
 * from. All optional/additive: a hand-supplied artifact carries none.
 *   • `sourceArtifacts` — ids/slots of artifacts this one was derived from (the
 *     refs an i2v clip anchored on, the stills a deck baked from).
 *   • `template`/`style`/`recipes`/`assets` — the library-v2 block ids, mirroring
 *     `UnitProvenance` so a Unit's provenance round-trips through an artifact.
 *   • `provenanceGraph` — pointer to the sibling rich reproduction chain (the
 *     `unit.ts` `provenance_graph` field).
 */
export const ArtifactProvenanceSchema = z
  .object({
    sourceArtifacts: z.array(z.string()).optional(),
    template: z.string().optional(),
    style: z.string().optional(),
    recipes: z.array(z.string()).optional(),
    assets: z.array(z.string()).optional(),
    provenanceGraph: z.string().optional(),
  })
  .partial();
export type ArtifactProvenance = z.infer<typeof ArtifactProvenanceSchema>;

// ─── The artifact ────────────────────────────────────────────────────────────

/**
 * One media artifact (#461 acceptance 2 — the metadata contract). Exactly ONE of
 * `uri` / `path` must be present (`uri` is storage-agnostic — an object-store key
 * or remote URL; `path` is project-relative — the local-first form). Every other
 * metadata field is optional + additive so a partially-known artifact still
 * parses and older manifests never break.
 */
export const MediaArtifactSchema = z
  .object({
    /** Schema version — bump when a field becomes required. */
    version: z.literal(1).default(1),
    /** The kind from the fixed taxonomy. */
    kind: z.enum(MEDIA_ARTIFACT_KINDS),
    /** When `kind === "custom"`, the concrete extension label (kebab-case). */
    customKind: z.string().optional(),

    // ── location (exactly one) ──
    /** Storage-agnostic location (object-store key / remote URL). */
    uri: z.string().optional(),
    /** Project-relative location (the local-first form). */
    path: z.string().optional(),

    // ── intrinsic metadata ──
    /** MIME type (e.g. "video/mp4", "image/png", "audio/mpeg"). */
    mime: z.string().optional(),
    /** Duration in milliseconds (video/audio/captions/slide-deck-with-timing). */
    durationMs: z.number().nonnegative().optional(),
    /** Pixel width (image/video/slide). */
    width: z.number().int().positive().optional(),
    /** Pixel height (image/video/slide). */
    height: z.number().int().positive().optional(),
    /** Aspect alias ("9:16", "1:1") — kept for parity with `UnitMediaMeta.aspect`. */
    aspect: z.string().optional(),
    /** Byte size on disk / in storage. */
    bytes: z.number().int().nonnegative().optional(),
    /** Timed text tracks carried by the artifact (captions/subtitles/transcript). */
    textTracks: z.array(TextTrackSchema).default([]),

    // ── production role ──
    /** What this artifact is FOR within the deliverable (hero / b-roll / vo / cta). */
    role: z.string().optional(),
    /** Canonical slot id it fills (kebab-case; the manifest/batch key, e.g. "scene-04-vo"). */
    slot: z.string().optional(),
    /** Stable artifact id (defaults to `slot` when omitted by the caller). */
    id: z.string().optional(),

    // ── generation attribution ──
    /** Model id that produced it (e.g. "google/gemini-3-pro-image-preview"). */
    model: z.string().optional(),
    /** Provider/connector that ran the call (e.g. "openrouter", "elevenlabs", "fal"). */
    provider: z.string().optional(),
    /** Generation cost in USD (mirrors a gen-log cost row). */
    costUsd: z.number().nonnegative().optional(),

    // ── provenance ──
    /** Provenance links (#420). */
    provenance: ArtifactProvenanceSchema.optional(),
  })
  .refine((a) => Boolean(a.uri) || Boolean(a.path), {
    message: "a media artifact must carry a uri or a path",
  })
  .refine((a) => a.kind !== "custom" || Boolean(a.customKind), {
    message: 'kind "custom" requires a customKind label',
  });
export type MediaArtifact = z.infer<typeof MediaArtifactSchema>;

/**
 * An ordered, heterogeneous set of artifacts — the multi-kind generalization of
 * a deliverable's media list (#461 acceptance 3). `order` is the canonical
 * presentation order (mirrors a Unit's ordered `media[]`); when omitted, the
 * `artifacts[]` array order is canonical.
 */
export const MediaArtifactSetSchema = z.object({
  version: z.literal(1).default(1),
  /** The artifacts, in a stable list. */
  artifacts: z.array(MediaArtifactSchema).default([]),
  /** Optional explicit presentation order, by artifact `id`/`slot`. */
  order: z.array(z.string()).optional(),
});
export type MediaArtifactSet = z.infer<typeof MediaArtifactSetSchema>;

/**
 * Parse + validate an unknown value into a MediaArtifact. Throws a ZodError on a
 * malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch and
 * pass `error.message` as `detail`.
 */
export function parseMediaArtifact(input: unknown): MediaArtifact {
  return MediaArtifactSchema.parse(input);
}

/** Parse + validate an unknown value into a MediaArtifactSet. */
export function parseMediaArtifactSet(input: unknown): MediaArtifactSet {
  return MediaArtifactSetSchema.parse(input);
}

// ─── Capability maps (eval + distribution seams, as DATA) ────────────────────

/**
 * Eval-capability flags (#461 acceptance 4). A gate registry maps an artifact
 * kind to the quality checks that even APPLY to it — there is no point running a
 * "scroll-stop / retention" video check on a standalone data file. These are the
 * applicable AXES, not gate implementations; the registry reads the flags and
 * picks its scorers. Append flags as new check families land.
 */
export type EvalCapability =
  | "visual" // still/frame quality (composition, anatomy, AI-slop)
  | "motion" // temporal quality (pacing, static-hold, transitions)
  | "audio" // audio quality (clarity, mix, loudness)
  | "text" // baked/track text legibility + correctness
  | "timing" // VO↔caption↔cut sync
  | "structure"; // document/deck/data structural validity

export const EVAL_CAPABILITIES: Record<MediaArtifactKind, readonly EvalCapability[]> = {
  image: ["visual", "text"],
  video: ["visual", "motion", "audio", "text", "timing"],
  audio: ["audio", "timing"],
  captions: ["text", "timing"],
  document: ["text", "structure"],
  "slide-deck": ["visual", "text", "structure"],
  "html-interactive": ["visual", "motion", "structure"],
  data: ["structure"],
  ref: [], // an input ref is not itself eval-gated
  package: ["structure"], // a pack is checked for completeness, not pixels
  custom: [], // a custom kind opts into checks explicitly
};

/**
 * Distribution-capability flags (#461 acceptance 5). A distribution pack (#458)
 * maps an artifact kind to HOW it can be packaged + where it can go. Again DATA,
 * not an integration — the packer reads these to decide what belongs in a pack
 * and what platform manifest entry to emit.
 */
export type DistributionCapability =
  | "feed-post" // postable as a standalone feed item (image/video/deck)
  | "story" // story/short placement
  | "attachment" // ships as an attachment alongside a primary (captions, data)
  | "download" // a downloadable file (document, package)
  | "embed" // embeddable interactive (html-interactive)
  | "source-only"; // production input, never distributed (ref)

export const DISTRIBUTION_CAPABILITIES: Record<MediaArtifactKind, readonly DistributionCapability[]> = {
  image: ["feed-post", "story", "download"],
  video: ["feed-post", "story", "download"],
  audio: ["feed-post", "download"],
  captions: ["attachment"],
  document: ["download"],
  "slide-deck": ["feed-post", "download"],
  "html-interactive": ["embed", "download"],
  data: ["attachment", "download"],
  ref: ["source-only"],
  package: ["download"],
  custom: [],
};

// ─── Unit adapter (the migration seam, #461 acceptance 6) ────────────────────

/**
 * Map the `UnitMediaMeta.kind` ("image" | "video") onto the universal taxonomy.
 * A trivial pass-through today; the indirection is the extension point for when
 * `unit.ts` grows audio/deck/etc. media kinds.
 */
function unitMediaKindToArtifactKind(kind: "image" | "video"): MediaArtifactKind {
  return kind; // both members exist verbatim in MEDIA_ARTIFACT_KINDS
}

/**
 * Adapter (#461 acceptance 6 — the migration plan, non-breaking): map an EXISTING
 * `unit.json` manifest's ordered `media[]` (+ optional `media_meta{}` +
 * `provenance{}`) into a `MediaArtifact[]`, READ-ONLY. It does NOT touch storage,
 * does NOT rewrite the manifest, and preserves the manifest's media ORDER — so
 * append-only history (AGENTS.md #14) is untouched and old units keep working.
 *
 * Each Unit media filename becomes an artifact with:
 *   • `path`  = the unit-relative filename (verbatim — the file is not moved),
 *   • `id`/`slot` = the filename (the manifest's stable key),
 *   • `kind`  = from `media_meta[filename].kind` when present, else inferred from
 *               the extension, else "image" (the historical Unit default),
 *   • `aspect`= from `media_meta[filename].aspect` when present,
 *   • `provenance` = the Unit's block-level provenance (template/style/recipes/
 *               assets) lifted onto every artifact + the `provenance_graph` pointer.
 *
 * This is the "current manifests map in" demonstration: feed any real `unit.json`
 * and you get a valid `MediaArtifact[]` without a storage migration.
 */
export function mediaArtifactFromUnitMedia(unit: UnitManifest): MediaArtifact[] {
  const sharedProvenance: ArtifactProvenance | undefined = unit.provenance
    ? {
        template: unit.provenance.template,
        style: unit.provenance.style,
        recipes: unit.provenance.recipes,
        assets: unit.provenance.assets,
        provenanceGraph: unit.provenance_graph,
      }
    : unit.provenance_graph
      ? { provenanceGraph: unit.provenance_graph }
      : undefined;

  return unit.media.map((filename) => {
    const meta = unit.media_meta?.[filename];
    const kind = meta ? unitMediaKindToArtifactKind(meta.kind) : inferKindFromFilename(filename);
    return MediaArtifactSchema.parse({
      kind,
      path: filename,
      id: filename,
      slot: filename,
      aspect: meta?.aspect,
      provenance: sharedProvenance,
    });
  });
}

/** Extension → artifact kind fallback for legacy units with no `media_meta`. */
function inferKindFromFilename(filename: string): MediaArtifactKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext)) return "audio";
  if (["srt", "vtt", "ass"].includes(ext)) return "captions";
  if (["pdf"].includes(ext)) return "document";
  if (["json", "csv", "jsonl"].includes(ext)) return "data";
  if (["html", "htm"].includes(ext)) return "html-interactive";
  // The historical Unit default: an unknown media file is a still.
  return "image";
}
