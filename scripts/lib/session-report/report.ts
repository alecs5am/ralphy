// scripts/lib/session-report/report.ts — #562
//
// Aggregates analyzed sessions into the report: per-phase table, comparison
// against docs/perf-targets.md (stage budgets + per-call latency budgets),
// and the waste list. `formatText` renders it for the terminal; `--json`
// prints the `Report` object as is.

import type { NormSession, TokenUsage } from "./types.js";
import { PHASES, PRODUCTION_PHASES, verbLabel, type Phase } from "./phases.js";
import { addUsage, analyzeSession, emptyUsage, opDurationMs, totalTokens, type ReportOptions, type SessionAnalysis } from "./analyze.js";
import { detectWaste, displayPath, shortSession, type WasteFinding } from "./waste.js";
import { extractRalphyInvocations, isCompoundCommand } from "./shell.js";

export interface PhaseRow {
  phase: Phase;
  sessions: number;
  activeMs: number;
  modelMs: number;
  toolMs: number;
  bgWaitMs: number;
  subagentActiveMs: number;
  tokens: TokenUsage;
  calls: number;
  failedCalls: number;
}

export interface SessionRow {
  id: string;
  source: string;
  subagent: boolean;
  parent?: string;
  file: string;
  cwd?: string;
  start?: string;
  spanMs: number;
  activeMs: number;
  userWaitMs: number;
  idleMs: number;
  humanPrompts: number;
  calls: number;
  failedCalls: number;
  tokens: TokenUsage;
  topPhase: Phase;
  productionMs: number;
  renderInvocations: number;
  renderedProjects: number;
  reportedCostUsd?: number;
  compactions: number;
  badLines: number;
}

/** Stage budgets from docs/perf-targets.md "Single video", in minutes. */
export const STAGE_TARGETS = [
  { stage: "brief → scenario", phases: ["intake", "content-mode", "research", "scenario"] as Phase[], coldMin: 1, customMin: 5 },
  { stage: "scenario → assets ready", phases: ["prompts", "assets"] as Phase[], coldMin: 3, customMin: 10 },
  { stage: "assets → final mp4", phases: ["render"] as Phase[], coldMin: 4, customMin: 5 },
] as const;
export const TOTAL_TARGET = { coldMin: 8, customMin: 20 };

/** Per-call latency budgets from docs/perf-targets.md, in seconds. */
export const LATENCY_TARGETS: Record<string, { median: number; p95: number; note?: string }> = {
  "generate image": { median: 15, p95: 35 },
  "generate video": { median: 60, p95: 120, note: "kling 5s budget; veo 3.1 is 90 / 180" },
  "generate voiceover": { median: 4, p95: 8 },
  "generate music": { median: 10, p95: 25 },
  "generate captions": { median: 8, p95: 15 },
  render: { median: 30, p95: 90, note: "15s video" },
};

const NON_LATENCY_FLAGS = new Set(["--queue", "--dry-run", "--help", "-h", "--version"]);

export interface PerfRow {
  session: string;
  stageMs: number[];
  postRenderMs: number;
  productionMs: number;
  renderedProjects: number;
  perVideoMs: number;
}

export interface StageSummary {
  stage: string;
  /** Sessions that spent time in this stage (the medians cover only these). */
  n: number;
  medianMs: number;
  p75Ms: number;
  coldTargetMs: number;
  customTargetMs: number;
  overCustom: number;
}

export interface LatencyRow {
  verb: string;
  n: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  target?: { median: number; p95: number; note?: string };
}

export interface Report {
  generatedAt: string;
  options: ReportOptions;
  inputs: {
    files: number;
    unrecognized: number;
    sessions: number;
    mainSessions: number;
    subagentSessions: number;
    bySource: Record<string, number>;
    badLines: number;
    firstActivity?: string;
    lastActivity?: string;
  };
  totals: {
    spanMs: number;
    activeMs: number;
    subagentActiveMs: number;
    userWaitMs: number;
    idleMs: number;
    tokens: TokenUsage;
    calls: number;
    failedCalls: number;
    humanPrompts: number;
    reportedCostUsd: number;
  };
  phases: PhaseRow[];
  perf: {
    productionSessions: number;
    renderingSessions: number;
    rows: PerfRow[];
    stages: StageSummary[];
    total: StageSummary;
    perVideo: StageSummary;
  };
  latency: LatencyRow[];
  /** Tool calls by native tool name, largest first. */
  tools: { tool: string; calls: number; failed: number; outputChars: number }[];
  waste: WasteFinding[];
  sessions: SessionRow[];
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function isProductionSession(a: SessionAnalysis): boolean {
  const prod = new Set<Phase>(PRODUCTION_PHASES);
  return a.callInfos.some((c) => c.signal?.strength === "strong" && prod.has(c.signal.phase));
}

function summarize(stage: string, all: number[], coldMin: number, customMin: number): StageSummary {
  const values = all.filter((v) => v > 0);
  return {
    stage,
    n: values.length,
    medianMs: quantile(values, 0.5),
    p75Ms: quantile(values, 0.75),
    coldTargetMs: coldMin * 60_000,
    customTargetMs: customMin * 60_000,
    overCustom: values.filter((v) => v > customMin * 60_000).length,
  };
}

export function buildReport(sessions: NormSession[], options: ReportOptions, meta: { files: number; unrecognized: number }): Report {
  const analyses = sessions.map((s) => analyzeSession(s, options));
  const main = analyses.filter((a) => !a.session.isSubagent);
  const subs = analyses.filter((a) => a.session.isSubagent);

  const phases: PhaseRow[] = PHASES.map((phase) => {
    const row: PhaseRow = { phase, sessions: 0, activeMs: 0, modelMs: 0, toolMs: 0, bgWaitMs: 0, subagentActiveMs: 0, tokens: emptyUsage(), calls: 0, failedCalls: 0 };
    for (const a of analyses) {
      const s = a.phases[phase];
      if (s.activeMs > 0 || s.calls > 0 || totalTokens(s.tokens) > 0) row.sessions++;
      if (a.session.isSubagent) row.subagentActiveMs += s.activeMs;
      else {
        row.activeMs += s.activeMs;
        row.modelMs += s.modelMs;
        row.toolMs += s.toolMs;
        row.bgWaitMs += s.bgWaitMs;
      }
      addUsage(row.tokens, s.tokens);
      row.calls += s.calls;
      row.failedCalls += s.failedCalls;
    }
    return row;
  });

  // Perf targets: main sessions with at least one production action.
  const prodSessions = main.filter(isProductionSession);
  const rows: PerfRow[] = prodSessions.map((a) => {
    const stageMs = STAGE_TARGETS.map((t) => t.phases.reduce((n, p) => n + a.phases[p].activeMs, 0));
    const postRenderMs = (["eval", "repair", "unit", "postmortem"] as Phase[]).reduce((n, p) => n + a.phases[p].activeMs, 0);
    const productionMs = stageMs.reduce((n, v) => n + v, 0) + postRenderMs;
    const videos = a.renderedProjects.length;
    return { session: shortSession(a), stageMs, postRenderMs, productionMs, renderedProjects: videos, perVideoMs: videos > 0 ? productionMs / videos : productionMs };
  });
  const rendering = rows.filter((r) => r.renderedProjects > 0);
  const stages = STAGE_TARGETS.map((t, i) => summarize(t.stage, rows.map((r) => r.stageMs[i]!), t.coldMin, t.customMin));
  const total = summarize("total production time per session", rows.map((r) => r.productionMs), TOTAL_TARGET.coldMin, TOTAL_TARGET.customMin);
  const perVideo = summarize("production time per rendered project", rendering.map((r) => r.perVideoMs), TOTAL_TARGET.coldMin, TOTAL_TARGET.customMin);

  // Per-call latency: single, non-compound, successful ralphy invocations.
  const durations = new Map<string, number[]>();
  for (const a of analyses) {
    for (const info of a.callInfos) {
      for (const op of info.call.ops) {
        if (op.kind !== "shell" || !op.command || op.isError || (op.exitCode ?? 0) !== 0) continue;
        const inv = extractRalphyInvocations(op.command);
        if (inv.length !== 1 || isCompoundCommand(op.command)) continue;
        // Queued, dry-run and help calls return before the work happens; a background
        // job without a completion notice has no known end.
        if (inv[0]!.flags.some((f) => NON_LATENCY_FLAGS.has(f))) continue;
        if (op.background && op.backgroundEndTs === undefined) continue;
        if (op.outputHead && /"code"\s*:\s*"E_[A-Z_]+"/.test(op.outputHead)) continue;
        const ms = opDurationMs(op);
        if (ms === undefined) continue;
        const label = verbLabel(inv[0]!.verb, inv[0]!.sub);
        const list = durations.get(label) ?? [];
        list.push(ms);
        durations.set(label, list);
      }
    }
  }
  const latency: LatencyRow[] = [...durations.entries()]
    .map(([verb, list]) => ({ verb, n: list.length, medianMs: quantile(list, 0.5), p95Ms: quantile(list, 0.95), maxMs: Math.max(...list), target: LATENCY_TARGETS[verb] }))
    .sort((x, y) => (y.target ? 1 : 0) - (x.target ? 1 : 0) || y.n - x.n || x.verb.localeCompare(y.verb));

  const toolMap = new Map<string, { tool: string; calls: number; failed: number; outputChars: number }>();
  for (const a of analyses) {
    for (const info of a.callInfos) {
      if (info.call.synthetic) continue;
      const name = info.call.name.replace(/^mcp__/, "mcp:");
      const row = toolMap.get(name) ?? { tool: name, calls: 0, failed: 0, outputChars: 0 };
      row.calls++;
      if (info.call.isError) row.failed++;
      row.outputChars += info.call.outputChars ?? 0;
      toolMap.set(name, row);
    }
  }
  const tools = [...toolMap.values()].sort((x, y) => y.calls - x.calls || x.tool.localeCompare(y.tool));

  const tokens = emptyUsage();
  for (const a of analyses) addUsage(tokens, a.tokens);
  const starts = analyses.map((a) => a.startTs).filter((t): t is number => t !== undefined);
  const ends = analyses.map((a) => a.endTs).filter((t): t is number => t !== undefined);
  const bySource: Record<string, number> = {};
  for (const s of sessions) bySource[s.source] = (bySource[s.source] ?? 0) + 1;

  const sessionRows: SessionRow[] = analyses.map((a) => {
    let top: Phase = "other";
    let topMs = -1;
    for (const p of PHASES) {
      if (a.phases[p].activeMs > topMs) {
        top = p;
        topMs = a.phases[p].activeMs;
      }
    }
    const productionMs = PRODUCTION_PHASES.reduce((n, p) => n + a.phases[p].activeMs, 0);
    return {
      id: shortSession(a),
      source: a.session.source,
      subagent: a.session.isSubagent,
      parent: a.session.parentSessionId?.slice(0, 8),
      file: a.session.file.split("/").pop() ?? a.session.file,
      cwd: a.session.cwd ? displayPath(a.session.cwd, options.redact) : undefined,
      start: a.startTs !== undefined ? new Date(a.startTs).toISOString() : undefined,
      spanMs: a.spanMs,
      activeMs: a.activeMs,
      userWaitMs: a.userWaitMs,
      idleMs: a.idleMs,
      humanPrompts: a.humanPrompts,
      calls: a.calls,
      failedCalls: a.failedCalls,
      tokens: a.tokens,
      topPhase: top,
      productionMs,
      renderInvocations: a.renderInvocations,
      renderedProjects: a.renderedProjects.length,
      reportedCostUsd: a.session.reportedCostUsd,
      compactions: a.session.compactions,
      badLines: a.session.badLines,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    options,
    inputs: {
      files: meta.files,
      unrecognized: meta.unrecognized,
      sessions: sessions.length,
      mainSessions: main.length,
      subagentSessions: subs.length,
      bySource,
      badLines: sessions.reduce((n, s) => n + s.badLines, 0),
      firstActivity: starts.length ? new Date(Math.min(...starts)).toISOString() : undefined,
      lastActivity: ends.length ? new Date(Math.max(...ends)).toISOString() : undefined,
    },
    totals: {
      spanMs: main.reduce((n, a) => n + a.spanMs, 0),
      activeMs: main.reduce((n, a) => n + a.activeMs, 0),
      subagentActiveMs: subs.reduce((n, a) => n + a.activeMs, 0),
      userWaitMs: main.reduce((n, a) => n + a.userWaitMs, 0),
      idleMs: main.reduce((n, a) => n + a.idleMs, 0),
      tokens,
      calls: analyses.reduce((n, a) => n + a.calls, 0),
      failedCalls: analyses.reduce((n, a) => n + a.failedCalls, 0),
      humanPrompts: main.reduce((n, a) => n + a.humanPrompts, 0),
      reportedCostUsd: main.reduce((n, a) => n + (a.session.reportedCostUsd ?? 0), 0),
    },
    phases,
    perf: { productionSessions: prodSessions.length, renderingSessions: rendering.length, rows, stages, total, perVideo },
    latency,
    tools,
    waste: detectWaste(analyses, options),
    sessions: sessionRows.sort((x, y) => (x.start ?? "").localeCompare(y.start ?? "")),
  };
}

// ── text formatting ────────────────────────────────────────────────────────

export function fmtMs(ms: number): string {
  if (!ms) return "0s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}m`;
}

export function fmtNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

export function table(headers: string[], rows: string[][], rightAlign = true): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 || !rightAlign ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ").trimEnd();
  return [line(headers), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}

export function formatText(r: Report, opts: { showSessions?: boolean } = {}): string {
  const out: string[] = [];
  const src = Object.entries(r.inputs.bySource).map(([k, v]) => `${k} ${v}`).join(", ");
  out.push(`Session report: ${r.inputs.sessions} sessions (${src}; ${r.inputs.subagentSessions} subagent) from ${r.inputs.files} files`);
  if (r.inputs.firstActivity) out.push(`Activity: ${r.inputs.firstActivity.slice(0, 16)}Z .. ${r.inputs.lastActivity?.slice(0, 16)}Z`);
  if (r.inputs.unrecognized || r.inputs.badLines) out.push(`Skipped: ${r.inputs.unrecognized} unrecognized files, ${r.inputs.badLines} unparseable lines`);
  const t = r.totals;
  out.push(
    `Main sessions: span ${fmtMs(t.spanMs)}, agent active ${fmtMs(t.activeMs)}, user wait ${fmtMs(t.userWaitMs)}, idle ${fmtMs(t.idleMs)}; subagents active ${fmtMs(t.subagentActiveMs)}`,
  );
  out.push(
    `Tokens: input ${fmtNum(t.tokens.input)}, output ${fmtNum(t.tokens.output)}, cache read ${fmtNum(t.tokens.cacheRead)}, cache write ${fmtNum(t.tokens.cacheWrite)}; tool calls ${t.calls} (${t.failedCalls} failed)${t.reportedCostUsd ? `; harness-reported cost $${t.reportedCostUsd.toFixed(2)}` : ""}`,
  );
  out.push("");
  out.push("Per phase (wall time = main sessions; tokens and calls include subagents)");
  out.push(
    table(
      ["phase", "sessions", "active", "model", "tool", "bg wait", "subagent", "input", "output", "cache rd", "cache wr", "calls", "failed"],
      r.phases
        .filter((p) => p.sessions > 0)
        .map((p) => [p.phase, String(p.sessions), fmtMs(p.activeMs), fmtMs(p.modelMs), fmtMs(p.toolMs), fmtMs(p.bgWaitMs), fmtMs(p.subagentActiveMs), fmtNum(p.tokens.input), fmtNum(p.tokens.output), fmtNum(p.tokens.cacheRead), fmtNum(p.tokens.cacheWrite), String(p.calls), String(p.failedCalls)]),
    ),
  );
  out.push("");
  out.push(`Perf targets (docs/perf-targets.md): ${r.perf.productionSessions} production sessions, ${r.perf.renderingSessions} rendered at least one project`);
  out.push(
    table(
      ["stage", "sessions", "median", "p75", "cold target", "custom target", "over custom"],
      [...r.perf.stages, r.perf.total, r.perf.perVideo].map((s) => [s.stage, String(s.n), fmtMs(s.medianMs), fmtMs(s.p75Ms), fmtMs(s.coldTargetMs), fmtMs(s.customTargetMs), String(s.overCustom)]),
    ),
  );
  if (r.latency.length) {
    out.push("");
    out.push("Per-call latency (single, successful ralphy invocations)");
    out.push(
      table(
        ["verb", "n", "median", "p95", "max", "target median", "target p95"],
        r.latency.slice(0, 20).map((l) => [l.verb, String(l.n), fmtMs(l.medianMs), fmtMs(l.p95Ms), fmtMs(l.maxMs), l.target ? `${l.target.median}s` : "", l.target ? `${l.target.p95}s` : ""]),
      ),
    );
  }
  if (r.tools.length) {
    out.push("");
    out.push("Tool calls by tool (top 15)");
    out.push(table(["tool", "calls", "failed", "output chars"], r.tools.slice(0, 15).map((t) => [t.tool, String(t.calls), String(t.failed), fmtNum(t.outputChars)])));
  }
  out.push("");
  out.push("Waste");
  r.waste.forEach((w, i) => {
    const impact: string[] = [];
    if (w.impact.ms) impact.push(fmtMs(w.impact.ms));
    if (w.impact.extraCalls) impact.push(`${w.impact.extraCalls} extra calls`);
    if (w.impact.estTokens) impact.push(`~${fmtNum(w.impact.estTokens)} tokens`);
    out.push(`${i + 1}. ${w.title}: ${w.count} in ${w.sessions} sessions${impact.length ? ` (${impact.join(", ")})` : ""}`);
    for (const g of w.groups.slice(0, r.options.topExamples)) {
      out.push(`     ${g.count}x ${g.label}${g.ms ? ` (${fmtMs(g.ms)})` : ""}${g.chars ? ` (${fmtNum(g.chars)} chars)` : ""}`);
    }
    for (const e of w.examples) out.push(`     - [${e.session}] ${e.detail}`);
    if (w.note) out.push(`     note: ${w.note}`);
  });
  if (opts.showSessions) {
    out.push("");
    out.push("Sessions");
    out.push(
      table(
        ["session", "src", "start", "span", "active", "user wait", "idle", "prompts", "calls", "failed", "tokens", "top phase", "renders"],
        r.sessions.map((s) => [s.id + (s.subagent ? "*" : ""), s.source, s.start?.slice(0, 16) ?? "", fmtMs(s.spanMs), fmtMs(s.activeMs), fmtMs(s.userWaitMs), fmtMs(s.idleMs), String(s.humanPrompts), String(s.calls), String(s.failedCalls), fmtNum(totalTokens(s.tokens)), s.topPhase, String(s.renderInvocations)]),
      ),
    );
    out.push("(* = subagent session)");
  }
  return out.join("\n");
}
