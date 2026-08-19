# HeyGen: the v3 routes #555 deliberately left out

> **Status:** open
> **Filed:** 2026-07-28
> **Folder:** issues
> **Severity:** low
> **Category:** providers / media / cli
> **Depends on:** #555 (avatars + voices + lipsync + translate) — landed

## Context

#555 covered the routes that map onto an existing Ralphy capability cell:
`lipsync` (three input modes), `voice` (TTS + cloning), avatar management, video
translation, and the account balance. The connector (`cli/lib/providers/heygen.ts`)
now has a generic `api()` helper and a shared `pollJob()`, so each remaining
route is a function plus a verb — the work is the DECISION each one needs, not
the plumbing.

Four routes are still unreachable. None of them is blocked on HeyGen; each is
blocked on a Ralphy-side call.

## 1. `type: "cinematic_avatar"` (POST /v3/videos)

Prompt + 1-3 trained look ids + up to 3 reference videos / 9 reference images →
a 4-15s cinematic clip. `aspect_ratio` 16:9 | 9:16 | 1:1, `resolution` 720p |
1080p, `auto_duration`, `enhance_prompt`.

**Decision needed:** this is video GENERATION, so exposing it means the HeyGen
connector claiming the `video` capability. Today `tests/unit/provider-registry.test.ts`
asserts `connectorsFor("video")` is exactly `["openrouter", "fal"]`, and #554
recorded "claims only the lipsync cell" as a deliberate property. Claiming
`video` from last position would not change the DEFAULT provider, but it does
change what `provider list --capability video` reports and what a bare
`--provider heygen` on `generate video` resolves to.

**Second problem:** it bills **$7.00 per video, flat** (4-15s). Every other
video route in `heygenPricePerSec()` is per-second, and the cost rollup assumes
`rate × seconds`. A flat-rate route needs either a separate pricing function or
a `pricePerCall` field on the route table.

Worth it for: the "same trained performer, but cinematic camera language"
brief that neither i2v (identity drift) nor lipsync (static head) serves.

## 2. Templates (`GET /v3/templates`, `GET /v3/templates/{id}`, `POST /v3/templates/{id}`)

HeyGen Studio templates with typed variables (`text` | `image` | `video` |
`audio` | `character` | `voice`), subtitle presets, `dimension`, `fps`.

**Decision needed:** the word "template" is already load-bearing in Ralphy — a
Template is one of the four typed blocks a Unit is made of (#063), matched by
`ralphy template suggest`. A `ralphy template list --provider heygen` would
return something that is NOT a Ralphy template, which is exactly the kind of
collision `docs/skills-vs-templates.md` exists to prevent. Options: a distinct
noun (`ralphy avatar-template`), a sub-namespace, or skip it entirely on the
grounds that HyperFrames already owns composition.

Lowest value of the four: Ralphy composes in HyperFrames, so a provider-side
scene template duplicates the layer we control.

## 3. Webhooks (`/v3/webhook/endpoints`, `/event-types`, `/events`, rotate-secret)

Seven endpoints: create / list / update / delete an endpoint, rotate the signing
secret, enumerate event types, list delivered events.

**Decision needed:** every async route in the connector already accepts a
`callback_url`, and Ralphy polls instead — deliberately, per AGENTS invariant #5
(no auto-launched processes; chat is the interface). Webhook MANAGEMENT verbs
would be pure passthrough with nothing on the other end. They only start paying
off if the daemon (`ralphy daemon`) grows an HTTP listener, which is a much
bigger decision than this issue.

The one piece with standalone value: `GET /v3/webhook/events` as a read-only
audit trail — "what did HeyGen actually deliver for job X" — when a poll times
out and we want to know whether the job finished after we stopped watching.
That could land alone as `ralphy provider events --provider heygen`.

## 4. Streaming avatars

Realtime WebRTC sessions. Out of scope for a batch content pipeline; listed here
only so the next person does not re-derive that conclusion.

## Also worth picking up cheaply

- `GET /v3/videos` (list) + `DELETE /v3/videos/{id}` — an account-side inventory
  and cleanup. Ralphy downloads every output into the slot, so provider-side
  copies accumulate with no verb to see or drop them.
- `POST /v3/voices/design` — HeyGen's text-to-voice design, the sibling of
  `ralphy voice design` (which is ElevenLabs-only). Same human-picks-by-ear
  shape, so it would slot into the existing verb behind `--provider heygen`.
- `PATCH /v3/avatars/looks/{id}` (update a look) — rename / retag. Cosmetic.
- Translation lifecycle verbs (`GET /v3/video-translations` list, `DELETE`) —
  same argument as the video list above.

## Notes

Do NOT re-derive the API shapes from the docs pages that #555 flagged as stale.
The verified shapes are in `cli/lib/providers/heygen.ts` and in
`notes/issues/done/555-heygen-avatar-and-voice-verbs.md`. Rates come from
developers.heygen.com/docs/pricing (read 2026-07-28): cinematic avatar
$7.00/video, video agent $0.0333/s, AI clipping $0.15/clip, filler-word removal
$0.01/s of source.
