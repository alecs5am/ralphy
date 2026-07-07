// Ralphy-verb node executors (#511) — the production middle of the farm graph:
// ralphy-generate / ralphy-render / ralphy-eval / ralphy-repair / ralphy-unit /
// ralphy-captions / ralphy-social-copy.
//
// THE RULE (issue #511 / AGENTS.md invariant #2): each executor calls the SAME
// library code its CLI verb uses, in-process — never a child `ralphy` process,
// never a new model-call path. Media flows through the provider registry
// (`resolveConnector`), LLM copy through `callLLM()` (inside the social-copy
// lib), transcription through `transcribe()`, renders through the hyperframes
// adapter — so the gen-log, spend ledger, auto-versioning, and append-only
// semantics all come from the existing plumbing, not a reimplementation.
//
// Per-executor contract:
//   • ralphy-generate  — kind/model/provider from params, prompt from the
//     `prompt` in-port or params.prompt/prompt_file, refs through the standard
//     resolution order (`intakePath`: cwd → <project>/ → artifacts/refs/ →
//     workspace shared/). #444 spend gate (`checkSpend`) + the node's own
//     budget.max_usd run BEFORE the paid call; the connector auto-versions
//     output + appends the project gen-log. Output port: artifact path + cost.
//   • ralphy-render    — <project>/index.html via runHyperframesRender; a
//     missing composition or leftover unfilled `{{slot}}` placeholders are
//     STRUCTURED failures naming the file / the slots.
//   • ralphy-eval      — `runWorkspaceEval` filtered to params.gate criteria;
//     persists workspace-eval.json/.md append-only; the output carries a
//     top-level `verdict` so a downstream `gate` node consumes it directly.
//   • ralphy-repair    — `buildRepairPlan` (ZERO model calls); free items may
//     auto-approve per params; PAID items park the run for approval (#473 —
//     paid regen never auto-fires) unless a run approval is already recorded.
//   • ralphy-unit      — `createUnit` (COPY-not-move, append-only .vN dirs);
//     the output `{ projectId, slug }` is exactly what the publish node's
//     unit in-port resolves.
//   • ralphy-captions  — `transcribe()` (scribe) → captions JSON + SRT under
//     artifacts/captions/ (auto-versioned).
//   • ralphy-social-copy — `captionUnit` (#403: callLLM draft + hashtag bank)
//     into unit.json, prior captions archived.
//
// Failure semantics: NodeExecutionError → the runner's on_fail routing;
// RunControlSignal("park-approval") → durable park (never a failure). Budget:
// the runner's run-wide ledger pre-check covers every node; ralphy-generate
// additionally enforces its node budget + the #444 project spend gate with a
// pre-flight estimate because it is the only paid-media node in this family.

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { artifactKindDir, projectDir } from "../../paths.js";
import { logGeneration } from "../../gen-log.js";
import { protectExistingAsset } from "../../providers/shared.js";
import { resolveConnector } from "../../providers/registry.js";
import { emitCoverageWarnings, coverageFor, providersSupporting } from "../../providers/coverage.js";
import {
  effectiveRerouteRules,
  extractPromptSuggestion,
  findRerouteRule,
  parseRerouteAction,
} from "../../providers/reroute-rules.js";
import { classifyFilterError } from "../../errors/taxonomy.js";
import { resolveModelAlias } from "../../model-aliases.js";
import { checkSpend, estimatedCallCostUsd, readRunLedger, activeApproval } from "../../spend.js";
import { intakePath, readPromptOrFile } from "../../path-resolution.js";
import { runHyperframesRender } from "../../render/hyperframes.js";
import { loadWorkspaceEvaluators } from "../../workspace-evaluators.js";
import {
  runWorkspaceEval,
  renderWorkspaceEvalMarkdown,
  WORKSPACE_EVAL_ARTIFACT,
  WORKSPACE_EVAL_REPORT,
} from "../../eval/workspace-evaluators.js";
import { buildRepairPlan, renderRepairPlanMarkdown, type DeepVisionFile } from "../../repair.js";
import type { EvalReport } from "../../eval/types.js";
import { transcribe, type TranscribeBackend, type TranscribeLanguage } from "../../transcribe.js";
import { captionsToSrt } from "../../captions/helpers.js";
import { createUnit, captionUnit, expandFrom, unitsRoot } from "../../unit.js";
import { UNIT_FORMATS, isValidUnitSlug, type UnitManifest } from "../../schemas/unit.js";
import type { Capability, GenerateResult, RalphyConnector } from "../../providers/types.js";
import { NodeExecutionError } from "./types.js";
import type { ExecutorContext, NodeExecutor } from "./types.js";
import { writeApprovalInboxPack, RunControlSignal } from "./control-flow.js";
import type { WorkflowNode } from "../../schemas/workflow.js";

// ─── Shared helpers (also the #512 media-signature executors' plumbing) ──────

/** params.project wins, else the run's project scope. Existence-checked. */
export function resolveProject(node: WorkflowNode, ctx: ExecutorContext): string {
  const id = (node.params.project as string | undefined) ?? ctx.projectId;
  if (!id) {
    throw new NodeExecutionError(
      "project-missing",
      `${node.type} node "${node.id}" needs a project — set params.project or run project-scoped`,
    );
  }
  if (!existsSync(projectDir(id))) {
    throw new NodeExecutionError(
      "project-not-found",
      `${node.type} node "${node.id}": project "${id}" does not exist (expected ${projectDir(id)})`,
    );
  }
  return id;
}

/** Extract a file path from a port value: a string, or an object carrying one. */
export function pathFromValue(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const key of ["path", "localPath", "artifactPath"] as const) {
      if (typeof o[key] === "string" && (o[key] as string).length > 0) return o[key] as string;
    }
  }
  return null;
}

/** Lowercase-kebab slot id (the canonical `normalizeSlot` UX lives in the CLI). */
export function requireSlot(node: WorkflowNode, raw: unknown): string {
  const slot = String(raw ?? "").toLowerCase().replace(/_/g, "-");
  if (!/^[a-z0-9-]+$/.test(slot)) {
    throw new NodeExecutionError(
      "params-invalid",
      `${node.type} node "${node.id}" requires params.slot in lowercase kebab-case (got "${String(raw ?? "")}")`,
    );
  }
  return slot;
}

export function stringList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim().length > 0) {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function readJsonFile(fp: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(fp, "utf8"));
  } catch {
    return null;
  }
}

/** Is the run's recorded approval active (present + not expired)? */
async function hasActiveRunApproval(runId: string): Promise<boolean> {
  const approval = activeApproval(await readRunLedger(runId));
  if (!approval) return false;
  const expired =
    approval.expiry != null &&
    Number.isFinite(Date.parse(approval.expiry)) &&
    Date.now() > Date.parse(approval.expiry);
  return !expired;
}

// ─── ralphy-generate ─────────────────────────────────────────────────────────

export const GENERATE_KINDS = ["image", "video", "voiceover", "music", "sfx"] as const;
export type RalphyGenerateKind = (typeof GENERATE_KINDS)[number];

export const KIND_TO_CAP: Record<RalphyGenerateKind, Capability> = {
  image: "image",
  video: "video",
  voiceover: "voice",
  music: "music",
  sfx: "sfx",
};

/** The asset-manifest slot update `ralphy generate` performs after a call. */
export async function updateManifestSlot(
  projectId: string,
  slot: string,
  entry: { kind: RalphyGenerateKind | "captions"; path: string; model?: string; costUsd?: number; url?: string },
): Promise<void> {
  const manifestPath = path.join(projectDir(projectId), "asset-manifest.json");
  let manifest: { slots: Record<string, unknown> } = { slots: {} };
  const raw = await fs.readFile(manifestPath, "utf8").catch(() => "");
  if (raw) {
    try {
      const j = JSON.parse(raw) as { slots?: Record<string, unknown> };
      manifest = { slots: j.slots ?? {} };
    } catch {
      /* unreadable manifest → rebuild the slots map (pointer file, not media) */
    }
  }
  manifest.slots[slot] = { ...entry, generatedAt: new Date().toISOString() };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
}

type GenerateParams = {
  kind?: string;
  slot?: string;
  model?: string;
  provider?: string;
  prompt?: string;
  prompt_file?: string;
  text?: string;
  text_file?: string;
  refs?: unknown;
  first_frame?: string;
  last_frame?: string;
  negative?: string;
  duration?: number;
  aspect_ratio?: string;
  resolution?: string;
  audio?: boolean;
  voice?: string;
  with_vocals?: boolean;
  size?: string;
  mode?: string;
  note?: string;
};

/**
 * The #444 spend gate + the node's own budget cap, BEFORE the paid call.
 * `checkSpend` is opt-in (no ledger → pass-through), exactly like the verb;
 * there is no `--no-budget` bypass in a headless run — the escape hatch is
 * `ralphy run approve` / `ralphy project approve`, both auditable.
 */
async function gateSpend(
  node: WorkflowNode,
  projectId: string,
  call: { kind: RalphyGenerateKind; model?: string; durationSec?: number; mode?: string },
): Promise<number> {
  const estimatedUsd = estimatedCallCostUsd({
    kind: call.kind,
    model: call.model,
    durationSec: call.durationSec,
  });
  if (node.budget && estimatedUsd > node.budget.max_usd) {
    throw new NodeExecutionError(
      "budget-exceeded",
      `${node.type} node "${node.id}": estimated $${estimatedUsd.toFixed(2)} exceeds the node budget cap $${node.budget.max_usd.toFixed(2)}`,
    );
  }
  const verdict = await checkSpend(projectId, { estimatedUsd, mode: call.mode });
  if (!verdict.allowed) {
    throw new NodeExecutionError(
      "budget-exceeded",
      `${node.type} node "${node.id}": spend gate refused — ${verdict.reason ?? "budget breach"} (record a new approval with \`ralphy project approve\` / \`ralphy run approve\`)`,
    );
  }
  return estimatedUsd;
}

/**
 * One paid media call through the shared generate plumbing (#511/#512): the
 * spec's `invoke` runs against the resolved connector; everything around it —
 * spend gate, connector resolution (with the `resolveMediaConnector` test
 * seam), #497 coverage check, run + project gen-log rows, cost reporting, and
 * the asset-manifest slot update — is THIS function. Both `ralphy-generate`
 * and every media-signature executor (media.ts) go through here, so there is
 * exactly one call path (AGENTS.md invariant #2).
 */
export interface MediaCallSpec {
  kind: RalphyGenerateKind;
  /** Alias-resolved model id (undefined → the connector's own default). */
  model?: string;
  /** Explicit connector id (`--provider` value), else registry default. */
  provider?: string;
  durationSec?: number;
  /** Spend-gate content mode (approval allowedModes). */
  mode?: string;
  note?: string;
  /** Connector-input param names this call passes (#497 coverage names). */
  coverageParams: string[];
  /**
   * Hard-fail BEFORE spending on a param the #497 matrix declares unsupported
   * for the bound (model, capability, provider) — the media-signature nodes'
   * execution-time mirror of the lint check. ralphy-generate keeps the verb's
   * warn-only semantics (false).
   */
  enforceCoverage?: boolean;
  invoke: (
    conn: RalphyConnector,
    common: { projectId: string; slot: string; note: string; overwrite: false },
    overrides?: MediaInvokeOverrides,
  ) => Promise<GenerateResult>;
}

/**
 * Per-attempt overrides the #514 reroute layer passes back into the spec's
 * invoke closure: a `reroute:<model>` action swaps the model, a
 * `resubmit-with:prompt-suggestion` transform swaps the prompt/text.
 */
export interface MediaInvokeOverrides {
  model?: string;
  prompt?: string;
}

/**
 * The #514 filter-aware reroute layer: on a provider content-filter / safety
 * failure, consult the declarative reroute-rules table (built-in + workspace
 * `reroute-rules.json`) and apply the FIRST matching rule — bounded to ONE
 * reroute hop per node execution (a second filter failure propagates into the
 * runner's normal retry / on_fail routing). `transient` classifications are
 * NOT rerouted (retryTransient territory, #005). Returns the recovered
 * GenerateResult, or throws:
 *   • the ORIGINAL error when the failure isn't filter-shaped / no rule matches,
 *   • RunControlSignal("park-approval") for `park-for-human` and for a reroute
 *     target the #497 coverage matrix says can't express the call's params,
 *   • the SECOND error verbatim when the one permitted hop also fails.
 */
async function applyRerouteRules(
  node: WorkflowNode,
  ctx: ExecutorContext,
  spec: MediaCallSpec,
  conn: RalphyConnector,
  err: unknown,
  invokeOnce: (overrides?: MediaInvokeOverrides) => Promise<GenerateResult>,
): Promise<GenerateResult> {
  const message = err instanceof Error ? err.message : String(err);
  const classified = classifyFilterError({
    message,
    modelId: spec.model,
    kind: spec.kind,
  });
  // Not filter-shaped, or transient (retry territory) → not ours to handle.
  if (!classified || classified.filterClass === "transient") throw err;

  const cap = KIND_TO_CAP[spec.kind];
  const rule = findRerouteRule(effectiveRerouteRules(ctx.workspace), {
    model: spec.model,
    capability: cap,
    errorClass: classified.filterClass,
    traits: stringList(node.params.content_traits),
  });
  if (!rule) throw err;
  const action = parseRerouteAction(rule.action);
  if (!action) throw err; // load-time validation makes this unreachable for workspace rules

  const parkForRule = async (reason: string): Promise<never> => {
    await writeApprovalInboxPack(ctx, node.id, reason);
    throw new RunControlSignal(
      "park-approval",
      `${node.type} node "${node.id}": ${reason}`,
    );
  };

  const journalReroute = async (to: string, extra: Record<string, unknown> = {}) => {
    if (!ctx.runId) return;
    const { appendRunEvent } = await import("../../run.js");
    await appendRunEvent(ctx.runId, {
      kind: "node-rerouted",
      node: node.id,
      from: spec.model ?? conn.id,
      to,
      ruleId: rule.id,
      errorClass: classified.filterClass,
      source: rule.source,
      ...extra,
      message: `node "${node.id}" rerouted by rule "${rule.id}" (${classified.filterClass}): ${rule.explanation}`,
    });
  };

  if (action.kind === "park-for-human") {
    return parkForRule(
      `filter failure (${classified.filterClass}) parked for a human by rule "${rule.id}" — ${rule.explanation} [source: ${rule.source}]`,
    );
  }

  if (action.kind === "resubmit-with") {
    if (action.transform !== "prompt-suggestion") throw err; // unknown transform → normal failure
    const suggestion = extractPromptSuggestion(err);
    if (!suggestion) throw err; // no rewrite in the envelope → nothing to resubmit
    await journalReroute(spec.model ?? conn.id, { transform: action.transform });
    return invokeOnce({ prompt: suggestion });
  }

  // reroute:<model> — same connector, one hop, coverage-gated (#497): a
  // target that can't express the call's params parks instead of burning a
  // second call that would 400 / silently drop params.
  const target = action.model;
  const entry = coverageFor(target, cap, conn.id);
  const gaps = entry
    ? spec.coverageParams.filter((p) => !entry.supportedParams.includes(p))
    : []; // unknown triple = no data, NOT unsupported (#497 semantics)
  if (gaps.length > 0) {
    return parkForRule(
      `rule "${rule.id}" wants a reroute to ${target}, but provider "${conn.id}" cannot express param(s) ${gaps.join(", ")} for it (#497) — parked for a human instead. ${rule.explanation} [source: ${rule.source}]`,
    );
  }
  await journalReroute(target);
  return invokeOnce({ model: target });
}

export async function runMediaGeneration(
  node: WorkflowNode,
  ctx: ExecutorContext,
  project: string,
  slot: string,
  spec: MediaCallSpec,
): Promise<{ output: Record<string, unknown>; artifactPath: string }> {
  // Spend gate BEFORE the paid call (#444 + the node envelope budget).
  await gateSpend(node, project, {
    kind: spec.kind,
    model: spec.model,
    durationSec: spec.durationSec,
    mode: spec.mode,
  });

  const resolve = ctx.resolveMediaConnector ?? resolveConnector;
  const cap = KIND_TO_CAP[spec.kind];
  const conn = resolve(cap, spec.provider);

  if (spec.model) {
    if (spec.enforceCoverage) {
      // #512 execution-time hard gate — the same data the lint check reads,
      // but against the ACTUALLY resolved connector (a graph may omit
      // params.provider and land on the registry default).
      const entry = coverageFor(spec.model, cap, conn.id);
      for (const param of spec.coverageParams) {
        if (!entry || !entry.unsupportedParams.includes(param)) continue;
        const alt = providersSupporting(param, cap, entry.family).find(
          (e) => e.provider !== conn.id,
        );
        throw new NodeExecutionError(
          "coverage-unsupported-param",
          `${node.type} node "${node.id}": param "${param}" is NOT supported by provider "${conn.id}" for ${spec.model}${
            alt ? ` — use provider "${alt.provider}" with model "${alt.model}"` : ""
          }`,
        );
      }
    }
    // #497 non-fatal provider-coverage warnings, mirroring the verb.
    emitCoverageWarnings({
      provider: conn.id,
      model: spec.model,
      capability: cap,
      params: spec.coverageParams,
    });
  }

  const note = spec.note ?? `workflow node ${node.id}`;
  // overwrite stays FALSE unconditionally: the farm never force-overwrites —
  // regen is a new .vN version (invariant #14). The connector writes the
  // project gen-log row itself.
  const invokeOnce = (overrides?: MediaInvokeOverrides) =>
    spec.invoke(conn, { projectId: project, slot, note, overwrite: false }, overrides);
  let result: GenerateResult;
  try {
    result = await invokeOnce();
  } catch (err) {
    // #514 filter-aware reroute: one bounded hop per node execution. The
    // spend gate above covered the original call; the single recovery call
    // rides the same approval (its realized cost still lands in both ledgers).
    result = await applyRerouteRules(node, ctx, spec, conn, err, invokeOnce);
  }

  ctx.reportCost(result.costUsd);
  // The RUN gen-log row (runs/<id>/generations.jsonl) — the project row is the
  // connector's own write; both ledgers carry the cost.
  await ctx.log({
    provider: conn.id,
    model: result.model,
    endpoint: spec.kind,
    kind: spec.kind,
    status: "ok",
    input: { node: node.id, project, slot },
    output: { local: result.localPath },
    latency_ms: result.latencyMs,
    cost_usd: result.costUsd,
    note,
  });
  await updateManifestSlot(project, slot, {
    kind: spec.kind,
    path: result.localPath,
    model: result.model,
    costUsd: result.costUsd,
    url: result.url,
  });

  return {
    output: {
      projectId: project,
      slot,
      path: result.localPath,
      model: result.model,
      costUsd: result.costUsd,
      latencyMs: result.latencyMs,
    },
    artifactPath: result.localPath,
  };
}

export const ralphyGenerateExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as GenerateParams;
  const project = resolveProject(node, ctx);
  const kind = String(p.kind ?? "") as RalphyGenerateKind;
  if (!(GENERATE_KINDS as readonly string[]).includes(kind)) {
    throw new NodeExecutionError(
      "params-invalid",
      `ralphy-generate node "${node.id}" requires params.kind in ${GENERATE_KINDS.join("|")}${
        String(p.kind) === "captions" ? " — SRT captions are the ralphy-captions node type" : ""
      }`,
    );
  }
  const slot = requireSlot(node, p.slot);

  // Prompt / text: the wired in-port wins, else params (inline or file ref
  // resolved project-relative — the #025 intake path).
  const portText =
    typeof ctx.inputs.prompt === "string" && ctx.inputs.prompt.trim().length > 0
      ? ctx.inputs.prompt
      : typeof ctx.inputs.text === "string" && ctx.inputs.text.trim().length > 0
        ? ctx.inputs.text
        : null;
  const text =
    portText ??
    (await readPromptOrFile({
      prompt: kind === "voiceover" ? p.text : p.prompt,
      promptFile: kind === "voiceover" ? p.text_file : p.prompt_file,
      projectId: project,
    }));
  if (!text) {
    throw new NodeExecutionError(
      "prompt-missing",
      `ralphy-generate node "${node.id}" (${kind}) has no ${kind === "voiceover" ? "text" : "prompt"} — wire the \`prompt\` in-port or set params.${kind === "voiceover" ? "text / text_file" : "prompt / prompt_file"}`,
    );
  }

  // Refs: params + the `refs` in-port, each through the STANDARD resolution
  // order (cwd → <project>/ → artifacts/refs/ → workspace shared/, #025/#108).
  const rawRefs = [
    ...stringList(p.refs),
    ...stringList(ctx.inputs.refs).flatMap((r) => (pathFromValue(r) ? [pathFromValue(r)!] : [])),
  ];
  const refs = rawRefs.length > 0 ? rawRefs.map((r) => intakePath(r, project, "ref")) : undefined;
  const firstFrame = (pathFromValue(ctx.inputs.first_frame) ?? p.first_frame)
    ? intakePath(pathFromValue(ctx.inputs.first_frame) ?? p.first_frame!, project, "first-frame")
    : undefined;
  const lastFrame = (pathFromValue(ctx.inputs.last_frame) ?? p.last_frame)
    ? intakePath(pathFromValue(ctx.inputs.last_frame) ?? p.last_frame!, project, "last-frame")
    : undefined;

  const model = p.model ? (resolveModelAlias(p.model) ?? p.model) : undefined;
  const durationSec = typeof p.duration === "number" ? p.duration : undefined;
  if ((kind === "video" || kind === "music") && durationSec === undefined) {
    throw new NodeExecutionError(
      "params-invalid",
      `ralphy-generate node "${node.id}" (${kind}) requires params.duration (seconds)`,
    );
  }
  if (kind === "voiceover" && !p.voice) {
    throw new NodeExecutionError(
      "params-invalid",
      `ralphy-generate node "${node.id}" (voiceover) requires params.voice (ElevenLabs voice id)`,
    );
  }

  // The shared generate core (#511/#512): spend gate → connector → coverage →
  // call → gen-log → manifest. Warn-only coverage — the verb's semantics.
  return runMediaGeneration(node, ctx, project, slot, {
    kind,
    model,
    provider: p.provider,
    durationSec,
    mode: p.mode,
    note: p.note,
    coverageParams: [
      ...(refs && refs.length > 0 ? ["refs"] : []),
      ...(firstFrame ? ["firstFrame"] : []),
      ...(lastFrame ? ["lastFrame"] : []),
      ...(p.audio ? ["generateAudio"] : []),
    ],
    invoke: async (conn, common, o): Promise<GenerateResult> => {
      const m = o?.model ?? model;
      const txt = o?.prompt ?? text;
      switch (kind) {
        case "image":
          return conn.generateImage!({
            ...common,
            prompt: txt,
            model: m,
            refs,
            size: p.size,
            negativePrompt: p.negative,
          });
        case "video":
          return conn.generateVideo!({
            ...common,
            prompt: txt,
            model: m,
            durationSec: durationSec!,
            firstFrame,
            lastFrame,
            refs,
            aspectRatio: p.aspect_ratio as never,
            resolution: p.resolution as never,
            generateAudio: p.audio,
          });
        case "voiceover":
          return conn.generateVoiceover!({
            ...common,
            text: txt,
            voiceId: String(p.voice),
            modelId: m,
          });
        case "music":
          return conn.generateMusic!({
            ...common,
            prompt: txt,
            durationSec: durationSec!,
            forceInstrumental: !p.with_vocals,
          });
        case "sfx":
          return conn.generateSfx!({
            ...common,
            prompt: txt,
            durationSec,
          });
      }
    },
  });
};

// ─── ralphy-render ───────────────────────────────────────────────────────────

const SLOT_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

type RenderParams = {
  project?: string;
  composition?: string;
  output?: string;
  fps?: number;
  quality?: "draft" | "standard" | "high";
  resolution?: string;
  workers?: string | number;
  variables?: Record<string, unknown>;
};

export const ralphyRenderExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as RenderParams;
  const project = resolveProject(node, ctx);
  const projDir = projectDir(project);
  const compositionRel = p.composition ?? "index.html";
  const compositionAbs = path.join(projDir, compositionRel);
  if (!existsSync(compositionAbs)) {
    throw new NodeExecutionError(
      "composition-missing",
      `ralphy-render node "${node.id}": composition "${compositionRel}" not found at ${compositionAbs} — the project has no HyperFrames composition to render`,
    );
  }

  // Unparametrized-slot gate: leftover `{{slot}}` placeholders that neither
  // params.variables nor a wired in-port fills are a STRUCTURED failure that
  // NAMES the slots (export-readiness: compositions must be parametrized).
  const html = await fs.readFile(compositionAbs, "utf8");
  const variables: Record<string, unknown> = { ...(p.variables ?? {}) };
  for (const [port, value] of Object.entries(ctx.inputs)) {
    if (["string", "number", "boolean"].includes(typeof value)) variables[port] = value;
  }
  const unfilled = [
    ...new Set([...html.matchAll(SLOT_RE)].map((m) => m[1]!)),
  ].filter((slot) => variables[slot] === undefined);
  if (unfilled.length > 0) {
    throw new NodeExecutionError(
      "unparametrized-slots",
      `ralphy-render node "${node.id}": composition "${compositionRel}" has unparametrized slots: ${unfilled
        .map((s) => `{{${s}}}`)
        .join(", ")} — fill them via params.variables or wired in-ports`,
    );
  }

  const renderDir = path.join(projDir, "render");
  await fs.mkdir(renderDir, { recursive: true });
  const outputPath = p.output ? path.resolve(p.output) : path.join(renderDir, "final.mp4");
  // #118 append-only: archive the prior master to final.v{N}.mp4 first.
  await protectExistingAsset(outputPath, false);

  const t0 = Date.now();
  const render = ctx.hyperframesRender ?? runHyperframesRender;
  const rr = await render({
    projectDir: projDir,
    outputPath,
    composition: p.composition,
    fps: p.fps,
    quality: p.quality,
    resolution: p.resolution,
    workers: p.workers,
    variables: Object.keys(variables).length > 0 ? variables : undefined,
    quiet: true,
  });
  if (rr.exitCode !== 0) {
    await logGeneration(project, {
      provider: "other",
      model: "hyperframes-render",
      endpoint: "hyperframes-render",
      kind: "video",
      input: { project, node: node.id, composition: compositionRel },
      status: "error",
      error: rr.stderr.slice(-500),
      latency_ms: Date.now() - t0,
      cost_usd: 0,
      note: "render failed (workflow node)",
    });
    throw new NodeExecutionError(
      "render-failed",
      `ralphy-render node "${node.id}": hyperframes render failed (exit ${rr.exitCode}): ${rr.stderr.slice(-300)}`,
    );
  }

  const bytes = await fs.stat(outputPath).then((s) => s.size).catch(() => 0);
  await logGeneration(project, {
    provider: "other",
    model: "hyperframes-render",
    endpoint: "hyperframes-render",
    kind: "video",
    input: { project, node: node.id, composition: compositionRel },
    output: { local: outputPath, bytes },
    status: "ok",
    latency_ms: Date.now() - t0,
    cost_usd: 0,
    note: `render (workflow node ${node.id})`,
  });

  return { output: { projectId: project, path: outputPath, bytes }, artifactPath: outputPath };
};

// ─── ralphy-eval ─────────────────────────────────────────────────────────────

type EvalParams = {
  project?: string;
  workspace?: string;
  /** Criterion ids to score (the node's gate). Empty → the full rubric. */
  gate?: unknown;
  criteria?: unknown;
  no_vision?: boolean;
  model?: string;
  video?: string;
};

export const ralphyEvalExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as EvalParams;
  const project = resolveProject(node, ctx);
  const workspace = p.workspace ?? ctx.workspace;

  const config = await loadWorkspaceEvaluators(workspace);
  if (!config || config.criteria.length === 0) {
    throw new NodeExecutionError(
      "evaluators-missing",
      `ralphy-eval node "${node.id}": workspace "${workspace}" has no evaluator rubric (evaluators.json with criteria) — an eval gate without a rubric would silently pass everything`,
    );
  }

  const criteria = [...stringList(p.criteria), ...stringList(p.gate)];
  const video = pathFromValue(ctx.inputs.video) ?? p.video;

  const result = await runWorkspaceEval(project, {
    workspace,
    noVision: p.no_vision === true,
    model: p.model,
    video: video ?? undefined,
    criteria: criteria.length > 0 ? criteria : undefined,
  });

  // Append-only persistence, mirroring `ralphy workspace eval`.
  const dir = projectDir(project);
  const jsonPath = path.join(dir, WORKSPACE_EVAL_ARTIFACT);
  await protectExistingAsset(jsonPath, false);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2));
  const mdPath = path.join(dir, WORKSPACE_EVAL_REPORT);
  await protectExistingAsset(mdPath, false);
  await fs.writeFile(mdPath, renderWorkspaceEvalMarkdown(result));

  // Top-level `verdict` so a downstream `gate` node reads it with the default
  // verdict_field. The full scorecard rides along for richer consumers.
  return {
    output: {
      verdict: result.overall.verdict,
      score: result.overall.score,
      summary: result.overall.summary,
      workspace: result.workspace,
      projectId: result.projectId,
      criteria: result.criteria.map((c) => ({ id: c.id, verdict: c.verdict, score: c.score })),
      jsonPath,
      mdPath,
    },
    artifactPath: jsonPath,
  };
};

// ─── ralphy-repair ───────────────────────────────────────────────────────────

type RepairParams = {
  project?: string;
  /** Auto-approve FREE (cost-0) items so the editor loop may apply them. Default true. */
  apply_free?: boolean;
};

export const ralphyRepairExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as RepairParams;
  const project = resolveProject(node, ctx);
  const dir = projectDir(project);

  // Eval source: the wired `eval` in-port (object or JSON string) wins, else
  // the project's persisted eval.json — same inputs as `ralphy project repair-plan`.
  const raw = ctx.inputs.eval;
  const fromPort = typeof raw === "string" ? safeParse(raw) : raw;
  const evalReport = (fromPort && typeof fromPort === "object"
    ? fromPort
    : await readJsonFile(path.join(dir, "eval.json"))) as EvalReport | null;
  if (!evalReport) {
    throw new NodeExecutionError(
      "eval-missing",
      `ralphy-repair node "${node.id}": no eval report — wire the \`eval\` in-port or run an eval that writes ${path.join(dir, "eval.json")}`,
    );
  }
  const deepVision = (await readJsonFile(
    path.join(dir, "eval-deep-vision.json"),
  )) as DeepVisionFile | null;

  // Deterministic plan — ZERO model calls (#409).
  const plan = buildRepairPlan(evalReport, deepVision);

  // #473 semantics: FREE fixes may auto-loop; PAID regen never auto-fires.
  const applyFree = p.apply_free !== false;
  const freeItems = plan.items.filter((it) => it.costEstimate === 0);
  const paidItems = plan.items.filter((it) => it.costEstimate > 0);
  if (applyFree) for (const it of freeItems) it.approvalState = "approved";
  // A recorded run approval (#482, `ralphy run approve`) IS the paid approval.
  const paidApproved =
    paidItems.length > 0 && !!ctx.runId && (await hasActiveRunApproval(ctx.runId));
  if (paidApproved) for (const it of paidItems) it.approvalState = "approved";

  // Persist append-only (auto-versions), mirroring the verb — BEFORE any park
  // so the plan survives the parked run.
  const jsonPath = path.join(dir, "repair-plan.json");
  const mdPath = path.join(dir, "REPAIR_PLAN.md");
  await protectExistingAsset(jsonPath, false);
  await protectExistingAsset(mdPath, false);
  await fs.writeFile(jsonPath, JSON.stringify(plan, null, 2) + "\n");
  await fs.writeFile(mdPath, renderRepairPlanMarkdown(plan));

  // Paid items inside a farm run without an approval → park for a human
  // (the #473 approval-park, through the same inbox mechanism as `approval`).
  if (paidItems.length > 0 && ctx.runId && !paidApproved) {
    const reason = `repair plan for ${project} carries ${paidItems.length} PAID item(s) (~$${plan.totalCostEstimate.toFixed(2)}) — paid regeneration needs a human approval (#473)`;
    await writeApprovalInboxPack(ctx, node.id, reason);
    throw new RunControlSignal("park-approval", `ralphy-repair node "${node.id}": ${reason}`);
  }

  return {
    output: {
      projectId: project,
      sourceVerdict: plan.sourceVerdict,
      items: plan.items.length,
      freeApproved: applyFree ? freeItems.length : 0,
      paidItems: paidItems.length,
      paidApproved,
      totalCostEstimate: plan.totalCostEstimate,
      jsonPath,
    },
    artifactPath: jsonPath,
  };
};

// ─── ralphy-unit ─────────────────────────────────────────────────────────────

type UnitParams = {
  project?: string;
  slug?: string;
  format?: string;
  /** Glob relative to the project dir (same as `ralphy unit create --from`). */
  from?: string;
  title?: string;
  blurb?: string;
  template?: string;
  style?: string;
  recipes?: unknown;
  assets?: unknown;
};

export const ralphyUnitExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as UnitParams;
  const project = resolveProject(node, ctx);
  const projDir = projectDir(project);

  const slug = String(p.slug ?? "");
  if (!isValidUnitSlug(slug)) {
    throw new NodeExecutionError(
      "params-invalid",
      `ralphy-unit node "${node.id}" requires a kebab-case params.slug (got "${slug}")`,
    );
  }
  const format = String(p.format ?? "");
  if (!(UNIT_FORMATS as readonly string[]).includes(format)) {
    throw new NodeExecutionError(
      "params-invalid",
      `ralphy-unit node "${node.id}": params.format "${format}" is not one of ${UNIT_FORMATS.join(", ")}`,
    );
  }

  // Selected media: the --from glob + every wired in-port value that resolves
  // to a file inside the project tree (the "form the unit from selected ports"
  // half). COPY semantics — sources stay untouched (createUnit, #069).
  const sources: string[] = p.from ? expandFrom(projDir, String(p.from)) : [];
  for (const value of Object.values(ctx.inputs)) {
    const fp = pathFromValue(value);
    if (!fp) continue;
    const abs = path.resolve(fp);
    if (!abs.startsWith(projDir + path.sep) || !existsSync(abs)) continue;
    const rel = path.relative(projDir, abs).split(path.sep).join("/");
    if (!sources.includes(rel)) sources.push(rel);
  }
  if (sources.length === 0) {
    throw new NodeExecutionError(
      "no-media",
      `ralphy-unit node "${node.id}": nothing to package — params.from matched no files and no in-port carries a project file path`,
    );
  }

  const provenance = {
    ...(p.template && { template: String(p.template) }),
    ...(p.style && { style: String(p.style) }),
    ...(stringList(p.recipes).length && { recipes: stringList(p.recipes) }),
    ...(stringList(p.assets).length && { assets: stringList(p.assets) }),
  };
  const created = await createUnit({
    projectId: project,
    slug,
    format: format as UnitManifest["format"],
    sources,
    title: p.title,
    blurb: p.blurb,
    provenance: Object.keys(provenance).length ? provenance : undefined,
  });

  // `{ projectId, slug }` is the exact unit ref the publish node resolves.
  return {
    output: {
      projectId: project,
      slug,
      dir: created.dirName,
      format,
      media: created.manifest.media.length,
      path: created.unitDir,
      versioned: created.dirName !== slug,
    },
    artifactPath: path.join(created.unitDir, "unit.json"),
  };
};

// ─── ralphy-captions ─────────────────────────────────────────────────────────

type CaptionsParams = {
  project?: string;
  audio?: string;
  slot?: string;
  language?: string;
  backend?: string;
};

export const ralphyCaptionsExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as CaptionsParams;
  const project = resolveProject(node, ctx);

  const audioRef = pathFromValue(ctx.inputs.audio) ?? p.audio;
  if (!audioRef) {
    throw new NodeExecutionError(
      "params-invalid",
      `ralphy-captions node "${node.id}" needs audio — wire the \`audio\` in-port or set params.audio`,
    );
  }
  const audioPath = intakePath(audioRef, project, "audio");

  const slot = requireSlot(
    node,
    p.slot ?? `captions-${path.basename(audioPath, path.extname(audioPath))}`,
  );
  const t0 = Date.now();
  // The existing captions path: transcribe() (Scribe word-level by default).
  const result = await transcribe({
    audioPath,
    language: (p.language ?? "auto") as TranscribeLanguage,
    backend: (p.backend ?? "elevenlabs") as TranscribeBackend,
  });

  // Persist JSON + SRT under artifacts/captions/, auto-versioned (invariant #14).
  const outDir = artifactKindDir(project, "captions");
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${slot}.json`);
  const srtPath = path.join(outDir, `${slot}.srt`);
  await protectExistingAsset(jsonPath, false);
  await protectExistingAsset(srtPath, false);
  await fs.writeFile(
    jsonPath,
    JSON.stringify(
      {
        captions: result.captions,
        language: result.language,
        languageProbability: result.languageProbability,
        durationSec: result.audioDurationSec,
        slot,
        model: result.model,
        backend: result.backend,
      },
      null,
      2,
    ),
    "utf8",
  );
  await fs.writeFile(srtPath, captionsToSrt(result.captions), "utf8");

  await logGeneration(project, {
    provider: result.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
    model: result.model,
    endpoint: result.model,
    kind: "text",
    slot,
    input: { slot, project, audio: audioPath, backend: result.backend, node: node.id },
    output: { local: jsonPath, bytes: result.captions.length },
    status: "ok",
    latency_ms: Date.now() - t0,
    cost_usd: result.costUsd,
    note: `workflow node ${node.id}`,
  });
  ctx.reportCost(result.costUsd);
  await updateManifestSlot(project, slot, {
    kind: "captions",
    path: jsonPath,
    model: result.model,
    costUsd: result.costUsd,
  });

  // Output port is "text": the SRT path (the JSON sidecar rides on the same dir).
  return { output: srtPath, artifactPath: srtPath };
};

// ─── ralphy-social-copy ──────────────────────────────────────────────────────

type SocialCopyParams = {
  project?: string;
  unit_slug?: string;
  slug?: string;
  language?: string;
  niche?: string;
  brief?: string;
  force?: boolean;
};

/** Resolve the target unit — the same shapes the publish node accepts. */
function resolveUnitTarget(
  node: WorkflowNode,
  ctx: ExecutorContext,
): { projectId: string; slug: string } {
  const raw = ctx.inputs.unit;
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const projectId = (o.projectId ?? o.project) as string | undefined;
    const slug = (o.slug ?? o.unitSlug) as string | undefined;
    if (projectId && slug) return { projectId, slug };
  }
  if (typeof raw === "string" && raw.includes("/")) {
    const [projectId, ...rest] = raw.split("/");
    return { projectId: projectId!, slug: rest.join("/") };
  }
  const p = node.params as SocialCopyParams;
  const projectId = p.project ?? ctx.projectId;
  const slug = p.unit_slug ?? p.slug;
  if (projectId && slug) return { projectId, slug };
  throw new NodeExecutionError(
    "params-invalid",
    `ralphy-social-copy node "${node.id}" needs a unit — wire the \`unit\` in-port or set params.project + params.unit_slug`,
  );
}

export const ralphySocialCopyExecutor: NodeExecutor = async (node, ctx) => {
  const p = node.params as SocialCopyParams;
  const ref = resolveUnitTarget(node, ctx);

  // The #403 caption path: callLLM() draft + the deterministic hashtag bank,
  // append-only into unit.json (prior captions archived).
  const result = await captionUnit({
    projectId: ref.projectId,
    dirName: ref.slug,
    language: p.language ?? "English",
    niche: p.niche,
    brief: p.brief,
    force: p.force === true,
  });
  if (!result) {
    throw new NodeExecutionError(
      "unit-not-found",
      `ralphy-social-copy node "${node.id}": unit "${ref.slug}" not found in project "${ref.projectId}"`,
    );
  }

  const unitJson = path.join(unitsRoot(projectDir(ref.projectId)), ref.slug, "unit.json");
  if (result.kind === "skipped") {
    // Idempotent on resume: an already-captioned unit completes, not fails.
    return {
      output: { projectId: ref.projectId, slug: ref.slug, skipped: result.reason },
      artifactPath: unitJson,
    };
  }
  const caption = result.manifest.caption!;
  return {
    output: {
      projectId: ref.projectId,
      slug: ref.slug,
      language: caption.language,
      niche: caption.niche,
      hashtags: caption.hashtags,
      caption: caption.platform,
      reDrafted: result.reDrafted,
    },
    artifactPath: unitJson,
  };
};
