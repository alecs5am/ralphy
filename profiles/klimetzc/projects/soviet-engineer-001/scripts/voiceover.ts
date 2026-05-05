// Generate 6 per-clip voiceover mp3s via ElevenLabs eleven_multilingual_v2, sequential.

import fs from "node:fs/promises";
import path from "node:path";
import { logGeneration } from "../../../../cli/lib/gen-log.ts";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY missing");

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const PROJECT = path.resolve("workspace/projects/soviet-engineer-001");
const VO_DIR = path.join(PROJECT, "assets/voiceover");

const VOICE_ID = "m0OQuJtWCw1V23P0pQmG"; // proven deadpan Russian male from solutions-metal-001
const MODEL = "eleven_multilingual_v2";

const LINES: { slug: string; text: string }[] = [
  { slug: "clip-01-morning-kitchen",   text: "Раньше я вставал затемно. Чайник свистит, жена режет хлеб. Тихо — чтоб детей не разбудить." },
  { slug: "clip-02-walk-to-factory",   text: "Иду в цех. Снег скрипит под сапогами, фонари жёлтые. Все идут в одну сторону." },
  { slug: "clip-03-shop-floor",        text: "Свой станок знаешь как свою руку. Гудит. Масло, металл. Работаешь — и не замечаешь времени." },
  { slug: "clip-04-canteen-tray",      text: "Обед в столовой. Щи. Котлета с пюре. Компот из сухофруктов. Двадцать копеек." },
  { slug: "clip-05-walk-home-evening", text: "Вечером домой. Тот же снег, те же фонари. Только в окне уже свет — ждут." },
  { slug: "clip-06-family-dinner",     text: "Жена, дети, горячий ужин. Телевизор тихо бормочет. Тогда не знали, что это было счастье. Просто жили." },
];

async function retryFetch(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(120_000) }); }
    catch (e: any) { last = e; const w = 2500 * (i + 1); console.log(`  ⟳ retry ${i+1}/${attempts} in ${w}ms — ${e.message}`); await new Promise(r => setTimeout(r, w)); }
  }
  throw last;
}

async function tts(text: string, outFile: string): Promise<{ bytes: number; ms: number }> {
  const t0 = Date.now();
  const res = await retryFetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": KEY!,
      "Content-Type": "application/json",
      ...UA,
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.6, similarity_boost: 0.82, style: 0.22, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`tts ${res.status} ${(await res.text()).slice(0, 400)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(outFile, buf);
  return { bytes: buf.length, ms: Date.now() - t0 };
}

async function main() {
  await fs.mkdir(VO_DIR, { recursive: true });
  const results: any[] = [];
  for (const line of LINES) {
    const out = path.join(VO_DIR, `${line.slug}.mp3`);
    console.log(`[vo] ${line.slug}: "${line.text.slice(0, 60)}..."`);
    try {
      const { bytes, ms } = await tts(line.text, out);
      console.log(`  ✓ ${out} (${bytes} bytes, ${ms}ms)`);
      await logGeneration("soviet-engineer-001", {
        provider: "elevenlabs",
        endpoint: `tts/${VOICE_ID}`,
        kind: "voiceover",
        input: { text: line.text, model_id: MODEL, voice_id: VOICE_ID },
        output: { local: out, bytes },
        status: "ok",
        latency_ms: ms,
        note: `${line.slug} VO`,
      });
      results.push({ slug: line.slug, ok: true, local: out, bytes });
    } catch (e: any) {
      console.log(`  ✗ ${line.slug}: ${e.message || e}`);
      await logGeneration("soviet-engineer-001", {
        provider: "elevenlabs",
        endpoint: `tts/${VOICE_ID}`,
        kind: "voiceover",
        input: { text: line.text, model_id: MODEL, voice_id: VOICE_ID },
        status: "error",
        error: e.message || String(e),
        note: `${line.slug} VO FAILED`,
      });
      results.push({ slug: line.slug, ok: false, error: e.message || String(e) });
    }
  }
  await fs.writeFile(path.join(VO_DIR, "voiceover-manifest.json"), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} ok`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
