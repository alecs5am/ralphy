# Model stack

| Task | Model | $ | Notes |
|---|---|---|---|
| Images (locations, monster) | `google/gemini-3-pro-image-preview` | $0.15 | multi-ref = the win; pass master + character + source-frame to lock identity + register. ≥4 concurrent OK. Crop baked subtitle text off source-frame refs first. |
| Door-throughs + ominous push-ins | `bytedance/seedance-2.0` | $0.14/s | honors first+last frame (room→black plunge). Stylized silhouette monster + empty rooms + plush PASS the privacy filter (photoreal humans do NOT). Min duration 4s → generate 4s, `setpts` to 3s. |
| Cheap pans on a still (montage) | `alibaba/wan-2.7` | $0.10/s | 2-15s, 9:16, first+last. Use for "barely-moving" cozy shots — don't spend seedance money on a gentle push-in. |
| VO | ElevenLabs IVC clone + `eleven_multilingual_v2` | sub | clone narrator (raw API — no verb yet, see below), then old-radio ffmpeg filter (recipes.md). Generate VO slots SERIALLY (parallel writes corrupt mp3s). |
| Music | ElevenLabs Music (instrumental) | sub | 3 liminal beds by mood: "liminal space ambient, neutral eerie" / "cozy lo-fi liminal" / "dark creepy liminal drone". 3-600s. |
| SFX | ElevenLabs Sound Gen | sub | countdown ticks. (VHS hiss = the real tape file in assets/sfx, $0.) |

## Defaults for the next one
- Reuse the monster → image spend is just locations (~$3-4).
- seedance for the 2 door-throughs + 2-4 location push-ins; wan-2.7 for the cozy montage pans (cheaper).
- Concat the cozy montage clips into ONE video before wiring (HyperFrames multi-clip bug).

## Known CLI gaps (workarounds until verbs exist)
- **`ralphy render` drives Remotion (`UGCVideo`), NOT HyperFrames `index.html`.** Render with `bunx hyperframes render <projdir> -o render/comp.mp4`.
- **No voice-clone verb.** Clone via raw ElevenLabs API: `POST /v1/audio-isolation` (denoise) → `POST /v1/voices/add` (`remove_background_noise=true`) → voice_id → `ralphy generate voiceover --voice <id>`.
- **No `ralphy template create-from-project` verb** (the templater skill references it) — this template was authored directly into `templates/`.
- No verbs for: VHS grade, chromakey, old-radio VO, beep-builder, clip-refit, compress — all raw ffmpeg in recipes.md.
- `ralphy generate captions` (Scribe) is flaky (502s) + mislabels language; pass own VO text for subtitles instead of trusting word-level output.

## Cost ballpark (reference project, including avoidable regens)
~$13.85 total: $6.15 images (41 gens, ~18 avoidable monster/realism regens this template removes), $7.70 video (2 door + 4 motion + 7 wan), VO/music/sfx free.
