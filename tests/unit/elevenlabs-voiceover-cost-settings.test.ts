// Unit tests for voiceover cost-log + voice_settings pass-through (#030).
//
// Two behaviors land in one file because they share the same mocked-fetch
// scaffolding:
//
//   1. cost_usd on the canonical gen-log row matches voiceoverCostUsd(chars, model).
//      Pre-#030 every row was cost_usd: 0 — the rollup lied.
//
//   2. --stability / --similarity-boost / --style / --speed pass through to the
//      ElevenLabs voice_settings payload. Pre-#030 there was no --speed flag,
//      and --stability / similarity / style flags existed but weren't covered
//      by a regression test, so the next refactor could silently break them.
//
// Network is mocked end-to-end — no live ElevenLabs traffic.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import {
  generateVoiceover,
  _resetVoiceExistsCache,
  _resetSlotWriteLocks,
} from "../../cli/lib/providers/elevenlabs.js";
import { voiceoverCostUsd } from "../../cli/lib/providers/voice-pricing.js";

// Same silent-mp3 fixture as elevenlabs-voiceover-lock-verify.test.ts.
const SILENT_MP3_B64 =
  "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAkAAARiAEFBQUFBQUFBQUFBWVlZWVlZWVlZWVlwcHBwcHBwcHBwcIiIiIiIiIiIiIiIoKCgoKCgoKCgoKC4uLi4uLi4uLi4uNDQ0NDQ0NDQ0NDQ6Ojo6Ojo6Ojo6Oj//////////////wAAAABMYXZjNjEuMTkAAAAAAAAAAAAAAAAkA8wAAAAAAAAEYtn1jvYAAAAAAP/7EMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBV//sSxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBV//sQxFODwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFX/+xLEfQPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDEpwPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EsTQg8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMTWA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sSxNWDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxNYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";
const SILENT_MP3 = Buffer.from(SILENT_MP3_B64, "base64");

const originalFetch = globalThis.fetch;
const originalEl = process.env.ELEVENLABS_API_KEY;
const originalBackoff = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
const originalCwd = process.cwd();
let tmpRoot: string;
let projectId: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-vo-cost-"));
  setRoot(tmpRoot);
  process.env.ELEVENLABS_API_KEY = "test-el-key";
  process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
  projectId = "vo-cost-001";
  fs.mkdirSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId, "logs"), {
    recursive: true,
  });
  _resetVoiceExistsCache();
  _resetSlotWriteLocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEl === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalEl;
  if (originalBackoff === undefined) delete process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
  else process.env.RALPHY_TEST_RETRY_BACKOFF_MS = originalBackoff;
  setRoot(originalCwd);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("generateVoiceover — cost_usd is no longer 0 (#030)", () => {
  test("logs cost = ceil(chars/1000) * model rate to canonical gen-log", async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/v1/voices/") && !u.includes("text-to-speech")) {
        return new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 });
      }
      return new Response(SILENT_MP3, { status: 200 });
    }) as typeof fetch;

    const text = "x".repeat(1500); // ceil(1500/1000) = 2 ⇒ 2 * $0.20 = $0.40
    const expected = voiceoverCostUsd(text.length, "eleven_multilingual_v2");
    const result = await generateVoiceover({
      projectId,
      ...providerOutput("cost", "scene-01-vo.mp3"),
      slot: "scene-01-vo",
      text,
      voiceId: "v1",
    });

    // Return value carries the cost too.
    expect(result.costUsd).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(0.4, 6);

  }, 15_000);
});

describe("generateVoiceover — voice_settings pass-through (#030)", () => {
  test("stability / similarity_boost / style / speed forward to the API body", async () => {
    let lastBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/v1/voices/") && !u.includes("text-to-speech")) {
        return new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 });
      }
      lastBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(SILENT_MP3, { status: 200 });
    }) as typeof fetch;

    await generateVoiceover({
      projectId,
      ...providerOutput("settings", "scene-02-vo.mp3"),
      slot: "scene-02-vo",
      text: "hello world",
      voiceId: "v1",
      voiceSettings: {
        stability: 0.42,
        similarity_boost: 0.91,
        style: 0.07,
        speed: 0.85,
      },
    });

    expect(lastBody).not.toBeNull();
    const vs = (lastBody as { voice_settings: Record<string, number> }).voice_settings;
    expect(vs.stability).toBeCloseTo(0.42, 6);
    expect(vs.similarity_boost).toBeCloseTo(0.91, 6);
    expect(vs.style).toBeCloseTo(0.07, 6);
    expect(vs.speed).toBeCloseTo(0.85, 6);

  }, 15_000);

  test("omitted voice_settings → defaults apply (stability 0.55 etc.)", async () => {
    let lastBody: Record<string, unknown> | null = null;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/v1/voices/") && !u.includes("text-to-speech")) {
        return new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 });
      }
      lastBody = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(SILENT_MP3, { status: 200 });
    }) as typeof fetch;

    await generateVoiceover({
      projectId,
      ...providerOutput("defaults", "scene-03-vo.mp3"),
      slot: "scene-03-vo",
      text: "hello",
      voiceId: "v1",
    });

    const vs = (lastBody as { voice_settings: Record<string, unknown> }).voice_settings;
    expect(vs.stability).toBeCloseTo(0.55, 6);
    expect(vs.similarity_boost).toBeCloseTo(0.8, 6);
    expect(vs.style).toBeCloseTo(0.25, 6);
    // speed is opt-in — absent from defaults so ElevenLabs uses its server default.
    expect(vs.speed).toBeUndefined();
  }, 15_000);
});

function providerOutput(id: string, filename: string): { runId: string; outputPath: string } {
  const runId = `run_${id}`;
  return { runId, outputPath: path.join(tmpRoot, ".ralphy", "tmp", runId, filename) };
}
