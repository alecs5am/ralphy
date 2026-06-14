// Integration test for `ralphy generate music --auto-retry-on-tos-rejection`
// (#006).
//
// Mocks `globalThis.fetch` end-to-end against the real `generateMusic`
// connector, then drives `submitMusicWithToSAutoRetry` — the helper the CLI
// action handler calls. Asserts the canonical gen-log schema (#032):
//
//   row 1: status=error,  error=/^tos_rejected:/, attempt=1,
//          input.prompt_suggestion="<rewrite>"
//   row 2: status=ok,     kind=music,           attempt=N (connector-supplied)
//   row 3: status=ok,     attempt=2,            input.prompt_suggestion_used=true,
//          input.original_prompt + input.resubmit_prompt set
//
// Why three rows: row 2 is what `generateMusic` itself logs on success;
// rows 1 and 3 are the wrapper's "ToS rejected → auto-resubmit" annotations.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import { readGenerations } from "../../cli/lib/gen-log.js";
import { generateMusic } from "../../cli/lib/providers/elevenlabs.js";
import { submitMusicWithToSAutoRetry } from "../../cli/lib/music-prompt-lint.js";

const originalFetch = globalThis.fetch;
const originalEl = process.env.ELEVENLABS_API_KEY;
const originalBackoff = process.env.RALPHY_TEST_RETRY_BACKOFF_MS;
const originalCwd = process.cwd();
let tmpRoot: string;
let projectId: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-music-autoretry-"));
  setRoot(tmpRoot);
  process.env.ELEVENLABS_API_KEY = "test-el-key";
  process.env.RALPHY_TEST_RETRY_BACKOFF_MS = "0,0,0";
  projectId = "music-tos-retry-001";
  fs.mkdirSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", projectId, "logs"), {
    recursive: true,
  });
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

describe("submitMusicWithToSAutoRetry — end-to-end against mocked EL", () => {
  test("400 ToS with prompt_suggestion → log tos_rejected then resubmit success", async () => {
    const suggestion = "trap beat, 140 BPM, 808 sub-bass, dark minor-key piano, no vocals";
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            detail: {
              message: "Prompt rejected by content policy",
              data: { prompt_suggestion: suggestion },
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      // Successful music response — mp3-ish blob with a valid "ID3" header so
      // it clears the #121 geo-block magic-byte guard.
      return new Response(new Uint8Array([0x49, 0x44, 0x33, 0, 1, 2, 3]).buffer, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }) as typeof fetch;

    const retried = await submitMusicWithToSAutoRetry({
      projectId,
      slot: "bed-01",
      prompt: "Drake type beat",
      durationSec: 8,
      forceInstrumental: true,
      submit: (p) =>
        generateMusic({
          projectId,
          slot: "bed-01",
          prompt: p,
          durationSec: 8,
        }),
    });

    expect(retried.resubmitted).toBe(true);
    expect(retried.promptSuggestion).toBe(suggestion);
    expect(retried.result.localPath).toContain("bed-01.mp3");
    expect(calls).toBe(2);

    const rows = await readGenerations(projectId);

    // ── row 1: ToS-rejected original ────────────────────────────────────────
    const tosRejected = rows.find(
      (r) => r.status === "error" && /^tos_rejected:/.test(r.error ?? ""),
    );
    expect(tosRejected).toBeDefined();
    expect(tosRejected!.attempt).toBe(1);
    expect(tosRejected!.kind).toBe("music");
    expect(tosRejected!.provider).toBe("elevenlabs");
    expect(tosRejected!.input.slot).toBe("bed-01");
    expect(tosRejected!.input.project).toBe(projectId);
    expect((tosRejected!.input as Record<string, unknown>).prompt).toBe("Drake type beat");
    expect((tosRejected!.input as Record<string, unknown>).prompt_suggestion).toBe(suggestion);

    // ── row 3: resubmit annotation ──────────────────────────────────────────
    const resubmit = rows.find(
      (r) =>
        r.status === "ok" &&
        (r.input as Record<string, unknown>).prompt_suggestion_used === true,
    );
    expect(resubmit).toBeDefined();
    expect(resubmit!.attempt).toBe(2);
    expect((resubmit!.input as Record<string, unknown>).original_prompt).toBe("Drake type beat");
    expect((resubmit!.input as Record<string, unknown>).resubmit_prompt).toBe(suggestion);

    // ── row 2: the connector's success row (separate from row 3) ────────────
    const connectorOk = rows.find(
      (r) =>
        r.status === "ok" &&
        r.kind === "music" &&
        (r.input as Record<string, unknown>).prompt_suggestion_used !== true,
    );
    expect(connectorOk).toBeDefined();
    expect((connectorOk!.input as Record<string, unknown>).prompt).toBe(suggestion);
  }, 30_000);

  test("400 ToS WITHOUT prompt_suggestion → rethrows, no resubmit attempted", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ detail: { message: "Refused, no rewrite available" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await expect(
      submitMusicWithToSAutoRetry({
        projectId,
        slot: "bed-02",
        prompt: "anything",
        durationSec: 8,
        forceInstrumental: true,
        submit: (p) =>
          generateMusic({
            projectId,
            slot: "bed-02",
            prompt: p,
            durationSec: 8,
          }),
      }),
    ).rejects.toThrow(/400/);
    expect(calls).toBe(1);
  }, 30_000);

  test("clean first submit → no resubmit, no tos_rejected row", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      // "ID3" header so the body clears the #121 geo-block magic-byte guard.
      return new Response(new Uint8Array([0x49, 0x44, 0x33, 0, 1, 2, 3]).buffer, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }) as typeof fetch;

    const retried = await submitMusicWithToSAutoRetry({
      projectId,
      slot: "bed-03",
      prompt: "cinematic ambient, 60 BPM, sustained pad",
      durationSec: 6,
      forceInstrumental: true,
      submit: (p) =>
        generateMusic({
          projectId,
          slot: "bed-03",
          prompt: p,
          durationSec: 6,
        }),
    });

    expect(retried.resubmitted).toBe(false);
    expect(calls).toBe(1);
    const rows = await readGenerations(projectId);
    expect(rows.find((r) => /tos_rejected/.test(r.error ?? ""))).toBeUndefined();
  }, 30_000);
});
