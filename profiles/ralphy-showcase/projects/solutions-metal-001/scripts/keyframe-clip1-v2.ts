// Regenerate Clip 1 keyframe — Soviet aesthetic from frame one.
// Grandfather's hands opening his 1974 notebook on a wooden lab desk.
// Uses grandfather ref photo (identity anchor for hands/wardrobe) via nano-banana-pro/edit.

import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.FAL_KEY;
if (!KEY) { console.error("FAL_KEY missing"); process.exit(1); }

const UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

async function retryFetch(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(240_000) }); }
    catch (e: any) { last = e; const w = 2500 * (i + 1); console.log(`  ⟳ retry ${i + 1}/${attempts} in ${w}ms — ${e.message}`); await new Promise(r => setTimeout(r, w)); }
  }
  throw last;
}

// Grandfather identity anchor (already on fal CDN)
const GRANDFATHER_REF_URL = "https://v3b.fal.media/files/b/0a974434/N8AjVvrDjZ8tFi9kDMmYh_grandfather-portrait-01.png";

const PROMPT =
  `Vertical 9:16 cinematic archival-style photograph, Soviet 1974, warm amber Svema 35mm film grain, heavy soft grain, period-accurate. ` +
  `Overhead close-up of a worn wooden laboratory desk. On the desk sits a weathered 1970s Soviet notebook with a grey cloth-bound cover and mildly frayed edges. ` +
  `Two elderly hands are opening the notebook at the moment captured by the frame: the hands belong to the grandfather in the reference photo — same man, same age, same wardrobe (white laboratory coat cuffs visible, white shirt cuffs underneath). ` +
  `His hands are natural, weathered, with visible veins and age spots, fingernails clean and trimmed, skin slightly wrinkled — exactly five fingers on each hand, correctly articulated, realistic anatomy. ` +
  `The opened page on the right reveals a careful hand-drawn technical cross-section diagram of a woven fabric (layered warp and weft threads labelled in Cyrillic handwriting, numerical annotations in blue-black ink), dated "12/IV – 1974 г." at the bottom. Text and drawing are clearly legible, correctly spelled Russian. ` +
  `Supporting props on the desk: a green bakelite USSR desk lamp on the right edge casts warm directional light across the notebook; a brass ink well; a used pencil; an enamel ashtray with cigarette butts partly out of frame. ` +
  `Colour palette: warm amber, olive brown, cream paper, dark walnut wood, muted ochre. Soft tungsten light source on the right, gentle shadows. ` +
  `No modern elements. No people visible beyond the hands and cuffs. Photorealistic documentary archival look, not stylized or illustrated. Sharp focus on the opening page, gentle motion blur on fingertips suggesting the hand is mid-action.`;

console.log("Generating Clip 1 v2 keyframe via nano-banana-pro/edit with grandfather ref...");
const res = await retryFetch("https://fal.run/fal-ai/nano-banana-pro/edit", {
  method: "POST",
  headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
  body: JSON.stringify({
    prompt: PROMPT,
    image_urls: [GRANDFATHER_REF_URL],
    aspect_ratio: "9:16",
    resolution: "2K",
    num_images: 1,
    output_format: "png",
  }),
});
if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 500)}`);
const json = (await res.json()) as { images?: Array<{ url: string }> };
const url = json.images?.[0]?.url;
if (!url) throw new Error(`no image url: ${JSON.stringify(json).slice(0, 400)}`);

const OUT = path.resolve("workspace/projects/solutions-metal-001/keyframes/clip-01-grandfather-hands-notebook.png");
const r = await retryFetch(url, { headers: UA });
const buf = Buffer.from(await r.arrayBuffer());
await fs.writeFile(OUT, buf);
console.log(`✓ saved: ${OUT} (${buf.length} bytes)`);
console.log(`  fal url: ${url}`);
