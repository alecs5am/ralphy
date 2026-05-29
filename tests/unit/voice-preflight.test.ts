// Unit tests for ElevenLabs voice-existence preflight (notes/issues/051).
// Mocks global fetch — no live ElevenLabs traffic.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  ensureVoiceExists,
  _resetVoiceExistsCache,
} from "../../cli/lib/providers/elevenlabs.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.ELEVENLABS_API_KEY;

type FetchCall = { url: string; init?: RequestInit };

function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

beforeEach(() => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  _resetVoiceExistsCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalKey;
});

describe("ensureVoiceExists", () => {
  test("404 → throws with a clean, voice-id-bearing message", async () => {
    mockFetch(() => new Response("not found", { status: 404 }));
    await expect(ensureVoiceExists("missing-voice-id")).rejects.toThrow(
      /voice not in library/i,
    );
    await expect(ensureVoiceExists("missing-voice-id")).rejects.toThrow(
      /missing-voice-id/,
    );
  });

  test("200 → resolves without throwing", async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ voice_id: "v1", name: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    await expect(ensureVoiceExists("v1")).resolves.toBeUndefined();
  });

  test("500 → throws but does not pretend the voice is missing", async () => {
    mockFetch(() => new Response("server boom", { status: 500 }));
    await expect(ensureVoiceExists("v1")).rejects.toThrow(/500/);
  });

  test("cache: second call for the same voice id does not hit the network", async () => {
    const calls = mockFetch(
      () =>
        new Response(JSON.stringify({ voice_id: "v1", name: "ok" }), {
          status: 200,
        }),
    );
    await ensureVoiceExists("v1");
    await ensureVoiceExists("v1");
    await ensureVoiceExists("v1");
    expect(calls.length).toBe(1);
  });

  test("cache is per-voice-id (different ids → separate calls)", async () => {
    const calls = mockFetch(
      () =>
        new Response(JSON.stringify({ voice_id: "v1", name: "ok" }), {
          status: 200,
        }),
    );
    await ensureVoiceExists("v1");
    await ensureVoiceExists("v2");
    expect(calls.length).toBe(2);
  });

  test("hits the /v1/voices/<id> path with xi-api-key header", async () => {
    const calls = mockFetch(
      () => new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 }),
    );
    await ensureVoiceExists("abc123");
    expect(calls[0]!.url).toContain("/v1/voices/abc123");
    const headers = calls[0]!.init?.headers as Record<string, string> | Headers;
    const xi =
      headers instanceof Headers
        ? headers.get("xi-api-key")
        : (headers as Record<string, string>)["xi-api-key"];
    expect(xi).toBe("test-key");
  });
});
