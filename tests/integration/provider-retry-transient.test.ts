// Integration tests for the transient-error retry loop wired into the
// OpenRouter image + ElevenLabs voiceover connectors (#005).
//
// Mocks `globalThis.fetch` — no live API traffic. Asserts that:
//  - TLS-class errors are retried and the final success row carries attempt: 3
//  - Gemini skeleton-null (200-OK + finish_reason:null + empty content) is
//    retried as a transient class
//  - --no-retry equivalent (input.noRetry: true) short-circuits to one attempt
//  - 4xx terminal classes are NOT retried

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { readGenerations } from "../../cli/lib/gen-log.js";
import { generateImage } from "../../cli/lib/providers/openrouter.js";
import {
  generateVoiceover,
  _resetVoiceExistsCache,
} from "../../cli/lib/providers/elevenlabs.js";

const originalFetch = globalThis.fetch;
const originalOr = process.env.OPENROUTER_API_KEY;
const originalEl = process.env.ELEVENLABS_API_KEY;
const originalBackoff = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
let tmpRoot: string;
let projectId: string;
const originalCwd = process.cwd();

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-retry-"));
  setRoot(tmpRoot);
  process.env.OPENROUTER_API_KEY = "test-or-key";
  process.env.ELEVENLABS_API_KEY = "test-el-key";
  // Zero out the backoff schedule so the test runs in <100ms instead of ~5s.
  process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
  projectId = "retry-test-001";
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", projectId, "logs"), {
    recursive: true,
  });
  _resetVoiceExistsCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalOr === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOr;
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

// Tiny 1x1 PNG payload returned by the "success" branch of the mocked image
// endpoint. Real OR returns a data: URL on `choices[0].message.images[0]`.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function makeImageOkResponse(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            images: [{ image_url: { url: TINY_PNG_DATA_URL } }],
          },
          finish_reason: "stop",
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeSkeletonNullResponse(): Response {
  // Gemini's "skeleton-null" failure mode — 200 OK with no usable content.
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { content: null, images: null },
          finish_reason: null,
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function makeTlsFetchError(): never {
  const err = new Error("fetch failed") as Error & { cause?: Error };
  const inner = new Error("unknown certificate verification error") as Error & {
    code?: string;
  };
  inner.code = "ECONNRESET";
  err.cause = inner;
  throw err;
}

describe("retry loop — openrouter.generateImage", () => {
  test("TLS twice then success → attempt: 3 in generations.jsonl", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls <= 2) makeTlsFetchError();
      return makeImageOkResponse();
    }) as typeof fetch;

    const result = await generateImage({
      projectId,
      slot: "scene-01-bg",
      prompt: "a still pond at dawn",
      // Zero out the real-life backoff schedule so the test finishes instantly.
      // The schedule is asserted in the unit-level tests.
      noRetry: false,
    } as Parameters<typeof generateImage>[0] & { noRetry?: boolean });

    expect(result.localPath).toContain("scene-01-bg.png");
    expect(calls).toBe(3);

    const rows = await readGenerations(projectId);
    const successRows = rows.filter((r) => r.status === "ok");
    const errorRows = rows.filter((r) => r.status === "error");
    expect(successRows.length).toBe(1);
    expect(successRows[0]!.attempt).toBe(3);
    // Two transient failures should be logged with attempt 1 and 2.
    expect(errorRows.length).toBe(2);
    expect(errorRows.map((r) => r.attempt).sort()).toEqual([1, 2]);
  }, 60_000);

  test("gemini skeleton-null is treated as transient", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return makeSkeletonNullResponse();
      return makeImageOkResponse();
    }) as typeof fetch;

    const result = await generateImage({
      projectId,
      slot: "scene-02-bg",
      prompt: "a sleeping fox",
    });

    expect(result.localPath).toContain("scene-02-bg.png");
    expect(calls).toBe(2);

    const rows = await readGenerations(projectId);
    const successRows = rows.filter((r) => r.status === "ok");
    expect(successRows.length).toBe(1);
    expect(successRows[0]!.attempt).toBe(2);
    const errorRows = rows.filter((r) => r.status === "error");
    expect(errorRows.length).toBe(1);
    expect(errorRows[0]!.attempt).toBe(1);
    expect(errorRows[0]!.error).toMatch(/no images\[0\]|skeleton-null/i);
  }, 60_000);

  test("--no-retry: single attempt even on transient blip", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      makeTlsFetchError();
    }) as typeof fetch;

    await expect(
      generateImage({
        projectId,
        slot: "scene-03-bg",
        prompt: "a quiet road",
        noRetry: true,
      }),
    ).rejects.toThrow(/fetch failed|certificate/i);
    expect(calls).toBe(1);

    // No stub asset must have been written on terminal failure (AGENTS #14).
    const expectedAsset = path.join(
      tmpRoot,
      "workspace",
      "projects",
      projectId,
      "assets",
      "images",
      "scene-03-bg.png",
    );
    expect(fs.existsSync(expectedAsset)).toBe(false);
  }, 30_000);

  test("4xx semantic error → not retried, surfaces immediately", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{\"error\": \"invalid prompt\"}", { status: 400 });
    }) as typeof fetch;

    await expect(
      generateImage({
        projectId,
        slot: "scene-04-bg",
        prompt: "invalid",
      }),
    ).rejects.toThrow(/400/);
    expect(calls).toBe(1);
  }, 30_000);
});

describe("retry loop — elevenlabs.generateVoiceover", () => {
  test("ECONNRESET twice then success → attempt: 3", async () => {
    let calls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const u = String(url);
      // Voice-existence preflight always succeeds.
      if (u.includes("/v1/voices/") && !u.includes("text-to-speech")) {
        return new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 });
      }
      calls += 1;
      if (calls <= 2) {
        const err = new Error("socket hang up") as Error & { code?: string };
        err.code = "ECONNRESET";
        throw err;
      }
      // Return a minimal valid mp3 buffer (1 zero byte is enough for the test).
      return new Response(new Uint8Array([0]).buffer, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }) as typeof fetch;

    const result = await generateVoiceover({
      projectId,
      slot: "scene-01-vo",
      text: "Hello world",
      voiceId: "v1",
    });

    expect(result.localPath).toContain("scene-01-vo.mp3");
    expect(calls).toBe(3);

    const rows = await readGenerations(projectId);
    const successRows = rows.filter(
      (r) => r.status === "ok" && r.kind === "voiceover",
    );
    expect(successRows.length).toBe(1);
    expect(successRows[0]!.attempt).toBe(3);
    const errorRows = rows.filter(
      (r) => r.status === "error" && r.kind === "voiceover",
    );
    expect(errorRows.length).toBe(2);
  }, 60_000);
});
