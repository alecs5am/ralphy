// Generate remaining 6 keyframes (Clip 2,3,4,5,7,8) via nano-banana-pro/edit at 2K PNG.
// Uploads two more reference files (fabric three-samples, bucket-front cap) then runs the 6 edits in order.

import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.FAL_KEY;
if (!KEY) { console.error("FAL_KEY missing"); process.exit(1); }

const UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};
const PROJECT = path.resolve("workspace/projects/solutions-metal-001");
const KEYFRAMES = path.join(PROJECT, "keyframes");
await fs.mkdir(KEYFRAMES, { recursive: true });

async function retryFetch(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(240_000) }); }
    catch (e: any) { last = e; const w = 2500 * (i + 1); console.log(`    ⟳ retry ${i+1}/${attempts} in ${w}ms — ${e.message}`); await new Promise(r => setTimeout(r, w)); }
  }
  throw last;
}

async function uploadToFal(filePath: string): Promise<string> {
  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const ct = ext === ".png" ? "image/png" : "image/jpeg";
  const init = await retryFetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
    body: JSON.stringify({ file_name: name, content_type: ct }),
  });
  if (!init.ok) throw new Error(`init ${init.status}`);
  const j = (await init.json()) as { upload_url: string; file_url: string };
  const bytes = await fs.readFile(filePath);
  const put = await retryFetch(j.upload_url, { method: "PUT", headers: { "Content-Type": ct, ...UA }, body: bytes });
  if (!put.ok) throw new Error(`put ${put.status}`);
  return j.file_url;
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

// ---- Pre-uploaded reference URLs from previous runs
const REF = {
  grandfather: "https://v3b.fal.media/files/b/0a974434/N8AjVvrDjZ8tFi9kDMmYh_grandfather-portrait-01.png",
  gleb1: "https://v3b.fal.media/files/b/0a97442f/ReT1cKSNOCuqbyI0hCnmy_gleb-01-fullbody-shirt-tie.png",
  gleb2: "https://v3b.fal.media/files/b/0a97442f/kLdcYw57PRxOYDD0zXz9-_gleb-02-mugshot-duo.png",
  gleb3: "https://v3b.fal.media/files/b/0a974430/axa3xf120VWL9RTS2fWex_gleb-03-adidas-hair-over-face.png",
  clip01notebook: "https://v3b.fal.media/files/b/0a974465/Z8LIYod5Bu6iQWwkfCTjV_qo92RaVD.png",
};

// ---- Upload missing references
console.log("[pre] uploading fabric & cap reference photos...");
const fabricUrl = await uploadToFal(path.join(PROJECT, "references/products/fabric/three-samples.png"));
console.log(`  ✓ fabric: ${fabricUrl}`);
const bucketUrl = await uploadToFal(path.join(PROJECT, "references/products/caps/bucket-front.png"));
console.log(`  ✓ bucket-front: ${bucketUrl}`);

// ---- Shared prompt fragments
const SVEMA_FRAME =
  "The image is presented as a stylized archival photograph with a thin retro frame border containing vertical Cyrillic text 'СВЕМА 35' and 'ФОТОГРАФИЯ' on the edges — matching the style of the reference photos.";

const SOVIET_STYLE =
  "Warm amber Svema 35mm film grain, heavy soft grain, aged paper, muted palette of olive, ochre, cream and warm red. Tungsten light sources. Documentary realism, photorealistic. " + SVEMA_FRAME;

const MODERN_STYLE =
  "Contemporary editorial photography, cold neutral studio light, sharp focus, clean quiet composition, muted desaturated palette, raw grey concrete and matte black surfaces. No film grain, no vintage filters, no archival frame.";

const FABRIC =
  "heavily crumpled and densely wrinkled matte-black fabric with a faint metallic sheen, permanent sharp creases going in every direction, as if thick aluminum foil was compressed and laminated with black cotton, holding its shape independently";

const GRANDFATHER =
  "the Soviet textile engineer in his mid to late fifties from the reference photo — same face, same greying hair combed back, same deep-set tired intelligent eyes, round wire-frame glasses, trimmed greying moustache, weathered face, white laboratory coat over grey shirt and thin dark tie. Preserve his identity exactly.";

const GLEB =
  "Gleb Kostin — the young slim man in the reference photos in his mid-twenties with messy medium-length layered brown hair with subtle blond highlights falling heavily over his forehead and partly covering his eyes, pale skin, thin delicate jawline, faint light moustache. Preserve his face and hairstyle identity exactly.";

const ANATOMY = "Photorealistic natural human anatomy with exactly five fingers per visible hand. No extra fingers, no deformed limbs.";

// ---- 6 keyframes to generate
const SHOTS: Array<{ slug: string; prompt: string; refs: string[] }> = [
  {
    slug: "clip-02-lab-microscope",
    refs: [REF.grandfather],
    prompt:
      `Vertical 9:16 wide documentary-style photograph from a Soviet textile research laboratory, 1974. ${GRANDFATHER} ` +
      `He leans over a large brass optical microscope on a wooden workbench, intensely focused on a fabric sample under the lens. ` +
      `On the bench: glass pipettes in a wooden rack, small strips of ${FABRIC}, laboratory beakers with amber liquid, paper notes. ` +
      `White glossy ceramic tile walls. Soft snow visible through a narrow high window on the right. A faded Soviet poster in Cyrillic on the wall. ` +
      ANATOMY + " " + SOVIET_STYLE,
  },
  {
    slug: "clip-03-three-samples",
    refs: [fabricUrl],
    prompt:
      `Reinterpret the exact composition of the reference photo as a stylized Soviet archival documentary photograph, 1974. ` +
      `Preserve the exact arrangement and all details from the reference: three black fabric samples on a grey concrete slab — crumpled ball on the left, flat wrinkled square in the center, folded origami bird on the right. ` +
      `Below each sample: a small white handwritten paper tag taped to the concrete, reading in Cyrillic "образец 1", "образец 2", "образец 3" — legible correctly-spelled Russian. ` +
      `Each sample is ${FABRIC}. ` +
      `Apply warm amber Svema 35mm film grain, slight vignetting, aged paper tags, muted desaturated palette typical of 1974 archival photography. ` +
      SVEMA_FRAME,
  },
  {
    slug: "clip-04-commission",
    refs: [REF.grandfather],
    prompt:
      `Vertical 9:16 Soviet 1974 archival photograph of a presentation to a ministry commission. ` +
      `Setting: a wood-paneled conference room, a long heavy wooden table covered in dark green felt, crystal water carafes, glasses, closed dark leather folders, pencils. ` +
      `Three stern middle-aged men in grey 1970s wool suits with thin ties sit behind the table, unsmiling, one writing notes. ` +
      `In the foreground, seen from behind his shoulder, ${GRANDFATHER} holds up a single prototype bucket hat made of ${FABRIC}. ` +
      `A red lacquered plaque on the wall behind the commission: "СССР · МИНЛЕГПРОМ · МОСКВА · 1974" in clean correctly-spelled Russian Cyrillic. ` +
      `Formal, awkward, quiet atmosphere. No one is smiling. ` +
      ANATOMY + " " + SOVIET_STYLE,
  },
  {
    slug: "clip-05-notebook-in-drawer",
    refs: [REF.clip01notebook],
    prompt:
      `Vertical 9:16 Soviet 1974 archival photograph. An older hand in a white lab-coat cuff places the same grey cloth-bound notebook from the reference photo at the bottom of an open wooden desk drawer. ` +
      `The same notebook — grey linen cover, frayed edges — is being gently set down among older papers, pencils, a small manila file folder tied with cotton string, a faded lab pass. ` +
      `Close-up, slightly overhead angle. The drawer is wooden with a brass keyhole, the interior worn from decades of use. ` +
      `Warm amber tungsten side-light from the right, slight dust motes visible. This is the moment of filing away the research and forgetting it. ` +
      ANATOMY + " " + SOVIET_STYLE,
  },
  {
    slug: "clip-07-gleb-wears-cap",
    refs: [REF.gleb1, REF.gleb2, REF.gleb3, bucketUrl],
    prompt:
      `Vertical 9:16 contemporary editorial portrait photograph, present day. ` +
      `${GLEB} He stands in a minimalist modern workshop in front of a raw grey concrete wall with softly blurred matte-black steel industrial shelving holding rolls of ${FABRIC} in the background. ` +
      `He wears a plain black fine-knit turtleneck sweater. ` +
      `On his head he wears the exact matte-black METAL bucket hat from the cap reference photo — crumpled, heavily wrinkled, with the small polished metal shield badge visible on the front. The hat preserves its distinctive crinkled metallic-fabric surface from the reference. ` +
      `He looks directly into the camera, calm and confident, reserved introverted posture, no smile. Medium shot from the mid-chest up, slight three-quarter angle. ` +
      ANATOMY + " " + MODERN_STYLE,
  },
  {
    slug: "clip-08-still-life-notebook-cap",
    refs: [REF.clip01notebook, bucketUrl],
    prompt:
      `Vertical 9:16 overhead top-down editorial still life photograph, present day. ` +
      `On a raw grey concrete slab with visible hairline cracks and mineral speckles: ` +
      `on the left, the same grey cloth-bound Soviet notebook from the first reference photo, open to the fabric cross-section diagram page (same notebook, same diagram, same Cyrillic handwriting). ` +
      `On the right, the same matte-black METAL bucket hat from the second reference photo — crumpled, wrinkled fabric with visible permanent creases, polished metal shield badge facing up. ` +
      `A small amount of empty negative space between the two objects. ` +
      `No hands, no props beyond these two objects, no typography overlays. ` +
      `Cold neutral overhead studio light, minimal shadow. ${MODERN_STYLE}`,
  },
];

// ---- Run sequentially
const results: any[] = [];
for (const s of SHOTS) {
  console.log(`\n[gen] ${s.slug} (refs: ${s.refs.length})`);
  try {
    const url = await editImage(s.prompt, s.refs);
    const out = path.join(KEYFRAMES, `${s.slug}.png`);
    const bytes = await download(url, out);
    console.log(`  ✓ ${out} (${bytes} bytes)`);
    console.log(`    fal url: ${url}`);
    results.push({ slug: s.slug, ok: true, local: out, fal_url: url, bytes });
  } catch (e: any) {
    console.log(`  ✗ ${s.slug}: ${e.message || e}`);
    results.push({ slug: s.slug, ok: false, error: e.message || String(e) });
  }
}

await fs.writeFile(
  path.join(KEYFRAMES, "keyframes-manifest.json"),
  JSON.stringify(
    {
      references: { ...REF, fabric: fabricUrl, bucket_front: bucketUrl },
      shots: results,
    },
    null,
    2
  )
);
console.log("\nAll keyframes done. Manifest: " + path.join(KEYFRAMES, "keyframes-manifest.json"));
