// Unit tests for the kling-v3.0-pro preflight checks in generateVideo (#008).
//
// Two preflight gates:
//  1. kling-v3.0-pro + firstFrame + lastFrame → TerminalProviderError pointing
//     at seedance-2.0. No fetch is issued (base64 bug → guaranteed 400).
//  2. kling-v3.0-pro + prompt > 2500 chars → TerminalProviderError with the
//     concrete length and a trim hint. No fetch is issued.
//
// Both errors must be classified as TERMINAL by the shared retry helper so the
// retryTransient loop short-circuits to a single attempt.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { generateVideo } from "../../cli/lib/providers/openrouter.js";
import {
  classifyError,
  TerminalProviderError,
} from "../../cli/lib/providers/shared.js";

const originalFetch = globalThis.fetch;
const originalOr = process.env.OPENROUTER_API_KEY;
let tmpRoot: string;
const originalCwd = process.cwd();
const projectId = "preflight-test-001";

// Tiny 1×1 PNG data URI — enough to pass resolveImageRef without writing a real
// file. The preflight should reject BEFORE this is ever resolved or submitted.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-preflight-"));
  setRoot(tmpRoot);
  process.env.OPENROUTER_API_KEY = "test-or-key";
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", projectId, "logs"), {
    recursive: true,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalOr === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOr;
  setRoot(originalCwd);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("generateVideo — kling-v3.0-pro multi-frame preflight (#008)", () => {
  test("first+last frame on kling-v3.0-pro → TerminalProviderError, no fetch", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    let caught: unknown;
    try {
      await generateVideo({
        projectId,
        slot: "scene-01-vid",
        prompt: "a duck waddles across a pond",
        durationSec: 5,
        model: "kwaivgi/kling-v3.0-pro",
        firstFrame: TINY_PNG_DATA_URL,
        lastFrame: TINY_PNG_DATA_URL,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TerminalProviderError);
    expect((caught as Error).message).toMatch(/multi-frame/i);
    expect((caught as Error).message).toMatch(/seedance/i);
    // No fetch must have been issued — preflight rejects locally.
    expect(calls).toBe(0);
    // Classified as terminal → retry helper would not loop.
    expect(classifyError(caught)).toBe("terminal");
  });

  test("kling-v3.0-pro + only firstFrame → preflight does NOT fire (single-frame is fine)", async () => {
    // Mock fetch to return a quick "submit failed" so we know preflight let it
    // through. Single-frame kling is the canonical happy path — we must not
    // regress it.
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{\"error\": \"forced test failure post-preflight\"}", {
        status: 400,
      });
    }) as typeof fetch;

    let caught: unknown;
    try {
      await generateVideo({
        projectId,
        slot: "scene-02-vid",
        prompt: "a duck waddles across a pond",
        durationSec: 5,
        model: "kwaivgi/kling-v3.0-pro",
        firstFrame: TINY_PNG_DATA_URL,
        noRetry: true,
      });
    } catch (err) {
      caught = err;
    }

    // Preflight allowed it through → fetch was called and returned a 400.
    expect(calls).toBe(1);
    expect((caught as Error).message).not.toMatch(/multi-frame/i);
  });

  test("seedance-2.0 multi-frame → preflight does NOT fire (different model)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{\"error\": \"forced test failure post-preflight\"}", {
        status: 400,
      });
    }) as typeof fetch;

    let caught: unknown;
    try {
      await generateVideo({
        projectId,
        slot: "scene-03-vid",
        prompt: "a duck waddles across a pond",
        durationSec: 5,
        model: "bytedance/seedance-2.0",
        firstFrame: TINY_PNG_DATA_URL,
        lastFrame: TINY_PNG_DATA_URL,
        noRetry: true,
      });
    } catch (err) {
      caught = err;
    }

    // Preflight is kling-only — seedance multi-frame must hit fetch.
    expect(calls).toBe(1);
    expect((caught as Error).message).not.toMatch(/multi-frame submissions always fail/i);
  });
});

describe("generateVideo — kling prompt-length preflight (#008)", () => {
  test("kling-v3.0-pro + 2501-char prompt → TerminalProviderError, no fetch", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    const longPrompt = "x".repeat(2501);
    let caught: unknown;
    try {
      await generateVideo({
        projectId,
        slot: "scene-04-vid",
        prompt: longPrompt,
        durationSec: 5,
        model: "kwaivgi/kling-v3.0-pro",
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TerminalProviderError);
    expect((caught as Error).message).toMatch(/2500/);
    expect((caught as Error).message).toMatch(/2501/);
    expect((caught as Error).message).toMatch(/compress/i);
    expect(calls).toBe(0);
    expect(classifyError(caught)).toBe("terminal");
  });

  test("kling-v3.0-pro + exactly 2500 chars → preflight does NOT fire", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{\"error\": \"forced test failure post-preflight\"}", {
        status: 400,
      });
    }) as typeof fetch;

    const promptAtCap = "x".repeat(2500);
    let caught: unknown;
    try {
      await generateVideo({
        projectId,
        slot: "scene-05-vid",
        prompt: promptAtCap,
        durationSec: 5,
        model: "kwaivgi/kling-v3.0-pro",
        noRetry: true,
      });
    } catch (err) {
      caught = err;
    }

    // At-cap is allowed → fetch is called.
    expect(calls).toBe(1);
    expect((caught as Error).message).not.toMatch(/2500-char cap|prompt cap is/i);
  });

  test("non-kling model + huge prompt → preflight does NOT fire (no cap declared)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{\"error\": \"forced test failure post-preflight\"}", {
        status: 400,
      });
    }) as typeof fetch;

    const longPrompt = "x".repeat(5000);
    let caught: unknown;
    try {
      await generateVideo({
        projectId,
        slot: "scene-06-vid",
        prompt: longPrompt,
        durationSec: 5,
        model: "bytedance/seedance-2.0",
        noRetry: true,
      });
    } catch (err) {
      caught = err;
    }

    expect(calls).toBe(1);
    expect((caught as Error).message).not.toMatch(/prompt cap/i);
  });
});
