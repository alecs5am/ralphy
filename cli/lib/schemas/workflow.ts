// Per-workspace declarative workflow schema (#478).
//
// A workflow is the configurable, ComfyUI-style staged pipeline a workspace runs
// to turn an idea into a finished video: an ordered list of steps, each PINNED to
// a production-contract phase (cli/lib/contract.ts) and carrying an engine, an
// optional model (or models[] for variant fan-out), a variant count, an eval gate
// (criterion ids from the workspace evaluators.json, #468), an auto|approve mode,
// and a bounded repair config. It GENERALIZES the workspace `stageGates` (#472):
// stageGates says "this phase is gated by these criteria"; a workflow step says
// the same PLUS how the step is produced and whether it stops for approval.
//
// Linear-pipeline-with-fan-out, NOT a free-form node graph (D-1): steps run in
// list order, branching only at variant fan-out. Studio renders it as a node
// chain; the runner stays a simple ordered walk over these steps.
//
// Schema style mirrors cli/lib/schemas/workspace-evaluators.ts: a Zod object with
// inline-doc comments, exported z.infer types, sane .default()s, a parseWorkflow().
// The phase pin validates LAZILY against CONTRACT_PHASE_IDS via .refine() — the
// same circular-import guard documented on StageGate.phase. English-only-on-disk.

import { z } from "zod";
import { CONTRACT_PHASE_IDS } from "../contract.js";
import type { Capability } from "../providers/types.js";

/**
 * How a step is produced:
 *   • agent              — the orchestrating agent does it, no mechanical call
 *                          (load context, intake). The v1 driver is Claude Code
 *                          in chat; a callLLM() driver can take over later (D-3).
 *   • llm                — a text-model call (scenario, prompt drafting).
 *   • generate.{kind}    — a `ralphy generate <kind>` media call. variants>1 fans
 *                          out (across models[] when set).
 *   • render             — `ralphy render`.
 *   • eval               — `ralphy workspace eval` filtered to this step's gate.
 */
export const WorkflowEngineSchema = z.enum([
  "agent",
  "llm",
  "generate.image",
  "generate.video",
  "generate.voiceover",
  "generate.music",
  "render",
  "eval",
]);
export type WorkflowEngine = z.infer<typeof WorkflowEngineSchema>;

/** auto = advance on a clear gate; approve = always stop and present. */
export const WorkflowStepModeSchema = z.enum(["auto", "approve"]);
export type WorkflowStepMode = z.infer<typeof WorkflowStepModeSchema>;

/** Bounded repair config for a gated step (mirrors the #473 stage loop). */
export const WorkflowRepairSchema = z
  .object({
    /** Max assemble→eval→repair iterations before stopping (0 = no repair loop). */
    retryBudget: z.number().int().min(0).default(2),
    /** Pre-approve paid regen inside the loop ("just fix it, don't ask"). */
    batchApproved: z.boolean().default(false),
  })
  .default({});
export type WorkflowRepair = z.infer<typeof WorkflowRepairSchema>;

/** One workflow step. */
export const WorkflowStepSchema = z.object({
  /** Stable step id, unique within the workflow. */
  id: z.string(),
  /** Human-readable label for reports / studio (falls back to id when empty). */
  label: z.string().default(""),
  /**
   * The contract phase this step maps to — MUST be a real `CONTRACT_PHASES[].id`.
   * Validated LAZILY against `CONTRACT_PHASE_IDS` via `.refine()` (read at PARSE
   * time, not module-eval time) to dodge the contract↔schema circular-import
   * load-order trap — same guard as `StageGate.phase`.
   */
  phase: z.string().refine((p) => CONTRACT_PHASE_IDS.includes(p), {
    message: "phase must be a CONTRACT_PHASES id (see cli/lib/contract.ts)",
  }),
  /** Optional owning playbook role (scenarist | art-director | editor | researcher). */
  owner: z.string().optional(),
  /** How the step is produced. */
  engine: WorkflowEngineSchema,
  /** Single model id (else the engine's run-time default). */
  model: z.string().optional(),
  /** Multiple model ids — one variant per model (overrides `model` for fan-out). */
  models: z.array(z.string()).optional(),
  /** Variants to produce (>1 fans out; with models[], one per model). */
  variants: z.number().int().min(1).default(1),
  /** Criterion ids (from evaluators.json) that gate advancing past this step. */
  gate: z.array(z.string()).default([]),
  /** auto | approve. Defaults to approve — a step stops for the user unless opted down. */
  mode: WorkflowStepModeSchema.default("approve"),
  /** Bounded repair loop for the gate. */
  repair: WorkflowRepairSchema,
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.string().default("1.0"),
  /** Workflow name (the file basename under workflows/). */
  name: z.string(),
  /** Ordered steps; run in list order, branching only at variant fan-out. */
  steps: z.array(WorkflowStepSchema).default([]),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

/** Parse + validate an unknown value into a Workflow (throws ZodError when malformed). */
export function parseWorkflow(raw: unknown): Workflow {
  if (isWorkflowGraphDocument(raw)) {
    throw new Error(
      "this is a node-graph workflow (it carries nodes[]) — parse it with parseWorkflowGraph() and validate it with `ralphy workflow lint`",
    );
  }
  return WorkflowSchema.parse(raw);
}

// ═════════════════════════════════════════════════════════════════════════════
// Node-graph workflow (#498) — the farm generalization of the linear schema.
//
// Version "2.0": a workflow is a typed node DAG (docs/architecture/
// farm-node-graph.md, "Node design"), not an ordered step list. A version-"1.0"
// linear workflow is a degenerate graph and KEEPS PARSING through the schemas
// above — dispatch between the two shapes with parseWorkflowDocument(). Spec
// format is D-03: JSON is the storage format under workflows/<name>.json; YAML
// is accepted at import/lint time (cli/lib/workflow-graph.ts).
//
// This module owns SHAPE only (Zod parse + the static node-signature registry
// used for port typing). The semantic graph checks — DAG, edge resolution,
// port-type matching, #497 provider-coverage — live in
// cli/lib/workflow-graph.ts (validateWorkflowGraph), separate from the parse.
// ═════════════════════════════════════════════════════════════════════════════

// ─── Node-type taxonomy (design doc sections A–G) ────────────────────────────

/** A. LLM nodes (Vercel AI SDK layer, #496/#499). */
export const LLM_NODE_TYPES = [
  "generate-text",
  "generate-object",
  "agent-loop",
  "coding-agent",
] as const;

/** B. Media nodes — typed by I/O signature, not by model. */
export const MEDIA_NODE_TYPES = [
  "t2i",
  "i2i",
  "t2v",
  "i2v",
  "r2v",
  "v2v",
  "lipsync",
  "tts",
  "voice-design",
  "music",
  "sfx",
  "transcribe",
  "upscale",
  "remove-bg",
  "reframe",
  "crunch",
] as const;

/** C. Ralphy verb nodes — the farm executes ralphy, it never reimplements it. */
export const RALPHY_VERB_NODE_TYPES = [
  "ralphy-generate",
  "ralphy-render",
  "ralphy-eval",
  "ralphy-repair",
  "ralphy-unit",
  "ralphy-captions",
  "ralphy-social-copy",
] as const;

/** D. Ingestion / connector nodes — all emit normalized source-item[]. */
export const INGESTION_NODE_TYPES = ["web-scrape", "actor", "rss", "trend-watch", "http"] as const;

/** E. Publish nodes. */
export const PUBLISH_NODE_TYPES = ["publish", "youtube-upload", "x-post", "analytics-pull"] as const;

/** F. Control-flow nodes. */
export const CONTROL_FLOW_NODE_TYPES = [
  "schedule",
  "calendar-slot",
  "fan-out",
  "join",
  "switch",
  "gate",
  "approval",
  "budget-guard",
  "dedup",
] as const;

/** G. Data nodes. */
export const DATA_NODE_TYPES = ["transform", "template-string", "artifact-write"] as const;

export const WORKFLOW_NODE_TYPES = [
  ...LLM_NODE_TYPES,
  ...MEDIA_NODE_TYPES,
  ...RALPHY_VERB_NODE_TYPES,
  ...INGESTION_NODE_TYPES,
  ...PUBLISH_NODE_TYPES,
  ...CONTROL_FLOW_NODE_TYPES,
  ...DATA_NODE_TYPES,
] as const;
export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export type WorkflowNodeCategory =
  | "llm"
  | "media"
  | "ralphy-verb"
  | "ingestion"
  | "publish"
  | "control-flow"
  | "data";

/** Category of a node type (drives the per-category params schema). */
export function nodeCategory(type: WorkflowNodeType): WorkflowNodeCategory {
  if ((LLM_NODE_TYPES as readonly string[]).includes(type)) return "llm";
  if ((MEDIA_NODE_TYPES as readonly string[]).includes(type)) return "media";
  if ((RALPHY_VERB_NODE_TYPES as readonly string[]).includes(type)) return "ralphy-verb";
  if ((INGESTION_NODE_TYPES as readonly string[]).includes(type)) return "ingestion";
  if ((PUBLISH_NODE_TYPES as readonly string[]).includes(type)) return "publish";
  if ((CONTROL_FLOW_NODE_TYPES as readonly string[]).includes(type)) return "control-flow";
  return "data";
}

// ─── Port typing ─────────────────────────────────────────────────────────────

/** The named artifact types ports carry (design doc "Common node envelope"). */
export const PORT_TYPE_NAMES = ["text", "image[]", "video", "audio", "source-item[]", "unit"] as const;

/**
 * `object:<schema-ref>` is pattern-matched: the ref is a free-form schema
 * name / file ref; `object:*` is the wildcard produced by a generate-object
 * node with no `schema` param (matches any object:<ref>).
 */
const OBJECT_PORT_RE = /^object:(\*|[A-Za-z0-9][A-Za-z0-9_./-]*)$/;

/**
 * "any" is INTERNAL to the signature registry (polymorphic control-flow/data
 * ports) — it is not authorable on a node's explicit `out.type`.
 */
export type PortType = (typeof PORT_TYPE_NAMES)[number] | `object:${string}`;

export function isPortType(t: string): t is PortType {
  return (PORT_TYPE_NAMES as readonly string[]).includes(t) || OBJECT_PORT_RE.test(t);
}

export const PortTypeSchema = z.string().refine(isPortType, {
  message: `port type must be one of ${PORT_TYPE_NAMES.join(", ")} or object:<schema-ref>`,
});

/** Do two port types match? "any" is the wildcard; object:* matches any object:<ref>. */
export function portTypesMatch(a: string, b: string): boolean {
  if (a === "any" || b === "any") return true;
  if (a === b) return true;
  if (a.startsWith("object:") && b.startsWith("object:")) {
    return a === "object:*" || b === "object:*";
  }
  return false;
}

// ─── Common node envelope ────────────────────────────────────────────────────

export const NODE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** `halt` | `skip` | `route:<node-id>` — failure routing. */
export const NodeOnFailSchema = z
  .string()
  .regex(/^(halt|skip|route:[a-z0-9][a-z0-9-]*)$/, {
    message: "on_fail must be halt, skip, or route:<node-id>",
  })
  .default("halt");

export const NodeRetrySchema = z
  .object({
    /** Max re-runs after a failure (0 = no retry). */
    max: z.number().int().min(0).default(0),
    backoff: z.enum(["none", "linear", "exponential"]).default("exponential"),
  })
  .default({});
export type NodeRetry = z.infer<typeof NodeRetrySchema>;

/** Per-node spend cap, pre-flight estimated by the runner (#499). */
export const NodeBudgetSchema = z.object({ max_usd: z.number().nonnegative() });

/** Skip re-run when inputs are unchanged. Default none — caching is opt-in. */
export const NodeCacheSchema = z.enum(["content-hash", "none"]).default("none");

/**
 * Named typed output. A bare string names the output artifact (its type comes
 * from the node type's signature); the object form also pins an explicit port
 * type — the override valve for polymorphic nodes (transform, fan-out, ...).
 * When omitted, the output port is named "out".
 */
export const NodeOutSchema = z.union([
  z.string().min(1),
  z.object({ name: z.string().min(1), type: PortTypeSchema }),
]);

/**
 * Typed in-ports: port name → either an upstream `<node-id>.<out-name>` ref or
 * an artifact ref (`artifact:<path>`, or any path containing "/"). Port TYPES
 * come from the node type's signature (NODE_SIGNATURES), so wiring is checked
 * at import, not mid-run.
 */
export const NodeInSchema = z.record(z.string().min(1)).default({});

/** Envelope fields shared by every node type (design doc "Common node envelope"). */
const ENVELOPE_FIELDS = {
  /** Unique in graph, lowercase kebab-case. */
  id: z.string().regex(NODE_ID_RE, { message: "node id must be lowercase kebab-case" }),
  in: NodeInSchema,
  out: NodeOutSchema.optional(),
  retry: NodeRetrySchema,
  on_fail: NodeOnFailSchema,
  budget: NodeBudgetSchema.optional(),
  cache: NodeCacheSchema,
  /** Events → run journal → dashboard. */
  emit: z.boolean().default(true),
} as const;

// ─── Per-category params ─────────────────────────────────────────────────────
//
// Lenient by design: executors land in later issues (#499/#503), so params are
// passthrough records with only the load-bearing fields typed. Media nodes MUST
// carry model/provider inside params for the #497 coverage-matrix validation.

/** A. LLM node params (generate-text/-object, agent-loop, coding-agent). */
const LlmParamsSchema = z
  .object({
    model: z.string().optional(),
    provider: z.string().optional(),
    /** Prompt file ref with {{slot}} interpolation, or inline text. */
    prompt: z.string().optional(),
    system: z.string().optional(),
    temperature: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    fallback_models: z.array(z.string()).optional(),
    /** generate-object: zod/JSON-schema file ref — types the output port. */
    schema: z.string().optional(),
    /** agent-loop: whitelist of graph-exposed tools/connectors. */
    tools: z.array(z.string()).optional(),
    max_steps: z.number().int().positive().optional(),
    stop_when: z.string().optional(),
    /** coding-agent. */
    binary: z.string().optional(),
    prompt_file: z.string().optional(),
    workdir: z.string().optional(),
    timeout: z.number().optional(),
    allowed_paths: z.array(z.string()).optional(),
  })
  .passthrough()
  .default({});

/**
 * B. Media node params. The (model, provider) binding is validated against the
 * #497 coverage matrix at import (cli/lib/workflow-graph.ts); the remaining
 * keys are connector-input param names (coverage.ts convention) and stay open.
 */
const MediaParamsSchema = z
  .object({
    model: z.string().optional(),
    provider: z.string().optional(),
  })
  .passthrough()
  .default({});

/** C–G. Lenient per-type records until the executors exist. */
const LenientParamsSchema = z.record(z.unknown()).default({});

const PARAMS_BY_CATEGORY: Record<WorkflowNodeCategory, z.ZodTypeAny> = {
  llm: LlmParamsSchema,
  media: MediaParamsSchema,
  "ralphy-verb": LenientParamsSchema,
  ingestion: LenientParamsSchema,
  publish: LenientParamsSchema,
  "control-flow": LenientParamsSchema,
  data: LenientParamsSchema,
};

// ─── Node signatures (port typing per node type) ─────────────────────────────

export interface NodeSignature {
  category: WorkflowNodeCategory;
  /** Declared in-ports (name → port type; "any" = polymorphic wildcard). */
  inputs: Record<string, string>;
  /**
   * true → extra in-port names beyond `inputs` are allowed and typed "any"
   * (LLM prompt interpolation, control-flow/data plumbing). false → an
   * undeclared in-port name is an import error.
   */
  openInputs: boolean;
  /** Default output port type ("any" = wildcard; explicit `out.type` overrides). */
  output: string;
  /** #497 coverage-matrix capability (media nodes only; null = no coverage check). */
  capability: Capability | null;
}

const sig = (
  category: WorkflowNodeCategory,
  inputs: Record<string, string>,
  openInputs: boolean,
  output: string,
  capability: Capability | null = null,
): NodeSignature => ({ category, inputs, openInputs, output, capability });

/** I/O signature per node type — the static half of port-type validation. */
export const NODE_SIGNATURES: Record<WorkflowNodeType, NodeSignature> = {
  // A. LLM — open inputs (any upstream artifact can interpolate into the prompt).
  "generate-text": sig("llm", { prompt: "text" }, true, "text"),
  // Output type is dynamic: object:<params.schema>, or object:* when unset.
  "generate-object": sig("llm", { prompt: "text" }, true, "object:*"),
  "agent-loop": sig("llm", {}, true, "text"),
  "coding-agent": sig("llm", {}, true, "text"),

  // B. Media — strict inputs typed by I/O signature.
  t2i: sig("media", { prompt: "text" }, false, "image[]", "image"),
  i2i: sig("media", { images: "image[]", prompt: "text" }, false, "image[]", "image"),
  t2v: sig("media", { prompt: "text" }, false, "video", "video"),
  i2v: sig("media", { first_frame: "image[]", last_frame: "image[]", prompt: "text" }, false, "video", "video"),
  r2v: sig("media", { refs: "image[]", ref_videos: "video", prompt: "text" }, false, "video", "video"),
  v2v: sig("media", { video: "video", prompt: "text" }, false, "video", "video"),
  lipsync: sig("media", { image: "image[]", audio: "audio" }, false, "video", "video"),
  tts: sig("media", { text: "text" }, false, "audio", "voice"),
  "voice-design": sig("media", { text: "text" }, false, "object:voice-design", "voice"),
  music: sig("media", { prompt: "text" }, false, "audio", "music"),
  sfx: sig("media", { prompt: "text" }, false, "audio", "sfx"),
  transcribe: sig("media", { audio: "audio", video: "video" }, false, "object:transcript", "transcribe"),
  // Deterministic post-ops (ffmpeg-backed) — same-kind in/out, no coverage row.
  upscale: sig("media", { image: "image[]", video: "video" }, false, "any"),
  "remove-bg": sig("media", { image: "image[]" }, false, "image[]"),
  reframe: sig("media", { image: "image[]", video: "video" }, false, "any"),
  crunch: sig("media", { image: "image[]" }, false, "image[]"),

  // C. Ralphy verbs — open inputs (they read project state, not just ports).
  "ralphy-generate": sig("ralphy-verb", {}, true, "any"),
  "ralphy-render": sig("ralphy-verb", {}, true, "video"),
  "ralphy-eval": sig("ralphy-verb", { video: "video" }, true, "object:eval"),
  "ralphy-repair": sig("ralphy-verb", { eval: "object:eval" }, true, "any"),
  "ralphy-unit": sig("ralphy-verb", {}, true, "unit"),
  "ralphy-captions": sig("ralphy-verb", { audio: "audio", video: "video" }, true, "text"),
  "ralphy-social-copy": sig("ralphy-verb", { unit: "unit" }, true, "text"),

  // D. Ingestion — graph sources, no in-ports; all emit normalized source-item[].
  "web-scrape": sig("ingestion", {}, false, "source-item[]"),
  actor: sig("ingestion", {}, false, "source-item[]"),
  rss: sig("ingestion", {}, false, "source-item[]"),
  "trend-watch": sig("ingestion", {}, false, "source-item[]"),
  http: sig("ingestion", {}, true, "any"),

  // E. Publish.
  publish: sig("publish", { unit: "unit", schedule_at: "object:calendar-slot" }, true, "object:publish-result"),
  "youtube-upload": sig("publish", { video: "video", unit: "unit" }, true, "object:publish-result"),
  "x-post": sig("publish", { text: "text", unit: "unit" }, true, "object:publish-result"),
  "analytics-pull": sig("publish", {}, true, "object:analytics"),

  // F. Control flow — polymorphic plumbing.
  schedule: sig("control-flow", {}, false, "any"),
  "calendar-slot": sig("control-flow", {}, true, "object:calendar-slot"),
  "fan-out": sig("control-flow", {}, true, "any"),
  join: sig("control-flow", {}, true, "any"),
  switch: sig("control-flow", {}, true, "any"),
  gate: sig("control-flow", { verdict: "object:eval" }, true, "any"),
  approval: sig("control-flow", {}, true, "any"),
  "budget-guard": sig("control-flow", {}, true, "any"),
  dedup: sig("control-flow", { items: "source-item[]" }, true, "source-item[]"),

  // G. Data.
  transform: sig("data", {}, true, "any"),
  "template-string": sig("data", {}, true, "text"),
  "artifact-write": sig("data", {}, true, "text"),
};

// ─── Media port contracts (#512) ─────────────────────────────────────────────
//
// The static half of "signature typing means you cannot wire an i2v node
// without an anchor frame": per media node type, which in-ports are REQUIRED,
// and which params can satisfy a port without a wired edge (an inline path /
// prompt in params is as good as an upstream producer). Checked at graph
// import by validateWorkflowGraph (cli/lib/workflow-graph.ts) — a violation
// is a `workflow lint` ERROR, not a runtime surprise — and re-checked by the
// media executors at execution time (cli/lib/workflow/executors/media.ts).

export interface MediaPortContract {
  /** Required in-ports: port name → params keys that satisfy it without a wired edge. */
  required: Record<string, string[]>;
  /** Groups where AT LEAST ONE member port must be wired (or param-fed). */
  oneOf?: Array<Record<string, string[]>>;
}

export const MEDIA_PORT_CONTRACTS: Partial<Record<WorkflowNodeType, MediaPortContract>> = {
  t2i: { required: { prompt: ["prompt", "prompt_file"] } },
  i2i: { required: { images: ["images", "refs"], prompt: ["prompt", "prompt_file"] } },
  t2v: { required: { prompt: ["prompt", "prompt_file"] } },
  i2v: { required: { first_frame: ["first_frame"], prompt: ["prompt", "prompt_file"] } },
  r2v: { required: { refs: ["refs"], prompt: ["prompt", "prompt_file"] } },
  v2v: { required: { video: ["video"], prompt: ["prompt", "prompt_file"] } },
  lipsync: { required: { image: ["image"], audio: ["audio"] } },
  tts: { required: { text: ["text", "text_file"] } },
  "voice-design": { required: { text: ["text", "text_file"] } },
  music: { required: { prompt: ["prompt", "prompt_file"] } },
  sfx: { required: { prompt: ["prompt", "prompt_file"] } },
  transcribe: { required: {}, oneOf: [{ audio: ["audio"], video: ["video"] }] },
  upscale: { required: {}, oneOf: [{ image: ["image"], video: ["video"] }] },
  "remove-bg": { required: { image: ["image"] } },
  reframe: { required: {}, oneOf: [{ image: ["image"], video: ["video"] }] },
  crunch: { required: { image: ["image"] } },
};

/**
 * Authored media port/param name → connector-input param name (the
 * coverage.ts convention, #497). Ports and params keep the graph's snake_case
 * spelling; the coverage matrix speaks GenerateVideoInput / GenerateImageInput
 * field names. Identity for names not listed.
 */
export const MEDIA_COVERAGE_PARAM_ALIASES: Record<string, string> = {
  first_frame: "firstFrame",
  last_frame: "lastFrame",
  ref_videos: "refVideos",
  images: "refs",
  video: "refVideos",
};

/**
 * Media params that are node plumbing, NOT connector-input params — excluded
 * from the #497 coverage scan (they would otherwise read as uncovered params
 * on every bound node).
 */
export const MEDIA_META_PARAM_KEYS = new Set([
  "slot",
  "note",
  "prompt_file",
  "text_file",
  "project",
  "method",
  "aspect",
  "language",
  "backend",
]);

// ─── The node + graph schemas ────────────────────────────────────────────────

/** One graph node — the common envelope + a `type`-discriminated params shape. */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  in: Record<string, string>;
  out?: string | { name: string; type: string };
  params: Record<string, unknown>;
  retry: NodeRetry;
  on_fail: string;
  budget?: { max_usd: number };
  cache: "content-hash" | "none";
  emit: boolean;
}

// Discriminated union over all 48 node types: the envelope is identical, the
// params schema comes from the type's category. Built programmatically so the
// taxonomy above stays the single source of truth.
const nodeMembers = WORKFLOW_NODE_TYPES.map((t) =>
  z.object({
    ...ENVELOPE_FIELDS,
    type: z.literal(t),
    params: PARAMS_BY_CATEGORY[nodeCategory(t)],
  }),
);
export const WorkflowNodeSchema = z.discriminatedUnion(
  "type",
  nodeMembers as unknown as [
    z.ZodDiscriminatedUnionOption<"type">,
    ...z.ZodDiscriminatedUnionOption<"type">[],
  ],
);

export const WORKFLOW_GRAPH_VERSION = "2.0";

export const WorkflowGraphSchema = z.object({
  /** Graph schema version (linear workflows stay "1.x"). */
  version: z.string().default(WORKFLOW_GRAPH_VERSION),
  /** Workflow name (the file basename under workflows/). */
  name: z.string(),
  /** The typed node DAG. Order carries no semantics — edges do. */
  nodes: z.array(WorkflowNodeSchema).default([]),
});

export interface WorkflowGraph {
  version: string;
  name: string;
  nodes: WorkflowNode[];
}

/** Parse an unknown value into a WorkflowGraph (shape only — run validateWorkflowGraph after). */
export function parseWorkflowGraph(raw: unknown): WorkflowGraph {
  return WorkflowGraphSchema.parse(raw) as WorkflowGraph;
}

/** A graph document carries nodes[]; a legacy linear document carries steps[]. */
export function isWorkflowGraphDocument(raw: unknown): boolean {
  return (
    typeof raw === "object" &&
    raw !== null &&
    Array.isArray((raw as Record<string, unknown>).nodes)
  );
}

export type WorkflowDocument =
  | { kind: "linear"; workflow: Workflow }
  | { kind: "graph"; graph: WorkflowGraph };

/**
 * Version-dispatching parse: a linear workflow (#478, version 1.x / steps[])
 * is a degenerate graph and keeps parsing unchanged; nodes[] selects the
 * graph schema (#498).
 */
export function parseWorkflowDocument(raw: unknown): WorkflowDocument {
  if (isWorkflowGraphDocument(raw)) return { kind: "graph", graph: parseWorkflowGraph(raw) };
  return { kind: "linear", workflow: WorkflowSchema.parse(raw) };
}

/** The output port name of a node (explicit `out` name, else "out"). */
export function nodeOutName(node: WorkflowNode): string {
  if (!node.out) return "out";
  return typeof node.out === "string" ? node.out : node.out.name;
}

/**
 * The output port TYPE of a node: an explicit `out.type` wins; a
 * generate-object node is typed by its `schema` param (`object:<ref>`, else
 * `object:*`); otherwise the signature default.
 */
export function nodeOutType(node: WorkflowNode): string {
  if (node.out && typeof node.out !== "string") return node.out.type;
  if (node.type === "generate-object") {
    const schema = node.params?.schema;
    return typeof schema === "string" && schema.length > 0 ? `object:${schema}` : "object:*";
  }
  return NODE_SIGNATURES[node.type].output;
}
