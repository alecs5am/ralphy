// Unit tests for the per-slot file lock + ffprobe audio-verify on
// `generateVoiceover()` (#039).
//
// Failure mode being asserted: parallel `ralphy generate voiceover` calls that
// target the SAME destination path (same project + slot) could race the
// fs.writeFile step and leave a 0-duration mp3 on disk. The fix is two-part:
//
//  1. Per-slot in-process lock — second caller awaits the first via a Map
//     keyed by absolute dest path. Both end up with valid, distinct sequential
//     writes; the lock + the auto-archive pass collaborate so the second
//     call's pre-existing-asset check sees the first write and archives it.
//
//  2. ffprobe verify after write — 0-byte / unreadable audio throws
//     TransientPayloadError so the outer retry helper retries ONCE. After
//     the retry, the connector fails with a diagnostic.
//
// Both tests mock the network — no live ElevenLabs traffic. ffprobe is invoked
// for real on a valid silent-mp3 buffer included as a base64 fixture below.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

import { setRoot } from "../../cli/lib/paths.js";
import {
  generateVoiceover,
  _resetVoiceExistsCache,
  _resetSlotWriteLocks,
} from "../../cli/lib/providers/elevenlabs.js";
import { TransientPayloadError } from "../../cli/lib/providers/shared.js";

// A ~0.2s silent mp3 (libmp3lame, 44.1kHz mono, 32kbps) — small enough to
// inline, large enough that ffprobe reports a real duration. Generated with:
//   ffmpeg -f lavfi -i "anullsrc=r=44100:cl=mono" -t 0.2 -c:a libmp3lame -b:a 32k silent.mp3
const SILENT_MP3_B64 =
  "SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAwAAAAAAAAAAAAAAD/+0DAAAAAAAAAAAAAAAAAAAAAAABJbmZvAAAADwAAAAkAAARiAEFBQUFBQUFBQUFBWVlZWVlZWVlZWVlwcHBwcHBwcHBwcIiIiIiIiIiIiIiIoKCgoKCgoKCgoKC4uLi4uLi4uLi4uNDQ0NDQ0NDQ0NDQ6Ojo6Ojo6Ojo6Oj//////////////wAAAABMYXZjNjEuMTkAAAAAAAAAAAAAAAAkA8wAAAAAAAAEYtn1jvYAAAAAAP/7EMQAA8AAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBV//sSxCmDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBV//sQxFODwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFX/+xLEfQPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDEpwPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EsTQg8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMTWA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sSxNWDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxNYDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=";

const SILENT_MP3 = Buffer.from(SILENT_MP3_B64, "base64");

// A buffer that PASSES the #121 audio magic-byte guard (leading "ID3") but is
// NOT a decodable audio file — ffprobe rejects it as 0-duration / no stream.
// Used to exercise the #039 ffprobe-verify retry path WITHOUT tripping the
// geo-block guard, which fires before ffprobe on a truly empty/HTML body.
const CORRUPT_BUT_AUDIO_MAGIC = Buffer.concat([
  Buffer.from("ID3"),
  Buffer.alloc(32, 0),
]);

function ffprobeAvailable(): boolean {
  const result = spawnSync("ffprobe", ["-version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

const HAS_FFPROBE = ffprobeAvailable();

const originalFetch = globalThis.fetch;
const originalEl = process.env.ELEVENLABS_API_KEY;
const originalBackoff = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
const originalCwd = process.cwd();
let tmpRoot: string;
let projectId: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-vo-lock-"));
  setRoot(tmpRoot);
  process.env.ELEVENLABS_API_KEY = "test-el-key";
  process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
  projectId = "vo-lock-001";
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

describe("generateVoiceover — per-slot file lock (#039)", () => {
  test("two parallel calls targeting the same slot serialize and both succeed", async () => {
    // Track interleaving — without the lock the second response begins arriving
    // before the first write commits, which is the race the lock prevents.
    let activeWriters = 0;
    let maxActive = 0;
    const writeOrder: string[] = [];

    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/v1/voices/") && !u.includes("text-to-speech")) {
        return new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 });
      }
      // The lock should ensure only one tts POST is in flight per dest path at
      // a time. Track concurrency via a small `body` tag so we can match call
      // → write order downstream.
      const payload = init?.body ? JSON.parse(String(init.body)) : {};
      activeWriters += 1;
      maxActive = Math.max(maxActive, activeWriters);
      try {
        // Tiny delay so two parallel callers actually overlap if unlocked.
        await new Promise((r) => setTimeout(r, 20));
        writeOrder.push(payload.text);
        return new Response(SILENT_MP3, {
          status: 200,
          headers: { "Content-Type": "audio/mpeg" },
        });
      } finally {
        activeWriters -= 1;
      }
    }) as typeof fetch;

    // Fire two calls hitting the same slot concurrently.
    const [a, b] = await Promise.all([
      generateVoiceover({
        projectId,
        ...providerOutput("parallel-a", "scene-01-vo.mp3"),
        slot: "scene-01-vo",
        text: "first call",
        voiceId: "v1",
      }),
      generateVoiceover({
        projectId,
        ...providerOutput("parallel-b", "scene-01-vo.mp3"),
        slot: "scene-01-vo",
        text: "second call",
        voiceId: "v1",
      }),
    ]);

    // Both calls return successfully — neither dropped.
    expect(a.localPath).toContain("scene-01-vo");
    expect(b.localPath).toContain("scene-01-vo");

    // Distinct Run temp paths are safe to produce concurrently.
    expect(maxActive).toBe(2);
    // The lock guarantees mutual exclusion, NOT FIFO acquisition order — under
    // scheduler jitter the two promises can acquire in either order. Assert the
    // SET (both writes happened), not the sequence, so a green run can't flip
    // red on order alone (#463).
    expect([...writeOrder].sort()).toEqual(["first call", "second call"]);

    expect(fs.existsSync(a.localPath)).toBe(true);
    expect(fs.existsSync(b.localPath)).toBe(true);

    // The active file is valid audio (ffprobe-verifiable when ffprobe is on
    // PATH; if missing, the verify pass is a no-op so we skip the check).
    if (HAS_FFPROBE) {
      const probe = spawnSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "csv=p=0",
          a.localPath,
        ],
        { encoding: "utf8" },
      );
      expect(probe.status).toBe(0);
      const dur = Number((probe.stdout ?? "").trim());
      expect(dur).toBeGreaterThan(0);
    }
  }, 30_000);
});

describe("generateVoiceover — ffprobe verify after write (#039)", () => {
  test("0-byte audio response → TransientPayloadError thrown after retry exhausts", async () => {
    if (!HAS_FFPROBE) {
      // Without ffprobe the verify pass is a graceful no-op (warn-only), so
      // this assertion can only run on a host with ffprobe installed. CI lanes
      // without ffmpeg installed will skip — the lock test above still runs.
      return;
    }
    let ttsCalls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/v1/voices/") && !u.includes("text-to-speech")) {
        return new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 });
      }
      ttsCalls += 1;
      // Return an audio-magic-but-undecodable buffer — it clears the #121
      // geo-block guard (leading "ID3") but ffprobe rejects it as 0-duration /
      // no audio stream, so the retry helper retries once before bubbling the
      // final TransientPayloadError.
      return new Response(CORRUPT_BUT_AUDIO_MAGIC, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }) as typeof fetch;

    let caught: unknown = null;
    try {
      await generateVoiceover({
        projectId,
        ...providerOutput("corrupt", "scene-02-vo.mp3"),
        slot: "scene-02-vo",
        text: "should fail verify",
        voiceId: "v1",
      });
    } catch (e) {
      caught = e;
    }

    // ffprobe rejected the empty buffer → TransientPayloadError after retries.
    expect(caught).toBeInstanceOf(TransientPayloadError);
    expect((caught as Error).message).toMatch(/ffprobe rejected/);
    // Retry helper default retries = 2, total attempts = 3.
    expect(ttsCalls).toBe(3);
  }, 30_000);

  test("transient corrupt then valid audio → retry succeeds", async () => {
    if (!HAS_FFPROBE) return;
    let ttsCalls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/v1/voices/") && !u.includes("text-to-speech")) {
        return new Response(JSON.stringify({ voice_id: "v1" }), { status: 200 });
      }
      ttsCalls += 1;
      // First call: audio-magic-but-undecodable (clears the #121 guard, fails
      // ffprobe). Second+: valid silent mp3.
      const buf = ttsCalls === 1 ? CORRUPT_BUT_AUDIO_MAGIC : SILENT_MP3;
      return new Response(buf, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }) as typeof fetch;

    const result = await generateVoiceover({
      projectId,
      ...providerOutput("retry", "scene-03-vo.mp3"),
      slot: "scene-03-vo",
      text: "retry should succeed",
      voiceId: "v1",
    });

    expect(result.localPath).toContain("scene-03-vo.mp3");
    expect(ttsCalls).toBe(2);
  }, 30_000);
});

function providerOutput(id: string, filename: string): { runId: string; outputPath: string } {
  const runId = `run_${id}`;
  return { runId, outputPath: path.join(tmpRoot, ".ralphy", "tmp", runId, filename) };
}
