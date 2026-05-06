// Stage 2 reference prep + Clip 1 keyframe generation.
//
// 1. Upload Gleb Kostin's 3 reference photos to fal CDN.
// 2. Generate grandfather reference portrait (nano-banana-pro text-to-image, 2K PNG).
// 3. Upload grandfather reference to fal CDN.
// 4. Generate Clip 1 keyframe using nano-banana-pro/edit with Gleb's 3 photos as character anchors.
//
// Usage: node --env-file=.env --experimental-strip-types workspace/projects/solutions-metal-001/scripts/refs-and-clip1.ts

import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.FAL_KEY;
if (!KEY) {
  console.error("FAL_KEY missing");
  process.exit(1);
}

const PROJECT = path.resolve("workspace/projects/solutions-metal-001");
const REFS = path.join(PROJECT, "references");
const KEYFRAMES = path.join(PROJECT, "keyframes");
await fs.mkdir(KEYFRAMES, { recursive: true });

const UA = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

// fal CDN and rest.alpha.fal.ai occasionally time out on first TCP connect.
// Wrap every fetch call with retry.
async function retryFetch(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(240_000) });
    } catch (e: any) {
      lastErr = e;
      const wait = 2500 * (i + 1);
      console.log(`    ⟳ retry ${i + 1}/${attempts} for ${url.slice(0, 60)} in ${wait}ms — ${e?.message || e}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// --- Helpers ----------------------------------------------------------------

async function uploadToFal(filePath: string): Promise<string> {
  const name = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";

  // 1. initiate
  const initRes = await retryFetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
    body: JSON.stringify({ file_name: name, content_type: contentType }),
  });
  if (!initRes.ok) throw new Error(`upload init failed: ${initRes.status} ${(await initRes.text()).slice(0, 300)}`);
  const init = (await initRes.json()) as { upload_url: string; file_url: string };

  // 2. PUT bytes
  const bytes = await fs.readFile(filePath);
  const put = await retryFetch(init.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType, ...UA },
    body: bytes,
  });
  if (!put.ok) throw new Error(`upload PUT failed: ${put.status} ${(await put.text()).slice(0, 300)}`);

  return init.file_url;
}

async function generateNanoBananaProText(prompt: string, opts: { aspect_ratio: string; resolution?: string }) {
  const res = await retryFetch("https://fal.run/fal-ai/nano-banana-pro", {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
    body: JSON.stringify({
      prompt,
      aspect_ratio: opts.aspect_ratio,
      resolution: opts.resolution ?? "2K",
      num_images: 1,
      output_format: "png",
    }),
  });
  if (!res.ok) throw new Error(`text-to-image failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as { images?: Array<{ url: string }> };
  const u = json.images?.[0]?.url;
  if (!u) throw new Error(`no image url; body=${JSON.stringify(json).slice(0, 400)}`);
  return u;
}

async function generateNanoBananaProEdit(prompt: string, imageUrls: string[], opts: { aspect_ratio: string; resolution?: string }) {
  const res = await retryFetch("https://fal.run/fal-ai/nano-banana-pro/edit", {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
    body: JSON.stringify({
      prompt,
      image_urls: imageUrls,
      aspect_ratio: opts.aspect_ratio,
      resolution: opts.resolution ?? "2K",
      num_images: 1,
      output_format: "png",
    }),
  });
  if (!res.ok) throw new Error(`edit failed: ${res.status} ${(await res.text()).slice(0, 400)}`);
  const json = (await res.json()) as { images?: Array<{ url: string }> };
  const u = json.images?.[0]?.url;
  if (!u) throw new Error(`no image url; body=${JSON.stringify(json).slice(0, 400)}`);
  return u;
}

async function downloadToFile(url: string, out: string) {
  const r = await retryFetch(url, { headers: UA });
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(out, buf);
  return { path: out, bytes: buf.length };
}

// --- Character prompt fragments --------------------------------------------

const GLEB_TOKEN =
  "A young slim man in his mid-twenties (Gleb Kostin). " +
  "His defining feature is messy medium-length layered brown hair with subtle blond highlights that falls heavily over his forehead and partly covers his eyes. " +
  "Pale skin, thin delicate jawline, faint light moustache just beginning. Narrow shoulders, reserved introverted posture. " +
  "The hair is asymmetric and unstyled, slightly covering one side of the face. " +
  "Keep the face and hair in the reference photos — same person, same hairstyle.";

const GRANDFATHER_TOKEN =
  "Soviet textile engineer in his mid to late fifties. Greying hair combed back, deep-set tired but intelligent eyes, " +
  "round wire-frame glasses, a trimmed greying moustache and light stubble, weathered face with visible lines and pores. " +
  "White laboratory coat over a simple grey shirt and thin dark tie. Serious, thoughtful expression. " +
  "The man looks like an accomplished Soviet scientist, not an actor in costume.";

const FABRIC_TOKEN =
  "heavily crumpled and densely wrinkled matte-black fabric with a faint metallic sheen, " +
  "permanent sharp creases going in every direction, as if thick aluminum foil was compressed into a ball and laminated with black cotton, " +
  "the fabric holds its shape independently.";

// --- Main -------------------------------------------------------------------

const manifest: any = { steps: [] };

// Step 1: upload Gleb references
console.log("[1/4] Uploading Gleb reference photos to fal CDN...");
const glebFiles = [
  path.join(REFS, "characters/gleb-kostin/gleb-01-fullbody-shirt-tie.png"),
  path.join(REFS, "characters/gleb-kostin/gleb-02-mugshot-duo.png"),
  path.join(REFS, "characters/gleb-kostin/gleb-03-adidas-hair-over-face.png"),
];
const glebUrls: string[] = [];
for (const f of glebFiles) {
  const u = await uploadToFal(f);
  console.log(`  ✓ ${path.basename(f)} → ${u}`);
  glebUrls.push(u);
}
manifest.gleb_urls = glebUrls;

// Step 2: generate grandfather portrait
console.log("\n[2/4] Generating grandfather reference portrait (nano-banana-pro, 2K)...");
const grandfatherPrompt =
  `Archival-style studio portrait photograph, vertical 2:3 composition, Soviet 1974. ` +
  `${GRANDFATHER_TOKEN} ` +
  `He stands against a muted olive-grey painted wall, looking slightly off-camera with a contemplative expression. ` +
  `Warm amber Svema 35mm film grain, soft natural light from a single window on the left, shallow depth of field. ` +
  `Documentary realism, not stylized or cartoonish. ` +
  `Photorealistic, natural human anatomy with exactly five fingers per visible hand. No deformities, no warped features. ` +
  `If any text appears in background (posters, labels), it must be clean correctly-spelled Russian Cyrillic.`;
const grandfatherUrl = await generateNanoBananaProText(grandfatherPrompt, { aspect_ratio: "9:16", resolution: "2K" });
const grandfatherLocal = path.join(REFS, "characters/grandfather/grandfather-portrait-01.png");
await downloadToFile(grandfatherUrl, grandfatherLocal);
console.log(`  ✓ saved: ${grandfatherLocal}`);
manifest.grandfather_local = grandfatherLocal;

// Step 3: upload grandfather as reference (for later scenes)
console.log("\n[3/4] Uploading grandfather reference to fal CDN...");
const grandfatherFalUrl = await uploadToFal(grandfatherLocal);
console.log(`  ✓ ${grandfatherFalUrl}`);
manifest.grandfather_url = grandfatherFalUrl;

// Step 4: Clip 1 keyframe — narrator with notebook, using Gleb's face as anchor
console.log("\n[4/4] Generating Clip 1 keyframe via nano-banana-pro/edit with Gleb's 3 ref photos...");
const clip1Prompt =
  `Cinematic vertical 9:16 portrait photograph. Setting: a minimalist contemporary atelier-workshop with raw grey concrete walls and matte-black steel industrial shelving in soft blurred background; on the shelves are neatly stacked rolls of black ${FABRIC_TOKEN} ` +
  `Foreground: ${GLEB_TOKEN} ` +
  `He sits at a heavy raw-concrete table, wearing a plain black fine-knit turtleneck sweater. ` +
  `He holds open a worn 1970s Soviet-era cloth-bound notebook with a grey linen cover; the open page shows a hand-drawn technical diagram of a woven fabric cross-section and neat handwritten Cyrillic engineering notes (legible, correctly spelled Russian). ` +
  `His hands rest naturally on the notebook, fingers clearly visible and correctly formed (exactly five fingers on each hand). ` +
  `He looks slightly off-camera, composed and thoughtful, hair falling across his forehead as in the reference photos. ` +
  `Cold neutral studio light from above-left. Contemporary editorial photography, sharp focus, muted desaturated palette, clean quiet composition. No vintage film look, no grain, no filters. ` +
  `Preserve Gleb's face, hairstyle and body identity exactly as in the reference photos — this is the same person, just placed in a new setting.`;
const clip1Url = await generateNanoBananaProEdit(clip1Prompt, glebUrls, { aspect_ratio: "9:16", resolution: "2K" });
const clip1Local = path.join(KEYFRAMES, "clip-01-narrator-notebook.png");
await downloadToFile(clip1Url, clip1Local);
console.log(`  ✓ saved: ${clip1Local}`);
manifest.clip1_local = clip1Local;
manifest.clip1_url = clip1Url;

await fs.writeFile(path.join(KEYFRAMES, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nAll done. Manifest: ${path.join(KEYFRAMES, "manifest.json")}`);
