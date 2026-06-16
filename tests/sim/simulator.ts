// Agent user simulator — the deterministic multi-turn harness (issue #431).
//
// `simulatePersona(persona)` replays a persona's scripted turns through the
// DETERMINISTIC surfaces the agent's loop is built on and records, PER TURN, the
// phase, the action it WOULD take, and any invariant violation. It makes ZERO
// model calls and zero network calls — the plan builder's LLM enrichment is
// STUBBED exactly like tests/unit/mode-coverage.test.ts (`cannedEnrichment`),
// and the spend governor reads a real on-disk ledger + gen-log under a TEMP
// project root (the `setRoot` pattern from tests/unit/spend.test.ts).
//
// The four invariant detections the issue calls for:
//   (a) no-spend-before-approval — a paid step attempted while `checkSpend`
//       would BLOCK it (no active approval yet, or over the cap) is a violation.
//       This is asserted through the #444 governor: before `recordApproval`, a
//       paid step is blocked; after, it is allowed within the cap.
//   (b) over-questioning — a turn the script expects to proceed confidently
//       (asksQuestion=false) but `classifyContentMode` still flags `ambiguous`
//       (or vice-versa: an ambiguous turn the script expected to ask but the
//       classifier resolved confidently) is a violation.
//   (c) dropped choice — a previously-locked content mode silently changing on a
//       later turn that did NOT declare a mode change is a violation.
//   (d) missing re-plan — a turn carrying a legitimate mid-flow product/platform
//       /style change that did NOT trigger a fresh `buildProductionPlan` is a
//       violation.
//
// English-only on disk.

import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { setRoot } from "../../cli/lib/paths.js";
import {
  classifyContentMode,
  type ContentMode,
} from "../../cli/lib/content-modes.js";
import { buildProductionPlan } from "../../cli/lib/plan/build.js";
import { gradePlanDeterministic } from "../../cli/lib/plan/grade.js";
import { checkSpend, recordApproval } from "../../cli/lib/spend.js";
import { logGeneration } from "../../cli/lib/gen-log.js";
import { estimatedCallCostUsd } from "../../cli/lib/spend.js";
import type { LlmEnrichment } from "../../cli/lib/schemas/production-plan.js";
import type { PlanGradeVerdict } from "../../cli/lib/schemas/plan-grade.js";
import type { Persona, SimTurn, SimPhase } from "./personas.js";

// Canned enrichment — what a stubbed LLM returns. Mirrors
// tests/unit/mode-coverage.test.ts so scene/duration stay deterministic and no
// network is touched.
function cannedEnrichment(over: Partial<LlmEnrichment> = {}): LlmEnrichment {
  return {
    targetAudienceLanguage: "English",
    register: "",
    sceneCount: 5,
    durationSec: 25,
    firstCheckpoint: "scene-01 anchor -> wait for go",
    vibe: "",
    ...over,
  };
}

/** A single invariant violation the simulator caught. */
export interface SimViolation {
  /** Stable invariant id (kebab-case). */
  invariant:
    | "no-spend-before-approval"
    | "over-budget-spend"
    | "over-questioning"
    | "under-questioning"
    | "dropped-choice"
    | "missing-replan";
  /** The 0-based turn index the violation fired on. */
  turn: number;
  /** What the simulator EXPECTED (the scripted behavior). */
  expected: string;
  /** What it GOT (the deterministic surface's actual answer). */
  got: string;
}

/** Per-turn record the simulator emits. */
export interface SimTurnRecord {
  /** 0-based turn index. */
  index: number;
  /** The utterance / answer replayed. */
  utterance: string;
  /** The contract phase the turn landed in. */
  phase: SimPhase;
  /** A one-line description of the action the agent WOULD take. */
  action: string;
  /** False when this turn produced ≥1 violation. */
  ok: boolean;
  /** The scripted expectation, summarized. */
  expected: string;
  /** What actually happened on the deterministic surfaces, summarized. */
  got: string;
}

/** The compact report `simulatePersona` returns. */
export interface SimReport {
  /** The persona id. */
  persona: string;
  /** The invariant the persona primarily exercises. */
  exercises: string;
  /** Per-turn records. */
  turns: SimTurnRecord[];
  /** Every violation caught across the conversation. */
  violations: SimViolation[];
}

/** Tracked state carried across the turns of one persona run. */
interface SimState {
  /** The temp project id (the ledger + gen-log live under it). */
  projectId: string;
  /** The brief accumulated so far (the latest confident utterance). */
  brief: string;
  /** The content mode locked so far (null until one classifies confidently). */
  lockedMode: ContentMode | null;
  /** The platform locked so far. */
  platform: string;
  /** The style / register locked so far. */
  style: string;
  /** True once the user has recorded a spend approval (#444). */
  approvalRecorded: boolean;
  /** True once a plan has been built at least once. */
  planned: boolean;
}

/** Build (or rebuild) the plan for the current state — STUBBED enrichment, no network. */
async function buildPlan(state: SimState): Promise<PlanGradeVerdict> {
  const enrich = async () => cannedEnrichment(state.style ? { register: state.style } : {});
  const { plan } = await buildProductionPlan(
    { projectId: state.projectId, brief: state.brief, platform: state.platform || undefined },
    { candidates: [], enrich },
  );
  state.planned = true;
  // Grade the plan deterministically (#432) — the verdict is surfaced in the
  // turn's `got` so a regression in plan quality shows up in the report.
  return gradePlanDeterministic(plan).verdict;
}

/**
 * Replay one persona through the deterministic surfaces and return its report.
 * Owns a TEMP project root for the duration so the spend ledger + gen-log are
 * isolated and real-on-disk (then restores the previous root + cleans up).
 */
export async function simulatePersona(persona: Persona): Promise<SimReport> {
  const prevRoot = process.cwd();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-sim-431-"));
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
  setRoot(tmpRoot);

  const state: SimState = {
    projectId: `sim-${persona.id}`,
    brief: "",
    lockedMode: null,
    platform: "",
    style: "",
    approvalRecorded: false,
    planned: false,
  };

  const turns: SimTurnRecord[] = [];
  const violations: SimViolation[] = [];

  try {
    for (let i = 0; i < persona.turns.length; i++) {
      const rec = await runTurn(persona.turns[i]!, i, state, violations);
      turns.push(rec);
    }
  } finally {
    setRoot(prevRoot);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }

  return { persona: persona.id, exercises: persona.exercises, turns, violations };
}

/** Replay a single turn, mutating `state` + appending any violations. */
async function runTurn(
  turn: SimTurn,
  index: number,
  state: SimState,
  violations: SimViolation[],
): Promise<SimTurnRecord> {
  const before = violations.length;
  const expectedParts: string[] = [`phase=${turn.expect.phase}`];
  const gotParts: string[] = [];

  // ── 1. Classify the utterance (intake routing + ambiguous→ask) ──
  const cls = classifyContentMode(turn.utterance);
  gotParts.push(`classify=${cls.mode ?? "null"}${cls.ambiguous ? "(ambiguous)" : ""}`);

  // (b) Over / under questioning — only checked when the script states an
  // expectation. A confident-expected turn that the classifier flags ambiguous
  // is over-questioning; an ambiguous-expected turn the classifier resolved
  // confidently is under-questioning.
  if (turn.expect.asksQuestion === false) {
    expectedParts.push("no-ask");
    if (cls.ambiguous) {
      violations.push({
        invariant: "over-questioning",
        turn: index,
        expected: "proceed confidently (no clarifying question)",
        got: `classifier flagged ambiguous for "${turn.utterance}" (would ask)`,
      });
    }
  } else if (turn.expect.asksQuestion === true) {
    expectedParts.push("ask");
    if (!cls.ambiguous) {
      violations.push({
        invariant: "under-questioning",
        turn: index,
        expected: "ask one clarifying question (brief is ambiguous)",
        got: `classifier resolved confidently to "${cls.mode}" (would not ask)`,
      });
    }
  }

  // ── 2. Lock / preserve the content mode ──
  // A confident (non-ambiguous) classification locks the mode + extends the
  // brief. (c) Dropped-choice: a NEW confident mode that differs from the locked
  // one WITHOUT a declared change is a silent drift.
  if (!cls.ambiguous && cls.mode) {
    if (state.lockedMode && cls.mode !== state.lockedMode && !turn.change) {
      violations.push({
        invariant: "dropped-choice",
        turn: index,
        expected: `keep the locked mode "${state.lockedMode}" (no change declared)`,
        got: `turn reclassified to "${cls.mode}" — choice silently changed`,
      });
    }
    state.lockedMode = cls.mode;
    state.brief = turn.utterance;
  } else if (state.brief) {
    // A terse / ambiguous follow-up that does NOT reclassify must preserve the
    // locked mode (the choice survives the answer). Append the answer text so a
    // re-plan sees the fuller brief.
    state.brief = `${state.brief}. ${turn.utterance}`;
  }
  gotParts.push(`lockedMode=${state.lockedMode ?? "null"}`);

  // ── 3. Apply a mid-flow change + re-plan (#431 recovery) ──
  if (turn.change) {
    if (turn.change.kind === "platform") state.platform = turn.change.to;
    if (turn.change.kind === "style") state.style = turn.change.to;
    if (turn.change.kind === "product") state.brief = `${state.brief}. now for ${turn.change.to}`;
  }

  // ── 4. (a) Approval — record it into the #444 ledger ──
  if (turn.approval) {
    await recordApproval(state.projectId, {
      scope: "project",
      budgetCapUsd: turn.approval.budgetCapUsd,
      reason: turn.approval.reason,
      allowedModes: turn.approval.allowedModes,
    });
    state.approvalRecorded = true;
    gotParts.push(`approved=$${turn.approval.budgetCapUsd}`);
  }

  // ── 5. Plan / re-plan ──
  // Re-plan when this turn lands in the production-plan phase, OR when a
  // legitimate mid-flow change fired. (d) Missing-replan: a change turn that did
  // not trigger a rebuild is a violation.
  const wantsPlan =
    turn.expect.phase === "production-plan" || turn.expect.phase === "approval" || !!turn.change;
  let replanned = false;
  if (wantsPlan && state.lockedMode) {
    const verdict = await buildPlan(state);
    replanned = true;
    gotParts.push(`plan=${verdict}`);
  }
  if (turn.expect.replanned) {
    expectedParts.push("replan");
    if (!replanned) {
      violations.push({
        invariant: "missing-replan",
        turn: index,
        expected: `re-build the plan after the ${turn.change?.kind ?? "mid-flow"} change`,
        got: "no fresh production plan was built this turn",
      });
    }
  }

  // ── 6. (a) Paid step — gate it through the #444 spend governor ──
  if (turn.paidStep) {
    const estimatedUsd = estimatedCallCostUsd({
      kind: turn.paidStep.kind,
      model: turn.paidStep.model,
      durationSec: turn.paidStep.durationSec,
      variants: turn.paidStep.variants,
    });
    const verdict = await checkSpend(state.projectId, {
      estimatedUsd,
      mode: state.lockedMode ?? undefined,
      now: new Date().toISOString(),
    });
    gotParts.push(`spend=${verdict.allowed ? "allowed" : "blocked"}($${estimatedUsd.toFixed(2)})`);

    // The agent would ONLY run the paid call when the governor allows it. When
    // it does, record the cost into the gen-log so the cap accounts for it on
    // the NEXT turn (actual spend = sum of gen-log cost_usd).
    if (verdict.allowed) {
      await logGeneration(state.projectId, {
        provider: "openrouter",
        model: turn.paidStep.model ?? "stub-model",
        endpoint: turn.paidStep.model ?? "stub-model",
        kind: turn.paidStep.kind,
        input: { slot: `turn-${index}`, project: state.projectId },
        status: "ok",
        cost_usd: estimatedUsd,
      });
    }

    // Script expects the step ALLOWED but the governor blocked it (or it ran
    // with no approval) → no-spend-before-approval / over-budget violation.
    if (turn.expect.paidAllowed) {
      expectedParts.push("paid-allowed");
      if (!verdict.allowed) {
        violations.push({
          invariant: !state.approvalRecorded ? "no-spend-before-approval" : "over-budget-spend",
          turn: index,
          expected: "paid generation allowed (approval recorded, under cap)",
          got: `spend governor blocked it: ${verdict.reason ?? "no approval"}`,
        });
      } else if (!state.approvalRecorded) {
        // The script claimed "allowed" but NO approval was ever recorded. The
        // governor pass-through (no ledger) let it through — that is exactly the
        // spend-before-approval hole the harness must catch.
        violations.push({
          invariant: "no-spend-before-approval",
          turn: index,
          expected: "no paid generation before the user records an approval (#444)",
          got: "paid step ran with no approval on the ledger (governor pass-through let it through)",
        });
      }
    }
    // Script expects the step BLOCKED but the governor allowed it → a budget
    // hole (the cap did not bite).
    if (turn.expect.paidBlocked) {
      expectedParts.push("paid-blocked");
      if (verdict.allowed) {
        violations.push({
          invariant: "over-budget-spend",
          turn: index,
          expected: "paid generation blocked (would breach the approved cap)",
          got: `spend governor allowed it (remaining $${verdict.remainingUsd ?? "n/a"})`,
        });
      }
    }
  }

  // ── 7. (c) Choice preservation — the locked mode must match the script ──
  if (turn.expect.lockedMode) {
    expectedParts.push(`mode=${turn.expect.lockedMode}`);
    if (state.lockedMode !== turn.expect.lockedMode) {
      violations.push({
        invariant: "dropped-choice",
        turn: index,
        expected: `locked mode stays "${turn.expect.lockedMode}"`,
        got: `locked mode is "${state.lockedMode ?? "null"}"`,
      });
    }
  }

  const ok = violations.length === before;
  return {
    index,
    utterance: turn.utterance,
    phase: turn.expect.phase,
    action: describeAction(turn, state, replanned),
    ok,
    expected: expectedParts.join(", "),
    got: gotParts.join(", "),
  };
}

/** One-line human description of the action the agent would take this turn. */
function describeAction(turn: SimTurn, state: SimState, replanned: boolean): string {
  if (turn.expect.asksQuestion) return "ask one clarifying question (ambiguous brief)";
  if (turn.paidStep) return `run paid ${turn.paidStep.kind} generation`;
  if (turn.approval) return `record a $${turn.approval.budgetCapUsd} spend approval`;
  if (replanned) return `(re)build + grade the production plan${turn.change ? ` after ${turn.change.kind} change` : ""}`;
  if (state.lockedMode) return `proceed with locked mode "${state.lockedMode}"`;
  return "continue intake";
}

/** Render a one-line-per-turn compact summary for the test console. */
export function summarizeReport(report: SimReport): string {
  const head = `${report.persona} (${report.exercises}) — ${report.violations.length} violation(s)`;
  const rows = report.turns.map(
    (t) => `  [${t.index}] ${t.ok ? "OK  " : "FAIL"} ${t.phase.padEnd(16)} ${t.action}`,
  );
  const viol = report.violations.map(
    (v) => `  ! ${v.invariant} @turn ${v.turn}: expected ${v.expected}; got ${v.got}`,
  );
  return [head, ...rows, ...viol].join("\n");
}
