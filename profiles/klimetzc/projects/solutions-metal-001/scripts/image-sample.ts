// Generate 3 test keyframes via fal.ai for solutions-metal-001.
// Usage: node --env-file=.env --strip-types workspace/projects/solutions-metal-001/scripts/image-sample.ts
import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.FAL_KEY;
if (!KEY) {
  console.error("FAL_KEY missing");
  process.exit(1);
}

const OUT_DIR = path.resolve("workspace/projects/solutions-metal-001/image-samples");
await fs.mkdir(OUT_DIR, { recursive: true });

// Shared Soviet 1974 style stack for all prompts.
const STYLE_STACK =
  "Soviet Svema film stock aesthetic, 1974, warm amber tones, heavy 35mm film grain, " +
  "slightly faded color, soft dust and scratches, shallow depth of field, natural light, " +
  "documentary photography, muted palette of olive-brown, cream, and warm red";

const NEGATIVE = "modern objects, plastic, digital artifacts, logos, watermarks, text, blurry, deformed hands, extra fingers";

const SHOTS = [
  {
    slug: "01-folder",
    aspect_ratio: "9:16" as const,
    prompt:
      "Extreme close-up of two hands in white cotton laboratory gloves opening a beige cardboard file folder on a dark wooden desk. " +
      "The folder has a bright red rubber stamp that reads in Cyrillic 'СЕКРЕТНО НИИ-27 ТКАНЬ-12'. " +
      "Dim desk lamp from above-left casting warm golden light. Ashtray and fountain pen in soft focus. " +
      STYLE_STACK,
  },
  {
    slug: "06-commission",
    aspect_ratio: "9:16" as const,
    prompt:
      "A Soviet textile engineer in his early fifties, grey hair, wire-frame round glasses, white laboratory coat, " +
      "wearing a crumpled black bucket hat made of crinkled metallic-cotton fabric on his head. " +
      "He stands in a wood-panelled conference room in front of three stern committee members in dark suits sitting behind a long table with green cloth, " +
      "glasses of water and folders in front of them. No one is smiling. Awkward formal atmosphere. Medium shot, eye level. " +
      STYLE_STACK,
  },
  {
    slug: "10-still-life",
    aspect_ratio: "9:16" as const,
    prompt:
      "Flat-lay still life: four black fabric headwear items arranged on a raw concrete slab: two bucket hats and two structured caps, all made of crumpled crinkled black metallic-cotton fabric with a small polished metal DOD LOGO shield badge. " +
      "Cold diffuse overhead studio light, no shadows, stark minimal, editorial look. Slight film grain but otherwise clean and modern. " +
      "The hats sit in a loose rectangle with negative space between them. Concrete texture visible.",
  },
];

// fal.ai flux-pro/v1.1 endpoint (via fal-ai/flux-pro/v1.1) is a solid general-purpose text-to-image.
// Docs: https://fal.run/fal-ai/flux-pro/v1.1
// We'll use the synchronous /run endpoint for simplicity.
const ENDPOINT = "https://fal.run/fal-ai/flux-pro/v1.1";

async function generate(shot: (typeof SHOTS)[number]) {
  const body = {
    prompt: shot.prompt,
    aspect_ratio: shot.aspect_ratio,
    num_images: 1,
    safety_tolerance: "5",
    output_format: "jpeg",
    enable_safety_checker: false,
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Key ${KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, slug: shot.slug, error: `${res.status} ${(await res.text()).slice(0, 300)}` };
  }
  const json = (await res.json()) as { images?: Array<{ url: string }> };
  const url = json.images?.[0]?.url;
  if (!url) return { ok: false, slug: shot.slug, error: `no image url; body=${JSON.stringify(json).slice(0, 300)}` };

  const imgRes = await fetch(url);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const out = path.join(OUT_DIR, `${shot.slug}.jpg`);
  await fs.writeFile(out, buf);
  return { ok: true, slug: shot.slug, url, out, bytes: buf.length };
}

console.log(`Generating ${SHOTS.length} test frames via flux-pro/v1.1...`);
const results = await Promise.all(SHOTS.map(generate));
for (const r of results) {
  console.log(r.ok ? `  ✓ ${r.slug} → ${r.bytes} bytes` : `  ✗ ${r.slug} — ${r.error}`);
}
await fs.writeFile(
  path.join(OUT_DIR, "manifest.json"),
  JSON.stringify({ endpoint: ENDPOINT, negativePromptShared: NEGATIVE, shots: SHOTS, results }, null, 2)
);
console.log(`\nSaved to ${OUT_DIR}`);
