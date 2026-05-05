/**
 * Set up all 10 podcast episodes: extract audio, convert transcripts, copy to public/.
 * Run: npx tsx src/videos/lyadov-podcast/setup-all.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const CLEAN_DIR = "/Users/maximovchinnikov/Downloads/clean";
const OUTPUT_DIR = path.join(CLEAN_DIR, "output");
const PUBLIC_DIR = "/Users/maximovchinnikov/github/ugc-cli/public/lyadov-podcast-001";
const VIDEOS_DIR = "/Users/maximovchinnikov/github/ugc-cli/src/videos/lyadov-podcast";

mkdirSync(PUBLIC_DIR, { recursive: true });

interface ElevenLabsWord {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "punctuation";
}

const fillerWords = new Set(["uh", "um", "huh", "hmm", "ah"]);

for (let i = 1; i <= 10; i++) {
  const num = String(i).padStart(2, "0");
  const basename = `business_blog_02_shorts_clean_${num}_v001`;
  console.log(`\n[${i}/10] ${basename}`);

  const dubbedPath = path.join(OUTPUT_DIR, `${basename}_dubbed_audio.mp3`);
  const transcriptPath = path.join(OUTPUT_DIR, `${basename}_transcript.json`);
  const videoPath = path.join(CLEAN_DIR, `${basename}.mp4`);

  if (!existsSync(dubbedPath) || !existsSync(transcriptPath)) {
    console.log("  SKIP - missing dubbed audio or transcript");
    continue;
  }

  // 1. Extract audio-only from dubbed file (it's actually mp4)
  const audioOut = path.join(PUBLIC_DIR, `ep${num}_audio.m4a`);
  if (!existsSync(audioOut)) {
    console.log("  Extracting audio...");
    execSync(`ffmpeg -y -i "${dubbedPath}" -vn -c:a aac -b:a 192k "${audioOut}" 2>/dev/null`);
  }

  // 2. Copy original video to public
  const videoOut = path.join(PUBLIC_DIR, `ep${num}_video.mp4`);
  if (!existsSync(videoOut)) {
    console.log("  Copying video...");
    copyFileSync(videoPath, videoOut);
  }

  // 3. Convert transcript to Remotion Caption[] format
  const transcript = JSON.parse(readFileSync(transcriptPath, "utf-8"));
  const words: ElevenLabsWord[] = transcript.words;

  const captions = words
    .filter((w) => w.type === "word" && !fillerWords.has(w.text.toLowerCase()))
    .map((w) => ({
      text: w.text,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      timestampMs: Math.round(w.start * 1000),
      confidence: 1,
    }));

  const captionsFile = path.join(VIDEOS_DIR, `captions-${num}.ts`);
  const tsContent = `import type { Caption } from "@remotion/captions";\n\nexport const captions: Caption[] = ${JSON.stringify(captions, null, 2)};\n`;
  writeFileSync(captionsFile, tsContent);
  console.log(`  ${captions.length} words → captions-${num}.ts`);

  // 4. Get video duration for composition
  const probe = execSync(`ffprobe -v quiet -print_format json -show_format "${videoPath}"`).toString();
  const duration = parseFloat(JSON.parse(probe).format.duration);
  const frames = Math.ceil(duration * 30);
  console.log(`  Duration: ${duration.toFixed(1)}s → ${frames} frames`);
}

console.log("\nDone! All episodes set up.");
