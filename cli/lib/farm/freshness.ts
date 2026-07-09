// Source freshness TTL + staleness guard (#542) — the PURE decision layer that
// keeps a backed-up farm from posting "breaking" news that broke last week.
//
// A time-sensitive source item carries a shelf life: `freshness_ttl` (an item
// field, or a node-level default). Between INGESTION and PUBLISH the cadence
// (#525), quota (#534), and approval-park (#533) delays can age a story past
// that life. This module owns three pure, deterministic (inject `now`)
// primitives the runner + scheduler compose with:
//
//   1. resolveFreshnessTtl — item ttl → node param → node content-class default
//      → undefined (EVERGREEN opts out; undefined ttl is never stale).
//   2. classifyFreshness  — age (from source `ts`, NOT ingest time) vs ttl →
//      fresh | stale, with a drop-vs-downgrade action the node configures.
//   3. orderByFreshness   — freshness-weighted ordering WITHIN a priority band,
//      composed with (never overriding) cadence/quota/trust upstream.
//
// AGE FLOOR (honest limitation): age is `now - Date.parse(ts)`, and `ts` is the
// source item's publish time WHEN the backend exposed one, else the ingest time
// (see source-item.ts). We cannot invent a publish time the backend never gave
// us — so for a backend with no publish time the guard measures age from
// ingest, which is the tightest floor available. A late-ingested item that DID
// carry a real publish `ts` is correctly stale; one that never had a publish
// time is only as-old-as-we-first-saw-it. Documented, not hidden.

import { parseWindow } from "../ingestion/store.js";

/**
 * A node's content class → its default freshness TTL. News-shaped content has a
 * short shelf life; evergreen content opts OUT (undefined → never stale). The
 * #502 bundled-defaults hook: a node carries `params.content_class` (or a
 * per-item `content_class`) and inherits the default when it sets no explicit
 * `freshness_ttl`. Data, not magic numbers — overridable per node.
 */
export const NODE_FRESHNESS_DEFAULTS: Record<string, string | undefined> = {
  // Breaking / news-short: a few hours of shelf life.
  "news-short": "6h",
  news: "12h",
  // Trend / social clip: a day.
  trend: "24h",
  // Evergreen article / how-to: no TTL — opts out of the staleness guard.
  evergreen: undefined,
  article: undefined,
};

/** What the guard does to a past-TTL unit: DROP it, or DOWNGRADE it. */
export type StaleAction = "drop" | "downgrade";

/**
 * Resolve the effective TTL (in ms) for a unit at publish time. Precedence:
 *   item `freshness_ttl` → node `params.freshness_ttl` → node
 *   `content_class` default → undefined (EVERGREEN, no guard).
 * A malformed duration is treated as "no TTL" (never crash the farm on a
 * hand-edited param) — the same tolerant posture as parseWindow's callers.
 */
export function resolveFreshnessTtl(sources: {
  itemTtl?: string;
  nodeTtl?: string;
  contentClass?: string;
}): number | undefined {
  const spec =
    sources.itemTtl ??
    sources.nodeTtl ??
    (sources.contentClass ? NODE_FRESHNESS_DEFAULTS[sources.contentClass] : undefined);
  if (!spec) return undefined;
  try {
    return parseWindow(spec);
  } catch {
    return undefined;
  }
}

export interface FreshnessVerdict {
  /** True when the source aged past the TTL. Always false when ttl is undefined (evergreen). */
  stale: boolean;
  /** ms since the source `ts` at `now` (null when `ts` is unparseable). */
  ageMs: number | null;
  /** The resolved TTL in ms (undefined = evergreen / no guard). */
  ttlMs: number | undefined;
  /** For a stale verdict: what the runner should do. undefined when fresh. */
  action?: StaleAction;
}

/**
 * Classify one unit's freshness at publish time. Age is measured from the
 * SOURCE `ts` (publish time when available, else ingest — the honest floor),
 * NOT the current tick, so a late-ingested-but-old story is correctly stale.
 *
 * Evergreen (ttlMs undefined) is NEVER stale. An unparseable `ts` cannot be
 * aged — it is treated as FRESH (fail-open: never drop a unit we cannot date;
 * a missing date is not evidence of staleness).
 */
export function classifyFreshness(
  ts: string,
  ttlMs: number | undefined,
  now: number,
  action: StaleAction = "drop",
): FreshnessVerdict {
  const parsed = Date.parse(ts);
  const ageMs = Number.isFinite(parsed) ? now - parsed : null;
  if (ttlMs === undefined) return { stale: false, ageMs, ttlMs };
  if (ageMs === null) return { stale: false, ageMs, ttlMs };
  const stale = ageMs > ttlMs;
  return { stale, ageMs, ttlMs, ...(stale ? { action } : {}) };
}

/**
 * Freshness-weighted ordering WITHIN a priority band. When queued units exceed
 * slot capacity, a fresher story preempts an older queued one — but ONLY among
 * equal-priority units: this NEVER reorders across priority, and it does NOT
 * decide capacity, cadence, quota, or the trust gate (those run upstream and
 * their decisions are inputs, not overrides). Pure + stable:
 *
 *   • primary key:   priority DESC (higher priority first) — untouched.
 *   • secondary key: source `ts` DESC (fresher — larger ts — first).
 *   • tie-break:     the input index (stable; deterministic, never clock-based).
 *
 * A unit with an unparseable `ts` sorts OLDEST within its band (a story we
 * cannot date should not preempt one we can prove is fresh).
 */
export interface Queued {
  /** Priority band this unit sits in (higher = more important). Default 0. */
  priority?: number;
  /** The source `ts` (ISO) freshness sorts on. */
  ts: string;
}

export function orderByFreshness<T extends Queued>(items: T[], now?: number): T[] {
  void now; // ordering is relative; `now` is accepted for signature symmetry.
  const tsMs = (i: T) => {
    const t = Date.parse(i.ts);
    return Number.isFinite(t) ? t : -Infinity; // undateable → oldest
  };
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const pa = a.item.priority ?? 0;
      const pb = b.item.priority ?? 0;
      if (pa !== pb) return pb - pa; // priority DESC — never reordered across bands
      const ta = tsMs(a.item);
      const tb = tsMs(b.item);
      if (ta !== tb) return tb - ta; // fresher (larger ts) first, within band
      return a.index - b.index; // stable
    })
    .map((w) => w.item);
}
