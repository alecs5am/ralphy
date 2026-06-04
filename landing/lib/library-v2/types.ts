// landing/lib/library-v2/types.ts
//
// Library v2 — the Units feed data model (issue: "Library v2 — feed of finished
// UNITS backed by reusable BLOCKS"). Pure types, fs-free, so a client island can
// import them without dragging node:fs into the browser bundle.
//
// The model has four block-bearing entities + tags (see the design handoff
// README):
//   Format  — the SHAPE of a deliverable (how many media items + aspect).
//   Unit    — a finished deliverable in a Format, holding 1..N media items.
//   Block   — a reusable building block, one of three kinds:
//     Template — the STRUCTURE / skeleton only, look-agnostic.
//     Recipe   — a composable effect / treatment (many per Unit).
//     Asset    — concrete reusable media, by `sub` kind.
//   Tag     — a unit-level textual descriptor (incl. the LOOK / register). A
//             filter-only label, NOT a block, with no detail page (the "style as
//             a tag" decision — the look's reproduction payload lives in the
//             repo `vibe-style` templates + `guidelines/`, its anchor images are
//             Assets, and the label itself is just a discovery descriptor).
//
// A Unit = exactly 1 Template + N Recipes + M Assets, in a Format, plus N Tags
// (its look among them). The blocks are the Unit's PROVENANCE (the factual
// blocks that made it). The swap menu offers APPLICABLE blocks (other blocks of
// the same kind that fit a slot; for assets, the same `sub`).
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

/** The three block kinds. `template` is the only single-value-per-unit axis;
 *  `recipe` and `asset` are multi-value. (The former `style` kind was demoted to
 *  a unit-level Tag — the look is now a `tags[]` descriptor, not a block.)
 *
 *  NAMING NOTE (#075): the `"template"` block-KIND here is the per-unit,
 *  look-agnostic STRUCTURE tag in a Unit's provenance — the structure axis of
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
export type BlockKind = "template" | "recipe" | "asset";

/** Asset sub-kinds. A swap fits same-sub only (swap a location for a location). */
export type AssetSub = "character" | "location" | "prop" | "music";

// ── Tag vs Recipe split (#082) ───────────────────────────────────────────────
//
// SETTLED DESIGN (user decision 2026-06-04 — do not redesign):
//
//   - **Tag** = a textual descriptor for finding SIMILAR videos, INCLUDING the
//     unit's LOOK / register (the former `style` block was demoted to a tag).
//     Filter-only — a chip in the feed, never a block, NO detail page. Modeled as
//     `tags: string[]` on a `Unit` (a unit-level label). The loader derives a
//     `TAGS` facet from the distinct unit tags for filtering; tags carry no
//     extractable artifact (the look's reproduction know-how lives in the repo
//     `vibe-style` templates + `guidelines/`; its anchor images are Assets).
//
//   - **Recipe** = an EXTRACTABLE / APPLICABLE artifact (an ffmpeg filtergraph, a
//     HyperFrames snippet, a prompt template). It STAYS a Block (`kind:"recipe"`),
//     now ENRICHED with described content + a copyable artifact + a live/visual
//     demo (the `recipeKind` / `body` / `artifact` / `params` / `demo` fields
//     below). A recipe is the thing you reproduce; a tag is the thing you filter by.
//
// All the recipe fields and `Unit.tags` are OPTIONAL/ADDITIVE — existing blocks
// and units (with none of them) still load and validate unchanged.

/** The concrete treatment class of an enriched recipe block (#082). Mirrors the
 *  `BlueprintRecipeKind` set and adds `hyperframes` (a live HF snippet) +
 *  `prompt` (a prompt-style recipe like "PS1 Harry Potter look"). */
export type RecipeKind =
  | "ffmpeg"
  | "encode"
  | "overlay"
  | "bake"
  | "hyperframes"
  | "prompt";

/** A live/visual demo for an enriched recipe block (#082).
 *  - `kind:"hyperframes"` = a live-runnable embedded HyperFrames snippet, either
 *    inlined (`html`) or fetched from Storage (`storageUrl`).
 *  - `kind:"media"` = before/after (or single) preview media for non-runnable
 *    kinds (ffmpeg / encode / bake): `beforeUrl` + `afterUrl`, or a single
 *    `afterUrl`/`storageUrl` with an optional `posterUrl`. */
export interface BlockRecipeDemo {
  kind: "hyperframes" | "media";
  /** `hyperframes` only — the inline live-runnable HF snippet. */
  html?: string;
  /** Supabase Storage public URL (the HF snippet file, or the single demo media). */
  storageUrl?: string;
  /** `media` only — the "before" frame/clip URL. */
  beforeUrl?: string;
  /** `media` only — the "after" frame/clip URL (or the single demo media). */
  afterUrl?: string;
  /** Poster frame for a video demo. */
  posterUrl?: string;
}

/** A reusable building block. `sub` is present ONLY on assets. `refs` is an
 *  optional list of reference-example media paths surfaced on the block page.
 *
 *  The `recipeKind` / `body` / `artifact` / `params` / `demo` fields are the
 *  ENRICHED-RECIPE payload (#082) — present ONLY on `kind:"recipe"` blocks, all
 *  optional/additive so existing recipe blocks keep validating. They turn a
 *  recipe from a bare tag-cloud chip into an extractable, described, demoable
 *  artifact (see the "Tag vs Recipe split" note above). */
export interface Block {
  kind: BlockKind;
  id: string;
  name: string;
  blurb: string;
  /** Only on assets. */
  sub?: AssetSub;
  /** Reference-example media for the block page. Empty in this pass. */
  refs?: string[];
  /** Recipe-only (#082): the treatment class. */
  recipeKind?: RecipeKind;
  /** Recipe-only (#082): markdown how-to — what it is / how to use it standalone. */
  body?: string;
  /** Recipe-only (#082): the copyable reusable code (the ffmpeg filtergraph string
   *  / the HyperFrames snippet / the prompt template). */
  artifact?: string;
  /** Recipe-only (#082): named knobs/values for the artifact. */
  params?: Record<string, unknown>;
  /** Recipe-only (#082): a live (HyperFrames) or visual (before/after media) demo. */
  demo?: BlockRecipeDemo;
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
  /** Supabase Storage public URL for the `poster` frame (set when published/
   *  seeded). The remote companion to the local `poster`, mirroring how
   *  `storageUrl` companions `src`. */
  posterStorageUrl?: string;
}

/** A finished deliverable. `templateId` is single; `recipeIds` + `assetIds` are
 *  many. The look is carried in `tags` (the former single-value `styleId` axis
 *  was demoted to a tag). `mediaCount` is derived from the format default when
 *  not explicit. `media` carries the real on-disk paths (the ONLY source of
 *  Units in this migration). `hero` flags the feed's lead unit. */
export interface Unit {
  id: string;
  format: FormatId;
  title: string;
  blurb: string;
  date?: string;
  templateId: string;
  recipeIds: string[];
  assetIds: string[];
  /** Item count: actual file count for packs/carousels/cuts/sets when known,
   *  else the format default (DEFAULT_N). */
  mediaCount: number;
  /** Real on-disk media paths. */
  media?: UnitMedia[];
  hero?: boolean;
  /** Tags (#082): textual descriptors for finding similar videos, INCLUDING the
   *  unit's LOOK / register (the former `styleId` is folded in here). Filter-only
   *  — they drive the feed's `TAGS` facet, are NOT blocks, and have NO detail
   *  page. Optional/additive: units without tags still validate. */
  tags?: string[];
}

/** The three block arrays, deduped, keyed by kind. */
export interface BlocksByKind {
  template: Block[];
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
