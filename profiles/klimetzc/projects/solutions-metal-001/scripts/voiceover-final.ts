// Generate final voiceover for solutions-metal-001 via ElevenLabs.
// One voice, one narrator, 8 scenes → 8 per-scene files + 1 full-script master file.
// Usage: node --env-file=.env --experimental-strip-types workspace/projects/solutions-metal-001/scripts/voiceover-final.ts

import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) { console.error("ELEVENLABS_API_KEY missing"); process.exit(1); }

const VOICE_ID = "m0OQuJtWCw1V23P0pQmG";
const MODEL = "eleven_multilingual_v2";

// Single deadpan narrator (Gleb). One voice across the whole video.
const VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.8,
  style: 0.25,
  use_speaker_boost: true,
};

const OUT_DIR = path.resolve("workspace/projects/solutions-metal-001/voiceover");
await fs.mkdir(OUT_DIR, { recursive: true });

// Scene-by-scene script. Order matches scenario v3.1.
const SCENES = [
  { slug: "clip-01", text: "Мой дед был инженером-материаловедом. В семьдесят четвёртом году, в закрытом НИИ под Москвой, он придумал ткань, которая запоминает форму." },
  { slug: "clip-02", text: "Хлопок снаружи, тончайшая алюминиевая фольга посередине. Ткань ведёт себя как металл, но остаётся мягкой. Принимает любую форму — и держит её." },
  { slug: "clip-03", text: "На третьей попытке удалось стабилизировать слои. Первые два ушли в брак. Третий — получилось." },
  { slug: "clip-04", text: "В том же году разработку показали комиссии. Сказали — непрофильно. Алюминий уходил на оборону, хлопок — на полотенца. Закрыли." },
  { slug: "clip-05", text: "Тетрадь с записями деда пролежала в ящике стола больше полувека." },
  { slug: "clip-06", text: "Мы достали её прошлой зимой. Разобрали формулы заново и собрали небольшое производство с нуля." },
  { slug: "clip-07", text: "Тот же композит. Хлопок снаружи, металл внутри. Ткань, которая не повторяет форму. Она её создаёт." },
  { slug: "clip-08", text: "Одна идея. Две эпохи. Между ними — полвека, один ящик и одно имя. COTTON METAL." },
];

// Full master track: 8 lines joined with soft pauses. ElevenLabs recognizes
// <break time="Xs"/> SSML-like tags and extra line breaks as pauses.
const FULL_SCRIPT = SCENES.map((s) => s.text).join("\n\n");

async function tts(text: string, outPath: string) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: VOICE_SETTINGS,
    }),
  });
  if (!res.ok) {
    const errTxt = (await res.text()).slice(0, 500);
    throw new Error(`${res.status} ${errTxt}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outPath, buf);
  return buf.length;
}

const manifest: any = { voice_id: VOICE_ID, model: MODEL, settings: VOICE_SETTINGS, scenes: [], full_master: null };

// Sequential (ElevenLabs has 3-concurrent cap on some plans)
console.log(`Generating ${SCENES.length} per-scene + 1 master track (voice: ${VOICE_ID})...`);
for (const s of SCENES) {
  const out = path.join(OUT_DIR, `${s.slug}.mp3`);
  try {
    const bytes = await tts(s.text, out);
    console.log(`  ✓ ${s.slug} → ${out} (${bytes} bytes, ${s.text.length} chars)`);
    manifest.scenes.push({ slug: s.slug, text: s.text, local: out, bytes });
  } catch (e: any) {
    console.log(`  ✗ ${s.slug} — ${e.message}`);
    manifest.scenes.push({ slug: s.slug, text: s.text, error: e.message });
  }
}

// Master
const masterOut = path.join(OUT_DIR, "full-master.mp3");
try {
  const bytes = await tts(FULL_SCRIPT, masterOut);
  console.log(`  ✓ full-master → ${masterOut} (${bytes} bytes, ${FULL_SCRIPT.length} chars)`);
  manifest.full_master = { local: masterOut, text: FULL_SCRIPT, bytes };
} catch (e: any) {
  console.log(`  ✗ full-master — ${e.message}`);
  manifest.full_master = { error: e.message };
}

await fs.writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nAll saved to ${OUT_DIR}`);
