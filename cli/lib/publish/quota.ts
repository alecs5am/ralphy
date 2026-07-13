// Per-platform publish-quota governor (#534) — the publish path consults this
// BEFORE committing a post so a campaign at 30/30/30 volume (#528)
// does not silently exhaust a platform's day-1 quota and fail the rest.
//
// WHY THIS IS A SEPARATE RESOURCE FROM #522: #522 governs GENERATION provider
// concurrency (OpenRouter/fal/ElevenLabs — cost + burst caps). This models the
// PUBLISHING platform limits, which are a different axis entirely: the YouTube
// Data API meters an upload at ~1600 units of a default 10,000/day budget
// (≈6 uploads/day without a raise); X caps posts per rolling window;
// dev.to / Hashnode rate-limit writes. Exhaustion here is not a $ problem — it
// is a "the platform stops accepting today" wall.
//
// DELIBERATELY DATA-DRIVEN + DATED (issue note): platform quotas DRIFT. Every
// PLATFORM_QUOTAS entry carries a `source` + a `verifiedOn` date, and
// `isQuotaStale` flags an entry the maintainer hasn't re-confirmed. NEVER bake
// a cap as an inline magic number in the reschedule logic — it lives in the
// table, overridable per workspace through `quotaOverrides`.
//
// STORAGE: the rolling usage ledger is `.ralphy/workspaces/<ws>/publish-quota.jsonl`
// (APPEND-ONLY, one row per publish). Same store shape as publish/ledger.ts —
// the same `workspaceDir(ws)` home, the same tolerant
// torn-line JSONL read, the same `fs.mkdirSync(..., { recursive: true })`
// before append.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { workspaceDir, workspaceManifestPath } from "../paths.js";

// ─── The quota table (DATA — dated, sourced) ─────────────────────────────────
//
// The set of platforms Ralphy can publish to. Broader than the #501
// PublishTarget union (youtube|tiktok|instagram|x) because a quota is a
// property of the PLATFORM, not of the Postiz binding — dev.to / Hashnode
// publish through separate write paths but still meter writes.
export const QUOTA_PLATFORMS = [
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "devto",
  "hashnode",
] as const;
export type QuotaPlatform = (typeof QUOTA_PLATFORMS)[number];

/** When does a platform's usage window reset. */
export type QuotaResetBoundary = "daily-utc" | "rolling-24h";

export interface PlatformQuota {
  /** Max publishes per reset window (via API-unit cost when the platform meters units). */
  dailyCap?: number;
  /** Max publishes inside a rolling window (with `windowHours`) — used instead of dailyCap. */
  windowCap?: number;
  /** The rolling-window length in hours (only meaningful with windowCap / rolling-24h). */
  windowHours?: number;
  /**
   * API-unit cost of ONE publish (YouTube: an upload ≈ 1600 of a 10,000/day
   * budget). Informational — dailyCap already folds this in (10000/1600 ≈ 6) —
   * but kept so the number is auditable against the platform's own docs.
   */
  apiUnitCostPerPublish?: number;
  /** Where the usage window boundary sits. */
  resetBoundary: QuotaResetBoundary;
  /** Documented source for the cap. `unverified …` when we have no citation. */
  source: string;
  /** ISO date (YYYY-MM-DD) the cap was last confirmed. Quotas drift — see isQuotaStale. */
  verifiedOn: string;
}

/**
 * Declared per-platform quotas. Each entry is DATA: a cap + a `source` + a
 * `verifiedOn`. Where a value has no documented source it is marked
 * `unverified — needs confirmation` and set CONSERVATIVELY (better to
 * reschedule a publish we could have sent than to hard-fail one we could not).
 */
export const PLATFORM_QUOTAS: Record<QuotaPlatform, PlatformQuota> = {
  youtube: {
    // Default YouTube Data API v3 budget is 10,000 units/day; a videos.insert
    // upload costs ~1600 units → ⌊10000/1600⌋ = 6 uploads/day at the default.
    dailyCap: 6,
    apiUnitCostPerPublish: 1600,
    resetBoundary: "daily-utc",
    source:
      "YouTube Data API v3 quota (10,000 units/day default; videos.insert ≈ 1600 units) — developers.google.com/youtube/v3/getting-started#quota",
    verifiedOn: "2026-07-08",
  },
  x: {
    // As of 2026-02-06 X removed the free/basic tiers for NEW developers and
    // defaults to pay-per-use, which meters writes by COST (billed per POST),
    // not by a fixed daily post cap — so there is no single documented per-day
    // ceiling to cite (cost is governed by #522, not here). The legacy free
    // tier was 50 posts/day. We keep a conservative rolling-24h floor so a
    // campaign paces smoothly regardless of the operator's access tier.
    windowCap: 17,
    windowHours: 24,
    resetBoundary: "rolling-24h",
    source:
      "confirmed: no single documented per-day POST cap under 2026 pay-per-use (cost-metered); legacy free tier was 50/day; conservative floor retained — docs.x.com/x-api/fundamentals/rate-limits + 2026-02 pricing change",
    verifiedOn: "2026-07-09",
  },
  tiktok: {
    // TikTok Content Posting API (Direct Post) caps a creator account at ~15
    // posts / 24h, shared across all API clients (6 req/min per user token on
    // top). 15 matches the documented per-creator daily upper limit.
    windowCap: 15,
    windowHours: 24,
    resetBoundary: "rolling-24h",
    source:
      "confirmed: TikTok Content Posting API Direct Post ~15 posts/24h per creator account (shared across clients), 6 req/min per user token — developers.tiktok.com/doc/tiktok-api-v2-rate-limit",
    verifiedOn: "2026-07-09",
  },
  instagram: {
    // Instagram Graph API content-publishing limit is 25 API-published posts
    // per user in a rolling 24h window (documented).
    windowCap: 25,
    windowHours: 24,
    resetBoundary: "rolling-24h",
    source:
      "Instagram Graph API content publishing limit (25 posts / 24h per user) — developers.facebook.com/docs/instagram-platform/content-publishing#rate-limiting",
    verifiedOn: "2026-07-08",
  },
  devto: {
    // Forem/dev.to documents a general API rate limit of 10 requests / 30s and
    // publishes NO per-day article-creation cap. This is a confirmed
    // "no documented daily cap" — we keep a conservative daily floor so a big
    // campaign paces rather than hammering the 30s burst limit.
    dailyCap: 10,
    resetBoundary: "daily-utc",
    source:
      "confirmed: no documented daily article cap; Forem API general limit 10 req/30s — developers.forem.com/api; conservative daily floor retained",
    verifiedOn: "2026-07-09",
  },
  hashnode: {
    // Hashnode's GraphQL API documents 500 mutations/minute (enforced via the
    // Stellate edge cache) and NO per-day publishPost cap. Confirmed
    // "no documented daily cap" — conservative daily floor so a big campaign
    // paces rather than 429s.
    dailyCap: 20,
    resetBoundary: "daily-utc",
    source:
      "confirmed: no documented daily cap; GraphQL API allows 500 mutations/min — apidocs.hashnode.com; conservative daily floor retained",
    verifiedOn: "2026-07-09",
  },
};

/** Is this a platform we declare a quota for? */
export function isQuotaPlatform(p: string): p is QuotaPlatform {
  return (QUOTA_PLATFORMS as readonly string[]).includes(p);
}

/**
 * Flag a quota entry the maintainer hasn't re-confirmed inside `maxAgeDays`
 * (default 180). Quotas drift; a stale entry is a signal to re-check the
 * platform docs, NOT a reason to block a publish. Malformed `verifiedOn`
 * counts as stale.
 */
export function isQuotaStale(
  entry: PlatformQuota,
  now: Date,
  maxAgeDays = 180,
): boolean {
  const verified = Date.parse(entry.verifiedOn);
  if (!Number.isFinite(verified)) return true;
  const ageDays = (now.getTime() - verified) / 86_400_000;
  return ageDays > maxAgeDays;
}

// ─── Config override (workspace.json `quotaOverrides`) ───────────────────────

/**
 * A user who raised their platform quota (e.g. a YouTube Data API quota
 * increase) overrides the default cap via workspace.json. Malformed values
 * degrade away (`.catch`) — a hand-edited manifest never crashes the farm.
 */
const QuotaOverrideSchema = z
  .object({
    dailyCap: z.number().positive().optional(),
    windowCap: z.number().positive().optional(),
    windowHours: z.number().positive().optional(),
    apiUnitCostPerPublish: z.number().positive().optional(),
  })
  .partial()
  .catch({});

const QuotaOverridesSchema = z.record(z.string(), QuotaOverrideSchema).catch({});
export type QuotaOverrides = z.infer<typeof QuotaOverridesSchema>;

function readManifest(ws: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(workspaceManifestPath(ws), "utf8"));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The workspace's `quotaOverrides` map (empty when unset/malformed). */
export function readQuotaOverrides(ws: string): QuotaOverrides {
  return QuotaOverridesSchema.parse(readManifest(ws).quotaOverrides ?? {});
}

/**
 * The effective quota for a platform in a workspace: the PLATFORM_QUOTAS
 * default MERGED under the workspace's override (override wins field-by-field).
 * Returns null for a platform with no declared quota AND no override — an
 * unknown platform is treated as UNLIMITED (never blocks), not as cap 0.
 * `overrides` can be injected for tests; defaults to the workspace read.
 */
export function effectiveQuota(
  platform: string,
  ws?: string,
  overrides?: QuotaOverrides,
): PlatformQuota | null {
  const base = isQuotaPlatform(platform) ? PLATFORM_QUOTAS[platform] : undefined;
  const ov = (overrides ?? (ws ? readQuotaOverrides(ws) : {}))[platform];
  if (!base && !ov) return null;
  if (!base) {
    // An override on a platform we don't ship a default for: build a minimal
    // entry from the override (daily-utc floor, unverified source).
    return {
      ...ov,
      resetBoundary: "daily-utc",
      source: "workspace quotaOverrides (no shipped default)",
      verifiedOn: "1970-01-01",
    };
  }
  return { ...base, ...ov };
}

// ─── Rolling usage ledger (append-only) ──────────────────────────────────────

export interface QuotaUsageEntry {
  workspace: string;
  platform: string;
  /** API units this publish consumed (defaults to the platform's per-publish cost, else 1). */
  apiUnits: number;
  /** ISO timestamp of the publish (stamped on append when absent). */
  at: string;
}

/** `<workspace>/publish-quota.jsonl` */
export function quotaUsagePath(ws: string): string {
  return path.join(workspaceDir(ws), "publish-quota.jsonl");
}

/** Read the whole usage ledger (oldest → newest). Missing file → []. */
export function readQuotaUsage(ws: string): QuotaUsageEntry[] {
  return readJsonl<QuotaUsageEntry>(quotaUsagePath(ws));
}

/**
 * Append one usage row for a successful publish/schedule. APPEND-ONLY — never
 * rewritten or truncated. `apiUnits` defaults to the platform's per-publish
 * cost (else 1 publish). `now` is injectable for deterministic tests.
 */
export function recordQuotaUsage(
  ws: string,
  platform: string,
  now: Date = new Date(),
  overrides?: QuotaOverrides,
): QuotaUsageEntry {
  const q = effectiveQuota(platform, ws, overrides);
  const apiUnits = q?.apiUnitCostPerPublish ?? 1;
  const entry: QuotaUsageEntry = { workspace: ws, platform, apiUnits, at: now.toISOString() };
  fs.mkdirSync(workspaceDir(ws), { recursive: true });
  fs.appendFileSync(quotaUsagePath(ws), JSON.stringify(entry) + "\n");
  return entry;
}

// ─── Window math (pure) ──────────────────────────────────────────────────────

/**
 * The [start, end) of the reset window `now` falls in.
 *   • daily-utc  — [00:00 UTC today, 00:00 UTC tomorrow).
 *   • rolling-24h — [now - windowHours, now) (a trailing window).
 */
export function currentWindow(
  entry: PlatformQuota,
  now: Date,
): { start: number; end: number } {
  const nowMs = now.getTime();
  if (entry.resetBoundary === "rolling-24h") {
    const hours = entry.windowHours ?? 24;
    return { start: nowMs - hours * 3_600_000, end: nowMs };
  }
  // daily-utc: floor to UTC midnight.
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return { start, end: start + 86_400_000 };
}

/**
 * The ISO instant the current window's quota resets — the FLOOR an over-quota
 * publish is pushed to before cadence humanizes it.
 *   • daily-utc  — next UTC midnight.
 *   • rolling-24h — the moment the OLDEST publish inside the window ages out
 *     (that is when headroom next opens); falls back to now + windowHours when
 *     usage is not supplied.
 */
export function nextQuotaWindow(
  entry: PlatformQuota,
  now: Date,
  usageInWindow?: QuotaUsageEntry[],
): string {
  if (entry.resetBoundary === "daily-utc") {
    return new Date(currentWindow(entry, now).end).toISOString();
  }
  const hours = entry.windowHours ?? 24;
  const windowMs = hours * 3_600_000;
  const inWindow = (usageInWindow ?? [])
    .map((u) => Date.parse(u.at))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  // The oldest in-window publish ages out at (its time + windowMs) — that opens
  // the next slot. No usage given → a full window from now.
  const oldest = inWindow[0];
  const resetMs = oldest !== undefined ? oldest + windowMs : now.getTime() + windowMs;
  return new Date(resetMs).toISOString();
}

// ─── Headroom (pure, tested) ─────────────────────────────────────────────────

export interface QuotaHeadroom {
  platform: string;
  /** The cap in PUBLISHES for this window; Infinity when the platform is unlimited. */
  cap: number;
  /** Publishes counted inside the current reset window. */
  used: number;
  /** cap - used, floored at 0; Infinity when unlimited. */
  remaining: number;
  /** ISO instant the window resets (null when unlimited — no reset relevant). */
  resetsAt: string | null;
  /** The declared quota entry is past its freshness horizon. */
  stale: boolean;
}

/** The cap expressed in PUBLISHES (dailyCap or windowCap), else Infinity. */
function capPublishes(entry: PlatformQuota): number {
  if (typeof entry.dailyCap === "number") return entry.dailyCap;
  if (typeof entry.windowCap === "number") return entry.windowCap;
  return Infinity;
}

/**
 * Headroom for a (workspace, platform) at `now`: the cap, the usage summed
 * inside the current reset window, the remaining publishes, when it resets, and
 * whether the declared quota is stale. A platform with NO declared quota
 * (and no override) is UNLIMITED — cap/remaining Infinity, never blocks.
 * `overrides` is injectable for tests.
 */
export function quotaHeadroom(
  ws: string,
  platform: string,
  now: Date,
  overrides?: QuotaOverrides,
): QuotaHeadroom {
  const entry = effectiveQuota(platform, ws, overrides);
  if (!entry) {
    return { platform, cap: Infinity, used: 0, remaining: Infinity, resetsAt: null, stale: false };
  }
  const { start, end } = currentWindow(entry, now);
  const usageInWindow = readQuotaUsage(ws).filter(
    (u) => u.platform === platform && (() => {
      const t = Date.parse(u.at);
      return Number.isFinite(t) && t >= start && t < end;
    })(),
  );
  const used = usageInWindow.length;
  const cap = capPublishes(entry);
  const remaining = cap === Infinity ? Infinity : Math.max(0, cap - used);
  return {
    platform,
    cap,
    used,
    remaining,
    resetsAt: nextQuotaWindow(entry, now, usageInWindow),
    stale: isQuotaStale(entry, now),
  };
}

/** Does this (workspace, platform) have at least one publish of headroom at `now`? */
export function hasHeadroom(
  ws: string,
  platform: string,
  now: Date,
  overrides?: QuotaOverrides,
): boolean {
  return quotaHeadroom(ws, platform, now, overrides).remaining > 0;
}

// ─── Reschedule-on-exhaustion (composes with cadence #525) ───────────────────

export interface QuotaReschedule {
  /** True when the requested time had no headroom and the publish was pushed. */
  rescheduled: boolean;
  /** The instant to schedule at: the original when there was headroom, else the next window. */
  scheduleAt: string;
  platform: string;
  /** The headroom snapshot the decision was made on (for the journal / result). */
  headroom: QuotaHeadroom;
  /** Human-readable reason, present only when rescheduled. */
  reason?: string;
}

/**
 * The core governor decision for ONE target: given a resolved `scheduleAt`
 * (ISO, or null = "now"), does the platform have headroom in that window? If
 * yes, pass through unchanged. If no, push to `nextQuotaWindow` — the FLOOR
 * the caller then hands to cadence for humanization. A platform with no
 * declared quota passes through (today's behaviour). Pure given the injected
 * `now` + the on-disk usage ledger.
 */
export function rescheduleForQuota(
  ws: string,
  platform: string,
  scheduleAt: string | null,
  now: Date,
  overrides?: QuotaOverrides,
): QuotaReschedule {
  // The window to check is the requested schedule time (a future slot), else now.
  const at = scheduleAt && Number.isFinite(Date.parse(scheduleAt)) ? new Date(Date.parse(scheduleAt)) : now;
  const headroom = quotaHeadroom(ws, platform, at, overrides);
  const requested = scheduleAt ?? now.toISOString();
  if (headroom.remaining > 0) {
    return { rescheduled: false, scheduleAt: requested, platform, headroom };
  }
  const floor = headroom.resetsAt ?? requested;
  // Never push BACKWARD: if the reset floor is before the requested time, keep
  // the requested time (headroom will have opened by then).
  const pushed = Date.parse(floor) > Date.parse(requested) ? floor : requested;
  return {
    rescheduled: pushed !== requested,
    scheduleAt: pushed,
    platform,
    headroom,
    reason: `${platform} quota exhausted (${headroom.used}/${headroom.cap} used in window) — pushed to next window ${pushed}`,
  };
}

// ─── shared torn-line-tolerant JSONL parsing ─────────────────────────────────

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
