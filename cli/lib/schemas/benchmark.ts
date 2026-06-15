// Golden benchmark-set Zod schema (#419). A benchmark SET is a curated gallery
// of good / acceptable / bad examples for one content-mode + format, with the
// concrete FEATURES that make each example pass or fail. Evaluation and council
// review cite a mode's benchmark set so critique is grounded in a documented mode
// standard instead of generic taste.
//
// Where the sets live (mirrors `guidelines/`):
//   • benchmarks/<slug>/benchmark.json   — the validated set (this schema)
//   • benchmarks/<slug>/README.md        — optional human notes
//
// A set is DESCRIPTIVE: examples carry an optional `sourceUrl` and an optional
// `mediaRef` (a path under the gallery / a pulled ref), but we do NOT download or
// generate paid media to author one — the load-bearing payload is the `features`
// list + `notes`, which an LLM scoring pass can compare an output against.
//
// Negative examples (`label: "bad"`) are REQUIRED by the issue — agents learn
// what to avoid, not only what to imitate.
//
// Schema style mirrors `cli/lib/schemas/{research-facts,ref-pack,unit}.ts`: a Zod
// object with inline-doc comments, exported `z.infer` types, sane defaults so a
// partial / best-effort set still parses, and a `parseBenchmarkSet()`.
// English-only-on-disk.

import { z } from "zod";
import { CONTENT_MODES_LIST } from "../content-modes.js";
import { TEMPLATE_FORMATS } from "./template.js";

// ─── Example sub-schema ─────────────────────────────────────────────────────────

/** Pass/fail label for one benchmark example. `bad` = a negative example. */
export const BenchmarkLabels = ["good", "acceptable", "bad"] as const;
export type BenchmarkLabel = (typeof BenchmarkLabels)[number];

/**
 * One example in a benchmark set. The `features` array is the load-bearing
 * payload — the concrete, mode-specific reasons this example passes (good /
 * acceptable) or fails (bad). `sourceUrl` cites where the example came from when
 * allowed; `mediaRef` is an OPTIONAL on-disk / pulled-ref path (absent for a
 * descriptive set — we do not download paid media to author one).
 */
export const BenchmarkExampleSchema = z.object({
  /** Pass/fail label. `bad` examples are negative examples (what to avoid). */
  label: z.enum(BenchmarkLabels),
  /** Source URL of the example (a post / listing / image), when allowed to cite. */
  sourceUrl: z.string().optional(),
  /** Optional on-disk / pulled-ref path to the example media (often absent). */
  mediaRef: z.string().optional(),
  /** The concrete features that make this example pass or fail — the standard. */
  features: z.array(z.string().min(1)).min(1),
  /** One-line note tying the features to the mode's quality bar. */
  notes: z.string().default(""),
});
export type BenchmarkExample = z.infer<typeof BenchmarkExampleSchema>;

// ─── The benchmark set ──────────────────────────────────────────────────────────

export const BenchmarkSetSchema = z.object({
  /** Schema version — bump when a field gains a required member. */
  version: z.literal(1).default(1),
  /** Canonical set slug (matches the `benchmarks/<slug>/` dir). */
  slug: z.string().min(1),
  /** Human-readable name. */
  name: z.string().min(1),
  /** Content mode (#412) this set is the standard for. */
  mode: z.enum(CONTENT_MODES_LIST),
  /** Media format the examples ship as (∈ the format taxonomy). */
  format: z.enum(TEMPLATE_FORMATS),
  /** One-line, agent-facing summary of what this set benchmarks. */
  summary: z.string().default(""),
  /** The curated examples — at least one good + one bad (see `parseBenchmarkSet`). */
  examples: z.array(BenchmarkExampleSchema).min(1),
});
export type BenchmarkSet = z.infer<typeof BenchmarkSetSchema>;

/**
 * Parse + validate an unknown value into a BenchmarkSet. Throws a ZodError on a
 * malformed set. The loader (`cli/lib/benchmarks.ts`) catches this per-file so a
 * single bad set never crashes the gallery.
 */
export function parseBenchmarkSet(input: unknown): BenchmarkSet {
  return BenchmarkSetSchema.parse(input);
}

/** Whether a set carries at least one good AND one bad example (the issue bar). */
export function hasGoodAndBad(set: BenchmarkSet): boolean {
  const labels = new Set(set.examples.map((e) => e.label));
  return labels.has("good") && labels.has("bad");
}
