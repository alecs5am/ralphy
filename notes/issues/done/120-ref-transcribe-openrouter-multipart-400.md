# `ref transcribe --backend openrouter` fails with HTTP 400 (malformed multipart)

> **Status:** done — 2026-06-14 (live smoke pending: needs one paid OpenRouter transcribe call to confirm end-to-end)

**Found:** 2026-06-11, dianatolks-celebdecode wave 2 (word-level RU transcripts for the voice-clone QA loop and scene-boundary derivation).

## Symptom

```
ralphy ref transcribe <mp3> --backend openrouter
# HTTP 400 — multipart request rejected
```

The multipart body the CLI builds is rejected by the endpoint. The verb is currently unusable on this backend.

## Impact

The transcribe step is load-bearing twice per VO take (invariant #16 scribe-first timing + the clone-take QA text-diff). With the verb broken AND the local ElevenLabs `speech-to-text` endpoint geo-blocked (see #121), the entire transcription path ran by hand this session:

```bash
scp take.mp3 <proxy>:/tmp/
ssh <proxy> 'curl -s -X POST https://api.elevenlabs.io/v1/speech-to-text \
  -H "xi-api-key: $KEY" -F model_id=scribe_v1 -F language_code=ru -F file=@/tmp/take.mp3'
# + ad-hoc python: words[] -> Caption[] {text, startMs, endMs, timestampMs, confidence}
```

The hand conversion gets rewritten every session and nothing lands in the gen-log.

## Expected

`ralphy ref transcribe <mp3> --lang ru` returns `Caption[]` JSON.

## Likely location

`cli/commands/ref.ts` (transcribe subcommand) + the multipart encoding in the provider call — inspect how the file part and form fields are assembled (boundary / field-order / content-type of the file part are the usual suspects with Bun's FormData against picky endpoints).

## Acceptance

- `ralphy ref transcribe <mp3> --backend openrouter --lang ru` succeeds and emits `Caption[]`.
- A `--backend elevenlabs-proxy` (or proxy fallback, see #121) covers the geo-blocked case.
- The call writes a `generations.jsonl` row.
