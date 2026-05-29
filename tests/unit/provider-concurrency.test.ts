// Per-endpoint concurrency self-throttle tests (#007).
//
// The semaphore is in-process. We exercise it with synthetic async work and
// assert the cap is never exceeded. No live API calls — pure logic.

import { describe, test, expect, beforeEach } from "bun:test";
import {
  withConcurrency,
  capFor,
  snapshot,
  _resetConcurrency,
  DEFAULT_CONCURRENCY_CAP,
  DEFAULT_LLM_CONCURRENCY_CAP,
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
    expect(snap?.waiters).toBe(0);
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
    expect(snap?.waiters).toBe(1);

    releaseFirst();
    releaseSecond();
    await Promise.all([first, second, third]);
  });
});
