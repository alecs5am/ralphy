# Green Screen Explainer — vibe style

**Genre:** TikTok-native green-screen — creator stands in front of a screenshot / article / meme / chart and reacts.
**Length:** 15-45s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920, backdrop-driven.

> **Reference-required gate.** The backdrop (real screenshot, real article, real Reddit post, real chart, real meme image) MUST be supplied by the user at `workspace/projects/<id>/assets/uploaded/`. AGENTS.md hard rule #3 refuses AI-improvised real news, fabricated Reddit threads, fake tweets, or hallucinated charts. Without a real backdrop, `/ralph-art-director` refuses. AI-faking a "real" headline is a disinformation defect, not a creative choice.

## Why this works

The green-screen format is a **double-weave of information**:

1. **The backdrop carries the source.** Viewers see the actual screenshot / article / chart — they don't have to trust a paraphrase.
2. **The creator carries the personality.** Reaction face, gesture, tone — what makes a take watchable.
3. **Both are on screen at once.** Other formats force a choice (cut to screenshot OR to creator). Green-screen weaves them — the viewer reads the source AND watches the reaction in the same frame.
4. **It's a native TikTok effect.** Algorithmic affinity is high — TikTok rewards content that uses its own primitives.

Drew Afualo's reaction format (1.7M+ likes per video) is the canonical reference: backdrop + zoom + outraged personality. The pattern survives because it compresses two videos into one screen.

## Vibe anchors

- **Backdrop visible behind the creator at all times.** The creator is bottom-right at ~1/3 frame — never covers the backdrop content.
- **Pointing or circle-gesture in the first 2 seconds.** "Look at this" is the contract: the viewer knows what to read first.
- **At least one zoom-in moment** (unless the format is calm-explain). The pull-zoom on the backdrop signals "this specific part matters."
- **Reaction face is the punchline.** Even on calm-explain takes, the creator's face does work the VO can't.
- **Captions positioned ABOVE the creator.** Not covering backdrop, not covering face.
- **Real backdrop, always.** No AI-generated "screenshots" of news that didn't happen. Refuse.

## Variation axes

| Axis | Options |
|---|---|
| Backdrop type | screenshot (chat / DM / Reddit) / news article / chart / meme image / image-only (e.g. product photo on competitor) |
| Pointing-style | hand gesture / animated circle on backdrop / arrow overlay / no pointer (zoom does the work) |
| Reaction tone | calm-explain / outraged / curious / sarcastic / amused |
| Zoom-in cadence | none / once-mid / twice (every 8-12s pull-zoom) |
| Creator presence | full talking-head clip / static keyframe with subtle ken-burns + VO |
| VO language | any — English default; visual arc carries regardless |

## Narrative arc

```
0-2s    → "Look at this." Backdrop reveals (snap-in or quick fade).
          Creator points / gestures at it. Hook line lands.
2-25s   → Explanation. VO walks through what's on the backdrop.
          1-2 zoom-ins on the part that matters most.
          Circle / arrow annotation appears on the zoomed region.
25-45s  → Reaction / outro. Creator pulls back to camera, lands the take.
          Optional CTA ("follow for more news takes").
```

Short version (15-25s): drop the second zoom and the outro CTA. Long version (35-45s): two zoom-ins, longer reaction beat at the end.

## Required user inputs

1. **Backdrop content** — image file: screenshot / article / Reddit post / chart / meme. **REQUIRED.** Without it: refuse.
2. **Reaction script** — what the creator says (or a tone-brief and let `/ralph-scenarist` write it).
3. **Tone** — calm-explain / outraged / curious / sarcastic / amused.
4. **(Optional) Creator persona reference** — photo of the on-camera creator if a recurring persona is in play.
5. **(Optional) VO language** — defaults to English.
6. **(Optional) Zoom cadence** — none / once / twice.

## Reference-required gate (hard refuse)

If the brief implies real-world content (news, screenshots, real-person quotes) without a backdrop file:

> "The brief mentions reacting to '<X>'. I need the actual backdrop — drop the screenshot / article / post / chart in this chat. I won't AI-generate a fake screenshot of real news, a fake Reddit post, or a fabricated chart. That's a disinformation problem, not a creative one."

If the backdrop is copyrighted (paywalled news, copyrighted meme art, copyrighted character image) and the use is commercial / brand-channel:

> "The backdrop you supplied is copyrighted. For a commercial channel, this needs legal review — fair-use commentary may apply but I can't make that call. Flag with your legal contact, or supply a different backdrop."

## When NOT to use

- **No real backdrop available** → use `yap-talking-head` (pure-creator format) instead.
- **Backdrop is copyrighted and channel is commercial** → legal review or pick a different angle.
- **Brief is pure-opinion with no source to point at** → `talking-head-rant` is the right pattern.
- **Length > 60s** — green-screen attention curve drops; switch to `podcast-clip` framing.
- **Backdrop content is too dense to read at 9:16** (long article, tiny chart) → either crop to the relevant excerpt before generating, or pick a different format.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Character keyframe | 1-2 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.15 - $0.30 |
| Talking-head clip(s) | 1-3 × `kling-v3.0-pro` × 5s @ $0.14/s | $0.70 - $2.10 |
| VO | 1 ElevenLabs call (subscription) | $0 |
| Music bed (optional) | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 1 × whisper-1 | ~$0.001 |
| Backdrop | user-supplied | $0 |
| Render | local | $0 |
| **Total** | | **~$0.85 - $2.40** |

Cheapest format in the pack — the backdrop is free (user-supplied), only the creator clip costs.

## Read also

- `hooks.md` — 10-12 green-screen opening lines + per-pattern backdrop fit, gesture cue, tone.
- `prompt-cookbook.md` — composition layout, pointer / circle animation, zoom cadence, VO direction, captions placement, music bed, mistakes, 4 worked examples.
