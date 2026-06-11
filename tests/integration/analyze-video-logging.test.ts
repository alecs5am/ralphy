// Issue #032 §4: `ralphy ref analyze-video` must write a `kind: "video-analysis"`
// row to generations.jsonl. Pre-fix, 17 video-analysis calls on tokyo-y2k-001
// produced zero log entries and forced a `$1-3 (est)` placeholder in the
// postmortem.
//
// We exercise `analyzeVideo()` directly (rather than `ralphy ref analyze-video`
// at the CLI) so we can stub the network without spinning up OpenRouter. The
// stub lives at the `globalThis.fetch` level — the REAL `callLLM` + openrouter
// connector run end-to-end against a canned chat-completions response. Do NOT
// reach for `mock.module` here: it mutates the process-wide module registry, so
// every later-loaded test file inherits the mock (the leak wedged the suite at
// analyze-frames-language.test.ts on CI — see notes/issues/072 fallout).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { readGenerations } from "../../cli/lib/gen-log.js";

let tmpRoot: string;
let origRoot: string;

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;

/** Stub fetch with a canned OpenRouter chat-completions response. Returns a
 *  call counter so tests can assert the network layer was actually reached. */
function mockFetch(respond: () => Response): { calls: number } {
  const state = { calls: 0 };
  globalThis.fetch = (async () => {
    state.calls += 1;
    return respond();
  }) as typeof fetch;
  return state;
}

function chatOk(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "gen-test",
      model: "google/gemini-3.1-pro-preview",
      choices: [{ message: { content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-analyze-video-"));
  origRoot = process.cwd();
  setRoot(tmpRoot);
  // The real connector requires a key to resolve; never hits the network here.
  process.env.OPENROUTER_API_KEY = "test-or-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
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
    const projDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId);
    const assetsDir = path.join(projDir, "artifacts", "videos");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(path.join(projDir, "logs"), { recursive: true });
    const mp4Path = path.join(assetsDir, "scene-01.mp4");
    fs.writeFileSync(mp4Path, Buffer.from("fake-mp4-bytes-for-test"));

    const net = mockFetch(() =>
      chatOk('[{"id":1,"start_sec":0,"end_sec":3,"description":"mocked"}]'),
    );

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
    expect(net.calls).toBeGreaterThanOrEqual(1);
  });

  test("logs an error row when the provider call fails", async () => {
    const projectId = "test-vlog-002";
    const projDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId);
    const assetsDir = path.join(projDir, "artifacts", "videos");
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.mkdirSync(path.join(projDir, "logs"), { recursive: true });
    const mp4Path = path.join(assetsDir, "scene-01.mp4");
    fs.writeFileSync(mp4Path, Buffer.from("more-fake-bytes"));

    // 4xx → TerminalProviderError immediately (no #005 retries), message
    // carries the body — so the asserted "503" marker survives verbatim.
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ error: { message: "simulated 503 from OpenRouter" } }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    );

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
