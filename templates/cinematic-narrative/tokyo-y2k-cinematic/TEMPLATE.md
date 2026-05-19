# Tokyo Y2K Cinematic Near-Miss

Long-form 75s cinematic near-miss arc in the register of KYO KIMURA's `honeybee` — locked-off tripod, 35mm Kodak Portra 400 emulation, soft natural light, frame-within-a-frame compositions through glass / rain / curtains, zero diegetic audio, intimate piano-bed adagio carrying every beat. Two strangers, one city, one day, never speak.

Crystallized from `workspace/projects/tokyo-y2k-001/` ("Tokyo, slow shutter" — 17-shot ~75s arc, user rating 8.5/10, *"очень эстетично приятно видео получилось"*).

## Vibe

This is **cinematic-narrative** in its long-form, contemplative register — the opposite of viral hyper-cut. Adagio. Held shots. Silence between piano notes. The city is the antagonist. The "yes" lasts a half-second. The viewer decides whether either of them felt it.

Variations: any dense neon Asian metropolis (Tokyo / Seoul / Hong Kong / Taipei / Bangkok / Osaka). Any era with a visible costume-DNA gap from now (Y2K / 1990s / shōwa-late-80s / vaporwave-2010s / near-future). The locked-off + zero-diegetic + frame-within-frame invariants stay regardless.

## Key rules (distilled from the postmortem)

1. **Source-clip duration ALWAYS overshoots the storyboard's requested duration by ~1s, every model, every clip.** Kling-v3.0-pro and Seedance-2.0 both return 4.04s / 5.04s / 6.04s / 9.04s when asked for 4 / 5 / 6 / 9. The extra 24 frames is the model's silent buffer. **Plan the trim pass into the workflow from turn 1.** Skipping this rule cost the source project ~$2 + 30 min iteration.

2. **`STATIC_ROOT` in the Remotion composition MUST equal `project-<id>`, NOT bare `<id>`, and paths inside `staticFile()` MUST drop the `assets/` prefix.** `ralphy render` materializes the symlink `public/project-<id>` → `<project>/assets/`. The `playdate-pixel-001` composition is the legacy outlier (bare-id convention); new compositions follow the `project-<id>` convention.

3. **`ralphy render <id>` hard-fails without `composition-props.json` even when the composition takes zero props.** Stub it: `echo '{"compositionId":"<CompId>"}' > workspace/projects/<id>/composition-props.json`.

4. **`ralphy ref analyze-video <local-path>` is the cheapest precision tool for trim-point detection.** Pass `--prompt-file logs/trim-prompt.md` with a strict-JSON schema (see `prompt-cookbook.md` → Trim analysis). Gemini-3.1-pro-preview latency is ~9-15s per clip; parallelizes at xargs -P 6 with no rate-limit hits. Gemini *rounds duration to nearest second* — use ffprobe for exact durations, gemini for relative timestamps inside each clip.

5. **ElevenLabs Music has a 2-concurrent-request hard cap.** Fan-out 3+ in parallel → one returns HTTP 429 `concurrent_limit_exceeded`. Batch in groups of 2, OR run serially.

6. **For this register, compose at 24fps native, NOT 30fps.** Kling and Seedance return 24fps natively. Composition at 24fps = zero resampling = cleanest motion. 30fps would force Remotion's video-rate conversion and add micro-stutter.

7. **Letterboxed 1.85:1 inside 9:16 = `1080×584` inner box centered vertically at `top: 668px` (math: `(1920 - 584) / 2 = 668`).** Use `overflow: hidden` + `objectFit: 'cover'` on `<OffthreadVideo>` to crop 16:9 source into 1.85:1 — ~4% horizontal crop, invisible to the eye.

## Workflow (editor stage — assuming 15-17 raw clips + 1 music bed on disk)

```
1. Inspect clip durations              (1 min)
   ├─ ffprobe per *.mp4 → list (duration, resolution, fps)
   ├─ Confirm all clips on same fps (24 for this register)
   └─ Sum raw durations; compare to music duration; surface gap if any

2. Decide gap policy                   (user decision, 1 min)
   ├─ Trim clips to fit music (cleanest — default for this template)
   ├─ Regen music to fit clips
   └─ Silent tail (rarely right)

3. Trim-analysis pass                  (3 min wall clock, parallel)
   ├─ Write logs/trim-prompt.md (strict-JSON schema — see prompt-cookbook.md)
   ├─ ls assets/videos/*.mp4 | xargs -I{} -P 6 \
   │    bun run ralph -- ref analyze-video {} \
   │      --prompt-file logs/trim-prompt.md \
   │      --out logs/trim-analysis/{}.json --max-tokens 4096
   └─ Tabulate with jq: best_subwindow + max_trim_sec + trim_from + notes

4. Author scenes.ts                    (5 min)
   ├─ For each clip: pick startFromSec + durationInFrames totalling MUSIC_DURATION × FPS
   ├─ Reserve extra dur for the emotional-peak shot (~9s)
   ├─ Bias trims toward gemini's "tail" recommendation (cleaner cuts)
   └─ Verify sum-of-frames == TOTAL_FRAMES exactly

5. Author index.tsx                    (10 min)
   ├─ Outer AbsoluteFill backgroundColor='#000' (letterbox bars)
   ├─ Inner letterbox div (1080×584 centered if 9:16; full-bleed if 16:9)
   ├─ <Sequence> per scene with OffthreadVideo + startFrom + objectFit:'cover'
   ├─ <Audio src={music} volume=0.9 />
   └─ FadeToBlack overlay via interpolate on last 36 frames (1.5s)

6. Register in Root.tsx                (1 min)
   ├─ <Composition id width={1080} height={1920} fps={24} />  (9:16)
   └─ <Composition idWide width={1920} height={1080} fps={24} />  (16:9 sibling)

7. Stub composition-props.json         (10 sec)
   └─ echo '{"compositionId":"<X>"}' > workspace/projects/<id>/composition-props.json

8. Render                              (1-2 min per format)
   ├─ ralphy render <id> --composition <X>       → final.mp4 (9:16)
   └─ ralphy render <id> --composition <X>Wide   → final-16x9.mp4

9. Eval                                (3 min)
   └─ /ralph-evaluator → eval.json + eval-report.md
```

At 1× minimum-iteration (no STATIC_ROOT mistake, no composition-props.json scramble, no parallel-3 music 429), total editor-stage time ≈ 20-25 min, cost ≈ $1-3 (gemini analyze-video × N clips). Full-project cost (image + video + music + trim + render) ≈ $20-25.

## Required inputs (slots)

| Slot | Description | Example from source project |
|---|---|---|
| `{{city_name}}` | The dense Asian metropolis the arc walks through | `Tokyo` |
| `{{aesthetic_era}}` | Costume + grain register — defines the wardrobe + grade era | `Y2K (late 1990s / early 2000s Japanese art-cinema — Shunji Iwai / Wong Kar-wai)` |
| `{{rail_system_signature}}` | Transit-system color / livery / signage that anchors the platform shots | `Yamanote line — green stripe livery, JR signage, Tokyo loop-line` |
| `{{neighborhood_anchor_a}}` | First named neighborhood / location beat (record shop, vinyl bin, etc.) | `Shimokitazawa record shop` |
| `{{neighborhood_anchor_b}}` | Second named neighborhood / location beat (crowded crossing, dusk panorama) | `Shibuya scramble crossing at dusk` |
| `{{japanese_signage_type}}` | Typography register — what kind of signage appears in frame | `unreadable kanji storefront signage, vending-machine fluorescent ads, kissaten tungsten — NO Latin readable text, NO logos` |
| `{{character_a}}` | Full DNA paragraph for character A (wardrobe + hair + makeup + accessory + energy) | `~22yo Japanese woman, art-student register: oversized cream cardigan over white tee...` |
| `{{character_b}}` | Full DNA paragraph for character B | `~24yo Japanese man, music-shop assistant register: faded navy Champion crewneck...` |
| `{{target_language}}` | Spoken-or-not register — this template's default is non-verbal | `non-verbal (zero dialogue, zero VO, zero captions)` |
| `{{music_brief}}` | The 75s ElevenLabs Music prompt — instrumentation + tempo + arc | `modern-classical / cinematic-instrumental, adagio ~60 BPM...` |

## Anti-patterns (DO NOTs distilled from the postmortem)

- **DO NOT** treat `composition-props.json` as optional for parameterless compositions — `ralphy render` hard-fails without it.
- **DO NOT** copy the `STATIC_ROOT = "<id>"` pattern from `src/videos/playdate-pixel-001/` — that's a legacy bare-id convention; new compositions must use `STATIC_ROOT = "project-<id>"`.
- **DO NOT** request 30fps composition for this register — Kling/Seedance return 24fps natively, 30fps forces Remotion video-rate conversion and adds micro-stutter.
- **DO NOT** trust gemini's `observed_duration_sec` field — it rounds to nearest integer. Use ffprobe for exact durations.
- **DO NOT** fan-out 3+ parallel ElevenLabs Music gens — 2-concurrent cap returns 429 on the over-cap call.
- **DO NOT** generate video clips with `--audio` ON — zero diegetic invariant. All audio is a separate ElevenLabs Music post-mix, per `feedback_kling_no_music_eleven_music_postmix.md`.
- **DO NOT** include VHS lines, date stamps, CRT scanlines, chromatic aberration, or anime-eye distortion in image prompts — those are "trashy Y2K," not "cinematic Y2K." This register avoids them aggressively in the negatives block.
- **DO NOT** use seedance-2.0 for photoreal human face anchors — privacy filter rejects them (per `feedback_seedance_rejects_realistic_people`). Reserve seedance for landscape / hands / empty-courtyard / object-only shots; use kling-v3.0-pro for every human-anchored shot.
- **DO NOT** include named-artist or named-producer references in ElevenLabs Music prompts — blocked by ToS (per `feedback_elevenlabs_music_no_artist_names`). Genre + tempo + instrumentation only.
- **DO NOT** compose the letterbox with two stacked rect overlays — use the outer-fill + inner-div pattern (outer `AbsoluteFill` black, inner `1080×584` div at `top:668px` with `overflow:hidden` + `objectFit:'cover'`). The inner div doubles as the crop clip.
- **DO NOT** ship single-aspect — author the dual-composition (9:16 letterbox + 16:9 native sibling) from the same `scenes.ts` and `MUSIC_FILE` constants. One scene-edit propagates to both.
- **DO NOT** ffmpeg-post the fade-to-black — use Remotion `interpolate` opacity on an `AbsoluteFill` overlay, return `null` when `opacity <= 0` to skip the DOM node.

## Composition tricks that paid off (vibe-style: hand-author Remotion)

- **Letterbox via outer-fill + inner div.** Outer `AbsoluteFill` is `#000`; inner `1080×584` div centered at `top: 668px` is where the video lives. Cleaner than overlaying two black bars on a full-bleed video, and the inner div doubles as the `overflow: hidden` clip for `objectFit: 'cover'`.
- **Fade-to-black via `interpolate` opacity on an `AbsoluteFill` overlay**, returning `null` when `opacity <= 0` to skip the DOM node. No ffmpeg post-pass needed. Fires on the last 36 frames (1.5s) of the final shot.
- **Dual-composition trick** for shipping 9:16 + 16:9 from one scene timeline. Shared `VideoTrack` + `MusicTrack` + `FadeToBlack` components, the only difference is the outer wrapper (letterbox div for 9:16, raw AbsoluteFill for 16:9). One `scenes.ts` drives both.
- **`startFromSec` stored in seconds, converted to frames at render time** via `Math.round(scene.startFromSec * FPS)`. Avoids per-shot frame-counting math errors when FPS changes. Gemini trim recommendations are also in seconds — units match the source data.
- **24fps cinematic native everywhere** — composition fps matches source-clip fps matches gemini's reasoning unit. No resampling artifacts.

## Sub-doc map

- `prompt-cookbook.md` — verbatim per-stage prompts (image / video / trim-analysis / music) with `{{slots}}` substituted
- `model-stack.md` — image / video / music model picks + cost ballpark + what worked vs. what we dropped
- `hooks.md` — 0–2s establishing-shot patterns (dawn-platform, neon-flash, single-bird-takeoff, condensation-fogged-window)
- `examples.md` — two variant cookbooks (Tokyo+Y2K is the source instance; Seoul-1990s and Hong-Kong-vaporwave are worked variants)
- `README.md` — one-screen "how to consume this template"
