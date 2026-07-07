// Humanized posting cadence (#525) — the seeded PRNG, the pure sampler
// (window bounds, weekday profiles, min-gap conflict resolution, resume
// determinism, fixed-offset/disabled fallback), and the calendar-slot
// executor's sampled-time wiring.

import { describe, test, expect, beforeEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makePrng, hashSeed } from "../../cli/lib/farm/prng.js";
import { sampleCadence, enforceMinGap } from "../../cli/lib/farm/cadence.js";
import { parseCadenceConfig, DISABLED_CADENCE_CONFIG } from "../../cli/lib/schemas/cadence.js";
import { readCadenceConfig, writeCadenceConfig } from "../../cli/lib/cadence-config.js";
import { setRoot, workspaceDir } from "../../cli/lib/paths.js";
import { addSlot } from "../../cli/lib/calendar/store.js";
import { getExecutor } from "../../cli/lib/workflow/executors/index.js";
import type { ExecutorContext } from "../../cli/lib/workflow/executors/index.js";
import type { WorkflowNode } from "../../cli/lib/schemas/workflow.js";

// ─── Seeded PRNG ───────────────────────────────────────────────────────────────

describe("seeded PRNG (mulberry32)", () => {
  test("same seed → identical stream; different seed → different stream", () => {
    const a = makePrng("run-abc");
    const b = makePrng("run-abc");
    const c = makePrng("run-xyz");
    const seqA = Array.from({ length: 8 }, () => a.next());
    const seqB = Array.from({ length: 8 }, () => b.next());
    const seqC = Array.from({ length: 8 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  test("floats stay in [0,1); int() stays in [min,max]", () => {
    const p = makePrng(42);
    for (let i = 0; i < 500; i++) {
      const f = p.next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = p.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  test("hashSeed is stable + deterministic", () => {
    expect(hashSeed("a", "b")).toBe(hashSeed("a", "b"));
    expect(hashSeed("a", "b")).not.toBe(hashSeed("b", "a"));
  });
});

// ─── Sampler — window bounds ───────────────────────────────────────────────────

// A UTC slot avoids DST edge noise: 09:00 UTC on 2026-01-12 (a Monday).
const SLOT_ISO = "2026-01-12T09:00:00.000Z";
const UTC = "UTC";

const morningWindowConfig = parseCadenceConfig({
  enabled: true,
  platforms: {
    tiktok: {
      distribution: "uniform",
      windows: [{ start: "08:40", end: "10:15" }],
      minGapMinutes: 0,
      slideProbability: 0,
    },
  },
});

describe("cadence sampler — window bounds", () => {
  test("every sample lands inside the jitter window", () => {
    const loMs = Date.parse("2026-01-12T08:40:00.000Z");
    const hiMs = Date.parse("2026-01-12T10:15:00.000Z");
    for (let i = 0; i < 400; i++) {
      const s = sampleCadence({
        exactIso: SLOT_ISO,
        timezone: UTC,
        platform: "tiktok",
        config: morningWindowConfig,
        seed: `run-${i}`,
      });
      const ms = Date.parse(s.scheduleAt);
      expect(s.sampled).toBe(true);
      expect(ms).toBeGreaterThanOrEqual(loMs);
      expect(ms).toBeLessThanOrEqual(hiMs);
    }
  });

  test("default jitter (no windows) stays within ± defaultJitterMinutes", () => {
    const cfg = parseCadenceConfig({ enabled: true, defaultJitterMinutes: 10 });
    for (let i = 0; i < 200; i++) {
      const s = sampleCadence({
        exactIso: SLOT_ISO,
        timezone: UTC,
        platform: "tiktok",
        config: cfg,
        seed: `r-${i}`,
      });
      expect(Math.abs(s.offsetMinutes)).toBeLessThanOrEqual(10);
      expect(s.basis).toBe("default-jitter");
    }
  });
});

// ─── Sampler — weekday profiles ────────────────────────────────────────────────

describe("cadence sampler — weekday profiles", () => {
  test("a weekday shift moves the window; a different weekday gets a different shift", () => {
    const cfg = parseCadenceConfig({
      enabled: true,
      platforms: {
        tiktok: {
          distribution: "uniform",
          windows: [{ start: "09:00", end: "09:00" }], // pin the draw so only the shift moves it
          weekdayShiftMin: { mon: 30, tue: -30 },
        },
      },
    });
    // 2026-01-12 is Monday, 2026-01-13 is Tuesday.
    const mon = sampleCadence({ exactIso: "2026-01-12T09:00:00.000Z", timezone: UTC, platform: "tiktok", config: cfg, seed: "s" });
    const tue = sampleCadence({ exactIso: "2026-01-13T09:00:00.000Z", timezone: UTC, platform: "tiktok", config: cfg, seed: "s" });
    // Monday pinned window is 09:00, +30 → 09:30.
    expect(mon.scheduleAt).toBe("2026-01-12T09:30:00.000Z");
    // Tuesday pinned window is 09:00, -30 → 08:30.
    expect(tue.scheduleAt).toBe("2026-01-13T08:30:00.000Z");
    expect(mon.scheduleAt.slice(11)).not.toBe(tue.scheduleAt.slice(11));
  });
});

// ─── Sampler — min-gap conflict resolution ─────────────────────────────────────

describe("cadence min-gap", () => {
  test("enforceMinGap pushes a conflicting time to gap after the neighbour", () => {
    const at = Date.parse("2026-01-12T09:05:00.000Z");
    const neighbour = "2026-01-12T09:00:00.000Z";
    const { at: pushed, pushed: didPush } = enforceMinGap(at, [neighbour], 30);
    expect(didPush).toBe(true);
    // 09:00 + 30min = 09:30.
    expect(new Date(pushed).toISOString()).toBe("2026-01-12T09:30:00.000Z");
  });

  test("no conflict → unchanged", () => {
    const at = Date.parse("2026-01-12T12:00:00.000Z");
    const { at: kept, pushed } = enforceMinGap(at, ["2026-01-12T09:00:00.000Z"], 30);
    expect(pushed).toBe(false);
    expect(kept).toBe(at);
  });

  test("two posts too close → second pushed to next valid sample", () => {
    // A tight window forces both samples near 09:00; the neighbour at 09:00
    // pushes the sampled post to >= 09:30.
    const cfg = parseCadenceConfig({
      enabled: true,
      platforms: {
        tiktok: { distribution: "uniform", windows: [{ start: "09:00", end: "09:10" }], minGapMinutes: 30 },
      },
    });
    const s = sampleCadence({
      exactIso: SLOT_ISO,
      timezone: UTC,
      platform: "tiktok",
      config: cfg,
      seed: "gap-seed",
      neighbours: ["2026-01-12T09:00:00.000Z"],
    });
    expect(s.basis).toBe("gap-pushed");
    expect(Date.parse(s.scheduleAt)).toBeGreaterThanOrEqual(Date.parse("2026-01-12T09:30:00.000Z"));
  });
});

// ─── Sampler — resume determinism ──────────────────────────────────────────────

describe("cadence sampler — resume determinism", () => {
  test("same run id (seed) → identical sampled time", () => {
    const a = sampleCadence({ exactIso: SLOT_ISO, timezone: UTC, platform: "tiktok", config: morningWindowConfig, seed: "farm-run-001" });
    const b = sampleCadence({ exactIso: SLOT_ISO, timezone: UTC, platform: "tiktok", config: morningWindowConfig, seed: "farm-run-001" });
    expect(a.scheduleAt).toBe(b.scheduleAt);
  });

  test("different run ids diverge (statistically) across many slots", () => {
    let differ = 0;
    const n = 60;
    for (let i = 0; i < n; i++) {
      const slot = `2026-01-12T09:00:00.000Z`;
      const a = sampleCadence({ exactIso: slot, timezone: UTC, platform: "tiktok", config: morningWindowConfig, seed: `runA-${i}` });
      const b = sampleCadence({ exactIso: slot, timezone: UTC, platform: "tiktok", config: morningWindowConfig, seed: `runB-${i}` });
      if (a.scheduleAt !== b.scheduleAt) differ++;
    }
    // With a 95-minute window at second resolution, near-collision is vanishing.
    expect(differ).toBeGreaterThan(n * 0.9);
  });
});

// ─── Fixed-offset / disabled fallback ──────────────────────────────────────────

describe("cadence disabled fallback", () => {
  test("disabled config → exact time passes through unchanged", () => {
    const s = sampleCadence({ exactIso: SLOT_ISO, timezone: UTC, platform: "tiktok", config: DISABLED_CADENCE_CONFIG, seed: "x" });
    expect(s.sampled).toBe(false);
    expect(s.basis).toBe("disabled");
    expect(s.scheduleAt).toBe(SLOT_ISO);
    expect(s.offsetMinutes).toBe(0);
  });
});

// ─── Config reader (presence gates the default) ────────────────────────────────

describe("cadence config reader", () => {
  beforeEach(() => {
    // readCadenceConfig resolves workspace.json via paths — use a real root.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-cadence-cfg-"));
    fs.mkdirSync(path.join(dir, ".ralphy"), { recursive: true });
    setRoot(dir);
  });

  test("absent cadence block reads back DISABLED (no-op)", () => {
    const wsDir = workspaceDir("cad-ws");
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(wsDir, "workspace.json"), JSON.stringify({ slug: "cad-ws" }) + "\n");
    expect(readCadenceConfig("cad-ws").enabled).toBe(false);
  });

  test("a written cadence block reads back enabled with the profile", () => {
    const wsDir = workspaceDir("cad-ws2");
    fs.mkdirSync(wsDir, { recursive: true });
    fs.writeFileSync(path.join(wsDir, "workspace.json"), JSON.stringify({ slug: "cad-ws2" }) + "\n");
    const merged = writeCadenceConfig("cad-ws2", { defaultJitterMinutes: 15 });
    expect(merged.enabled).toBe(true);
    expect(merged.defaultJitterMinutes).toBe(15);
    expect(readCadenceConfig("cad-ws2").enabled).toBe(true);
  });
});

// ─── calendar-slot executor wiring ─────────────────────────────────────────────

const NY_SLOT = {
  id: "mon-9",
  weekday: "mon",
  time: "09:00",
  timezone: "America/New_York",
  unitType: "short",
  targetPlatforms: ["tiktok", "youtube"],
};

describe("calendar-slot executor — cadence wiring (#525)", () => {
  beforeEach(() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-cadence-exec-"));
    fs.mkdirSync(path.join(dir, ".ralphy"), { recursive: true });
    setRoot(dir);
  });

  function makeCtx(over: Partial<ExecutorContext> = {}): ExecutorContext {
    return {
      workspace: "test",
      workspaceDir: workspaceDir("test"),
      projectId: "proj-001",
      artifactsDir: path.join(workspaceDir("test"), "artifacts"),
      inputs: {},
      log: async () => {},
      reportCost: () => {},
      runId: "farm-run-777",
      ...over,
    };
  }

  function makeNode(params: Record<string, unknown>): WorkflowNode {
    return {
      id: "pick-slot",
      type: "calendar-slot",
      in: {},
      params,
      retry: { max: 0, backoff: "exponential" },
      on_fail: "halt",
      cache: "none",
      emit: true,
    };
  }

  test("no cadence block → exact slot time (pre-#525 behaviour), no sampled marker", async () => {
    const ctx = makeCtx();
    fs.mkdirSync(ctx.workspaceDir, { recursive: true });
    fs.writeFileSync(path.join(ctx.workspaceDir, "workspace.json"), JSON.stringify({ slug: "test" }) + "\n");
    addSlot(ctx.workspaceDir, NY_SLOT);
    const res = await getExecutor("calendar-slot")!(
      makeNode({ unit_type: "short", platform: "tiktok", after: "2026-01-06T00:00:00Z" }),
      ctx,
    );
    const out = res.output as Record<string, unknown>;
    expect(out.scheduleAt).toBe("2026-01-12T14:00:00.000Z");
    expect(out.sampled).toBeUndefined();
  });

  test("cadence enabled → sampled time inside the window, marked sampled + deterministic on resume", async () => {
    const ctx = makeCtx();
    fs.mkdirSync(ctx.workspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(ctx.workspaceDir, "workspace.json"),
      JSON.stringify({
        slug: "test",
        cadence: {
          enabled: true,
          platforms: { tiktok: { distribution: "uniform", windows: [{ start: "08:40", end: "10:15" }] } },
        },
      }) + "\n",
    );
    addSlot(ctx.workspaceDir, NY_SLOT);
    const args = makeNode({ unit_type: "short", platform: "tiktok", after: "2026-01-06T00:00:00Z" });
    const res1 = await getExecutor("calendar-slot")!(args, makeCtx());
    const out1 = res1.output as Record<string, unknown>;
    expect(out1.sampled).toBe(true);
    expect(out1.slotTime).toBe("2026-01-12T14:00:00.000Z");
    // The window is 08:40-10:15 local NY (EST = UTC-5) → 13:40..15:15 UTC.
    const ms = Date.parse(out1.scheduleAt as string);
    expect(ms).toBeGreaterThanOrEqual(Date.parse("2026-01-12T13:40:00.000Z"));
    expect(ms).toBeLessThanOrEqual(Date.parse("2026-01-12T15:15:00.000Z"));

    // Resume: same run id → same sampled time (fresh workspace, re-resolve).
    const ctx2 = makeCtx();
    fs.rmSync(path.join(ctx2.workspaceDir, "calendar.json"), { force: true });
    addSlot(ctx2.workspaceDir, NY_SLOT);
    const res2 = await getExecutor("calendar-slot")!(args, ctx2);
    expect((res2.output as Record<string, unknown>).scheduleAt).toBe(out1.scheduleAt);
  });
});
