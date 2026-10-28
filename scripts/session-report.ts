#!/usr/bin/env bun
// scripts/session-report.ts — #562 harness speed and token self-eval.
//
// Maintainer tool. Reads agent session transcripts (Claude Code and Codex),
// attributes wall time, tokens and tool calls to production-contract phases,
// compares against docs/perf-targets.md, and prints a waste list. Read-only:
// it never writes, never calls a provider, never touches the network.
//
// Usage:
//   bun run scripts/session-report.ts <transcript.jsonl | dir>... [options]
//   bun run session:report -- ~/.claude/projects/<slug> ~/.codex/sessions --since 2026-10-01
//
// Options:
//   --since <date>          only sessions with activity on/after the date (ISO, e.g. 2026-10-01)
//   --json                  print the full report object as JSON
//   --redact                strip user / workspace / project identifiers and command arguments from examples
//   --ralphy-only           keep only sessions that worked in a Ralphy checkout or ran ralphy / its skills
//   --no-subagents          drop subagent transcripts
//   --exclude <substr>      skip files whose path contains the substring (repeatable)
//   --sessions              also print the per-session table (text mode)
//   --top <n>               examples per waste finding (default 5)
//   --idle-gap-min <n>      gaps longer than n minutes count as idle (default 30)
//   --wait-threshold-sec <n>  flag background waits longer than n seconds (default 120)
//   --large-output-chars <n>  flag tool outputs larger than n chars (default 20000)
//
// Phase mapping lives in one table: scripts/lib/session-report/phases.ts (PHASE_RULES).

import fs from "node:fs";
import { DEFAULT_OPTIONS, type ReportOptions } from "./lib/session-report/analyze.js";
import { discoverFiles, isRalphyRelated, loadSession } from "./lib/session-report/load.js";
import { buildReport, formatText, type Report } from "./lib/session-report/report.js";
import type { NormSession } from "./lib/session-report/types.js";

export interface CliArgs {
  inputs: string[];
  since?: number;
  json: boolean;
  ralphyOnly: boolean;
  subagents: boolean;
  showSessions: boolean;
  exclude: string[];
  options: ReportOptions;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { inputs: [], json: false, ralphyOnly: false, subagents: true, showSessions: false, exclude: [], options: { ...DEFAULT_OPTIONS } };
  const num = (flag: string, v: string | undefined): number => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${flag} expects a non-negative number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--json":
        args.json = true;
        break;
      case "--redact":
        args.options.redact = true;
        break;
      case "--ralphy-only":
        args.ralphyOnly = true;
        break;
      case "--no-subagents":
        args.subagents = false;
        break;
      case "--sessions":
        args.showSessions = true;
        break;
      case "--exclude": {
        const v = argv[++i];
        if (!v) throw new Error("--exclude expects a path substring");
        args.exclude.push(v);
        break;
      }
      case "--since": {
        const v = argv[++i];
        const t = v ? Date.parse(v) : NaN;
        if (!Number.isFinite(t)) throw new Error("--since expects a date, e.g. 2026-10-01");
        args.since = t;
        break;
      }
      case "--top":
        args.options.topExamples = num(a, argv[++i]);
        break;
      case "--idle-gap-min":
        args.options.idleGapMs = num(a, argv[++i]) * 60_000;
        break;
      case "--wait-threshold-sec":
        args.options.waitThresholdMs = num(a, argv[++i]) * 1000;
        break;
      case "--large-output-chars":
        args.options.largeOutputChars = num(a, argv[++i]);
        break;
      case "-h":
      case "--help":
        throw new HelpRequested();
      default:
        if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
        args.inputs.push(a);
    }
  }
  if (args.inputs.length === 0) throw new Error("expected at least one transcript file or directory");
  return args;
}

class HelpRequested extends Error {}

function lastActivity(s: NormSession): number {
  let max = -Infinity;
  for (const e of s.events) {
    const end = e.kind === "call" ? Math.max(e.ts, e.endTs ?? e.ts) : e.ts;
    if (end > max) max = end;
  }
  return max;
}

export async function run(args: CliArgs): Promise<{ report: Report; skippedBySince: number }> {
  const { files, missing } = discoverFiles(args.inputs);
  if (missing.length) throw new Error(`not found: ${missing.join(", ")}`);
  const sessions: NormSession[] = [];
  let unrecognized = 0;
  let skippedBySince = 0;
  for (const file of files) {
    if (args.exclude.some((x) => file.includes(x))) continue;
    // A file not modified since --since cannot contain activity after it.
    if (args.since !== undefined && fs.statSync(file).mtimeMs < args.since) {
      skippedBySince++;
      continue;
    }
    const session = await loadSession(file);
    if (!session) {
      unrecognized++;
      continue;
    }
    if (args.since !== undefined && lastActivity(session) < args.since) {
      skippedBySince++;
      continue;
    }
    if (!args.subagents && session.isSubagent) continue;
    if (args.ralphyOnly && !isRalphyRelated(session)) continue;
    sessions.push(session);
  }
  const report = buildReport(sessions, args.options, { files: files.length, unrecognized });
  return { report, skippedBySince };
}

function usage(): string {
  const src = fs.readFileSync(new URL(import.meta.url), "utf8");
  return src
    .split("\n")
    .filter((l) => l.startsWith("//"))
    .slice(1, 25)
    .map((l) => l.replace(/^\/\/ ?/, ""))
    .join("\n");
}

if (import.meta.main) {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof HelpRequested) {
      console.log(usage());
      process.exit(0);
    }
    console.error(`session-report: ${(err as Error).message}\n`);
    console.error(usage());
    process.exit(2);
  }
  try {
    const { report, skippedBySince } = await run(args);
    if (args.json) console.log(JSON.stringify({ ...report, skippedBySince }, null, 2));
    else {
      console.log(formatText(report, { showSessions: args.showSessions }));
      if (skippedBySince) console.log(`\n(${skippedBySince} files skipped by --since)`);
    }
  } catch (err) {
    console.error(`session-report: ${(err as Error).message}`);
    process.exit(1);
  }
}
