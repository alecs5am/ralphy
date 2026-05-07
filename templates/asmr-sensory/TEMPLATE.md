# ASMR / Sensory — vibe style

**Genre:** pure-sensory micro-content — macro close-ups with diegetic foley as the hero.
**Length:** 30-90s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.
**Clip count:** 3-8 slow shots.

> **Sound is the product.** Almost every other template in this pack is built to survive a muted scroll. ASMR is the inverse: it converts sound-on into save+rewatch. If you can't deliver clean diegetic foley, do not ship this template — choose `brainrot-ai-meme` or `tutorial-how-to` instead.

## Why this works

ASMR is one of the few formats where audio is a primary growth lever, not decoration. Two algorithmic signals stack:

1. **Completion rate.** Viewers stay through the whole clip to "catch" the next sound. Slow pacing that would kill any other format becomes the feature here.
2. **Save + rewatch.** The "satisfying" reflex — viewers save to re-listen and replay specific beats. TikTok / Reels surface save+rewatch as a near-hard ranking signal.
3. **Differentiation in the feed.** Most UGC is engineered for the muted scroll (loud captions, fast cuts). ASMR breaks the pattern — viewers unmute. That alone is rare enough to lift CTR on the first frame.

Categories where this converts: **beauty** (cream texture, lipstick swatch), **food** (chocolate snap, cheese pull, sizzle), **unboxing** (jewelry box, electronics, parcel), **crafts** (slime, soap-cutting, kinetic sand), **spa rituals** (matcha whisk, candle light, water pour).

## Vibe anchors

- **Macro close-up.** Extreme close-up, shallow depth of field, the subject fills the frame. The frame is the texture.
- **Slow pace.** Minimum 1.5s per shot. No snap zooms. No whip-pans. No fast cuts. The pace IS the relaxation trigger — break it and you've made a different format.
- **Sound-design forward.** Foley sits at -6dB to -3dB. Music is OFF or sub-perceptual ambient at -25dB. VO (if any) is a whisper at -3dB below the foley bed.
- **No music or sub-perceptual ambient only.** If you must add a bed, it's a quiet drone — no melody, no rhythm. Anything you'd call "a song" kills the foley and the format collapses to a generic montage.
- **Diegetic = the rule.** Every visible motion makes the sound it would make in real life. A spoon scraping a jar makes a scrape. A cardboard tab opening makes a creak. Out-of-sync foley is the #1 way this format reads as fake.

## Variation axes

| Axis | Options |
|---|---|
| Category | beauty-cream / food / unboxing / slime / spa-ritual / craft |
| Pace | slow (1.5-2s per shot) / very-slow (3-5s per shot) |
| Voice | silent (default) / whisper-VO / pure-foley |
| Audio source | live diegetic recording / synthesized SFX library / ElevenLabs Music SFX prompts |
| Music | off (default) / sub-perceptual ambient bed at -25dB |

## Narrative arc

```
0-3s    → Establish the surface. Where are we? Cream jar, chocolate bar, sealed parcel,
          slime tub, matcha bowl. One macro frame, one foley anchor (e.g. lid-twist click,
          tape-rip, foil-crinkle). The viewer's first sensory commitment.

3-(N-3)s → Sensory procedural. 3-6 slow beats. Each beat: one macro motion + one foley sound.
          Beats stack: scoop → spread → press → lift → trace. Or: tab-open → tape-rip →
          foam-extract → unwrap → lift-product. No talking. No music swell. Pure procedure.

(N-3)-N s → Reveal / state-change. The cream is now a glossy stripe on skin. The chocolate
            is now snapped in two. The slime is now stretched thin. The parcel is now open
            with the product visible. One final foley beat — usually a "completion" sound
            (a soft thump, a long sigh, a single bell strike, silence after motion).
```

For a 30s video: ~3-4 sensory beats. For 60s: ~5-6. For 90s: ~6-8 with a slower pace.

## Required user inputs

1. **Subject** — what's being sensed. Cream / chocolate / parcel / slime / matcha / etc.
2. **Action sequence** — 3-5 sensory beats, each a single visible action with a clear sound.
3. **Voice toggle** — silent (default), whisper-VO, or pure-foley-only.
4. **(Optional) Brand reference** — required if the subject is a named brand. AGENTS.md rule #3 applies.
5. **(Optional) Music toggle** — off (default) or sub-perceptual ambient.

## Reference-required gate (only if brand-named)

If the brief names a real brand (e.g. "Charlotte Tilbury Magic Cream", "Lindt Excellence 70%"), a reference photo of the actual packaging MUST exist at `workspace/projects/<id>/assets/uploaded/`. Refuse otherwise:

> "The brief mentions '<brand>'. I need a reference photo of the actual packaging — drop one in this chat, or rephrase in generic terms ('a cream jar', 'a dark chocolate bar'). At macro scale AI-improvised branding still reads as fake."

For generic subjects (anonymous cream, generic slime), no reference needed.

## When NOT to use

- **The brief needs energy or urgency.** Use `brainrot-ai-meme` or `social-hook`. Slow pacing is the antithesis of urgency.
- **The audience needs explanation.** Use `tutorial-how-to`. ASMR doesn't teach — it soothes. Pedagogy in a sensory format reads as a tonal mismatch.
- **No clean audio capture path.** If you can't record real foley AND don't have a curated SFX library, you'll get either silence (empty) or out-of-sync stock effects (fake). Both kill the format.
- **The subject has no inherent sound.** Static photography, abstract concepts, software UIs — there's nothing to listen to. Use a different format.
- **You need a verbal CTA.** ASMR ends in silence or a single foley beat, not "link in bio." If the goal is hard conversion, pair with a separate `before-after-product` cut.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 4-7 × `gemini-3-pro-image-preview` @ $0.15 | $0.60 - $1.05 |
| Video clips | 3-8 × `kling-v3.0-pro` × 5s @ $0.14/s | $2.10 - $5.60 |
| VO | 0-1 ElevenLabs call (subscription) | $0 |
| Music / ambient | 0-1 ElevenLabs Music call (subscription) | $0 |
| Foley / SFX | library or ElevenLabs SFX prompts | $0 - $0.05 |
| Render | local | $0 |
| **Total** | | **~$2.70 - $6.70** |

Cost scales with clip count — a 30s 3-clip ASMR is among the cheapest formats; a 90s 8-clip approaches the upper end of the pack.

## Read also

- `hooks.md` — 10-12 ASMR opens, sound-design notes per pattern.
- `prompt-cookbook.md` — macro vocabulary, sound-design matrix per category, audio production discipline, 4 worked examples.
