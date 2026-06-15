// Unit provenance GRAPH (#420) — the rich, optional companion to the compact
// `UnitProvenanceSchema` in `unit.ts`.
//
// The compact provenance (template / style / recipes / assets) answers "which
// library blocks made this unit". The GRAPH answers the harder question every
// postmortem had to reconstruct by hand: which brief, research facts, style
// lock, prompts, source refs, generated assets (with their model / provider /
// cost / selected-vs-rejected variants), renders, eval reports, council
// reports, repair plans, and final media produced the deliverable — the whole
// reproduction chain from chat brief to shipped mp4.
//
// ─── Storage decision (justified inline, per the issue) ─────────────────────────
//
// The graph is stored as a SIBLING FILE: `<project>/units/<slug>/provenance.json`,
// referenced from `unit.json` by the optional `provenance_graph` filename field.
// It is NOT inlined into `unit.json`. Reasons:
//   1. SIZE — the graph enumerates every generation row (a video unit can have
//      dozens of `.v2`/`.v3` re-rolls), so inlining would bloat the manifest the
//      `unit show` / list / caption verbs read on every call. The issue
//      explicitly prefers keeping `unit.json` compact and accepts a referenced
//      sibling.
//   2. ADDITIVE — old `unit.json` files (no `provenance_graph` field) validate
//      unchanged; the sibling is simply absent for them.
//   3. APPEND-ONLY — like every other unit artifact, a re-`create` lands in a new
//      `units/<slug>.v2/` dir with its own `provenance.json`; we never rewrite a
//      prior unit's graph. The graph is built ONCE at unit-create time from a
//      read-only scan of the project logs/manifests — it never mutates an
//      existing graph in place.
//
// Schema style mirrors `cli/lib/schemas/{unit,research-facts,council}.ts`: a Zod
// object with inline-doc comments, exported `z.infer` types, sane defaults so a
// partial / best-effort capture still parses. English-only-on-disk.

import { z } from "zod";

// ─── Node taxonomy ──────────────────────────────────────────────────────────────

/**
 * The kinds of node in the production chain. One per contract phase that leaves
 * a durable, citable artifact (the agent-driven phases with no on-disk artifact
 * — content-mode, format-match, memory-recall — are not nodes). Append, never
 * repurpose.
 */
export const PROVENANCE_NODE_KINDS = [
  "brief",
  "research-facts",
  "style-lock",
  "prompt",
  "source-ref",
  "generated-asset",
  "render",
  "eval-report",
  "council-report",
  "repair-plan",
  "final-media",
] as const;
export type ProvenanceNodeKind = (typeof PROVENANCE_NODE_KINDS)[number];

// ─── Model-call provenance (the cost/model/variant facts) ───────────────────────

/**
 * The model-call facts a node records when it was produced by a generation. All
 * optional — a node may be a plain artifact (the brief) with no model behind it.
 * Mirrors the canonical generation-log keys (`cli/lib/gen-log.ts`): `provider`
 * (connector id), `model` (fully-qualified id), `cost_usd`, `timestamp`.
 */
export const ProvenanceModelCallSchema = z.object({
  /** Connector / provider id ("openrouter", "elevenlabs", "fal", "ffmpeg"). */
  provider: z.string().optional(),
  /** Fully-qualified model id ("google/gemini-3-pro-image-preview"). */
  model: z.string().optional(),
  /** Best-effort USD cost of the call(s) behind this node. */
  costUsd: z.number().optional(),
  /** ISO timestamp the underlying call ran (the gen-log row timestamp). */
  timestamp: z.string().optional(),
});
export type ProvenanceModelCall = z.infer<typeof ProvenanceModelCallSchema>;

/**
 * A single node in the provenance graph.
 *
 * `id` is unique within the graph and is what `parents` reference (a flat
 * parent-id list — a DAG, not a tree, and deliberately NOT a graph database;
 * the issue says a flat typed object with arrays + simple parent references is
 * enough). `ref` is the project-relative path / slot the node points at on disk
 * (a file, an asset slot, a ref slug) so the graph cross-walks to the actual
 * artifacts. `selectedVariants` / `rejectedVariants` capture the choose-the-
 * winner decision (e.g. the promoted `.v3` vs the rejected `.v1`/`.v2`).
 */
export const ProvenanceNodeSchema = z.object({
  /** Unique node id within the graph (e.g. "brief", "asset:scene-01-bg-image"). */
  id: z.string().min(1),
  /** Node kind from the fixed taxonomy. */
  kind: z.enum(PROVENANCE_NODE_KINDS),
  /** Short human label (English-on-disk). */
  label: z.string().default(""),
  /** Project-relative path / asset slot / ref slug this node points at, when one exists. */
  ref: z.string().optional(),
  /** Ids of the nodes this node was derived from (a flat DAG edge list). */
  parents: z.array(z.string()).default([]),
  /** Model-call facts (provider / model / cost / timestamp), when produced by a generation. */
  modelCall: ProvenanceModelCallSchema.optional(),
  /** Variant ids that were SELECTED / promoted (the kept output). */
  selectedVariants: z.array(z.string()).default([]),
  /** Variant ids that were REJECTED (kept on disk per the append-only contract, but not chosen). */
  rejectedVariants: z.array(z.string()).default([]),
});
export type ProvenanceNode = z.infer<typeof ProvenanceNodeSchema>;

// ─── The top-level graph object ─────────────────────────────────────────────────

export const ProvenanceGraphSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The unit slug this graph belongs to (matches `unit.json` slug). */
  slug: z.string().default(""),
  /** The project id the graph was captured from. */
  projectId: z.string().default(""),
  /** ISO timestamp the graph was captured (at unit-create time). */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** The typed nodes (best-effort: absent inputs simply omit their node). */
  nodes: z.array(ProvenanceNodeSchema).default([]),
  /**
   * Rolled-up total USD cost across every node's model call. A convenience the
   * publish path can surface without re-summing; derived from `nodes`.
   */
  totalCostUsd: z.number().default(0),
});
export type ProvenanceGraph = z.infer<typeof ProvenanceGraphSchema>;

/** The sibling filename the graph is persisted to inside a unit dir. */
export const PROVENANCE_GRAPH_FILENAME = "provenance.json" as const;

/**
 * Parse + validate an unknown value into a ProvenanceGraph. Throws a ZodError on
 * a malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch and
 * pass `error.message` as `detail`.
 */
export function parseProvenanceGraph(input: unknown): ProvenanceGraph {
  return ProvenanceGraphSchema.parse(input);
}
