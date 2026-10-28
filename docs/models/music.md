# Music models: detail

Per-model detail for the music rows in the [`MODELS.md`](../../MODELS.md) index. Do not read this file whole: `ralphy models show <id>` prints one model's section plus every shared note below that names it.

## Shared notes

### Trend music

**Trend-music rule:** if a template references a specific trend track (`assets/trend-*.mp3`), copy the file from the `ralphy-assets` companion repo. **Don't generate a substitute.** Track recognition is half of what makes a trend video a trend.

### Fallback

**Fallback** (if ElevenLabs Music quality regresses): temporarily route to `fal-ai/lyria2` via `FAL_KEY` as a documented exception. As of 2026-05-08 the fallback is not active; ElevenLabs Music is the only path.

### Avoid

- Suno (not on OpenRouter).
- `lyria2` directly via `FAL_KEY` while ElevenLabs Music works: don't multiply optional keys.

## `elevenlabs/music_v1`

ElevenLabs Music, model id `music_v1`. Subscription (binary audio response). Same key as VO. Validated 2026-05-08: 8s instrumental delivered cleanly via `ralphy generate music`.

**Endpoint contract** (for `cli/lib/providers/media.ts → generateMusic()`):
```
POST https://api.elevenlabs.io/v1/music
Headers: xi-api-key: $ELEVENLABS_API_KEY, Content-Type: application/json
Body: { "prompt": "...", "music_length_ms": 30000, "force_instrumental": true, "output_format": "mp3_44100_128", "model_id": "music_v1" }
Response: 200 → binary mp3 (application/octet-stream)
         400 → JSON ToS rejection (`bad_prompt`) — see "Prompt content policy"
         422 → JSON validation error
```

**Prompt content policy (#006).** ElevenLabs Music ToS rejects prompts that name specific artists / producers / copyrighted tracks (rappers, named producers, song titles, scored themes) with HTTP **400 `bad_prompt`**. The 400 envelope carries a `detail.data.prompt_suggestion` field containing a provider-sanitized rewrite the CLI can resubmit verbatim. The connector surfaces this on `TerminalProviderError.promptSuggestion`; `ralphy generate music --auto-retry-on-tos-rejection` will log the original failure and resubmit once using the rewrite. Use **genre + tempo + instrumentation + mood** framing instead of named entities (e.g. "trap beat, 140 BPM, 808 sub-bass, dark minor-key piano stab"). The CLI runs a soft pre-submit linter (`cli/lib/music-prompt-lint.ts`) against a known artist/track regex set and warns to stderr before submit — non-blocking, false positives are cheaper than missed catches.

### Failure modes

| Model | Failure mode | Workaround |
|---|---|---|
| `elevenlabs/music_v1` | **Artist-name ToS rejection** — naming any rapper / producer / band returns 422 with `prompt_suggestion`. Modern hip-hop especially. | Genre + tempo + instrumentation only; resubmit the API's `prompt_suggestion` verbatim. (Memory: `feedback_elevenlabs_music_no_artist_names`.) |
| `elevenlabs/music_v1` | **Concurrency cap = 2** — 3+ parallel returns `429 concurrent_limit_exceeded` and pollutes `generations.jsonl`. | Serialize music gen or stay ≤2 in-flight (`--concurrency 2`). |

### Lessons

8. **ElevenLabs Music 2-concurrent cap per subscription.** Three+ parallel calls return 429 `concurrent_limit_exceeded` and pollute `generations.jsonl` with error rows. Serialize music gen or stay ≤2 in-flight. Postmortem: tokyo.
