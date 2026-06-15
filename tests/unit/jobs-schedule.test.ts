// Pure scheduler decision (#428 part D). No daemon, no DB.

import { describe, test, expect } from "bun:test";
import {
  canDispatch,
  dispatchableKinds,
  type ScheduleConfig,
} from "../../cli/lib/jobs/schedule.js";

const base: ScheduleConfig = { globalConcurrency: 4 };

describe("schedule · default = unchanged behavior", () => {
  test("with no per-kind config, every kind is dispatchable up to global cap", () => {
    // 3 image jobs running, global cap 4 → still dispatchable (cap defaults to global).
    expect(canDispatch("generate.image", { "generate.image": 3 }, {}, 1000, base)).toBe(true);
  });

  test("global cap is the outer bound even with default per-kind", () => {
    expect(canDispatch("generate.image", { "generate.image": 4 }, {}, 1000, base)).toBe(false);
  });

  test("dispatchableKinds returns all candidates unchanged under default config", () => {
    const candidates = ["generate.image", "render", "shell"] as const;
    expect(
      dispatchableKinds([...candidates], {}, {}, 1000, base),
    ).toEqual([...candidates]);
  });
});

describe("schedule · per-kind concurrency cap", () => {
  test("a kind at its per-kind cap is not dispatchable even below global", () => {
    const cfg: ScheduleConfig = {
      globalConcurrency: 4,
      perKind: { "generate.image": { maxConcurrent: 1 } },
    };
    expect(canDispatch("generate.image", { "generate.image": 1 }, {}, 1000, cfg)).toBe(false);
    // Another kind is unaffected.
    expect(canDispatch("render", { "generate.image": 1 }, {}, 1000, cfg)).toBe(true);
  });
});

describe("schedule · min-interval gating", () => {
  const cfg: ScheduleConfig = {
    globalConcurrency: 4,
    perKind: { "generate.image": { minIntervalMs: 1000 } },
  };

  test("blocks a kind dispatched too recently", () => {
    expect(
      canDispatch("generate.image", {}, { "generate.image": 5000 }, 5500, cfg),
    ).toBe(false);
  });

  test("allows a kind once the interval has elapsed", () => {
    expect(
      canDispatch("generate.image", {}, { "generate.image": 5000 }, 6000, cfg),
    ).toBe(true);
  });

  test("a never-dispatched kind is allowed immediately", () => {
    expect(canDispatch("generate.image", {}, {}, 0, cfg)).toBe(true);
  });

  test("minInterval=0 (default) never gates", () => {
    expect(
      canDispatch("render", {}, { render: 999 }, 1000, base),
    ).toBe(true);
  });
});
