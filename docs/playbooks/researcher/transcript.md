# Transcript

Researcher transcribes when needed for analysis (find-viral-moments, deep social-analysis). Editor has its own generate-captions for production VO. Same tool, different contexts.

## Tool

For project context (output goes into `workspace/projects/<id>/captions.json` + manifest + gen-log):

```bash
ralphy project transcribe <id> --audio <path> [--language ru|en|auto] [--backend elevenlabs|openrouter|gemini]
```

For research context (no project, just dump captions next to the ref):

```bash
ralphy ref transcribe <slug> [--language ru] [--backend elevenlabs]
# → workspace/references/<slug>/transcript.json (Caption[])
```

`ref transcribe` reads `<slug>/source.mp3`, which `ref pull` already extracts. **Don't shell out to `bunx tsx` against `cli/lib/transcribe.ts` directly** — the CLI verb logs to gen-log and updates `state.json`.

## Backends

| backend       | word-level | key needed              | notes                                      |
|---|---|---|---|
| `elevenlabs`  | yes        | `ELEVENLABS_API_KEY`    | **default** — reliable, ~$0.004 / min     |
| `openrouter`  | yes        | `OPENROUTER_API_KEY`    | whisper-1; sometimes returns 400          |
| `gemini`      | no         | `OPENROUTER_API_KEY`    | single-segment fallback; for short clips  |

## Hard limits

- ≤25MB per file (all backends).
- Longer → re-encode to mono 64kbps mp3 (`ref pull` does this automatically when extracting from mp4):
  ```bash
  ffmpeg -i source.mp4 -vn -ac 1 -b:a 64k source.mp3
  ```
- Even longer (>30min audio @ 64kbps ≈ 14MB safe, >60min — split into chunks).

## Word-level timestamps

ElevenLabs Scribe v1 returns word-level natively. Output is `Caption[]`:
```ts
{ text: string; startMs: number; endMs: number; timestampMs: number; confidence: number | null }
```

Used for:
- find-viral-moments (cut on word boundary)
- editor caption components (12 styles from `src/lib/components/captions/`)
- deep social-analysis (hook timing analysis)

## Caching

`ref transcribe` writes a marker into `state.json`. Re-running on the same slug overwrites — that's intentional (cheap). For projects, `ralphy project transcribe` overwrites `captions.json` each run.

## Language

- `--language ru` for Russian sources.
- `--language en` for English.
- `--language auto` — fails on short clips (≤10s) and sometimes on code-switching. Not the default.

## Cost

ElevenLabs Scribe v1 ≈ $0.004 / audio-minute. Whisper-1 ≈ $0.006 / min. Counted automatically into `generations.jsonl` (kind: `text`).
