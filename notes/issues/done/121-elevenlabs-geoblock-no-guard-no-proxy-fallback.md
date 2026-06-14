# ElevenLabs geo-block: HTML bodies written as .mp3 (no Content-Type guard), no proxy fallback, proxy calls invisible to gen-log

> **Status:** done — 2026-06-14 (guard + base-URL proxy seam; real SSH proxy VPS remains user infra via the elevenlabs-proxy skill)

**Found:** 2026-06-11, dianatolks-celebdecode wave 2 (voice clone v2 + full re-voice of projects 007–009). The HTML-in-mp3 symptom was first captured in agent memory in an earlier session; this session showed the block is **progressing per-endpoint** and the CLI still has no guard or fallback.

## Symptom (three stacked problems)

1. **No Content-Type guard.** From a geo-blocked region the ElevenLabs API returns HTTP 200 with an HTML body (no 403). The CLI writes that body to disk as a corrupt `.mp3` and reports success. 4 such `voiceover` error/corrupt rows in `dianatolks-celebdecode-008`'s gen-log this session.
2. **The block is per-endpoint and progressive.** TTS on previously-created voices kept working locally while `voices/add` (IVC clone), `audio-isolation`, `speech-to-text`, and TTS on a *newly created* voice all failed. Partial local success masks the block and stalls pipelines mid-run.
3. **No proxy fallback → unlogged work.** The working path (agent-side `elevenlabs-proxy` skill: ssh + curl on a non-blocked VPS, scp artifacts back) bypasses the provider layer entirely, so the session's most important audio work (IVC clone, ~8 TTS takes, ~8 scribe runs) produced **zero `generations.jsonl` rows** — the gen-log/cost-rollup invariant has a proxy-shaped hole.

## Expected

- A non-audio response body is a hard error (`E_GEOBLOCK` or similar), never a file on disk.
- With a configured proxy (`RALPHY_ELEVENLABS_PROXY` or config key), the provider routes the call through it transparently — same verb, same logging, same artifact path.
- Every proxied call writes its gen-log row like any other.

## Likely location

`cli/lib/providers/` (ElevenLabs request path shared by `generate voiceover`, `ref transcribe`, voice management). The guard is a check on `Content-Type` / magic bytes before the file write; the proxy is a base-URL/transport swap, not a new code path.

## Acceptance

- Simulated HTML-200 response → command exits non-zero with a catalog error code; no file written.
- With proxy configured: `ralphy generate voiceover` / scribe succeed from a geo-blocked region and append `generations.jsonl` rows (endpoint marked as proxied).
- Without proxy configured: the error message names the config key to set.
- Proxy host/credentials live in user config — never in the repo.

## Interim agent-side rule (until this lands)

If ANY ElevenLabs endpoint has geo-failed in the current environment before, route ALL 11labs calls through the `elevenlabs-proxy` skill from the start of the session — partial local success is not evidence the next endpoint works.
