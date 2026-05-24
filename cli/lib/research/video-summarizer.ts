// Per-video summarizer. Multimodal (frames + transcript + metadata) call to a
// vision-capable model. Produces the structured signal block the synthesizer
// needs to write per-format and per-video breakdowns:
//
//   { hook_first_3s, hook_pattern, body_structure, closer, runtime,
//     visual_style, audio_use, editing_pace, virality_signal, why_works,
//     replicable_template, hashtags, language }
//
// Default model: google/gemini-2.5-flash (cheap, multimodal). Reasoning
// model (claude-sonnet-4.6) does NOT see frames at this layer — too expensive
// per video. Sonnet is reserved for cross-video synthesis where it sees
// structured outputs only.

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
  niche_fit: "tight" | "loose" | "off-topic";
};

export type SummarizeVideoInput = {
  meta: VideoMeta;
  framePaths: string[];
  transcript: string;
  niche: string;
  viralityScore: number;
  model?: string;
  projectId?: string;
  /** Hard cap on frames sent — bigger means more accurate, more expensive. */
  maxFrames?: number;
};

const SYSTEM = `You analyze a single short-form video for a deep-research synthesis step. You will be given:
  - A handful of evenly-spaced frames (JPEGs) from the video.
  - The auto-generated transcript (may be empty).
  - The video's metadata (platform, uploader handle, view count, age in days, duration).
  - The user's research niche.

Your job: extract concrete, replicable structure. The user wants to make their own short-form videos in this niche. The output JSON is fed verbatim into a cross-video synthesis step.

Output STRICT JSON only. No prose. No markdown fences. Schema:

type VideoBreakdown = {
  hook_first_3s: string;            // exact verbal hook + visual setup in seconds 0-3. Quote text on screen when visible.
  hook_pattern: string;             // taxonomy label, e.g. "mistake-correction", "POV-immersion", "specific-timeframe-claim", "contrarian-claim", "list-promise". Pick one short phrase.
  body_structure: string;           // beat-by-beat. 2-4 sentences. Include timestamps if you can infer them.
  closer: string;                   // last 2-3 seconds — CTA, loop, cliffhanger, hard cut, etc.
  on_screen_text_style: string;     // typography/caption style, positioning, animation. "burned-in caption, bottom-third, word-by-word" etc.
  visual_style: string;             // shot type, lighting, POV, color register, background.
  audio_use: string;                // VO, trending sound, beat-sync, silence. Name it if you can hear it in transcript.
  editing_pace: string;             // cuts per X seconds + transition style.
  why_works: string;                // 1-2 sentences. Psychology + algorithmic distribution. Be specific to THIS video, not generic.
  replicable_template: string;      // 1-2 sentences. A formula the user could plug their own content into.
  hashtags: string[];               // hashtags actually in the description if visible; otherwise [].
  language: string;                 // primary spoken/written language code (en, ru, es, etc.).
  niche_fit: "tight" | "loose" | "off-topic";  // how well this video matches the supplied niche.
}

Rules:
- If the video is OFF-TOPIC for the niche, still fill every field but set niche_fit = "off-topic" and keep replicable_template empty.
- If you cannot see frames (no JPEGs provided), infer from transcript + metadata, set visual_style="(no frames available)".
- Be specific. Never write generic filler like "engaging hook" or "uses good music" — name the technique.
- Quotes from on-screen text or VO must be verbatim when you can read them.
`;

export async function summarizeVideo(
  input: SummarizeVideoInput,
): Promise<VideoSummary> {
  const model = input.model ?? "google/gemini-2.5-flash";
  const maxFrames = input.maxFrames ?? 6;
  const frames = input.framePaths.slice(0, maxFrames);

  const content: LLMContent[] = [];
  for (const f of frames) {
    try {
      const dataUri = await frameToDataUri(f);
      content.push({ type: "image_url", image_url: { url: dataUri } });
    } catch {
      // skip unreadable frame
    }
  }

  const transcriptBlock = input.transcript.trim()
    ? `Transcript (auto, may have errors):\n${input.transcript.slice(0, 6000)}`
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
    input.meta.description
      ? `Description: ${input.meta.description.slice(0, 1200)}`
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
    maxTokens: 1500,
    projectId: input.projectId,
    endpoint: "research/video-summarize",
  });

  return parseOrFallback(text, input, input.viralityScore);
}

function parseOrFallback(
  raw: string,
  input: SummarizeVideoInput,
  viralityScore: number,
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
    niche_fit: ["tight", "loose", "off-topic"].includes(parsed.niche_fit as string)
      ? (parsed.niche_fit as VideoSummary["niche_fit"])
      : "loose",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
