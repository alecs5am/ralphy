// Provider connector registry — capability matrix + `--provider` resolution.
//
// First slice of notes/ideas/005 (pluggable provider spec). Locks the two
// bundled connectors (OpenRouter + ElevenLabs), the capability matrix, and the
// resolution rules: explicit `--provider` validated against the matrix +
// availability; otherwise first available connector that serves the capability.
//
// `resolveConnector` refuses via `raiseError`, which writes to stderr and calls
// `process.exit`. We stub both: exit throws a sentinel so control halts (the
// function is typed `never` past that point), and stderr.write is silenced.

import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import {
  listConnectors,
  connectorsFor,
  providerMatrix,
  resolveConnector,
} from "../../cli/lib/providers/registry.js";

const ENV_KEYS = ["OPENROUTER_API_KEY", "ELEVENLABS_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Run `fn`, capturing the `process.exit` code raiseError would use. */
function expectRefusal(fn: () => unknown): number {
  const exitSpy = spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`__exit__:${code ?? 0}`);
  }) as never);
  const errSpy = spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    fn();
    throw new Error("expected a refusal, got none");
  } catch (e) {
    const msg = (e as Error).message;
    const m = msg.match(/^__exit__:(\d+)$/);
    if (!m) throw e; // a non-exit error — re-surface it
    return Number(m[1]);
  } finally {
    exitSpy.mockRestore();
    errSpy.mockRestore();
  }
}

describe("provider registry — matrix", () => {
  test("three bundled connectors in priority order: openrouter, elevenlabs, then fal", () => {
    // fal (#402) is a video-only third-party connector and sits LAST so it
    // never pre-empts OpenRouter as the default video provider.
    expect(listConnectors().map((c) => c.id)).toEqual(["openrouter", "elevenlabs", "fal"]);
  });

  test("openrouter serves text/image/video/transcribe; elevenlabs voice/music/sfx/transcribe; fal video", () => {
    const byId = Object.fromEntries(providerMatrix().map((p) => [p.id, p.capabilities]));
    expect(byId.openrouter).toEqual(["text", "image", "video", "transcribe"]);
    expect(byId.elevenlabs).toEqual(["voice", "music", "sfx", "transcribe"]);
    expect(byId.fal).toEqual(["video"]);
  });

  test("connectorsFor maps a capability to the providers that serve it", () => {
    expect(connectorsFor("image").map((c) => c.id)).toEqual(["openrouter"]);
    expect(connectorsFor("voice").map((c) => c.id)).toEqual(["elevenlabs"]);
    // video is served by openrouter (first) then fal (#402)
    expect(connectorsFor("video").map((c) => c.id)).toEqual(["openrouter", "fal"]);
    // transcribe is served by both audio + text connectors, openrouter first
    expect(connectorsFor("transcribe").map((c) => c.id)).toEqual(["openrouter", "elevenlabs"]);
  });
});

describe("provider registry — resolution (default = first available)", () => {
  test("image defaults to openrouter, voice to elevenlabs when both keys present", () => {
    process.env.OPENROUTER_API_KEY = "x";
    process.env.ELEVENLABS_API_KEY = "y";
    expect(resolveConnector("image").id).toBe("openrouter");
    expect(resolveConnector("voice").id).toBe("elevenlabs");
  });

  test("explicit --provider that serves the capability and has its key wins", () => {
    process.env.OPENROUTER_API_KEY = "x";
    expect(resolveConnector("image", "openrouter").id).toBe("openrouter");
  });

  test("transcribe default picks openrouter (higher priority) when both available", () => {
    process.env.OPENROUTER_API_KEY = "x";
    process.env.ELEVENLABS_API_KEY = "y";
    expect(resolveConnector("transcribe").id).toBe("openrouter");
  });

  test("transcribe falls back to elevenlabs when openrouter key is absent", () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.ELEVENLABS_API_KEY = "y";
    expect(resolveConnector("transcribe").id).toBe("elevenlabs");
  });
});

describe("provider registry — refusals", () => {
  test("unknown provider id refuses (user error, exit 2)", () => {
    process.env.OPENROUTER_API_KEY = "x";
    expect(expectRefusal(() => resolveConnector("image", "falai"))).toBe(2);
  });

  test("capability mismatch refuses (elevenlabs cannot do image, exit 2)", () => {
    process.env.OPENROUTER_API_KEY = "x";
    process.env.ELEVENLABS_API_KEY = "y";
    expect(expectRefusal(() => resolveConnector("image", "elevenlabs"))).toBe(2);
  });

  test("explicit provider with missing key refuses (provider error, exit 3)", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(expectRefusal(() => resolveConnector("image", "openrouter"))).toBe(3);
  });

  test("default selection with no available provider refuses (exit 3)", () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(expectRefusal(() => resolveConnector("image"))).toBe(3);
  });
});
