// Per-platform publish-quota governor (#534) — pure headroom math, rolling
// window drain, reschedule-on-exhaustion, config override, staleness flag,
// no-quota-declared pass-through, and the 429/quota → transient classification.
//
// Determinism: `now` is injected everywhere (no wall-clock reads), and the
// usage ledger is seeded on an isolated tmp root so the window math is exact.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { workspaceDir } from "../../cli/lib/paths";
import {
  PLATFORM_QUOTAS,
  QUOTA_PLATFORMS,
  effectiveQuota,
  isQuotaStale,
  isQuotaPlatform,
  quotaHeadroom,
  hasHeadroom,
  nextQuotaWindow,
  rescheduleForQuota,
  recordQuotaUsage,
  readQuotaUsage,
  type QuotaOverrides,
} from "../../cli/lib/publish/quota";
import { classifyError } from "../../cli/lib/errors/taxonomy";

const WS = "default";
let tmp: TmpRoot;

beforeEach(() => {
  tmp = makeTmpRoot("ralphy-quota-534");
  fs.mkdirSync(workspaceDir(WS), { recursive: true });
});
afterEach(() => tmp.cleanup());

/** Append a usage row directly at a chosen instant (bypasses recordQuotaUsage's clock). */
function seedUsage(platform: string, isos: string[]): void {
  const p = path.join(workspaceDir(WS), "publish-quota.jsonl");
  const lines = isos.map((at) => JSON.stringify({ workspace: WS, platform, apiUnits: 1, at }));
  fs.appendFileSync(p, lines.join("\n") + "\n");
}

/** Set a workspace.json quotaOverrides block. */
function writeOverrides(overrides: QuotaOverrides): void {
  fs.writeFileSync(
    path.join(workspaceDir(WS), "workspace.json"),
    JSON.stringify({ slug: WS, quotaOverrides: overrides }, null, 2),
  );
}

// ─── the shipped table (data, dated) ─────────────────────────────────────────

describe("PLATFORM_QUOTAS table", () => {
  test("every declared platform carries a cap + source + verifiedOn", () => {
    for (const p of QUOTA_PLATFORMS) {
      const e = PLATFORM_QUOTAS[p];
      expect(e.source.length).toBeGreaterThan(10);
      expect(e.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const cap = e.dailyCap ?? e.windowCap;
      expect(typeof cap).toBe("number");
      expect(cap!).toBeGreaterThan(0);
    }
  });

  test("YouTube ≈ 6 uploads/day with the documented 1600-unit cost", () => {
    expect(PLATFORM_QUOTAS.youtube.dailyCap).toBe(6);
    expect(PLATFORM_QUOTAS.youtube.apiUnitCostPerPublish).toBe(1600);
    expect(PLATFORM_QUOTAS.youtube.source).not.toContain("unverified");
  });

  test("isQuotaPlatform gates the union", () => {
    expect(isQuotaPlatform("youtube")).toBe(true);
    expect(isQuotaPlatform("devto")).toBe(true);
    expect(isQuotaPlatform("mastodon")).toBe(false);
  });
});

// ─── headroom math (empty / partial / exhausted) ─────────────────────────────

describe("quotaHeadroom", () => {
  const NOW = new Date("2026-07-08T12:00:00.000Z");

  test("empty ledger → full cap remaining", () => {
    const h = quotaHeadroom(WS, "youtube", NOW);
    expect(h.used).toBe(0);
    expect(h.cap).toBe(6);
    expect(h.remaining).toBe(6);
    expect(h.resetsAt).toBe("2026-07-09T00:00:00.000Z"); // next UTC midnight
  });

  test("partial usage inside the window reduces remaining", () => {
    seedUsage("youtube", [
      "2026-07-08T01:00:00.000Z",
      "2026-07-08T05:00:00.000Z",
      "2026-07-08T09:00:00.000Z",
    ]);
    const h = quotaHeadroom(WS, "youtube", NOW);
    expect(h.used).toBe(3);
    expect(h.remaining).toBe(3);
  });

  test("exhausted → remaining 0, hasHeadroom false", () => {
    seedUsage(
      "youtube",
      Array.from({ length: 6 }, (_v, i) => `2026-07-08T0${i}:00:00.000Z`),
    );
    const h = quotaHeadroom(WS, "youtube", NOW);
    expect(h.used).toBe(6);
    expect(h.remaining).toBe(0);
    expect(hasHeadroom(WS, "youtube", NOW)).toBe(false);
  });

  test("usage OUTSIDE the daily-utc window is not counted", () => {
    seedUsage("youtube", ["2026-07-07T23:00:00.000Z"]); // previous UTC day
    expect(quotaHeadroom(WS, "youtube", NOW).used).toBe(0);
  });

  test("rolling-24h counts only the trailing window", () => {
    // x = rolling-24h. NOW = 12:00; two posts 25h/2h ago → only the 2h one counts.
    seedUsage("x", ["2026-07-07T11:00:00.000Z", "2026-07-08T10:00:00.000Z"]);
    expect(quotaHeadroom(WS, "x", NOW).used).toBe(1);
  });
});

// ─── no quota declared → unlimited pass-through ──────────────────────────────

describe("no declared quota → unlimited", () => {
  const NOW = new Date("2026-07-08T12:00:00.000Z");
  test("unknown platform never blocks", () => {
    const h = quotaHeadroom(WS, "mastodon", NOW);
    expect(h.cap).toBe(Infinity);
    expect(h.remaining).toBe(Infinity);
    expect(h.resetsAt).toBeNull();
    expect(hasHeadroom(WS, "mastodon", NOW)).toBe(true);
  });
  test("rescheduleForQuota passes an unknown platform through unchanged", () => {
    const at = "2026-07-20T10:00:00.000Z";
    const r = rescheduleForQuota(WS, "mastodon", at, NOW);
    expect(r.rescheduled).toBe(false);
    expect(r.scheduleAt).toBe(at);
  });
});

// ─── reschedule-on-exhaustion (to next window) ───────────────────────────────

describe("rescheduleForQuota", () => {
  const NOW = new Date("2026-07-08T12:00:00.000Z");

  test("headroom available → pass-through (never moves the time)", () => {
    const at = "2026-07-08T15:00:00.000Z";
    const r = rescheduleForQuota(WS, "youtube", at, NOW);
    expect(r.rescheduled).toBe(false);
    expect(r.scheduleAt).toBe(at);
  });

  test("exhausted daily-utc → pushed to next UTC midnight", () => {
    seedUsage(
      "youtube",
      Array.from({ length: 6 }, (_v, i) => `2026-07-08T0${i}:00:00.000Z`),
    );
    const r = rescheduleForQuota(WS, "youtube", "2026-07-08T15:00:00.000Z", NOW);
    expect(r.rescheduled).toBe(true);
    expect(r.scheduleAt).toBe("2026-07-09T00:00:00.000Z");
    expect(r.reason).toContain("quota exhausted");
  });

  test("'now' (null scheduleAt) exhausted → pushed to next window", () => {
    seedUsage(
      "youtube",
      Array.from({ length: 6 }, (_v, i) => `2026-07-08T0${i}:00:00.000Z`),
    );
    const r = rescheduleForQuota(WS, "youtube", null, NOW);
    expect(r.rescheduled).toBe(true);
    expect(Date.parse(r.scheduleAt)).toBeGreaterThan(NOW.getTime());
  });

  test("never pushes backward (reset floor before the requested time)", () => {
    // Exhaust today, but request a slot NEXT week — headroom will have opened.
    seedUsage(
      "youtube",
      Array.from({ length: 6 }, (_v, i) => `2026-07-08T0${i}:00:00.000Z`),
    );
    const at = "2026-07-15T10:00:00.000Z";
    const r = rescheduleForQuota(WS, "youtube", at, NOW);
    // The check window is the requested time (next week), which is empty → pass-through.
    expect(r.rescheduled).toBe(false);
    expect(r.scheduleAt).toBe(at);
  });
});

// ─── multi-day drain of a 30-item plan ───────────────────────────────────────

describe("multi-day drain of a 30-item YouTube plan", () => {
  test("6/day quota clears 30 uploads over 5 UTC days", () => {
    // Walk day by day: each day publish until the daily cap, then advance now.
    let published = 0;
    let dayOffset = 0;
    const clearedDays: number[] = [];
    while (published < 30 && dayOffset < 20) {
      const now = new Date(`2026-07-${String(8 + dayOffset).padStart(2, "0")}T09:00:00.000Z`);
      let dayCount = 0;
      while (published < 30 && hasHeadroom(WS, "youtube", now)) {
        // stagger within the day so timestamps differ
        const at = new Date(now.getTime() + dayCount * 60_000);
        recordQuotaUsage(WS, "youtube", at);
        published++;
        dayCount++;
      }
      clearedDays.push(dayCount);
      dayOffset++;
    }
    expect(published).toBe(30);
    // 6 + 6 + 6 + 6 + 6 = 30 over exactly 5 days.
    expect(clearedDays.slice(0, 5)).toEqual([6, 6, 6, 6, 6]);
    // The ledger holds all 30 rows (append-only).
    expect(readQuotaUsage(WS).filter((u) => u.platform === "youtube").length).toBe(30);
  });
});

// ─── config override ─────────────────────────────────────────────────────────

describe("quota override (workspace.json quotaOverrides)", () => {
  const NOW = new Date("2026-07-08T12:00:00.000Z");

  test("a raised YouTube cap lifts the headroom", () => {
    writeOverrides({ youtube: { dailyCap: 50 } });
    expect(effectiveQuota("youtube", WS)!.dailyCap).toBe(50);
    seedUsage(
      "youtube",
      Array.from({ length: 6 }, (_v, i) => `2026-07-08T0${i}:00:00.000Z`),
    );
    const h = quotaHeadroom(WS, "youtube", NOW);
    expect(h.cap).toBe(50);
    expect(h.remaining).toBe(44);
    expect(hasHeadroom(WS, "youtube", NOW)).toBe(true);
  });

  test("injected overrides bypass the workspace read", () => {
    const h = quotaHeadroom(WS, "youtube", NOW, { youtube: { dailyCap: 2 } });
    expect(h.cap).toBe(2);
  });

  test("a malformed override degrades to the default (never crashes)", () => {
    fs.writeFileSync(
      path.join(workspaceDir(WS), "workspace.json"),
      JSON.stringify({ slug: WS, quotaOverrides: { youtube: { dailyCap: "lots" } } }),
    );
    // The bad field is dropped; the shipped default (6) survives.
    expect(effectiveQuota("youtube", WS)!.dailyCap).toBe(6);
  });
});

// ─── staleness flag ──────────────────────────────────────────────────────────

describe("isQuotaStale", () => {
  test("fresh within horizon → not stale", () => {
    const entry = PLATFORM_QUOTAS.youtube;
    const soonAfter = new Date("2026-08-01T00:00:00.000Z"); // ~24 days later
    expect(isQuotaStale(entry, soonAfter)).toBe(false);
  });

  test("past the 180-day horizon → stale", () => {
    const entry = PLATFORM_QUOTAS.youtube; // verifiedOn 2026-07-08
    const wayLater = new Date("2027-06-01T00:00:00.000Z"); // ~330 days later
    expect(isQuotaStale(entry, wayLater)).toBe(true);
  });

  test("malformed verifiedOn counts as stale", () => {
    expect(isQuotaStale({ ...PLATFORM_QUOTAS.youtube, verifiedOn: "not-a-date" }, new Date())).toBe(true);
  });
});

// ─── nextQuotaWindow ─────────────────────────────────────────────────────────

describe("nextQuotaWindow", () => {
  test("daily-utc → next UTC midnight", () => {
    const iso = nextQuotaWindow(PLATFORM_QUOTAS.youtube, new Date("2026-07-08T15:30:00.000Z"));
    expect(iso).toBe("2026-07-09T00:00:00.000Z");
  });

  test("rolling-24h → oldest in-window publish ages out", () => {
    const now = new Date("2026-07-08T12:00:00.000Z");
    const usage = [{ workspace: WS, platform: "x", apiUnits: 1, at: "2026-07-08T02:00:00.000Z" }];
    // oldest + 24h = 2026-07-09T02:00:00Z
    expect(nextQuotaWindow(PLATFORM_QUOTAS.x, now, usage)).toBe("2026-07-09T02:00:00.000Z");
  });
});

// ─── 429 / quota-exceeded → transient (#519) ─────────────────────────────────

describe("429 / platform quota → provider-transient (dead-letter backs off)", () => {
  test("HTTP 429 stays transient", () => {
    const c = classifyError({ message: "status 429 Too Many Requests" });
    expect(c.class).toBe("provider-transient");
    expect(c.retryPolicy).toBe("retry-with-backoff");
  });

  test("YouTube 403 quotaExceeded classifies transient (not a hard 4xx reject)", () => {
    const c = classifyError({
      message: 'The request cannot be completed because you have exceeded your quota. reason: "quotaExceeded"',
    });
    expect(c.class).toBe("provider-transient");
    expect(c.retryPolicy).toBe("retry-with-backoff");
  });

  test("rateLimitExceeded / daily limit exceeded → transient", () => {
    for (const msg of ["error: rateLimitExceeded", "Daily Limit Exceeded", "quota_exceeded"]) {
      expect(classifyError({ message: msg }).class).toBe("provider-transient");
    }
  });
});
