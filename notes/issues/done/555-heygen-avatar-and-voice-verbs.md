# HeyGen persistent avatars + voice clones: CLI verbs

> **Status:** done — 2026-07-28
> **Filed:** 2026-07-28
> **Folder:** issues
> **Severity:** high
> **Category:** providers / media / cli
> **Depends on:** #554 (HeyGen connector + `generate lipsync`) — landed

## What landed

- `cli/lib/avatars.ts` — the workspace performer store
  (`.ralphy/workspaces/<ws>/avatars.json`, `{avatars, voices}` keyed by local
  slug). Append-only: `putAvatar` / `putVoice` version an occupied slug to
  `<slug>.v2` and return the slug actually written; `nextFreeSlug` is pure and
  pinned by test. `resolveVoiceRef` resolves a slug, or passes a raw provider id
  through untouched, so a command line can name either.
- `cli/commands/avatar.ts` — `create | link | list | show | consent | delete`.
  `create` covers all three families (`digital_twin` / `photo` / `prompt`),
  pre-flights the 15-600s training band locally (the create call bills $1.00
  either way), and `--wait` polls to `completed`. `list` merges the store with
  `GET /v3/avatars/looks?ownership=private`, re-reads each group for consent,
  and prints an `unlinked` array of provider-side looks that have no local slug
  yet — `link` adopts one (this is how the four avatars already on the account
  became usable). `delete` drops the LOCAL record only.
- `cli/lib/providers/heygen.ts` — the full v3 surface behind one generic `api()`
  helper: assets, avatars (create / look / looks / group / consent), voices
  (clone / get / list), TTS, videos, lipsyncs, video-translations, `users/me`.
  One `pollJob()` serves all three async routes — they share `status` +
  `video_url` + `duration` + `failure_message`.
- `resolveAvatarEngine()` — the constraint table resolved LOCALLY (pure,
  exported, test-pinned): unknown engine, engine not advertised by the look,
  still-training avatar, and pending/rejected consent each refuse before the
  paid call, with the remediation in the message. Consent blocks EVERY engine
  against a twin, not just `avatar_v` — the observed 400 is scoped to the group.
  Nothing manufactures a consent clip.
- `generate lipsync` gained two input modes beside the #554 `--image` one:
  `--avatar <slug> [--engine]` (persistent, the only path to Avatar V) and
  `--video <ref> --audio <ref> [--quality precision]` (re-dub an existing cut
  through `POST /v3/lipsyncs`). Exactly-one-of validation fires before any path
  resolution. `--quality`, not `--mode`: `--mode` is already the content-mode
  flag from `BUDGET_FLAGS`.
- `voice clone --provider heygen` — one flag, not a second verb. A video source
  has its track stripped locally into a temp mp3 (`compressVoiceSample`) rather
  than writing a derived artifact into the project. Both providers now persist
  into the store. `voice exists|list --provider heygen` and `voice list --stored`
  round out the inspection surface.
- HeyGen also fills the `voice` cell now (`/v3/voices/speech`, Starfish), so the
  performer's own clone can read standalone VO. It sits LAST in `BUNDLED`, so
  ElevenLabs stays the default and HeyGen TTS needs an explicit
  `--provider heygen`. `generate voiceover --voice <slug>` resolves through the
  store.
- `ralphy video translate` + `translate-languages` — per-language dub of a
  finished cut, cost scaling made explicit in `--dry-run` and in MODELS.md.
- `ralphy provider balance` — free wallet/credit pre-flight, the cheapest way to
  learn a paid batch is about to fail on an empty wallet.
- Rate card completed: `avatar-iii-twin` $0.0167, `lipsync-*` $0.0333/$0.0667,
  `translate-*` $0.0333/$0.0667, `tts-starfish` $0.000667,
  `HEYGEN_AVATAR_CREATE_USD` $1.00.

## Bug found and fixed while wiring this (pre-existing, from #554)

`estimatedCallCostUsd({ kind: "video" })` routed every model through
`estimateVideoCostUsd`, whose fallback for an id absent from the OpenRouter
video catalog is **$0.14/s**. Every HeyGen route is absent from that catalog, so
the #444 spend governor priced `avatar-v-twin` at $4.20 per 30s against the
$2.00 the `--dry-run` of the SAME command printed — a 2.8-4.2x disagreement
inside one invocation, in the direction that trips a budget cap early.

Fix follows the established `isFalVideoModel` / `falVideoPricePerSec` pattern:
`isHeygenRoute()` is exported from the connector and `estimatedCallCostUsd`
branches on it, so the governor and the dry-run read the same card.
`tests/unit/providers-heygen.test.ts` pins the equality per route per duration,
plus a negative case that a catalog-backed model keeps its catalog price.

Also mapped `generate.lipsync` in `cli/lib/jobs/spend-gate.ts` `genKindOf()`
(it was falling through to `null`, i.e. "not a paid gen"). The QUEUED estimate
still resolves to 0 because lipsync takes no `--duration` — its length follows
the driving audio, and `deriveJobEstimate` is deliberately IO-free so it cannot
ffprobe the `--audio` path. The queue gate therefore degrades to the coarse
already-at-cap check; the interactive path passes a probed duration and is
exact. Documented in place rather than papered over.

## Known limitation, deliberately not changed

`ralphy doctor` does not report `HEYGEN_API_KEY`. It iterates `CAPABILITIES`,
which holds only the two REQUIRED keys — `FAL_KEY`, `FIRECRAWL_API_KEY` and the
destination connector keys are absent for the same reason. `ralphy provider
list` reports per-connector availability, and `requireProviderKey` fails with
the signup URL on first use. Giving doctor an optional-providers section is a
change to doctor's contract that should cover every optional connector at once,
not a HeyGen special case.

## Deliberately NOT built

The remaining v3 routes are real but do not fit an existing capability cell:

- **`type: "cinematic_avatar"` and `type: "studio"` on `POST /v3/videos`** — both
  are video GENERATION, so exposing them means HeyGen claiming the `video`
  capability, which changes what `connectorsFor("video")` returns. That is a
  separate decision (#554 framed it as future work), not a side effect of this
  issue. Cinematic is also flat-rate $7.00/video, which the per-second cost
  rollup has no shape for.
- **Templates (`/v3/templates`)** — HeyGen Studio templates collide conceptually
  with Ralphy's own Template block (#063). Wiring them needs a naming decision.
- **Webhooks (`/v3/webhook/*`)** — Ralphy polls by design and runs no listener
  (AGENTS invariant #5: no auto-launched processes). The verbs would have no
  consumer.
- **Streaming avatars** — realtime WebRTC, outside a batch content pipeline.

Filed as #556.

## Context

#554 landed the HeyGen connector against the arbitrary-image route
(`type: "image"`, Avatar IV). That route is stateless: every call re-uploads a
still and re-derives the head, so nothing about the performer persists between
shots and the engine is pinned to Avatar IV.

HeyGen's actual model is two-phase and stateful: you **create** an avatar once,
HeyGen trains it, and then every generation references the trained
`avatar_id`. The same holds for voices — you clone once and reference the
`voice_id`. This is what makes a series of ads read as the same person instead
of a fresh approximation per clip, and Avatar V (the current top engine) is
reachable ONLY through a trained avatar.

Ralphy has no surface for either phase. This issue adds it.

## Verified API facts

Everything below was probed live against `api.heygen.com` on 2026-07-28. Do not
re-derive from the docs — several doc pages are stale (they still describe the
v2 `/v2/video/generate` shape and a `training_footage_url` field that the v3
endpoint does not accept).

**Auth:** `x-api-key: $HEYGEN_API_KEY` on every call. Base `https://api.heygen.com`.

**Asset upload** — `POST /v3/assets`, `multipart/form-data`, field `file`, 32 MB cap.
Returns `data.asset_id`. Images, audio and video all go through it.

**Create avatar** — `POST /v3/avatars`:
```json
{ "type": "digital_twin" | "photo" | "prompt",
  "name": "string",
  "file": { "type": "asset_id" | "url" | "base64", "asset_id": "..." },
  "avatar_group_id": "optional" }
```
Returns `data.avatar_group.{id,consent_status}` and
`data.avatar_item.{id,status,supported_api_engines}`. The **look id**
(`avatar_item.id`) is what `POST /v3/videos` wants as `avatar_id` — not the
group id.

**Poll training** — `GET /v3/avatars/looks/{look_id}` → `data.status` is
`processing | completed | failed`, `data.error.{code,message}` on failure,
`data.supported_api_engines` populated only once `completed`. A 15s clip took
~100s to train. Also useful: `GET /v3/avatars/{group_id}` for
`consent_status`, and `GET /v3/avatars/looks?ownership=private[&avatar_type=digital_twin]`
to enumerate.

**Register consent** — `POST /v3/avatars/{group_id}/consent` with
`consent_video: { "type": "url" | "asset_id", ... }`.

**Clone a voice** — `POST /v3/voices/clone`:
```json
{ "audio": { "type": "asset_id", "asset_id": "..." },
  "voice_name": "string (1-100)",
  "language": "English",
  "remove_background_noise": true }
```
Returns `data.voice_clone_id`. Poll `GET /v3/voices/{voice_id}` until
`data.status == "complete"`. Cap is 10 clones per account. An 8s mono 128k mp3
cloned fine.

**Generate** — `POST /v3/videos`:
```json
{ "type": "avatar",
  "avatar_id": "<look id>",
  "script": "spoken text",
  "voice_id": "<cloned or library voice>",
  "engine": { "type": "avatar_v" },
  "aspect_ratio": "9:16", "resolution": "1080p", "output_format": "mp4" }
```
`engine.type` ∈ `avatar_v | avatar_iv | avatar_iii`; omitting it defaults to
`avatar_iv`. `audio_asset_id` / `audio_url` substitute for `script` + `voice_id`
when driving from a finished audio track. Poll `GET /v3/videos/{video_id}`
(`pending|processing|completed|failed`, `data.video_url` presigned).

**List voices** — `GET /v3/voices?ownership=private`. The id field is
`voice_id` (NOT `id` — a `.data[].id` jq path silently yields null).

## The engine/consent constraint (the load-bearing finding)

| Avatar type | Consent required | Engines exposed |
|---|---|---|
| `digital_twin` (trained from ~15s video) | **YES** | `avatar_v`, `avatar_iv`, `avatar_iii` |
| `photo` (from a still) | no (`consent_status: null`) | `avatar_iv`, `avatar_iii` only |
| stock/public looks (e.g. the "Marco" set) | n/a | `avatar_v`, `avatar_iv`, `avatar_iii` |

So **Avatar V on an own avatar implies `digital_twin`, which implies consent.**
Generation against a non-consented twin fails hard:

```
HTTP 400 {"error":{"code":"avatar_consent_required",
  "message":"Avatar group '<id>' requires consent before video generation."}}
```

The consent video must show the same person as the training footage saying
"I, [Full Name], hereby allow HeyGen to use the footage of me to build a HeyGen
avatar." A synthetic performer cannot satisfy this; a real person has to record
it, or the account needs HeyGen's enterprise waiver. Do NOT build any code path
that manufactures a consent clip — the verb surface should surface the
`avatar_consent_required` error with the remediation, never route around it.

Training also rejects footage outside a length band: an 8.0s clip failed with
`training_failed: "Footage is too short or too long"`; a 15.0s clip trained
clean. Validate locally with `probeDurationSec` before spending the upload, and
name the observed band in the error.

## What to build

Match the existing verb conventions exactly — read `cli/commands/generate.ts`
(the `lipsync` subcommand from #554) and `cli/commands/voice.ts` first. Every
call routes through the connector; nothing outside
`cli/lib/providers/heygen.ts` may read `HEYGEN_API_KEY` or touch a HeyGen host
(the invariants test enforces this per-file).

1. **`ralphy avatar` command group** (`cli/commands/avatar.ts`):
   - `create --from <video|image> --name <n> --type digital_twin|photo [--workspace <ws>] [--wait]` —
     upload, create, and with `--wait` poll to `completed`. Pre-flight the
     duration band for `digital_twin` and fail before the upload.
   - `list [--workspace <ws>]` — merge the locally persisted avatars with
     `GET /v3/avatars/looks?ownership=private`, showing `status`,
     `consent_status` and `supported_api_engines` per row. The engine column is
     the whole point: it is how a user learns why `avatar_v` is unavailable.
   - `show <slug>` — one avatar, including the last training error.
   - `consent <slug> --video <path|url>` — register a consent video, then
     re-poll the group.
2. **Persistence.** An avatar and a voice are account-level, reusable, and
   expensive to recreate — they belong to the workspace, not a project. Store
   them under the workspace (a `avatars` / `voices` map in `workspace.json`, or
   a sibling `avatars.json`) keyed by a local slug → `{provider, lookId,
   groupId, type, engines, consentStatus, trainedAt, sourceVideo}`. Every verb
   below must accept the local slug, so no HeyGen id ever has to appear in a
   command line. Append-only: a re-`create` on an existing slug versions rather
   than overwrites.
3. **Voice cloning.** Extend `ralphy voice clone` with `--provider heygen`
   rather than adding a second clone verb — same intent, same output shape,
   one flag. Persist the resulting `voice_id` next to the avatars. Accept a
   video path and strip the audio locally (the source is usually a clip, not an
   mp3).
4. **Generation.** ALREADY PARTLY LANDED — `generate lipsync` now takes
   `--script` / `--script-file` + `--voice <voiceId>` as an alternative to
   `--audio`, with mutual-exclusion and missing-voice guards, and the connector
   sends `script` + `voice_id` on the image route. That is what unblocked
   driving the head with a clone of the performer's own voice. Do NOT redo it.
   What is left: add the persistent-avatar mode to `ralphy generate lipsync`
   instead of a new verb — it is the same `lipsync` capability and the same
   output kind. Two mutually exclusive input modes:
   - `--image <ref> --audio <ref>` — the existing stateless #554 path;
   - `--avatar <slug> [--script <text> | --script-file <path>] [--voice <slug>] [--engine avatar_v]` —
     the persistent path. `--engine` must default to `avatar_v` when the
     resolved avatar advertises it, and error with the constraint table above
     when the user asks for `avatar_v` on an avatar that cannot serve it.
   Reject an `--engine avatar_v` request against a `pending` consent group
   locally, before spending the call, and print the consent remediation.
5. **Pricing.** `heygenPricePerSec()` already prices the routes; wire
   `avatar_v` → the `avatar-v-twin` rate ($0.0667/s) and keep the gen-log row
   shape unchanged.

## Tests

Extend `tests/unit/providers-heygen.test.ts`; do not start a new file.

- Pure: the duration-band pre-flight (8s rejected, 15s accepted), the
  engine-vs-avatar-type resolution table, and the slug → id lookup.
- Verb surface: `--help` for each new verb, and a `--dry-run` that prices an
  `avatar_v` generation without submitting.
- Registry: `lipsync` still resolves to `heygen` and still claims no other cell.
- No network in unit tests. Stub at the connector boundary.

Run `bun test` and every `bun run lint:*` before handing back. `tsc` currently
fails on `cli/lib/publish/mapping.ts:51` from unrelated uncommitted work —
that one pre-exists this task.

## Already created on the account (2026-07-28 probes)

Left in place deliberately; delete only on an explicit ask.

| Kind | Id | State |
|---|---|---|
| digital twin (8s hook clip) | group `23634a8a949442a5a11372021f70d91e`, look `adc83bb901194684998dd94f0218567b` | `failed` — footage too short |
| digital twin (15s presenter clip) | group `9e0c9d1fd686414494458bf318075467`, look `0eba0781160d4b8a848bdd81316c3a0a` | `completed`, engines include `avatar_v`, consent `pending` |
| photo avatar (hook frame) | group `bd5477c1c3fc4d0b9e52c1257a1514cf`, look `1e09cd52abdd4145a5d6e76194b387b9` | engines `avatar_iv`/`avatar_iii` only |
| voice clone (hook audio) | `171a67903ed94cfea1974aefb7bb183c` | `complete` |
