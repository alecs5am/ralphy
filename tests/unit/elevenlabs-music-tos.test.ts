// Unit tests for the ElevenLabs Music ToS-rejection envelope parsing (#006).
//
// Two assertions:
//  1. A 400 body shaped `{detail:{message,data:{prompt_suggestion}}}` produces
//     a `TerminalProviderError` carrying `.promptSuggestion` so callers can
//     read the provider's sanitized rewrite without re-parsing the message.
//  2. A 400 body WITHOUT a `prompt_suggestion` still throws TerminalProviderError
//     with `.promptSuggestion === undefined` (no false positives on adjacent
//     4xx classes that reuse the envelope without a rewrite).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { generateMusic } from "../../cli/lib/providers/elevenlabs.js";
import { TerminalProviderError } from "../../cli/lib/providers/shared.js";

const originalFetch = globalThis.fetch;
const originalEl = process.env.ELEVENLABS_API_KEY;
const originalBackoff = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
const originalCwd = process.cwd();
let tmpRoot: string;
let projectId: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-music-tos-"));
  setRoot(tmpRoot);
  process.env.ELEVENLABS_API_KEY = "test-el-key";
  process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
  projectId = "music-tos-001";
  fs.mkdirSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId, "logs"), {
    recursive: true,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEl === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalEl;
  if (originalBackoff === undefined)
    delete process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
  else process.env.RALPHY_TEST_RETRY_BACKOFF_MS = originalBackoff;
  setRoot(originalCwd);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("generateMusic — ToS rejection envelope parsing", () => {
  test("400 bad_prompt with prompt_suggestion → TerminalProviderError.promptSuggestion populated", async () => {
    const suggestion = "trap beat, 140 BPM, 808 sub-bass, no vocals";
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          detail: {
            message: "Prompt rejected by content policy",
            data: { prompt_suggestion: suggestion },
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    let caught: unknown = null;
    try {
      await generateMusic({
        projectId,
        slot: "bed-01",
        prompt: "Drake type beat",
        durationSec: 8,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TerminalProviderError);
    const tpe = caught as TerminalProviderError;
    expect(tpe.promptSuggestion).toBe(suggestion);
    expect(tpe.message).toMatch(/400/);
    expect(tpe.message).toMatch(/prompt_suggestion/);
  });

  test("400 without prompt_suggestion → TerminalProviderError with promptSuggestion: undefined", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ detail: { message: "Some other 4xx reason" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )) as typeof fetch;

    let caught: unknown = null;
    try {
      await generateMusic({
        projectId,
        slot: "bed-02",
        prompt: "anything",
        durationSec: 5,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TerminalProviderError);
    expect((caught as TerminalProviderError).promptSuggestion).toBeUndefined();
  });

  test("non-JSON 400 body → TerminalProviderError, no promptSuggestion", async () => {
    globalThis.fetch = (async () =>
      new Response("plain text refusal", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      })) as typeof fetch;

    let caught: unknown = null;
    try {
      await generateMusic({
        projectId,
        slot: "bed-03",
        prompt: "anything",
        durationSec: 5,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(TerminalProviderError);
    expect((caught as TerminalProviderError).promptSuggestion).toBeUndefined();
  });
});
