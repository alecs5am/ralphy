// Provider upstream-error rewrite tests (#007).
//
// The OR 403 "Key limit exceeded" message is misleading — it reads like a $
// balance problem but the literal cause is a per-endpoint concurrent-call cap.
// `rewriteUpstreamError` reshapes the message; these tests lock the wording.

import { describe, test, expect } from "bun:test";
import { rewriteUpstreamError } from "../../cli/lib/providers/shared";

describe("rewriteUpstreamError", () => {
  test("403 Key limit exceeded → concurrent-call limit message", () => {
    const out = rewriteUpstreamError(
      "openai/gpt-5.4-image-2",
      403,
      "Key limit exceeded (total limit)",
    );
    expect(out).toContain("concurrent-call limit");
    expect(out).toContain("openai/gpt-5.4-image-2");
    expect(out).toContain("NOT a $ balance issue");
    expect(out).toContain("ralphy doctor");
    // Old misleading wording must not survive.
    expect(out).not.toContain("Key limit exceeded — this is misleading");
  });

  test("403 with `total limit` (no `Key limit exceeded`) also rewritten", () => {
    const out = rewriteUpstreamError(
      "openai/gpt-5.4-image-2",
      403,
      "request exceeds total limit for this api key",
    );
    expect(out).toContain("concurrent-call limit");
  });

  test("429 concurrent_limit_exceeded → ElevenLabs Music guidance", () => {
    const out = rewriteUpstreamError(
      "elevenlabs/music",
      429,
      '{"detail":"concurrent_limit_exceeded"}',
    );
    expect(out).toContain("Concurrent-limit exceeded");
    expect(out).toContain("ElevenLabs Music caps at 2");
    expect(out).toContain("--concurrency");
  });

  test("400 base64 format → C2PA hint", () => {
    const out = rewriteUpstreamError(
      "kwaivgi/kling-v3.0-pro",
      400,
      "File is not in a valid base64 format",
    );
    expect(out).toContain("C2PA");
  });

  test("unknown error class passes through (returns raw text)", () => {
    const raw = "Internal Server Error";
    const out = rewriteUpstreamError("openai/gpt-5.4-image-2", 500, raw);
    expect(out).toContain(raw);
  });

  test("includes provider model id in 403 message for actionability", () => {
    const out = rewriteUpstreamError(
      "google/gemini-3-pro-image-preview",
      403,
      "Key limit exceeded (total limit)",
    );
    expect(out).toContain("google/gemini-3-pro-image-preview");
  });
});
