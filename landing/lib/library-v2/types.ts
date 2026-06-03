// landing/lib/library-v2/types.ts
//
// Library v2 — the Units feed data model (issue: "Library v2 — feed of finished
// UNITS backed by reusable BLOCKS"). Pure types, fs-free, so a client island can
// import them without dragging node:fs into the browser bundle.
//
// The model has five entities (see the design handoff README):
//   Format  — the SHAPE of a deliverable (how many media items + aspect).
//   Unit    — a finished deliverable in a Format, holding 1..N media items.
//   Block   — a reusable building block, one of four kinds:
//     Template — the STRUCTURE / skeleton only, style-agnostic.
//     Style    — the visual look / register.
//     Recipe   — a composable effect / treatment (many per Unit).
//     Asset    — concrete reusable media, by `sub` kind.
//
// A Unit = exactly 1 Template + 1 Style + N Recipes + M Assets, in a Format.
// That ingredient list is the Unit's PROVENANCE (the factual blocks that made
// it). The swap menu offers APPLICABLE blocks (other blocks of the same kind
// that fit a slot; for assets, the same `sub`).
//
// This file matches the `window.RX` shape spec in the prototype's `lib2/data.js`
// exactly — the catalog there is illustrative, the shape is the contract.

/** The eight media formats. Each format dictates the shape of a Unit (item count
 *  + aspect). Mirrors the prototype FORMATS list verbatim. */
export type FormatId =
  | "video"
  | "carousel"
  | "sticker-pack"
  | "podcast-cuts"
  | "fb-creative"
  | "motion-design"
  | "poster"
  | "image";

/** A media format: a SHAPE. `unit` is the per-item noun ("clip", "slides").
 *  `glyph` + `aspect` drive the card iconography and tile aspect-ratio. */
export interface Format {
  id: FormatId;
  label: string;
  glyph: string;
  aspect: string;
  unit: string;
  blurb: string;
}

/** The four block kinds. `template` is the only single-value-per-unit axis
 *  alongside `style`; `recipe` and `asset` are multi-value.
 *
 *  NAMING NOTE (#075): the `"template"` block-KIND here is the per-unit,
 *  style-agnostic STRUCTURE tag in a Unit's provenance — the structure axis of
 *  THIS one Unit's ingredient list. It is DISTINCT from two other "Template"
 *  meanings:
 *    1. the generic repo TEMPLATE ENTITY — the `templates/<category>/<slug>/`
 *       cookbook artifact (prompt-cookbook + `{{slots}}` + common model stack +
 *       composition skeleton) that answers "how do I make THIS KIND of
 *       content?" and scaffolds a project via `ralphy template use`. One generic
 *       Template fans out to N Units; this block-kind labels the structure of
 *       each such Unit and stays consistent with that generic Template's
 *       skeleton; and
 *    2. the per-unit BLUEPRINT (#074, defined below) — the reproduction-grade
 *       recipe that answers "how do I reproduce THIS EXACT one?" (Unit 1→1
 *       Blueprint). The Blueprint LAYERS on top of these four block-kinds; it
 *       does NOT replace them — the block-kinds stay the generic discovery
 *       vocabulary.
 *  Full disambiguation: docs/skills-vs-templates.md → "The reproduction trio". */
export type BlockKind = "template" | "style" | "recipe" | "asset";

/** Asset sub-kinds. A swap fits same-sub only (swap a location for a location). */
export type AssetSub = "character" | "location" | "prop" | "music";

/** A reusable building block. `sub` is present ONLY on assets. `refs` is an
 *  optional list of reference-example media paths surfaced on the block page —
 *  left empty in this migration pass (wiring reference media comes later). */
export interface Block {
  kind: BlockKind;
  id: string;
  name: string;
  blurb: string;
  /** Only on assets. */
  sub?: AssetSub;
  /** Reference-example media for the block page. Empty in this pass. */
  refs?: string[];
}

/** A single resolved, web-servable media item for a Unit. */
export interface UnitMedia {
  /** Public URL the gallery renders (e.g. `/showcase/<slug>/...`). */
  src: string;
  kind: "image" | "video";
  /** CSS aspect-ratio ("W / H"). */
  aspect: string;
  /** Poster frame for a video tile, when one exists. */
  poster?: string;
  /** Supabase Storage public URL (set when published/seeded). The adapter
   *  prefers this over the local `src` when present (mediaUrl). */
  storageUrl?: string;
}

/** A finished deliverable. `templateId` + `styleId` are single; `recipeIds` +
 *  `assetIds` are many. `mediaCount` is derived from the format default when not
 *  explicit. `media` carries the real on-disk paths (the ONLY source of Units in
 *  this migration). `hero` flags the feed's lead unit. */
export interface Unit {
  id: string;
  format: FormatId;
  title: string;
  blurb: string;
  date?: string;
  templateId: string;
  styleId: string;
  recipeIds: string[];
  assetIds: string[];
  /** Item count: actual file count for packs/carousels/cuts/sets when known,
   *  else the format default (DEFAULT_N). */
  mediaCount: number;
  /** Real on-disk media paths. */
  media?: UnitMedia[];
  hero?: boolean;
}

/** The four block arrays, deduped, keyed by kind. */
export interface BlocksByKind {
  template: Block[];
  style: Block[];
  recipe: Block[];
  asset: Block[];
}

// ── Relation function signatures (the relations the UI needs) ────────────────

/** Units whose provenance includes the given block (and the synthetic
 *  `"format"` kind for the format cards). */
export type UnitsUsingFn = (
  kind: BlockKind | "format",
  id: string,
) => Unit[];

/** Other blocks of the same kind that fit a slot on a unit (the swap menu).
 *  For assets, fit = same `sub`. `currentId` is excluded from the result. */
export type ApplicableFn = (
  kind: BlockKind,
  unit: Unit | undefined,
  currentId?: string,
  sub?: AssetSub,
) => Block[];

/** Unit-count per block of a kind, keyed by block id — for menu badges. */
export type CountsFn = (kind: BlockKind) => Record<string, number>;

/** Unit-count per format, for the format cards. */
export type FmtCounts = Record<FormatId, number>;

// ── Blueprint — the per-unit, reproduction-grade recipe (#074) ───────────────
//
// SETTLED DECISIONS (do not redesign — recorded here as the canonical contract):
//
//   - LAYERS, does NOT replace, the four block kinds. Blocks (Template / Style /
//     Recipe / Asset) stay the generic discovery vocabulary (107 already live).
//     A Blueprint REFERENCES the unit's blocks (via the unit's provenance) and
//     ADDS the full reproduction payload on top — the verbatim prompts, the
//     scene table, the composition skeleton, the hard asset files, the model
//     stack with params + cost, and the concrete ffmpeg/encode/overlay recipes.
//     Layering is the least-disruptive choice; blocks remain untouched.
//
//   - Cardinality: Template 1→N Units; Unit 1→1 Blueprint. A Blueprint belongs
//     to exactly one Unit and carries `unitId` (= `Unit.id`). The generic side
//     (Template generalizing across many Units) is expanded in #075.
//
// The payload covers six axes: (1) scenario / scene table, (2) per-stage prompts
// verbatim, (3) composition, (4) hard assets by ref, (5) model stack + params +
// cost, (6) concrete recipes / effects. `scenario` and `composition` are nullable
// for scenario-less still projects / non-HyperFrames outputs (#062).
//
// Pure types, fs-free, JSON-serializable (no functions / symbols) so the same
// shape seeds a `blueprints` DB table later. The DB table + publish path are #077
// — NOT implemented here.

/** Pipeline stages a prompt or model-stack entry can target. Shared `as const`
 *  so the CLI Zod schema can mirror it member-for-member. */
export type BlueprintStage =
  | "image"
  | "i2v"
  | "video"
  | "vo"
  | "music"
  | "captions"
  | "sfx";

/** Hard-asset kinds a Blueprint pins by file ref (not just name). */
export type BlueprintAssetKind =
  | "character"
  | "location"
  | "prop"
  | "music"
  | "ref"
  | "master";

/** Recipe kinds — the concrete treatment classes a Blueprint records with
 *  values (a raw ffmpeg command, an encode setting, an overlay, a bake). */
export type BlueprintRecipeKind = "ffmpeg" | "encode" | "overlay" | "bake";

/** Axis 1 — one row of the scenario / scene table. A `fork` marks a branching
 *  beat (choose-path); all fields beyond `id` are optional per scene. */
export interface BlueprintScene {
  id: string;
  label?: string;
  durationSec?: number;
  /** Verbatim VO line for the scene. */
  vo?: string;
  /** SFX flags / cues for the scene. */
  sfx?: string[];
  /** Branch beat: a fork label + its option labels. */
  fork?: { label: string; options?: string[] };
  notes?: string;
}

/** Axis 1 — scenario / scene table. `null` for scenario-less still projects. */
export interface BlueprintScenario {
  scenes: BlueprintScene[];
  /** Raw STORYBOARD.md text when present. */
  storyboardMd?: string;
}

/** Axis 2 — one per-stage prompt, VERBATIM, with `{{slots}}` noted. */
export interface BlueprintPrompt {
  stage: BlueprintStage;
  /** Asset slot the prompt targets (e.g. "scene-04-image-fork"). */
  slot?: string;
  /** Model id the prompt was sent to (read MODELS.md before naming one). */
  model?: string;
  /** The prompt text, exactly as sent. */
  text: string;
  /** Slot tokens present in `text` (e.g. ["product", "city"]). */
  slots?: string[];
}

/** Axis 3 — composition. `null` for non-HyperFrames outputs (e.g. stills). */
export interface BlueprintComposition {
  /** Unit-relative path to the copied index.html. */
  file?: string;
  /** Parsed scene-start offsets (`A[]`) / segment durations (`SEG[]`). */
  timing?: { A?: number[]; SEG?: number[] };
  /** HyperFrames components / registry blocks / overlay functions referenced. */
  components?: string[];
  /** Publish-time (#077): public Storage URL for the composition's index.html
   *  so `blueprint use` (#079) can pull it on a fresh machine. */
  storageUrl?: string;
  /** Publish-time (#077): the composition's index.html inlined into the mirror
   *  when small enough to commit, so `blueprint use` (#079) needs no network. */
  html?: string;
}

/** Axis 4 — one hard asset, pinned by file ref (the actual file, not a name). */
export interface BlueprintAsset {
  /** Asset slot id when known. */
  slot?: string;
  /** Unit-relative (or project-relative) path to the file. */
  path: string;
  kind: BlueprintAssetKind;
  bytes?: number;
  /** Supabase Storage public URL (set when published/seeded). */
  storageUrl?: string;
}

/** Axis 5 — one model-stack entry: the model + params + cost for a stage. */
export interface BlueprintModelStackEntry {
  stage: string;
  model: string;
  params?: Record<string, unknown>;
  /** ElevenLabs / TTS voice id when the stage is voice. */
  voiceId?: string;
  costUsd?: number;
}

/** Axis 6 — one concrete recipe / effect with VALUES (command + params). */
export interface BlueprintRecipe {
  name: string;
  kind: BlueprintRecipeKind;
  /** The raw command (ffmpeg / encode), verbatim, with values. */
  command?: string;
  params?: Record<string, unknown>;
}

/**
 * Blueprint — a self-contained, reproduction-grade recipe for ONE Unit (#074).
 * Carries everything a human or an agent needs to reproduce the unit end-to-end
 * from an empty project, leaving zero open questions. 1:1 with a Unit via
 * `unitId`. Layers on top of the unit's blocks (it references them via the
 * unit's provenance and adds the full payload — it does not replace them).
 */
export interface Blueprint {
  /** 1:1 with `Unit.id`. */
  unitId: string;
  /** Forward-compat schema version (starts at 1). */
  schemaVersion: number;
  /** Axis 1 — scene table; `null` for scenario-less still projects. */
  scenario: BlueprintScenario | null;
  /** Axis 2 — per-stage verbatim prompts. */
  prompts: BlueprintPrompt[];
  /** Axis 3 — composition; `null` for non-HyperFrames outputs. */
  composition: BlueprintComposition | null;
  /** Axis 4 — hard assets, by file ref. */
  assets: BlueprintAsset[];
  /** Axis 5 — model stack + params + cost per stage. */
  modelStack: BlueprintModelStackEntry[];
  /** Axis 6 — concrete recipes / effects with values. */
  recipes: BlueprintRecipe[];
  /** Total cost to reproduce, summed across stages. */
  costRollupUsd?: number;
  /** ISO timestamp the blueprint was formed. */
  createdAt?: string;
  notes?: string;
  /** Payload files that exceeded the publish size cap (#077) and were NOT uploaded
   *  to Storage — kept on disk, the local `path` preserved. Blueprint-relative
   *  paths (e.g. "assets/showcase.mp4"). Absent when nothing was skipped. */
  oversizeSkipped?: string[];
}
