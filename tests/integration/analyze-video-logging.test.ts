// Issue #032 §4: `ralphy ref analyze-video` must write a `kind: "video-analysis"`
// row to generations.jsonl. Pre-fix, 17 video-analysis calls on tokyo-y2k-001
// produced zero log entries and forced a `$1-3 (est)` placeholder in the
// postmortem.
//
// We exercise `analyzeVideo()` directly (rather than `ralphy ref analyze-video`
// at the CLI) so we can mock `callLLM` without spinning up OpenRouter. The
// shape of the row is what we care about; the CLI surface is a thin wrapper.

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { readGenerations } from "../../cli/lib/gen-log.js";

let tmpRoot: string;
let origRoot: string;

// Module-level mock for callLLM. Stored as a module-level state so the per-test
// closure can swap behavior without re-running mock.module each time.
const callLLMState: {
  fn: (opts: unknown) => Promise<{
    text: string;
    raw: unknown;
    provider: string;
    model: string;
    latencyMs: number;
  }>;
} = {
  fn: async () => {
    throw new Error("callLLM mock not initialised");
  },
};
mock.module("../../cli/lib/providers/llm.js", () => ({
  callLLM: (opts: unknown) => callLLMState.fn(opts),
}));

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-analyze-video-"));
  origRoot = process.cwd();
  setRoot(tmpRoot);
});

afterEach(() => {
  setRoot(origRoot);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe("analyzeVideo logging (#032)", () => {
  test("writes a kind=video-analysis row when given a workspace project mp4", async () => {
    // Stand up a fake project + a tiny "video" file. analyzeVideo only checks
    // existsSync + reads bytes for inputBytes, so any non-empty file is fine.
    const projectId = "test-vlog-001";
    const projDir = path.join(tmpRoot, "workspace", "projects", projectId);
    const assetsDir = path.join(projDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(path.join(projDir, "logs"), { recursive: true });
    const mp4Path = path.join(assetsDir, "scene-01.mp4");
    fs.writeFileSync(mp4Path, Buffer.from("fake-mp4-bytes-for-test"));

    let callCount = 0;
    callLLMState.fn = async () => {
      callCount += 1;
      return {
        text: '[{"id":1,"start_sec":0,"end_sec":3,"description":"mocked"}]',
        raw: {},
        provider: "openrouter",
        model: "google/gemini-3.1-pro-preview",
        latencyMs: 42,
      };
    };

    const research = await import("../../cli/lib/research.js");
    await research.analyzeVideo({
      videoPath: mp4Path,
      prompt: "test prompt",
    });

    const rows = await readGenerations(projectId);
    const vidRows = rows.filter((r) => r.kind === "video-analysis");
    expect(vidRows.length).toBeGreaterThanOrEqual(1);
    const r = vidRows[0]!;
    expect(r.model).toBe("google/gemini-3.1-pro-preview");
    expect(r.provider).toBe("openrouter");
    expect(r.input.project).toBe(projectId);
    expect(typeof r.input.slot).toBe("string");
    expect(r.status).toBe("ok");
    expect(typeof r.cost_usd).toBe("number");
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  test("logs an error row when callLLM throws", async () => {
    const projectId = "test-vlog-002";
    const projDir = path.join(tmpRoot, "workspace", "projects", projectId);
    const assetsDir = path.join(projDir, "assets");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(path.join(projDir, "logs"), { recursive: true });
    const mp4Path = path.join(assetsDir, "scene-01.mp4");
    fs.writeFileSync(mp4Path, Buffer.from("more-fake-bytes"));

    callLLMState.fn = async () => {
      throw new Error("simulated 503 from OpenRouter");
    };

    const research = await import("../../cli/lib/research.js");
    await expect(
      research.analyzeVideo({ videoPath: mp4Path, prompt: "x" }),
    ).rejects.toThrow();

    const rows = await readGenerations(projectId);
    const errRows = rows.filter((r) => r.kind === "video-analysis" && r.status === "error");
    expect(errRows.length).toBe(1);
    expect(errRows[0]!.error).toContain("503");
  });
});
