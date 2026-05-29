# `ralphy generate` has no retry on transient provider errors

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

Network-class blips (TLS handshake, ECONNRESET, ETIMEDOUT, HTTP 5xx empty body) and provider quirks (gemini "skeleton null" with `finish_reason:null, content:null`, gpt-image-2 empty-`images` response, OpenRouter 502) all surface to the user as terminal errors that abort one slot in an otherwise running batch. Every multi-slot session re-discovers the failure mode and burns an iteration.

## What

- `kbo-broadcast-001`: 4 consecutive null gemini responses before the 5th succeeded; no retry, error path swallowed the skeleton.
- `free-air-vpn-stickerpack`: "unknown certificate verification error" failed first attempt, succeeded second; TLS blip lost 3 batch slots elsewhere.
- `ralphy-carousel-001`: 3 batch slots failed with TLS / socket errors mid-run — gpt-image-2 is 1-concurrent so each blip silently leaves a hole.
- `choose-your-guide-001`: OpenRouter 502 silently produced `video-analysis.json` with empty `preview`.
- `flipper-hypermotion-001`: gpt-5.4-image-2 returned 200 with no image data; one scene-07 silently dropped.
- `appstore-takeaminute-001`: single TLS blip aborted one job out of 73.

## Why it matters

Holes in batch outputs are invisible until manual disk diff; the agent then re-fans the whole batch or hand-retries. Cost and time bleed compounds with batch size.

## Suggested fix

- Wrap OpenRouter / ElevenLabs calls in `cli/lib/providers/media.ts` with 2-retry exponential backoff (1s → 4s → 16s) on:
  - TLS / ECONNRESET / ETIMEDOUT / DNS classes
  - HTTP 5xx with empty body
  - HTTP 200 with missing `images[0]` / `audio` / `video` payload (treat as transient)
  - `finish_reason: null` with `content: null` (gemini skeleton)
  - `MALFORMED_FUNCTION_CALL`
- Do NOT retry terminal classes (4xx semantic errors, content-policy moderation, ToS rejections).
- On final failure, do NOT write a stub output file — surface the raw response body in the error.
- Log each retry as a row in `generations.jsonl` with `attempt: N`.
- Expose `--no-retry` for testing.

## Sources

- `workspace/projects/kbo-broadcast-001/postmortem/03-cli-issues.md` — gemini skeleton-null
- `workspace/projects/free-air-vpn-stickerpack/postmortem/03-cli-issues.md` — TLS micdrop
- `workspace/projects/ralphy-carousel-001/postmortem/03-cli-issues.md` — batch holes
- `workspace/projects/choose-your-guide-001/postmortem/03-cli-issues.md` — OR 502 silent
- `workspace/projects/flipper-hypermotion-001/POSTMORTEM.md` — gpt-image empty response
- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md` — TLS blip
