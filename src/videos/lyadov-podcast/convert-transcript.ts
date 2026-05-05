/**
 * Convert ElevenLabs STT transcript to @remotion/captions format.
 * Run: npx tsx src/videos/lyadov-podcast/convert-transcript.ts
 */
import { readFileSync, writeFileSync } from "fs";

interface ElevenLabsWord {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "punctuation";
  logprob?: number;
}

interface ElevenLabsTranscript {
  text: string;
  words: ElevenLabsWord[];
}

interface RemotionCaption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number;
  confidence: number;
}

const input = JSON.parse(
  readFileSync("workspace/projects/lyadov-podcast-001/assets/voiceover/en_transcript.json", "utf-8")
) as ElevenLabsTranscript;

// Filter to words only, skip "uh", "huh" filler words
const fillerWords = new Set(["uh", "um", "huh", "hmm", "ah"]);

const captions: RemotionCaption[] = input.words
  .filter((w) => w.type === "word" && !fillerWords.has(w.text.toLowerCase()))
  .map((w) => ({
    text: w.text,
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
    timestampMs: Math.round(w.start * 1000),
    confidence: 1,
  }));

writeFileSync(
  "src/videos/lyadov-podcast/captions.json",
  JSON.stringify(captions, null, 2)
);

console.log(`Converted ${captions.length} words`);
console.log(`First: "${captions[0].text}" at ${captions[0].startMs}ms`);
console.log(`Last: "${captions[captions.length - 1].text}" at ${captions[captions.length - 1].startMs}ms`);
