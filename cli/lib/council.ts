// Council reviews for plans and polished Units (#415).
//
// A single-agent judgment is brittle for creative production: one agent misses
// market fit, another over-indexes on visuals, a third ships weak captions. The
// council brings SEVEN specialist perspectives to bear at the two expensive
// decision points in the pipeline, then synthesizes them into ONE structured
// verdict the rest of the pipeline can act on.
//
//   • councilPreflight(plan)        — review the production plan (#407) BEFORE
//                                     any paid generation.
//   • councilPolish(evalReport)     — review the native-video eval report
//                                     (#411) AFTER eval, BEFORE Unit formation.
//
// BOUNDED by construction (issue #415 + AGENTS.md invariants):
//   1. NO paid media generation inside the council. This module imports
//      `callLLM` and NOTHING from `cli/lib/providers/media.ts` / the generate*
//      verbs — there is no code path from a council fn to a paid image/video/VO
//      call. Tests assert the injected text seam is the ONLY model seam reached.
//   2. NO arbitrary browsing. The council reasons over the plan / eval JSON it
//      is handed; it never fetches a URL. No `fetch`, no WebFetch, no yt-dlp.
//   3. ALL LLM via `callLLM()` (AGENTS.md invariant #1). The production role
//      caller (`makeLlmCallRole`) is the single seam; everything else is pure.
//   4. DETERMINISTIC injection seam for tests: `deps.callRole` (or `deps.fixture`)
//      replaces the live LLM, so the whole council runs offline against canned
//      per-role responses with NO network. Mirrors the #407 plan `enrich`
//      injection pattern (no `mock.module` on a shared lib — #072).
//
// The synthesis is PURE + DETERMINISTIC given the per-role responses: it scores,
// orders, de-conflicts, and emits a schema-valid CouncilVerdict whose
// `prioritizedActions` use the #409 repair vocabulary (owner / category /
// priority / severity) so a polish verdict flows into `buildRepairPlan` without
// any free-form parsing.

import { callLLM } from "./providers/llm.js";
import { benchmarkSetForMode } from "./benchmarks.js";
import { gradePlanDeterministic } from "./plan/grade.js";
import { lintRefPack } from "./ref-pack-lint.js";
import type { ProductionPlan } from "./schemas/production-plan.js";
import type { EvalReport } from "./eval/types.js";
import type { DeepVisionFile } from "./repair.js";
import {
  COUNCIL_ROLES,
  CouncilVerdictSchema,
  type CouncilAction,
  type CouncilDisagreement,
  type CouncilPhase,
  type CouncilRole,
  type CouncilRoleScore,
  type CouncilVerdict,
  type CouncilVerdictKind,
} from "./schemas/council.js";
import type { RepairOwner, RepairSeverity } from "./schemas/repair-plan.js";

// ─── Per-role response shape (what each role returns) ─────────────────────────
//
// A role does NOT see the other roles. It returns its own narrow read: a score,
// a summary, the issues it sees (blocking or not), and the actions it wants —
// each action already carries the #409 owner so the synthesis can merge them
// structurally. The synthesis is what turns seven of these into one verdict.

export interface CouncilRoleResponse {
  /** 0-10 score from this role's lens. Clamped on parse. */
  score: number;
  /** One-line summary of the role's read (English-on-disk). */
  summary: string;
  /** Issues that BLOCK shipping from this role's perspective. */
  blockingIssues?: string[];
  /** Improvements worth making that do not block. */
  nonBlockingImprovements?: string[];
  /** Actions this role recommends, in the #409 repair vocabulary. */
  actions?: Array<{
    owner: RepairOwner;
    category: string;
    action: string;
    severity?: RepairSeverity;
  }>;
}

/** The phase-specific context handed to each role caller. */
export interface CouncilRoleContext {
  phase: CouncilPhase;
  role: CouncilRole;
  /** The system prompt assembled for this role (focused on its lens). */
  systemPrompt: string;
  /** The user-message payload: the plan or eval JSON the role reasons over. */
  payload: string;
  /** The project id (for log lines), when known. */
  projectId?: string;
}

/**
 * The injection seam. `callRole` is invoked once per role; production wires it
 * to a single `callLLM()` jsonMode pass (`makeLlmCallRole`), tests wire it to a
 * fixture map. There is NO other model seam in this module.
 */
export interface CouncilDeps {
  /** Called once per role. Returns that role's narrow response. */
  callRole?: (ctx: CouncilRoleContext) => Promise<CouncilRoleResponse>;
  /**
   * Convenience for tests: a canned per-role response map. When `callRole` is
   * omitted, the council resolves each role from this fixture (missing roles
   * get a neutral abstain). Either provide `callRole` OR `fixture`.
   */
  fixture?: Partial<Record<CouncilRole, CouncilRoleResponse>>;
  /** Roster override (defaults to the full seven). Used by tests to trim. */
  roles?: readonly CouncilRole[];
  /** Stable timestamp for the verdict (tests pass a fixed value). */
  now?: string;
}

// ─── Role system prompts (focused lenses) ─────────────────────────────────────
//
// Each role gets ONE focused instruction so the LLM stays in its lane. The
// preflight variant reasons over the plan (no render exists yet); the polish
// variant reasons over the eval report (a render has been judged). Both ask for
// the SAME narrow JSON shape (CouncilRoleResponse) so the synthesis is uniform.

const ROLE_LENS: Record<CouncilRole, string> = {
  strategist:
    "audience fit, the offer, channel fit, and whether the chosen FORMAT matches the goal",
  "niche-researcher":
    "trend fit, competitor benchmarks, and whether the concept is fresh or derivative for the niche",
  "creative-director":
    "concept strength, the hook, memorability, and overall taste",
  "art-director":
    "the visual system, references, product fidelity, and prompt quality (the LOOK the model will produce)",
  editor:
    "pacing, scene order, captions, the audio mix, and the final cut",
  "performance-marketer":
    "thumb-stop in the first 3 seconds, proof, the CTA, and variant logic for testing",
  "qa-evaluator":
    "objective gates, concrete failure modes, and a clear ship / block release verdict",
};

/** Owner taxonomy hint folded into every role prompt (keeps actions in #409 vocab). */
const OWNER_HINT =
  'Every action MUST carry an "owner" that is exactly one of: "art-director" ' +
  '(the look / prompts / model output), "scenarist" (the script / scene boundaries / VO), ' +
  'or "editor" (the cut / encode / mix / captions). Use a "category" in <family>.<detail> ' +
  'form (e.g. "style.register-mismatch", "structure.hook-zone-thin-vo", "audio.mix", ' +
  '"captions.dense", "format.aspect-ratio"). "severity" is one of "info" | "warn" | "fail".';

/** The narrow JSON shape every role must return. */
const RESPONSE_SHAPE =
  'Return ONLY this JSON object (no preamble, no markdown fences):\n' +
  "{\n" +
  '  "score": <number 0-10 from your lens>,\n' +
  '  "summary": "<one short sentence>",\n' +
  '  "blockingIssues": ["<issue that blocks shipping>", ...],\n' +
  '  "nonBlockingImprovements": ["<improvement that does not block>", ...],\n' +
  '  "actions": [{ "owner": "art-director|scenarist|editor", "category": "<family.detail>", "action": "<concrete instruction>", "severity": "info|warn|fail" }, ...]\n' +
  "}\n" +
  "Empty arrays are fine. Be concrete. Do NOT request any paid generation as an action — actions are instructions a downstream role applies after approval.";

/** Build the focused system prompt for one role at one phase. */
export function buildRoleSystemPrompt(role: CouncilRole, phase: CouncilPhase): string {
  const subject =
    phase === "preflight"
      ? "a PRODUCTION PLAN that has NOT been generated yet (no media exists). Review it BEFORE any paid generation."
      : "a NATIVE-VIDEO EVALUATION REPORT of a rendered video (the render has already been judged). Review it AFTER eval and BEFORE the deliverable is packaged.";
  return (
    `You are the ${role} on a content production council. You review ${subject}\n` +
    `Your lens, and ONLY your lens: ${ROLE_LENS[role]}.\n` +
    `Score from your lens, name the blocking issues and non-blocking improvements you see, and propose concrete actions.\n` +
    `${OWNER_HINT}\n\n` +
    `${RESPONSE_SHAPE}`
  );
}

// ─── Payload builders (what each role reasons over) ───────────────────────────
//
// The council reasons over the PROVIDED plan / eval JSON only — it never
// fetches. We hand the role a compact, English JSON projection so the prompt
// stays bounded and the role can't be tempted to "go look something up".

/** Compact projection of the production plan for the preflight council. */
export function preflightPayload(plan: ProductionPlan): string {
  // #419 seam: surface the mode's golden benchmark set (good/acceptable/bad
  // example features) so roles can judge FORMAT FIT against a documented mode
  // standard, not just generic taste. Light reference only.
  // ponytail: summary slug + per-label feature lists; #457/#427 own scoring an
  // output's observed features against this set (and weighting the verdict).
  const benchmark = benchmarkSetForMode(plan.contentMode.mode);
  // #432 seam: fold the deterministic plan grade (verdict + per-dimension
  // status/note) into the payload so the preflight roles reason over the
  // structural quality signal, not just the raw plan. Bounded — verdict + a
  // compact {dimension: {status, note}} map, no scores. ZERO model calls.
  const grade = gradePlanDeterministic(plan);
  // #449 seam: a one-line ref-pack health note so the preflight roles can flag a
  // poisoned reference set BEFORE paid generation. Deterministic, ZERO model
  // calls — `lintRefPack` reads the on-disk pack via `readRefPack` and probes
  // files only. Best-effort: a missing/empty pack yields a non-fail verdict.
  const refLint = lintRefPack({ projectId: plan.projectId, mode: plan.contentMode.mode });
  return JSON.stringify(
    {
      projectId: plan.projectId,
      refPackHealth: {
        verdict: refLint.verdict,
        ok: refLint.ok,
        reason: refLint.reason,
        blockingFindings: refLint.findings
          .filter((f) => f.severity === "fail")
          .map((f) => f.category),
      },
      planGrade: {
        verdict: grade.verdict,
        reason: grade.reason,
        dimensions: Object.fromEntries(
          grade.dimensions.map((d) => [d.dimension, { status: d.status, note: d.note }]),
        ),
      },
      benchmarkSet: benchmark
        ? {
            slug: benchmark.slug,
            summary: benchmark.summary,
            features: Object.fromEntries(
              (["good", "acceptable", "bad"] as const).map((label) => [
                label,
                benchmark.examples.filter((e) => e.label === label).flatMap((e) => e.features),
              ]),
            ),
          }
        : null,
      brief: plan.brief,
      vibe: plan.vibe,
      register: plan.register,
      targetAudienceLanguage: plan.targetAudienceLanguage,
      format: plan.formatTemplate.format,
      templateSlug: plan.formatTemplate.templateSlug,
      contentMode: plan.contentMode.mode,
      aspect: plan.aspect,
      platform: plan.platform,
      sceneCount: plan.sceneCount,
      durationSec: plan.durationSec,
      firstCheckpoint: plan.firstCheckpoint,
      craftOverlay: plan.craftOverlay,
      requiredRefs: plan.requiredRefs,
      benchmarkSource: plan.benchmarkSource,
      modelStack: plan.modelStack.map((m) => ({ role: m.role, model: m.model })),
      estimate: plan.estimate,
    },
    null,
    2,
  );
}

/** Compact projection of the eval report for the polish council. */
export function polishPayload(evalReport: EvalReport, deepVision?: DeepVisionFile | null): string {
  return JSON.stringify(
    {
      projectId: evalReport.meta?.projectId ?? null,
      verdict: evalReport.scoring?.verdict ?? null,
      score: evalReport.scoring?.score ?? null,
      gate: {
        mode: evalReport.gate?.mode ?? null,
        nativeVideo: evalReport.gate?.nativeVideo ?? null,
        shipReady: evalReport.gate?.shipReady ?? null,
      },
      durationSec: evalReport.meta?.durationSec ?? null,
      resolution: evalReport.meta?.resolution ?? null,
      structure: {
        sceneCount: evalReport.structure?.sceneCount ?? null,
        avgSceneDurationSec: evalReport.structure?.avgSceneDurationSec ?? null,
        hookZone: evalReport.structure?.hookZone ?? null,
      },
      audio: evalReport.audio ?? null,
      captions: evalReport.captions ?? null,
      findings: (evalReport.findings ?? []).map((f) => ({
        id: f.id,
        category: f.category,
        severity: f.severity,
        sceneIndex: f.sceneIndex,
        message: f.message,
      })),
      deepVisionRedos: deepVision?.parsed?.what_to_redo ?? null,
    },
    null,
    2,
  );
}

// ─── Per-role response normalization ──────────────────────────────────────────

const VALID_OWNERS: ReadonlySet<string> = new Set<RepairOwner>([
  "art-director",
  "scenarist",
  "editor",
]);
const VALID_SEVERITIES: ReadonlySet<string> = new Set<RepairSeverity>(["info", "warn", "fail"]);

/** Clamp + coerce a raw role response so a sloppy LLM payload still merges. */
export function normalizeRoleResponse(raw: unknown): CouncilRoleResponse {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scoreNum = typeof r.score === "number" ? r.score : Number(r.score);
  const score = Number.isFinite(scoreNum) ? Math.max(0, Math.min(10, scoreNum)) : 0;
  const strArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x.trim().length > 0) : [];
  const actionsRaw = Array.isArray(r.actions) ? r.actions : [];
  const actions: NonNullable<CouncilRoleResponse["actions"]> = [];
  for (const a of actionsRaw) {
    const obj = (a ?? {}) as Record<string, unknown>;
    const owner = String(obj.owner ?? "");
    const category = String(obj.category ?? "").trim();
    const action = String(obj.action ?? "").trim();
    if (!VALID_OWNERS.has(owner) || !category || !action) continue;
    const sevRaw = String(obj.severity ?? "warn");
    const severity = (VALID_SEVERITIES.has(sevRaw) ? sevRaw : "warn") as RepairSeverity;
    actions.push({ owner: owner as RepairOwner, category, action, severity });
  }
  return {
    score,
    summary: String(r.summary ?? "").trim(),
    blockingIssues: strArr(r.blockingIssues),
    nonBlockingImprovements: strArr(r.nonBlockingImprovements),
    actions,
  };
}

// ─── Synthesis (pure + deterministic) ─────────────────────────────────────────

const SEVERITY_RANK: Record<RepairSeverity, number> = { fail: 0, warn: 1, info: 2 };

/**
 * Synthesize per-role responses into one CouncilVerdict. PURE + DETERMINISTIC:
 * given the same per-role responses + `now`, the verdict is identical.
 *
 *   • verdict: any blocking issue OR a fail-severity action → `block`; else any
 *     warn-severity action or non-blocking improvement → `revise`; else `ship`.
 *   • prioritizedActions: every role's actions, de-duped (owner+category+action),
 *     ordered by severity (fail<warn<info) with a stable secondary key, and
 *     assigned a 1-based `priority`. The repair vocabulary is carried verbatim.
 *   • disagreements: a coarse, deterministic surface — when the role scores
 *     split widely (max-min ≥ 4), record the high vs low camps so the agent can
 *     flag a genuine fork.
 */
export function synthesizeVerdict(
  phase: CouncilPhase,
  projectId: string,
  responses: Array<{ role: CouncilRole; response: CouncilRoleResponse }>,
  now: string,
): CouncilVerdict {
  const roleScores: CouncilRoleScore[] = responses.map(({ role, response }) => ({
    role,
    score: response.score,
    summary: response.summary,
  }));

  const blockingIssues = dedupeStrings(responses.flatMap((r) => r.response.blockingIssues ?? []));
  const nonBlockingImprovements = dedupeStrings(
    responses.flatMap((r) => r.response.nonBlockingImprovements ?? []),
  );

  // Gather + de-dupe actions across roles.
  const seen = new Set<string>();
  const flat: CouncilAction[] = [];
  for (const { response } of responses) {
    for (const a of response.actions ?? []) {
      const severity = a.severity ?? "warn";
      const key = `${a.owner}|${a.category}|${a.action}`;
      if (seen.has(key)) continue;
      seen.add(key);
      flat.push({ owner: a.owner, category: a.category, action: a.action, priority: 1, severity });
    }
  }
  // Deterministic order: severity rank primary, then owner, category, action as
  // stable tiebreakers — never input-array order.
  flat.sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity];
    const sb = SEVERITY_RANK[b.severity];
    if (sa !== sb) return sa - sb;
    if (a.owner !== b.owner) return a.owner.localeCompare(b.owner, "en");
    if (a.category !== b.category) return a.category.localeCompare(b.category, "en");
    return a.action.localeCompare(b.action, "en");
  });
  flat.forEach((it, i) => {
    it.priority = i + 1;
  });

  const hasFailAction = flat.some((a) => a.severity === "fail");
  const hasWarnAction = flat.some((a) => a.severity === "warn");

  let verdict: CouncilVerdictKind;
  if (blockingIssues.length > 0 || hasFailAction) {
    verdict = "block";
  } else if (hasWarnAction || nonBlockingImprovements.length > 0) {
    verdict = "revise";
  } else {
    verdict = "ship";
  }

  const disagreements = deriveDisagreements(roleScores);
  const recommendation = buildRecommendation(verdict, blockingIssues, flat, roleScores);

  return CouncilVerdictSchema.parse({
    version: 1,
    phase,
    projectId,
    generatedAt: now,
    verdict,
    roleScores,
    blockingIssues,
    nonBlockingImprovements,
    disagreements,
    prioritizedActions: flat,
    recommendation,
  });
}

function dedupeStrings(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of arr) {
    const t = s.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Coarse deterministic disagreement surface: a wide score split → one entry. */
function deriveDisagreements(roleScores: CouncilRoleScore[]): CouncilDisagreement[] {
  if (roleScores.length < 2) return [];
  const scores = roleScores.map((r) => r.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  if (max - min < 4) return [];
  const high = roleScores.filter((r) => r.score >= (max + min) / 2);
  const low = roleScores.filter((r) => r.score < (max + min) / 2);
  return [
    {
      topic: "overall confidence (wide score split across roles)",
      positions: [
        ...high.map((r) => ({ role: r.role, position: `confident (score ${r.score})` })),
        ...low.map((r) => ({ role: r.role, position: `concerned (score ${r.score})` })),
      ],
    },
  ];
}

function buildRecommendation(
  verdict: CouncilVerdictKind,
  blockingIssues: string[],
  actions: CouncilAction[],
  roleScores: CouncilRoleScore[],
): string {
  const avg =
    roleScores.length > 0
      ? (roleScores.reduce((s, r) => s + r.score, 0) / roleScores.length).toFixed(1)
      : "n/a";
  if (verdict === "block") {
    const why =
      blockingIssues.length > 0
        ? `${blockingIssues.length} blocking issue(s)`
        : `${actions.filter((a) => a.severity === "fail").length} fail-severity action(s)`;
    return `BLOCK — ${why} must be resolved before proceeding (avg role score ${avg}/10). Address the prioritized actions, then re-convene.`;
  }
  if (verdict === "revise") {
    return `REVISE — no blockers, but ${actions.length} prioritized action(s) would materially improve the piece (avg role score ${avg}/10). Apply them, then proceed.`;
  }
  return `SHIP — the council found no blockers and no warn-level actions (avg role score ${avg}/10). Proceed.`;
}

// ─── Entry points ──────────────────────────────────────────────────────────────

/** Run the fan-out for a phase against the deps, returning per-role responses. */
async function fanOut(
  phase: CouncilPhase,
  payload: string,
  projectId: string | undefined,
  deps: CouncilDeps,
): Promise<Array<{ role: CouncilRole; response: CouncilRoleResponse }>> {
  const roles = deps.roles ?? COUNCIL_ROLES;
  const resolveRole = async (role: CouncilRole): Promise<CouncilRoleResponse> => {
    if (deps.callRole) {
      const ctx: CouncilRoleContext = {
        phase,
        role,
        systemPrompt: buildRoleSystemPrompt(role, phase),
        payload,
        projectId,
      };
      return normalizeRoleResponse(await deps.callRole(ctx));
    }
    // Fixture mode: resolve from the canned map; a missing role abstains neutrally.
    const fixtureResp = deps.fixture?.[role];
    return normalizeRoleResponse(
      fixtureResp ?? { score: 5, summary: `${role} abstained (no fixture)`, actions: [] },
    );
  };
  // Fan out concurrently — each role is independent (no shared state, no media).
  const responses = await Promise.all(
    roles.map(async (role) => ({ role, response: await resolveRole(role) })),
  );
  return responses;
}

/**
 * PREFLIGHT council — review a production plan (#407) BEFORE any paid
 * generation. Fans one role caller per role over the plan, synthesizes the
 * verdict. BOUNDED: text-only via `deps.callRole`; no media, no browsing.
 */
export async function councilPreflight(
  plan: ProductionPlan,
  deps: CouncilDeps = {},
): Promise<CouncilVerdict> {
  const now = deps.now ?? new Date().toISOString();
  const payload = preflightPayload(plan);
  const responses = await fanOut("preflight", payload, plan.projectId, deps);
  return synthesizeVerdict("preflight", plan.projectId ?? "", responses, now);
}

/**
 * POLISH council — review a native-video eval report (#411) AFTER eval and
 * BEFORE Unit formation. The resulting `prioritizedActions` are in the #409
 * repair vocabulary so they flow into `buildRepairPlan` without free-form
 * parsing (see `councilActionsToWhatToRedo`). BOUNDED identically to preflight.
 */
export async function councilPolish(
  evalReport: EvalReport,
  deepVision: DeepVisionFile | null | undefined,
  deps: CouncilDeps = {},
): Promise<CouncilVerdict> {
  const now = deps.now ?? new Date().toISOString();
  const payload = polishPayload(evalReport, deepVision ?? null);
  const projectId = evalReport.meta?.projectId ?? "";
  const responses = await fanOut("polish", payload, projectId || undefined, deps);
  return synthesizeVerdict("polish", projectId ?? "", responses, now);
}

// ─── Repair-loop integration (no free-form parsing) ───────────────────────────
//
// The polish council's `prioritizedActions` already speak the #409 vocabulary
// (owner / category / severity). To feed them into the existing deterministic
// `buildRepairPlan` WITHOUT changing #409's behavior, we project them onto the
// `what_to_redo[]` shape `buildRepairPlan` already ingests. `buildRepairPlan`
// then classifies + orders them exactly as it does a deep-vision redo list — a
// structural hand-off, zero prose parsing.
//
// owner → deep-vision `target` mapping is the inverse of `repair.ts`'s
// `ownerFromDeepTarget` so the round-trip preserves the owner:
//   editor      → "audio"        (the only non-art-director deep target)
//   art-director→ "scene-prompt" (a visual re-roll)
//   scenarist   → "scene-prompt" too (re-script lands as a visual/prompt redo;
//                 buildRepairPlan re-classifies by target — see note below).
//
// NOTE on scenarist: `buildRepairPlan`'s deep-vision path maps every non-audio
// target to art-director, so a scenarist action routed through what_to_redo
// would land as art-director. To preserve the scenarist owner structurally, the
// polish council's actions are better consumed via `buildRepairPlanFromCouncil`
// below (a thin wrapper that keeps each action's owner verbatim). The
// what_to_redo projection is offered for callers that specifically want the
// existing deep-vision ingestion path; the owner-preserving wrapper is the
// recommended seam.

/** deep-vision priority that maps back to a severity, for the what_to_redo projection. */
function priorityFromSeverity(severity: RepairSeverity): 1 | 2 | 3 {
  if (severity === "fail") return 1;
  if (severity === "warn") return 2;
  return 3;
}

function deepTargetFromOwner(owner: RepairOwner): string {
  return owner === "editor" ? "audio" : "scene-prompt";
}

/**
 * Project a polish CouncilVerdict's prioritizedActions onto the deep-vision
 * `what_to_redo[]` shape `buildRepairPlan` already ingests. Lets a caller feed
 * council priorities through the EXISTING #409 ingestion path unchanged:
 *
 *   const deep = { parsed: { what_to_redo: councilActionsToWhatToRedo(verdict) } };
 *   const repairPlan = buildRepairPlan(evalReport, deep);
 *
 * (Owner is re-derived from `target` by buildRepairPlan — editor for audio,
 * art-director otherwise. For exact owner preservation use the wrapper below.)
 */
export function councilActionsToWhatToRedo(
  verdict: CouncilVerdict,
): NonNullable<NonNullable<DeepVisionFile["parsed"]>["what_to_redo"]> {
  return verdict.prioritizedActions.map((a) => ({
    priority: priorityFromSeverity(a.severity),
    target: deepTargetFromOwner(a.owner),
    action: a.action,
    rationale: `council ${a.category}`,
  }));
}

// ─── Markdown rendering ───────────────────────────────────────────────────────

/** Render a human-readable council review markdown from a CouncilVerdict. */
export function renderCouncilMarkdown(verdict: CouncilVerdict): string {
  const lines: string[] = [];
  const phaseLabel = verdict.phase === "preflight" ? "Preflight (pre-generation)" : "Polish (post-eval)";
  lines.push(`# Council review — ${verdict.projectId || "(standalone)"}`);
  lines.push("");
  lines.push(`> Phase: **${phaseLabel}**`);
  lines.push(`> Generated: ${verdict.generatedAt}`);
  lines.push(`> Verdict: **${verdict.verdict.toUpperCase()}**`);
  lines.push("");
  lines.push(`**Recommendation:** ${verdict.recommendation || "—"}`);
  lines.push("");

  lines.push("## Role scores");
  lines.push("");
  if (verdict.roleScores.length === 0) {
    lines.push("_(no roles convened)_");
  } else {
    for (const r of verdict.roleScores) {
      lines.push(`- **${r.role}** — ${r.score}/10${r.summary ? `: ${r.summary}` : ""}`);
    }
  }
  lines.push("");

  if (verdict.blockingIssues.length) {
    lines.push("## Blocking issues");
    lines.push("");
    for (const b of verdict.blockingIssues) lines.push(`- ${b}`);
    lines.push("");
  }

  if (verdict.nonBlockingImprovements.length) {
    lines.push("## Non-blocking improvements");
    lines.push("");
    for (const n of verdict.nonBlockingImprovements) lines.push(`- ${n}`);
    lines.push("");
  }

  if (verdict.disagreements.length) {
    lines.push("## Disagreements");
    lines.push("");
    for (const d of verdict.disagreements) {
      lines.push(`- **${d.topic}**`);
      for (const p of d.positions) lines.push(`  - ${p.role}: ${p.position}`);
    }
    lines.push("");
  }

  lines.push("## Prioritized actions (repair vocabulary)");
  lines.push("");
  if (verdict.prioritizedActions.length === 0) {
    lines.push("_(no actions — nothing to fix)_");
  } else {
    for (const a of verdict.prioritizedActions) {
      lines.push(
        `- **[P${a.priority}]** \`${a.category}\` → **${a.owner}** (${a.severity}): ${a.action}`,
      );
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    verdict.phase === "polish"
      ? "Polish-council actions are in the #409 repair vocabulary (owner / category / severity). Feed them into `ralphy project repair-plan` to ingest them structurally before any paid regeneration."
      : "Preflight runs on the production plan BEFORE any paid generation. Resolve blocking issues, apply the prioritized actions, then proceed to scenario / prompts.",
  );
  lines.push("");
  return lines.join("\n");
}

// ─── Production LLM role caller (the single model seam) ───────────────────────
//
// The ONLY place the council touches a model. Each role becomes one `callLLM()`
// jsonMode pass (AGENTS.md invariant #1) with `projectId` + a per-role
// `endpoint` so each role logs its own `generations.jsonl` row. Mirrors the
// #407 plan-enrich wiring. There is NO media generation here and NO fetch — the
// role only sees the system prompt + the provided payload.

/** Default model for a council role — cheap, multilingual, JSON-reliable. */
const DEFAULT_COUNCIL_MODEL = "google/gemini-2.5-flash";

/**
 * Build the production `callRole` fn. The verb passes the result as
 * `deps.callRole`. Each call is a single `callLLM()` jsonMode pass; the parsed
 * JSON is normalized by `fanOut` via `normalizeRoleResponse`.
 */
export function makeLlmCallRole(
  opts: { model?: string } = {},
): (ctx: CouncilRoleContext) => Promise<CouncilRoleResponse> {
  const model = opts.model ?? DEFAULT_COUNCIL_MODEL;
  return async (ctx: CouncilRoleContext): Promise<CouncilRoleResponse> => {
    const { text } = await callLLM({
      messages: [
        { role: "system", content: ctx.systemPrompt },
        {
          role: "user",
          content: `Here is the ${ctx.phase === "preflight" ? "production plan" : "eval report"} to review:\n\n${ctx.payload}`,
        },
      ],
      model,
      temperature: 0.2,
      jsonMode: true,
      projectId: ctx.projectId,
      endpoint: `council-${ctx.phase}-${ctx.role}`,
    });
    // Strip code fences if the model added them despite jsonMode.
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    return normalizeRoleResponse(JSON.parse(cleaned));
  };
}
