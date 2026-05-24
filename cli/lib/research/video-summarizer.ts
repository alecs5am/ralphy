// Per-video summarizer. Two modes depending on what the retriever recovered:
//
//   "full"      — TikTok / IG / X path. We have the actual mp4. Send it
//                 in-band to google/gemini-3.1-pro-preview which natively
//                 understands video with millisecond-precision scene
//                 detection and reads on-screen text + audio together.
//
//   "thumbnail" — YouTube path (anti-bot blocks mp4 in 2026). We only have
//                 the static thumbnail + the YouTube auto-caption transcript.
//                 Send the thumbnail as an image content block plus the
//                 transcript text — still 5-10x richer than blog-only
//                 analysis.
//
// Either way the structured output is the same shape so the synthesizer
// stays uniform.

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { callLLM, type LLMContent } from "../providers/llm.js";
import { frameToDataUri, type VideoMeta } from "./retrievers/video.js";

export type VideoSummary = {
  url: string;
  platform: string;
  uploader: string;
  title: string;
  durationSec: number;
  views: number;
  ageDays: number;
  viralityScore: number;

  hook_first_3s: string;
  hook_pattern: string;
  body_structure: string;
  closer: string;
  on_screen_text_style: string;
  visual_style: string;
  audio_use: string;
  editing_pace: string;
  why_works: string;
  replicable_template: string;
  hashtags: string[];
  language: string;
  aspect_ratio: "vertical" | "horizontal" | "square" | "unknown";
  niche_fit: "tight" | "loose" | "off-topic";

  /** Provenance: which path the summarizer took. */
  analysis_mode: "full-video" | "thumbnail+transcript";
};

export type SummarizeVideoInput = {
  meta: VideoMeta;
  /** Local path to the downloaded mp4 (full mode). When set, the model gets
   *  the actual video file with native video understanding. */
  mp4Path?: string | null;
  /** Fallback frame paths (thumbnail mode). Used when mp4 isn't available. */
  framePaths: string[];
  transcript: string;
  niche: string;
  viralityScore: number;
  model?: string;
  projectId?: string;
  /** Hard cap on mp4 bytes sent in-band. Larger videos fall back to
   *  thumbnail+transcript mode to keep the request manageable. */
  maxMp4Bytes?: number;
  /** Hard cap on frames in thumbnail-mode (defaults to 6, which is what
   *  vision-only models can comfortably co-attend). */
  maxFrames?: number;
};

const MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

const SYSTEM = `You analyze a single short-form vertical video for a deep-research synthesis step. The user is researching VIRAL VERTICAL SHORT-FORM CONTENT — TikTok, Instagram Reels, YouTube Shorts. Horizontal landscape videos and traditional long-form YouTube videos are OFF-TOPIC even if the subject matter matches.

You receive ONE of two payloads:
  A) Full video file (mp4). Treat it as the source of truth. You natively understand video — use the actual visual progression, on-screen text reveal, music beat, and editing cuts. Reference specific timestamps when describing the hook (e.g. "at 0:02 a smash cut to a close-up").
  B) Single static thumbnail + auto-caption transcript. The video file was unavailable (YouTube anti-bot). Infer visual style and hook from the thumbnail; reconstruct body, closer, on-screen text, and pacing from the transcript timing markers.

You also receive metadata (platform, uploader, view count, age, duration) and the user's niche.

Your job: extract concrete, replicable structure. The user wants to make their OWN vertical short-form videos in this niche. The output JSON is fed verbatim into a cross-video synthesis step.

Output STRICT JSON only. No prose. No markdown fences. Schema:

type VideoBreakdown = {
  hook_first_3s: string;            // exact verbal + visual setup in seconds 0-3. Quote on-screen text and VO verbatim.
  hook_pattern: string;             // short taxonomy label: "mistake-correction", "POV-immersion", "specific-timeframe-claim", "contrarian-claim", "gamified-rhythm", "comedy-sketch", "list-promise", "shadowing-clip", "comparison-meme", "tutorial-quick-hack", etc.
  body_structure: string;           // beat-by-beat. 2-4 sentences. Include real timestamps when you have the video.
  closer: string;                   // last 2-3 seconds — CTA, loop, cliffhanger, hard cut.
  on_screen_text_style: string;     // typography, position, animation, color. Concrete.
  visual_style: string;             // shot, lighting, POV, color register, background. Concrete.
  audio_use: string;                // VO, trending sound (name it if you can), beat-sync, silence.
  editing_pace: string;             // cuts per X seconds + transition style.
  why_works: string;                // 1-2 sentences. Psychology + algorithmic distribution. Specific to THIS video, NOT generic.
  replicable_template: string;      // 1-2 sentences. The formula the user could plug their own content into.
  hashtags: string[];               // hashtags actually visible in the video / description; otherwise [].
  language: string;                 // primary spoken/written language code (en, ru, es, etc.).
  aspect_ratio: "vertical" | "horizontal" | "square" | "unknown";  // verify from the actual video frames or thumbnail. Vertical = 9:16 (or close). Anything else means off-topic for this research.
  niche_fit: "tight" | "loose" | "off-topic";  // "off-topic" if subject doesn't match niche OR aspect_ratio is horizontal.
}

Rules:
- If aspect_ratio is NOT vertical, set niche_fit="off-topic" regardless of subject match. The user only wants vertical short-form patterns.
- If the video is off-topic, still fill every field but keep replicable_template empty.
- Be specific. Never write generic filler like "engaging hook" or "uses good music" — name the technique.
- Quotes from on-screen text or VO must be verbatim.
`;

export async function summarizeVideo(
  input: SummarizeVideoInput,
): Promise<VideoSummary> {
  const model = input.model ?? "google/gemini-3.1-pro-preview";
  const maxMp4Bytes = input.maxMp4Bytes ?? 15 * 1024 * 1024; // 15 MB
  const maxFrames = input.maxFrames ?? 6;

  // Decide path: full video if mp4 exists, fits the cap, and is readable.
  let useFullVideo = false;
  if (input.mp4Path) {
    try {
      const st = await stat(input.mp4Path);
      if (st.size > 0 && st.size <= maxMp4Bytes) useFullVideo = true;
    } catch {
      useFullVideo = false;
    }
  }

  const content: LLMContent[] = [];

  if (useFullVideo && input.mp4Path) {
    const buf = await readFile(input.mp4Path);
    const ext = path.extname(input.mp4Path).toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "video/mp4";
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    content.push({
      type: "file",
      file: {
        filename: path.basename(input.mp4Path),
        file_data: dataUrl,
      },
    });
  } else {
    // Thumbnail fallback: send up to N frames + transcript.
    for (const f of input.framePaths.slice(0, maxFrames)) {
      try {
        const dataUri = await frameToDataUri(f);
        content.push({ type: "image_url", image_url: { url: dataUri } });
      } catch {
        // skip unreadable frame
      }
    }
  }

  const transcriptBlock = input.transcript.trim()
    ? `Transcript (auto, may have errors):\n${input.transcript.slice(0, 8000)}`
    : useFullVideo
      ? "Transcript: (none — derive everything from the video file itself)"
      : "Transcript: (none available)";

  const metaBlock = [
    `Niche: ${input.niche}`,
    `Platform: ${input.meta.platform}`,
    `Uploader: ${input.meta.uploaderHandle || input.meta.uploaderName}`,
    `Title: ${input.meta.title}`,
    `Duration: ${input.meta.durationSec}s`,
    `Views: ${input.meta.views}`,
    `Likes: ${input.meta.likes}`,
    `Comments: ${input.meta.comments}`,
    `Shares: ${input.meta.shares}`,
    `Uploaded: ${input.meta.uploadedAt} (${input.meta.ageDays} days ago)`,
    `Engagement rate: ${(input.meta.engagementRate * 100).toFixed(2)}%`,
    `URL: ${input.meta.url}`,
    `Analysis mode: ${useFullVideo ? "full video" : "thumbnail + transcript"}`,
    input.meta.description
      ? `Description: ${input.meta.description.slice(0, 1500)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  content.push({
    type: "text",
    text: `${metaBlock}\n\n${transcriptBlock}\n\nReturn the strict JSON breakdown now.`,
  });

  const { text } = await callLLM({
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content },
    ],
    model,
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 2000,
    projectId: input.projectId,
    endpoint: "research/video-summarize",
  });

  return parseOrFallback(text, input, input.viralityScore, useFullVideo);
}

// Platforms whose URLs are guaranteed-vertical by the host. The model can
// flip-flop on aspect when given only a thumbnail (YouTube generates 16:9
// thumbs even for vertical Shorts), so we trust the platform classification.
const GUARANTEED_VERTICAL = new Set(["youtube-shorts", "tiktok", "instagram-reel"]);

function parseOrFallback(
  raw: string,
  input: SummarizeVideoInput,
  viralityScore: number,
  usedFullVideo: boolean,
): VideoSummary {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let parsed: Partial<VideoSummary>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }
  const m = input.meta;
  const platformIsVertical = GUARANTEED_VERTICAL.has(m.platform);
  // Override aspect when the platform guarantees it — thumbnails lie.
  const aspectRaw = parsed.aspect_ratio;
  const aspect: VideoSummary["aspect_ratio"] = platformIsVertical
    ? "vertical"
    : ["vertical", "horizontal", "square", "unknown"].includes(aspectRaw as string)
      ? (aspectRaw as VideoSummary["aspect_ratio"])
      : "unknown";
  // Override niche_fit: if the model flagged off-topic ONLY because of aspect
  // (i.e. platform is guaranteed vertical), promote to loose.
  let nicheFit: VideoSummary["niche_fit"] = ["tight", "loose", "off-topic"].includes(
    parsed.niche_fit as string,
  )
    ? (parsed.niche_fit as VideoSummary["niche_fit"])
    : "loose";
  if (platformIsVertical && nicheFit === "off-topic") {
    // The model often flips here based on thumbnail aspect alone in
    // thumbnail+transcript mode. Trust the platform; demote to loose.
    nicheFit = "loose";
  }
  return {
    url: m.url,
    platform: m.platform,
    uploader: m.uploaderHandle || m.uploaderName,
    title: m.title,
    durationSec: m.durationSec,
    views: m.views,
    ageDays: m.ageDays,
    viralityScore,

    hook_first_3s: str(parsed.hook_first_3s),
    hook_pattern: str(parsed.hook_pattern),
    body_structure: str(parsed.body_structure),
    closer: str(parsed.closer),
    on_screen_text_style: str(parsed.on_screen_text_style),
    visual_style: str(parsed.visual_style),
    audio_use: str(parsed.audio_use),
    editing_pace: str(parsed.editing_pace),
    why_works: str(parsed.why_works),
    replicable_template: str(parsed.replicable_template),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags.filter((h): h is string => typeof h === "string")
      : [],
    language: str(parsed.language) || "en",
    aspect_ratio: aspect,
    niche_fit: nicheFit,
    analysis_mode: usedFullVideo ? "full-video" : "thumbnail+transcript",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
