// Live-API smoke tests. These actually hit OpenRouter + ElevenLabs and
// spend a small amount of money. Skipped unless `RUN_LIVE_TESTS=1` is
// set, so they never fire in normal `bun test` or CI.
//
// The intent is to catch silent provider-API drift: if OR changes the
// chat/completions image-output shape, or video submission contract, or
// ElevenLabs flips a header, we want to know within seconds rather than
// when the next agent runs `ralphy generate`.
//
// Cost ballpark for one full pass:
// - generate.image (gemini-3-pro-image-preview)  ~$0.15
// - generate.music (elevenlabs music_v1, 4s)     subscription / $0
// Total: ~$0.15. Skipped by default.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setRoot } from "../../cli/lib/paths.js";
import {
  generateImage,
  generateMusic,
} from "../../cli/lib/providers/media.js";

const SHOULD_RUN = process.env.RUN_LIVE_TESTS === "1";

let tmpRoot: string;

beforeAll(() => {
  if (!SHOULD_RUN) return;
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-live-"));
  setRoot(tmpRoot);
  // Minimal project so the providers' assetPath helper has somewhere to write.
  fs.mkdirSync(path.join(tmpRoot, "workspace", "projects", "live-test"), {
    recursive: true,
  });
});

afterAll(() => {
  if (!SHOULD_RUN || !tmpRoot) return;
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe.skipIf(!SHOULD_RUN)("live · OpenRouter image (gemini-3-pro-image-preview)", () => {
  test("generates a real PNG and writes it to disk", async () => {
    const result = await generateImage({
      projectId: "live-test",
      slot: "smoke-apple",
      prompt:
        "a single ripe red apple on a clean white background, studio lighting, 1024x1024 square",
      size: "1024x1024",
    });
    expect(result.localPath).toContain("smoke-apple.png");
    const stat = fs.statSync(result.localPath);
    expect(stat.size).toBeGreaterThan(10_000); // real bytes, not an HTML 404
    // Accept either PNG (89 50 4E 47) or JPEG (FF D8 FF) magic — OR's
    // image models sometimes return JPEG even when the slot ends in .png.
    const head = fs.readFileSync(result.localPath).subarray(0, 4);
    const isPng =
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    expect(isPng || isJpeg).toBe(true);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.latencyMs).toBeGreaterThan(0);
  }, 90_000);
});

describe.skipIf(!SHOULD_RUN)("live · ElevenLabs music (music_v1)", () => {
  test("generates a real MP3 instrumental bed", async () => {
    const result = await generateMusic({
      projectId: "live-test",
      slot: "smoke-bed",
      prompt: "calm cinematic underscore, low percussion, no melody",
      durationSec: 4,
      forceInstrumental: true,
    });
    expect(result.localPath).toContain("smoke-bed.mp3");
    const stat = fs.statSync(result.localPath);
    expect(stat.size).toBeGreaterThan(5_000);
    // MP3 starts with ID3 or 0xFFFB sync.
    const head = fs.readFileSync(result.localPath).subarray(0, 3);
    const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
    const isMpegSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
    expect(isId3 || isMpegSync).toBe(true);
  }, 60_000);
});
