// Deterministic batch-review aggregation (#410 — chat-native content-farm mode).
//
// `ralphy batch review <id>` is the farm-mode triage primitive: a PURE,
// DETERMINISTIC roll-up over a batch's member projects. It makes ZERO model
// calls — it only aggregates artifacts the per-project pipeline already wrote
// (eval.json, repair-plan.json, generations.jsonl). The farm workflow (the
// producer playbook's content-farm section) drives the next action from it:
// which items shipped, which failed, the total spend, where the shared style
// lock drifted, which model/error recurs across items, and the per-project
// repair-plan owner summary the fixer loop (#409) consumes.
//
// Design (mirrors cli/lib/repair.ts + cli/lib/contract.ts):
//  - The exported builder `buildBatchReview(batch, projectStates)` is pure and
//    takes ALREADY-READ inputs, so tests assert on it without shelling out or
//    touching disk. The `ralphy batch review` command is a thin wrapper that
//    reads the batch state + each member project's artifacts and calls it.
//  - Cost is summed from the per-project generations.jsonl `cost_usd` (already
//    normalized by `readGenerations` / `normalizeGenerationEntry`), so the
//    roll-up matches the gen-log #032 contract exactly.
//  - Winners / failures reuse the #411 ship gate vocabulary: a project is a
//    WINNER iff its eval `gate.shipReady === true` (a cheap keyframe/structure
//    eval can NEVER make this true) AND the verdict is not `fail`; a FAILURE iff
//    the eval verdict is `fail`. Everything else is `inProgress` (no eval yet,
//    or a warn/cheap-gate eval that hasn't been promoted).
//  - Style drift reuses the eval finding taxonomy: any `style.*` / `brief.*`
//    finding (the art-director-owned register family in cli/lib/repair.ts) of
//    severity warn|fail flags the item as drifted from the shared style lock.
//  - Repeated model failures scan the gen-log for `status: "error"` rows and
//    group identical (model + coarse error) pairs that recur ACROSS ≥2 items —
//    the signal that a model/route is systematically broken for this batch, not
//    a one-off transient.
//  - Recommended repairs reuse the #409 repair-plan owner buckets when a
//    repair-plan.json was already built; otherwise it derives a lightweight
//    owner summary from the eval findings via `classifyFindingOwner` so the
//    review still points the fixer at the right role without a model call.

import type { EvalReport, Finding } from "./eval/types.js";
import type { RepairOwner, RepairPlan } from "./schemas/repair-plan.js";
import { classifyFindingOwner } from "./repair.js";
import { normalizeGenerationEntry, type GenerationEntry, type RawGenerationEntry } from "./gen-log.js";

// ─── Inputs ─────────────────────────────────────────────────────────────────

/** The minimal batch shape the review needs (a subset of batch state.json / config.json). */
export interface BatchInput {
  /** Batch id (kebab). */
  batchId: string;
  /** Human name, if present. */
  name?: string;
  /** The base template the variations fan off, if any. */
  template?: string | null;
}

/**
 * One member project's already-read artifacts. The command reads these off
 * disk; tests pass them inline. Everything except `id` is optional so a project
 * that has not reached eval yet still aggregates cleanly.
 */
export interface ProjectStateInput {
  /** Project id (member of the batch). */
  id: string;
  /** The project's eval.json (parsed), or null when no eval has run yet. */
  evalReport?: EvalReport | null;
  /** The project's repair-plan.json (parsed), or null when none was built. */
  repairPlan?: RepairPlan | null;
  /** The project's generations.jsonl rows (raw or canonical; normalized here). */
  generations?: RawGenerationEntry[] | GenerationEntry[];
}

// ─── Result ─────────────────────────────────────────────────────────────────

/** Where a project sits relative to the #411 ship gate. */
export type BatchItemStatus = "winner" | "failure" | "in-progress";

/** Per-project line in the review. */
export interface BatchReviewItem {
  id: string;
  status: BatchItemStatus;
  /** Eval verdict (pass | warn | fail) when an eval has run, else null. */
  verdict: "pass" | "warn" | "fail" | null;
  /** The #411 native-video ship gate result, when an eval has run, else null. */
  shipReady: boolean | null;
  /** True when the eval ran a full-mp4 native pass (the only ship-strong gate). */
  nativeVideo: boolean | null;
  /** This project's USD spend (sum of generations.jsonl cost_usd). */
  costUsd: number;
  /** True when ≥1 `style.*` / `brief.*` warn|fail finding flags drift from the lock. */
  styleDrift: boolean;
  /** The style/brief finding categories that flagged drift (deduped). */
  styleDriftCategories: string[];
  /** Owner → count of recommended repairs for this project (from plan or eval). */
  repairsByOwner: Partial<Record<RepairOwner, number>>;
  /** Total recommended-repair items for this project. */
  repairCount: number;
}

/** A model/error pair that recurs across multiple batch items. */
export interface RepeatedModelFailure {
  /** Fully-qualified model id (or endpoint slug for non-LLM rows). */
  model: string;
  /** Coarse error string (the gen-log row's `error`, or "unknown"). */
  error: string;
  /** Total error rows across the batch matching this (model,error). */
  occurrences: number;
  /** The distinct member-project ids the failure recurred in (sorted). */
  projects: string[];
}

/** The full deterministic batch review. */
export interface BatchReview {
  batchId: string;
  name: string | null;
  template: string | null;
  /** Total member projects considered. */
  total: number;
  /** Ship-ready winners (project ids, sorted). */
  winners: string[];
  /** Failed / blocked items (project ids, sorted). */
  failures: string[];
  /** Items still in progress — no eval, or a non-ship cheap/warn eval (ids, sorted). */
  inProgress: string[];
  /** Batch-wide spend roll-up. */
  cost: {
    /** Sum of every member project's generations.jsonl cost_usd (actual spend). */
    totalUsd: number;
    /**
     * Estimated remaining QUEUED spend — pending generate.* jobs on the batch's
     * member projects (#481). 0 when the daemon has no pending work for them.
     */
    queuedEstimateUsd: number;
    /** The effective budget cap covering this batch's members, or null (#481). */
    capUsd: number | null;
    /** cap - actual spent (null when no cap) (#481). */
    remainingUsd: number | null;
    /** true when a cap exists and actual spent ≥ cap (#481). */
    overBudget: boolean;
    /** Per-project { id, costUsd }, sorted by id. */
    byProject: Array<{ id: string; costUsd: number }>;
  };
  /** Member ids whose eval flagged style/register drift from the shared lock (sorted). */
  styleDrift: string[];
  /** Model/error pairs recurring across ≥2 items (descending by occurrences). */
  repeatedModelFailures: RepeatedModelFailure[];
  /** Batch-wide recommended-repair owner roll-up (sum across items). */
  recommendedRepairs: {
    /** Owner → total recommended-repair items across the batch. */
    byOwner: Partial<Record<RepairOwner, number>>;
    /** Total recommended-repair items across the batch. */
    total: number;
  };
  /** The per-project detail rows, sorted by id. */
  items: BatchReviewItem[];
  /** A one-line, agent-actionable next-step recommendation (no model call). */
  recommendation: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STYLE_DRIFT_PREFIXES = ["style.", "brief."] as const;

/** Whether a finding category signals style/register drift from the lock. */
function isStyleDriftCategory(category: string): boolean {
  return STYLE_DRIFT_PREFIXES.some((p) => category.startsWith(p));
}

/** Sum the `cost_usd` of a project's generation rows (normalized first). */
function sumCost(rows: Array<RawGenerationEntry | GenerationEntry>): number {
  let total = 0;
  for (const raw of rows) {
    const row = normalizeGenerationEntry(raw as RawGenerationEntry);
    if (typeof row.cost_usd === "number" && Number.isFinite(row.cost_usd)) {
      total += row.cost_usd;
    }
  }
  // Round to cents so the roll-up never carries float noise.
  return Number(total.toFixed(2));
}

/**
 * Owner → count of recommended repairs for one project. Prefers an already-built
 * repair-plan's `byOwner` index (#409); falls back to classifying the eval
 * findings directly so a project with an eval but no plan still contributes.
 */
function repairsForProject(
  evalReport: EvalReport | null | undefined,
  repairPlan: RepairPlan | null | undefined,
): { byOwner: Partial<Record<RepairOwner, number>>; total: number } {
  const byOwner: Partial<Record<RepairOwner, number>> = {};
  let total = 0;

  if (repairPlan && Array.isArray(repairPlan.items) && repairPlan.items.length > 0) {
    for (const item of repairPlan.items) {
      byOwner[item.owner] = (byOwner[item.owner] ?? 0) + 1;
      total += 1;
    }
    return { byOwner, total };
  }

  // Fallback: derive owner buckets straight from the eval findings.
  const findings: Finding[] = evalReport?.findings ?? [];
  for (const f of findings) {
    // Only actionable findings (warn|fail) count as a recommended repair.
    if (f.severity === "info") continue;
    const owner = classifyFindingOwner(f.category);
    byOwner[owner] = (byOwner[owner] ?? 0) + 1;
    total += 1;
  }
  return { byOwner, total };
}

/** Style-drift finding categories for one project (deduped, sorted). */
function styleDriftCategories(evalReport: EvalReport | null | undefined): string[] {
  const cats = new Set<string>();
  for (const f of evalReport?.findings ?? []) {
    if (f.severity === "info") continue;
    if (isStyleDriftCategory(f.category)) cats.add(f.category);
  }
  return [...cats].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Classify one project against the #411 ship gate.
 *   winner   → eval ran, gate.shipReady === true, verdict !== "fail".
 *   failure  → eval ran, verdict === "fail" (or a native gate that explicitly
 *              blocked shipping with a fail verdict).
 *   in-progress → no eval yet, OR a warn/cheap-gate eval that is not ship-ready
 *                 and not an outright fail.
 */
function classifyItem(evalReport: EvalReport | null | undefined): {
  status: BatchItemStatus;
  verdict: "pass" | "warn" | "fail" | null;
  shipReady: boolean | null;
  nativeVideo: boolean | null;
} {
  if (!evalReport) {
    return { status: "in-progress", verdict: null, shipReady: null, nativeVideo: null };
  }
  const verdict = evalReport.scoring?.verdict ?? null;
  const shipReady = evalReport.gate?.shipReady ?? false;
  const nativeVideo = evalReport.gate?.nativeVideo ?? false;

  if (verdict === "fail") {
    return { status: "failure", verdict, shipReady, nativeVideo };
  }
  if (shipReady === true) {
    return { status: "winner", verdict, shipReady, nativeVideo };
  }
  return { status: "in-progress", verdict, shipReady, nativeVideo };
}

// ─── Repeated-failure detection ────────────────────────────────────────────────

/**
 * Find model/error pairs that recur across ≥2 distinct member projects. A
 * single project failing the same model twice is a per-project problem; the
 * batch-level signal is "this model/route is broken for THIS batch", which only
 * shows up when the SAME (model,error) hits multiple items.
 */
function detectRepeatedModelFailures(
  perProject: Array<{ id: string; rows: GenerationEntry[] }>,
): RepeatedModelFailure[] {
  // key = `${model} ${error}` → { occurrences, projects:Set }
  const acc = new Map<string, { model: string; error: string; occurrences: number; projects: Set<string> }>();

  for (const { id, rows } of perProject) {
    for (const row of rows) {
      if (row.status !== "error") continue;
      const model = row.model || row.endpoint || "unknown";
      const error = (row.error ?? "unknown").trim() || "unknown";
      const key = `${model} ${error}`;
      let entry = acc.get(key);
      if (!entry) {
        entry = { model, error, occurrences: 0, projects: new Set<string>() };
        acc.set(key, entry);
      }
      entry.occurrences += 1;
      entry.projects.add(id);
    }
  }

  return [...acc.values()]
    // The batch-level signal: recurs across ≥2 distinct projects.
    .filter((e) => e.projects.size >= 2)
    .map((e) => ({
      model: e.model,
      error: e.error,
      occurrences: e.occurrences,
      projects: [...e.projects].sort((a, b) => a.localeCompare(b, "en")),
    }))
    .sort(
      (a, b) =>
        b.occurrences - a.occurrences ||
        b.projects.length - a.projects.length ||
        a.model.localeCompare(b.model, "en"),
    );
}

// ─── The builder ────────────────────────────────────────────────────────────

/**
 * Optional budget context for the review (#481). The command resolves these
 * off disk (run ledger cap + jobs DB queued estimate); the builder stays PURE
 * and just folds them into the cost roll-up. Omitted → no cap, 0 queued.
 */
export interface BatchBudgetInput {
  /** The effective cap covering the batch's members (run cap, etc.), or null. */
  capUsd?: number | null;
  /** Estimated remaining queued spend over the batch's members. */
  queuedEstimateUsd?: number;
}

/**
 * Build a deterministic batch review from a batch + its member project states.
 * PURE: no LLM, no network, no disk. Every figure is derived from the inputs
 * (which the command reads off disk; tests pass inline).
 *
 * @param batch          the batch's id / name / base template.
 * @param projectStates  each member project's eval / repair-plan / gen-log.
 * @param budget         optional budget context (cap + queued estimate, #481).
 */
export function buildBatchReview(
  batch: BatchInput,
  projectStates: ProjectStateInput[],
  budget: BatchBudgetInput = {},
): BatchReview {
  const items: BatchReviewItem[] = [];
  const perProjectRows: Array<{ id: string; rows: GenerationEntry[] }> = [];
  const byOwnerTotal: Partial<Record<RepairOwner, number>> = {};
  let repairTotal = 0;

  for (const ps of projectStates) {
    const evalReport = ps.evalReport ?? null;
    const repairPlan = ps.repairPlan ?? null;
    const rawRows = (ps.generations ?? []) as RawGenerationEntry[];
    const rows = rawRows.map((r) => normalizeGenerationEntry(r));
    perProjectRows.push({ id: ps.id, rows });

    const { status, verdict, shipReady, nativeVideo } = classifyItem(evalReport);
    const costUsd = sumCost(rawRows);
    const driftCats = styleDriftCategories(evalReport);
    const repairs = repairsForProject(evalReport, repairPlan);

    for (const [owner, n] of Object.entries(repairs.byOwner) as Array<[RepairOwner, number]>) {
      byOwnerTotal[owner] = (byOwnerTotal[owner] ?? 0) + n;
    }
    repairTotal += repairs.total;

    items.push({
      id: ps.id,
      status,
      verdict,
      shipReady,
      nativeVideo,
      costUsd,
      styleDrift: driftCats.length > 0,
      styleDriftCategories: driftCats,
      repairsByOwner: repairs.byOwner,
      repairCount: repairs.total,
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id, "en"));

  const winners = items.filter((i) => i.status === "winner").map((i) => i.id);
  const failures = items.filter((i) => i.status === "failure").map((i) => i.id);
  const inProgress = items.filter((i) => i.status === "in-progress").map((i) => i.id);
  const styleDrift = items.filter((i) => i.styleDrift).map((i) => i.id);

  const byProject = items.map((i) => ({ id: i.id, costUsd: i.costUsd }));
  const totalUsd = Number(byProject.reduce((s, p) => s + p.costUsd, 0).toFixed(2));
  const capUsd = budget.capUsd ?? null;
  const queuedEstimateUsd = Number((budget.queuedEstimateUsd ?? 0).toFixed(2));
  const remainingUsd = capUsd == null ? null : Number((capUsd - totalUsd).toFixed(2));
  const overBudget = capUsd != null && totalUsd >= capUsd;

  const repeatedModelFailures = detectRepeatedModelFailures(perProjectRows);

  const recommendation = buildRecommendation({
    total: items.length,
    winners,
    failures,
    inProgress,
    styleDrift,
    repeatedModelFailures,
    repairTotal,
  });

  return {
    batchId: batch.batchId,
    name: batch.name ?? null,
    template: batch.template ?? null,
    total: items.length,
    winners,
    failures,
    inProgress,
    cost: { totalUsd, queuedEstimateUsd, capUsd, remainingUsd, overBudget, byProject },
    styleDrift,
    repeatedModelFailures,
    recommendedRepairs: { byOwner: byOwnerTotal, total: repairTotal },
    items,
    recommendation,
  };
}

/** Compose the one-line agent-actionable next-step. No model call. */
function buildRecommendation(args: {
  total: number;
  winners: string[];
  failures: string[];
  inProgress: string[];
  styleDrift: string[];
  repeatedModelFailures: RepeatedModelFailure[];
  repairTotal: number;
}): string {
  const { total, winners, failures, inProgress, styleDrift, repeatedModelFailures, repairTotal } = args;
  if (total === 0) {
    return "No member projects yet — scaffold the variation matrix and run the per-item pipelines before reviewing.";
  }
  const parts: string[] = [];
  parts.push(
    `${winners.length}/${total} ship-ready, ${failures.length} failed, ${inProgress.length} in progress.`,
  );
  if (repeatedModelFailures.length > 0) {
    const top = repeatedModelFailures[0]!;
    parts.push(
      `A repeated model failure (\`${top.model}\` — ${top.error}) recurs across ${top.projects.length} items; fix the shared model/route before re-rolling individual items.`,
    );
  }
  if (failures.length > 0) {
    parts.push(
      `Run \`ralphy project repair-plan <id>\` on each failed item, present the owner-grouped plan, and re-roll only on approval (#409).`,
    );
  } else if (repairTotal > 0) {
    parts.push(`${repairTotal} recommended repair item(s) across warn-verdict items — triage before forming Units.`);
  }
  if (styleDrift.length > 0) {
    parts.push(
      `${styleDrift.length} item(s) drifted from the shared style lock — re-anchor against STYLE_LOCK.md (art-director).`,
    );
  }
  if (winners.length > 0) {
    parts.push(
      `Form Units for the ${winners.length} winner(s) and run \`ralphy unit caption --bulk\` for platform copy (#403).`,
    );
  }
  return parts.join(" ");
}
