// Unit tests for ElevenLabs Scribe language-hint forwarding + low-confidence
// surfacing (notes/issues/051). Mocks fetch + fs.readFile (audio bytes) — no
// live transcription traffic.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { transcribe } from "../../cli/lib/transcribe.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.ELEVENLABS_API_KEY;
let tmpAudio: string;

type FetchCall = { url: string; init?: RequestInit; body?: unknown };

function mockFetch(handler: (call: FetchCall) => Response | Promise<Response>): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), init, body: init?.body };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

beforeEach(async () => {
  process.env.ELEVENLABS_API_KEY = "test-key";
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-scribe-"));
  tmpAudio = path.join(dir, "clip.mp3");
  await fs.writeFile(tmpAudio, Buffer.from([0xff, 0xfb, 0x90, 0x44])); // 4-byte stub
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalKey;
});

describe("Scribe: language hint forwarding", () => {
  test("--language en → language_code=eng in multipart body", async () => {
    let capturedForm: FormData | null = null;
    mockFetch((call) => {
      capturedForm = call.init?.body as FormData;
      return new Response(
        JSON.stringify({
          language_code: "eng",
          language_probability: 0.99,
          text: "hello world",
          audio_duration_secs: 1.0,
          words: [
            { text: "hello", start: 0, end: 0.4, type: "word" },
            { text: "world", start: 0.5, end: 0.9, type: "word" },
          ],
        }),
        { status: 200 },
      );
    });
    const r = await transcribe({
      audioPath: tmpAudio,
      language: "en",
      backend: "elevenlabs",
    });
    expect(r.language).toBe("eng");
    expect(capturedForm).not.toBeNull();
    expect((capturedForm as unknown as FormData).get("language_code")).toBe("eng");
  });

  test("--language auto → no language_code in multipart body", async () => {
    let capturedForm: FormData | null = null;
    mockFetch((call) => {
      capturedForm = call.init?.body as FormData;
      return new Response(
        JSON.stringify({
          language_code: "eng",
          language_probability: 0.5,
          text: "hi",
          audio_duration_secs: 0.5,
          words: [{ text: "hi", start: 0, end: 0.5, type: "word" }],
        }),
        { status: 200 },
      );
    });
    await transcribe({ audioPath: tmpAudio, language: "auto", backend: "elevenlabs" });
    expect((capturedForm as unknown as FormData).get("language_code")).toBeNull();
  });
});

describe("Scribe: low-confidence words", () => {
  test("words with logprob below threshold are surfaced", async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            language_code: "eng",
            language_probability: 0.95,
            text: "pick a door",
            audio_duration_secs: 2,
            words: [
              { text: "pick", start: 0, end: 0.3, type: "word", logprob: -0.05 }, // ~0.95 → ok
              { text: "a", start: 0.3, end: 0.4, type: "word", logprob: -2.5 }, // ~0.082 → low
              { text: "door", start: 0.4, end: 1, type: "word", logprob: -0.7 }, // ~0.496 → low
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const r = await transcribe({
      audioPath: tmpAudio,
      language: "en",
      backend: "elevenlabs",
    });
    expect(r.lowConfidenceWords.length).toBe(2);
    expect(r.lowConfidenceWords.map((w) => w.text)).toEqual(["a", "door"]);
    for (const w of r.lowConfidenceWords) {
      expect(w.confidence).toBeGreaterThan(0);
      expect(w.confidence).toBeLessThan(0.6);
    }
  });

  test("languageProbability is surfaced verbatim", async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            language_code: "eng",
            language_probability: 0.42,
            text: "hi",
            audio_duration_secs: 0.5,
            words: [{ text: "hi", start: 0, end: 0.5, type: "word" }],
          }),
          { status: 200 },
        ),
      ),
    );
    const r = await transcribe({
      audioPath: tmpAudio,
      language: "en",
      backend: "elevenlabs",
    });
    expect(r.languageProbability).toBe(0.42);
  });

  test("no logprob/confidence on any word → empty lowConfidenceWords", async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            language_code: "eng",
            language_probability: 0.99,
            text: "hi",
            audio_duration_secs: 0.5,
            words: [{ text: "hi", start: 0, end: 0.5, type: "word" }],
          }),
          { status: 200 },
        ),
      ),
    );
    const r = await transcribe({
      audioPath: tmpAudio,
      language: "en",
      backend: "elevenlabs",
    });
    expect(r.lowConfidenceWords).toEqual([]);
  });
});
