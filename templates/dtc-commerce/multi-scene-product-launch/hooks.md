# hooks — multi-scene-product-launch

The 0-2s opening shape for this template's spots. Reconstructed from `scenes-27.json` (the source project) + the gen-log's first-shot prompts.

## The signature open: black-on-black brand wordmark (1.2s)

Scene 1 of the source project is a static title card — `{{brand_name}}` in minimalist white on pure black, ~1.2 seconds. NO motion, NO crew, NO product visible. This is the "minimalist brand stamp" hook — works for any tech brand that has invested in a clean wordmark and wants the spot to read as confident / premium / understated.

### Why it works

- **Earned attention.** The first 1.2s ARE the hook because the viewer must wait for the brand wordmark to resolve before the energetic montage starts. The micro-tension of "is this an ad? what brand?" is the hook.
- **Cuts hard into the second beat.** Scene 2 (wide BTS tracking shot of {{model_a}} on the treadmill) lands with maximum contrast — black -> full-frame production set with lab-coat crew. The pacing whiplash IS the energy.
- **Resets the brain.** After the typical TikTok scroll, a pure black screen with a single wordmark forces a "wait, what" pause. The spot then has 50+ seconds to make the most of that attention.

### Variants of the signature open

| Variant | When to use | Title card behavior |
|---|---|---|
| Static wordmark on black (default) | Premium tech, audio, fashion — anyone with brand equity | `<TitleCard text="{{brand_name}}" duration={36} />` (1.2s @ 30fps) |
| Wordmark + small product silhouette below | When the product itself needs a frame-1 reveal | Two-line static `<TitleCard>` — wordmark top, product silhouette bottom |
| Wordmark types-in (motion graphic) | Younger brands, indie-tech, gaming peripherals | Inject the brand display typeface, animate `letterSpacing` from 0.5em to its rest value over 24 frames |
| Wordmark on white-flash, then black | More energetic brands (athletic, gaming) | 4-frame white flash -> wordmark resolves on black |

## Alternative opens (NOT in source, but valid for variants of this template)

### "Hands first" open

Scene 1 = ECU of {{model_a}}'s hands holding {{product_name}}, before any face is shown. Builds intrigue. Works well when the product has a distinctive tactile silhouette (drone fold-out, watch crown, gaming controller grip).

Prompt for the keyframe:
```
Extreme close-up of hands holding the EXACT {{brand_name}} {{product_name}} from
reference photos — {{product_descriptor}}. Studio macro photography, soft top key,
cool desaturated blue grade. Hands occupy the center of frame, the product is the
hero. Background: out-of-focus industrial commercial-studio set. Photoreal,
vertical 9:16, no logos other than the product's own.
```

### "Cold open" — straight into act 1

Skip the title card entirely. Scene 1 = wide BTS tracking shot of {{model_a}} on the treadmill from frame 0. Trust the music to carry the brand identity. Works for established brands where wordmark redundancy hurts pace.

### "Static-to-cut" rhythmic open

3 black frames -> 1 frame of brand wordmark -> 3 black frames -> wide BTS shot. The flicker IS the hook. Used by music-video-influenced tech ads.

## What does NOT work as a hook for this template

- **Long product-reveal pan** (3+ seconds of slow rotation on the product alone) — the spot's energy is in the BTS montage, not the product itself. A slow-pan open kills the act-1 contrast. Use `product-360` for that template.
- **Talking-head VO intro** ("Hi, I'm {{persona}}, and today...") — this template explicitly has no VO. Use `life-changing-testimonial` instead.
- **Aspirational lifestyle B-roll** (slow-motion sunset, drone shot of city) — this template's grammar is the BTS-commercial-set, not the lifestyle lookbook. Use `fashion-lookbook` if you need lifestyle texture.
- **Heavy supered text** (full-screen "INTRODUCING THE NEW...") — kills the minimalist register. Save the on-screen text for the title cards between acts and the closing endcard.

## Pacing reminder

The source spot's act 1 (treadmill BTS) runs 1.2-11.7s — 10.5 seconds across 4 shots. That's ~2.6s average per shot in act 1. By the dance climax (37.3-45.3s), it tightens to 5 shots over 8s = ~1.6s per shot. The hook's discipline isn't its open — it's its commitment to NOT pad. Every shot moves.
