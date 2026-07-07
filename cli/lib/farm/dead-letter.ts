// Dead-letter quarantine store (#519) — where exhausted node failures
// accumulate for diagnosis and targeted retry. When a farm node exhausts its
// retry envelope (or fails with a permanent-class error on the first attempt,
// see runner.ts execNode), the runner appends a quarantine entry here and the
// run CONTINUES per on_fail — quarantine is a record, not a control-flow
// change. `ralphy farm failures` lists the entries; `ralphy farm retry
// <run> <node>` re-executes the node and appends a resolution line on success.
//
// Store: `.ralphy/workspaces/<ws>/farm/dead-letter.jsonl` — per-workspace
// (failures are a flow across runs, not a per-run event) and APPEND-ONLY:
// a resolution is a new `{kind:"resolved"}` line, never a rewrite. An entry
// carries enough to re-execute (inputsHash → the #513 recipe over the
// journaled inputs) and to explain (error class per the #450/#514 taxonomy,
// attempts, cost spent, a truncated provider payload, a next-action hint).

import fs from "node:fs";
import path from "node:path";
import { workspaceDir } from "../paths.js";
import type { ErrorClass, FilterClass } from "../errors/taxonomy.js";

/** Max chars of raw provider payload kept on an entry. */
export const PROVIDER_EXCERPT_MAX = 400;

/** One quarantine record (kind "quarantined" on disk). */
export interface DeadLetterEntry {
  ts: string;
  run: string;
  node: string;
  /** #510 fan-out branch index, when the failure was branch-scoped. */
  branch?: number;
  /** #513 content hash of the node's resolved inputs + params (re-execution identity). */
  inputsHash: string;
  /** #450 agent-facing error class. */
  errorClass: ErrorClass;
  /** #514 filter refinement, when the error was filter-shaped. */
  filterClass?: FilterClass;
  /** Attempts made before quarantine (1 = permanent-class first-attempt short-circuit). */
  attempts: number;
  /** Realized spend burned across the failed attempts. */
  costSpentUsd: number;
  /** Truncated raw provider error payload. */
  providerPayloadExcerpt: string;
  /** The taxonomy's first concrete next action. */
  nextActionHint: string;
}

/** A quarantine entry as listed: annotated with its resolution state. */
export interface DeadLetterView extends DeadLetterEntry {
  resolved: boolean;
  resolvedAt: string | null;
}

export function deadLetterPath(ws: string): string {
  return path.join(workspaceDir(ws), "farm", "dead-letter.jsonl");
}

/** Append one quarantine entry (payload excerpt truncated defensively). */
export function appendQuarantine(ws: string, entry: DeadLetterEntry): void {
  const fp = deadLetterPath(ws);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const row = {
    kind: "quarantined",
    ...entry,
    providerPayloadExcerpt: entry.providerPayloadExcerpt.slice(0, PROVIDER_EXCERPT_MAX),
  };
  fs.appendFileSync(fp, JSON.stringify(row) + "\n");
}

function readLines(ws: string): Array<Record<string, unknown>> {
  let lines: string[];
  try {
    lines = fs.readFileSync(deadLetterPath(ws), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      /* a torn final line from a kill -9 — ignore */
    }
  }
  return out;
}

/**
 * The quarantine list, folded from the append-only lines: a `resolved` line
 * marks every PRIOR unresolved entry for the same (run, node) — all branches —
 * as resolved. Default lists unresolved only; `includeResolved` shows all.
 */
export function listDeadLetters(
  ws: string,
  opts: { run?: string; includeResolved?: boolean } = {},
): DeadLetterView[] {
  const entries: DeadLetterView[] = [];
  for (const row of readLines(ws)) {
    if (row.kind === "quarantined") {
      entries.push({ ...(row as unknown as DeadLetterEntry), resolved: false, resolvedAt: null });
    } else if (row.kind === "resolved") {
      for (const e of entries) {
        if (!e.resolved && e.run === row.run && e.node === row.node) {
          e.resolved = true;
          e.resolvedAt = typeof row.ts === "string" ? row.ts : null;
        }
      }
    }
  }
  return entries.filter(
    (e) => (!opts.run || e.run === opts.run) && (opts.includeResolved || !e.resolved),
  );
}

/**
 * Append ONE resolution line for (run, node) when unresolved entries exist.
 * Returns the number of entries it resolves (0 = nothing appended).
 */
export function appendResolution(ws: string, run: string, node: string, ts?: string): number {
  const open = listDeadLetters(ws, { run }).filter((e) => e.node === node).length;
  if (open === 0) return 0;
  fs.appendFileSync(
    deadLetterPath(ws),
    JSON.stringify({ kind: "resolved", ts: ts ?? new Date().toISOString(), run, node }) + "\n",
  );
  return open;
}
