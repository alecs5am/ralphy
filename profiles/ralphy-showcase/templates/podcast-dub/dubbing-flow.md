# Dubbing flow — ElevenLabs Dubbing + STT → captions

Step-by-step recipe for turning a raw Russian video into dubbed English audio + word-timestamp transcript usable by `@remotion/captions`.

## 1. Submit to ElevenLabs Dubbing

API: `POST https://api.elevenlabs.io/v1/dubbing`

Send the source as multipart form. Key fields:

- `file` — the raw RU video/audio (the project's `assets/source/ep{NN}_ru_raw.mp4`)
- `target_lang` — `en`
- `source_lang` — `ru` (or leave unset for auto-detect — usually fine)
- `num_speakers` — `1` for solo podcast host, `2+` for conversation
- `watermark` — `false` (requires paid plan)

Voice handling:
- **Default (preserve speaker voice):** don't pass a voice_id; ElevenLabs clones the source speaker automatically. Best for podcasts where the speaker's voice is part of the brand.
- **Named voice override:** pass `voice_id` to use a library/cloned voice instead.

Response returns `dubbing_id`. Polling endpoint: `GET /v1/dubbing/{dubbing_id}` — wait for `status: "dubbed"`.

Download the dubbed audio:

`GET /v1/dubbing/{dubbing_id}/audio/en` → writes `mp4`/`mp3` bytes.

Save to: `assets/voiceover/ep{NN}_en_dubbed.mp4` (the file is mp4 even when extension is mp3 — verify with `ffprobe`).

### Extract audio-only track

The dubbed file carries a video track (copy of source). For Remotion you need audio-only to avoid double-decoding:

```bash
ffmpeg -y -i ep{NN}_en_dubbed.mp4 -vn -c:a aac -b:a 192k ep{NN}_audio.m4a
```

## 2. Get the English transcript with word-level timestamps

Two paths. Pick one.

### (Preferred) Use the dubbing job's built-in transcript

Some dubbing responses include the translated transcript with word timings. Fetch via:

`GET /v1/dubbing/{dubbing_id}/transcript/en?format_type=json`

Returns something close to:

```json
{
  "text": "Why do investors invest in startups ...",
  "words": [
    { "text": "Why", "start": 0.12, "end": 0.34, "type": "word" },
    { "text": " ", "start": 0.34, "end": 0.36, "type": "spacing" },
    ...
  ]
}
```

### Fallback — STT on the dubbed audio

If the dubbing job's transcript is unavailable or misaligned, run STT on the already-dubbed audio:

`POST https://api.elevenlabs.io/v1/speech-to-text`

Multipart form:
- `file` — the extracted `ep{NN}_audio.m4a`
- `model_id` — `scribe_v1`
- `timestamps_granularity` — `word`
- `language_code` — `en`

Response shape is the same `{ words: [{ text, start, end, type }] }` schema.

Save to: `assets/voiceover/ep{NN}_en_transcript.json`.

## 3. Convert to `@remotion/captions` format

The transcript uses seconds; Remotion captions use milliseconds. Also strip fillers and non-word tokens.

```ts
import type { Caption } from "@remotion/captions";

interface ElevenLabsWord {
  text: string;
  start: number;
  end: number;
  type: "word" | "spacing" | "punctuation";
}

const fillerWords = new Set(["uh", "um", "huh", "hmm", "ah"]);

export function toRemotionCaptions(transcript: { words: ElevenLabsWord[] }): Caption[] {
  return transcript.words
    .filter((w) => w.type === "word" && !fillerWords.has(w.text.toLowerCase()))
    .map((w) => ({
      text: w.text,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
      timestampMs: Math.round(w.start * 1000),
      confidence: 1,
    }));
}
```

Emit one `captions-{NN}.ts` per episode:

```ts
// src/videos/{project-id}/captions-{NN}.ts
import type { Caption } from "@remotion/captions";

export const captions: Caption[] = [
  { text: "Why", startMs: 120, endMs: 340, timestampMs: 120, confidence: 1 },
  ...
];
```

## 4. Probe durations, register composition

```bash
ffprobe -v quiet -print_format json -show_format ep{NN}_audio.m4a
ffprobe -v quiet -print_format json -show_format ep{NN}_video.mp4
```

Use `Math.ceil(max(videoDur, audioDur) * 30)` for `durationInFrames` — the longer wins so nothing is clipped. The shorter media ends early (short black frame or silence); for talking-head podcast shorts this is usually imperceptible.

## End-to-end script skeleton

```ts
// workspace/projects/{project-id}/scripts/dub-and-transcribe.ts
// Iterates over source videos, submits to dubbing, polls, downloads,
// runs STT if needed, converts transcripts, writes captions-NN.ts per episode.
//
// Run: npx tsx workspace/projects/{project-id}/scripts/dub-and-transcribe.ts
//
// Uses loggedFetch from cli/lib/gen-log.ts to append every ElevenLabs call
// to workspace/projects/{id}/logs/generations.jsonl.

import fs from "node:fs/promises";
import path from "node:path";
import { logGeneration } from "../../../../cli/lib/gen-log.ts";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("ELEVENLABS_API_KEY missing");
const UA = { "User-Agent": "Mozilla/5.0 ..." };

async function submitDub(videoPath: string) {
  const form = new FormData();
  form.append("file", new Blob([await fs.readFile(videoPath)]), path.basename(videoPath));
  form.append("target_lang", "en");
  form.append("source_lang", "ru");
  form.append("num_speakers", "1");
  form.append("watermark", "false");
  const res = await fetch("https://api.elevenlabs.io/v1/dubbing", {
    method: "POST",
    headers: { "xi-api-key": KEY!, ...UA },
    body: form,
  });
  if (!res.ok) throw new Error(`dub submit ${res.status}: ${await res.text()}`);
  return (await res.json()) as { dubbing_id: string };
}

async function waitDub(id: string): Promise<void> {
  for (;;) {
    const r = await fetch(`https://api.elevenlabs.io/v1/dubbing/${id}`, {
      headers: { "xi-api-key": KEY!, ...UA },
    });
    const j = (await r.json()) as { status: string };
    if (j.status === "dubbed") return;
    if (j.status === "failed") throw new Error(`dub ${id} failed`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

async function downloadDubbed(id: string, out: string) {
  const r = await fetch(`https://api.elevenlabs.io/v1/dubbing/${id}/audio/en`, {
    headers: { "xi-api-key": KEY!, ...UA },
  });
  await fs.writeFile(out, Buffer.from(await r.arrayBuffer()));
}

async function fetchTranscript(id: string, out: string) {
  const r = await fetch(
    `https://api.elevenlabs.io/v1/dubbing/${id}/transcript/en?format_type=json`,
    { headers: { "xi-api-key": KEY!, ...UA } }
  );
  const body = await r.text();
  await fs.writeFile(out, body);
}

// Orchestrate: for each source video → submit → poll → download → transcript → convert to captions-NN.ts
```

Fill in the orchestration loop per project; log every step with `logGeneration`.

## Failure modes to watch

- **Cloudflare 403 on default Node UA.** Send `User-Agent: Mozilla/5.0 ...` on all ElevenLabs requests.
- **Dubbed file is mp4 even when named mp3.** Always re-extract audio to `m4a` with ffmpeg — Remotion's `Audio` component wants a clean audio container.
- **Word-timestamps drift vs. audio.** If captions land visibly off (>200ms), prefer STT on the dubbed audio over the dubbing job's transcript — STT is re-aligned to the actual rendered voice.
- **Filler words in source** (`ээ`, `мм`) sometimes get dubbed into English fillers. The `fillerWords` strip list covers common cases; add project-specific fillers if you see consistent garbage.
- **Long single-word captions** (over 12 characters) break the 3-words-per-line karaoke layout. If your transcript has regular long words, drop `wordsPerLine` to 2.
