// Node-level content-hash cache (#513) — the farm's "re-bill the delta"
// property: a node whose envelope says `cache: content-hash` computes a
// deterministic hash of its execution-relevant identity BEFORE executing,
// looks it up in a workspace-scoped index, and on a hit reuses the prior
// run's artifact refs as its output instead of re-billing identical work.
//
// ── The hash recipe ──────────────────────────────────────────────────────────
// sha256 over a canonical JSON of exactly three things:
//   • node TYPE            — t2i vs i2v etc. (the executor identity).
//   • canonicalized PARAMS — the node's params object with keys deep-sorted.
//     The (model, provider) binding lives inside params on every paid node
//     type, so a model swap or provider swap changes the hash. Params are
//     hashed AS AUTHORED: a model alias vs its full id hash differently, and
//     an ABSENT model (connector default) hashes as absent — a registry
//     default-model change does not invalidate; pin params.model for strict
//     invalidation.
//   • resolved INPUT digests — per in-port (port names sorted). A value that
//     carries a path to an existing file (a bare path string, or an upstream
//     output object carrying path/localPath/artifactPath) is digested by the
//     FILE CONTENT (`file:<sha256>`), never by the path string — so a re-roll
//     that lands new bytes at the same slot path invalidates, and the same
//     bytes at a different path still hit. The REST of a path-carrying object
//     (model, costUsd, latencyMs, slot, …) is deliberately dropped: it is
//     derived metadata about how the file was produced, and latency/cost are
//     nondeterministic run-to-run noise. Non-path values hash canonically.
//
// Deliberately EXCLUDED from the hash: the node id (renaming a node keeps its
// cache), the run id, the fan-out branch index (#510 — the branch ITEM flows
// in through the resolved inputs, which is the real identity), timestamps,
// and the non-content envelope fields (retry / on_fail / budget / emit /
// cache itself) — none of them change what the node produces.
//
// ── The index ────────────────────────────────────────────────────────────────
// `.ralphy/workspaces/<ws>/cache/node-cache.jsonl` — one JSON entry per line,
// append-only on the write path. Entries store REFS to artifacts (paths where
// the producing run wrote them), NEVER copies of media; a hit therefore
// reuses the EXISTING artifact version and writes nothing (append-only
// interplay, invariant #14). Invalidation is existence-based: every
// artifactRef is stat-checked on lookup, and any missing file = a miss.
//
// Cap policy: NODE_CACHE_MAX_ENTRIES with prune-oldest — when an append
// pushes the file past the cap, the file is compacted in place to the newest
// NODE_CACHE_MAX_ENTRIES lines (newest-wins on duplicate hashes falls out of
// the read side scanning newest-first). The index is ENGINE CACHE STATE (like
// farm-state.json / .ralphy/cache/), not a user artifact — rewriting it does
// not touch the append-only contract; the artifacts it points at are never
// mutated.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { workspaceDir } from "../paths.js";
import type { WorkflowNode } from "../schemas/workflow.js";

/** One cache index line. */
export interface NodeCacheEntry {
  /** The content hash (recipe in the file header). */
  hash: string;
  nodeType: string;
  /** The reused node output — what downstream in-ports resolve to on a hit. */
  output: unknown;
  /** Primary artifact path (mirrors the node-completed event's artifactPath). */
  artifactPath?: string;
  /** Every artifact file this entry references — ALL must still exist on hit. */
  artifactRefs: string[];
  /** The producing run's realized cost — the estimated savings of a hit. */
  costSavedUsd: number;
  ts: string;
}

/** Max index entries; older lines are pruned on the append that crosses the cap. */
export const NODE_CACHE_MAX_ENTRIES = 500;

export function nodeCachePath(ws: string): string {
  return path.join(workspaceDir(ws), "cache", "node-cache.jsonl");
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

/** Deep key-sort so JSON.stringify is order-independent. */
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, canonicalize(o[k])]),
    );
  }
  return v;
}

/**
 * The file path a port value carries, if any — a bare string, or an object
 * with path / localPath / artifactPath (the executors' output shape). Local
 * mirror of executors' pathFromValue, kept here so the farm cache module
 * stays dependency-light.
 */
function carriedPath(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    for (const key of ["path", "localPath", "artifactPath"] as const) {
      if (typeof o[key] === "string" && (o[key] as string).length > 0) return o[key] as string;
    }
  }
  return null;
}

/** sha256 of a file's bytes, or null when the path is not a readable file. */
function fileDigest(p: string): string | null {
  try {
    if (!fs.statSync(p).isFile()) return null;
    return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
}

/** Port artifact CONTENT hash when the value points at an existing file, else the canonical value. */
function digestValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(digestValue);
  const p = carriedPath(v);
  if (p) {
    const d = fileDigest(p);
    if (d) return `file:${d}`;
  }
  return canonicalize(v);
}

/**
 * The node's deterministic cache key: type + canonical params + per-port
 * input digests. See the file header for the full recipe and the deliberate
 * exclusions (node id, run id, branch index, timestamps, retry/on_fail/
 * budget/emit).
 */
export function computeNodeCacheHash(
  node: Pick<WorkflowNode, "type" | "params">,
  inputs: Record<string, unknown>,
): string {
  const material = {
    v: 1, // recipe version — bump to invalidate the whole index on a recipe change
    type: node.type,
    params: canonicalize(node.params ?? {}),
    inputs: Object.fromEntries(
      Object.keys(inputs)
        .sort()
        .map((k) => [k, digestValue(inputs[k])]),
    ),
  };
  return crypto.createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

// ─── Index read / write ──────────────────────────────────────────────────────

function readEntries(ws: string): NodeCacheEntry[] {
  let lines: string[];
  try {
    lines = fs.readFileSync(nodeCachePath(ws), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
  const out: NodeCacheEntry[] = [];
  for (const line of lines) {
    try {
      const e = JSON.parse(line) as NodeCacheEntry;
      if (typeof e.hash === "string" && Array.isArray(e.artifactRefs)) out.push(e);
    } catch {
      /* a torn final line from a kill -9 — ignore */
    }
  }
  return out;
}

/**
 * Newest matching entry whose referenced artifacts ALL still exist. A missing
 * or deleted artifact = a miss (the caller re-executes); the stale line is
 * left in place and ages out via the prune-oldest cap.
 */
export function lookupNodeCache(ws: string, hash: string): NodeCacheEntry | null {
  const entries = readEntries(ws);
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]!;
    if (e.hash !== hash) continue;
    if (e.artifactRefs.length === 0) continue; // nothing verifiable → never a hit
    if (e.artifactRefs.every((p) => fs.existsSync(p))) return e;
    return null; // this hash's artifacts are gone — re-execute
  }
  return null;
}

/** Append one entry; compact to the newest NODE_CACHE_MAX_ENTRIES past the cap. */
export function appendNodeCacheEntry(ws: string, entry: NodeCacheEntry): void {
  const fp = nodeCachePath(ws);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.appendFileSync(fp, JSON.stringify(entry) + "\n");
  const lines = fs.readFileSync(fp, "utf8").split("\n").filter(Boolean);
  if (lines.length > NODE_CACHE_MAX_ENTRIES) {
    fs.writeFileSync(fp, lines.slice(-NODE_CACHE_MAX_ENTRIES).join("\n") + "\n");
  }
}
