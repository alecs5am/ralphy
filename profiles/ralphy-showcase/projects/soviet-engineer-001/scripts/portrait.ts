// Generate Soviet engineer character portrait via nano-banana-pro text2img.
// Output: assets/refs/engineer-portrait.png

import fs from "node:fs/promises";
import path from "node:path";
import { logGeneration } from "../../../../cli/lib/gen-log.ts";

const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY missing");

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const PROJECT = path.resolve("workspace/projects/soviet-engineer-001");
const REFS = path.join(PROJECT, "assets/refs");

async function main() {
await fs.mkdir(REFS, { recursive: true });

async function retryFetch(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(240_000) }); }
    catch (e: any) { last = e; const w = 2500 * (i + 1); console.log(`  ⟳ retry ${i+1}/${attempts} in ${w}ms — ${e.message}`); await new Promise(r => setTimeout(r, w)); }
  }
  throw last;
}

const PROMPT = [
  "Vertical 9:16 archival-style documentary portrait photograph, Soviet Union, 1978.",
  "A Soviet factory engineer in his mid-fifties — kind weathered face, deep-set tired intelligent brown eyes, greying hair neatly combed back, trimmed greying moustache, square jaw, faint wrinkles.",
  "He wears a white laboratory coat over a grey shirt and thin dark tie. Medium shot from chest up, three-quarter angle, facing slightly to the right, calm neutral expression, no smile.",
  "Soft natural window light from the left, a blurred wood-paneled office background with a desk lamp and a framed award on the wall.",
  "Photorealistic natural human anatomy. Warm amber Svema 35mm film grain, heavy soft grain, aged paper tones, muted olive-ochre-cream palette. Tungsten light. Documentary realism, photorealistic.",
  "The image is presented as a stylized archival photograph with a thin retro frame border containing vertical Cyrillic text 'СВЕМА 35' and 'ФОТОГРАФИЯ' on the edges.",
].join(" ");

console.log("[portrait] generating via nano-banana-pro text2img...");
const t0 = Date.now();
const res = await retryFetch("https://fal.run/fal-ai/nano-banana-pro", {
  method: "POST",
  headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
  body: JSON.stringify({
    prompt: PROMPT,
    aspect_ratio: "9:16",
    resolution: "2K",
    num_images: 1,
    output_format: "png",
  }),
});
if (!res.ok) {
  const txt = await res.text();
  throw new Error(`text2img ${res.status}: ${txt.slice(0, 500)}`);
}
const j = (await res.json()) as { images?: Array<{ url: string }> };
const url = j.images?.[0]?.url;
if (!url) throw new Error("no url in response");

const outPath = path.join(REFS, "engineer-portrait.png");
const dl = await retryFetch(url, { headers: UA });
await fs.writeFile(outPath, Buffer.from(await dl.arrayBuffer()));
const bytes = (await fs.stat(outPath)).size;

await logGeneration("soviet-engineer-001", {
  provider: "fal",
  endpoint: "fal-ai/nano-banana-pro",
  kind: "image",
  input: { prompt: PROMPT, aspect_ratio: "9:16", resolution: "2K" },
  output: { url, local: outPath, bytes },
  status: "ok",
  latency_ms: Date.now() - t0,
  cost_usd: 0.15,
  note: "engineer character portrait (identity anchor)",
});

console.log(`  ✓ ${outPath} (${bytes} bytes)`);
console.log(`  fal url: ${url}`);
await fs.writeFile(path.join(REFS, "engineer-portrait.url.txt"), url);
}

main().catch((e) => { console.error(e); process.exit(1); });
