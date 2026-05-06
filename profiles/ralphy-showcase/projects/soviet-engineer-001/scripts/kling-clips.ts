// Submit all 6 Kling v3 Pro i2v jobs in parallel, poll until done, download MP4s.

import fs from "node:fs/promises";
import path from "node:path";
import { logGeneration } from "../../../../cli/lib/gen-log.ts";

const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY missing");

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" };
const PROJECT = path.resolve("workspace/projects/soviet-engineer-001");
const CLIPS_DIR = path.join(PROJECT, "assets/clips");

async function retryFetch(url: string, init: RequestInit, attempts = 5): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(240_000) }); }
    catch (e: any) { last = e; const w = 2500 * (i + 1); console.log(`    ⟳ retry ${i+1}/${attempts} in ${w}ms — ${e.message}`); await new Promise(r => setTimeout(r, w)); }
  }
  throw last;
}

type Shot = { slug: string; image_url: string; duration: number; prompt: string };

const NEG = "blur, distort, low quality, camera shake, handheld, visible speaking mouth, talking face, dialog, subtitles, text overlays, warped hands, extra fingers, modern objects in Soviet scenes, plastic, electric modern lighting";

const PRESERVE = "Preserve the warm amber Svema 35mm film grain and the СВЕМА 35 archival frame border from the start image.";

const SHOTS: Shot[] = [
  {
    slug: "clip-01-morning-kitchen",
    image_url: "https://v3b.fal.media/files/b/0a976b2d/2lv4R13cNj2ijj1748_vm_hAL8A5D0.png",
    duration: 8,
    prompt: `Locked-off static camera. Steam gently rises from the tea glass. Wife slowly slices one slice of bread with the knife. Engineer calmly lifts the glass to his lips, takes a slow sip. Kettle emits very faint steam from its spout. ${PRESERVE} No camera movement.`,
  },
  {
    slug: "clip-02-walk-to-factory",
    image_url: "https://v3b.fal.media/files/b/0a976b32/P_VGgYwAXEim1uGOCcjbD_cE4JOVkD.png",
    duration: 7,
    prompt: `Slow forward dolly tracking shot from the side following the engineer walking steadily along the snowy sidewalk. Soft snow falls continuously. Other workers in the background walk in the same direction. Engineer's breath fogs in the cold air. Yellow streetlamp slightly flickers. ${PRESERVE}`,
  },
  {
    slug: "clip-03-shop-floor",
    image_url: "https://v3b.fal.media/files/b/0a976b36/iexV_LpJJxH_jdtrzajcm_EIKujebw.png",
    duration: 8,
    prompt: `Locked-off static medium shot. The steel workpiece in the lathe chuck rotates continuously. Engineer slowly turns the brass control wheel with one hand, watches intently. Metal shavings curl off the workpiece. Faint steam and fluorescent light flicker. ${PRESERVE} No camera movement.`,
  },
  {
    slug: "clip-04-canteen-tray",
    image_url: "https://v3b.fal.media/files/b/0a976b49/oEVnArS0-mVgiY0_t9v1s_7TZChqjk.png",
    duration: 8,
    prompt: `Locked-off overhead top-down static camera. Steam gently rises from the hot cabbage soup. The surface of the dried-fruit компот in the faceted glass slightly trembles. The sour cream on top of the soup slowly melts and drifts. Ambient blurred motion of other trays and a worker's elbow at edge of frame. ${PRESERVE} No camera movement. No hands enter the frame.`,
  },
  {
    slug: "clip-05-walk-home-evening",
    image_url: "https://v3b.fal.media/files/b/0a976b3d/XY3S1TNT5UlZCkLxMa3oI_tqjlTHsT.png",
    duration: 7,
    prompt: `Slow forward dolly following the engineer from behind as he walks through the snowy courtyard toward the apartment building. The single warm amber window glows steadily ahead. Soft snow falls. A small cat silhouette walks briefly across the foreground path. His breath fogs. ${PRESERVE}`,
  },
  {
    slug: "clip-06-family-dinner",
    image_url: "https://v3b.fal.media/files/b/0a976b41/TYLV7bM0SdKEQrXG_qghS_DC6w2sPK.png",
    duration: 9,
    prompt: `Locked-off static medium-wide shot. Steam rises gently from the serving pot. Wife slowly ladles one serving of stew onto the plate, then sits down calmly. Children quietly eat, one takes a slow bite. Engineer picks up his fork calmly. Faint flicker of the black-and-white TV reflects on the wall. Calm domestic atmosphere. ${PRESERVE} No camera movement.`,
  },
];

type QueueSubmit = { request_id: string; status_url: string; response_url: string };

async function submit(s: Shot): Promise<QueueSubmit> {
  const res = await retryFetch("https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video", {
    method: "POST",
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", ...UA },
    body: JSON.stringify({
      prompt: s.prompt,
      image_url: s.image_url,
      duration: String(s.duration),
      aspect_ratio: "9:16",
      cfg_scale: 0.55,
      negative_prompt: NEG,
      generate_audio: false,
    }),
  });
  if (!res.ok) throw new Error(`submit ${s.slug} ${res.status} ${(await res.text()).slice(0, 400)}`);
  const j = (await res.json()) as QueueSubmit;
  return j;
}

async function poll(q: QueueSubmit, slug: string): Promise<string> {
  const deadline = Date.now() + 25 * 60 * 1000; // 25 min max
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 15_000));
    const st = await retryFetch(q.status_url, { headers: { Authorization: `Key ${KEY}`, ...UA } });
    if (!st.ok) { console.log(`  [${slug}] status ${st.status} — retrying`); continue; }
    const j = (await st.json()) as { status: string };
    console.log(`  [${slug}] ${j.status}`);
    if (j.status === "COMPLETED") {
      const r = await retryFetch(q.response_url, { headers: { Authorization: `Key ${KEY}`, ...UA } });
      const body = (await r.json()) as { video?: { url: string } };
      const u = body.video?.url;
      if (!u) throw new Error(`no video url in response: ${JSON.stringify(body).slice(0, 300)}`);
      return u;
    }
    if (j.status === "ERROR" || j.status === "FAILED") {
      const r = await retryFetch(q.response_url, { headers: { Authorization: `Key ${KEY}`, ...UA } });
      throw new Error(`[${slug}] job failed: ${(await r.text()).slice(0, 500)}`);
    }
  }
  throw new Error(`[${slug}] polling timed out`);
}

async function download(url: string, out: string) {
  const r = await retryFetch(url, { headers: UA });
  const buf = Buffer.from(await r.arrayBuffer());
  await fs.writeFile(out, buf);
  return buf.length;
}

async function main() {
  await fs.mkdir(CLIPS_DIR, { recursive: true });
  console.log(`[submit] ${SHOTS.length} jobs...`);
  const submits = await Promise.all(SHOTS.map(async s => {
    const q = await submit(s);
    console.log(`  ✓ ${s.slug} → ${q.request_id}`);
    return { s, q, startedAt: Date.now() };
  }));

  console.log("\n[poll] waiting for completions...");
  const results = await Promise.all(submits.map(async ({ s, q, startedAt }) => {
    try {
      const videoUrl = await poll(q, s.slug);
      const out = path.join(CLIPS_DIR, `${s.slug}.mp4`);
      const bytes = await download(videoUrl, out);
      console.log(`  ✓ ${s.slug} → ${out} (${bytes} bytes)`);
      await logGeneration("soviet-engineer-001", {
        provider: "fal",
        endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
        kind: "video",
        input: { prompt: s.prompt.slice(0, 200) + "...", image_url: s.image_url, duration: s.duration, aspect_ratio: "9:16", cfg_scale: 0.55 },
        output: { url: videoUrl, local: out, bytes },
        status: "ok",
        latency_ms: Date.now() - startedAt,
        cost_usd: 0.14 * s.duration,
        request_id: q.request_id,
        note: `${s.slug} Kling i2v`,
      });
      return { slug: s.slug, ok: true, local: out, url: videoUrl, bytes };
    } catch (e: any) {
      console.log(`  ✗ ${s.slug}: ${e.message || e}`);
      await logGeneration("soviet-engineer-001", {
        provider: "fal",
        endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
        kind: "video",
        input: { image_url: s.image_url, duration: s.duration },
        status: "error",
        error: e.message || String(e),
        latency_ms: Date.now() - startedAt,
        request_id: q.request_id,
        note: `${s.slug} FAILED`,
      });
      return { slug: s.slug, ok: false, error: e.message || String(e) };
    }
  }));

  await fs.writeFile(path.join(CLIPS_DIR, "clips-manifest.json"), JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} ok`);
  if (failed.length) {
    console.log("Failed:", failed.map(f => f.slug).join(", "));
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
