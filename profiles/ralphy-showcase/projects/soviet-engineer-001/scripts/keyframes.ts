// Generate 6 keyframes via nano-banana-pro/edit using the engineer portrait as identity anchor.

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

async function editImage(prompt: string, imageUrls: string[]): Promise<string> {
  const res = await retryFetch("https://fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
    body: JSON.stringify({
      prompt,
      image_urls: imageUrls,
      aspect_ratio: "9:16",
      resolution: "2K",
      num_images: 1,
      output_format: "png",
    }),
  });
  if (!res.ok) throw new Error(`edit ${res.status} ${(await res.text()).slice(0, 400)}`);
  const j = (await res.json()) as { images?: Array<{ url: string }> };
  const u = j.images?.[0]?.url;
  if (!u) throw new Error(`no url: ${JSON.stringify(j).slice(0, 300)}`);
  return u;
}

async function download(url: string, out: string) {
  const r = await retryFetch(url, { headers: UA });
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(out, buf);
  return buf.length;
}

const PORTRAIT_URL = "https://v3b.fal.media/files/b/0a976b21/uqKZeq3ft1GMXjMEANIG8_XiAq1xpD.png";

const ENGINEER =
  "the Soviet factory engineer in his mid-fifties from the reference photo — same face, same greying hair combed back, same deep-set tired intelligent brown eyes, same trimmed greying moustache, same square jaw and faint wrinkles. Preserve his identity exactly.";

const ANATOMY = "Photorealistic natural human anatomy with exactly five fingers per visible hand. No extra fingers, no deformed limbs.";

const SVEMA_FRAME =
  "The image is presented as a stylized archival photograph with a thin retro frame border containing vertical Cyrillic text 'СВЕМА 35' and 'ФОТОГРАФИЯ' on the edges — matching the style of the reference photo.";

const SOVIET_STYLE =
  "Warm amber Svema 35mm film grain, heavy soft grain, aged paper tones, muted palette of olive, ochre, cream and warm red. Tungsten light sources. Documentary realism, photorealistic. " + SVEMA_FRAME;

type Shot = { slug: string; prompt: string; refs: string[] };

const SHOTS: Shot[] = [
  {
    slug: "clip-01-morning-kitchen",
    refs: [PORTRAIT_URL],
    prompt:
      `Vertical 9:16 archival documentary photograph of a small Soviet kitchen, early winter morning 1978, still dark outside. ` +
      `${ENGINEER} He sits at a small white Formica kitchen table in a white undershirt and grey trousers, holding a faceted гранёный glass of hot tea in a metal подстаканник, steam rising. ` +
      `On the gas stove behind him a blue enameled kettle whistles, faint steam from its spout. ` +
      `His wife, a woman in her early fifties in a floral-patterned quilted housecoat, stands at the counter with her back slightly turned, gently slicing a loaf of dark rye bread with a kitchen knife. ` +
      `A single tungsten ceiling lamp glows warm yellow. Floral wallpaper, an embroidered towel on the wall, a small ticking wall clock showing just before 6 AM. Window dark, frost on the glass. ` +
      ANATOMY + " " + SOVIET_STYLE,
  },
  {
    slug: "clip-02-walk-to-factory",
    refs: [PORTRAIT_URL],
    prompt:
      `Vertical 9:16 Soviet archival documentary photograph, winter pre-dawn, 1978. ` +
      `${ENGINEER} He walks along a snowy sidewalk wearing a dark wool winter coat, a brown fur ушанка hat with the ear-flaps down, wool scarf, black felt boots. His breath fogs the cold air. ` +
      `Behind him, three or four other working men in quilted padded куфайка jackets and ушанка hats walk the same direction, slightly blurred. ` +
      `Yellow sodium street lamps glow in the blue-grey dawn. Silhouettes of tall red-brick factory smokestacks on the horizon, one smokestack emitting a pale plume. Soft falling snow. Footprints in fresh snow. ` +
      `Shot slightly low three-quarter angle from the side, capturing him and the background figures. ` +
      ANATOMY + " " + SOVIET_STYLE,
  },
  {
    slug: "clip-03-shop-floor",
    refs: [PORTRAIT_URL],
    prompt:
      `Vertical 9:16 Soviet archival documentary photograph from inside a 1978 industrial factory shop floor (цех). ` +
      `${ENGINEER} Now wearing a white laboratory coat over a grey shirt and thin dark tie, he stands at a large green-painted metal токарный станок (industrial lathe), his right hand resting on a heavy brass control wheel, his eyes intently watching a steel workpiece spinning in the chuck. ` +
      `Bright overhead industrial fluorescent tube lamps illuminate the shop. Oily metal curl shavings on the grey concrete floor. Dusty wire-reinforced glass factory windows in the background. Other lathes and machines blurred in depth. ` +
      `A red Soviet safety poster on a pillar with correctly-spelled Russian Cyrillic text 'БЕРЕГИ РУКИ'. ` +
      `Medium shot from the side, three-quarter angle, slightly low. ` +
      ANATOMY + " " + SOVIET_STYLE,
  },
  {
    slug: "clip-04-canteen-tray",
    refs: [],
    prompt:
      `Vertical 9:16 top-down overhead archival documentary photograph of a Soviet factory canteen (столовая) lunch tray on a Formica table, 1978. ` +
      `On the rectangular aluminum tray, arranged naturally: ` +
      `a deep white ceramic bowl of thick щи (Russian cabbage soup) with a dollop of sour cream floating, faint steam rising; ` +
      `a white ceramic plate with a single browned котлета (cutlet) next to a mound of mashed potatoes topped with a sprig of fresh dill; ` +
      `a faceted гранёный drinking glass filled with amber dried-fruit компот, a piece of prune visible through the glass; ` +
      `a single thick slice of dark rye bread on the tray; ` +
      `a bent aluminum spoon and fork, a crumpled white paper napkin beside the tray. ` +
      `Warm overhead tungsten canteen light. Blurred edges show the corner of another tray and a worker's elbow in a faded blue shirt at the edge of frame. ` +
      SOVIET_STYLE,
  },
  {
    slug: "clip-05-walk-home-evening",
    refs: [PORTRAIT_URL],
    prompt:
      `Vertical 9:16 Soviet archival documentary photograph, winter evening twilight 1978. ` +
      `${ENGINEER} He walks through a residential courtyard toward a five-story red-brick хрущёвка apartment block, wearing the same dark wool winter coat, fur ушанка and felt boots, carrying a brown leather portfolio briefcase in his right hand. Fresh snow on the ground. ` +
      `On the second floor of the building, one single window glows warm amber from a curtain being lit from inside — a home waiting. Other windows are dark. ` +
      `Yellow sodium courtyard streetlamps, blue-grey evening sky with the last faint pink glow. A small grey cat silhouette crosses the snowy path in the foreground. Falling snow. ` +
      `Shot from behind his shoulder, medium-wide angle, capturing him and the illuminated window ahead. ` +
      ANATOMY + " " + SOVIET_STYLE,
  },
  {
    slug: "clip-06-family-dinner",
    refs: [PORTRAIT_URL],
    prompt:
      `Vertical 9:16 Soviet archival documentary photograph, warm family kitchen at evening dinner, 1978. ` +
      `${ENGINEER} He sits at the head of a small round kitchen table covered with a white embroidered tablecloth, now in just the grey shirt with tie loosened. A calm content expression, not smiling. ` +
      `His wife in a floral patterned housecoat stands beside the table, serving a ladle of steaming картошка с мясом (meat-and-potato stew) from a heavy pot into a white ceramic plate. ` +
      `Two children, a boy about 11 in a school uniform shirt and a girl about 8 with braided hair, sit quietly at the sides of the table, eating calmly. ` +
      `Background: a small black-and-white телевизор on a wooden shelf, its screen glowing with the evening news anchor, a wood-veneer glass cabinet full of crystal glasses, a large patterned ковёр rug hanging on the wall behind. ` +
      `Warm tungsten ceiling lamp, amber light, floral wallpaper. Everyone relaxed. ` +
      `Medium-wide shot from across the table. ` +
      ANATOMY + " " + SOVIET_STYLE,
  },
];

async function main() {
  await fs.mkdir(KEYFRAMES, { recursive: true });
  const results: any[] = [];
  for (const s of SHOTS) {
    console.log(`\n[gen] ${s.slug} (refs: ${s.refs.length})`);
    const t0 = Date.now();
    try {
      const url = await editImage(s.prompt, s.refs);
      const out = path.join(KEYFRAMES, `${s.slug}.png`);
      const bytes = await download(url, out);
      console.log(`  ✓ ${out} (${bytes} bytes) @ ${url}`);
      await logGeneration("soviet-engineer-001", {
        provider: "fal",
        endpoint: "fal-ai/nano-banana-pro/edit",
        kind: "image",
        input: { prompt: s.prompt.slice(0, 200) + "...", image_urls: s.refs, aspect_ratio: "9:16", resolution: "2K" },
        output: { url, local: out, bytes },
        status: "ok",
        latency_ms: Date.now() - t0,
        cost_usd: 0.15,
        note: `${s.slug} keyframe`,
      });
      results.push({ slug: s.slug, ok: true, local: out, fal_url: url, bytes });
    } catch (e: any) {
      console.log(`  ✗ ${s.slug}: ${e.message || e}`);
      await logGeneration("soviet-engineer-001", {
        provider: "fal",
        endpoint: "fal-ai/nano-banana-pro/edit",
        kind: "image",
        input: { prompt: s.prompt.slice(0, 200) + "...", image_urls: s.refs },
        status: "error",
        error: e.message || String(e),
        latency_ms: Date.now() - t0,
        note: `${s.slug} keyframe FAILED`,
      });
      results.push({ slug: s.slug, ok: false, error: e.message || String(e) });
    }
  }
  await fs.writeFile(
    path.join(KEYFRAMES, "keyframes-manifest.json"),
    JSON.stringify({ portrait: PORTRAIT_URL, shots: results }, null, 2)
  );
  console.log("\nDone. Manifest: " + path.join(KEYFRAMES, "keyframes-manifest.json"));
}

main().catch((e) => { console.error(e); process.exit(1); });
