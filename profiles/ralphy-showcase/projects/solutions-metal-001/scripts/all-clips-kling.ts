// Submit all 8 scenes to Kling v3 Pro image-to-video in parallel, poll, download.
// generate_audio=false because we overlay ElevenLabs VO in Remotion.

import fs from "node:fs/promises";
import path from "node:path";

const KEY = process.env.FAL_KEY;
if (!KEY) { console.error("FAL_KEY missing"); process.exit(1); }

const UA = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
};

const PROJECT = path.resolve("workspace/projects/solutions-metal-001");
const RENDERS = path.join(PROJECT, "renders");
await fs.mkdir(RENDERS, { recursive: true });

async function retryFetch(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(240_000) }); }
    catch (e: any) { last = e; const w = 2500 * (i + 1); console.log(`    ⟳ retry ${i+1}/${attempts} in ${w}ms — ${e.message}`); await new Promise(r => setTimeout(r, w)); }
  }
  throw last;
}

type ClipDef = { slug: string; durationSec: number; startUrl: string; motion: string };

const NEGATIVE = "blur, distort, low quality, camera shake, handheld, visible speaking mouth, talking face, dialog, subtitles, text overlays, modern objects in Soviet scenes, plastic, electric modern lighting, warped hands, extra fingers";

const PRESERVE_SOVIET = "Preserve the warm amber Svema 35mm film grain and the СВЕМА 35 archival frame border from the start image. No camera movement unless explicitly stated.";
const PRESERVE_MODERN = "Preserve the cold neutral editorial studio look from the start image. Sharp focus, clean quiet composition, no grain.";

const CLIPS: ClipDef[] = [
  {
    slug: "clip-01",
    durationSec: 9,
    startUrl: "https://v3b.fal.media/files/b/0a974465/Z8LIYod5Bu6iQWwkfCTjV_qo92RaVD.png",
    motion: `Overhead locked-off static camera. The grandfather's weathered hands stay on the open 1974 notebook. His right index finger moves slowly, deliberately, from the top of the hand-drawn fabric cross-section diagram down to the date line at the bottom, tracing the drawing with care. The amber desk lamp light stays warm and steady; tiny dust motes drift very slowly through the beam. The paper breathes minutely. No other motion, no other people. ${PRESERVE_SOVIET}`,
  },
  {
    slug: "clip-02",
    durationSec: 11,
    startUrl: "https://v3b.fal.media/files/b/0a974485/fdowGHnNRuzZwuyuA-FOA_caMM0LlM.png",
    motion: `Medium static shot. The grandfather leans over the brass microscope. Over 11 seconds he slowly adjusts the focus knob with his right hand, leans back an inch to regard a strip of black crinkled fabric beside him on the bench, then returns his eye to the eyepiece. The liquid in the amber-filled beaker swirls faintly. Snow drifts softly past the high window behind. His body moves calmly, minimally. No zoom, no pan. ${PRESERVE_SOVIET}`,
  },
  {
    slug: "clip-03",
    durationSec: 7,
    startUrl: "https://v3b.fal.media/files/b/0a97448b/rxeBlW_0h8PxvgEtIsBM-_qrJdBGBm.png",
    motion: `Top-down static overhead camera. The composition of three black fabric samples on concrete remains exactly as in the start image. A faint draft causes the corners of the white paper labels ("образец 1", "образец 2", "образец 3") to flutter gently. The origami bird sample twitches minutely. The square sample has minute surface shimmer as light catches its wrinkled metallic fabric. No camera movement. ${PRESERVE_SOVIET}`,
  },
  {
    slug: "clip-04",
    durationSec: 10,
    startUrl: "https://v3b.fal.media/files/b/0a97448e/isb62U8utNCR842Q9ravM_A2tPyXeS.png",
    motion: `Very slow, very subtle dolly-in from the engineer's shoulder-POV toward the three commissioners sitting behind the green-felt table. Over 10 seconds the camera creeps forward a few centimeters. The commissioners shift only slightly — the middle one writes a single line in his notebook, the right one adjusts his glasses, the left one stays still. The engineer's right hand holding the prototype bucket hat stays steady in the foreground. Formal, awkward silence. ${PRESERVE_SOVIET}`,
  },
  {
    slug: "clip-05",
    durationSec: 5,
    startUrl: "https://v3b.fal.media/files/b/0a974493/ChEY4K39TtTFz50A9rayU_BT4foo06.png",
    motion: `Close-up static camera on the open wooden desk drawer. The grandfather's hand in its white coat cuff releases the grey notebook, then withdraws gently up and out of frame. Over the next 3 seconds the drawer itself slides slowly closed about two-thirds of the way, stopping with a soft wooden thud. Dust motes drift in warm side-light. No other motion. ${PRESERVE_SOVIET}`,
  },
  {
    slug: "clip-06",
    durationSec: 7,
    startUrl: "https://v3b.fal.media/files/b/0a974434/OZPvGGriTuWwI8zxBlUzw_RUaOrLPH.png",
    motion: `Locked-off medium portrait shot. Gleb sits at the concrete table with his hand on the open notebook, initially looking down at the page. Over 7 seconds he slowly lifts his gaze up to the camera, direct and calm, with one natural blink midway. His breathing is natural and slow. His hair shifts only slightly as he moves his head. No camera movement. ${PRESERVE_MODERN}`,
  },
  {
    slug: "clip-07",
    durationSec: 8,
    startUrl: "https://v3b.fal.media/files/b/0a974497/1_vPdMyW4dsS1osC_TZUK_CHjbcNiv.png",
    motion: `Locked-off medium chest-up shot. Gleb wears the black crumpled METAL bucket hat and keeps looking directly into the camera with a calm, composed expression. Over 8 seconds he breathes naturally, has one slow natural blink around the 4-second mark, and his hair shifts minutely from his breath. No smile. No camera movement. No zoom. The crumpled metallic fabric of the hat catches the light slightly as his head holds still. ${PRESERVE_MODERN}`,
  },
  {
    slug: "clip-08",
    durationSec: 8,
    startUrl: "https://v3b.fal.media/files/b/0a97449f/mzvQvXYwKn3ENwlnd95iV_69hETXiP.png",
    motion: `Top-down overhead camera begins tight on the notebook and bucket hat on the concrete slab exactly as in the start image. Over 8 seconds the camera performs an extremely slow, smooth vertical dolly upward, revealing slightly more of the surrounding concrete and the empty negative space between the two objects. Neither object moves. No other motion. ${PRESERVE_MODERN}`,
  },
];

// Submit all
const jobs: Array<{ slug: string; request_id: string; endpoint: string; durationSec: number }> = [];
console.log(`Submitting ${CLIPS.length} Kling v3 Pro jobs in parallel...`);
await Promise.all(CLIPS.map(async (clip) => {
  const res = await retryFetch("https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video", {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
    body: JSON.stringify({
      start_image_url: clip.startUrl,
      prompt: clip.motion,
      duration: String(clip.durationSec),
      generate_audio: false,
      cfg_scale: 0.55,
      negative_prompt: NEGATIVE,
    }),
  });
  if (!res.ok) { console.log(`  ✗ ${clip.slug} submit ${res.status}: ${(await res.text()).slice(0, 400)}`); return; }
  const j = (await res.json()) as { request_id: string };
  console.log(`  ↑ ${clip.slug} (${clip.durationSec}s) → ${j.request_id}`);
  jobs.push({ slug: clip.slug, request_id: j.request_id, endpoint: "fal-ai/kling-video/v3/pro/image-to-video", durationSec: clip.durationSec });
}));

await fs.writeFile(path.join(RENDERS, "kling-jobs.json"), JSON.stringify({ submittedAt: new Date().toISOString(), jobs }, null, 2));
console.log(`\n${jobs.length}/${CLIPS.length} submitted. Manifest: ${path.join(RENDERS, "kling-jobs.json")}`);
console.log(`\nPoll with action='status' and download when COMPLETED.`);
