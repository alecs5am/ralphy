// Publish idempotency ledger (#531) — exactly-once publishing per workspace.
//
// Publishing is an irreversible, outward-facing action
// (a duplicated YouTube upload or X post cannot be undone cleanly and hurts
// reach via platform dedup/spam heuristics). A crash AFTER the platform accepted
// the post but BEFORE the unit-manifest provenance recorded it, or a targeted
// retry of a partially-succeeded multi-target publish, can double-post. This
// ledger is the exactly-once guard: before firing a target we check it, and
// right after the platform accepts we append to it (belt, ahead of the unit
// manifest append — a crash between the two is recoverable on the next run
// because the ledger already carries the record).
//
// Storage: `.ralphy/workspaces/<ws>/publish-ledger.jsonl` (APPEND-ONLY, one
// line per idempotency key and target).
//
// RECONCILE (belt-and-suspenders, #531/#537 scope): the issue asked for a
// remote confirm against Postiz's already-scheduled state as a SECOND belt
// (ledger first, remote confirm second). VERIFIED against the connector
// (cli/lib/providers/postiz.ts) and the public-API docs it cites: the Postiz
// public API now exposes GET /posts by date range, but not a client-supplied
// idempotency key. Matching only content + date + integration would collapse
// intentional same-copy posts, so reconcile stays LEDGER-ONLY: the pre-fire
// ledger check IS the guard until Postiz exposes a stable correlation field.
//
// RESIDUAL CRASH WINDOW (unclosable with today's Postiz API): there is exactly
// ONE gap — the single `fs.appendFileSync` in `appendPublishLedger` (below)
// that lands the ledger record. If the process dies AFTER Postiz accepts the
// post (`postizCreatePost` returned) but BEFORE that `appendFileSync` returns,
// the ledger has no record for that (key, target) and a re-run WILL re-fire it
// — a double-post. The remote-confirm belt would close exactly this window (a
// re-run would see the already-scheduled post and skip even with no ledger
// row), which is why it stays tracked as #537
// (notes/issues/537-postiz-scheduled-post-reconcile.md). Until Postiz ships the
// stable correlation field, this window is the accepted residual risk of the
// ledger-only guard.

import fs from "node:fs";
import path from "node:path";
import { workspaceDir } from "../paths.js";

/** `<workspace>/publish-ledger.jsonl` */
export function publishLedgerPath(ws: string): string {
  return path.join(workspaceDir(ws), "publish-ledger.jsonl");
}

/**
 * One ledger row — one publish attempt against one target, keyed by its stable
 * idempotency key. A `submitted` / `published` / `scheduled` row blocks a re-fire of the same
 * (key, target); a `failed` row does NOT (a retry is expected to re-fire).
 */
export interface PublishLedgerEntry {
  /** The stable idempotency key (see `publishIdempotencyKey`). */
  key: string;
  workspace: string;
  project: string;
  slug: string;
  /** Target platform ("youtube" | "tiktok" | "instagram" | "x"). */
  target: string;
  /** Provider post id (null when the attempt failed before creation). */
  postId: string | null;
  /** ISO datetime the post is scheduled for (null = posted immediately). */
  scheduleAt: string | null;
  status: "scheduled" | "submitted" | "published" | "failed";
  /** ISO timestamp of the attempt (stamped on append when absent). */
  at: string;
}

/**
 * The idempotency key for a (unit, target, slot) publish. STABLE across
 * resume/retry by construction: it is derived ONLY from identity —
 * `${workspace}|${projectId}/${slug}|${target}|${slot ?? "default"}` — and
 * NEVER from a timestamp or a run id (those change on every resume, which would
 * make the ledger check always miss and defeat exactly-once). The `slot`
 * component is the calendar entryId when the publish targets a calendar slot,
 * else the literal "default".
 *
 * // #528 campaign-cell will refine the slot component
 */
export function publishIdempotencyKey(opts: {
  workspace: string;
  projectId: string;
  slug: string;
  target: string;
  slot?: string | null;
}): string {
  return `${opts.workspace}|${opts.projectId}/${opts.slug}|${opts.target}|${opts.slot ?? "default"}`;
}

/** Read the whole ledger (oldest → newest). Missing file → []. */
export function readPublishLedger(ws: string): PublishLedgerEntry[] {
  return readJsonl<PublishLedgerEntry>(publishLedgerPath(ws));
}

/** Append one ledger line. APPEND-ONLY — never rewritten, never truncated. Stamps `at` when absent. */
export function appendPublishLedger(
  ws: string,
  entry: Omit<PublishLedgerEntry, "at" | "workspace"> & { at?: string },
): PublishLedgerEntry {
  const full: PublishLedgerEntry = {
    at: entry.at ?? new Date().toISOString(),
    workspace: ws,
    ...entry,
  };
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.appendFileSync(publishLedgerPath(ws), JSON.stringify(full) + "\n");
  return full;
}

/**
 * The most-recent ledger entry for this (key, target) with a BLOCKING status
 * (`submitted` | `published` | `scheduled`), or null. A prior `failed` entry does NOT block —
 * it is skipped so a retry can re-fire. Scanning newest-first means a
 * failed-then-succeeded history resolves to the success.
 */
export function findLedgerEntry(
  ws: string,
  key: string,
  target: string,
): PublishLedgerEntry | null {
  const rows = readPublishLedger(ws);
  for (let i = rows.length - 1; i >= 0; i--) {
    const e = rows[i]!;
    if (
      e.key === key &&
      e.target === target &&
      (e.status === "submitted" || e.status === "published" || e.status === "scheduled")
    ) {
      return e;
    }
  }
  return null;
}

// ─── shared (mirrors trust.ts's tolerant torn-line parse) ─────────────────────

function readJsonl<T>(file: string): T[] {
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // torn final line — append-only stores tolerate it
    }
  }
  return out;
}
