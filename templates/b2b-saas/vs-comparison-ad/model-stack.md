# model-stack — vs-comparison-ad

The model stack + tooling for the head-to-head comparison short, lifted from `workspace/projects/ralphy-vs-higgsfield-001/` and generalized. The cut is a HyperFrames composition; the locations + motion are AI-generated; VHS / grade is a post-process ffmpeg pass.

## Tooling + spend (source total ~$13.85)

| Phase | Model | Calls | $ each | $ total | Note |
|---|---|---|---|---|---|
| Locations / characters | `google/gemini-3-pro-image-preview` | 41 | $0.15 | $6.15 | multi-ref identity lock; ≥4 concurrent OK |
| Plunge / door-through motion | `bytedance/seedance-2.0` | 6 | $0.56-1.12 | $5.60 | first+last frame; stylized silhouettes + empty rooms pass the privacy filter |
| Gentle push-ins on a still | `alibaba/wan-2.7` | 7 | $0.30 | $2.10 | cheap 9:16 pans; don't spend seedance money on a slow push |
| Voiceover | ElevenLabs IVC clone + multilingual | 15 | $0 (sub) | ~$0 | re-records free on subscription |
| Music | ElevenLabs Music (instrumental) | 3 | $0 (sub) | ~$0 | mood beds by scene |
| SFX | ElevenLabs Sound Gen | 4 | $0 (sub) | ~$0 | countdown ticks, etc. |
| Captions | ElevenLabs Scribe | 5 | ~$0.0005 | ~$0.003 | for word-level caption timing |

Genuine spend ~$11 (the distinct location + motion + character slots). ~$2.7 was avoidable design-discovery regens (character-face redesigns ×3, realism register ×5) that a locked guideline + a frame-study up front would have cut.

## Model picks (defaults for the next comparison short)

- **Locations + characters → `gemini-3-pro-image-preview`.** Multi-ref is the win: pass `master + character + source-frame` to lock identity + setting across the whole cut. Cheap, parallel-friendly. (Check `MODELS.md` before the call.)
- **Plunge / door-through / location motion → `seedance-2.0`.** Honors first+last frame (room→black plunge). Stylized silhouettes + empty rooms + props pass the privacy filter (unlike photoreal humans, which it blocks — see the `feedback_seedance_rejects_realistic_people` memory). $0.14/s, min duration 4s (generate 4s, `setpts` down if you need 3s).
- **Gentle push-ins on a still → `wan-2.7`.** Half the price ($0.10/s), 2-15s, 9:16, first+last. Perfect for a montage of barely-moving shots.
- **VO → ElevenLabs IVC clone** (+ optional radio/old-TV ffmpeg post). Subscription, iterate freely.
- **Music → ElevenLabs Music**, instrumental, by mood. Free, fast.

## Identity-lock discipline (multi-ref on every gen)

Both brands' characters + locations must stay on-model across ~12 clips. Pass the shared hub plate + each side's character master + a cropped source-frame as extra `--ref` on every gemini generation. Crop any leaked on-screen text band OFF a source-frame ref first — gemini bakes leaked subtitle text into the output.

## VHS / grade is a post-process ffmpeg pass

Do NOT bake the grade into the composition. After `ralphy render`, run the grade/VHS/mirage as an ffmpeg pass, then compress:

- **Mirage drift** (old-TV horizontal sine): `scale=1.03,crop=...:x='...+5*sin(2*PI*t/2.6)'` — smooth, no jitter.
- **Compress:** x264 CRF23 slow +faststart (source went 76→31 MB, visually lossless on grainy content).

Keep the master (pre-grade) render around; the graded + compressed file is the deliverable.

## Tool behaviors discovered

- `seedance-2.0` min duration = 4s (no 3s) → generate 4s, `setpts` to the target length.
- `wan-2.7`: 2-15s, 9:16, first+last, $0.10/s — the cheap workhorse.
- gemini bakes leaked on-screen text from a source-frame ref → crop the subtitle band off the ref first.
