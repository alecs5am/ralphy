// Burst-cap error → hint mapper (#428 part C). Pure string-in / string-out.

import { describe, test, expect } from "bun:test";
import { burstCapHint } from "../../cli/lib/jobs/error-hints.js";

describe("burstCapHint · OpenRouter burst-cap family", () => {
  test("403 Key limit exceeded → image-concurrency hint", () => {
    const h = burstCapHint("OpenRouter 403: Key limit exceeded (total limit)");
    expect(h).toContain("burst-cap");
    expect(h).toContain("concurrency");
    expect(h).toContain("NOT a $ balance");
  });

  test("our rewritten 'concurrent-call limit' wording is recognized", () => {
    const h = burstCapHint("OpenRouter concurrent-call limit on openai/gpt-5.4-image-2");
    expect(h).toContain("burst-cap");
  });
});

describe("burstCapHint · generic rate-limit family", () => {
  test("429 concurrent_limit_exceeded → serialize hint", () => {
    const h = burstCapHint('{"detail":"concurrent_limit_exceeded"}');
    expect(h).toContain("429");
    expect(h).toContain("retry");
  });

  test("plain 'rate limit' text matches", () => {
    expect(burstCapHint("upstream returned rate limit")).not.toBeNull();
  });

  test("bare HTTP 429 in text matches", () => {
    expect(burstCapHint("request failed with status 429")).not.toBeNull();
  });
});

describe("burstCapHint · pass-through", () => {
  test("unknown error returns null (no hint)", () => {
    expect(burstCapHint("ffmpeg: no such file or directory")).toBeNull();
  });

  test("null / empty input returns null", () => {
    expect(burstCapHint(null)).toBeNull();
    expect(burstCapHint(undefined)).toBeNull();
    expect(burstCapHint("")).toBeNull();
  });
});
