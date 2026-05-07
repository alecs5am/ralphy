# Transcript

Researcher transcribes when needed for analysis (find-viral-moments, deep social-analysis). Editor has its own generate-captions for production VO. Same tool, different contexts.

## Tool

```bash
ralphy project transcribe <id> --audio <path> --language ru
```

or for research-context (no project ID):

```bash
bunx tsx -e '
  import { transcribeAudio } from "../../../../cli/lib/transcribe.js";
  const result = await transcribeAudio({
    audioPath: "workspace/references/<handle>/source.mp3",
    language: "ru"
  });
  console.log(JSON.stringify(result.captions, null, 2));
'
```

## Hard limits

- ≤25MB per file (whisper-1 hard limit on OpenRouter).
- Longer → re-encode to mono 64kbps mp3:
  ```bash
  ffmpeg -i source.mp4 -vn -ac 1 -b:a 64k workspace/references/<handle>/source.mp3
  ```
- Even longer (>30min audio @ 64kbps ≈ 14MB safe, >60min — split into chunks).

## Word-level timestamps

`timestamp_granularities[]=word` — default in `transcribe.ts`. Returns `Caption[]`:
```ts
{ text: string; startMs: number; endMs: number; timestampMs: number; confidence: number }
```

Used for:
- find-viral-moments (cut on word boundary)
- editor caption components (12 styles from `src/lib/components/captions/`)
- deep social-analysis (hook timing analysis)

## Caching

If `<handle>/source.transcript.json` exists and `mtime > mtime audio` — **don't re-run**. ~$0.006/min × however many times = wasted.

## Language

- `--language ru` for Russian sources.
- `--language en` for English.
- `--language auto` — fails on short clips (≤10s) and sometimes on code-switching. Not the default.

## Cost

$0.006 per audio-minute. Hour-long podcast = $0.36. Counted automatically via `loggedFetch()` into `generations.jsonl`.
