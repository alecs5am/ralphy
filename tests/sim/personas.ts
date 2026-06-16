// Scripted user personas for the agent user simulator (issue #431).
//
// The agent's real risk is MULTI-TURN behavior: low-tech users answer briefly,
// omit constraints, change their mind, or approve paid generation too early. A
// single prompt benchmark (#430) catches routing but not the across-turn
// invariants — over-questioning, the missing approval gate, a dropped choice, a
// missing re-plan after a mid-flow product/platform/style change.
//
// A persona is a SCRIPTED sequence of turns. Each turn carries an utterance /
// answer, optionally a mid-flow change (the user swaps product / platform /
// style), optionally an approval (the user records a spend cap), optionally a
// paid-generation step the agent WOULD take, and the EXPECTED phase + behavior.
// The simulator (`tests/sim/simulator.ts`) replays the turns through the
// DETERMINISTIC surfaces the agent's loop is built on — `classifyContentMode`
// (intake routing + ambiguous→ask), `buildProductionPlan` (planning, LLM
// enrichment STUBBED), `gradeProductionPlan` (plan quality), and the #444 spend
// governor (`checkSpend` / `recordApproval`) — and asserts the invariants.
//
// English-only on disk (docs/developing-ralphy.md): every utterance / answer is
// plain English. The terse / vague personas use OFF-DOMAIN English where a
// foreign-language string would otherwise be tempting — the same low-keyword
// path the classifier hits on a vague brief.

import type { ContentMode } from "../../cli/lib/content-modes.js";

/** Which contract phase a turn exercises (subset of CONTRACT_PHASES ids + the ask gate). */
export type SimPhase =
  | "intake" // a clarifying-question turn (no confident mode yet → ask)
  | "content-mode" // a brief that classifies to a confident mode
  | "production-plan" // the plan is (re)built + graded
  | "approval" // the user records a spend approval
  | "assets"; // a paid generation step the agent would run

/** What changed mid-flow — the recovery axis (#431 acceptance: recover after a swap). */
export type ChangeKind = "product" | "platform" | "style";

/** A mid-flow change the user introduces on a turn. */
export interface MidFlowChange {
  /** Which axis the user swapped. */
  kind: ChangeKind;
  /** The new value (a product noun, a platform name, or a style/register). */
  to: string;
}

/** A spend approval the user records on a turn (feeds the #444 ledger). */
export interface TurnApproval {
  /** Hard USD cap the user approves for the project. */
  budgetCapUsd: number;
  /** User-facing reason (auditable, English-on-disk). */
  reason: string;
  /** Optional modes the approval restricts to (omitted = any mode). */
  allowedModes?: ContentMode[];
}

/** A paid generation step the agent WOULD take on a turn. */
export interface PaidStep {
  /** What kind of paid call (drives the per-kind cost estimate). */
  kind: "image" | "video" | "voiceover" | "music" | "sfx";
  /** Optional model id (else the per-kind default price applies). */
  model?: string;
  /** Optional duration for a video call (seconds). */
  durationSec?: number;
  /** Optional variant count (multiplies the estimate). */
  variants?: number;
}

/** The expected outcome of a turn — what the simulator asserts against. */
export interface TurnExpectation {
  /** The phase this turn should land in. */
  phase: SimPhase;
  /**
   * True when the agent SHOULD ask a clarifying question (the brief is
   * ambiguous / nothing classifies). The simulator flags over-questioning when
   * a confident turn expects NO ask but the classifier still flags ambiguous,
   * and under-questioning when an ambiguous turn was expected to ask but didn't.
   */
  asksQuestion?: boolean;
  /** The content mode the agent should have locked by the end of this turn (when known). */
  lockedMode?: ContentMode;
  /** A paid step on this turn MUST be allowed by the spend governor (post-approval, under cap). */
  paidAllowed?: boolean;
  /** A paid step on this turn MUST be blocked by the spend governor (no approval yet / over cap). */
  paidBlocked?: boolean;
  /** This turn carries a legitimate mid-flow change, so the plan MUST be re-built. */
  replanned?: boolean;
}

/** One scripted turn in a persona conversation. */
export interface SimTurn {
  /** The user's utterance / answer this turn (plain English). */
  utterance: string;
  /** A mid-flow change the user introduces (optional). */
  change?: MidFlowChange;
  /** A spend approval the user records this turn (optional). */
  approval?: TurnApproval;
  /** A paid generation step the agent would attempt this turn (optional). */
  paidStep?: PaidStep;
  /** The expected phase + behavior. */
  expect: TurnExpectation;
  /** Short English note on the turn's intent. */
  note?: string;
}

/** A scripted persona = an ordered turn array + the invariant it primarily exercises. */
export interface Persona {
  /** Stable persona id (kebab-case). */
  id: string;
  /** One-line description of the persona archetype. */
  description: string;
  /** The primary invariant this persona stresses (for the report breakdown). */
  exercises: string;
  /** The scripted conversation. */
  turns: SimTurn[];
  /**
   * True when the persona's script contains a DELIBERATE bad move the simulator
   * MUST catch (the teeth case). The harness asserts a well-behaved persona has
   * zero violations and a teeth persona has ≥1.
   */
  hasDeliberateViolation?: boolean;
}

// ─── The personas ─────────────────────────────────────────────────────────────

/**
 * 1. Terse founder — answers in the fewest words possible. Opens with a clear,
 * confident mode (no over-questioning allowed), gives a one-word budget answer,
 * approves, then a paid step lands within cap. Exercises: asks-only-necessary +
 * choice preservation across a terse follow-up.
 */
const TERSE_FOUNDER: Persona = {
  id: "terse-founder",
  description: "Founder who answers in the fewest words; clear ask, fast approval.",
  exercises: "asks-only-necessary-questions + choice preservation",
  turns: [
    {
      utterance: "ugc review video of my serum",
      expect: { phase: "content-mode", asksQuestion: false, lockedMode: "ugc-review" },
      note: "Confident mode on turn 1 — the agent must NOT ask a redundant question.",
    },
    {
      utterance: "English. 15 seconds.",
      expect: { phase: "production-plan", lockedMode: "ugc-review" },
      note: "Terse follow-up; the locked mode must survive (no silent drift).",
    },
    {
      utterance: "go. cap 5 dollars.",
      approval: { budgetCapUsd: 5, reason: "founder approved a $5 cap" },
      expect: { phase: "approval", lockedMode: "ugc-review" },
    },
    {
      utterance: "make it",
      paidStep: { kind: "image", model: "google/gemini-3-pro-image-preview" },
      expect: { phase: "assets", paidAllowed: true, lockedMode: "ugc-review" },
      note: "Paid step AFTER approval, under the $5 cap → allowed.",
    },
  ],
};

/**
 * 2. Impatient marketer — wants to generate NOW, before approving any budget.
 * The deterministic teeth case: the script attempts a paid step on turn 2 with
 * NO approval recorded. The spend governor must block it; the simulator catches
 * the persona's bad move (it scripts `paidAllowed: true` against a no-approval
 * state, which the governor refuses). Exercises: no-spend-before-approval.
 */
const IMPATIENT_MARKETER: Persona = {
  id: "impatient-marketer",
  description: "Marketer who tries to generate before approving any budget (teeth case).",
  exercises: "no-spend-before-approval (deliberate violation)",
  hasDeliberateViolation: true,
  turns: [
    {
      utterance: "make me a bunch of meta ads for my brand",
      expect: { phase: "content-mode", asksQuestion: false, lockedMode: "ad-creative-pack" },
    },
    {
      utterance: "just generate them already, skip the plan",
      paidStep: { kind: "image", model: "openai/gpt-5.4-image-2", variants: 4 },
      // DELIBERATE BAD MOVE: the script claims the paid step should be allowed,
      // but no approval has been recorded. The governor blocks; the simulator
      // flags the mismatch as a violation (the harness has teeth).
      expect: { phase: "assets", paidAllowed: true, lockedMode: "ad-creative-pack" },
      note: "Spend-before-approval — must be caught.",
    },
  ],
};

/**
 * 3. Vague creator — types a goal, not a deliverable. The classifier must stay
 * ambiguous and the agent must ASK, never confidently mis-route. Then the
 * creator names a real kind and the agent proceeds. Exercises: ambiguous→ask.
 */
const VAGUE_CREATOR: Persona = {
  id: "vague-creator",
  description: "Creator who opens with a goal, not a content kind; must be asked.",
  exercises: "ambiguous→ask-a-question",
  turns: [
    {
      utterance: "i want to grow my following",
      expect: { phase: "intake", asksQuestion: true },
      note: "A business outcome, no deliverable named → ask, do not guess.",
    },
    {
      utterance: "make me something for tiktok about my app",
      expect: { phase: "intake", asksQuestion: true },
      note: "Platform + subject but no content kind → still ambiguous, ask again.",
    },
    {
      utterance: "ok an unboxing video opening the box of my gadget",
      expect: { phase: "content-mode", asksQuestion: false, lockedMode: "unboxing-ugc" },
      note: "Now a concrete kind → confident, no more questions.",
    },
  ],
};

/**
 * 4. Brand-safe client — locks a style, then swaps the style mid-flow. The agent
 * must RE-PLAN on the change (not silently keep the old register) and must not
 * drop the locked content mode. Exercises: mid-flow style-change recovery.
 */
const BRAND_SAFE_CLIENT: Persona = {
  id: "brand-safe-client",
  description: "Client who locks a style then swaps it mid-flow; agent must re-plan.",
  exercises: "mid-flow style-change recovery (#431 recover-after-change)",
  turns: [
    {
      utterance: "a polished tv commercial spot for the brand, cinematic 90s film look",
      expect: { phase: "content-mode", asksQuestion: false, lockedMode: "tv-ad" },
    },
    {
      utterance: "draft the plan",
      expect: { phase: "production-plan", lockedMode: "tv-ad" },
    },
    {
      utterance: "actually make it a bright high-key old-spice absurd look instead",
      change: { kind: "style", to: "old-spice absurd high-key" },
      expect: { phase: "production-plan", replanned: true, lockedMode: "tv-ad" },
      note: "Legitimate style swap → must re-build the plan; mode stays tv-ad.",
    },
  ],
};

/**
 * 5. Budget-sensitive buyer — approves a TIGHT cap, then a paid batch that would
 * blow it. The governor must allow the first under-cap step and block the
 * over-cap one. Exercises: budget-cap enforcement (no over-budget spend).
 */
const BUDGET_SENSITIVE_BUYER: Persona = {
  id: "budget-sensitive-buyer",
  description: "Buyer with a tight cap; one step fits, the next overruns.",
  exercises: "budget-cap enforcement (#444)",
  turns: [
    {
      utterance: "make a 2d cartoon animation short with my mascot",
      expect: { phase: "content-mode", asksQuestion: false, lockedMode: "cartoon-animation" },
    },
    {
      utterance: "go but keep it cheap, cap at 0.50",
      approval: { budgetCapUsd: 0.5, reason: "buyer approved a tight $0.50 cap" },
      expect: { phase: "approval", lockedMode: "cartoon-animation" },
    },
    {
      utterance: "first anchor",
      paidStep: { kind: "image", model: "google/gemini-2.5-flash-image" }, // ~$0.02
      expect: { phase: "assets", paidAllowed: true, lockedMode: "cartoon-animation" },
      note: "One cheap image fits under $0.50 → allowed.",
    },
    {
      utterance: "now render the whole video",
      paidStep: { kind: "video", model: "kwaivgi/kling-v3.0-pro", durationSec: 25 }, // >> $0.50
      expect: { phase: "assets", paidBlocked: true, lockedMode: "cartoon-animation" },
      note: "A 25s video overruns the $0.50 cap → must be blocked.",
    },
  ],
};

/**
 * 6. Platform-pivot creator — confidently routed, plan drafted, then pivots the
 * target platform. The agent must re-plan against the new platform without
 * dropping the locked mode. Exercises: mid-flow platform-change recovery + plan
 * grading stays strong/weak (not blocked) across the pivot.
 */
const PLATFORM_PIVOT_CREATOR: Persona = {
  id: "platform-pivot-creator",
  description: "Creator who pivots the target platform after the plan is drafted.",
  exercises: "mid-flow platform-change recovery",
  turns: [
    {
      utterance: "a how-to tutorial video showing step by step how to use my app",
      expect: { phase: "content-mode", asksQuestion: false, lockedMode: "tutorial-ugc" },
    },
    {
      utterance: "plan it for tiktok",
      change: { kind: "platform", to: "tiktok" },
      expect: { phase: "production-plan", replanned: true, lockedMode: "tutorial-ugc" },
    },
    {
      utterance: "actually target youtube shorts instead",
      change: { kind: "platform", to: "youtube" },
      expect: { phase: "production-plan", replanned: true, lockedMode: "tutorial-ugc" },
      note: "Platform pivot → re-plan; mode must stay tutorial-ugc.",
    },
  ],
};

/** All personas the simulator replays. */
export const PERSONAS: Persona[] = [
  TERSE_FOUNDER,
  IMPATIENT_MARKETER,
  VAGUE_CREATOR,
  BRAND_SAFE_CLIENT,
  BUDGET_SENSITIVE_BUYER,
  PLATFORM_PIVOT_CREATOR,
];

/** Well-behaved personas — the simulator must report ZERO violations for these. */
export const WELL_BEHAVED_PERSONAS: Persona[] = PERSONAS.filter((p) => !p.hasDeliberateViolation);

/** Teeth personas — the simulator MUST catch ≥1 deliberate violation. */
export const TEETH_PERSONAS: Persona[] = PERSONAS.filter((p) => p.hasDeliberateViolation);
