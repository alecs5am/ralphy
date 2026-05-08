// Helpers shared between `ralphy generate ... --queue` and
// `ralphy batch submit --from <file>`.
//
// The simplest way to enqueue a `ralphy generate` invocation is to record
// its own argv (minus the queue-control flags) and have the worker re-run
// the same CLI synchronously. This avoids re-serializing each generate
// subcommand's option matrix into JSON.

import fs from "node:fs/promises";
import {
  insertJob,
  insertJobsAtomic,
  type JobInsertInput,
} from "./db.js";
import type { JobKind } from "./types.js";
import { ensureDaemonRunning } from "./daemon.js";

export type QueueFlags = {
  queue?: boolean;
  dependsOn?: string;
  priority?: number;
  tag?: string;
  project?: string;
};

/**
 * Read process.argv, drop the queue-control flags, and return the argv
 * the worker should run with the ralphy binary.
 */
export function deriveWrappedArgv(): string[] {
  // process.argv = [bun, cli/index.ts, ...args] when in-tree, or
  //                [ralphy, ...args] when installed.
  // Drop the first two unconditionally; consumers normalize beyond that.
  const after = process.argv.slice(2);
  const out: string[] = [];
  for (let i = 0; i < after.length; i++) {
    const a = after[i];
    if (a === "--queue") continue;
    if (a === "--depends-on") {
      i++;
      continue;
    }
    if (a === "--queue-tag") {
      i++;
      continue;
    }
    if (a === "--queue-priority") {
      i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

export function parseDepsList(s: string | undefined): number[] {
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Insert a single generate job, autostart the daemon, return the id.
 * Returns null if `flags.queue` is falsy (caller should run synchronously).
 */
export function enqueueGenerate(
  flags: QueueFlags,
  kind: JobKind,
): number | null {
  if (!flags.queue) return null;
  const argv = deriveWrappedArgv();
  const id = insertJob({
    kind,
    command: { argv },
    depends_on: parseDepsList(flags.dependsOn),
    priority: flags.priority ?? 0,
    tag: flags.tag,
    project_id: flags.project,
  });
  ensureDaemonRunning();
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// `ralphy batch submit --from <file>`
// ─────────────────────────────────────────────────────────────────────────────

export type BatchSpec = {
  jobs: BatchSpecJob[];
};

export type BatchSpecJob = {
  /** Symbolic id used inside the batch file (resolved to actual job id on insert). */
  id?: string;
  kind: JobKind;
  /** Argv passed to the ralphy binary (or shell program if kind="shell"). */
  argv: string[];
  /** Symbolic ids of other jobs in the same batch this one waits on. */
  depends_on?: string[];
  priority?: number;
  tag?: string;
  project_id?: string;
};

export async function submitBatchFromFile(file: string): Promise<{
  ids: number[];
  symbolMap: Record<string, number>;
}> {
  const raw = await fs.readFile(file, "utf8");
  let spec: BatchSpec | BatchSpecJob[];
  try {
    spec = JSON.parse(raw);
  } catch (e) {
    throw new Error(`batch submit: ${file} is not valid JSON: ${(e as Error).message}`);
  }
  const jobs: BatchSpecJob[] = Array.isArray(spec) ? spec : spec.jobs;
  if (!jobs || jobs.length === 0) {
    throw new Error(`batch submit: ${file} has no jobs`);
  }

  // Two-pass: insert without deps first to get real ids, then UPDATE depends_on.
  // Simpler: validate symbolic refs, do a topological insert, fill deps array
  // with already-known ids per symbolic ref. Cycles disallowed.
  validateNoCycle(jobs);

  const symbolMap: Record<string, number> = {};
  const inserts: JobInsertInput[] = [];
  // Topological order: jobs whose deps are already resolved.
  const remaining = [...jobs];
  while (remaining.length > 0) {
    let progress = false;
    for (let i = 0; i < remaining.length; i++) {
      const j = remaining[i];
      const symDeps = j.depends_on ?? [];
      if (symDeps.every((s) => s in symbolMap)) {
        // Resolve and queue for insertion. We insert one-at-a-time so we
        // can map symbol → real id immediately.
        const realDeps = symDeps.map((s) => symbolMap[s]);
        const realId = insertJob({
          kind: j.kind,
          command: { argv: j.argv },
          depends_on: realDeps,
          priority: j.priority,
          tag: j.tag,
          project_id: j.project_id,
        });
        if (j.id) symbolMap[j.id] = realId;
        inserts.push({
          kind: j.kind,
          command: { argv: j.argv },
          depends_on: realDeps,
        });
        remaining.splice(i, 1);
        i--;
        progress = true;
      }
    }
    if (!progress) {
      throw new Error(
        `batch submit: unresolved dependency in ${remaining.map((r) => r.id ?? "?").join(",")}`,
      );
    }
  }

  ensureDaemonRunning();
  // The "ids" array is reconstructed via symbolMap order; fall back to all
  // inserted ids in original order.
  const ids = jobs.map((j) => (j.id ? symbolMap[j.id] : -1)).filter((n) => n > 0);
  return { ids, symbolMap };
}

function validateNoCycle(jobs: BatchSpecJob[]): void {
  const ids = new Set(jobs.map((j) => j.id).filter((x): x is string => !!x));
  for (const j of jobs) {
    for (const d of j.depends_on ?? []) {
      if (!ids.has(d)) {
        throw new Error(
          `batch submit: depends_on reference "${d}" not found in batch (job "${j.id ?? "?"}")`,
        );
      }
    }
  }
  // Cycle check via Kahn-ish: count in-degree, peel zero-degree nodes.
  const inDeg = new Map<string, number>();
  for (const j of jobs) {
    if (j.id) inDeg.set(j.id, 0);
  }
  for (const j of jobs) {
    for (const d of j.depends_on ?? []) {
      // d is a node, j depends on d. We don't actually need to track the
      // direction precisely for cycle detection — we count inbound edges.
      const cur = inDeg.get(j.id ?? "") ?? 0;
      if (j.id) inDeg.set(j.id, cur + 1);
      void d;
    }
  }
  // Simpler cycle detection: DFS color-marking.
  const color = new Map<string, "white" | "grey" | "black">();
  const adj = new Map<string, string[]>();
  for (const j of jobs) {
    if (j.id) {
      color.set(j.id, "white");
      adj.set(j.id, j.depends_on ?? []);
    }
  }
  const dfs = (node: string): void => {
    color.set(node, "grey");
    for (const next of adj.get(node) ?? []) {
      const c = color.get(next);
      if (c === "grey") {
        throw new Error(`batch submit: dependency cycle through "${node}" → "${next}"`);
      }
      if (c === "white") dfs(next);
    }
    color.set(node, "black");
  };
  for (const id of color.keys()) {
    if (color.get(id) === "white") dfs(id);
  }
}

void insertJobsAtomic;
