// Generate clip-04-canteen-tray via nano-banana-pro text2img (no refs needed — it's a still life).

import fs from "node:fs/promises";
import path from "node:path";
import { logGeneration } from "../../../../cli/lib/gen-log.ts";

const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY missing");

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const PROJECT = path.resolve("workspace/projects/soviet-engineer-001");
const KEYFRAMES = path.join(PROJECT, "assets/keyframes");

async function retryFetch(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(240_000) }); }
    catch (e: any) { last = e; const w = 2500 * (i + 1); console.log(`  ⟳ retry ${i+1}/${attempts} in ${w}ms — ${e.message}`); await new Promise(r => setTimeout(r, w)); }
  }
  throw last;
}

const PROMPT =
  `Vertical 9:16 top-down overhead archival documentary photograph of a Soviet factory canteen (столовая) lunch tray on a Formica table, 1978. ` +
  `On the rectangular aluminum tray, arranged naturally: ` +
  `a deep white ceramic bowl of thick щи (Russian cabbage soup) with a dollop of sour cream floating, faint steam rising; ` +
  `a white ceramic plate with a single browned котлета (cutlet) next to a mound of mashed potatoes topped with a sprig of fresh dill; ` +
  `a faceted гранёный drinking glass filled with amber dried-fruit компот, a piece of prune visible through the glass; ` +
  `a single thick slice of dark rye bread on the tray; ` +
  `a bent aluminum spoon and fork, a crumpled white paper napkin beside the tray. ` +
  `Warm overhead tungsten canteen light. Blurred edges show the corner of another tray and a worker's elbow in a faded blue shirt at the edge of frame. ` +
  `Warm amber Svema 35mm film grain, heavy soft grain, aged paper tones, muted palette of olive, ochre, cream and warm red. Tungsten light sources. Documentary realism, photorealistic. ` +
  `The image is presented as a stylized archival photograph with a thin retro frame border containing vertical Cyrillic text 'СВЕМА 35' and 'ФОТОГРАФИЯ' on the edges.`;

async function main() {
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
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 400)}`);
  const j = (await res.json()) as { images?: Array<{ url: string }> };
  const url = j.images?.[0]?.url;
  if (!url) throw new Error("no url");

  const out = path.join(KEYFRAMES, "clip-04-canteen-tray.png");
  const dl = await retryFetch(url, { headers: UA });
  await fs.writeFile(out, Buffer.from(await dl.arrayBuffer()));
  const bytes = (await fs.stat(out)).size;
  await logGeneration("soviet-engineer-001", {
    provider: "fal",
    endpoint: "fal-ai/nano-banana-pro",
    kind: "image",
    input: { prompt: PROMPT.slice(0, 200) + "...", aspect_ratio: "9:16", resolution: "2K" },
    output: { url, local: out, bytes },
    status: "ok",
    latency_ms: Date.now() - t0,
    cost_usd: 0.15,
    note: "clip-04-canteen-tray keyframe (text2img, no refs)",
  });
  console.log(`  ✓ ${out} (${bytes} bytes) @ ${url}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
