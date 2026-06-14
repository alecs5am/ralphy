// Unit tests for the OpenRouter whisper-1 transcribe backend's multipart body
// (notes/issues/120). The endpoint returned HTTP 400 because the file part was
// appended as a typeless `new Blob([bytes])` — it shipped as
// application/octet-stream, which the OpenAI-compatible /audio/transcriptions
// endpoint rejects. These tests assert the multipart request is well-formed:
//   - the file part carries a real audio Content-Type + a filename,
//   - the documented OpenRouter fields are present (model, language, ...),
//   - NO hand-set Content-Type header overrides fetch's multipart boundary,
// then map a canned word-level response to Caption[].
//
// Stubs globalThis.fetch (never mock.module on a shared lib — wedges CI, #072).

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { transcribe, audioMimeType } from "../../cli/lib/transcribe.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalElevenKey = process.env.ELEVENLABS_API_KEY;
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
  process.env.OPENROUTER_API_KEY = "test-key";
  // Force the openrouter backend pick even if a real ELEVENLABS key leaks in.
  delete process.env.ELEVENLABS_API_KEY;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-or-transcribe-"));
  tmpAudio = path.join(dir, "take.mp3");
  await fs.writeFile(tmpAudio, Buffer.from([0xff, 0xfb, 0x90, 0x44])); // 4-byte mp3 stub
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
  if (originalElevenKey === undefined) delete process.env.ELEVENLABS_API_KEY;
  else process.env.ELEVENLABS_API_KEY = originalElevenKey;
});

// The connector maps `word` strings through verbatim, so the on-disk fixture
// uses plain English (English-only-on-disk rule). The --lang ru flag exercises
// the language-forwarding path independently of the transcript text content.
const WORD_RESPONSE = {
  language: "russian",
  duration: 1.2,
  text: "hello world",
  words: [
    { word: "hello", start: 0.0, end: 0.5 },
    { word: "world", start: 0.6, end: 1.1 },
  ],
};

describe("OpenRouter transcribe: multipart body shape (#120)", () => {
  test("file part has an audio Content-Type and a filename", async () => {
    let form: FormData | null = null;
    mockFetch((call) => {
      form = call.init?.body as FormData;
      return new Response(JSON.stringify(WORD_RESPONSE), { status: 200 });
    });

    await transcribe({ audioPath: tmpAudio, language: "ru", backend: "openrouter" });

    expect(form).not.toBeNull();
    const filePart = (form as unknown as FormData).get("file");
    expect(filePart).toBeInstanceOf(Blob);
    const file = filePart as File;
    // The 400 root cause: a typeless blob ships as application/octet-stream.
    expect(file.type).toBe("audio/mpeg");
    expect(file.type).not.toBe("");
    expect(file.type).not.toBe("application/octet-stream");
    // A filename must be present (3rd arg to FormData.append).
    expect(file.name).toBe("take.mp3");
  });

  test("the documented OpenRouter fields are present", async () => {
    let form: FormData | null = null;
    mockFetch((call) => {
      form = call.init?.body as FormData;
      return new Response(JSON.stringify(WORD_RESPONSE), { status: 200 });
    });

    await transcribe({ audioPath: tmpAudio, language: "ru", backend: "openrouter" });

    const f = form as unknown as FormData;
    expect(f.get("model")).toBe("openai/whisper-1");
    expect(f.get("language")).toBe("ru");
    expect(f.get("response_format")).toBe("verbose_json");
    expect(f.get("timestamp_granularities[]")).toBe("word");
  });

  test("--language auto omits the language field", async () => {
    let form: FormData | null = null;
    mockFetch((call) => {
      form = call.init?.body as FormData;
      return new Response(JSON.stringify(WORD_RESPONSE), { status: 200 });
    });

    await transcribe({ audioPath: tmpAudio, language: "auto", backend: "openrouter" });

    expect((form as unknown as FormData).get("language")).toBeNull();
  });

  test("does NOT hand-set a Content-Type header (fetch owns the boundary)", async () => {
    const calls = mockFetch(
      () => new Response(JSON.stringify(WORD_RESPONSE), { status: 200 }),
    );

    await transcribe({ audioPath: tmpAudio, language: "ru", backend: "openrouter" });

    const headers = (calls[0]?.init?.headers ?? {}) as Record<string, string>;
    // Only Authorization should be set — a hand-set multipart/form-data header
    // without a boundary is the classic 400; fetch must set it itself.
    const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain("content-type");
    expect(headers.Authorization ?? headers.authorization).toBe("Bearer test-key");
  });

  test("hits the OpenRouter audio/transcriptions endpoint", async () => {
    const calls = mockFetch(
      () => new Response(JSON.stringify(WORD_RESPONSE), { status: 200 }),
    );
    await transcribe({ audioPath: tmpAudio, language: "ru", backend: "openrouter" });
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/audio/transcriptions");
  });
});

describe("OpenRouter transcribe: word-level response → Caption[]", () => {
  test("maps words to Caption[] with the standard shape", async () => {
    mockFetch(() => new Response(JSON.stringify(WORD_RESPONSE), { status: 200 }));

    const r = await transcribe({
      audioPath: tmpAudio,
      language: "ru",
      backend: "openrouter",
    });

    expect(r.backend).toBe("openrouter");
    expect(r.model).toBe("openai/whisper-1");
    expect(r.language).toBe("russian");
    expect(r.audioDurationSec).toBe(1.2);
    expect(r.captions.length).toBe(2);

    const [first, second] = r.captions;
    // Every caption carries {text, startMs, endMs, timestampMs, confidence}.
    for (const c of r.captions) {
      expect(typeof c.text).toBe("string");
      expect(typeof c.startMs).toBe("number");
      expect(typeof c.endMs).toBe("number");
      expect(typeof c.timestampMs).toBe("number");
      expect(c.confidence).toBeNull();
    }
    expect(first.text).toBe("hello");
    expect(first.startMs).toBe(0);
    expect(first.endMs).toBe(500);
    expect(first.timestampMs).toBe(250);
    expect(second.text).toBe("world");
    expect(second.startMs).toBe(600);
    expect(second.endMs).toBe(1100);
    expect(second.timestampMs).toBe(850);
  });
});

describe("audioMimeType", () => {
  test("maps common audio extensions to MIME types", () => {
    expect(audioMimeType("a.mp3")).toBe("audio/mpeg");
    expect(audioMimeType("a.MP3")).toBe("audio/mpeg");
    expect(audioMimeType("a.wav")).toBe("audio/wav");
    expect(audioMimeType("a.m4a")).toBe("audio/mp4");
    expect(audioMimeType("a.ogg")).toBe("audio/ogg");
    expect(audioMimeType("a.flac")).toBe("audio/flac");
  });

  test("falls back to audio/mpeg for unknown / missing extensions", () => {
    expect(audioMimeType("noext")).toBe("audio/mpeg");
    expect(audioMimeType("a.bin")).toBe("audio/mpeg");
  });
});
