// Regenerate test frames via openai/gpt-image-2 for solutions-metal-001 v3 scenario.
// Usage: node --env-file=.env --experimental-strip-types workspace/projects/solutions-metal-001/scripts/image-sample-v3.ts
import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.FAL_KEY;
if (!KEY) {
  console.error("FAL_KEY missing");
  process.exit(1);
}

const OUT_DIR = path.resolve("workspace/projects/solutions-metal-001/image-samples-v3");
await fs.mkdir(OUT_DIR, { recursive: true });

// Shared fabric descriptor — used whenever the METAL fabric is on-screen.
const FABRIC =
  "heavily crumpled and densely wrinkled matte-black fabric with a faint metallic sheen. " +
  "The surface shows permanent sharp creases and folds going in every direction, as if thick aluminum foil was compressed into a ball and then laminated with black cotton. " +
  "Even flat areas keep a tactile wrinkled texture. Light catches the high points of the creases with a subtle grey-silver gleam. " +
  "The fabric looks engineered and contemporary, not vintage worn cloth — it holds its shape independently.";

const SOVIET_STYLE =
  "Soviet 1974 archival look, warm amber tones, Svema 35mm film grain, soft dust, shallow depth of field, " +
  "natural light from a single window, muted palette of olive, cream and warm ochre. Documentary realism.";

const MODERN_STYLE =
  "Contemporary editorial photography, cold neutral studio light, minimal composition, grey concrete and matte black surfaces, " +
  "muted desaturated palette, clean and quiet — no film grain, no vintage filters, sharp focus.";

// Quality rules to append to every prompt — reduce anatomy/typography failures.
const QUALITY_TAIL =
  "Photorealistic, natural human anatomy with exactly five fingers per hand. Realistic hands are critical. " +
  "No extra fingers. No deformed limbs. No warped text. If any Russian Cyrillic text appears, it must be clearly legible and correctly spelled.";

const SHOTS_ALL_FOR_REFERENCE = [
  {
    slug: "04-commission",
    prompt:
      `Vertical 2:3 archival-look photograph, Soviet 1974. A wood-paneled conference chamber with a long heavy wooden table covered in green felt, water carafes and glasses, closed folders. Three stern men in grey wool 1970s suits sit behind the table, unsmiling. ` +
      `In the foreground, in medium-shot from behind his shoulder, stands an older Soviet engineer in a white lab coat, grey hair, round glasses, holding up a single prototype bucket hat. The prototype bucket hat is made of ${FABRIC.replace(/\.$/, "")}. ` +
      `The atmosphere is formal and awkward. No one is smiling. ` +
      SOVIET_STYLE + " " + QUALITY_TAIL,
  },
  {
    slug: "07-product-stilllife",
    prompt:
      `Vertical 2:3 editorial still life, overhead flat-lay top-down composition. Four pieces of matte black contemporary headwear arranged in a loose rectangle on a raw grey concrete slab with visible hairline cracks and mineral speckles: ` +
      `two identical bucket hats (wide soft brim, crown pinched and wrinkled) in the top row, and two identical structured 6-panel caps with stiff curved visors in the bottom row. Each item has a small polished rectangular metal shield badge stitched onto the front. ` +
      `All four items are made of ${FABRIC} ` +
      `Diffused cold overhead studio light, minimal shadow, high-end product photography, clean negative space between items. No props, no typography, no human hands. ` +
      MODERN_STYLE + " " + QUALITY_TAIL,
  },
];

// OpenAI gpt-image-2 on fal: portrait 9:16-ish → "1024x1536"
const ENDPOINT = "https://fal.run/openai/gpt-image-2";

async function generate(shot: (typeof SHOTS)[number], attempt = 1): Promise<any> {
  const body = {
    prompt: shot.prompt,
    image_size: "portrait_16_9",
    quality: "high",
    num_images: 1,
    output_format: "png",
  };
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Key ${KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
  } catch (e: any) {
    if (attempt < 3) {
      console.log(`  ⟳ ${shot.slug} retry ${attempt + 1} after network error: ${e.message || e}`);
      await new Promise((r) => setTimeout(r, 4000));
      return generate(shot, attempt + 1);
    }
    return { ok: false, slug: shot.slug, error: `network: ${e.message || e}` };
  }

  if (!res.ok) {
    return { ok: false, slug: shot.slug, error: `${res.status} ${(await res.text()).slice(0, 400)}` };
  }
  const json = (await res.json()) as { images?: Array<{ url: string }>; image?: { url: string } };
  const url = json.images?.[0]?.url ?? (json as any).image?.url;
  if (!url) return { ok: false, slug: shot.slug, error: `no image url; body=${JSON.stringify(json).slice(0, 400)}` };

  // Download with retry as well — fal CDN also occasionally times out on first connect.
  async function download(u: string, tries = 3): Promise<Buffer> {
    let lastErr: unknown;
    for (let i = 0; i < tries; i++) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return Buffer.from(await r.arrayBuffer());
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    throw lastErr;
  }
  const buf = await download(url);
  const ext = (body as any).output_format === "png" ? "png" : "jpg";
  const out = path.join(OUT_DIR, `${shot.slug}.${ext}`);
  await fs.writeFile(out, buf);
  return { ok: true, slug: shot.slug, url, out, bytes: buf.length };
}

// Only pending shot this run — already have 01, 02, 04 in JPEG.
const SHOTS = SHOTS_ALL_FOR_REFERENCE.filter((s) => s.slug === "07-product-stilllife");

console.log(`Generating ${SHOTS.length} test frames via openai/gpt-image-2 (PNG, sequential)...`);
const results: Array<Awaited<ReturnType<typeof generate>>> = [];
for (const s of SHOTS) {
  const r = await generate(s);
  console.log(r.ok ? `  ✓ ${r.slug} → ${r.out} (${r.bytes} bytes)` : `  ✗ ${r.slug} — ${r.error}`);
  results.push(r);
}
await fs.writeFile(
  path.join(OUT_DIR, "manifest.json"),
  JSON.stringify({ endpoint: ENDPOINT, shots: SHOTS, results }, null, 2)
);
console.log(`\nAll saved to ${OUT_DIR}`);
