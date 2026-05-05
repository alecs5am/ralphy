import fs from "fs/promises";
import path from "path";
import { transcribe, captionsToSegments } from "../../../../cli/lib/transcribe.js";

// --- Config ---
const args = process.argv.slice(2);
const videoArg = args[args.indexOf("--video") + 1];
const outputArg = args[args.indexOf("--output") + 1];
const langArgIdx = args.indexOf("--language");
const langArg = (langArgIdx !== -1 ? args[langArgIdx + 1] : undefined) as
  | "ru"
  | "en"
  | "auto"
  | undefined;

if (!videoArg || !outputArg) {
  console.error("Usage: --video <path-to-mp4> --output <output-dir> [--language ru|en|auto]");
  process.exit(1);
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  console.error("OPENROUTER_API_KEY env var required");
  process.exit(1);
}

const VIDEO_PATH = path.resolve(videoArg);
const OUTPUT_DIR = path.resolve(outputArg);
const VIDEO_NAME = path.basename(VIDEO_PATH, path.extname(VIDEO_PATH));

// --- Helpers ---
async function extractFrames(videoPath: string, outDir: string): Promise<string[]> {
  const framesDir = path.join(outDir, "frames");
  await fs.mkdir(framesDir, { recursive: true });

  const { execSync } = await import("child_process");

  // Get duration
  const duration = parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: "utf-8" }
    ).trim()
  );

  // Extract 1 frame every 2 seconds, max 20 frames
  const interval = Math.max(2, duration / 20);
  execSync(
    `ffmpeg -i "${videoPath}" -vf "fps=1/${interval},scale=512:-2" -q:v 4 "${framesDir}/frame-%03d.jpg" -y`,
    { stdio: "pipe" }
  );

  const files = (await fs.readdir(framesDir))
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .map((f) => path.join(framesDir, f));

  return files;
}

async function extractAudio(videoPath: string, outDir: string): Promise<string> {
  const audioPath = path.join(outDir, "audio.mp3");
  const { execSync } = await import("child_process");
  execSync(
    `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 "${audioPath}" -y`,
    { stdio: "pipe" }
  );
  return audioPath;
}

async function getVideoMeta(videoPath: string) {
  const { execSync } = await import("child_process");
  const duration = parseFloat(
    execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: "utf-8" }
    ).trim()
  );
  const resolution = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${videoPath}"`,
    { encoding: "utf-8" }
  ).trim();
  const fps = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
    { encoding: "utf-8" }
  ).trim();

  const [w, h] = resolution.split("x").map(Number);
  return {
    duration: Math.round(duration * 10) / 10,
    resolution,
    width: w,
    height: h,
    aspectRatio: w > h ? "16:9" : w === h ? "1:1" : "9:16",
    fps,
  };
}

async function transcribeAudio(
  audioPath: string,
  language: "ru" | "en" | "auto"
): Promise<{ text: string; segments: any[] }> {
  // Local whisper.cpp via cli/lib/transcribe.ts — no API key required.
  // Returns Caption[] and we collapse to Whisper-style {text, segments} for Gemini prompts.
  try {
    const result = await transcribe({ audioPath, language });
    return captionsToSegments(result.captions);
  } catch (e: any) {
    console.log(`  Local whisper.cpp failed: ${e?.message || e}`);
    return { text: "", segments: [] };
  }
}

async function callGemini(
  frames: string[],
  meta: any,
  transcript: { text: string; segments: any[] },
  musicId: { song: string | null; artist: string | null; album: string | null }
): Promise<string> {
  // Select up to 12 evenly spaced frames
  const step = Math.max(1, Math.floor(frames.length / 12));
  const selectedFrames = frames.filter((_, i) => i % step === 0).slice(0, 12);

  // Encode frames as base64
  const imageContents = await Promise.all(
    selectedFrames.map(async (f, i) => {
      const data = await fs.readFile(f);
      const ts = Math.round((i * step * 2));
      return [
        {
          type: "text" as const,
          text: `[Frame at ~${ts}s]`,
        },
        {
          type: "image_url" as const,
          image_url: {
            url: `data:image/jpeg;base64,${data.toString("base64")}`,
          },
        },
      ];
    })
  );

  // Build transcript section
  const transcriptSection = transcript.text
    ? `
## AUDIO TRANSCRIPTION (from Whisper)

Full text: "${transcript.text}"

Timestamped segments:
${transcript.segments.map((s: any) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`).join("\n")}

IMPORTANT: Use this transcription to understand what is being SAID in the video. The spoken words are critical for understanding the video's true meaning, cultural references, humor, and emotional impact. Don't just describe what you see — understand what the creator is communicating through speech, song lyrics, references to popular culture, memes, or shared experiences.
`
    : "\n(No audio transcription available — analyze based on visual content only)\n";

  const musicSection = musicId.song
    ? `\n## MUSIC IDENTIFICATION (from audio fingerprinting)\nSong: "${musicId.song}" by ${musicId.artist} (Album: ${musicId.album})\nThis is a CONFIRMED identification. Use this as ground truth for your analysis.\n`
    : "";

  const prompt = `You are an elite social media content analyst specializing in viral video deconstruction. You understand internet culture, memes, nostalgia triggers, cultural references, and the psychology of why content goes viral across platforms like TikTok, Instagram Reels, and YouTube Shorts.

Analyze this social media video (${meta.duration}s, ${meta.resolution}, ${meta.aspectRatio}).

You have:
1. Keyframes from the video (shown below)
2. Audio transcription with timestamps
3. Music identification (if available)
${transcriptSection}${musicSection}

## YOUR TASK

Provide a deep analysis. Don't just describe what's visible — understand the MEANING, the CULTURAL CONTEXT, and the EMOTIONAL MECHANICS that make this video work.

Think about:
- What cultural references or shared experiences does this tap into? (specific songs, shows, anime, memes, trends)
- What emotion does this trigger in the target audience? WHY does someone share this?
- What's the "aha moment" or payoff?
- If there's music or singing — what specific song is it? Is it recognizable? Does it trigger nostalgia?
- If there are references to pop culture — identify them specifically (show name, character, song title, meme origin)
- What makes this creator's SPECIFIC take unique vs. similar content?

Return a detailed JSON analysis:

{
  "summary": "Detailed paragraph explaining what this video IS and WHY it resonates. Not just 'a girl talks to camera' but the deeper meaning and appeal.",
  "category": "educational|entertainment|product-review|lifestyle|comedy|motivation|tutorial|storytelling|podcast-clip|nostalgia|cultural-mashup|other",
  "language": "detected language code (en/ru/es/ja/etc)",
  "contentAnalysis": {
    "topic": "specific topic/subject of the video",
    "creatorRole": "who is this person/what's their niche (e.g. 'Japanese language teacher', 'tech reviewer', 'comedy creator')",
    "narrativeArc": "description of the story/progression from start to end",
    "culturalReferences": ["list every specific cultural reference: song names, show names, memes, trends, inside jokes"],
    "musicIdentification": "if there's recognizable music, identify the song/artist/show it's from",
    "spokenContent": "summary of what is said/sung and its significance",
    "textOnScreen": ["all text overlays with translations if not English"],
    "keyMoment": "the single most impactful/shareable moment and its timestamp",
    "emotionalJourney": "how the viewer's emotion changes throughout (e.g. curiosity → recognition → nostalgia → joy)"
  },
  "format": {
    "type": "talking-head|voiceover|slideshow|animation|podcast-clip|screen-recording|performance|mixed",
    "aspectRatio": "${meta.aspectRatio}",
    "duration": ${meta.duration},
    "hasSubtitles": true/false,
    "subtitleStyle": "description of subtitle style if present",
    "hasFaceCam": true/false,
    "isAIGenerated": true/false
  },
  "hook": {
    "type": "question|statement|visual|challenge|curiosity-gap|pattern-interrupt|nostalgia-trigger",
    "text": "the hook text/concept in first 3 seconds",
    "whyItWorks": "why this specific hook grabs the target audience"
  },
  "scenes": [
    {
      "timestamp": "0:00-0:03",
      "type": "hook|content|transition|cta|b-roll|payoff|reveal",
      "description": "what happens visually AND audibly",
      "textOnScreen": "any text overlays visible (with translation if needed)",
      "spokenWords": "what is being said at this moment",
      "transition": "cut|fade|zoom|swipe|none",
      "cameraAngle": "close-up|medium|wide|overhead|pov",
      "emotionalBeat": "what the viewer feels at this moment"
    }
  ],
  "editing": {
    "pace": "slow|medium|fast|very-fast",
    "averageCutLength": "estimated seconds between cuts",
    "transitions": ["list of transition types used"],
    "effects": ["list of effects used"],
    "textOverlays": {
      "style": "description",
      "font": "estimated font style",
      "colors": ["colors"],
      "animation": "how text appears",
      "position": "where on screen"
    },
    "colorGrading": "warm|cool|neutral|high-contrast|desaturated|vibrant"
  },
  "audio": {
    "hasVoiceover": true/false,
    "hasSpeech": true/false,
    "hasSinging": true/false,
    "hasMusic": true/false,
    "musicDetails": "specific song/artist if identifiable, genre, mood",
    "voiceTone": "description of voice tone and energy",
    "audioStructure": "how audio elements are layered (e.g. 'speech first, then music kicks in at 15s')",
    "soundEffects": ["list of sound effects"]
  },
  "viralFactors": {
    "primaryViralMechanic": "the #1 reason this goes viral (be specific, not generic)",
    "whyItWorks": "3-4 sentences with deep analysis of the psychological/cultural triggers",
    "targetAudience": "specific audience with demographics and interests",
    "emotionalTrigger": "primary emotion: nostalgia|fomo|humor|inspiration|education|shock|recognition|belonging",
    "shareability": "low|medium|high - with specific reason WHY someone would share this",
    "commentBait": "what drives people to comment on this video",
    "retentionTechniques": ["list of techniques keeping viewers watching"],
    "platformOptimization": "how this video is optimized for the platform's algorithm"
  },
  "reproductionGuide": {
    "difficulty": "easy|medium|hard",
    "conceptCore": "the core concept in one sentence that makes this video work, stripped of specifics",
    "requiredAssets": ["list of what you'd need"],
    "steps": ["detailed step-by-step to recreate"],
    "variationIdeas": [
      "specific ideas with different content but same viral mechanic"
    ],
    "whatToAvoid": ["common mistakes when recreating this format"]
  }
}

## CRITICAL RULES FOR IDENTIFICATION

1. **DO NOT HALLUCINATE.** If you are not at least 80% confident about a specific song, anime, show, or cultural reference — say "unidentified" and explain what clues you see instead of guessing wrong.
2. **Cross-reference ALL signals**: match the transcribed lyrics + visual clues (cosplay, anime clips, text on screen) + scene context together. A single matching keyword is NOT enough to identify a song/show.
3. For music/song identification, provide your top candidates with confidence:
   "musicIdentification": {"candidates": [{"song": "...", "artist": "...", "from": "anime/show name", "confidence": 0.9, "evidence": "why you think this"}], "bestGuess": "..." }
4. Look for SPECIFIC lyrics in the transcript. If someone says translated lyrics, try to match them to known songs. Japanese anime openings often have very distinctive lyrical themes.
5. If there's cosplay — identify the CHARACTER specifically (hair color, outfit, accessories, props match which character?)
6. If there's anime footage shown in the video — identify the specific show from the art style and characters.

Be SPECIFIC when confident, be HONEST when unsure. This analysis will be used to create similar viral content.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...imageContents.flat(),
          ],
        },
      ],
      max_tokens: 8192,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${err}`);
  }

  const data = (await response.json()) as any;
  return data.choices?.[0]?.message?.content || "";
}

function extractJsonFromResponse(text: string): any {
  // Try to extract JSON from markdown code blocks or raw text
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try to find JSON object in the text
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      return JSON.parse(jsonStr.substring(start, end + 1));
    }
    throw new Error("Could not parse JSON from response");
  }
}

// --- Main ---
async function run() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`\n=== Analyzing: ${VIDEO_NAME} ===\n`);

  // 1. Get video metadata
  console.log("[1/4] Video metadata...");
  const meta = await getVideoMeta(VIDEO_PATH);
  console.log(`  ${meta.duration}s, ${meta.resolution}, ${meta.aspectRatio}, ${meta.fps}fps`);

  // 2. Extract frames
  console.log("[2/4] Extracting frames...");
  const frames = await extractFrames(VIDEO_PATH, OUTPUT_DIR);
  console.log(`  ${frames.length} frames extracted`);

  // 3. Extract audio
  console.log("[3/5] Extracting audio...");
  const audioPath = await extractAudio(VIDEO_PATH, OUTPUT_DIR);
  const audioSize = (await fs.stat(audioPath)).size;
  console.log(`  Audio: ${Math.round(audioSize / 1024)}KB`);

  // 4. Transcribe audio (local whisper.cpp)
  console.log("[4/5] Transcribing audio (local whisper.cpp)...");
  const transcript = await transcribeAudio(audioPath, langArg ?? "auto");
  if (transcript.text) {
    console.log(`  Transcript: ${transcript.text.substring(0, 100)}...`);
    console.log(`  Segments: ${transcript.segments.length}`);
    await fs.writeFile(
      path.join(OUTPUT_DIR, "transcript.json"),
      JSON.stringify(transcript, null, 2)
    );
  } else {
    console.log("  No transcription available");
  }

  // 5. Analyze with Gemini (frames + transcript)
  console.log("[5/5] Analyzing with Gemini...");
  const rawResponse = await callGemini(frames, meta, transcript, { song: null, artist: null, album: null });
  const analysis = extractJsonFromResponse(rawResponse);

  // Add metadata
  const result = {
    videoFile: VIDEO_PATH,
    videoName: VIDEO_NAME,
    analyzedAt: new Date().toISOString(),
    meta,
    transcript: transcript.text ? { text: transcript.text, segments: transcript.segments } : null,
    analysis,
  };

  // Save
  const outputPath = path.join(OUTPUT_DIR, "blueprint.json");
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(`\n=== Saved: ${outputPath} ===`);

  // Print summary
  console.log(`\nCategory: ${analysis.category}`);
  console.log(`Format: ${analysis.format?.type}`);
  console.log(`Language: ${analysis.language}`);
  console.log(`Hook: ${analysis.hook?.text}`);
  console.log(`Viral: ${analysis.viralFactors?.whyItWorks}`);
  console.log(`Difficulty: ${analysis.reproductionGuide?.difficulty}`);
}

run().catch((e) => {
  console.error("Analysis failed:", e.message || e);
  process.exit(1);
});
