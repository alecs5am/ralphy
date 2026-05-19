# model-stack — analog-horror-psa

Extracted from `workspace/projects/analog-horror-fridge-001/logs/generations.jsonl` (116 entries) + POSTMORTEM Section 3.

## Cost ballpark

| Phase | Min-viable run | Source-project actual | Why source overspent |
|---|---|---|---|
| Image — style prototype (1 shot) | $0.15 | $1.00+ | Iterated 5 wrong-style gpt-5.4 prototypes before passing a `--ref` from the reference video |
| Image — locked batch (9 sibling icons) | $1.35 | $1.95 | One wrong-style batch on gemini ($1.50 sunk) before user said "не пиксельные" |
| Image — extra attempts after style 90% there | $0.00 | $0.30 | 2 "almost right" tweaks |
| Voiceover (10 lines, 1-3 takes) | $0 (sub) | $0 | Cap |
| SFX (13-17 clips + climax growl variants) | $0 (sub) | $0 | Cap |
| Music | $0 | $0 | yt-dlp only |
| Renders + ffmpeg optimize | $0 (local) | $0 | Cap |
| **TOTAL** | **~$1.50** | **~$4.45** | $2.80 avoidable, $0.40 genuine prototype iteration |

Round figure for new projects on this template: **~$1.50** if rules 1-3 in TEMPLATE.md are followed.

## What worked

### Image generation

| Use case | Model | Why | Cost |
|---|---|---|---|
| **Style discovery / prototyping** | `openai/gpt-5.4-image-2` (via OpenRouter `media.ts`) | Best at "match a reference image exactly" with verbose style prompts. Strongest single-shot match. | $0.20/image |
| **Style-locked batch** (after prototype approved) | `google/gemini-3-pro-image-preview` aka nano-banana-pro | With `--ref` of the locked prototype + per-icon subject prompt, holds style across 10 outputs reliably. Better than gpt-5.4 for *consistency across a batch*, even though gpt-5.4 is stronger on a single shot. | $0.15/image |

The right move: ONE prototype on gpt-5.4-image-2 → user yes/no → if yes, switch to nano-banana for the 9 siblings using the prototype as `--ref`.

### Voiceover (TTS)

| Use case | Model | Voice | Why | Cost |
|---|---|---|---|---|
| **Cold robo-female PSA — winner** | `eleven_v3` or `eleven_multilingual_v2` | "Alerter" (community library, user-generated) | Strict robotic broadcaster cadence. Source project generated manually in 11Labs UI with stability ~0.5 + style 0. The CLI doesn't expose `stability` / `similarity_boost` / `style` flags yet (POSTMORTEM open issue #3) — when it does, the equivalent settings are `stability: 0.5, similarity_boost: 0.75, style: 0.10` over the API. | sub |
| **API-callable fallback** | `eleven_multilingual_v2` | `weA4Q36twV5kwSaTEL0Q` (Ava) | Default. Reads with too much inflection. Use only when "Alerter" 404s or you can't access 11Labs UI. CAPS text helps reduce inflection but doesn't fully fix it. | sub |
| **Tried and dropped** | `eleven_multilingual_v2` | `20ErAk3gwcDeRWFcV85t` (Marcus – Robotic and Confident) | Drier than Ava but still has human cadence. Source project used this for v2 render before moving to "Alerter" in manual 11Labs UI. | sub |

**Voice ID hard rule:** verify the voice exists before bulk gen — community voice IDs can disappear between sessions:

```bash
xh GET https://api.elevenlabs.io/v1/voices/{{vo_voice_id}} \
  -H "xi-api-key: $ELEVENLABS_API_KEY" | jq .voice_id
```

If 404, list current voices: `xh GET /v1/voices | jq '.voices[] | .voice_id + " " + .name'`.

**Non-English caveat:** For Russian / non-English target audiences, `eleven_multilingual_v2` adds accent slip + voice-age drift on the cold-robo-female register. Verify on a 1-line test before generating all 10. Per MEMORY note `feedback_kling_no_ru_audio` — same problem class applies to 11Labs on non-EN PSA delivery.

### SFX generation

| Use case | Model | Endpoint | Cost |
|---|---|---|---|
| **All non-music audio** — VHS hiss, static, EBS alert, low drone, growls, signal-lost tone, wind, glass, ambient atmospherics | ElevenLabs `sound_generation_v2` via `ralphy generate sfx` | `cli/lib/providers/media.ts:generateSfx` (added during source project) | sub |

**Climax growl rule:** generate 4 variants on the same monstrous-predator prompt seed (see `prompt-cookbook.md` Stage: SFX → Climax growl variants). LAYER all 4 at staggered offsets (1.5s / 1.8s / 1.9s / 2.1s) with volumes 0.55-0.60. Single growl reads as "chihuahua yipping at me" (POSTMORTEM lesson #11).

### Music

| Use case | Model / source | Why | Cost |
|---|---|---|---|
| **Analog-horror ambient bed** (optional) | `yt-dlp` pull from a user-supplied YouTube link | Generated music (ElevenLabs Music) wasn't tried in source. The yt-dlp + cp path is 2 minutes and the result matches the reference. For trend-bed in analog-horror, this is the right move. Skip music entirely by default. | $0 |

If trying ElevenLabs Music in a future iteration: ToS blocks artist / producer names (per MEMORY note `feedback_elevenlabs_music_no_artist_names`). Use genre + tempo + instrumentation only.

### Render + optimize

| Stage | Tool | Settings | Why |
|---|---|---|---|
| Render | Remotion 4.0.441 | Default CRF 18 | Off-the-shelf |
| Optimize | `ralphy video optimize` → ffmpeg x264 | `--crf 30 --tune grain --preset veryslow` | For analog-horror noise-heavy renders, this is the right preset. CRF 18 produces 190 MB / 30s; CRF 30 + grain produces 28 MB with zero perceptual loss because `-tune grain` preserves random-noise texture while spending bits on structural content. Default x264 smooths the snow into mush. Source added the verb mid-session (`cli/lib/ffmpeg-recipes.ts:optimizeReencode`, `cli/commands/video.ts:optimize`). |

## What we tried and dropped

| Attempt | What broke | Lesson |
|---|---|---|
| 4 wrong dog-icon styles on gpt-5.4 before passing `--ref` from the reference video | $0.80 sunk on pixel-art, spray-grain, too-clean SVG, 3-block abstraction | **Always pass `--ref <ref-frame>` from FIRST prototype.** Don't guess "pictogram" from a verbal brief. |
| 5 more prototype attempts after style was "almost right" (v6-v10) | $1.00 sunk; no user yes/no gate after each | **One YES/NO question per prototype before iterating further.** Don't iterate silently. |
| `ralphy queue` for 9 parallel image jobs | All 9 failed with OpenRouter `403 Key limit exceeded` (an undocumented burst cap; `/v1/key` doesn't surface it; `/v1/credits` shows balance) | **Never use `--queue` for image batches.** Sequential bash for-loop with `sleep 2`. (POSTMORTEM open issue #1, slated CLI fix: per-job min-interval setting or 403 retry-with-backoff in the queue worker.) |
| Loudnorm + regen in the same shell loop | Double-norm bug when regen failed (404 voice) and loudnorm ran on stale files | **Always: gen all → verify durations → separate loudnorm pass.** |
| Single climax growl SFX | Read as "chihuahua yipping at me" | **Generate 4 growl variants and LAYER them at staggered offsets.** |
| First climax was 220 random colored confetti rects per frame | Looked like Mario Kart, not analog-TV signal-lost | **Match the reference literally** — blurred SMPTE color bars + sync-jitter + tracking band + chromatic-aberration ghost. The blur is non-negotiable. |
| Icons rendered on Remotion `#1a1a1a` bg with their generated near-black bg | Visible black rectangle around each icon | **Two-pass ffmpeg colorkey** (`colorkey=0x000000:0.20:0.08,colorkey=0xFFFFFF:0.20:0.05,format=rgba`) → save to `assets/images-keyed/` → reference THAT path in Remotion + use pure `#000000` Remotion bg. |
| Default Remotion CRF 18 + canvas noise | 190 MB / 30s — unsharable | **`ralphy video optimize --crf 30 --tune grain --preset veryslow`** as a post-render step. |

## Stage-by-stage gen-log shape (for future log analysis)

Source gen-log (`logs/generations.jsonl`, 116 entries) breakdown:

| `kind` | `endpoint` | Count | Cost |
|---|---|---|---|
| `image` | `google/gemini-3-pro-image-preview` | 33 | $3.45 |
| `image` | `openai/gpt-5.4-image-2` | 5 | $1.00 |
| `voiceover` | `eleven_multilingual_v2` | 46 | $0 (sub) |
| `sfx` | `sound-generation` | 17 | $0 (sub) |
| `video` | `remotion-render` | 14 | $0 (local) |
| `video` | `ffmpeg/optimize` | 1 | $0 (local) |
| **TOTAL** | | **116** | **$4.45** |

Voiceover entry count is high (46) because of regen cycles across 3 voice attempts (Ava → Marcus → Alerter manual). At ~10 final lines × 1-3 takes a new project should land in 10-30 entries, not 46.

Image entry count is high (38) because of the failed style-prototype iterations + wrong-style batch. New project should land in 10-12 entries (1 prototype + 9 siblings + 1-2 retries).
