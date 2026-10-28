// scripts/lib/session-report/waste.ts — #562
//
// Waste detectors over analyzed sessions. Each returns a finding with a count,
// an impact estimate and the top examples. All heuristics are deterministic.
//
//   repeated-read   same file read N+ times in one session
//   failed-retry    a failed op re-run with the same or near-same args
//   usage-error     a ralphy verb that failed on an unknown flag / usage error
//   background-wait a long gap waiting on a background job, or a long blocking wait
//   unused-skill    a skill loaded with no follow-up action in its domain
//   large-output    a tool output above the size threshold

import type { Op } from "./types.js";
import type { CallInfo, ReportOptions, SessionAnalysis } from "./analyze.js";
import { opDurationMs } from "./analyze.js";
import { skillFollowPhases, skillRule, verbLabel, type Phase } from "./phases.js";
import { extractRalphyInvocations, hasOutputLimiter, similarity, splitSegments, stripPrefix, tokenize } from "./shell.js";

export type DetectorId = "repeated-read" | "failed-retry" | "usage-error" | "background-wait" | "unused-skill" | "large-output";

export interface WasteExample {
  session: string;
  detail: string;
  count?: number;
  ms?: number;
  chars?: number;
}

export interface WasteFinding {
  id: DetectorId;
  title: string;
  /** Number of occurrences (pairs, waits, reads-over-threshold, ...). */
  count: number;
  /** Sessions with at least one occurrence. */
  sessions: number;
  impact: { ms?: number; chars?: number; estTokens?: number; extraCalls?: number };
  /** Occurrences grouped by a generic label (verb, tool, skill), largest first. */
  groups: { label: string; count: number; ms?: number; chars?: number }[];
  examples: WasteExample[];
  note?: string;
}

const HOME_RE = /^\/(Users|home)\/[^/]+/;

/** Display a path; in redact mode strip user / workspace / project identifiers. */
export function displayPath(p: string, redact: boolean, cwd?: string): string {
  let out = p;
  const repo = /^(.*\/ralphy)\/(cli|tests|scripts|notes|docs|apps|\.agents|\.github|AGENTS\.md|CLAUDE\.md|MODELS\.md|package\.json|README\.md)(\/|$)/.exec(out);
  if (repo) return out.slice(repo[1]!.length + 1);
  out = out.replace(/(^|\/)\.ralphy\/workspaces\/[^/]+\/projects\/[^/]+/, redact ? "<project>" : "$&");
  out = out.replace(/(^|\/)\.ralphy\/workspaces\/[^/]+/, redact ? "<workspace>" : "$&");
  if (cwd && out.startsWith(cwd + "/")) out = out.slice(cwd.length + 1);
  if (!redact) return out;
  if (out.startsWith("<project>") || out.startsWith("<workspace>")) return out;
  const proj = out.indexOf("<project>");
  if (proj > 0) return out.slice(proj);
  const ws = out.indexOf("<workspace>");
  if (ws > 0) return out.slice(ws);
  if (/^(\/private)?\/tmp\//.test(out) || /^\/var\/folders\//.test(out)) return `<tmp>/${out.split("/").pop()}`;
  if (/\/skills\/[^/]+\/SKILL\.md$/.test(out)) return out.replace(/^.*\/(skills\/[^/]+\/SKILL\.md)$/, "$1");
  out = out.replace(HOME_RE, "~");
  const parts = out.split("/");
  return parts.length > 3 ? `.../${parts.slice(-2).join("/")}` : out;
}

/** Short generic label for an op, safe to print in redact mode. */
export function opLabel(op: Op, redact: boolean): string {
  if (op.kind === "shell" && op.command) {
    const inv = extractRalphyInvocations(op.command)[0];
    if (inv) return `ralphy ${verbLabel(inv.verb, inv.sub)}`;
    const seg = splitSegments(op.command).map((s) => stripPrefix(tokenize(s))).find((t) => t.length && t[0] !== "cd");
    if (!seg) return "shell";
    const word = seg[0]!.split("/").pop()!;
    if (redact) {
      const sub = seg[1] && /^[a-z][a-z0-9:-]*$/.test(seg[1]) ? ` ${seg[1]}` : "";
      const read = op.reads?.[0];
      return read ? `${word} ${displayPath(read, true, op.cwd)}` : `${word}${sub}`;
    }
    return seg.join(" ").slice(0, 100);
  }
  const target = op.reads?.[0] ?? op.writes?.[0];
  if (target) return `${op.tool} ${displayPath(target, redact, op.cwd)}`;
  if (op.kind === "skill" && op.skill) return `Skill ${op.skill}`;
  return op.tool;
}

export function shortSession(a: SessionAnalysis): string {
  const s = a.session;
  if (s.isSubagent && s.parentSessionId) {
    const own = s.sessionId.includes(":") ? s.sessionId.split(":").pop()! : s.sessionId;
    return `${s.parentSessionId.slice(0, 8)}/${own.replace(/^agent-/, "").slice(0, 8)}`;
  }
  return s.sessionId.slice(0, 8);
}

function group(items: { label: string; ms?: number; chars?: number }[]): WasteFinding["groups"] {
  const map = new Map<string, { label: string; count: number; ms: number; chars: number }>();
  for (const it of items) {
    const g = map.get(it.label) ?? { label: it.label, count: 0, ms: 0, chars: 0 };
    g.count++;
    g.ms += it.ms ?? 0;
    g.chars += it.chars ?? 0;
    map.set(it.label, g);
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.ms - a.ms || b.chars - a.chars || a.label.localeCompare(b.label))
    .map((g) => ({ label: g.label, count: g.count, ms: g.ms || undefined, chars: g.chars || undefined }));
}

function opsInOrder(a: SessionAnalysis): { op: Op; info: CallInfo }[] {
  const out: { op: Op; info: CallInfo }[] = [];
  for (const info of a.callInfos) for (const op of info.call.ops) out.push({ op, info });
  return out;
}

function failed(op: Op): boolean {
  return op.isError === true || (op.exitCode !== undefined && op.exitCode !== 0);
}

export function detectRepeatedReads(sessions: SessionAnalysis[], o: ReportOptions): WasteFinding {
  const examples: WasteExample[] = [];
  const labels: { label: string; chars?: number }[] = [];
  let count = 0;
  let extra = 0;
  let duplicates = 0;
  let extraChars = 0;
  const hit = new Set<SessionAnalysis>();
  for (const a of sessions) {
    const reads = new Map<string, { n: number; ranges: Set<string>; chars: number; cwd?: string }>();
    for (const { op, info } of opsInOrder(a)) {
      if (!op.reads || op.kind === "edit") continue;
      for (const file of new Set(op.reads)) {
        const r = reads.get(file) ?? { n: 0, ranges: new Set<string>(), chars: 0, cwd: op.cwd };
        r.n++;
        r.ranges.add(op.readRange ?? "shell");
        if (r.n > 1) r.chars += op.outputChars ?? info.call.outputChars ?? 0;
        reads.set(file, r);
      }
    }
    for (const [file, r] of reads) {
      if (r.n < o.repeatedReadMin) continue;
      count++;
      extra += r.n - 1;
      extraChars += r.chars;
      hit.add(a);
      const shown = displayPath(file, o.redact, r.cwd);
      duplicates += r.n - r.ranges.size;
      examples.push({ session: shortSession(a), detail: `${shown} read ${r.n} times (${r.ranges.size} distinct ranges)`, count: r.n, chars: r.chars });
      labels.push({ label: displayPath(file, true, r.cwd), chars: r.chars });
    }
  }
  examples.sort((x, y) => (y.count ?? 0) - (x.count ?? 0));
  return {
    id: "repeated-read",
    title: `Same file read ${o.repeatedReadMin}+ times in one session`,
    count,
    sessions: hit.size,
    impact: { extraCalls: extra, chars: extraChars, estTokens: Math.round(extraChars / 4) },
    groups: group(labels),
    examples: examples.slice(0, o.topExamples),
    note: `${duplicates} of the ${extra} extra reads repeated an already-read range (same offset/limit, or the whole file again)`,
  };
}

export function detectFailedRetries(sessions: SessionAnalysis[], o: ReportOptions): WasteFinding {
  const examples: WasteExample[] = [];
  const labels: { label: string; ms?: number }[] = [];
  let lostMs = 0;
  const hit = new Set<SessionAnalysis>();
  for (const a of sessions) {
    const ops = opsInOrder(a).filter((x) => x.op.kind !== "wait" && x.op.kind !== "other" && !x.info.call.synthetic);
    for (let i = 0; i < ops.length; i++) {
      const cur = ops[i]!.op;
      if (!failed(cur)) continue;
      for (let j = i + 1; j <= Math.min(ops.length - 1, i + o.retryWindow); j++) {
        const next = ops[j]!.op;
        if (next.kind !== cur.kind || next.tool !== cur.tool) continue;
        if (similarity(cur.signature, next.signature) < o.retrySimilarity) continue;
        const ms = next.startTs !== undefined && cur.startTs !== undefined ? Math.max(0, next.startTs - cur.startTs) : 0;
        lostMs += ms;
        hit.add(a);
        const label = opLabel(cur, true);
        labels.push({ label, ms });
        examples.push({ session: shortSession(a), detail: `${opLabel(cur, o.redact)} failed${cur.exitCode ? ` (exit ${cur.exitCode})` : ""}, retried ${next.signature === cur.signature ? "unchanged" : "with near-same args"}`, ms });
        break;
      }
    }
  }
  examples.sort((x, y) => (y.ms ?? 0) - (x.ms ?? 0));
  return {
    id: "failed-retry",
    title: "Failed call retried with the same or near-same args",
    count: labels.length,
    sessions: hit.size,
    impact: { ms: lostMs, extraCalls: labels.length },
    groups: group(labels),
    examples: examples.slice(0, o.topExamples),
    note: "ms = time from the failed call to its retry",
  };
}

const USAGE_PATTERNS: { re: RegExp; kind: (m: RegExpExecArray) => string }[] = [
  { re: /error: unknown option '([^']+)'/, kind: (m) => `unknown option ${m[1]}` },
  { re: /error: unknown command '([^']+)'/, kind: (m) => `unknown command ${m[1]}` },
  { re: /error: missing required argument '([^']+)'/, kind: (m) => `missing argument ${m[1]}` },
  { re: /error: required option '([^']+)' not specified/, kind: (m) => `missing option ${m[1].split(" ")[0]}` },
  { re: /error: option '([^']+)' argument missing/, kind: (m) => `missing value for ${m[1].split(" ")[0]}` },
  { re: /error: too many arguments/, kind: () => "too many arguments" },
  { re: /\bE_FLAG_UNKNOWN\b/, kind: () => "E_FLAG_UNKNOWN" },
  { re: /\bE_FLAG_MISSING\b/, kind: () => "E_FLAG_MISSING" },
  { re: /\bE_INPUT_INVALID\b[^\n]*/, kind: (m) => `E_INPUT_INVALID (${inputInvalidCategory(m[0])})` },
];

/** Generic category of an E_INPUT_INVALID message (never the user's values). */
export function inputInvalidCategory(text: string): string {
  if (/Workspace not found/i.test(text)) return "workspace not found";
  if (/more than one Workspace exists/i.test(text)) return "workspace scope missing";
  if (/no Workspace exists/i.test(text)) return "no workspace";
  if (/conflicts with the immutable command scope/i.test(text)) return "project conflicts with session scope";
  if (/Project not found/i.test(text)) return "project not found";
  // #573 shapes: a slug that names several Projects, or a Project outside the explicit Workspace.
  if (/is ambiguous: it matches/i.test(text)) return "ambiguous project";
  if (/is not in Workspace/i.test(text)) return "project outside workspace";
  if (/exactly one of --project/i.test(text)) return "destination flag missing";
  const field = /Invalid input for ([-\w]+)/.exec(text)?.[1];
  return field ? `invalid ${field}` : "invalid input";
}

export function usageErrorOf(op: Op): string | null {
  if (!op.outputHead) return null;
  for (const p of USAGE_PATTERNS) {
    const m = p.re.exec(op.outputHead);
    if (m) return p.kind(m);
  }
  return null;
}

export function detectUsageErrors(sessions: SessionAnalysis[], o: ReportOptions): WasteFinding {
  const examples: WasteExample[] = [];
  const labels: { label: string }[] = [];
  const hit = new Set<SessionAnalysis>();
  for (const a of sessions) {
    for (const { op } of opsInOrder(a)) {
      if (op.kind !== "shell" || !op.command) continue;
      const inv = extractRalphyInvocations(op.command);
      if (inv.length === 0) continue;
      const kind = usageErrorOf(op);
      if (!kind) continue;
      const label = `ralphy ${verbLabel(inv[0]!.verb, inv[0]!.sub)}: ${kind}`;
      labels.push({ label });
      hit.add(a);
      examples.push({ session: shortSession(a), detail: label });
    }
  }
  return {
    id: "usage-error",
    title: "ralphy verb failed on an unknown flag / usage error",
    count: labels.length,
    sessions: hit.size,
    impact: { extraCalls: labels.length },
    groups: group(labels),
    examples: examples.slice(0, o.topExamples),
  };
}

function isSleepCommand(cmd: string): boolean {
  const segs = splitSegments(cmd).map((s) => stripPrefix(tokenize(s)));
  return segs.length > 0 && segs.every((t) => t[0] === "sleep" || t[0] === "cd" || t[0] === "echo" || t[0] === "tail" || t[0] === "cat" || t[0] === "ls") && segs.some((t) => t[0] === "sleep");
}

export function detectBackgroundWaits(sessions: SessionAnalysis[], o: ReportOptions): WasteFinding {
  const examples: WasteExample[] = [];
  const labels: { label: string; ms?: number }[] = [];
  let totalMs = 0;
  const hit = new Set<SessionAnalysis>();
  for (const a of sessions) {
    const callById = new Map(a.callInfos.map((c) => [c.call.id, c]));
    for (const g of a.gaps) {
      if (g.ms <= o.waitThresholdMs || g.toKind === "prompt") continue;
      const endsAtJob = g.toKind === "notification";
      const whileJob = g.outstanding > 0 && (g.toKind === "model" || g.toKind === "callStart" || g.toKind === "mark");
      if (!endsAtJob && !whileJob) continue;
      const launcher = g.callId ? callById.get(g.callId) : undefined;
      const what = launcher ? opLabel(launcher.call.ops[0]!, true) : "background job";
      totalMs += g.ms;
      hit.add(a);
      labels.push({ label: `idle until ${what} finished`, ms: g.ms });
      examples.push({ session: shortSession(a), detail: `${Math.round(g.ms / 1000)}s idle in ${g.phase} waiting on ${launcher ? opLabel(launcher.call.ops[0]!, o.redact) : "a background job"}`, ms: g.ms });
    }
    for (const info of a.callInfos) {
      for (const op of info.call.ops) {
        const blocking = op.kind === "wait" || (op.kind === "shell" && op.command !== undefined && isSleepCommand(op.command));
        if (!blocking || op.background) continue;
        const ms = opDurationMs(op);
        if (ms === undefined || ms <= o.waitThresholdMs) continue;
        totalMs += ms;
        hit.add(a);
        const label = op.kind === "shell" ? "blocking sleep" : `blocking ${op.tool}`;
        labels.push({ label, ms });
        examples.push({ session: shortSession(a), detail: `${Math.round(ms / 1000)}s ${label} in ${info.phase}`, ms });
      }
    }
  }
  examples.sort((x, y) => (y.ms ?? 0) - (x.ms ?? 0));
  return {
    id: "background-wait",
    title: `Waits over ${Math.round(o.waitThresholdMs / 1000)}s on a background job (idle gap or blocking wait)`,
    count: labels.length,
    sessions: hit.size,
    impact: { ms: totalMs },
    groups: group(labels),
    examples: examples.slice(0, o.topExamples),
  };
}

export function detectUnusedSkills(sessions: SessionAnalysis[], o: ReportOptions): WasteFinding {
  const examples: WasteExample[] = [];
  const labels: { label: string }[] = [];
  const hit = new Set<SessionAnalysis>();
  for (const a of sessions) {
    const seen = new Set<string>();
    a.callInfos.forEach((info, idx) => {
      if (info.demoted) return;
      for (const op of info.call.ops) {
        const slug = op.skill;
        if (!slug || seen.has(slug)) continue;
        const follow = skillFollowPhases(slug);
        if (follow.length === 0 || !skillRule(slug)) continue;
        seen.add(slug);
        const followSet = new Set<Phase>(follow);
        const used = a.callInfos.slice(idx + 1).some((later) => later.signal?.strength === "strong" && followSet.has(later.signal.phase));
        if (used) continue;
        hit.add(a);
        labels.push({ label: slug });
        examples.push({ session: shortSession(a), detail: `${slug} loaded; no later ${follow.length > 3 ? "production" : follow.join("/")} action` });
      }
    });
  }
  return {
    id: "unused-skill",
    title: "Skill loaded with no follow-up action in its domain",
    count: labels.length,
    sessions: hit.size,
    impact: {},
    groups: group(labels),
    examples: examples.slice(0, o.topExamples),
    note: "domain = the skill's phase(s) in PHASE_RULES; a follow-up is a later strong signal (verb run or file written) in that phase",
  };
}

export function detectLargeOutputs(sessions: SessionAnalysis[], o: ReportOptions): WasteFinding {
  const examples: WasteExample[] = [];
  const labels: { label: string; chars?: number }[] = [];
  let chars = 0;
  let likely = 0;
  let likelyChars = 0;
  const hit = new Set<SessionAnalysis>();
  for (const a of sessions) {
    for (const info of a.callInfos) {
      const size = info.call.outputChars ?? 0;
      if (size <= o.largeOutputChars) continue;
      const shellOps = info.call.ops.filter((op) => op.kind === "shell" && op.command);
      const readOps = info.call.ops.filter((op) => op.kind === "read" && op.tool !== "view_image");
      const unnecessary = (shellOps.length > 0 && shellOps.every((op) => !hasOutputLimiter(op.command!))) || readOps.some((op) => op.unbounded);
      chars += size;
      hit.add(a);
      if (unnecessary) {
        likely++;
        likelyChars += size;
      }
      const main = shellOps[0] ?? readOps[0] ?? info.call.ops[0];
      const label = main ? opLabel(main, true) : info.call.name;
      labels.push({ label: `${label}${unnecessary ? " (unbounded)" : ""}`, chars: size });
      examples.push({ session: shortSession(a), detail: `${main ? opLabel(main, o.redact) : info.call.name}: ${size.toLocaleString("en-US")} chars${unnecessary ? ", no output limit" : ""}`, chars: size });
    }
  }
  examples.sort((x, y) => (y.chars ?? 0) - (x.chars ?? 0));
  return {
    id: "large-output",
    title: `Tool outputs over ${o.largeOutputChars.toLocaleString("en-US")} chars`,
    count: labels.length,
    sessions: hit.size,
    impact: { chars, estTokens: Math.round(chars / 4) },
    groups: group(labels),
    examples: examples.slice(0, o.topExamples),
    note: `${likely} of ${labels.length} (${Math.round(likelyChars / 4).toLocaleString("en-US")} est. tokens) had no output limit (no head/tail/-n/--limit, or a Read without limit) and are likely unnecessary`,
  };
}

export function detectWaste(sessions: SessionAnalysis[], o: ReportOptions): WasteFinding[] {
  return [
    detectRepeatedReads(sessions, o),
    detectFailedRetries(sessions, o),
    detectUsageErrors(sessions, o),
    detectBackgroundWaits(sessions, o),
    detectUnusedSkills(sessions, o),
    detectLargeOutputs(sessions, o),
  ];
}
