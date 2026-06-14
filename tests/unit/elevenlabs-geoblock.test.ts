// Unit tests for the ElevenLabs geo-block guard + proxy base-URL swap (#121).
//
// Failure mode being fixed: from a geo-blocked region the ElevenLabs API
// returns HTTP 200 with an HTML body (no 403). The old connector wrote that
// body to disk as a corrupt `.mp3` and reported success. The fix has two parts:
//
//  1. A guard (`assertAudioResponse`) that runs on every audio response BEFORE
//     `fs.writeFile`: a non-audio Content-Type OR non-audio magic bytes raises
//     GeoblockError (code E_GEOBLOCK) and writes NOTHING.
//
//  2. A base-URL resolver (`elevenLabsBaseUrl`) reading RALPHY_ELEVENLABS_BASE_URL
//     (or config key `elevenlabsBaseUrl`) so a blocked user can route every call
//     through a non-blocked proxy transparently — same verb, same artifact path.
//
// All tests stub globalThis.fetch — no live ElevenLabs traffic, no mock.module
// of a shared lib (per #072).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import {
  generateVoiceover,
  generateMusic,
  generateSfx,
  elevenLabsBaseUrl,
  GeoblockError,
  _resetVoiceExistsCache,
  _resetSlotWriteLocks,
} from "../../cli/lib/providers/elevenlabs.js";

// Minimal valid-ish mp3 body: leading "ID3" so the magic-byte check passes.
// (These tests assert the GUARD's pass/fail decision, not ffprobe — ffprobe
// verify only runs on the voiceover path AFTER the guard, and the lock-verify
// test file already covers that.)
const AUDIO_BODY = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(64, 0)]);
const HTML_BODY = Buffer.from(
  "<!doctype html><html><head><title>Access blocked</title></head><body>403</body></html>",
);

const originalFetch = globalThis.fetch;
const originalEl = process.env.ELEVENLABS_API_KEY;
const originalBase = process.env.RALPHY_ELEVENLABS_BASE_URL;
const originalBackoff = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
const originalCwd = process.cwd();
let tmpRoot: string;
let projectId: string;

function projectDir(): string {
  return path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId);
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-geoblock-"));
  setRoot(tmpRoot);
  process.env.ELEVENLABS_API_KEY = "test-el-key";
  process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
  delete process.env.RALPHY_ELEVENLABS_BASE_URL;
  projectId = "geoblock-001";
  fs.mkdirSync(path.join(projectDir(), "logs"), { recursive: true });
  _resetVoiceExistsCache();
  _resetSlotWriteLocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEl === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalEl;
  if (originalBase === undefined) delete process.env.RALPHY_ELEVENLABS_BASE_URL;
  else process.env.RALPHY_ELEVENLABS_BASE_URL = originalBase;
  if (originalBackoff === undefined) delete process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
  else process.env.RALPHY_TEST_RETRY_BACKOFF_MS = originalBackoff;
  setRoot(originalCwd);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

// ─── Fix 1: the guard refuses HTML, no file written ──────────────────────────

describe("geo-block guard — non-audio body (#121)", () => {
  test("voiceover: HTML 200 → GeoblockError (E_GEOBLOCK), no file on disk", async () => {
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/voices/") && !u.includes("text-to-speech")) {
        return new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 });
      }
      // Geo-block: 200 with an HTML body in place of the mp3.
      return new Response(HTML_BODY, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }) as typeof fetch;

    let caught: unknown = null;
    try {
      await generateVoiceover({
        projectId,
        slot: "scene-01-vo",
        text: "hello",
        voiceId: "v1",
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(GeoblockError);
    expect((caught as GeoblockError).code).toBe("E_GEOBLOCK");

    // Nothing was written to the target slot path.
    const voPath = path.join(projectDir(), "artifacts", "voiceover", "scene-01-vo.mp3");
    expect(fs.existsSync(voPath)).toBe(false);
  });

  test("music: HTML 200 → GeoblockError, no file on disk", async () => {
    globalThis.fetch = (async () =>
      new Response(HTML_BODY, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;

    let caught: unknown = null;
    try {
      await generateMusic({ projectId, slot: "bed-01", prompt: "lofi", durationSec: 5 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GeoblockError);
    const musicPath = path.join(projectDir(), "artifacts", "music", "bed-01.mp3");
    expect(fs.existsSync(musicPath)).toBe(false);
  });

  test("sfx: audio Content-Type but non-audio magic bytes → GeoblockError, no file", async () => {
    // The body is JSON masquerading with an audio Content-Type — the magic-byte
    // half of the guard catches it even when the header lies.
    globalThis.fetch = (async () =>
      new Response(Buffer.from('{"detail":"blocked"}'), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })) as typeof fetch;

    let caught: unknown = null;
    try {
      await generateSfx({ projectId, slot: "whoosh-01", prompt: "whoosh", durationSec: 2 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(GeoblockError);
    const sfxPath = path.join(projectDir(), "artifacts", "sfx", "whoosh-01.mp3");
    expect(fs.existsSync(sfxPath)).toBe(false);
  });
});

// ─── Guard passes legit audio (happy path preserved) ─────────────────────────

describe("geo-block guard — legit audio passes (#121)", () => {
  test("music: audio Content-Type + audio magic bytes → file IS written", async () => {
    globalThis.fetch = (async () =>
      new Response(AUDIO_BODY, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })) as typeof fetch;

    const result = await generateMusic({
      projectId,
      slot: "bed-02",
      prompt: "ambient pad",
      durationSec: 4,
    });
    expect(result.localPath).toContain("bed-02.mp3");
    expect(fs.existsSync(result.localPath)).toBe(true);
  });

  test("sfx: no Content-Type header but valid mp3 magic bytes → file IS written", async () => {
    // Some proxies strip Content-Type. The magic-byte check alone must accept it.
    globalThis.fetch = (async () =>
      new Response(AUDIO_BODY, { status: 200 })) as typeof fetch;

    const result = await generateSfx({
      projectId,
      slot: "pop-01",
      prompt: "pop",
      durationSec: 1,
    });
    expect(result.localPath).toContain("pop-01.mp3");
    expect(fs.existsSync(result.localPath)).toBe(true);
  });
});

// ─── Fix 2: proxy base-URL swap ──────────────────────────────────────────────

describe("base-URL resolver — proxy swap (#121)", () => {
  test("default base URL when nothing configured", async () => {
    expect(await elevenLabsBaseUrl()).toBe("https://api.elevenlabs.io/v1");
  });

  test("RALPHY_ELEVENLABS_BASE_URL overrides, trailing slash trimmed", async () => {
    process.env.RALPHY_ELEVENLABS_BASE_URL = "https://proxy.example.test/el/v1/";
    expect(await elevenLabsBaseUrl()).toBe("https://proxy.example.test/el/v1");
  });

  test("generate routes the request URL through the configured proxy", async () => {
    process.env.RALPHY_ELEVENLABS_BASE_URL = "https://proxy.example.test/el/v1";
    const hitUrls: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      hitUrls.push(String(url));
      return new Response(AUDIO_BODY, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }) as typeof fetch;

    await generateMusic({ projectId, slot: "bed-03", prompt: "synth", durationSec: 4 });

    expect(hitUrls.length).toBeGreaterThan(0);
    for (const u of hitUrls) {
      expect(u.startsWith("https://proxy.example.test/el/v1")).toBe(true);
      expect(u.includes("api.elevenlabs.io")).toBe(false);
    }
  });
});

// ─── Fix 3: the error names the config key when no proxy is configured ────────

describe("geo-block error message (#121)", () => {
  test("names RALPHY_ELEVENLABS_BASE_URL / elevenlabsBaseUrl when no proxy set", async () => {
    globalThis.fetch = (async () =>
      new Response(HTML_BODY, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;

    let caught: GeoblockError | null = null;
    try {
      await generateMusic({ projectId, slot: "bed-04", prompt: "x", durationSec: 4 });
    } catch (e) {
      caught = e as GeoblockError;
    }
    expect(caught).toBeInstanceOf(GeoblockError);
    expect(caught!.message).toContain("RALPHY_ELEVENLABS_BASE_URL");
    expect(caught!.message).toContain("elevenlabsBaseUrl");
  });

  test("when a proxy IS configured, the message says the proxy returned a non-audio body", async () => {
    process.env.RALPHY_ELEVENLABS_BASE_URL = "https://proxy.example.test/el/v1";
    globalThis.fetch = (async () =>
      new Response(HTML_BODY, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })) as typeof fetch;

    let caught: GeoblockError | null = null;
    try {
      await generateMusic({ projectId, slot: "bed-05", prompt: "x", durationSec: 4 });
    } catch (e) {
      caught = e as GeoblockError;
    }
    expect(caught).toBeInstanceOf(GeoblockError);
    expect(caught!.message.toLowerCase()).toContain("proxy");
  });
});
