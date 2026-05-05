// Generate voice samples via ElevenLabs for solutions-metal-001.
// Usage: node --env-file=.env --strip-types workspace/projects/solutions-metal-001/scripts/voice-sample.ts
import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("ELEVENLABS_API_KEY missing");
  process.exit(1);
}

const OUT_DIR = path.resolve("workspace/projects/solutions-metal-001/voice-samples");
await fs.mkdir(OUT_DIR, { recursive: true });

// Test script: first two scenes from SCENARIO.md (hook + setup), ~8 sec.
const TEST_TEXT =
  "Тысяча девятьсот семьдесят четвёртый. Нам сказали: сделайте ткань, которая держит форму. " +
  "Хлопок у нас был. Алюминий был. Проблема была одна: они не хотели жить вместе.";

// Hand-picked candidates: mature / gravelly / deadpan male voices that work well with multilingual_v2 for Russian.
// Voice IDs from ElevenLabs default public library (stable IDs).
const CANDIDATES = [
  // Missing from first run — rate-limited. Run sequentially this time.
  { id: "2EiwWnXFnvU5JabPnv8n", label: "clyde-warvet", stability: 0.55, similarity: 0.75, style: 0.25 },
  { id: "CYw3kZ02Hs0563khs1Fj", label: "dave-british-mature", stability: 0.6, similarity: 0.75, style: 0.15 },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "daniel-deep", stability: 0.6, similarity: 0.75, style: 0.15 },
];

const MODEL = "eleven_multilingual_v2";

async function generate(voice: { id: string; label: string; stability: number; similarity: number; style: number }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice.id}?output_format=mp3_44100_128`;
  const body = {
    text: TEST_TEXT,
    model_id: MODEL,
    voice_settings: {
      stability: voice.stability,
      similarity_boost: voice.similarity,
      style: voice.style,
      use_speaker_boost: true,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text();
    return { ok: false, label: voice.label, error: `${res.status} ${txt.slice(0, 200)}` };
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = path.join(OUT_DIR, `${voice.label}.mp3`);
  await fs.writeFile(outPath, buf);
  return { ok: true, label: voice.label, path: outPath, bytes: buf.length };
}

console.log(`Generating ${CANDIDATES.length} voice samples (sequential, ElevenLabs concurrent limit = 3)...`);
const results: Array<Awaited<ReturnType<typeof generate>>> = [];
for (const c of CANDIDATES) {
  results.push(await generate(c));
}
for (const r of results) {
  console.log(r.ok ? `  ✓ ${r.label} → ${r.bytes} bytes` : `  ✗ ${r.label} — ${r.error}`);
}

await fs.writeFile(
  path.join(OUT_DIR, "manifest.json"),
  JSON.stringify({ text: TEST_TEXT, model: MODEL, candidates: CANDIDATES, results }, null, 2)
);
console.log(`\nSaved to ${OUT_DIR}`);
