// Per-endpoint concurrency self-throttle tests (#007).
//
// The semaphore is in-process. We exercise it with synthetic async work and
// assert the cap is never exceeded. No live API calls — pure logic.

import { describe, test, expect, beforeEach } from "bun:test";
import {
  withConcurrency,
  capFor,
  snapshot,
  providerConcurrency,
  noteRateLimit,
  _resetConcurrency,
  DEFAULT_CONCURRENCY_CAP,
  DEFAULT_LLM_CONCURRENCY_CAP,
  CONNECTOR_DEFAULT_CAPS,
} from "../../cli/lib/providers/concurrency";

beforeEach(() => {
  _resetConcurrency();
});

describe("capFor", () => {
  test("returns configured cap for registered endpoints", () => {
    expect(capFor("elevenlabs", "tts")).toBe(3);
    expect(capFor("elevenlabs", "music_v1")).toBe(2);
    expect(capFor("openrouter", "openai/gpt-5.4-image-2")).toBe(2);
    expect(capFor("openrouter", "google/gemini-3-pro-image-preview")).toBe(2);
    expect(capFor("openrouter", "bytedance/seedance-2.0")).toBe(1);
    expect(capFor("openrouter", "kwaivgi/kling-v3.0-pro")).toBe(2);
  });

  test("falls back to LLM default cap for kind=text", () => {
    expect(capFor("openrouter", "google/gemini-2.5-flash", "text")).toBe(DEFAULT_LLM_CONCURRENCY_CAP);
  });

  test("falls back to media default cap for unknown image/video", () => {
    expect(capFor("openrouter", "some/new-model", "image")).toBe(DEFAULT_CONCURRENCY_CAP);
    expect(capFor("openrouter", "some/new-model", "video")).toBe(DEFAULT_CONCURRENCY_CAP);
  });

  test("falls back to the connector default cap for an unknown provider endpoint (#522)", () => {
    // elevenlabs connector default is 3; a model not in CAPS resolves to it.
    expect(capFor("elevenlabs", "some/new-voice", "voice")).toBe(CONNECTOR_DEFAULT_CAPS.elevenlabs);
    // A wholly unknown provider with no connector default → the floor.
    expect(capFor("mystery", "x", "image")).toBe(DEFAULT_CONCURRENCY_CAP);
  });
});

// ─── #522 adaptive 429 backoff + provider rollup ─────────────────────────────

describe("adaptive backoff (#522)", () => {
  test("a 429 halves the effective in-flight budget", async () => {
    const provider = "openrouter";
    const model = "google/gemini-3-pro-image-preview"; // hard cap = 2
    let active = 0;
    let peak = 0;
    const work = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 8));
      active -= 1;
    };

    // Simulate a rate-limit: effective cap 2 → 1.
    noteRateLimit(provider, model, "image");
    const snapAfter = snapshot().find((s) => s.endpoint === `${provider}:${model}`);
    expect(snapAfter?.cap).toBe(2);
    expect(snapAfter?.effectiveCap).toBe(1);

    // With the halved budget, 4 concurrent callers never run more than 1 at once.
    await Promise.all(Array.from({ length: 4 }, () => withConcurrency(provider, model, "image", work)));
    expect(peak).toBe(1);
  });

  test("effective cap recovers one slot per release, back up to the hard cap", async () => {
    const provider = "openrouter";
    const model = "kwaivgi/kling-v3.0-pro"; // hard cap = 2
    noteRateLimit(provider, model, "video"); // 2 → 1
    // Each successful call releases and nudges the effective cap up by 1.
    await withConcurrency(provider, model, "video", async () => {});
    const snap = snapshot().find((s) => s.endpoint === `${provider}:${model}`);
    expect(snap?.effectiveCap).toBe(2); // recovered to the hard cap
  });

  test("halving never drops below 1", () => {
    noteRateLimit("openrouter", "bytedance/seedance-2.0", "video"); // cap 1 → 1
    noteRateLimit("openrouter", "bytedance/seedance-2.0", "video");
    const snap = snapshot().find((s) => s.endpoint === "openrouter:bytedance/seedance-2.0");
    expect(snap?.effectiveCap).toBe(1);
  });
});

describe("providerConcurrency rollup (#522)", () => {
  test("groups in-flight + queued per provider", async () => {
    const model = "openai/gpt-5.4-image-2"; // openrouter, cap 2
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const held = [
      withConcurrency("openrouter", model, "image", () => gate),
      withConcurrency("openrouter", model, "image", () => gate),
      withConcurrency("openrouter", model, "image", () => gate), // queued
    ];
    await new Promise((r) => setTimeout(r, 5));

    const rollup = providerConcurrency().find((p) => p.provider === "openrouter");
    expect(rollup?.inFlight).toBe(2);
    expect(rollup?.queued).toBe(1);

    release();
    await Promise.all(held);
  });
});

describe("withConcurrency", () => {
  test("never exceeds the cap under N parallel callers", async () => {
    const provider = "openrouter";
    const model = "openai/gpt-5.4-image-2"; // cap = 2
    let active = 0;
    let peakActive = 0;
    const work = async () => {
      active += 1;
      if (active > peakActive) peakActive = active;
      // small synthetic delay so callers actually overlap.
      await new Promise((r) => setTimeout(r, 10));
      active -= 1;
      return "ok";
    };

    const callers = Array.from({ length: 8 }, () =>
      withConcurrency(provider, model, "image", work),
    );
    const results = await Promise.all(callers);

    expect(results).toHaveLength(8);
    expect(results.every((r) => r === "ok")).toBe(true);
    expect(peakActive).toBeLessThanOrEqual(2);
    expect(peakActive).toBeGreaterThan(0);
  });

  test("respects different caps on different endpoints", async () => {
    let elevenActive = 0;
    let elevenPeak = 0;
    let openaiActive = 0;
    let openaiPeak = 0;

    const elevenWork = async () => {
      elevenActive += 1;
      if (elevenActive > elevenPeak) elevenPeak = elevenActive;
      await new Promise((r) => setTimeout(r, 10));
      elevenActive -= 1;
    };
    const openaiWork = async () => {
      openaiActive += 1;
      if (openaiActive > openaiPeak) openaiPeak = openaiActive;
      await new Promise((r) => setTimeout(r, 10));
      openaiActive -= 1;
    };

    const elevenCallers = Array.from({ length: 6 }, () =>
      withConcurrency("elevenlabs", "tts", "voice", elevenWork),
    );
    const openaiCallers = Array.from({ length: 6 }, () =>
      withConcurrency("openrouter", "openai/gpt-5.4-image-2", "image", openaiWork),
    );
    await Promise.all([...elevenCallers, ...openaiCallers]);

    expect(elevenPeak).toBeLessThanOrEqual(3);
    expect(openaiPeak).toBeLessThanOrEqual(2);
  });

  test("releases the slot on exception so blocked callers proceed", async () => {
    const provider = "openrouter";
    const model = "bytedance/seedance-2.0"; // cap = 1
    let succeeded = 0;
    let failed = 0;

    const failing = withConcurrency(provider, model, "video", async () => {
      throw new Error("boom");
    }).catch(() => {
      failed += 1;
    });
    const success = withConcurrency(provider, model, "video", async () => {
      succeeded += 1;
      return "ok";
    });

    await Promise.all([failing, success]);
    expect(failed).toBe(1);
    expect(succeeded).toBe(1);

    const snap = snapshot().find((s) => s.endpoint === `${provider}:${model}`);
    expect(snap?.active).toBe(0);
    expect(snap?.queued).toBe(0);
  });

  test("seedance cap=1 strictly serializes", async () => {
    const provider = "openrouter";
    const model = "bytedance/seedance-2.0";
    let active = 0;
    let peak = 0;
    const work = async () => {
      active += 1;
      if (active > peak) peak = active;
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
    };

    const callers = Array.from({ length: 4 }, () =>
      withConcurrency(provider, model, "video", work),
    );
    await Promise.all(callers);

    expect(peak).toBe(1);
  });
});

describe("snapshot", () => {
  test("returns empty before any work", () => {
    expect(snapshot()).toEqual([]);
  });

  test("returns active + waiter counts during work", async () => {
    const provider = "openrouter";
    const model = "openai/gpt-5.4-image-2"; // cap = 2

    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = withConcurrency(provider, model, "image", async () => {
      await new Promise<void>((r) => (releaseFirst = r));
    });
    const second = withConcurrency(provider, model, "image", async () => {
      await new Promise<void>((r) => (releaseSecond = r));
    });
    // Third caller will be a waiter.
    const third = withConcurrency(provider, model, "image", async () => {
      // no-op
    });

    // Give the event loop a tick so the first two acquire.
    await new Promise((r) => setTimeout(r, 5));

    const snap = snapshot().find((s) => s.endpoint === `${provider}:${model}`);
    expect(snap?.active).toBe(2);
    expect(snap?.queued).toBe(1);

    releaseFirst();
    releaseSecond();
    await Promise.all([first, second, third]);
  });
});
