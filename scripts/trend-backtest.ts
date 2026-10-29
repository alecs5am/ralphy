#!/usr/bin/env bun
// #578 maintainer tool: point-in-time backtest of trend-analysis methods.
//
// Runs on a FROZEN copy of the corpus database (never the live file):
//
//   sqlite3 .ralphy/cache/trend-corpus-run/ralphy.db ".backup .ralphy/cache/backtest-578/corpus.db"
//   bun run scripts/trend-backtest.ts --db .ralphy/cache/backtest-578/corpus.db --workspace <ws_id>
//
// Options:
//   --tasks a,b            early-breakout, format-spread, small-account-transfer, copyability,
//                          near-miss-repair, threshold-calibration, baseline-accuracy, bandit-replay
//   --methods a,b          methods on trial (default: all); baselines always run
//   --retime-backfill      PRELIMINARY look: treat each mature snapshot as taken at post + 28 d
//   --backdate-followers   with --retime-backfill: earliest follower count valid from the first post
//   --no-purge             keep training decisions whose outcome lands in the held-out period (PRELIMINARY)
//   --period-start/--period-end ISO dates; --train-fraction f; --replicates n; --seed s;
//   --margin m (default 0.1); --axis format|hook|sound|hashtag; --checkpoint-hours h; --k n;
//   --breakout-multiplier x; --availability-only; --json <file> (full report)
//   --synthetic [--creators n --days n --seed s]   run on the seeded synthetic corpus instead
//
// A maintainer script rather than a `ralphy trends backtest` verb: it is a
// research tool for the owner, not an agent workflow, reads a database copy
// outside the Workspace store contract, and must never become a default
// path of the trend engine.

import fs from "node:fs";
import path from "node:path";
import { loadBacktestCorpus } from "../cli/lib/store/trend-backtest-source.js";
import { retimeBackfill, type LabelAxis } from "../cli/lib/trends/backtest/corpus.js";
import { dataAvailability, formatReport, METHOD_IDS, runBacktest, TASK_IDS, type MethodId, type TaskId } from "../cli/lib/trends/backtest/harness.js";
import { generateSyntheticCorpus } from "../cli/lib/trends/backtest/synthetic.js";

function parseArgs(argv: readonly string[]): Map<string, string | true> {
  const out = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out.set(key, next);
      i += 1;
    } else {
      out.set(key, true);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const text = (key: string): string | undefined => {
  const value = args.get(key);
  return typeof value === "string" ? value : undefined;
};
const number = (key: string): number | undefined => {
  const value = text(key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be a number`);
  return parsed;
};
const date = (key: string): number | undefined => {
  const value = text(key);
  if (value === undefined) return undefined;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`--${key} must be an ISO date`);
  return parsed;
};
const list = <T extends string>(key: string, allowed: readonly T[]): T[] | undefined => {
  const value = text(key);
  if (value === undefined) return undefined;
  const items = value.split(",").map((item) => item.trim()).filter(Boolean);
  for (const item of items) if (!(allowed as readonly string[]).includes(item)) throw new Error(`--${key}: unknown ${item} (allowed: ${allowed.join(", ")})`);
  return items as T[];
};

let corpus;
if (args.has("synthetic")) {
  corpus = generateSyntheticCorpus({ seed: text("seed") ?? "synthetic-578", creators: number("creators"), days: number("days") }).corpus;
} else {
  const db = text("db");
  const workspace = text("workspace");
  if (!db || !workspace) {
    console.error("usage: bun run scripts/trend-backtest.ts --db <frozen copy> --workspace <ws_id> [options]  (or --synthetic)");
    process.exit(2);
  }
  corpus = loadBacktestCorpus({ dbPath: db, workspaceId: workspace });
}
if (args.has("retime-backfill")) corpus = retimeBackfill(corpus, { backdateFollowers: args.has("backdate-followers") });

if (args.has("availability-only")) {
  const availability = dataAvailability(corpus);
  console.log(JSON.stringify(availability, null, 2));
  process.exit(0);
}

const axis = text("axis") as LabelAxis | undefined;
if (axis && !["format", "hook", "sound", "hashtag"].includes(axis)) throw new Error("--axis must be format, hook, sound, or hashtag");
const report = runBacktest(corpus, {
  tasks: list<TaskId>("tasks", TASK_IDS),
  methods: list<MethodId>("methods", METHOD_IDS),
  periodStart: date("period-start"),
  periodEnd: date("period-end"),
  trainFraction: number("train-fraction"),
  purge: args.has("no-purge") ? false : undefined,
  replicates: number("replicates"),
  seed: text("seed"),
  margin: number("margin"),
  axis,
  checkpointHours: number("checkpoint-hours"),
  k: number("k"),
  breakoutMultiplier: number("breakout-multiplier"),
});
console.log(formatReport(report));
const out = text("json");
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), `${JSON.stringify(report, null, 2)}\n`);
  console.error(`report written: ${path.resolve(out)} (dataset ${report.datasetVersion.id})`);
}
