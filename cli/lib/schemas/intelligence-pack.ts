// Universal intelligence pack Zod schema (#455).
//
// The intelligence pack is the ONE typed artifact every non-trivial project
// builds BEFORE generation: it gathers product / brand / audience / competitor /
// claim / platform facts, the typed reference pack (#426), the research distillate
// (#416), and the benchmark set (#419) into a single object that planning,
// generation, eval, and repair all read instead of re-parsing scattered research
// files.
//
// COMPOSITION (this schema WRAPS the existing artifacts, never duplicates them):
//   • ProductBrandFactsSchema  (cli/lib/schemas/research-facts.ts, #416) — the
//     research distillate, embedded verbatim and OPTIONAL on `research`.
//   • RefPackSchema            (cli/lib/schemas/ref-pack.ts, #426) — the typed
//     reference index, embedded verbatim and OPTIONAL on `refPack`.
//   • BenchmarkSetSchema       (cli/lib/schemas/benchmark.ts, #419) — the golden
//     benchmark gallery, embedded verbatim and OPTIONAL on `benchmark`.
//
// The pack then ADDS the missing pieces the three composed artifacts do not
// already carry as first-class, individually-provenanced facts: brand / product /
// audience / competitors / claims / platform constraints / open risks. Every one
// of those is an `IntelligenceFactSchema` that carries `{ source, provenance,
// confidence, origin }` so a USER-PROVIDED fact ("origin: user") is always
// distinguishable from a CRAWLED one ("origin: crawled") or an INFERRED one
// ("origin: inferred") — acceptance item #2.
//
// Where the JSON lands:
//   • <project>/INTELLIGENCE_PACK.json   (project root, beside ref-pack.json)
//
// Why a top-level project artifact: like ref-pack.json (#426) it is a project
// INDEX — it points AT research-facts.json / ref-pack.json / the benchmark set
// rather than being a reference file itself, and it is the small machine-readable
// object the production plan (#407), the mode compiler (#412), the fidelity /
// claims / platform / readiness gates (#422/#442/#443), and the repair loop
// (#409) all read. It is additive + append-only (AGENTS.md #14): rebuilding the
// pack writes a new version, never deletes a fact.
//
// Schema style mirrors cli/lib/schemas/{research-facts,ref-pack,benchmark,
// workflow}.ts: a Zod object with inline-doc comments, exported z.infer types,
// sane .default()s so a partial / best-effort assembly still parses, and a
// parseIntelligencePack(). English-only-on-disk.

import { z } from "zod";
import { ProductBrandFactsSchema } from "./research-facts.js";
import { RefPackSchema } from "./ref-pack.js";
import { BenchmarkSetSchema } from "./benchmark.js";

// ─── Source provenance (acceptance item #2) ─────────────────────────────────────

/**
 * Where a fact came from. The load-bearing distinction the issue requires:
 *   • user      — supplied by the user (intake answer, pasted brief, upload).
 *   • crawled   — extracted by the site-grounding crawl / research engine (#416).
 *   • inferred  — derived / synthesized by the agent (an LLM inference, a
 *                 deterministic classification) — the least trustworthy origin.
 */
export const FactOrigins = ["user", "crawled", "inferred"] as const;
export type FactOrigin = (typeof FactOrigins)[number];

/**
 * One provenanced fact. The `value` is the human-readable claim; the provenance
 * trio (`source` / `provenance` / `confidence`) plus `origin` make it auditable
 * and let planning weight user-provided over inferred facts.
 */
export const IntelligenceFactSchema = z.object({
  /** The fact itself — a concrete, citable claim (English-on-disk). */
  value: z.string().min(1),
  /** The cited source: a URL, a research-facts source id, "user upload", "intake". */
  source: z.string().default(""),
  /** Free-form provenance trail: how the fact was obtained (crawl page, gen-log, note). */
  provenance: z.string().default(""),
  /** Confidence in the fact, 0.0-1.0. User facts default high; inferred default low. */
  confidence: z.number().min(0).max(1).default(0.5),
  /** Where the fact came from — user-provided vs crawled vs inferred (#2). */
  origin: z.enum(FactOrigins),
});
export type IntelligenceFact = z.infer<typeof IntelligenceFactSchema>;

// ─── Sub-section schemas (the pieces the composed artifacts don't already own) ───

/**
 * A competitor surfaced by research — who else plays in this space and the
 * one-line takeaway (positioning, what they do better/worse) worth acting on.
 */
export const CompetitorSchema = z.object({
  /** Competitor name / brand. */
  name: z.string().min(1),
  /** Competitor URL, when known. */
  url: z.string().optional(),
  /** The actionable takeaway: positioning gap, what to beat, what to avoid copying. */
  takeaway: IntelligenceFactSchema,
});
export type Competitor = z.infer<typeof CompetitorSchema>;

/**
 * A platform constraint the deliverable MUST respect on one target platform —
 * the typed, provenanced counterpart to research-facts' free-text PlatformFit.
 * `note` carries the constraint as a provenanced fact (aspect / duration / hook
 * timing / caption norm / banned content) so the platform gate (#443) can cite
 * it.
 */
export const PlatformConstraintSchema = z.object({
  /** Platform id (e.g. "tiktok", "instagram", "youtube", "meta-ads"). */
  platform: z.string().min(1),
  /** Native aspect for this platform (e.g. "9:16", "1:1", "16:9"), when known. */
  aspect: z.string().optional(),
  /** Recommended duration band (e.g. "15-30s", "static"), when known. */
  durationBand: z.string().optional(),
  /** The constraint as a provenanced fact (hook timing, caption norm, banned content). */
  note: IntelligenceFactSchema,
});
export type PlatformConstraint = z.infer<typeof PlatformConstraintSchema>;

// ─── The intelligence pack ──────────────────────────────────────────────────────

export const IntelligencePackSchema = z.object({
  /** Schema version — bump when a field gains a required member. */
  version: z.literal(1).default(1),
  /** ISO timestamp the pack was assembled. */
  generatedAt: z.string().default(() => new Date().toISOString()),
  /** The project id the pack belongs to. */
  projectId: z.string().default(""),
  /** The content mode (#412) the pack is being assembled for, when known. */
  mode: z.string().optional(),

  // ── The provenanced facts the composed artifacts do NOT already own ──

  /** Brand DNA facts — palette, typography, logo style, tone of voice. */
  brand: z.array(IntelligenceFactSchema).default([]),
  /** Product facts — concrete, citable claims about the product / offer. */
  product: z.array(IntelligenceFactSchema).default([]),
  /** Audience facts — who the content is for: segments, pains, desires. */
  audience: z.array(IntelligenceFactSchema).default([]),
  /** Competitors — who else plays here + the actionable takeaway. */
  competitors: z.array(CompetitorSchema).default([]),
  /** Claims — proof points to feature AND guardrail claims to avoid (origin-tagged). */
  claims: z.array(IntelligenceFactSchema).default([]),
  /** Platform constraints — per-platform conventions the deliverable must respect. */
  platformConstraints: z.array(PlatformConstraintSchema).default([]),
  /** Open risks — the unknowns / liabilities to flag before large spend. */
  openRisks: z.array(IntelligenceFactSchema).default([]),

  // ── The composed existing artifacts (embedded verbatim, all OPTIONAL) ──

  /**
   * The research distillate (#416), embedded verbatim. The pack POINTS at the
   * on-disk research-facts.json via `researchFactsRef`; this embedded copy is the
   * resolved snapshot so a consumer reads one object. Absent when no research ran.
   */
  research: ProductBrandFactsSchema.optional(),
  /**
   * The typed reference pack (#426), embedded verbatim. Absent when no ref pack
   * was assembled. The pack also records the on-disk path via `refPackRef`.
   */
  refPack: RefPackSchema.optional(),
  /**
   * The golden benchmark set (#419) for this mode, embedded verbatim. Absent when
   * no set is authored for the mode.
   */
  benchmark: BenchmarkSetSchema.optional(),

  // ── Pointers to the on-disk source artifacts (acceptance items #4/#5) ──

  /** Project-relative path to the research-facts.json the `research` snapshot came from. */
  researchFactsRef: z.string().optional(),
  /** Project-relative path to the ref-pack.json the `refPack` snapshot came from. */
  refPackRef: z.string().optional(),
  /** Benchmark set slug the `benchmark` snapshot came from (`benchmarks/<slug>/`). */
  benchmarkSlug: z.string().optional(),
  /** Project-relative path to the ref-pack contact sheet / lint output (#449), when produced. */
  contactSheetRef: z.string().optional(),
});

export type IntelligencePack = z.infer<typeof IntelligencePackSchema>;

/** The project-relative location the intelligence pack JSON is persisted to. */
export const INTELLIGENCE_PACK_ARTIFACT = "INTELLIGENCE_PACK.json" as const;

/**
 * Parse + validate an unknown value into an IntelligencePack. Throws a ZodError
 * on a malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch
 * and pass `error.message` as `detail`.
 */
export function parseIntelligencePack(input: unknown): IntelligencePack {
  return IntelligencePackSchema.parse(input);
}

// ─── Required-intelligence matrix (acceptance item #3) ───────────────────────────
//
// The fields of an IntelligencePack a content mode requires before its production
// plan may proceed at full spend. Planning calls `missingRequirements(pack, mode)`;
// a non-empty result blocks or downgrades the plan (the issue's default policy:
// no large paid generation until required intelligence exists or the user
// approves a bypass with a reason).
//
// The lists are deliberately SMALL and sane — they encode the floor each kind of
// deliverable can't sensibly skip, NOT every nice-to-have. They are derived from
// the content-mode registry's commercial / baked-text signals (a commercial mode
// needs product/brand facts + a product ref; a research-deep mode needs research),
// keeping the matrix consistent with #412 instead of a hand-kept parallel list.

import {
  getContentMode,
  requiresFidelityGate,
} from "../content-modes.js";

/**
 * The intelligence FIELDS a mode can require. These are the array-valued fact
 * sections of the pack plus the composed-artifact slots — the things a plan can
 * meaningfully check are non-empty / present before spend.
 */
export const INTELLIGENCE_FIELDS = [
  "brand",
  "product",
  "audience",
  "competitors",
  "claims",
  "platformConstraints",
  "openRisks",
  "research",
  "refPack",
  "benchmark",
] as const;
export type IntelligenceField = (typeof INTELLIGENCE_FIELDS)[number];

/**
 * The required intelligence fields for a content mode. Derived from the registry
 * so it never drifts from #412:
 *   • Commercial modes (a real product/brand anchor — `requiresFidelityGate`)
 *     require `product` facts + a `refPack` (the locked reference discipline).
 *   • Modes whose `defaultResearchDepth` is `deep` additionally require `research`
 *     (the distilled facts the deep crawl produced).
 *   • Brand-anchored modes (declare a `brand` required ref type) also require
 *     `brand` facts.
 * An unknown mode requires nothing (the caller is free to gate separately).
 */
export function requiredIntelligenceFor(mode: string): IntelligenceField[] {
  const entry = getContentMode(mode);
  if (!entry) return [];

  const required = new Set<IntelligenceField>();

  if (requiresFidelityGate(mode)) {
    required.add("product");
    required.add("refPack");
  }
  if ((entry.requiredRefTypes ?? []).includes("brand")) {
    required.add("brand");
  }
  if (entry.defaultResearchDepth === "deep") {
    required.add("research");
  }

  // Stable order = INTELLIGENCE_FIELDS.
  return INTELLIGENCE_FIELDS.filter((f) => required.has(f));
}

/** True when a pack field is populated (non-empty array / present optional). */
function fieldPresent(pack: IntelligencePack, field: IntelligenceField): boolean {
  switch (field) {
    case "research":
      return pack.research !== undefined;
    case "refPack":
      return pack.refPack !== undefined && pack.refPack.entries.length > 0;
    case "benchmark":
      return pack.benchmark !== undefined;
    default:
      return (pack[field] as unknown[]).length > 0;
  }
}

/**
 * The required intelligence fields a pack does NOT yet satisfy for a mode. Empty
 * array = the pack clears the mode's intelligence floor and planning may proceed
 * at full spend. A non-empty result is what planning blocks / downgrades on (the
 * issue's default-deny-large-spend policy). The mode argument defaults to the
 * pack's own `mode` when set, so `missingRequirements(pack)` works once the pack
 * records which mode it was built for.
 */
export function missingRequirements(
  pack: IntelligencePack,
  mode: string | undefined = pack.mode,
): IntelligenceField[] {
  if (!mode) return [];
  return requiredIntelligenceFor(mode).filter((f) => !fieldPresent(pack, f));
}

// ─── Composer (pure, injectable — acceptance items #1/#4/#5) ─────────────────────

/** Optional inputs the composer assembles a pack from. All optional + injectable. */
export interface BuildIntelligencePackInput {
  /** The project id the pack belongs to. */
  projectId?: string;
  /** The content mode the pack is for. */
  mode?: string;
  /** The research distillate (#416), already parsed. */
  research?: z.infer<typeof ProductBrandFactsSchema>;
  /** Project-relative path the research came from (for `researchFactsRef`). */
  researchFactsRef?: string;
  /** The typed reference pack (#426), already parsed. */
  refPack?: z.infer<typeof RefPackSchema>;
  /** Project-relative path the ref pack came from (for `refPackRef`). */
  refPackRef?: string;
  /** Path to the ref-pack contact sheet / lint output (#449). */
  contactSheetRef?: string;
  /** The golden benchmark set (#419), already parsed. */
  benchmark?: z.infer<typeof BenchmarkSetSchema>;
  /** The provenanced facts the composed artifacts don't already own. */
  brand?: IntelligenceFact[];
  product?: IntelligenceFact[];
  audience?: IntelligenceFact[];
  competitors?: Competitor[];
  claims?: IntelligenceFact[];
  platformConstraints?: PlatformConstraint[];
  openRisks?: IntelligenceFact[];
}

/**
 * Assemble an IntelligencePack from optional existing artifacts + provenanced
 * facts. PURE — no filesystem, no network, no LLM: everything is injected by the
 * caller (the CLI verb / agent does the IO and parsing, then hands the parsed
 * objects here). When research / a ref pack / a benchmark is provided, the pack
 * embeds it AND records its on-disk pointer; the benchmark slug is taken from the
 * benchmark set itself. The result is run through the schema so defaults fill and
 * the output always validates.
 */
export function buildIntelligencePack(input: BuildIntelligencePackInput = {}): IntelligencePack {
  return parseIntelligencePack({
    projectId: input.projectId,
    mode: input.mode,
    brand: input.brand,
    product: input.product,
    audience: input.audience,
    competitors: input.competitors,
    claims: input.claims,
    platformConstraints: input.platformConstraints,
    openRisks: input.openRisks,
    research: input.research,
    refPack: input.refPack,
    benchmark: input.benchmark,
    researchFactsRef: input.researchFactsRef,
    refPackRef: input.refPackRef,
    benchmarkSlug: input.benchmark?.slug,
    contactSheetRef: input.contactSheetRef,
  });
}

/** All facts in the pack, flattened — for a quick provenance audit / count. */
export function allFacts(pack: IntelligencePack): IntelligenceFact[] {
  return [
    ...pack.brand,
    ...pack.product,
    ...pack.audience,
    ...pack.competitors.map((c) => c.takeaway),
    ...pack.claims,
    ...pack.platformConstraints.map((p) => p.note),
    ...pack.openRisks,
  ];
}

/** The distinct fact origins present in the pack (user / crawled / inferred). */
export function originsPresent(pack: IntelligencePack): FactOrigin[] {
  return [...new Set(allFacts(pack).map((f) => f.origin))];
}
