# Models registry

A short, opinionated list of the models we actually use. **Two API keys only:** `OPENROUTER_API_KEY` for media / LLM / transcription, `ELEVENLABS_API_KEY` for voice and music. Everything else is out of scope.

> **Last reviewed: 2026-05-08.** If this file is older than 30 days, recheck OpenRouter — model versions change without notice. The catalog is the source of truth; pull it with `ralphy models list` (24h cached).

## How to use this file

1. **Before any model call**, open the matching section. The top pick has the reason it's the top pick.
2. **For video**, also run `ralphy models show <id>`. It returns the live `supported_durations`, `supported_resolutions`, `supported_aspect_ratios`, `supported_frame_images` from OR. Don't hand-pick parameters that aren't in those arrays; the submit will fail validation (`ralphy generate video` runs the check pre-flight; bypass with `--no-validate`).
3. **For image**, the `--size` flag is a prompt-level hint, not an enforced constraint. Gemini and gpt image models round to their internal natural sizes (1024², 768×1376, …). If you need an exact dimension, post-process with `ralphy video extract-segment` or `ffmpeg` after generation.
4. **For cost preview**, every video gen accepts `--dry-run`. It prints the resolved request body and cost estimate without spending credits.
5. **If the task is new** (not in this file) — DO NOT invent a provider. Tell the user the task is out of scope or needs a model-list extension.

---

## Image generation

Endpoint: `POST /api/v1/chat/completions` with `modalities: ["image","text"]`. Output bytes arrive on `choices[0].message.images[0].image_url.url` as a `data:` URI or http URL. `cli/lib/providers/media.ts → generateImage()` decodes both. **Don't make direct fetches to fal.ai or openai.com.**

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default — multi-ref / character consistency** | `google/gemini-3-pro-image-preview` (= nano-banana-pro lineage) | ~$0.15 / image | Holds face / wardrobe / product identity across multiple references. Tolerates ≥4 concurrent in the OR catalog; **in-process semaphore caps at 2** (`concurrency.ts`) to stay under shared-key OR limits. Pass 2-3 `--ref` images for "same model + same product across 5 scenes" workflows. Made default 2026-05-20 (re-flip from the 2026-05-12 gpt-5.4-image-2 default — multi-ref wins for almost every UGC workflow). |
| **Premium typography / label accuracy** | `openai/gpt-5.4-image-2` | ~$0.20 / image | Best typography on labels, fewer hallucinations on small details, cleanest photorealism for hero product shots where the wordmark must read crisp. **Concurrency: 2 in-process** (#007 — validated 2026-05-29, NOT hard-capped to 1 as earlier docs claimed). Self-throttled by `cli/lib/providers/concurrency.ts`; the old 403 "Key limit exceeded" misread is now surfaced as "concurrent-call limit on …; try --concurrency 1 or switch model". |
| **Budget OpenAI** | `openai/gpt-5-image-mini` | ~$0.08 / image | Cheap iteration during prompt exploration. |
| **Cheapest viable** | `google/gemini-2.5-flash-image` | ~$0.02 / image | Smoke-test only — quality dip is visible. |

**Reference images:** `--ref` accepts URL, local path, or `data:` URI. Local paths are auto-converted to `data:` URI in-process; there's no upload step. Both `gpt-5.4-image-2` and `gemini-3-pro-image-preview` accept image inputs; gemini is much better at *multi-ref* consistency (2+ refs).

**Size / aspect ratio:** `ralphy generate image` maps `--size WxH` to OpenRouter's structured `image_config.aspect_ratio` (nearest of `1:1 2:3 3:2 3:4 4:3 4:5 5:4 9:16 16:9 21:9`) and forwards it alongside the in-prompt hint (`openrouter.ts → sizeToAspectRatio`). This is the only reliable lever for non-square output: **`openai/gpt-5.4-image-2` ignores the in-prompt size hint and defaults to 1024² unless `image_config` is sent** — with it, `--size 1080x1920` returns a real 9:16 (720×1280 native bucket), validated on loud-kids-poster-001 (2026-05-27). The result still lands on the model's nearest native bucket (1024² for 1:1, ~768×1376 / 720×1280 for 9:16, ~1280×720 for 16:9), not pixel-exact `WxH`. Downstream HyperFrames / ffmpeg compositions handle the scale-to-cover. `image_size` (`1K`/`2K`/`4K`) is available in the OR API but not yet wired to a flag.

**Prompt cookbook:** mode-by-mode masters in `docs/prompts/image/` (product-shot, lifestyle-scene, closeup-with-person, macro-detail, flat-lay, virtual-model-tryout, hero-banner, conceptual-product, iteration-edit). The agent fills slots from a user request, then calls `ralphy generate image --prompt "<filled>"`. There's no new CLI flag for this; it's a curated library, not a feature.

**Avoid:**
- Any model more than a year old (`stable-diffusion-xl`, `flux/schnell`, `dall-e-3`). Quality is below the current top picks at the same price.
- `gpt-image-1`: legacy line. `gpt-5.4-image-2` is the current stable OpenAI image model (not to be confused with the "gpt-image-2" naming some external docs use).
- Hard-coded fal.ai endpoints. We left fal.ai behind in Sprint 2.

**Register-specific picks (when the two defaults diverge):**
- **Body-horror / cryptid / skinwalker / Cronenberg anchor frames → `openai/gpt-5.4-image-2`.** Gemini's image-safety filter is materially stricter and returns `IMAGE_SAFETY` on the same prompt; start at gpt-image, carry scene identity via `--ref`. See image failure-modes + video lesson #10.
- **Photoreal scientific / medical imaging (X-ray radiograph, MRI, anatomical scan, "Nature-cover print plate") → `google/gemini-3-pro-image-preview`.** It honours "this is a photograph of a real radiograph, NOT an illustration" and renders honest bone-density variation, cranial sutures, tooth roots. `gpt-5.4-image-2` defaults to an illustrative "Wikipedia-infographic" register here — uniform outlines, flat density. Generate greyscale/white and apply any tint as a CSS filter in the composition, not baked into the prompt.

### Failure modes (per-model quick reference)

Append-only. Add a row when a new quirk costs >5 min of debugging or a re-roll.

| Model | Failure mode | Workaround |
|---|---|---|
| `google/gemini-3-pro-image-preview` | **"skeleton null" transient** — response returns `finish_reason: null, content: null, native_finish_reason: null` with no error body. Sporadic, not prompt-related. | Retry up to 3× (same prompt, same refs). If all 3 fail, fall back to `openai/gpt-5.4-image-2` (accept the 1024² default + concurrency=1). Tracked by `cli/lib/providers/openrouter.ts` retry loop. |
| `google/gemini-3-pro-image-preview` | **Body-horror `IMAGE_SAFETY` refusal** (cap #10 below) — empty content + `native_finish_reason: IMAGE_SAFETY` on cryptid / skinwalker / Cronenberg prompts. | Route to `openai/gpt-5.4-image-2` for the anchor frame; carry scene identity via `--ref`. |
| `google/gemini-3-pro-image-preview` | **Typography smudging on embedded labels** (kanji buttons, LED digits, brand wordmarks). | Switch to `openai/gpt-5.4-image-2` when copy must be legible — it holds glyphs cleanly. Lesson from flipper-hypermotion-001. |
| `openai/gpt-5.4-image-2` | **Concurrency cap = 2** (per #007, validated 2026-05-29 — earlier "cap of 1" was conservative). 3+ parallel may still trip OR's per-key limit and return misleading `403 "Key limit exceeded (total limit)"`. | Self-throttled to 2 in-flight by `cli/lib/providers/concurrency.ts`; the 403 is now rewritten as "concurrent-call limit on …; try --concurrency 1 or switch model — NOT a $ balance issue". For >2 parallel, swap to `gemini-3-pro-image-preview`. |
| `openai/gpt-5.4-image-2` | **Ignores in-prompt size hints**, defaults to 1024². | Pass `image_config.aspect_ratio` via `--size WxH` (mapped automatically in `openrouter.ts → sizeToAspectRatio`). |

---

## Video generation (text-to-video + image-to-video)

Endpoint: **async-job pattern** at `POST /api/v1/videos`. Submit returns `{ id, status, polling_url }`; poll until `completed`; download via `GET /api/v1/videos/{id}/content?index=0` (auth required). The legacy `/api/v1/videos/generations` returns 404. `cli/lib/providers/media.ts → generateVideo()` handles the full job lifecycle (15s × 80-poll = 20 min budget; tunable).

### Per-model matrix (live from `/api/v1/videos/models`, snapshot 2026-05-08)

Always recheck via `ralphy models list`. These arrays change.

| Model | Durations (s) | Resolutions | Aspects | Frame anchors | $/sec billed |
|---|---|---|---|---|---|
| `kwaivgi/kling-v3.0-pro` | 3-15 | 720p | 9:16, 16:9, 1:1 | first + last | $0.14 ✓ |
| `kwaivgi/kling-v3.0-std` | 3-15 | 720p | 9:16, 16:9, 1:1 | first + last | $0.14 ✓ (not ½ pro — same rate) |
| `kwaivgi/kling-video-o1` | 5, 10 | 720p | 9:16, 16:9, 1:1 | first + last | ~$0.14 |
| `google/veo-3.1` | 4, 6, 8 | 720p, 1080p | 9:16, 16:9 | first + last | ~$0.50 |
| `google/veo-3.1-fast` | 4, 6, 8 | 720p, 1080p, 4K | 9:16, 16:9 | first + last | $0.14 ✓ (was ~$0.25 — wrong) |
| `google/veo-3.1-lite` | 4, 6, 8 | 720p, 1080p | 9:16, 16:9 | first + last | ~$0.09 |
| `openai/sora-2-pro` | model-dep | model-dep | model-dep | model-dep | ~$0.50 |
| `minimax/hailuo-2.3` | 6, 10 | 1080p | **16:9 only** | first only | ~$0.10 |
| `alibaba/wan-2.6` | 5, 10 | 720p, 1080p | 9:16, 16:9 | first only | ~$0.10 |
| `alibaba/wan-2.7` | 2-10 | 720p, 1080p | 9:16, 16:9, 1:1, 4:3, 3:4 | first + last | ~$0.10 |
| `bytedance/seedance-2.0` | 4-15 | 480p, 720p, 1080p | **7 aspects incl 21:9 cinema** | first + last | $0.14 ✓ |
| `bytedance/seedance-2.0-fast` | 4-15 | 480p, 720p | 7 aspects | first + last | $0.14 ✓ (was ~$0.05 — wrong) |
| `bytedance/seedance-1-5-pro` | 4-12 | 480p, 720p, 1080p | 7 aspects | first + last | ~$0.10 |

> **Pricing reality check (2026-05-11):** OpenRouter bills video generation **per-clip flat**. The duration parameter sets the clip length and the billed cost ≈ rate × duration. A `✓` in the rate column means we verified the rate against actual OR billing on 2026-05-11 (see `docs/render-test-2026-05-11.md` §1.1). Earlier docs claimed half-price std and per-second steps that didn't match observation; those have been corrected here and in `cli/lib/providers/media.ts:VIDEO_PRICE_PER_SEC`. Models without `✓` are ballparks from the OR catalog. Verify on first use and add `✓` once confirmed.

### When to pick which

| You need | Pick |
|---|---|
| **Default narrative i2v**, character consistency, hold a keyframe | `kwaivgi/kling-v3.0-pro` |
| **Cheap batch** (≥10 clips) where keyframe drift is acceptable | `kwaivgi/kling-v3.0-std` (NOTE: same per-second price as pro on OR — go to `veo-3.1-lite` for the real cheap-batch tier) |
| **Talking-head / face / lip-sync style** | `google/veo-3.1` (model-native audio with `--audio` works in EN; **off for RU/UA** — only Chinese + English are clean) |
| **4K** mastered hero piece | `google/veo-3.1-fast` (only model in catalog with 4K) |
| **Sharp physics motion** (parkour, sports, falling) | `bytedance/seedance-2.0` (also the only path to 21:9 cinema aspect) |
| **3:4 / 4:3 portrait magazine** | `alibaba/wan-2.7` (only model with these in stock) |
| **Cheapest viable** | `bytedance/seedance-2.0-fast` |

### fal connector — omni / reference-to-video models (`--provider fal`, #402)

Two reference-to-video models that do **not** exist on OpenRouter live behind the
registered `fal` connector (`cli/lib/providers/fal.ts`, env `FAL_KEY`). This is
the **only** sanctioned path to fal — never raw curl (AGENTS.md invariant #1).
Reach them with `ralphy generate video --provider fal --model <id>`. The
connector handles the queue submit → poll → result lifecycle, uploads local refs
to the fal CDN (`storage/upload/initiate` → PUT → `file_url`), downloads the mp4
into `artifacts/videos/` (auto-versioned), and writes a `generations.jsonl` row
with `cost_usd`.

| Model | Durations (s) | Resolutions | Aspects | Ref inputs | $/sec |
|---|---|---|---|---|---|
| `bytedance/seedance-2.0/reference-to-video` | 4-15 | 480p, 720p, 1080p | auto, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 | `--ref-video` (≤3, 2-15s combined, ≤50MB, 640x640..834x1112) + `--ref` images (`@Image1`) + first/last frame | $0.3034/s @720p, **×0.6 with video refs = $0.1814/s**, $0.682/s @1080p |
| `fal-ai/kling-video/o3/pro/reference-to-video` (Kling O3 omni) | 3-15 | 720p, 1080p | 16:9, 9:16, 1:1 | `elements` (`@Element1`) + `--ref` images (`@Image1`); **NO video input** | $0.112/s audio-off, $0.14/s audio-on |

Key facts:

- **`bytedance/seedance-2.0/reference-to-video` accepts a real-human-face
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
- **Kling O3 omni takes NO video input** — `--ref-video` on it refuses
  (`TerminalProviderError`). It is the character-consistency tier (`elements` /
  `@Element1`) + style refs (`@Image1`); use seedance r2v for video-anchored restyles.
- Pricing sourced from the fal docs / model schema fetched 2026-06-12, re-verified
  against the live schema at implementation time. Cost computation lives in
  `falVideoPricePerSec()` in `cli/lib/providers/fal.ts`. Live end-to-end mp4 smoke
  is pending a maintainer go-ahead (one paid call) — see `notes/issues/402-*`.

### Lessons from this session (2026-05-08)

1. **`kwaivgi/kling-v3.0-pro` rotates "wide" prompts inside the 9:16 container.** Phrases like *"wide overhead cityscape"*, *"massive crowd in town square"*, *"dancers under starlit sky"* bias the model toward landscape composition; OR returns a 1080×1920 file but the *content* is laid out for 16:9. **Fix:** anchor with `--first-frame <portrait-image>` and rewrite the prompt with explicit vertical wording (*"tall vertical portrait shot, low camera angle looking up, narrow alley framing, subjects centered vertically, half-timbered houses tower vertically on both sides"*). The first-frame image overrides the model's compositional bias.
2. **`--resolution 720p` is silently upgraded** to 1080p by `kwaivgi/kling-v3.0-pro` even though the catalog only lists 720p. The output dimension is whatever the model decides; treat resolution as a soft hint and let downstream HyperFrames / ffmpeg crop+scale to the composition's exact frame.
3. **OR's per-clip billing** is fixed (e.g., a 5s kling-pro clip is ~$0.70 regardless of "duration in body" precision). The per-second figures above are therefore ballparks; pre-flight `--dry-run` to see the estimate before submitting.
4. **`generate_audio: true` is unsafe outside English.** Confirmed for `kwaivgi/kling-v3.0-pro`, `bytedance/seedance-2.0`, and `google/veo-3.1` on Russian — accent slips, voice age drifts, text gets cut. Default is `false`; only enable for EN with `--audio`.

5. **`kwaivgi/kling-v3.0-pro --last-frame` historically returned `400 "File is not in a valid base64 format"` even with a clean PNG anchor.** Root cause was C2PA / EXIF metadata that the provider parsed too eagerly; the 2026-05-19 `resolveImageRef()` strip helped on single-frame but the multi-frame (first+last together) path kept failing across flipper / glitter-cream / playdate / venom regardless of source. **As of 2026-05-30 (#008), `generateVideo()` preflight-rejects the kling-v3.0-pro multi-frame combination as `TerminalProviderError` with a pointer to `bytedance/seedance-2.0`** — which honors `--last-frame` natively across all aspects. No more wasted round-trips. Postmortems flagging this: playdate / flipper / venom / glitter-cream.

6. **`bytedance/seedance-2.0` privacy filter rejects photoreal-human anchors** with `InputImageSensitiveContentDetected.PrivacyInformation`, even when the human was itself AI-generated. Reserve seedance for cartoons / non-human anchors / landscapes / hands / abstract motion. For photoreal humans, default to `kwaivgi/kling-v3.0-pro` (single-frame or multi-frame after #5 lands). Postmortems: tokyo / noski / venom. **The same filter fires on `input_references` refs** (validated 2026-06-11, sotaocr-r2v-probe-001 probe B: a HeyGen avatar frame as `--ref` → same 400). Multi-ref R2V on seedance = non-human refs only.

6b. **`bytedance/seedance-2.0` supports multimodal reference-to-video through OR `input_references`** — `ralphy generate video --ref <ref...>` (added 2026-06-11). Unlike `--first-frame`/`--last-frame` these guide subject / style / identity without pinning an exact frame; reference them as `Image 1`, `Image 2`, … in the prompt (the `@Image1` convention — see `.agents/skills/seedance-prompts/SKILL.md`). Native seedance takes ≤9 images + 3 videos + 3 audio, but OR documents **image refs only** — treat video/audio refs as unavailable. Kling's omnimodal tier (`@elements`, voice binding, video refs) lives on the native Kling API / fal / PiAPI only — NOT exposed via OR, and off-stack providers violate the AGENTS.md key invariant. Validated use: site-screenshot ref → "laptop screen shows the website from Image 1" footage (sotaocr-r2v-probe-001 probe A).

7. **`kwaivgi/kling-v3.0-pro` 2500-char prompt cap.** OR returns 400 after a round-trip if you exceed it. **As of 2026-05-30 (#008), `generateVideo()` preflight-rejects prompts >2500 chars as `TerminalProviderError` before any submit** — no more 4× wasted round-trips per session. The cap lives in a per-model `MAX_PROMPT_CHARS` map in `cli/lib/providers/openrouter.ts`; add a row when another model documents a hard cap. Trim atmosphere/setting paragraphs first — voice-tag, no-music, on-camera-EN clauses are load-bearing and should never be cut. Postmortem: glitter-cream.

8. **ElevenLabs Music 2-concurrent cap per subscription.** Three+ parallel calls return 429 `concurrent_limit_exceeded` and pollute `generations.jsonl` with error rows. Serialize music gen or stay ≤2 in-flight. Postmortem: tokyo.

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

10. **`google/gemini-3-pro-image-preview` image-safety filter is materially stricter than `openai/gpt-5.4-image-2` on body-horror / cryptid / skinwalker / werewolf register.** Gemini returns `native_finish_reason: IMAGE_SAFETY` with an empty content body even when the prompt uses softened surreal-anatomy language (concentric maws lined with tongue-like protrusions, biological apertures with internal teeth on a recognizable creature in a real-world setting). The reasoning trace literally describes the requested transformation before the filter refuses. `openai/gpt-5.4-image-2` accepts the same prompts and delivers — validated on voidstomper-test-001's skinwalker BBQ frame after three gemini refusals. **Route rule:** for voidstomper-adjacent / Cronenberg / The Thing / mid-warp body-horror anchor images, start at `--model openai/gpt-5.4-image-2`. Accept the 1024×1024 default (gpt-image ignores arbitrary `--size`); use `--ref <gemini-9:16-scene>` to carry scene + character identity, then post-process to 9:16 with ffmpeg pad if your downstream i2v requires matching dimensions. Postmortem: voidstomper-test-001 (2026-05-25).

11. **`google/veo-3.1` body-horror filter** rejects both the prompt AND the input frame independently. Sanitizing the prompt (stripping skinwalker / werewolf / vertebrae / Cronenberg words) does NOT unblock the path — Google's filter ALSO scans the first/last-frame anchor and refuses when the anchor itself is clearly body-horror. Combined with seedance's photoreal-human rejection (cap #6), this leaves `kwaivgi/kling-v3.0-pro` as **the only viable i2v provider for the photoreal-human + body-horror combination** that voidstomper-style content requires. Skip seedance and veo round-trips on those jobs; go straight to Kling. Postmortem: voidstomper-test-001 (2026-05-25).

12. **`kwaivgi/kling-v3.0-pro` and `bytedance/seedance-2.0` overshoot `--duration` by ~1s.** Both models return clips ~1 second longer than the requested `--duration` — silent, billed against the requested duration, not the delivered one. tokyo-y2k-001 measured `5s/4s/9s` storyboard → `6.04/5.04/10.04` actual; planned 75s of clips landed as 90.7s of raw mp4. Editor recipe (pre-shorten at art-director stage, or budget a vision-trim pass) lives in [`.agents/skills/editor/references/render-pipeline.md → Source-clip duration overshoot`](.agents/skills/editor/references/render-pipeline.md#source-clip-duration-overshoot-kling--seedance). Filed long-form: [`notes/issues/done/042-clip-duration-overshoot-undocumented.md`](notes/issues/done/042-clip-duration-overshoot-undocumented.md). Postmortem: tokyo-y2k-001 (workflow-fixes #3).

13. **The `bytedance/seedance-2.0` concurrency cap of 1 applies only to multi-block EXTEND, not to independent i2v clips.** The cap in lesson #9 exists because last-frame→next-anchor extend chains are inherently sequential. A batch of *independent* single-clip i2v gens has no such dependency and parallelizes cleanly — validated at scale (33 clips fired at width-8 finished in ~15 min versus ~99 min serial, zero throttling). Because the in-process semaphore is per-process, a bash loop launching one `ralphy generate video` per clip (each its own process) already bypasses the cap. Detect per-clip privacy blocks (`grep InputImageSensitiveContentDetected` → re-run that slot on `kwaivgi/kling-v3.0-pro`) versus success in each clip's log. Does NOT apply to: multi-block extend pipelines (sequential by construction), ElevenLabs TTS (real cap 3) / Music (real cap 2). A follow-up to relax the `concurrency.ts` video cap for independent clips is tracked separately.

14. **`bytedance/seedance-2.0` accepts STYLIZED human anchors — the privacy filter keys on photoreal faces, not on human-shaped subjects.** A crude-PS1 / low-poly / painterly / cartoon character with a visible face passes the seedance i2v filter fine, even when it is clearly a person; the `InputImageSensitiveContentDetected.PrivacyInformation` rejection fires only on *photoreal* faces (lesson #6). So for PS1 / toon / painterly human anchors, do NOT auto-route to kling — seedance is usable and is often the better motion pick for those registers. The split is photoreal-face → kling, stylized-face / non-human → seedance. Validated on the choose-* PS1-horror batch (a bandaged bubble-head nurse and a low-poly character both passed; a photoreal-faced character from a real-photo ref tripped the filter on closer framings and was routed to kling).

### Failure modes (per-model quick reference)

Append-only. Each row is a quirk that has already cost ≥1 re-roll across sessions.

| Model | Failure mode | Workaround |
|---|---|---|
| `kwaivgi/kling-v3.0-pro` | **Multi-frame (first+last) base64 reliably 400s** even after the 2026-05-19 C2PA strip — flipper / glitter-cream / playdate / venom all reproduced. | **Preflight-rejected client-side** as of 2026-05-30 (#008). Use `bytedance/seedance-2.0` for multi-frame anchoring (honors `--last-frame` natively for non-photoreal-human anchors). |
| `kwaivgi/kling-v3.0-pro` | **`--audio` slips on Russian / UA** — accent slip, voice-age drift, occasional cut text. EN is clean. | Use `--audio` for EN VO only. For RU / non-EN, generate silent clip + post-mix ElevenLabs VO in the editor stage. (Memory: `feedback_kling_no_ru_audio`.) |
| `kwaivgi/kling-v3.0-pro` | **2500-char prompt cap** — OR returns 400 round-trip if exceeded. | **Preflight-rejected client-side** as of 2026-05-30 (#008). Trim atmosphere/setting paragraphs first; never cut voice-tag, no-music, on-camera-EN clauses (load-bearing). |
| `kwaivgi/kling-v3.0-pro` | **Wide-prompt rotation inside 9:16** — landscape wording biases composition to 16:9 inside the portrait container. | Anchor with `--first-frame <portrait>` and rewrite prompt with explicit vertical wording (cap #1 above). |
| `bytedance/seedance-2.0` | **Privacy filter blocks photoreal-human i2v anchors** — `InputImageSensitiveContentDetected.PrivacyInformation`, even when the human is AI-generated. | Reserve seedance for cartoons / non-human / landscapes / hands / abstract motion. Photoreal humans → `kwaivgi/kling-v3.0-pro`. (Memory: `feedback_seedance_rejects_realistic_people`.) |
| `bytedance/seedance-2.0` | **Concurrency cap = 1** (effective, per current OR keys). | Serialize multi-clip jobs; parallelize across providers, not within seedance. |
| `kling` + `seedance` (both) | **`--duration` overshoots by ~1s** (cap #12 above). | Pre-shorten at art-director stage OR budget a vision-trim pass in the editor. See [`.agents/skills/editor/references/render-pipeline.md`](.agents/skills/editor/references/render-pipeline.md#source-clip-duration-overshoot-kling--seedance) + [`notes/issues/042`](notes/issues/done/042-clip-duration-overshoot-undocumented.md). |
| `google/veo-3.1` | **Body-horror filter scans the anchor frame independently of the prompt** — sanitizing the prompt does not unblock if the input frame reads as body-horror. | For photoreal-human + body-horror, use `kwaivgi/kling-v3.0-pro`; skip veo + seedance round-trips on those jobs (cap #11 above). |
| `google/veo-3.1` | **8s clip cap** — needs Kling 15s for longer narrative beats. | Use `kwaivgi/kling-v3.0-pro` for >8s; chain veo clips for talking-head only when the cut is acceptable. |
| `google/gemini-3.1-pro-preview` (video-analysis via `callLLM`) | **Occasional HTTP 502 with empty body** on full-length source mp4s. Vision-trim + ref-analysis pipelines hit this most. | Compress source mp4 to 540×960 CRF28 (`ffmpeg -vf scale=540:960 -crf 28`) + retry. If still 502, fall back to `google/gemini-2.5-flash` (lower context but reliable). Last resort: `ralphy ref frames` + frame-level analysis. |
| `elevenlabs/music_v1` | **Artist-name ToS rejection** — naming any rapper / producer / band returns 422 with `prompt_suggestion`. Modern hip-hop especially. | Genre + tempo + instrumentation only; resubmit the API's `prompt_suggestion` verbatim. (Memory: `feedback_elevenlabs_music_no_artist_names`.) |
| `elevenlabs/music_v1` | **Concurrency cap = 2** — 3+ parallel returns `429 concurrent_limit_exceeded` and pollutes `generations.jsonl`. | Serialize music gen or stay ≤2 in-flight (`--concurrency 2`). |
| `elevenlabs/scribe_v1` + voice endpoints | **Default Node UA → Cloudflare 403.** Geo-blocked regions return HTTP 200 + HTML body cast as `.mp3`. | Send `User-Agent: Mozilla/5.0 (...)` header (already wired). From geo-blocked region, fall back to Kokoro for VO and `openai/whisper-1` for transcription. (Memory: `feedback_elevenlabs_geoblock_html_in_mp3`.) |

### Routing rules (which video model for what)

Apply these before drafting a `ralphy generate video` prompt. They short-circuit re-rolls.

- **Hyper-motion** (explosions, runway-sprint, coin-arcs, particle bursts, sports collisions, parkour, falling) → `bytedance/seedance-2.0`. Kling reads these as narrative beats and softens the physics. **Caveat:** seedance's privacy filter rejects photoreal-human i2v anchors — only use seedance hyper-motion on cartoon / non-human / landscape / hands / abstract subjects.
- **Talking-head, photoreal humans, slow narrative, lip-sync** → `kwaivgi/kling-v3.0-pro`. Multi-frame works post-2026-05-19. `--audio` for EN VO only.
- **4K hero piece** → `google/veo-3.1-fast` (the only catalog entry with 4K).
- **3:4 / 4:3 portrait magazine aspect** → `alibaba/wan-2.7` (only model with these in stock).
- **Cinema 21:9** → `bytedance/seedance-2.0` (only model with 21:9 in stock).
- **Photoreal humans + body-horror anchor** → `kwaivgi/kling-v3.0-pro` only. Seedance rejects the anchor, veo rejects both prompt and anchor (caps #6 + #11).
- **Cheapest acceptable batch** → `google/veo-3.1-lite` (~$0.09/s) for non-photoreal-human work; otherwise `kwaivgi/kling-v3.0-std` (same rate as pro but worse keyframe holds).

### `--audio` policy: SPEECH vs AMBIENT/DIEGETIC

Two distinct audio jobs hide behind the single `--audio` flag — different rules apply.

- **SPEECH (on-camera VO / dialogue / lip-sync).** Stakes are high — voice age, accent, and word-cut are visible.
  - **Default:** `google/veo-3.1` for English on-camera dialogue.
  - **`kwaivgi/kling-v3.0-pro --audio` works for EN only.** Slips on RU / UA / non-English (memory `feedback_kling_no_ru_audio`). For RU, render silent + post-mix ElevenLabs `eleven_multilingual_v2` in the editor stage.
  - `bytedance/seedance-2.0 --audio` is not validated for SPEECH — treat as off.
- **AMBIENT / DIEGETIC (background noise, footsteps, crowd murmur, wind, traffic, room tone, prop SFX).** Stakes are low — language doesn't apply.
  - **Any of kling / seedance / veo `--audio: true`** are fine. Generate alongside the visuals; cheaper than a separate SFX pass.
  - If the brief explicitly bans music (most UGC beds do), keep the `no music — only diegetic ambient + sparse SFX` clause in the prompt regardless of which model.

When in doubt: SPEECH = veo (EN) / kling-EN-only / silent+ElevenLabs (everything else). AMBIENT = whichever video model is already in the shot list.

## Tried-and-dropped (postmortem cross-reference)

| Model | Context where it failed | Why | Postmortem |
|---|---|---|---|
| `bytedance/seedance-2.0` | photoreal-human i2v anchors | privacy filter `InputImageSensitiveContentDetected.PrivacyInformation` | tokyo, noski, venom |
| `kwaivgi/kling-v3.0-pro` multi-frame | first+last-frame i2v | `400 not in a valid base64 format` — mitigated 2026-05-19 by auto-C2PA-strip in `resolveImageRef()` | flipper, playdate, venom, glitter-cream |
| `kwaivgi/kling-v3.0-pro --audio` | non-English VO | accent slip + voice-age drift | noski, venom |
| `google/veo-3.1` | 15s+ clips | 8s cap; needed Kling 15s with `--audio` instead | kbo |
| `openai/gpt-5.4-image-2` | concurrent batches >1 | 403 "Key limit exceeded" — cap of 1 per OR key | appstore |
| `eleven_multilingual_v2` (Ava, Marcus) | analog-horror PSA monotone | too much human inflection — switched to "Alerter" community voice with stability~0.5 / style 0 | analog-horror |
| `kwaivgi/kling-v3.0-pro` for hyper-motion | 8-cut Japanese product ad | too narrative / slow for explosions; needed seedance physics | flipper |
| `google/gemini-3-pro-image-preview` | product-fidelity with embedded text (kanji buttons, LED digits) | smudges typography; gpt-5.4-image-2 holds it | flipper |
| Generic "1-bit / pixel-art" prompt vocabulary | duotone halftone aesthetic | ambiguous 3-way (1-bit vs 8-bit vs hand-illustrated); needed named-corpus refs | playdate |
| `bytedance/seedance-2.0` t2v + i2v anchor poster | spider-verse skater | image-anchor with baked-in-text confuses; pure t2v with strong subject-block worked | skater |

**Avoid:**
- `kling-video/v1.6` or `v2.x`: outdated.
- `luma-dream-machine`: worse than kling at the same price; out of OR catalog now.
- `fal-ai/*` endpoints: the stack moved to OpenRouter in Sprint 2.

---

## Voiceover (TTS)

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default — Russian** | ElevenLabs `eleven_multilingual_v2` | subscription | The only path to clean deadpan Russian without regional accent slip. User-owned voice clones work best. |
| **English premium** | ElevenLabs `eleven_v3` | subscription | Most emotional for English. Validated 2026-05-08 against the brainrot test (Adam preset, dramatic narrator, 45-55s). **Unstable on Russian; don't use in production for RU.** |

**Voice settings (deadpan young Russian):**
```json
{ "model_id": "eleven_multilingual_v2", "voice_settings": { "stability": 0.55, "similarity_boost": 0.8, "style": 0.25, "use_speaker_boost": true }, "output_format": "mp3_44100_128" }
```

**Voice settings (English brainrot dramatic narrator):**
```json
{ "model_id": "eleven_v3", "voice_settings": { "stability": 0.30, "similarity_boost": 0.75, "style": 0.40, "use_speaker_boost": true } }
```
Voice picks: Adam (`pNInz6obpgDQGcFmaJgB`) for dramatic narrator, Brian (`nPczCjzI2devNBz1zQrb`) for Reddit-monotone, Daniel (`onwK4e9ZLuTAKqWW03F9`) for British-sarcastic.

**Failure modes:**
- Default UA on Node 20+ → Cloudflare 403. Send `User-Agent: Mozilla/5.0 (...)`.
- Free/starter cap is 3 concurrent → 429. Run sequentially, not in parallel.
- Default library voices (`clyde-warvet`, `daniel-deep`, etc.): too theatrical for RU. A custom clone is mandatory for RU production.
- VO drift: dramatic narration on `eleven_v3` consistently runs **~15-25% longer than scripted word-count would suggest** (Strasbourg 45s scenario rendered at 54.6s). Time-budget compositions to actual VO duration via `ralphy project transcribe`, not scenario text length.

**Avoid:**
- OpenAI `tts-1-hd` on Russian — flat American accent.
- ElevenLabs `eleven_v3` on Russian in production — unstable.

---

## Music generation

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default** — instrumental beds | ElevenLabs Music (`music_v1`) | subscription (binary audio response) | Same key as VO. Validated 2026-05-08: 8s instrumental delivered cleanly via `ralphy generate music`. |

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

**Trend-music rule:** if a template references a specific trend track (`assets/trend-*.mp3`), copy the file from the `ralphy-assets` companion repo. **Don't generate a substitute.** Track recognition is half of what makes a trend video a trend.

**Fallback** (if ElevenLabs Music quality regresses): temporarily route to `fal-ai/lyria2` via `FAL_KEY` as a documented exception. As of 2026-05-08 the fallback is not active; ElevenLabs Music is the only path.

**Avoid:**
- Suno (not on OpenRouter).
- `lyria2` directly via `FAL_KEY` while ElevenLabs Music works: don't multiply optional keys.

---

## Audio transcription / Captions

| Use case | Model | Price | Why |
|---|---|---|---|
| **Default** — word-level captions for compositions | ElevenLabs `scribe_v1` (default in `cli/lib/transcribe.ts`) | ~$0.004 per audio-minute | Returns word-level timestamps natively in the shape HyperFrames caption layers expect; no second normalization pass. Verified end-to-end on the brainrot 54.6s VO → 121 word entries. |
| **Fallback** — when ElevenLabs is down | OpenRouter `openai/whisper-1` (`--backend openrouter`) | ~$0.006 / min | One key covers it. Sometimes 400s on long audio; re-encode to 64kbps mono mp3 if you hit them. |

CLI: `ralphy generate captions --project <id> --audio <vo.mp3> --language en` (writes `captions.json` next to the project).

**Avoid:**
- Local whisper.cpp: large binary, no real benefit over the cloud at our volumes.
- Direct OpenAI API: we route through OpenRouter so one key covers vision + scoring + transcription.

---

## LLM (for skills and analytics)

**Provider routing.** All LLM / vision calls go through `cli/lib/providers/llm.ts → callLLM()`. **The only provider is OpenRouter.**

| Use case | Model | Why |
|---|---|---|
| Vision analysis of images / videos (extract-design, find-viral-moments, face-bbox, scoreImage, scoreVideo) | `google/gemini-2.5-flash` | Cheap vision (~$0.001/frame), accurate enough for smart-crop and moment detection. Use `pro` when long context is needed. |
| Deep vision (extract-design on complex landing pages) | `google/gemini-2.5-pro` | Best quality on long prompts + complex screenshots. ~3× the cost of flash. |
| Scenarist / VO rewrite / feedback parsing | `anthropic/claude-sonnet-4.6` or `anthropic/claude-opus-4.6` | RU/EN at the same level, nuances revisions well. |
| This chat | Claude Opus 4.7 | The one you're reading right now. |

**Avoid:**
- Direct `fetch("https://openrouter.ai/...")` calls in new scripts. Go through `callLLM()` so users can switch providers via `ralphy setup`.
- Hard-coded `anthropic.com` or `openai.com` URLs; everything goes through OpenRouter.

---

## Out-of-scope / dropped

These models / families were removed during OpenRouter consolidation (Sprint 1.3 / 2). Don't bring them back without an explicit plan upgrade:

- `fal-ai/nano-banana-pro/edit` — replaced with `google/gemini-3-pro-image-preview` via OR.
- `fal-ai/flux-pro/v1.1-ultra`, `fal-ai/flux/dev/inpainting`, `fal-ai/flux-pro/v1.1-ultra/redux` — out.
- `fal-ai/luma-dream-machine/image-to-video` — out (worse than kling).
- `fal-ai/wan-25` — lipsync stage dropped entirely in v2 (no FAL_KEY pipeline).
- `fal-ai/sync-lipsync`, `fal-ai/veed/lipsync` — out.
- `fal-ai/lyria2` — out (fallback reserved in the Music section).
- `fal-ai/seedream` — out.
- Replicate `wav2lip` — out (no token, no stage).
- `openai/gpt-image-1`, `dall-e-3`, `stable-diffusion-xl`, `flux/schnell` — outdated.
- Apify — replaced with a Playwright scraper in `/researcher` (deferred to v2).
- Higgsfield Soul, Fireworks Whisper — require separate keys, not in the stack.
- Vercel AI Gateway, direct OpenAI API — single-provider OpenRouter in v2.

---

## When to update this file

- On the first session in a new chat: check `Last reviewed`, refresh if stale.
- After every failure mode on a new model: add it to "Avoid" / "Lessons" with the reason.
- When you change a default in a skill or script: sync it here.
- When you add a verb to `ralphy generate` or a flag: sync the price / param notes here.
- At least once a month, even if nothing broke.
