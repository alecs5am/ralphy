# Transcription and caption models: detail

Per-model detail for the transcription rows in the [`MODELS.md`](../../MODELS.md) index. Do not read this file whole: `ralphy models show <id>` prints one model's section plus every shared note below that names it.

## Shared notes

### CLI

CLI: `ralphy generate captions --project <id> --audio <vo.mp3> --language en` (writes `captions.json` next to the project).

### Avoid

- Local whisper.cpp: large binary, no real benefit over the cloud at our volumes.
- Direct OpenAI API: we route through OpenRouter so one key covers vision + scoring + transcription.

## `elevenlabs/scribe_v1`

ElevenLabs model id `scribe_v1`, the default in `cli/lib/transcribe.ts`. Returns word-level timestamps natively in the shape HyperFrames caption layers expect; no second normalization pass. Verified end-to-end on the brainrot 54.6s VO → 121 word entries.

### Failure modes

| Model | Failure mode | Workaround |
|---|---|---|
| `elevenlabs/scribe_v1` + voice endpoints | **Default Node UA → Cloudflare 403.** Geo-blocked regions return HTTP 200 + HTML body cast as `.mp3`. | Send `User-Agent: Mozilla/5.0 (...)` header (already wired). From geo-blocked region, fall back to Kokoro for VO and `openai/whisper-1` for transcription. (Memory: `feedback_elevenlabs_geoblock_html_in_mp3`.) |

## `openai/whisper-1`

OpenRouter `openai/whisper-1` (`--backend openrouter`). One key covers it. Sometimes 400s on long audio; re-encode to 64kbps mono mp3 if you hit them.
