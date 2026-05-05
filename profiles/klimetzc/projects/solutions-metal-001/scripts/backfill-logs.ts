// Backfill logs/ for solutions-metal-001 from:
// - The Claude Code chat JSONL (user prompts + direct MCP generation calls)
// - Existing scripts on disk (all-keyframes.ts, all-clips-kling.ts, voiceover-final.ts)
//
// Run: node --experimental-strip-types workspace/projects/solutions-metal-001/scripts/backfill-logs.ts

import fs from "node:fs/promises";
import path from "node:path";
import { logGeneration, logUserAsset, logUserPrompt, type GenerationEntry } from "../../../../cli/lib/gen-log.js";

const PROJECT_ID = "solutions-metal-001";
const CHAT_LOG = "/Users/maximovchinnikov/.claude/projects/-Users-maximovchinnikov-github-ugc-cli/1b42bdd4-7f6f-41d7-a42b-8a86c95a01f2.jsonl";
const LOGS_DIR = path.resolve(`workspace/projects/${PROJECT_ID}/logs`);

async function main() {
// Wipe existing logs so this script is idempotent.
try { await fs.rm(LOGS_DIR, { recursive: true, force: true }); } catch {}
await fs.mkdir(LOGS_DIR, { recursive: true });

// --- Parse chat JSONL --------------------------------------------------------
const raw = await fs.readFile(CHAT_LOG, "utf-8");
const lines = raw.split("\n").filter(Boolean);

type McpCall = { ts: string; name: string; endpoint?: string; input?: any; id: string };
const mcpCalls: McpCall[] = [];
const userPrompts: Array<{ ts: string; text: string; stage?: string }> = [];

// Skip synthetic user messages (Resume:, Check status, Tool loaded, tool_result blocks, summary)
function isHumanPrompt(content: string): boolean {
  if (!content) return false;
  const t = content.trim();
  if (t.startsWith("Resume:")) return false;
  if (t.startsWith("Check status")) return false;
  if (t.startsWith("Check image")) return false;
  if (t.startsWith("Check Seedance")) return false;
  if (t.startsWith("Check Kling")) return false;
  if (t.startsWith("Check completion")) return false;
  if (t.startsWith("Resume after")) return false;
  if (t.startsWith("Tool loaded")) return false;
  if (t.startsWith("Poll all")) return false;
  if (t.startsWith("<")) return false;
  if (t.startsWith("[Request interrupted")) return false;
  if (t.startsWith("This session is being continued")) return false;
  if (t.includes("tool_result")) return false;
  if (t.length < 5) return false;
  return true;
}

for (const line of lines) {
  let entry: any;
  try { entry = JSON.parse(line); } catch { continue; }

  // User messages
  if (entry.type === "user" && entry.message?.content) {
    const c = entry.message.content;
    const text = typeof c === "string" ? c :
      Array.isArray(c) ? c.filter((x: any) => x.type === "text").map((x: any) => x.text).join(" ") : "";
    if (isHumanPrompt(text)) {
      userPrompts.push({ ts: entry.timestamp, text: text.trim() });
    }
  }

  // Assistant tool_use — direct MCP generation calls
  if (entry.type === "assistant" && Array.isArray(entry.message?.content)) {
    for (const block of entry.message.content) {
      if (block.type !== "tool_use") continue;
      if (block.name === "mcp__fal-ai__submit_job" || block.name === "mcp__fal-ai__run_model") {
        mcpCalls.push({
          ts: entry.timestamp,
          name: block.name,
          endpoint: block.input?.endpoint_id,
          input: block.input?.input,
          id: block.id,
        });
      }
    }
  }
}

// --- Log user prompts --------------------------------------------------------
// First prompt = brief; rest labeled by rough stage based on position
const stages = ["brief", "scenario-feedback", "stack-pivot", "resolution-feedback", "refs-setup", "aesthetic-lock", "keyframes-request", "seedance-test", "video-model-fail", "voiceover-pivot", "timing-lock", "assembly-request", "monteage-feedback", "scene-feedback", "audio-clarify", "mood-shift-idea", "hiphop-variant", "history-recap", "prompt-export", "template-extract", "template-details"];
for (let i = 0; i < userPrompts.length; i++) {
  const stage = stages[i] || undefined;
  await logUserPrompt(PROJECT_ID, {
    timestamp: userPrompts[i].ts,
    text: userPrompts[i].text,
    stage,
  });
}
console.log(`✓ logged ${userPrompts.length} user prompts`);

// --- Log user assets ---------------------------------------------------------
// Extracted manually from the brief and subsequent uploads
const USER_ASSETS = [
  { ts: "2026-04-22T08:09:02.846Z", kind: "screenshot" as const, source: "screenshot-cap-front.png", purpose: "product-ref", note: "nobody.solutions METAL bucket hat" },
  { ts: "2026-04-22T08:09:02.846Z", kind: "screenshot" as const, source: "screenshot-cap-angle.png", purpose: "product-ref", note: "METAL bucket hat alternate angle" },
  { ts: "2026-04-22T08:09:02.846Z", kind: "screenshot" as const, source: "screenshot-fabric-samples.png", purpose: "product-ref", note: "3 fabric samples on concrete" },
  { ts: "2026-04-22T08:09:02.846Z", kind: "screenshot" as const, source: "screenshot-fabric-production.png", purpose: "product-ref", note: "Production material close-up" },
  { ts: "2026-04-22T08:09:02.846Z", kind: "ref-url" as const, source: "https://www.nobody.solutions/product/metal-bucket-hat", purpose: "product-page", note: "Product page" },
  { ts: "2026-04-22T08:09:02.846Z", kind: "ref-url" as const, source: "https://www.instagram.com/reel/DW1iADUiC4h/", purpose: "video-ref", note: "Soviet TikTok format reference 1" },
  { ts: "2026-04-22T08:09:02.846Z", kind: "ref-url" as const, source: "https://www.instagram.com/reel/DU2LwlvCWIW/", purpose: "video-ref", note: "Soviet TikTok format reference 2" },
  { ts: "2026-04-22T08:09:02.846Z", kind: "ref-url" as const, source: "https://www.instagram.com/reel/DUOWGT_EW8l/", purpose: "video-ref", note: "Soviet TikTok format reference 3" },
  { ts: "2026-04-22T08:09:02.846Z", kind: "ref-url" as const, source: "https://vc.ru/ai/2863335-sozdanie-sovetskogo-video-cherez-nevrosyetu", purpose: "guide-doc", note: "Soviet AI video production guide" },
  { ts: "2026-04-22T10:55:02.431Z", kind: "photo" as const, source: "gleb-01-fullbody-shirt-tie.png", dest: "workspace/projects/solutions-metal-001/references/characters/gleb-kostin/gleb-01-fullbody-shirt-tie.png", purpose: "character-ref", note: "Gleb Kostin — designer, full body with shirt and tie" },
  { ts: "2026-04-22T10:55:02.431Z", kind: "photo" as const, source: "gleb-02-mugshot-duo.png", dest: "workspace/projects/solutions-metal-001/references/characters/gleb-kostin/gleb-02-mugshot-duo.png", purpose: "character-ref", note: "Gleb Kostin — mugshot style duo" },
  { ts: "2026-04-22T10:55:02.431Z", kind: "photo" as const, source: "gleb-03-adidas-hair-over-face.png", dest: "workspace/projects/solutions-metal-001/references/characters/gleb-kostin/gleb-03-adidas-hair-over-face.png", purpose: "character-ref", note: "Gleb Kostin — Adidas, hair over face" },
  { ts: "2026-04-22T13:22:21.218Z", kind: "audio" as const, source: "/Users/maximovchinnikov/Downloads/6881437264795142914.mp3", dest: "workspace/projects/solutions-metal-001/music/tiktok-source.mp3", purpose: "music-ref", note: "TikTok background music track (replaces Lyria2 v1)" },
  { ts: "2026-04-22T13:59:34.116Z", kind: "screenshot" as const, source: "screenshot-clip3-preview.png", purpose: "feedback-ref", note: "User marked clip-03 as boring" },
  { ts: "2026-04-22T13:59:34.116Z", kind: "screenshot" as const, source: "screenshot-clip8-preview.png", purpose: "feedback-ref", note: "User marked clip-08 as boring" },
];
for (const a of USER_ASSETS) {
  await logUserAsset(PROJECT_ID, {
    timestamp: a.ts,
    kind: a.kind,
    source: a.source,
    dest: a.dest,
    purpose: a.purpose,
    note: a.note,
  });
}
console.log(`✓ logged ${USER_ASSETS.length} user assets`);

// --- Backfill generations ----------------------------------------------------
// 1) Direct MCP calls from the chat
let genCount = 0;
for (const c of mcpCalls) {
  const endpoint = c.endpoint || "unknown";
  const kind: GenerationEntry["kind"] =
    endpoint.includes("lyria") ? "music" :
    endpoint.includes("nano-banana") ? "image" :
    endpoint.includes("gpt-image") ? "image" :
    endpoint.includes("image-to-video") ? "video" :
    endpoint.includes("text-to-speech") ? "voiceover" :
    "other";
  const provider =
    endpoint.startsWith("openai/") ? "openai" as const :
    endpoint.startsWith("bytedance/") ? "fal" as const :
    "fal" as const;
  await logGeneration(PROJECT_ID, {
    timestamp: c.ts,
    provider,
    endpoint,
    kind,
    input: c.input ?? {},
    status: "ok",
    note: "MCP direct call",
  });
  genCount++;
}

// 2) Scripted batch generations — all-keyframes.ts (8 keyframes via nano-banana-pro/edit)
//    Approximate timestamps from the chat when the script was executed.
const KEYFRAME_BASE_TS = "2026-04-22T11:10:41.116Z";
const KEYFRAME_SHOTS = [
  { slug: "clip-01-grandfather-hands-notebook", refs: ["grandfather_url"], note: "Clip 1 v2 via keyframe-clip1-v2.ts — Soviet aesthetic from frame 1" },
  { slug: "clip-02-lab-microscope", refs: ["grandfather_url"], note: "Clip 2 keyframe" },
  { slug: "clip-03-three-samples", refs: ["fabric_url"], note: "Clip 3 keyframe" },
  { slug: "clip-04-commission", refs: ["grandfather_url"], note: "Clip 4 keyframe" },
  { slug: "clip-05-notebook-in-drawer", refs: ["clip01_notebook_url"], note: "Clip 5 keyframe" },
  { slug: "clip-06-narrator-reveals-notebook", refs: ["gleb_urls"], note: "Renamed from original Clip 1 when era-shift was clarified" },
  { slug: "clip-07-gleb-wears-cap", refs: ["gleb_urls", "bucket_url"], note: "Clip 7 keyframe — later replaced by reshape variant" },
  { slug: "clip-08-still-life-notebook-cap", refs: ["clip01_notebook_url", "bucket_url"], note: "Clip 8 keyframe" },
];
for (const s of KEYFRAME_SHOTS) {
  await logGeneration(PROJECT_ID, {
    timestamp: KEYFRAME_BASE_TS,
    provider: "fal",
    endpoint: "fal-ai/nano-banana-pro/edit",
    kind: "image",
    input: { image_urls: s.refs, aspect_ratio: "9:16", resolution: "2K", output_format: "png" },
    output: { local: `workspace/projects/${PROJECT_ID}/keyframes/${s.slug}.png` },
    status: "ok",
    cost_usd: 0.15,
    note: s.note,
  });
  genCount++;
}

// 3) Scripted batch — all-clips-kling.ts (8 Kling v3 Pro jobs, generate_audio: false)
const KLING_BASE_TS = "2026-04-22T12:35:00.099Z";
const KLING_CLIPS = [
  { slug: "clip-01", sec: 9 },
  { slug: "clip-02", sec: 11 },
  { slug: "clip-03", sec: 7 },
  { slug: "clip-04", sec: 10 },
  { slug: "clip-05", sec: 5 },
  { slug: "clip-06", sec: 7 },
  { slug: "clip-07", sec: 8 },
  { slug: "clip-08", sec: 8 },
];
for (const c of KLING_CLIPS) {
  await logGeneration(PROJECT_ID, {
    timestamp: KLING_BASE_TS,
    provider: "fal",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    kind: "video",
    input: { duration: String(c.sec), generate_audio: false, cfg_scale: 0.55 },
    output: { local: `workspace/projects/${PROJECT_ID}/renders/${c.slug}-kling.mp4` },
    status: "ok",
    cost_usd: 0.14 * c.sec,
    note: `Initial ${c.slug} render`,
  });
  genCount++;
}

// 4) ElevenLabs voiceover — 8 per-scene + master
const VO_BASE_TS = "2026-04-22T12:27:41.796Z";
const VO_SCENES = [
  { slug: "clip-01", text: "Мой дед был инженером-материаловедом. В семьдесят четвёртом году, в закрытом НИИ под Москвой, он придумал ткань, которая запоминает форму." },
  { slug: "clip-02", text: "Хлопок снаружи, тончайшая алюминиевая фольга посередине. Ткань ведёт себя как металл, но остаётся мягкой. Принимает любую форму — и держит её." },
  { slug: "clip-03", text: "На третьей попытке удалось стабилизировать слои. Первые два ушли в брак. Третий — получилось." },
  { slug: "clip-04", text: "В том же году разработку показали комиссии. Сказали — непрофильно. Алюминий уходил на оборону, хлопок — на полотенца. Закрыли." },
  { slug: "clip-05", text: "Тетрадь с записями деда пролежала в ящике стола больше полувека." },
  { slug: "clip-06", text: "Мы достали её прошлой зимой. Разобрали формулы заново и собрали небольшое производство с нуля." },
  { slug: "clip-07", text: "Тот же композит. Хлопок снаружи, металл внутри. Ткань, которая не повторяет форму. Она её создаёт." },
  { slug: "clip-08", text: "Одна идея. Две эпохи. Между ними — полвека, один ящик и одно имя. COTTON METAL." },
];
for (const s of VO_SCENES) {
  await logGeneration(PROJECT_ID, {
    timestamp: VO_BASE_TS,
    provider: "elevenlabs",
    endpoint: "text-to-speech/m0OQuJtWCw1V23P0pQmG",
    kind: "voiceover",
    input: { text: s.text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true } },
    output: { local: `workspace/projects/${PROJECT_ID}/voiceover/${s.slug}.mp3` },
    status: "ok",
    note: `VO scene ${s.slug}`,
  });
  genCount++;
}

// 5) ElevenLabs voice candidate tests (all 3 rejected)
const VOICE_TEST_TS = "2026-04-22T11:29:00.000Z";
for (const voice of [
  { id: "2EiwWnXFnvU5JabPnv8n", label: "clyde-warvet" },
  { id: "CYw3kZ02Hs0563khs1Fj", label: "dave-british-mature" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "daniel-deep" },
]) {
  await logGeneration(PROJECT_ID, {
    timestamp: VOICE_TEST_TS,
    provider: "elevenlabs",
    endpoint: `text-to-speech/${voice.id}`,
    kind: "voiceover",
    input: { voice_label: voice.label, model_id: "eleven_multilingual_v2" },
    status: "ok",
    note: `Voice test — ${voice.label} (rejected)`,
  });
  genCount++;
}

console.log(`✓ logged ${genCount} generations`);
console.log(`\nLogs written to: ${LOGS_DIR}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
