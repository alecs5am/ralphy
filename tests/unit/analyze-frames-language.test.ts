// Unit test for vision-analyze language/region surfacing (notes/issues/051).
// Mocks the OpenRouter chat-completions fetch + sets up a tmp workspace so
// analyzeFrames() can read a fake frame and write the analysis.json.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setRoot } from "../../cli/lib/paths.js";
import { analyzeFrames, refPaths } from "../../cli/lib/research.js";

const originalFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;
const originalRoot = process.cwd();
let tmpRoot: string;
const SLUG = "test-051-vision";

async function seedFrame(slug: string): Promise<void> {
  const paths = refPaths(slug);
  await fs.mkdir(paths.framesDir, { recursive: true });
  // 1x1 white JPEG (minimal valid jpeg bytes).
  const jpg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
  await fs.writeFile(path.join(paths.framesDir, "frame-0001.jpg"), jpg);
}

function mockLLM(responseText: string): { calls: { body: string }[] } {
  const calls: { body: string }[] = [];
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: String(init?.body ?? "") });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: responseText } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  return { calls };
}

beforeEach(async () => {
  process.env.OPENROUTER_API_KEY = "test-or-key";
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-vision-"));
  setRoot(tmpRoot);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  setRoot(originalRoot);
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
});

describe("analyzeFrames — language / script / region fields (#051)", () => {
  test("model emits the new fields → they reach the parsed JSON verbatim", async () => {
    await seedFrame(SLUG);
    mockLLM(
      JSON.stringify({
        format_label: "Talking-Head",
        duration_estimate_sec: 12,
        scene_count_estimate: 3,
        aspect_ratio: "9:16",
        subject: "young woman in a konbini",
        setting: "convenience store at night",
        captions_style: "word-pop",
        color_grade: "cool teal",
        language_detected_in_text: "ko",
        script_detected: "Hangul",
        region_hints: ["KR-traffic-signage", "KR-konbini"],
        hook: { first_seconds: "neon zoom", why_it_works: "" },
        scenes: [],
        viral_factors: [],
        reproduction: { difficulty: "medium", key_assets: [], steps: [] },
      }),
    );
    const r = await analyzeFrames({ slug: SLUG });
    expect(r.json).toBeDefined();
    const j = r.json as Record<string, unknown>;
    expect(j.language_detected_in_text).toBe("ko");
    expect(j.script_detected).toBe("Hangul");
    expect(j.region_hints).toEqual(["KR-traffic-signage", "KR-konbini"]);
  });

  test("model omits the fields → backfilled with null / [] (default-prompt path)", async () => {
    await seedFrame(SLUG);
    mockLLM(
      JSON.stringify({
        format_label: "AI-Drama",
        duration_estimate_sec: 8,
        scene_count_estimate: 2,
        aspect_ratio: "9:16",
        subject: "guy",
        setting: "alley",
        captions_style: "none",
        color_grade: "warm",
        hook: { first_seconds: "", why_it_works: "" },
        scenes: [],
        viral_factors: [],
        reproduction: { difficulty: "easy", key_assets: [], steps: [] },
      }),
    );
    const r = await analyzeFrames({ slug: SLUG });
    const j = r.json as Record<string, unknown>;
    expect(j).toHaveProperty("language_detected_in_text");
    expect(j.language_detected_in_text).toBeNull();
    expect(j.script_detected).toBeNull();
    expect(j.region_hints).toEqual([]);
  });

  test("default prompt asks the model for language / script / region", async () => {
    await seedFrame(SLUG);
    const { calls } = mockLLM(
      JSON.stringify({
        format_label: "x",
        duration_estimate_sec: 0,
        scene_count_estimate: 0,
        aspect_ratio: "9:16",
        subject: "",
        setting: "",
        captions_style: "none",
        color_grade: "",
        hook: { first_seconds: "", why_it_works: "" },
        scenes: [],
        viral_factors: [],
        reproduction: { difficulty: "easy", key_assets: [], steps: [] },
      }),
    );
    await analyzeFrames({ slug: SLUG });
    expect(calls.length).toBe(1);
    const body = calls[0]!.body;
    expect(body).toContain("language_detected_in_text");
    expect(body).toContain("script_detected");
    expect(body).toContain("region_hints");
  });
});
