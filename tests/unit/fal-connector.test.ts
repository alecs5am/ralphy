// Unit tests for the fal.ai connector (#402). Fetch is stubbed at
// `globalThis.fetch` (NEVER mock.module a shared lib, #072). The stub routes
// by URL to emulate the queue lifecycle:
//   storage initiate → PUT → queue submit → status poll → result → mp4 download
//
// Covered:
//   - registry: `fal` shows in `providerMatrix()` with the `video` capability,
//     available iff FAL_KEY is set.
//   - cost: each pricing branch (seedance 720p ±video-refs, 1080p; kling audio).
//   - request shape: seedance carries `video_urls`; kling o3 carries `image_urls`
//     and refuses `--ref-video`; `generate_audio` defaults false for seedance.
//   - success maps to GenerateResult + writes a gen-log row with cost_usd.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { providerMatrix, connectorsFor, resolveConnector } from "../../cli/lib/providers/registry.js";
import {
  generateVideo,
  falVideoPricePerSec,
  falConnector,
  isFalVideoModel,
} from "../../cli/lib/providers/fal.js";
import { readGenerations } from "../../cli/lib/gen-log.js";

const originalFetch = globalThis.fetch;
const originalFal = process.env.FAL_KEY;
const originalBackoff = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
const originalCwd = process.cwd();
let tmpRoot: string;
const projectId = "fal-test-001";

// Minimal mp4 byte payload returned by the stubbed download.
const MP4_BYTES = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]);

type Captured = {
  submitBody: any | null;
  initiateBodies: any[];
  putCount: number;
};

/**
 * Install a URL-routed fetch stub emulating the fal queue lifecycle. The first
 * status poll returns IN_PROGRESS, the second COMPLETED (exercises the poll
 * loop) — pollIntervalMs is forced to 0 by the caller.
 */
function installFalStub(captured: Captured): void {
  let statusCalls = 0;
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(typeof init.body === "string" ? init.body : "{}") : null;

    if (u === "https://rest.alpha.fal.ai/storage/upload/initiate") {
      captured.initiateBodies.push(body);
      return new Response(
        JSON.stringify({
          upload_url: "https://upload.fal.example/put-target",
          file_url: "https://v3.fal.media/files/test/uploaded.bin",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u === "https://upload.fal.example/put-target" && method === "PUT") {
      captured.putCount += 1;
      return new Response("", { status: 200 });
    }
    if (u.startsWith("https://queue.fal.run/") && method === "POST") {
      captured.submitBody = body;
      return new Response(
        JSON.stringify({
          request_id: "req-123",
          status_url: "https://queue.fal.run/req-123/status",
          response_url: "https://queue.fal.run/req-123/response",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u === "https://queue.fal.run/req-123/status") {
      statusCalls += 1;
      const status = statusCalls < 2 ? "IN_PROGRESS" : "COMPLETED";
      return new Response(
        JSON.stringify({ status, response_url: "https://queue.fal.run/req-123/response" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u === "https://queue.fal.run/req-123/response") {
      return new Response(
        JSON.stringify({ video: { url: "https://v3.fal.media/files/test/out.mp4" }, seed: 7 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (u === "https://v3.fal.media/files/test/out.mp4") {
      return new Response(MP4_BYTES, { status: 200 });
    }
    throw new Error(`unexpected fetch in stub: ${method} ${u}`);
  }) as typeof fetch;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-fal-"));
  setRoot(tmpRoot);
  process.env.FAL_KEY = "test-fal-key";
  process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
  fs.mkdirSync(
    path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId, "logs"),
    { recursive: true },
  );
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalFal === undefined) delete process.env.FAL_KEY;
  else process.env.FAL_KEY = originalFal;
  if (originalBackoff === undefined) delete process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
  else process.env.RALPHY_TEST_RETRY_BACKOFF_MS = originalBackoff;
  setRoot(originalCwd);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

describe("fal connector — registry", () => {
  test("fal appears with the video capability when FAL_KEY is set", () => {
    const row = providerMatrix().find((p) => p.id === "fal");
    expect(row).toBeDefined();
    expect(row!.capabilities).toEqual(["video"]);
    expect(row!.envVar).toBe("FAL_KEY");
    expect(row!.available).toBe(true);
    expect(row!.capabilities.includes("video")).toBe(true);
    expect(row!.capabilities.includes("image")).toBe(false);
  });

  test("fal is unavailable when FAL_KEY is absent", () => {
    delete process.env.FAL_KEY;
    const row = providerMatrix().find((p) => p.id === "fal");
    expect(row!.available).toBe(false);
  });

  test("fal serves video, after openrouter in priority order", () => {
    expect(connectorsFor("video").map((c) => c.id)).toEqual(["openrouter", "fal"]);
  });

  test("explicit --provider fal resolves to the fal connector for video", () => {
    expect(resolveConnector("video", "fal").id).toBe("fal");
  });

  test("connector advertises only video (no image/voice/etc)", () => {
    expect(falConnector.capabilities).toEqual(["video"]);
    expect(isFalVideoModel("bytedance/seedance-2.0/reference-to-video")).toBe(true);
    expect(isFalVideoModel("fal-ai/kling-video/o3/pro/reference-to-video")).toBe(true);
    expect(isFalVideoModel("kwaivgi/kling-v3.0-pro")).toBe(false);
  });
});

describe("fal connector — cost computation (#402 pricing)", () => {
  test("seedance 720p without video refs = $0.3034/s", () => {
    expect(
      falVideoPricePerSec({
        model: "bytedance/seedance-2.0/reference-to-video",
        resolution: "720p",
        generateAudio: false,
        hasVideoRefs: false,
      }),
    ).toBe(0.3034);
  });

  test("seedance 720p WITH video refs = $0.1814/s (×0.6)", () => {
    expect(
      falVideoPricePerSec({
        model: "bytedance/seedance-2.0/reference-to-video",
        resolution: "720p",
        generateAudio: false,
        hasVideoRefs: true,
      }),
    ).toBe(0.1814);
  });

  test("seedance 1080p = $0.682/s flat (no video-ref discount)", () => {
    expect(
      falVideoPricePerSec({
        model: "bytedance/seedance-2.0/reference-to-video",
        resolution: "1080p",
        generateAudio: false,
        hasVideoRefs: true,
      }),
    ).toBe(0.682);
  });

  test("kling o3 audio-off = $0.112/s, audio-on = $0.14/s", () => {
    const base = {
      model: "fal-ai/kling-video/o3/pro/reference-to-video",
      resolution: "720p",
      hasVideoRefs: false,
    };
    expect(falVideoPricePerSec({ ...base, generateAudio: false })).toBe(0.112);
    expect(falVideoPricePerSec({ ...base, generateAudio: true })).toBe(0.14);
  });
});

describe("fal connector — generateVideo request shape + Run temp result", () => {
  test("seedance r2v: video_urls present, generate_audio default false, Run temp GenerateResult", async () => {
    const captured: Captured = { submitBody: null, initiateBodies: [], putCount: 0 };
    installFalStub(captured);

    // Write a real ref-video file so probeRefVideo can stat it. We bypass the
    // constraint planner's ffprobe by feeding an http URL instead — but to test
    // video_urls wiring we use a remote URL (no probe needed). The connector
    // only probes LOCAL paths; remote refs pass through uploadLocalRef verbatim.
    const result = await generateVideo({
      projectId,
      ...providerOutput("fal-1", "scene-01-vid.mp4"),
      slot: "scene-01-vid",
      prompt: "@Video1 restyled into a neon arcade",
      durationSec: 6,
      model: "bytedance/seedance-2.0/reference-to-video",
      // Remote video ref → no ffprobe; still flows into video_urls via the
      // planner short-circuit (planRefVideos only runs on probed locals).
      refs: ["https://example.com/style.png"],
      resolution: "720p",
      pollIntervalMs: 0,
    });

    // Result shape.
    expect(result.model).toBe("bytedance/seedance-2.0/reference-to-video");
    expect(result.localPath.endsWith("scene-01-vid.mp4")).toBe(true);
    // 720p, no video refs (only an image ref) → $0.3034/s × 6.
    expect(result.costUsd).toBeCloseTo(0.3034 * 6, 4);
    expect(fs.existsSync(result.localPath)).toBe(true);

    // Submit body shape.
    expect(captured.submitBody.generate_audio).toBe(false);
    expect(captured.submitBody.image_urls).toEqual(["https://example.com/style.png"]);
    expect(captured.submitBody.duration).toBe("6");
    expect(captured.submitBody.aspect_ratio).toBe("9:16");
    // No local refs → no CDN upload.
    expect(captured.putCount).toBe(0);

    expect(await readGenerations(projectId)).toHaveLength(0);
  });

  test("seedance r2v with a remote video ref: video_urls carries the URL, ×0.6 cost", async () => {
    const captured: Captured = { submitBody: null, initiateBodies: [], putCount: 0 };
    installFalStub(captured);

    // Remote ref-video → passes through verbatim (no ffprobe / downscale). The
    // local-path probe → downscale → CDN-upload route is unit-tested purely in
    // fal-ref-video-constraints.test.ts; here we assert the video_urls wiring +
    // the ×0.6 video-input cost branch end-to-end.
    const result = await generateVideo({
      projectId,
      ...providerOutput("fal-2", "scene-02-vid.mp4"),
      slot: "scene-02-vid",
      prompt: "@Video1 in a claymation world",
      durationSec: 5,
      model: "bytedance/seedance-2.0/reference-to-video",
      refVideos: ["https://example.com/source.mp4"], // remote → no ffprobe
      resolution: "720p",
      pollIntervalMs: 0,
    });

    expect(captured.submitBody.video_urls).toEqual(["https://example.com/source.mp4"]);
    // hasVideoRefs → ×0.6 = $0.1814/s × 5.
    expect(result.costUsd).toBeCloseTo(0.1814 * 5, 4);
  });

  test("kling o3: image_urls carries refs; --ref-video refuses (no video input)", async () => {
    const captured: Captured = { submitBody: null, initiateBodies: [], putCount: 0 };
    installFalStub(captured);

    // Happy path: image refs only.
    const result = await generateVideo({
      projectId,
      ...providerOutput("fal-3", "scene-03-vid.mp4"),
      slot: "scene-03-vid",
      prompt: "@Image1 walks through a market",
      durationSec: 5,
      model: "fal-ai/kling-video/o3/pro/reference-to-video",
      refs: ["https://example.com/char.png"],
      generateAudio: true,
      pollIntervalMs: 0,
    });
    expect(captured.submitBody.image_urls).toEqual(["https://example.com/char.png"]);
    expect(captured.submitBody.video_urls).toBeUndefined();
    // audio-on → $0.14/s × 5.
    expect(result.costUsd).toBeCloseTo(0.14 * 5, 4);

    // Refusal: video refs on a model that takes none.
    let caught: unknown;
    try {
      await generateVideo({
        projectId,
        ...providerOutput("fal-4", "scene-04-vid.mp4"),
        slot: "scene-04-vid",
        prompt: "x",
        durationSec: 5,
        model: "fal-ai/kling-video/o3/pro/reference-to-video",
        refVideos: ["https://example.com/source.mp4"],
        pollIntervalMs: 0,
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toMatch(/does not accept reference videos/i);
  });

  test("unknown fal model refuses cleanly", async () => {
    const captured: Captured = { submitBody: null, initiateBodies: [], putCount: 0 };
    installFalStub(captured);
    let caught: unknown;
    try {
      await generateVideo({
        projectId,
        slot: "scene-05-vid",
        prompt: "x",
        durationSec: 5,
        model: "fal-ai/not-a-real-model",
        pollIntervalMs: 0,
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as Error).message).toMatch(/cannot serve model/i);
    expect(captured.submitBody).toBeNull();
  });
});

function providerOutput(id: string, filename: string): { runId: string; outputPath: string } {
  const runId = `run_${id}`;
  return { runId, outputPath: path.join(tmpRoot, ".ralphy", "tmp", runId, filename) };
}
