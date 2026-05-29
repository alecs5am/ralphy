// Integration test for the i2v anchor pre-processing telemetry (#021).
//
// Confirms that a successful `generateVideo` round-trip with an oversized PNG
// firstFrame writes `input.preprocess.first_frame.{c2pa_stripped,resized,…}`
// into the project's generations.jsonl. The flag is what postmortems grep on to
// trace which anchors hit the wire after C2PA strip / resize-to-720p.
//
// Mocks `globalThis.fetch` for the submit + poll + download — no live API.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

import { setRoot } from "../../cli/lib/paths.js";
import { readGenerations } from "../../cli/lib/gen-log.js";
import { generateVideo } from "../../cli/lib/providers/openrouter.js";

const originalFetch = globalThis.fetch;
const originalOr = process.env.OPENROUTER_API_KEY;
const originalBackoff = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
let tmpRoot: string;
let projectId: string;
const originalCwd = process.cwd();

function ffmpegAvailable(): boolean {
  const r = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

function makePng(dir: string, name: string, width: number, height: number): string {
  const out = path.join(dir, name);
  const r = spawnSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi",
    "-i", `color=c=blue:s=${width}x${height}:d=1`,
    "-frames:v", "1",
    "-pix_fmt", "rgb24",
    out,
  ]);
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed to synthesize PNG ${name}: ${r.stderr?.toString()}`);
  }
  return out;
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-i2v-pp-int-"));
  setRoot(tmpRoot);
  process.env.OPENROUTER_API_KEY = "test-or-key";
  process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
  projectId = "i2v-pp-test-001";
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", projectId, "logs"), {
    recursive: true,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalOr === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOr;
  if (originalBackoff === undefined) delete process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
  else process.env.RALPHY_TEST_RETRY_BACKOFF_MS = originalBackoff;
  setRoot(originalCwd);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* noop */
  }
});

const desc = ffmpegAvailable() ? describe : describe.skip;

desc("generateVideo logs input.preprocess for i2v anchors (#021)", () => {
  test("oversized firstFrame PNG → preprocess.first_frame logged with c2pa_stripped + resized", async () => {
    const refDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-i2v-pp-ref-"));
    const bigPng = makePng(refDir, "anchor.png", 1080, 1920);

    // Fake OR video lifecycle: submit returns job + completed status; download
    // returns 8 bytes of placeholder mp4.
    let callIdx = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      callIdx += 1;
      const urlStr = typeof input === "string" ? input : (input as URL | Request).toString();
      if (urlStr.endsWith("/videos")) {
        return new Response(
          JSON.stringify({
            id: "job-xyz",
            status: "completed",
            unsigned_urls: ["https://cdn.invalid/job-xyz.mp4"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes("cdn.invalid")) {
        return new Response(Buffer.from("FAKE-MP4"), { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    try {
      const result = await generateVideo({
        projectId,
        slot: "scene-01-vid",
        prompt: "a duck waddles across a pond",
        durationSec: 5,
        model: "bytedance/seedance-2.0",
        firstFrame: bigPng,
        noRetry: true,
      });

      expect(result.localPath).toContain("scene-01-vid.mp4");

      // Read the generations.jsonl and confirm preprocess telemetry is on the
      // success row (the only `status: ok` video row).
      const rows = await readGenerations(projectId);
      const okVideoRow = rows.find((r) => r.kind === "video" && r.status === "ok");
      expect(okVideoRow).toBeDefined();
      const pp = (okVideoRow!.input as Record<string, unknown>).preprocess as
        | Record<string, unknown>
        | undefined;
      expect(pp).toBeDefined();
      const firstFrameInfo = pp!.first_frame as
        | { c2pa_stripped: boolean; resized: boolean; out_mime: string; out_bytes: number }
        | undefined;
      expect(firstFrameInfo).toBeDefined();
      expect(firstFrameInfo!.c2pa_stripped).toBe(true);
      expect(firstFrameInfo!.resized).toBe(true);
      expect(firstFrameInfo!.out_mime).toBe("image/jpeg");
      expect(firstFrameInfo!.out_bytes).toBeLessThan(100_000);

      // last_frame must NOT be present — we only sent first.
      expect(pp!.last_frame).toBeUndefined();

      // Original PNG on disk is untouched (AGENTS invariant #14).
      expect(fs.existsSync(bigPng)).toBe(true);

      // At least the submit + download fetches fired (no polls needed because
      // submit returned completed).
      expect(callIdx).toBeGreaterThanOrEqual(2);
    } finally {
      fs.rmSync(refDir, { recursive: true, force: true });
    }
  });
});
