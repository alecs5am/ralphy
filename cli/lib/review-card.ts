// Rich approval review card — the FOUNDATION layer of #533.
//
// The L0/L1 human gate (#505 approval nodes / #482 approval inbox / #536
// safe-mode) parks a farm run for approval, but the operator needs to actually
// SEE what they are approving to make a fast, sound call. This module is the
// dependency-free READ-MODEL + WRITE-TRANSITIONS the future #492 app API /
// #506 dashboard renders — surfaced today through the interim `ralphy farm
// review` verb (the headless surface + the test entry point). The mobile
// dashboard CARD (#492/#506) renders the SAME `assembleReviewCard` output; it
// is the remaining #533 work, deliberately deferred here.
//
// WHY a separate module (not folded into runner.ts / publish.ts): the card is
// a PURE aggregation over EXISTING artifacts + the run journal (Studio's
// media-safety rule — NO new media write path), and the three actions each map
// to an EXISTING state transition. Keeping the read-model + the action mapper
// in one small file makes the "the dashboard calls exactly this" contract legible.
//
// ── The read model (assembleReviewCard) ──────────────────────────────────────
// A parked review target = a node the run journaled a `run-parked` event for
// (approval / gate / safe-mode publish). For each, we resolve the unit it is
// gating (parked node params → the journaled producer output feeding its `unit`
// in-port → the run's sole member project's units), then assemble:
//   • media proof (video/image/article) — paths + kind + a thumbnail/body,
//     read-only from the unit dir (never copied, never generated).
//   • caption / title / targets / the #525 sampled schedule time — from unit.json.
//   • the gate scorecard (#427 readiness / #469 workspace-eval) + cost spent
//     (the run ledger) — from the project + run journal.
//
// ── The write transitions (applyReviewDecision) ──────────────────────────────
// The ONLY writes are the decision record + its calibration sample + the
// repair enqueue:
//   • approve        → recordRunApproval (release the park on the next resume)
//                      + a run event + recordTrustDecision(approve).
//   • reject         → a run event + a unit-level rejection note (append-only —
//                      NEVER deletes media, invariant #14) + recordTrustDecision(reject).
//   • request-change → buildRepairPlan enqueue (#519/#511, the #409 repair
//                      vocabulary) + a run event + recordTrustDecision(reject —
//                      it did not ship).
// Every decision appends the (verdict, human decision) calibration sample via
// recordTrustDecision — the #505 agreement signal consumed by #505/#532.
//
// English-only-on-disk.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { projectDir, runDir, runWorkspace } from "./paths.js";
import { loadRun, appendRunEvent } from "./run.js";
import { readUnitManifest, unitDirFor } from "./publish/publish.js";
import { buildScorecard } from "./scorecard.js";
import { readProjectEval, recordTrustDecision } from "./trust.js";
import { recordRunApproval } from "./spend.js";
import { buildRepairPlan } from "./repair.js";
import type { UnitManifest } from "./schemas/unit.js";
import type { ScorecardVerdict } from "./schemas/scorecard.js";
import type { RepairPlan } from "./schemas/repair-plan.js";
import type { EvalReport } from "./eval/types.js";

// ─── Media-proof kind resolution ──────────────────────────────────────────────

/** Video containers whose presence in a unit's media makes the card a "video". */
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const ARTICLE_EXT = new Set([".md", ".mdx", ".markdown"]);

export type ReviewMediaKind = "video" | "image" | "article";

export interface ReviewMedia {
  /** The proof kind driving how the dashboard renders (playable / still / body). */
  kind: ReviewMediaKind;
  /** Absolute unit-media paths (ordered as in unit.json). */
  paths: string[];
  /** For image/video: the first still/frame path (the card thumbnail). */
  thumbnail?: string;
  /** For an article: the rendered markdown body (front-matter stripped). */
  articleBody?: string;
  /** For an article: the parsed YAML-ish front-matter key/value pairs. */
  frontmatter?: Record<string, string>;
}

/** The card's gate scorecard read (#427 readiness merged with #469 workspace-eval). */
export interface ReviewScorecard {
  verdict: string;
  /** The workspace-eval overall score (0-100), or null when unscored. */
  score: number | null;
  /** Per-criterion / per-dimension one-liners for the card. */
  criteria: Array<{ id: string; status: string; note?: string }>;
}

export interface ReviewCard {
  run: string;
  /** The parked node id this card gates. */
  node: string;
  /** The unit's owning project. */
  project: string | null;
  /** The gated unit's slug (null when no unit resolved — a blocked/empty card). */
  unit: string | null;
  media: ReviewMedia | null;
  caption: string | null;
  title: string | null;
  /** The publish target platforms (from unit.json publish[] / caption). */
  targets: string[];
  /** The #525 sampled schedule time (unit.json publish[].scheduleAt), or null. */
  scheduleAt: string | null;
  scorecard: ReviewScorecard | null;
  /** Realized run spend so far (the run journal ledger). */
  costUsd: number;
  /** The farm-state status the run is parked in ("parked-approval" | …). */
  status: string;
  /** Human-readable reason the run parked (the journaled park message). */
  reason: string | null;
}

// ─── Journal read (pure) ──────────────────────────────────────────────────────

interface JournalLine {
  kind?: string;
  node?: string;
  output?: unknown;
  reason?: string;
  message?: string;
  costUsd?: number;
}

/** Read a run's `run-events.jsonl` as parsed lines (torn final line tolerated). */
function readRunJournal(ws: string, run: string): JournalLine[] {
  let raw = "";
  try {
    raw = fs.readFileSync(path.join(runDir(ws, run), "run-events.jsonl"), "utf8");
  } catch {
    return [];
  }
  const out: JournalLine[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as JournalLine);
    } catch {
      /* torn / malformed line — append-only stores tolerate it */
    }
  }
  return out;
}

/** Realized run spend = sum of every journaled `costUsd`. */
function journalSpendUsd(lines: JournalLine[]): number {
  let usd = 0;
  for (const l of lines) if (typeof l.costUsd === "number") usd += l.costUsd;
  return Number(usd.toFixed(6));
}

/**
 * The distinct parked nodes (a node with a `run-parked` event and no later
 * `node-completed` for the same node). Order-stable by first-parked. A run
 * re-parks the SAME node on each unsatisfied resume, so we dedupe by node id
 * and keep the LATEST park reason.
 */
interface ParkedTarget {
  node: string;
  reason: string | null;
}
function parkedTargets(lines: JournalLine[]): ParkedTarget[] {
  const parkedReason = new Map<string, string | null>();
  const completedAfterPark = new Set<string>();
  for (const l of lines) {
    if (!l.node) continue;
    if (l.kind === "run-parked") {
      parkedReason.set(l.node, l.reason ?? l.message ?? null);
      completedAfterPark.delete(l.node);
    } else if (l.kind === "node-completed") {
      completedAfterPark.add(l.node);
    }
  }
  const out: ParkedTarget[] = [];
  for (const [node, reason] of parkedReason) {
    if (completedAfterPark.has(node)) continue; // released past the park
    out.push({ node, reason });
  }
  return out;
}

// ─── Unit resolution (deterministic, mirrors publish.ts resolveUnitRef) ───────

interface UnitRef {
  project: string;
  slug: string;
}

/** A "project/slug" string or { project|projectId, slug|unitSlug } object → UnitRef. */
function unitRefFromValue(value: unknown): UnitRef | null {
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const project = (o.projectId ?? o.project) as string | undefined;
    const slug = (o.slug ?? o.unitSlug) as string | undefined;
    if (project && slug) return { project, slug };
  }
  if (typeof value === "string" && value.includes("/")) {
    const [project, ...rest] = value.split("/");
    if (project && rest.length) return { project, slug: rest.join("/") };
  }
  return null;
}

/**
 * Resolve the unit the parked node gates. Deterministic resolution order:
 *   1. The journaled OUTPUT of the parked node (a publish node journals the
 *      unit ref) or of any node whose output is a unit ref, latest first.
 *   2. The run's `unitIds[0]` paired with its sole member project.
 *   3. The sole member project's only `units/<slug>/` on disk.
 * Returns null when nothing resolves (a blocked/empty card — surfaced, not thrown).
 */
async function resolveUnitForParked(
  ws: string,
  run: string,
  node: string,
  lines: JournalLine[],
): Promise<UnitRef | null> {
  // 1. Journaled node outputs that carry a unit ref (parked node first, then any).
  const ownOutput = [...lines].reverse().find((l) => l.node === node && l.output != null);
  const fromOwn = ownOutput && unitRefFromValue(ownOutput.output);
  if (fromOwn) return fromOwn;
  for (const l of [...lines].reverse()) {
    if (l.output == null) continue;
    const ref = unitRefFromValue(l.output);
    if (ref) return ref;
  }

  // 2/3. Fall back to the run manifest's members + units on disk.
  const manifest = await loadRun(run);
  if (!manifest) return null;
  const project = manifest.projectIds.length === 1 ? manifest.projectIds[0]! : null;
  if (!project) return null;
  if (manifest.unitIds && manifest.unitIds.length === 1) {
    return { project, slug: manifest.unitIds[0]! };
  }
  // Sole units/<slug>/ on disk.
  try {
    const unitsRoot = path.join(projectDir(project), "units");
    const dirs = fs
      .readdirSync(unitsRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    if (dirs.length === 1) return { project, slug: dirs[0]! };
  } catch {
    /* no units dir — no unit to review */
  }
  return null;
}

// ─── Media-proof assembly (read-only) ─────────────────────────────────────────

/** Very small front-matter reader: a leading `---\n…\n---` block of `key: value`. */
function parseFrontmatter(body: string): { frontmatter: Record<string, string>; rest: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(body);
  if (!m) return { frontmatter: {}, rest: body };
  const frontmatter: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (kv) frontmatter[kv[1]!] = kv[2]!.replace(/^["']|["']$/g, "");
  }
  return { frontmatter, rest: m[2]! };
}

/** Build the media proof from the unit's ordered media (read-only, no write). */
function assembleMedia(unitDir: string, manifest: UnitManifest): ReviewMedia | null {
  if (manifest.media.length === 0) return null;
  const paths = manifest.media.map((f) => path.join(unitDir, f));
  const exts = manifest.media.map((f) => path.extname(f).toLowerCase());
  const articleIdx = exts.findIndex((e) => ARTICLE_EXT.has(e));
  if (articleIdx >= 0) {
    let articleBody = "";
    let frontmatter: Record<string, string> = {};
    try {
      const parsed = parseFrontmatter(fs.readFileSync(paths[articleIdx]!, "utf8"));
      articleBody = parsed.rest;
      frontmatter = parsed.frontmatter;
    } catch {
      /* unreadable body — leave empty (the path is still surfaced) */
    }
    return { kind: "article", paths, articleBody, frontmatter };
  }
  const videoIdx = exts.findIndex((e) => VIDEO_EXT.has(e));
  if (videoIdx >= 0) {
    const thumb = exts.findIndex((e) => IMAGE_EXT.has(e));
    return { kind: "video", paths, thumbnail: thumb >= 0 ? paths[thumb]! : undefined };
  }
  const imageIdx = exts.findIndex((e) => IMAGE_EXT.has(e));
  if (imageIdx >= 0) return { kind: "image", paths, thumbnail: paths[imageIdx]! };
  // Unknown media — surface the paths, default kind image (a still-safe fallback).
  return { kind: "image", paths, thumbnail: paths[0]! };
}

/** Targets + sampled schedule time from the unit's publish[] records / caption. */
function targetsAndSchedule(manifest: UnitManifest): { targets: string[]; scheduleAt: string | null } {
  const targets = new Set<string>();
  let scheduleAt: string | null = null;
  for (const rec of manifest.publish ?? []) {
    if (rec.target) targets.add(rec.target);
    // The #525 sampled time: the latest non-null scheduleAt across publish records.
    if (rec.scheduleAt) scheduleAt = rec.scheduleAt;
  }
  return { targets: [...targets], scheduleAt };
}

/** The caption body the card shows (reels caption preferred, then tiktok). */
function captionText(manifest: UnitManifest): string | null {
  const c = manifest.caption?.platform;
  if (!c) return null;
  return c.reels || c.tiktok || c.shorts || null;
}

/** The gate scorecard: #469 workspace-eval when present, else the #427 readiness. */
function assembleScorecard(project: string): ReviewScorecard | null {
  // Prefer the workspace-eval overall (verdict + score + fail/warn criteria).
  const wsEval = readProjectEval(project);
  if (wsEval.found && wsEval.verdict) {
    return {
      verdict: wsEval.verdict,
      score: wsEval.score,
      criteria: wsEval.failOrWarnCriteria.map((id) => ({ id, status: "fail-or-warn" })),
    };
  }
  // Fall back to the #427 readiness scorecard (deterministic, zero model calls).
  try {
    const card = buildScorecard({ projectId: project });
    return {
      verdict: card.verdict,
      score: null,
      criteria: card.dimensions
        .filter((d) => d.status !== "na")
        .map((d) => ({ id: d.dimension, status: d.status, note: d.note })),
    };
  } catch {
    return null;
  }
}

// ─── The read model ────────────────────────────────────────────────────────────

export interface AssembleCardInput {
  ws?: string;
  run: string;
  /** The parked node id. */
  node: string;
  /** The park reason, when the caller already read it off the journal. */
  reason?: string | null;
  /** The realized run spend, when the caller already summed the journal. */
  costUsd?: number;
  /** The run's farm-state status. */
  status?: string;
}

/**
 * Assemble ONE review card for a parked node. PURE READ from existing artifacts
 * + the run journal — NO new media write (Studio media-safety rule). A node
 * with no resolvable unit yields a card with `unit: null` (surfaced, not thrown).
 */
export async function assembleReviewCard(input: AssembleCardInput): Promise<ReviewCard> {
  const ws = input.ws ?? runWorkspace(input.run);
  const lines = readRunJournal(ws, input.run);
  const costUsd = input.costUsd ?? journalSpendUsd(lines);
  const status = input.status ?? "parked-approval";
  const reason = input.reason ?? parkedTargets(lines).find((p) => p.node === input.node)?.reason ?? null;

  const ref = await resolveUnitForParked(ws, input.run, input.node, lines);
  const base: ReviewCard = {
    run: input.run,
    node: input.node,
    project: ref?.project ?? null,
    unit: ref?.slug ?? null,
    media: null,
    caption: null,
    title: null,
    targets: [],
    scheduleAt: null,
    scorecard: ref ? assembleScorecard(ref.project) : null,
    costUsd,
    status,
    reason,
  };
  if (!ref) return base;

  const unitDir = unitDirFor(ref.project, ref.slug);
  const manifest = await readUnitManifest(unitDir);
  if (!manifest) return base;

  const { targets, scheduleAt } = targetsAndSchedule(manifest);
  return {
    ...base,
    media: assembleMedia(unitDir, manifest),
    caption: captionText(manifest),
    title: manifest.title ?? null,
    targets,
    scheduleAt,
  };
}

/**
 * Every parked review card for a run (the batch path). Empty when the run has
 * no parked node (never parked, or every park was released).
 */
export async function assembleReviewTick(ws: string, run: string): Promise<ReviewCard[]> {
  const lines = readRunJournal(ws, run);
  const costUsd = journalSpendUsd(lines);
  const cards: ReviewCard[] = [];
  for (const { node, reason } of parkedTargets(lines)) {
    cards.push(await assembleReviewCard({ ws, run, node, reason, costUsd, status: "parked-approval" }));
  }
  return cards;
}

// ─── The write transitions ──────────────────────────────────────────────────────

export type ReviewDecision = "approve" | "reject" | "request-change";

export interface ApplyDecisionInput {
  ws?: string;
  run: string;
  node: string;
  decision: ReviewDecision;
  /** Required for reject / request-change (the operator's reason / repair note). */
  reason?: string;
  /** Who made the call (logged to the run event + rejection note). */
  actor?: string;
  /** approve only: the USD cap the released run runs under (mirrors `run approve`). */
  capUsd?: number;
  /** Clock seam for deterministic tests. */
  now?: () => Date;
}

export interface ApplyDecisionResult {
  run: string;
  node: string;
  project: string | null;
  unit: string | null;
  decision: ReviewDecision;
  /** The eval verdict the calibration sample was recorded against. */
  verdict: string;
  score: number | null;
  /** approve: the run-approval was recorded (release on next resume). */
  approvalRecorded: boolean;
  /** reject: the append-only rejection note path on disk. */
  rejectionNote: string | null;
  /** request-change: the enqueued repair plan (its item count + total cost). */
  repair: { items: number; totalCostEstimate: number } | null;
  /** The (verdict, human-decision) calibration sample match (approve↔ship). */
  calibrationMatch: boolean;
  /** Whether the calibration reject triggered an L2→L1 trust demotion. */
  demoted: boolean;
}

/** Rejection notes live beside the unit — append-only, NEVER touch media (#14). */
export const UNIT_REJECTIONS_ARTIFACT = "rejections.jsonl" as const;

/**
 * Apply one review decision — maps each action to an EXISTING transition. The
 * ONLY writes are the decision record + its calibration sample + the repair
 * enqueue. NEVER deletes media (invariant #14): reject records a rejection note.
 *
 *   • approve        → recordRunApproval (the parked run releases on the next
 *                      farm resume — the runner re-executes the parked node,
 *                      which passes once an active approval exists) + a run
 *                      event + recordTrustDecision(approve, source:"review").
 *   • reject         → a run event + an append-only unit-level rejection note +
 *                      recordTrustDecision(reject, source:"review").
 *   • request-change → buildRepairPlan enqueue (#519/#511) written beside the
 *                      run + a run event + recordTrustDecision(reject — it did
 *                      not ship).
 *
 * Resuming the run is the RUNNER's job on the next scan (`ralphy farm start` /
 * the resume machinery) — we do NOT reach into the runner here; recording the
 * approval is the sole precondition the parked node re-checks.
 */
export async function applyReviewDecision(input: ApplyDecisionInput): Promise<ApplyDecisionResult> {
  const ws = input.ws ?? runWorkspace(input.run);
  if (input.decision !== "approve" && !(input.reason && input.reason.trim())) {
    throw new Error(`review ${input.decision} requires a --reason`);
  }
  const now = input.now ?? (() => new Date());
  const nowIso = now().toISOString();
  const actor = input.actor ?? "operator";

  const card = await assembleReviewCard({ ws, run: input.run, node: input.node });
  const project = card.project;
  const unit = card.unit;
  const verdict = card.scorecard?.verdict ?? "needs-user-decision";
  const score = card.scorecard?.score ?? null;
  const reason = input.reason?.trim() ?? "";

  const result: ApplyDecisionResult = {
    run: input.run,
    node: input.node,
    project,
    unit,
    decision: input.decision,
    verdict,
    score,
    approvalRecorded: false,
    rejectionNote: null,
    repair: null,
    calibrationMatch: false,
    demoted: false,
  };

  if (input.decision === "approve") {
    // Release transition (REUSE `run approve`'s helper): record a run-wide
    // approval so the parked node passes on the next resume. A cap is required
    // by the ledger; default to the already-realized spend (a zero-headroom cap
    // still releases the approval gate — the budget-guard is a separate node).
    const cap = typeof input.capUsd === "number" ? input.capUsd : Math.max(card.costUsd, 0);
    await recordRunApproval(input.run, {
      budgetCapUsd: cap,
      reason: reason || `approved via review of node "${input.node}" by ${actor}`,
      approvedAt: nowIso,
    });
    result.approvalRecorded = true;
    await appendRunEvent(input.run, {
      kind: "review-approved",
      node: input.node,
      project,
      unit,
      actor,
      capUsd: cap,
      message: `review: node "${input.node}"${unit ? ` (unit ${project}/${unit})` : ""} APPROVED by ${actor} — releases on the next resume`,
    });
  } else if (input.decision === "reject") {
    // Rejection is a RECORD, never a delete (invariant #14). Append-only note
    // beside the unit + a run event.
    result.rejectionNote = await appendRejectionNote(ws, project, unit, {
      run: input.run,
      node: input.node,
      reason,
      actor,
      at: nowIso,
    });
    await appendRunEvent(input.run, {
      kind: "review-rejected",
      node: input.node,
      project,
      unit,
      actor,
      reason,
      message: `review: node "${input.node}"${unit ? ` (unit ${project}/${unit})` : ""} REJECTED by ${actor} — ${reason} (media untouched)`,
    });
  } else {
    // request-change → enqueue the repair loop (#519/#511). Build a minimal
    // eval-report shell carrying the operator's note as ONE finding so the
    // deterministic buildRepairPlan produces an owner-classified plan; write it
    // beside the run (the fixer / repair loop consumes it).
    const plan = buildRepairPlan(operatorNoteEvalReport(project, reason), null, { now: nowIso });
    result.repair = { items: plan.items.length, totalCostEstimate: plan.totalCostEstimate };
    await writeRepairPlan(ws, input.run, input.node, plan);
    await appendRunEvent(input.run, {
      kind: "review-request-change",
      node: input.node,
      project,
      unit,
      actor,
      reason,
      repairItems: plan.items.length,
      message: `review: node "${input.node}"${unit ? ` (unit ${project}/${unit})` : ""} CHANGE REQUESTED by ${actor} — ${reason} (repair plan enqueued: ${plan.items.length} item(s))`,
    });
  }

  // Every decision appends the (verdict, human decision) calibration sample —
  // the #505 agreement signal consumed by #505/#532. approve↔ship is a match;
  // reject / request-change are recorded as `reject` (the unit did not ship).
  const sampleDecision: "approve" | "reject" = input.decision === "approve" ? "approve" : "reject";
  const rec = recordTrustDecision(ws, {
    decision: sampleDecision,
    verdict,
    score,
    project,
    unit,
    run: input.run,
    source: "review",
    at: nowIso,
  });
  result.calibrationMatch = rec.sample.match;
  result.demoted = rec.demotion?.demoted ?? false;

  return result;
}

// ─── rejection note + repair-plan write helpers (the only new writes) ─────────

interface RejectionRecord {
  run: string;
  node: string;
  reason: string;
  actor: string;
  at: string;
}

/**
 * Append a rejection record to the unit's `rejections.jsonl` (append-only —
 * media is NEVER touched, invariant #14). When no unit resolved, record it
 * beside the run instead so the reject is never silently lost. Returns the path.
 */
async function appendRejectionNote(
  ws: string,
  project: string | null,
  unit: string | null,
  rec: RejectionRecord,
): Promise<string> {
  const dir =
    project && unit ? unitDirFor(project, unit) : runDir(ws, rec.run);
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, UNIT_REJECTIONS_ARTIFACT);
  await fsp.appendFile(file, JSON.stringify(rec) + "\n");
  return file;
}

/** The repair-plan artifact the request-change transition writes beside the run. */
export function reviewRepairPlanPath(ws: string, run: string, node: string): string {
  return path.join(runDir(ws, run), `review-repair-${node}.json`);
}

async function writeRepairPlan(ws: string, run: string, node: string, plan: RepairPlan): Promise<void> {
  const dir = runDir(ws, run);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(reviewRepairPlanPath(ws, run, node), JSON.stringify(plan, null, 2) + "\n");
}

/**
 * A minimal EvalReport shell carrying the operator's request-change note as ONE
 * `structure.*` finding, so the deterministic buildRepairPlan yields an
 * owner-classified plan (structure → scenarist, per the #409 vocabulary)
 * WITHOUT re-running eval. This is the seam between a human note and the
 * existing repair machinery — no model call, no eval re-run.
 */
function operatorNoteEvalReport(project: string | null, reason: string): EvalReport {
  return {
    meta: { projectId: project ?? "" },
    scoring: { verdict: "repair" },
    findings: [
      {
        id: "review-request-change",
        category: "structure.operator-request",
        severity: "warn",
        message: reason,
        fixHint: reason,
      },
    ],
  } as unknown as EvalReport;
}
