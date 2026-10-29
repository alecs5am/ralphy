# Video models: detail

Per-model detail for the video rows in the [`MODELS.md`](../../MODELS.md) index (text-to-video and image-to-video). Do not read this file whole: `ralphy models show <id>` prints one model's section, every shared note below that names it, and (for OpenRouter models) the live catalog parameters.

## Shared notes

### Endpoint and job lifecycle

Endpoint: **async-job pattern** at `POST /api/v1/videos`. Submit returns `{ id, status, polling_url }`; poll until `completed`; download via `GET /api/v1/videos/{id}/content?index=0` (auth required). The legacy `/api/v1/videos/generations` returns 404. `cli/lib/providers/media.ts → generateVideo()` handles the full job lifecycle (15s × 80-poll = 20 min budget; tunable).

### Catalog snapshot

Each model section below carries a one-line snapshot from the per-model matrix (live from `/api/v1/videos/models`, snapshot 2026-05-08). Always recheck via `ralphy models list` or `ralphy models show <id>`. These arrays change.

### Per-clip pricing

> **Pricing reality check (2026-05-11):** OpenRouter bills video generation **per-clip flat**. The duration parameter sets the clip length and the billed cost ≈ rate × duration. A `✓` in the rate column means we verified the rate against actual OR billing on 2026-05-11 (see `docs/render-test-2026-05-11.md` §1.1). Earlier docs claimed half-price std and per-second steps that didn't match observation; those have been corrected here and in `cli/lib/providers/media.ts:VIDEO_PRICE_PER_SEC`. Models without `✓` are ballparks from the OR catalog. Verify on first use and add `✓` once confirmed.

> **Catalog recheck (2026-10-30, #568):** the live OR catalog now lists lower per-second prices than the 2026-05-11 figures: `kwaivgi/kling-v3.0-pro` $0.112/s silent / $0.168/s with audio (matches our billing: a 6 s silent clip logged $0.672 on 2026-10-09), `kwaivgi/kling-v3.0-std` $0.084 / $0.126, `kwaivgi/kling-video-o1` $0.112, `google/veo-3.1` $0.20 / $0.40 (4K $0.40 / $0.60), `google/veo-3.1-fast` $0.10 / $0.12 (4K $0.25 / $0.30), `google/veo-3.1-lite` $0.05 / $0.08, `minimax/hailuo-2.3` $0.0817. Seedance is billed per video token. The hand-maintained estimate tables (`VIDEO_PRICE_PER_SEC` in `cli/lib/providers/openrouter.ts` and `cli/lib/or-catalog.ts`) still carry the older numbers, so `--dry-run` and `ralphy models show` over-estimate these models until they are synced.

3. **OR's per-clip billing** is fixed (e.g., a 5s kling-pro clip is ~$0.70 regardless of "duration in body" precision). The per-second figures above are therefore ballparks; pre-flight `--dry-run` to see the estimate before submitting.

### When to pick which

| You need | Pick |
|---|---|
| **Default narrative i2v**, character consistency, hold a keyframe | `kwaivgi/kling-v3.0-pro` |
| **Cheap batch** (≥10 clips) where keyframe drift is acceptable | `kwaivgi/kling-v3.0-std` ($0.084/s silent vs pro $0.112/s on the 2026-10-30 catalog; `veo-3.1-lite` at $0.05/s is cheaper still for non-photoreal-human work) |
| **Talking-head / face / lip-sync style** | `google/veo-3.1` (model-native audio with `--audio` works in EN; **off for RU/UA** — only Chinese + English are clean) |
| **4K** mastered hero piece | `google/veo-3.1-fast` (4K is also listed for `google/veo-3.1` and `bytedance/seedance-2.0` on the 2026-10-30 catalog) |
| **Sharp physics motion** (parkour, sports, falling) | `bytedance/seedance-2.0` (also the only path to 21:9 cinema aspect) |
| **3:4 / 4:3 portrait magazine** | `alibaba/wan-2.7` (only model with these in stock) |
| **Cheapest viable** | `bytedance/seedance-2.0-fast` |

### Routing rules (which video model for what)

Apply these before drafting a `ralphy generate video` prompt. They short-circuit re-rolls.

- **Hyper-motion** (explosions, runway-sprint, coin-arcs, particle bursts, sports collisions, parkour, falling) → `bytedance/seedance-2.0`. Kling reads these as narrative beats and softens the physics. **Caveat:** seedance's privacy filter rejects photoreal-human i2v anchors — only use seedance hyper-motion on cartoon / non-human / landscape / hands / abstract subjects.
- **Talking-head, photoreal humans, slow narrative, lip-sync** → `kwaivgi/kling-v3.0-pro`. Multi-frame works post-2026-05-19. `--audio` for EN VO only.
- **4K hero piece** → `google/veo-3.1-fast` (cheapest 4K; `google/veo-3.1` and `bytedance/seedance-2.0` also list 4K as of 2026-10-30).
- **3:4 / 4:3 portrait magazine aspect** → `alibaba/wan-2.7` (only model with these in stock).
- **Cinema 21:9** → `bytedance/seedance-2.0` (only model with 21:9 in stock).
- **Photoreal humans + body-horror anchor** → `kwaivgi/kling-v3.0-pro` only. Seedance rejects the anchor, veo rejects both prompt and anchor (video lessons 6 + 11).
- **Cheapest acceptable batch** → `google/veo-3.1-lite` ($0.05/s silent) for non-photoreal-human work; otherwise `kwaivgi/kling-v3.0-std` ($0.084/s silent, cheaper than pro but worse keyframe holds).

### Language and `--audio`

4. **`generate_audio: true` is unsafe outside English.** Confirmed for `kwaivgi/kling-v3.0-pro`, `bytedance/seedance-2.0`, and `google/veo-3.1` on Russian — accent slips, voice age drifts, text gets cut. Default is `false`; only enable for EN with `--audio`.

**`--audio` policy: SPEECH vs AMBIENT/DIEGETIC.** Two distinct audio jobs hide behind the single `--audio` flag — different rules apply.

- **SPEECH (on-camera VO / dialogue / lip-sync).** Stakes are high — voice age, accent, and word-cut are visible.
  - **Default:** `google/veo-3.1` for English on-camera dialogue.
  - **`kwaivgi/kling-v3.0-pro --audio` works for EN only.** Slips on RU / UA / non-English (memory `feedback_kling_no_ru_audio`). For RU, render silent + post-mix ElevenLabs `eleven_multilingual_v2` in the editor stage.
  - `bytedance/seedance-2.0 --audio` is not validated for SPEECH — treat as off.
- **AMBIENT / DIEGETIC (background noise, footsteps, crowd murmur, wind, traffic, room tone, prop SFX).** Stakes are low — language doesn't apply.
  - **Any of kling / seedance / veo `--audio: true`** are fine. Generate alongside the visuals; cheaper than a separate SFX pass.
  - If the brief explicitly bans music (most UGC beds do), keep the `no music — only diegetic ambient + sparse SFX` clause in the prompt regardless of which model.

When in doubt: SPEECH = veo (EN) / kling-EN-only / silent+ElevenLabs (everything else). AMBIENT = whichever video model is already in the shot list.

### Concurrency caps (all providers)

9. **Per-endpoint concurrent-call caps are now self-throttled in-process** (`cli/lib/providers/concurrency.ts`, #007). The semaphore wraps every network round-trip so the CLI never round-trips an over-cap call; the retry helper sits OUTSIDE the semaphore so backoff sleeps don't pin a slot. Current caps:
   - `elevenlabs/tts` — **3 concurrent** (choose-your-guide-001: 9 parallel → 6 hard-failed 429).
   - `elevenlabs/music_v1` — **2 concurrent** (tokyo-y2k-001: 3 parallel → 1 hard-failed 429).
   - `openrouter:openai/gpt-5.4-image-2` — **2 concurrent** (validated 2026-05-29; appstore-takeaminute-001 hit 73/73 403 on uncapped fan-out).
   - `openrouter:google/gemini-3-pro-image-preview` — **2 concurrent** (catalog tolerates ≥4, kept at 2 for shared-key safety).
   - `openrouter:bytedance/seedance-2.0` — **1 concurrent** (queue depth + multi-block extend is inherently sequential).
   - `openrouter:kwaivgi/kling-v3.0-pro` — **2 concurrent**.
   - LLM chat-completions default — **4 concurrent**.
   - Default fallback for unknown endpoints — **2 concurrent**.
   When the per-key OR cap still trips despite the semaphore (e.g. two `ralphy` processes sharing one key), `shared.ts → rewriteUpstreamError()` now surfaces the 403 as `"concurrent-call limit on <model>; try --concurrency 1 or switch model. (This is NOT a $ balance issue — check 'ralphy doctor' for credits.)"` — no more credits-misread.
   Follow-up: the in-process semaphore does NOT span processes. The queue daemon's own worker count gates cross-process for now; a file-locked queue is a future enhancement.
   Postmortems: appstore / analog-horror / tokyo / choose-your-guide.

### Clip duration overshoot

12. **`kwaivgi/kling-v3.0-pro` and `bytedance/seedance-2.0` overshoot `--duration` by ~1s.** Both models return clips ~1 second longer than the requested `--duration` — silent, billed against the requested duration, not the delivered one. tokyo-y2k-001 measured `5s/4s/9s` storyboard → `6.04/5.04/10.04` actual; planned 75s of clips landed as 90.7s of raw mp4. Editor recipe (pre-shorten at art-director stage, or budget a vision-trim pass) lives in [`.agents/skills/editor/references/render-pipeline.md → Source-clip duration overshoot`](../../.agents/skills/editor/references/render-pipeline.md#source-clip-duration-overshoot-kling--seedance). Filed long-form: [`notes/issues/done/042-clip-duration-overshoot-undocumented.md`](../../notes/issues/done/042-clip-duration-overshoot-undocumented.md). Postmortem: tokyo-y2k-001 (workflow-fixes #3).

| Model | Failure mode | Workaround |
|---|---|---|
| `kling` + `seedance` (both) | **`--duration` overshoots by ~1s** (video lesson 12 above). | Pre-shorten at art-director stage OR budget a vision-trim pass in the editor. See [`.agents/skills/editor/references/render-pipeline.md`](../../.agents/skills/editor/references/render-pipeline.md#source-clip-duration-overshoot-kling--seedance) + [`notes/issues/042`](../../notes/issues/done/042-clip-duration-overshoot-undocumented.md). |

### fal connector (`--provider fal`, #402)

Two reference-to-video models that do **not** exist on OpenRouter live behind the
registered `fal` connector (`cli/lib/providers/fal.ts`, env `FAL_KEY`). This is
the **only** sanctioned path to fal — never raw curl (AGENTS.md invariant #1).
Reach them with `ralphy generate video --provider fal --model <id>`. The
connector handles the queue submit → poll → result lifecycle, uploads local refs
to the fal CDN (`storage/upload/initiate` → PUT → `file_url`), downloads the mp4
into `artifacts/videos/` (auto-versioned), and writes a `generations.jsonl` row
with `cost_usd`.

- Pricing sourced from the fal docs / model schema fetched 2026-06-12, re-verified
  against the live schema at implementation time. Cost computation lives in
  `falVideoPricePerSec()` in `cli/lib/providers/fal.ts`. Live end-to-end mp4 smoke
  is pending a maintainer go-ahead (one paid call) — see `notes/issues/402-*`.

## `kwaivgi/kling-v3.0-pro`

Snapshot: durations 3-15 s · 720p · 9:16, 16:9, 1:1 · first + last frame anchors · $0.112/s silent, $0.168/s with audio (catalog 2026-10-30; was $0.14/s billed ✓ on 2026-05-11).

### Failure modes

Append-only. Each row is a quirk that has already cost ≥1 re-roll across sessions.

| Model | Failure mode | Workaround |
|---|---|---|
| `kwaivgi/kling-v3.0-pro` | **Multi-frame (first+last) base64 reliably 400s** even after the 2026-05-19 C2PA strip — flipper / glitter-cream / playdate / venom all reproduced. | **Preflight-rejected client-side** as of 2026-05-30 (#008). Use `bytedance/seedance-2.0` for multi-frame anchoring (honors `--last-frame` natively for non-photoreal-human anchors). |
| `kwaivgi/kling-v3.0-pro` | **`--audio` slips on Russian / UA** — accent slip, voice-age drift, occasional cut text. EN is clean. | Use `--audio` for EN VO only. For RU / non-EN, generate silent clip + post-mix ElevenLabs VO in the editor stage. (Memory: `feedback_kling_no_ru_audio`.) |
| `kwaivgi/kling-v3.0-pro` | **2500-char prompt cap** — OR returns 400 round-trip if exceeded. | **Preflight-rejected client-side** as of 2026-05-30 (#008). Trim atmosphere/setting paragraphs first; never cut voice-tag, no-music, on-camera-EN clauses (load-bearing). |
| `kwaivgi/kling-v3.0-pro` | **Wide-prompt rotation inside 9:16** — landscape wording biases composition to 16:9 inside the portrait container. | Anchor with `--first-frame <portrait>` and rewrite prompt with explicit vertical wording (video lesson 1 below). |

### Lessons (2026-05-08 session onward)

1. **`kwaivgi/kling-v3.0-pro` rotates "wide" prompts inside the 9:16 container.** Phrases like *"wide overhead cityscape"*, *"massive crowd in town square"*, *"dancers under starlit sky"* bias the model toward landscape composition; OR returns a 1080×1920 file but the *content* is laid out for 16:9. **Fix:** anchor with `--first-frame <portrait-image>` and rewrite the prompt with explicit vertical wording (*"tall vertical portrait shot, low camera angle looking up, narrow alley framing, subjects centered vertically, half-timbered houses tower vertically on both sides"*). The first-frame image overrides the model's compositional bias.
2. **`--resolution 720p` is silently upgraded** to 1080p by `kwaivgi/kling-v3.0-pro` even though the catalog only lists 720p. The output dimension is whatever the model decides; treat resolution as a soft hint and let downstream HyperFrames / ffmpeg crop+scale to the composition's exact frame.
5. **`kwaivgi/kling-v3.0-pro --last-frame` historically returned `400 "File is not in a valid base64 format"` even with a clean PNG anchor.** Root cause was C2PA / EXIF metadata that the provider parsed too eagerly; the 2026-05-19 `resolveImageRef()` strip helped on single-frame but the multi-frame (first+last together) path kept failing across flipper / glitter-cream / playdate / venom regardless of source. **As of 2026-05-30 (#008), `generateVideo()` preflight-rejects the kling-v3.0-pro multi-frame combination as `TerminalProviderError` with a pointer to `bytedance/seedance-2.0`** — which honors `--last-frame` natively across all aspects. No more wasted round-trips. Postmortems flagging this: playdate / flipper / venom / glitter-cream.
7. **`kwaivgi/kling-v3.0-pro` 2500-char prompt cap.** OR returns 400 after a round-trip if you exceed it. **As of 2026-05-30 (#008), `generateVideo()` preflight-rejects prompts >2500 chars as `TerminalProviderError` before any submit** — no more 4× wasted round-trips per session. The cap lives in a per-model `MAX_PROMPT_CHARS` map in `cli/lib/providers/openrouter.ts`; add a row when another model documents a hard cap. Trim atmosphere/setting paragraphs first — voice-tag, no-music, on-camera-EN clauses are load-bearing and should never be cut. Postmortem: glitter-cream.

## `kwaivgi/kling-v3.0-std`

Snapshot: durations 3-15 s · 720p · 9:16, 16:9, 1:1 · first + last frame anchors · $0.084/s silent, $0.126/s with audio (catalog 2026-10-30; it billed the same as pro on 2026-05-11).

## `kwaivgi/kling-video-o1`

Snapshot: durations 5, 10 s · 720p · 9:16, 16:9, 1:1 · first + last frame anchors · $0.112/s (catalog 2026-10-30).

## `google/veo-3.1`

Snapshot: durations 4, 6, 8 s · 720p, 1080p, 4K · 9:16, 16:9 · first + last frame anchors · $0.20/s silent, $0.40/s with audio; 4K $0.40 / $0.60 (catalog 2026-10-30). Reference-image mode (up to 3 subject images) returns 8 s only on Vertex; OR does not expose clip extension.

### Failure modes

| Model | Failure mode | Workaround |
|---|---|---|
| `google/veo-3.1` | **Body-horror filter scans the anchor frame independently of the prompt** — sanitizing the prompt does not unblock if the input frame reads as body-horror. | For photoreal-human + body-horror, use `kwaivgi/kling-v3.0-pro`; skip veo + seedance round-trips on those jobs (video lesson 11 below). |
| `google/veo-3.1` | **8s clip cap** — needs Kling 15s for longer narrative beats. | Use `kwaivgi/kling-v3.0-pro` for >8s; chain veo clips for talking-head only when the cut is acceptable. |

### Lessons

11. **`google/veo-3.1` body-horror filter** rejects both the prompt AND the input frame independently. Sanitizing the prompt (stripping skinwalker / werewolf / vertebrae / Cronenberg words) does NOT unblock the path — Google's filter ALSO scans the first/last-frame anchor and refuses when the anchor itself is clearly body-horror. Combined with seedance's photoreal-human rejection (video lesson 6), this leaves `kwaivgi/kling-v3.0-pro` as **the only viable i2v provider for the photoreal-human + body-horror combination** that voidstomper-style content requires. Skip seedance and veo round-trips on those jobs; go straight to Kling. Postmortem: voidstomper-test-001 (2026-05-25).

## `google/veo-3.1-fast`

Snapshot: durations 4, 6, 8 s · 720p, 1080p, 4K · 9:16, 16:9 · first + last frame anchors · $0.10/s silent, $0.12/s with audio; 4K $0.25 / $0.30 (catalog 2026-10-30; was $0.14/s billed ✓ on 2026-05-11).

## `google/veo-3.1-lite`

Snapshot: durations 4, 6, 8 s · 720p, 1080p · 9:16, 16:9 · first + last frame anchors · $0.05/s silent, $0.08/s with audio (catalog 2026-10-30).

## `openai/sora-2-pro`

**Retired.** OpenAI shut down the Sora 2 models and the Videos API on 2026-09-24 with no one-to-one replacement (OpenAI video-generation guide; link in `.agents/skills/art-director/references/characters-and-backgrounds.md` → Sources), and the OR video catalog no longer lists any OpenAI model (checked 2026-10-30). Do not route work here; the row stays so `ralphy models show` answers with this note.

## `minimax/hailuo-2.3`

Snapshot: durations 6, 10 s · 1080p · **16:9 only** · first frame only · $0.0817/s (catalog 2026-10-30).

## `alibaba/wan-2.6`

Snapshot: durations 5, 10 s · 720p, 1080p · 9:16, 16:9 · first frame only · ~$0.10/s.

## `alibaba/wan-2.7`

Snapshot: durations 2-10 s · 720p, 1080p · 9:16, 16:9, 1:1, 4:3, 3:4 · first + last frame anchors · ~$0.10/s.

## `bytedance/seedance-2.0`

Snapshot: durations 4-15 s · 480p, 720p, 1080p · **7 aspects incl 21:9 cinema** · first + last frame anchors · $0.14/s billed ✓.

### Failure modes

| Model | Failure mode | Workaround |
|---|---|---|
| `bytedance/seedance-2.0` | **Privacy filter blocks photoreal-human i2v anchors** — `InputImageSensitiveContentDetected.PrivacyInformation`, even when the human is AI-generated. | Reserve seedance for cartoons / non-human / landscapes / hands / abstract motion. Photoreal humans → `kwaivgi/kling-v3.0-pro`. (Memory: `feedback_seedance_rejects_realistic_people`.) |
| `bytedance/seedance-2.0` | **Concurrency cap = 1** (effective, per current OR keys). | Serialize multi-clip jobs; parallelize across providers, not within seedance. |

### Lessons

6. **`bytedance/seedance-2.0` privacy filter rejects photoreal-human anchors** with `InputImageSensitiveContentDetected.PrivacyInformation`, even when the human was itself AI-generated. Reserve seedance for cartoons / non-human anchors / landscapes / hands / abstract motion. For photoreal humans, default to `kwaivgi/kling-v3.0-pro` (single-frame or multi-frame after video lesson 5 lands). Postmortems: tokyo / noski / venom. **The same filter fires on `input_references` refs** (validated 2026-06-11, sotaocr-r2v-probe-001 probe B: a HeyGen avatar frame as `--ref` → same 400). Multi-ref R2V on seedance = non-human refs only.

6b. **`bytedance/seedance-2.0` supports multimodal reference-to-video through OR `input_references`** — `ralphy generate video --ref <ref...>` (added 2026-06-11). Unlike `--first-frame`/`--last-frame` these guide subject / style / identity without pinning an exact frame; reference them as `Image 1`, `Image 2`, … in the prompt (the `@Image1` convention — see `.agents/skills/seedance-prompts/SKILL.md`). Native seedance takes ≤9 images + 3 videos + 3 audio, but OR documents **image refs only** — treat video/audio refs as unavailable. Kling's omnimodal tier (`@elements`, voice binding, video refs) lives on the native Kling API / fal / PiAPI only — NOT exposed via OR, and off-stack providers violate the AGENTS.md key invariant. Validated use: site-screenshot ref → "laptop screen shows the website from Image 1" footage (sotaocr-r2v-probe-001 probe A).

13. **The `bytedance/seedance-2.0` concurrency cap of 1 applies only to multi-block EXTEND, not to independent i2v clips.** The cap in video lesson 9 exists because last-frame→next-anchor extend chains are inherently sequential. A batch of *independent* single-clip i2v gens has no such dependency and parallelizes cleanly — validated at scale (33 clips fired at width-8 finished in ~15 min versus ~99 min serial, zero throttling). Because the in-process semaphore is per-process, a bash loop launching one `ralphy generate video` per clip (each its own process) already bypasses the cap. Detect per-clip privacy blocks (`grep InputImageSensitiveContentDetected` → re-run that slot on `kwaivgi/kling-v3.0-pro`) versus success in each clip's log. Does NOT apply to: multi-block extend pipelines (sequential by construction), ElevenLabs TTS (real cap 3) / Music (real cap 2). A follow-up to relax the `concurrency.ts` video cap for independent clips is tracked separately.

14. **`bytedance/seedance-2.0` accepts STYLIZED human anchors — the privacy filter keys on photoreal faces, not on human-shaped subjects.** A crude-PS1 / low-poly / painterly / cartoon character with a visible face passes the seedance i2v filter fine, even when it is clearly a person; the `InputImageSensitiveContentDetected.PrivacyInformation` rejection fires only on *photoreal* faces (video lesson 6). So for PS1 / toon / painterly human anchors, do NOT auto-route to kling — seedance is usable and is often the better motion pick for those registers. The split is photoreal-face → kling, stylized-face / non-human → seedance. Validated on the choose-* PS1-horror batch (a bandaged bubble-head nurse and a low-poly character both passed; a photoreal-faced character from a real-photo ref tripped the filter on closer framings and was routed to kling).

## `bytedance/seedance-2.0-fast`

Snapshot: durations 4-15 s · 480p, 720p · 7 aspects · first + last frame anchors · $0.14/s billed ✓ (was ~$0.05 — wrong).

## `bytedance/seedance-1-5-pro`

Snapshot: durations 4-12 s · 480p, 720p, 1080p · 7 aspects · first + last frame anchors · ~$0.10/s.

## `bytedance/seedance-2.0/reference-to-video`

fal connector (`--provider fal`). Snapshot: durations 4-15 s · 480p, 720p, 1080p · auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 · ref inputs: `--ref-video` (≤3, 2-15s combined, ≤50MB, 640x640..834x1112) + `--ref` images (`@Image1`) + first/last frame · $0.3034/s @720p, **×0.6 with video refs = $0.1814/s**, $0.682/s @1080p.

- **Accepts a real-human-face
  reference VIDEO with no privacy block** — the capability the off-stack
  `trafalgar-aura-001` collab depended on. Unlike OR seedance image inputs
  (which 400 on `InputImageSensitiveContentDetected.PrivacyInformation`), the
  video-ref path produces a true 1-in-1 restyle (shot structure + camera + comedic
  timing replicated). Reference videos as `@Video1`/`@Video2` in the prompt, image
  refs as `@Image1` (the seedance @-convention — see `.agents/skills/seedance-prompts/SKILL.md`).
- **`--ref-video` constraint auto-fix:** sources over the 834x1112 ceiling (e.g.
  1080x1920 phone captures) are auto-downscaled preserving aspect (→ ~624x1108)
  into `artifacts/refs/` with a stderr note; >3 files, combined duration outside
  2-15s, or >50MB total refuse with an actionable message (the source is never
  mutated — #105/#401). Pure dimension math lives in `cli/lib/providers/ref-video.ts`.
- **`generate_audio` defaults TRUE upstream on seedance r2v but ralphy forces it
  FALSE** unless `--audio` is passed — post-mix discipline (music / VO is a
  separate ElevenLabs pass; memory `feedback_kling_no_music_eleven_music_postmix`).
  The cost is identical regardless of `generate_audio` on seedance.

## `fal-ai/kling-video/o3/pro/reference-to-video`

Kling O3 omni, fal connector (`--provider fal`). Snapshot: durations 3-15 s · 720p, 1080p · 16:9, 9:16, 1:1 · ref inputs: `elements` (`@Element1`) + `--ref` images (`@Image1`); **NO video input** · $0.112/s audio-off, $0.14/s audio-on.

- **Kling O3 omni takes NO video input** — `--ref-video` on it refuses
  (`TerminalProviderError`). It is the character-consistency tier (`elements` /
  `@Element1`) + style refs (`@Image1`); use seedance r2v for video-anchored restyles.
