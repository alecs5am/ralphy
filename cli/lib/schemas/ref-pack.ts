// Reference-pack Zod schema (#426). A `ref-pack.json` is the project-side
// manifest of the disciplined reference set a project will generate against:
// the brand / product / model / style / benchmark / source / music /
// generated-master / selected-prototype refs, each typed, path-resolved, and
// optionally LOCKED (must be reused verbatim across all downstream generation —
// the "super-original" discipline from the postmortems this issue cites).
//
// Where the JSON lands:
//   • <project>/ref-pack.json   (project root, beside asset-manifest.json)
//
// Why a top-level project artifact (not under artifacts/refs/): the pack is a
// project-level INDEX of references, not itself a reference file. It points AT
// the refs that live in `artifacts/refs/` (and resolvable workspace `shared/`)
// — keeping it beside `asset-manifest.json` mirrors that "index of the working
// dump" role. It is additive + append-only (AGENTS.md #14): re-running `ref
// pack` MERGES entries by path and never deletes a ref or a file on disk.
//
// The `type` taxonomy aligns with the reference-required gate's `RefGateKind`
// (`cli/lib/eval/refs.ts`): `brand`/`product`/`model-person` are the lockable
// real-entity types the gate (#3) cares about; the rest are craft refs (style,
// benchmark, source-video, music) and pipeline outputs (generated-master,
// selected-prototype) that downstream stages reuse.
//
// Schema style mirrors `cli/lib/schemas/{research-facts,unit,provenance-graph}.ts`:
// a Zod object with inline-doc comments, exported `z.infer` types, sane defaults
// so a partial / best-effort assembly still parses, and a `parseRefPack()`.
// English-only-on-disk.

import { z } from "zod";

// ─── Ref-type taxonomy ──────────────────────────────────────────────────────────

/**
 * The nine reference types a pack can carry. Append, never repurpose.
 *
 *   • brand              — a recognizable brand mark / logo / palette reference.
 *   • product            — a specific product / packaging the gen must match.
 *   • model-person       — a named real person / cast master the gen must match.
 *   • style              — an aesthetic / look reference (the register to lock).
 *   • benchmark          — a best-in-class example to measure the result against.
 *   • source-video       — a creator / competitor video being reproduced or remixed.
 *   • music              — a reference track / trend audio for the bed.
 *   • generated-master   — a generated super-original (product/model master shot)
 *                          to pass on every `--ref` so identity doesn't drift.
 *   • selected-prototype — one approved prototype (e.g. the analog-horror style
 *                          frame) the batch generation anchors to.
 */
export const REF_TYPES = [
  "brand",
  "product",
  "model-person",
  "style",
  "benchmark",
  "source-video",
  "music",
  "generated-master",
  "selected-prototype",
] as const;
export type RefType = (typeof REF_TYPES)[number];

/** True when `value` is a legal ref type. */
export function isRefType(value: unknown): value is RefType {
  return typeof value === "string" && (REF_TYPES as readonly string[]).includes(value);
}

// ─── A pack entry ───────────────────────────────────────────────────────────────

/**
 * One reference in the pack. `path` is project-relative (resolves through the
 * existing ref-resolution order in `path-resolution.ts`: cwd → <project>/ →
 * artifacts/refs/ → workspace shared/). `source` is free-form provenance (a URL,
 * a gen-log slot, "user upload", a research-facts note). `locked` marks a ref
 * that MUST be reused verbatim across all downstream generation.
 */
export const RefPackEntrySchema = z.object({
  /** Ref type from the fixed taxonomy. */
  type: z.enum(REF_TYPES),
  /** Project-relative path to the ref file (the merge key — unique within the pack). */
  path: z.string().min(1),
  /** Provenance: a URL, gen-log slot, "user upload", or a research-facts note. */
  source: z.string().default(""),
  /** When true, this ref must be passed verbatim on every downstream `--ref`. */
  locked: z.boolean().default(false),
  /** Optional one-line human note (English-on-disk). */
  note: z.string().optional(),
});
export type RefPackEntry = z.infer<typeof RefPackEntrySchema>;

// ─── The top-level pack object ────────────────────────────────────────────────────

export const RefPackSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The project id the pack belongs to. */
  projectId: z.string().default(""),
  /** ISO timestamp of the last assembly / merge. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** The typed reference entries (best-effort: absent inputs simply omit entries). */
  entries: z.array(RefPackEntrySchema).default([]),
});
export type RefPack = z.infer<typeof RefPackSchema>;

/** The project-relative location the pack JSON is persisted to. */
export const REF_PACK_ARTIFACT = "ref-pack.json" as const;

/**
 * Parse + validate an unknown value into a RefPack. Throws a ZodError on a
 * malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch and
 * pass `error.message` as `detail`.
 */
export function parseRefPack(input: unknown): RefPack {
  return RefPackSchema.parse(input);
}

/** The locked entries — refs a future `--ref` discipline must reuse verbatim. */
export function lockedRefs(pack: RefPack): RefPackEntry[] {
  return pack.entries.filter((e) => e.locked);
}

/** The distinct ref types present in the pack. */
export function refTypesPresent(pack: RefPack): RefType[] {
  return [...new Set(pack.entries.map((e) => e.type))];
}

/**
 * Required-ref-by-mode report: which of `required` are NOT covered by the pack.
 * Empty array = the pack satisfies the mode's required ref types. Does NOT block
 * generation (the fidelity gate #422 owns enforcement) — it only reports.
 */
export function missingRequiredRefTypes(pack: RefPack, required: RefType[]): RefType[] {
  const present = new Set(refTypesPresent(pack));
  return required.filter((t) => !present.has(t));
}
