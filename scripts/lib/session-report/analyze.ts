// scripts/lib/session-report/analyze.ts — #562
//
// Per-session attribution of wall time, tokens and tool calls to phases.
//
// Phase resolution (deterministic):
//   1. Each call is classified from its ops (`classifyOps`, one table in
//      phases.ts). Calls with a signal are anchors.
//   2. Dev-turn demotion: in a turn (prompt to prompt) that has a strong `dev`
//      signal and no strong production signal, weak production signals (skill
//      loads, mode-doc reads) become `dev` — editing a skill is not running it.
//   3. Every other event takes the nearest preceding anchor in its turn, else
//      the first following anchor in its turn, else the last anchor of an
//      earlier turn, else `other`. A model response that issued calls takes
//      its first call's phase; a background-job notification takes the phase
//      of the call that launched the job.
//
// Time attribution: timeline points (prompts, model responses, call start /
// end, notifications) are sorted; each delta between consecutive points goes
// to the phase of the LATER point. Deltas that end at a prompt are user wait
// (not agent time, mirroring docs/perf-targets.md "user feedback iteration
// does not count"); deltas longer than `idleGapMs` are idle (session left
// open). Deltas ending at a call end are tool time, at a notification are
// background wait, anything else is model time.

import type { CallEvent, NormSession, Op, TokenUsage } from "./types.js";
import { PHASES, PRODUCTION_PHASES, classifyOps, type Phase, type Signal } from "./phases.js";
import { extractRalphyInvocations } from "./shell.js";

export interface ReportOptions {
  /** Gaps longer than this are idle, not agent time. */
  idleGapMs: number;
  /** Background waits / blocking waits longer than this are flagged. */
  waitThresholdMs: number;
  /** Tool outputs larger than this (characters) are flagged. */
  largeOutputChars: number;
  /** A file read this many times in one session is flagged. */
  repeatedReadMin: number;
  /** How many following ops to search for a retry of a failed op. */
  retryWindow: number;
  /** Token-set similarity at or above which two ops count as the same call. */
  retrySimilarity: number;
  /** Examples kept per waste finding. */
  topExamples: number;
  /** Replace private path segments and command arguments in examples. */
  redact: boolean;
}

export const DEFAULT_OPTIONS: ReportOptions = {
  idleGapMs: 30 * 60_000,
  waitThresholdMs: 120_000,
  largeOutputChars: 20_000,
  repeatedReadMin: 3,
  retryWindow: 3,
  retrySimilarity: 0.8,
  topExamples: 5,
  redact: false,
};

export interface PhaseStats {
  activeMs: number;
  modelMs: number;
  toolMs: number;
  bgWaitMs: number;
  tokens: TokenUsage;
  calls: number;
  failedCalls: number;
}

export interface CallInfo {
  call: CallEvent;
  eventIndex: number;
  turn: number;
  signal: Signal | null;
  /** True when a weak production signal was demoted to dev (rule 2). */
  demoted: boolean;
  phase: Phase;
}

export interface SessionAnalysis {
  session: NormSession;
  startTs?: number;
  endTs?: number;
  spanMs: number;
  activeMs: number;
  userWaitMs: number;
  idleMs: number;
  humanPrompts: number;
  turns: number;
  tokens: TokenUsage;
  calls: number;
  failedCalls: number;
  phases: Record<Phase, PhaseStats>;
  callInfos: CallInfo[];
  /** Timeline deltas, kept for the wait detector. */
  gaps: Gap[];
  renderInvocations: number;
  renderedProjects: string[];
}

export interface Gap {
  fromTs: number;
  toTs: number;
  ms: number;
  toKind: PointKind;
  phase: Phase;
  /** Background jobs still running during the gap. */
  outstanding: number;
  /** Call whose job finished at the end of the gap (notifications only). */
  callId?: string;
}

type PointKind = "prompt" | "model" | "callStart" | "callEnd" | "notification" | "mark";

interface Point {
  ts: number;
  kind: PointKind;
  phase: Phase;
  order: number;
  callId?: string;
}

export function emptyUsage(): TokenUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

export function addUsage(into: TokenUsage, u: TokenUsage | undefined): void {
  if (!u) return;
  into.input += u.input;
  into.output += u.output;
  into.cacheRead += u.cacheRead;
  into.cacheWrite += u.cacheWrite;
}

export function totalTokens(u: TokenUsage): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

function emptyStats(): PhaseStats {
  return { activeMs: 0, modelMs: 0, toolMs: 0, bgWaitMs: 0, tokens: emptyUsage(), calls: 0, failedCalls: 0 };
}

export function emptyPhaseRecord(): Record<Phase, PhaseStats> {
  const rec = {} as Record<Phase, PhaseStats>;
  for (const p of PHASES) rec[p] = emptyStats();
  return rec;
}

const PRODUCTION = new Set<Phase>(PRODUCTION_PHASES);

export function analyzeSession(session: NormSession, options: ReportOptions = DEFAULT_OPTIONS): SessionAnalysis {
  const events = session.events;
  const phases = emptyPhaseRecord();

  // 1. turns + call classification
  const turnOf: number[] = new Array(events.length);
  let turn = 0;
  let humanPrompts = 0;
  events.forEach((e, i) => {
    if (e.kind === "prompt") {
      turn++;
      if (e.from === "human") humanPrompts++;
    }
    turnOf[i] = turn;
  });
  const callInfos: CallInfo[] = [];
  const infoByEvent = new Map<number, CallInfo>();
  events.forEach((e, i) => {
    if (e.kind !== "call") return;
    const info: CallInfo = { call: e, eventIndex: i, turn: turnOf[i]!, signal: classifyOps(e.ops), demoted: false, phase: "other" };
    callInfos.push(info);
    infoByEvent.set(i, info);
  });

  // 2. dev-turn demotion
  const byTurn = new Map<number, CallInfo[]>();
  for (const info of callInfos) {
    const list = byTurn.get(info.turn) ?? [];
    list.push(info);
    byTurn.set(info.turn, list);
  }
  for (const list of byTurn.values()) {
    const strongDev = list.some((c) => c.signal?.strength === "strong" && c.signal.phase === "dev");
    const strongProd = list.some((c) => c.signal?.strength === "strong" && PRODUCTION.has(c.signal.phase));
    if (!strongDev || strongProd) continue;
    for (const c of list) {
      if (c.signal && c.signal.strength === "weak" && PRODUCTION.has(c.signal.phase)) {
        c.signal = { ...c.signal, phase: "dev" };
        c.demoted = true;
      }
    }
  }

  // 3. resolve phases for every event
  const resolved: Phase[] = new Array(events.length);
  let carry: Phase = "other";
  let i = 0;
  while (i < events.length) {
    const t = turnOf[i]!;
    let j = i;
    while (j < events.length && turnOf[j] === t) j++;
    // events [i, j) form one turn
    let firstAnchor: Phase | undefined;
    for (let k = i; k < j; k++) {
      const info = infoByEvent.get(k);
      if (info?.signal) {
        firstAnchor = info.signal.phase;
        break;
      }
    }
    let prev: Phase | undefined;
    for (let k = i; k < j; k++) {
      const info = infoByEvent.get(k);
      if (info?.signal) prev = info.signal.phase;
      resolved[k] = prev ?? firstAnchor ?? carry;
    }
    if (prev) carry = prev;
    i = j;
  }
  const phaseByCall = new Map<string, Phase>();
  for (const info of callInfos) {
    info.phase = resolved[info.eventIndex]!;
    phaseByCall.set(info.call.id, info.phase);
  }

  // 4. timeline points, tokens, call counts
  const points: Point[] = [];
  const tokens = emptyUsage();
  let order = 0;
  let calls = 0;
  let failedCalls = 0;
  const backgroundSpans: { start: number; end: number }[] = [];
  events.forEach((e, k) => {
    const phase = resolved[k]!;
    switch (e.kind) {
      case "prompt":
        points.push({ ts: e.ts, kind: "prompt", phase, order: order++ });
        return;
      case "interrupt":
      case "mark":
        points.push({ ts: e.ts, kind: "mark", phase, order: order++ });
        return;
      case "model": {
        const own = e.callIds.length ? phaseByCall.get(e.callIds[0]!) : undefined;
        const p = own ?? phase;
        addUsage(phases[p].tokens, e.usage);
        addUsage(tokens, e.usage);
        if (e.timeline) points.push({ ts: e.ts, kind: "model", phase: p, order: order++ });
        return;
      }
      case "notification": {
        const p = (e.callId && phaseByCall.get(e.callId)) || phase;
        points.push({ ts: e.ts, kind: "notification", phase: p, order: order++, callId: e.callId });
        return;
      }
      case "call": {
        if (!e.synthetic) {
          calls++;
          phases[phase].calls++;
          if (e.isError) {
            failedCalls++;
            phases[phase].failedCalls++;
          }
        }
        points.push({ ts: e.ts, kind: "callStart", phase, order: order++, callId: e.id });
        if (e.endTs !== undefined && e.endTs >= e.ts) points.push({ ts: e.endTs, kind: "callEnd", phase, order: order++, callId: e.id });
        if (e.background && e.backgroundEndTs !== undefined) backgroundSpans.push({ start: e.endTs ?? e.ts, end: e.backgroundEndTs });
        return;
      }
    }
  });
  points.sort((a, b) => a.ts - b.ts || a.order - b.order);

  let activeMs = 0;
  let userWaitMs = 0;
  let idleMs = 0;
  const gaps: Gap[] = [];
  for (let k = 1; k < points.length; k++) {
    const from = points[k - 1]!;
    const to = points[k]!;
    const d = to.ts - from.ts;
    if (d <= 0) continue;
    const outstanding = backgroundSpans.filter((s) => s.start <= from.ts && s.end >= to.ts).length;
    gaps.push({ fromTs: from.ts, toTs: to.ts, ms: d, toKind: to.kind, phase: to.phase, outstanding, callId: to.kind === "notification" ? to.callId : undefined });
    if (to.kind === "prompt") {
      userWaitMs += d;
      continue;
    }
    if (d > options.idleGapMs) {
      idleMs += d;
      continue;
    }
    activeMs += d;
    const stats = phases[to.phase];
    stats.activeMs += d;
    if (to.kind === "callEnd") stats.toolMs += d;
    else if (to.kind === "notification") stats.bgWaitMs += d;
    else stats.modelMs += d;
  }

  // 5. renders (for per-video normalization)
  let renderInvocations = 0;
  const rendered = new Set<string>();
  for (const info of callInfos) {
    for (const op of info.call.ops) {
      if (!op.command) continue;
      for (const inv of extractRalphyInvocations(op.command)) {
        if (inv.verb !== "render") continue;
        renderInvocations++;
        const id = inv.positional[0];
        if (id && /^[a-z0-9][a-z0-9._-]*$/i.test(id)) rendered.add(id);
      }
    }
  }

  const startTs = points.length ? points[0]!.ts : undefined;
  const endTs = points.length ? points[points.length - 1]!.ts : undefined;
  return {
    session,
    startTs,
    endTs,
    spanMs: startTs !== undefined && endTs !== undefined ? endTs - startTs : 0,
    activeMs,
    userWaitMs,
    idleMs,
    humanPrompts,
    turns: turn,
    tokens,
    calls,
    failedCalls,
    phases,
    callInfos,
    gaps,
    renderInvocations,
    renderedProjects: [...rendered].sort(),
  };
}

/** Duration of one op, preferring the background completion when known. */
export function opDurationMs(op: Op): number | undefined {
  if (op.startTs === undefined) return undefined;
  const end = op.background && op.backgroundEndTs !== undefined ? op.backgroundEndTs : op.endTs;
  if (end === undefined || end < op.startTs) return undefined;
  return end - op.startTs;
}
