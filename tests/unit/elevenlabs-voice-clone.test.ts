// Unit tests for `cloneVoice()` — Instant Voice Cloning verb (#030).
//
// Failure mode being asserted: pre-#030 there was no `ralphy voice clone`,
// so agents reached for raw curl which (a) bypassed the canonical gen-log
// and (b) consistently forgot remove_background_noise=true (tribal-knowledge
// gotcha cited in choose-your-guide-001 postmortem GAP-14). This test
// pins the API contract: voice_id surfaces, gen-log row gets written,
// the rb_noise flag defaults to true.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

import { setRoot } from "../../cli/lib/paths.js";
import { cloneVoice, _resetVoiceExistsCache } from "../../cli/lib/providers/elevenlabs.js";
import { readGenerations } from "../../cli/lib/gen-log.js";
import { ensureVoiceExists } from "../../cli/lib/providers/elevenlabs.js";

function hasFfmpeg(): boolean {
  return spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
}
const HAS_FFMPEG = hasFfmpeg();

const originalFetch = globalThis.fetch;
const originalEl = process.env.ELEVENLABS_API_KEY;
const originalCwd = process.cwd();
let tmpRoot: string;
let projectId: string;
let samplePath: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-voice-clone-"));
  setRoot(tmpRoot);
  process.env.ELEVENLABS_API_KEY = "test-el-key";
  projectId = "voice-clone-001";
  fs.mkdirSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId, "logs"), {
    recursive: true,
  });
  // Source audio sample — just needs to exist + be non-empty. cloneVoice
  // forwards the bytes verbatim, the mocked fetch doesn't decode them.
  samplePath = path.join(tmpRoot, "narrator.mp3");
  fs.writeFileSync(samplePath, Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00]));
  _resetVoiceExistsCache();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalEl === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalEl;
  setRoot(originalCwd);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("cloneVoice", () => {
  test("happy path → voice_id surfaces + gen-log row written + cache primed", async () => {
    let addCalled = false;
    let addBody: FormData | null = null;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/v1/voices/add")) {
        addCalled = true;
        addBody = init?.body as FormData;
        return new Response(JSON.stringify({ voice_id: "newly_cloned_v1" }), { status: 200 });
      }
      // The post-clone voice-exists check should hit the cache, not the
      // network. If a /v1/voices/<id> request shows up here something is off.
      if (u.includes("/v1/voices/")) {
        throw new Error(`unexpected voice-fetch hit: ${u}`);
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch;

    const result = await cloneVoice({
      projectId,
      fromPath: samplePath,
      name: "Alerter",
    });

    expect(addCalled).toBe(true);
    expect(result.voiceId).toBe("newly_cloned_v1");
    expect(result.name).toBe("Alerter");
    expect(result.isolatedPath).toBeUndefined();

    // remove_background_noise=true is the load-bearing default (tribal-knowledge
    // gotcha from #030). Verify it lands on the multipart body.
    expect(addBody).not.toBeNull();
    expect((addBody as FormData).get("remove_background_noise")).toBe("true");
    expect((addBody as FormData).get("name")).toBe("Alerter");

    // The new voice_id is now in the in-process voice-exists cache, so a
    // subsequent ensureVoiceExists() does NOT hit the network (the mocked
    // fetch above would throw if it did).
    await ensureVoiceExists("newly_cloned_v1");

    // Canonical gen-log row was written.
    const rows = await readGenerations(projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe("elevenlabs");
    expect(rows[0]!.kind).toBe("audio");
    expect(rows[0]!.endpoint).toBe("voices/add");
    expect(rows[0]!.request_id).toBe("newly_cloned_v1");
    expect((rows[0]!.input as { name: string }).name).toBe("Alerter");
    expect((rows[0]!.input as { remove_background_noise: boolean }).remove_background_noise).toBe(
      true,
    );
  }, 15_000);

  test("--no-denoise sets remove_background_noise=false", async () => {
    let addBody: FormData | null = null;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/v1/voices/add")) {
        addBody = init?.body as FormData;
        return new Response(JSON.stringify({ voice_id: "no_denoise_v1" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch;

    await cloneVoice({
      fromPath: samplePath,
      name: "RoomTone",
      denoise: false,
    });

    expect((addBody as unknown as FormData).get("remove_background_noise")).toBe("false");
  }, 15_000);

  test("--isolate runs audio-isolation first then voices/add", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const u = String(url);
      calls.push(u);
      if (u.endsWith("/v1/audio-isolation")) {
        return new Response(Buffer.from([0xff, 0xfb]), { status: 200 });
      }
      if (u.endsWith("/v1/voices/add")) {
        return new Response(JSON.stringify({ voice_id: "isolated_v1" }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${u}`);
    }) as typeof fetch;

    const result = await cloneVoice({
      fromPath: samplePath,
      name: "PodcastHost",
      isolate: true,
    });

    // Order: isolation first, then voices/add.
    expect(calls[0]).toMatch(/audio-isolation/);
    expect(calls[1]).toMatch(/voices\/add/);
    expect(result.voiceId).toBe("isolated_v1");
    expect(result.isolatedPath).toBeDefined();
    expect(fs.existsSync(result.isolatedPath!)).toBe(true);
  }, 15_000);

  // #495: an --isolate pass on a long source can produce a file over the
  // 11 MB voices/add limit. cloneVoice must derive a compact sample and submit
  // THAT, not the oversized isolated file. Asserts the add step receives the
  // compressed sample (under limit) and the isolated artifact is untouched.
  test.skipIf(!HAS_FFMPEG)(
    "oversized isolated output → compresses before voices/add",
    async () => {
      // Build a genuinely oversized (>11 MB) but valid MP3 to stand in for the
      // isolation response body. Real ffmpeg then compresses it in-branch.
      const bigPath = path.join(tmpRoot, "big.mp3");
      const gen = spawnSync("ffmpeg", [
        "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", "sine=frequency=200:duration=460",
        "-b:a", "320k", bigPath,
      ]);
      expect(gen.status).toBe(0);
      const bigBuf = fs.readFileSync(bigPath);
      expect(bigBuf.byteLength).toBeGreaterThan(11 * 1024 * 1024);

      let addFileSize = -1;
      let addFileName = "";
      globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith("/v1/audio-isolation")) {
          return new Response(bigBuf, { status: 200 });
        }
        if (u.endsWith("/v1/voices/add")) {
          const file = (init?.body as FormData).get("files") as Blob & { name?: string };
          addFileSize = file.size;
          addFileName = file.name ?? "";
          return new Response(JSON.stringify({ voice_id: "compressed_v1" }), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${u}`);
      }) as typeof fetch;

      const result = await cloneVoice({
        projectId,
        fromPath: samplePath,
        name: "LongPodcast",
        isolate: true,
      });

      expect(result.voiceId).toBe("compressed_v1");
      // The add step received a DIFFERENT, compliant file — not the raw isolated one.
      expect(addFileSize).toBeGreaterThan(0);
      expect(addFileSize).toBeLessThanOrEqual(11 * 1024 * 1024);
      expect(addFileSize).toBeLessThan(bigBuf.byteLength);
      expect(addFileName).toMatch(/\.clone-sample\.mp3$/);

      // The oversized isolated artifact is preserved on disk (append-only).
      expect(fs.existsSync(result.isolatedPath!)).toBe(true);
      expect(fs.statSync(result.isolatedPath!).size).toBe(bigBuf.byteLength);

      // Provenance: the derived sample path is visible in the gen-log.
      const rows = await readGenerations(projectId);
      const cloneRow = rows.find((r) => r.endpoint === "voices/add");
      expect((cloneRow!.output as { compressed?: string }).compressed).toMatch(
        /\.clone-sample\.mp3$/,
      );
    },
    30_000,
  );

  test("missing source file → throws early before any fetch", async () => {
    let fetchHit = false;
    globalThis.fetch = (async () => {
      fetchHit = true;
      return new Response("", { status: 200 });
    }) as typeof fetch;

    let caught: unknown = null;
    try {
      await cloneVoice({ fromPath: "/tmp/does-not-exist.mp3", name: "Ghost" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/source audio not found/);
    expect(fetchHit).toBe(false);
  }, 15_000);
});
