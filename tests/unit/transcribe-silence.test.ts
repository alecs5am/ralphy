// Issue #010: silent / sub-threshold audio used to THROW out of the
// transcribe() backends, breaking batch caption calls (noski-people-001 hit
// this ~80 times). All three backends now return Caption[] = [] on empty
// transcripts so the caller can decide what to do.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { transcribe } from "../../cli/lib/transcribe.js";

const originalFetch = globalThis.fetch;
const originalElevenKey = process.env.ELEVENLABS_API_KEY;
const originalOrKey = process.env.OPENROUTER_API_KEY;
let tmpAudio: string;

function mockFetch(handler: () => Response | Promise<Response>): void {
  globalThis.fetch = (async () => handler()) as typeof fetch;
}

beforeEach(async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.OPENROUTER_API_KEY = "test-key";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-silence-"));
  tmpAudio = path.join(dir, "clip.mp3");
  await fs.writeFile(tmpAudio, Buffer.from([0xff, 0xfb, 0x90, 0x44]));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalElevenKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalElevenKey;
  if (originalOrKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalOrKey;
});

describe("transcribe: empty transcript → []", () => {
  test("ElevenLabs Scribe: silent audio → captions=[]", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({
          language_code: "eng",
          language_probability: 0.5,
          text: "",
          audio_duration_secs: 5.0,
          words: [],
        }),
        { status: 200 },
      ),
    );
    const r = await transcribe({
      audioPath: tmpAudio,
      language: "en",
      backend: "elevenlabs",
    });
    expect(r.captions).toEqual([]);
    expect(r.audioDurationSec).toBe(5);
  });

  test("OpenRouter whisper: empty body → captions=[] (no throw)", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({
          duration: 3,
          // no text, no segments, no words → would previously throw
        }),
        { status: 200 },
      ),
    );
    const r = await transcribe({
      audioPath: tmpAudio,
      language: "en",
      backend: "openrouter",
    });
    expect(r.captions).toEqual([]);
  });

  test("Gemini audio: empty content → captions=[] (no throw)", async () => {
    mockFetch(() =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "" } }],
        }),
        { status: 200 },
      ),
    );
    const r = await transcribe({
      audioPath: tmpAudio,
      language: "en",
      backend: "gemini",
    });
    expect(r.captions).toEqual([]);
  });
});
