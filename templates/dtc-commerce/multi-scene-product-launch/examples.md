# examples — multi-scene-product-launch

Two worked variant briefs that show how the {{slots}} project across categories.

---

## Worked example #1 — premium consumer audio (the source pattern)

**Brand:** `{{brand_name}}` = `Aurora`
**Product:** `{{product_name}}` = `Echo Wave`
**Product descriptor:** `{{product_descriptor}}` = `over-ear wireless headphones, matte gunmetal aluminum housing, brushed titanium driver vents, soft cream leather earpads, signature copper logo dot on left cup`
**Cast:**
  - `{{model_a}}` = `young woman, warm olive skin, blunt-cut copper bob, calm intense gaze`
  - `{{model_a_wardrobe}}` = `oversized cream wool turtleneck, deep brown wide-leg trousers`
  - `{{model_b}}` = `young man, deep skin tone, close shaved head with neat short beard`
  - `{{model_b_wardrobe}}` = `matte black tech-couture mock-neck top, dark slate trousers`
**Set backdrops:**
  - `{{set_backdrop_a}}` = `printed alpine-mountain fabric banner (visible fabric weave, NOT a real mountain range)`
  - `{{set_backdrop_b}}` = `printed deep-space starfield backdrop, foam-panel anechoic chamber, city-skyline at dusk banner`
**Slogan:** `{{brand_slogan}}` = `hear it whole`
**URL:** `{{brand_url}}` = `aurora.audio`
**Scene count:** `{{scene_count}}` = `27`
**Target language:** `{{target_language}}` = `source-1:1` (recreation) — original music carries the spot

### Sample substituted scene-02 prompt

```
OUTPUT FORMAT: tall vertical 9:16 portrait frame, 1024x1792, NEVER square.

Recreate the EXACT set, lighting and mood of reference frame #1 in a vertical-
portrait crop. Every set element from the reference must be preserved:
- Industrial commercial-studio location, raw cold-grey polished concrete floor
- Background centre-right: large freestanding printed alpine-mountain fabric
  banner (visible fabric weave, NOT a real mountain range) made of tall vertical
  wood-panel sections
- Background left: a translucent plastic-strip curtain doorway hanging from
  ceiling, with a crew member sitting on a low stool behind it on the left
- Mid-ground left: another crew member in a long translucent plastic raincoat
  standing near a small wheeled equipment cart
- Right side: a crew member walking in profile wearing a long translucent
  plastic raincoat over dark base layer
- Foreground centre: black industrial treadmill with raised handrail, the main
  subject is walking on it
- Overhead light: cool soft top fluorescent / softbox key, cool desaturated
  blue-grey color grade, slight haze

REPLACE ONLY the central walking model with the SAME young woman from reference
#2 — preserve her exact warm olive skin, blunt-cut copper bob, calm intense gaze,
and identity. She walks confidently on the treadmill, side-three-quarter toward
camera, wearing the EXACT Aurora Echo Wave from reference #3 (over-ear wireless
headphones, matte gunmetal aluminum housing, brushed titanium driver vents, soft
cream leather earpads, signature copper logo dot on left cup). Wardrobe:
oversized cream wool turtleneck, deep brown wide-leg trousers.

Photoreal, vertical 9:16, no readable text, no extra logos.
```

### Expected spend

- ~$30 single-pass / ~$45 with one regen of 6-8 rejected scenes (per `model-stack.md`).
- Wall time: ~4h with reviews, ~2h hands-off.

---

## Worked example #2 — fitness wearable (action-sports variant)

**Brand:** `{{brand_name}}` = `Drift`
**Product:** `{{product_name}}` = `Pulse R1`
**Product descriptor:** `{{product_descriptor}}` = `sport smartwatch, polished titanium 42mm round case, neon-coral silicone strap, charcoal AMOLED face showing a live heart-rate ring, knurled side crown`
**Cast:**
  - `{{model_a}}` = `young woman, tan athletic build, high tight ponytail in dark brown`
  - `{{model_a_wardrobe}}` = `neon-coral compression top, charcoal high-rise sport shorts, white running socks`
  - `{{model_b}}` = `none` (single-cast variant)
  - `{{model_b_wardrobe}}` = `none`
**Set backdrops:**
  - `{{set_backdrop_a}}` = `printed mountain-trail fabric banner with visible weave (NOT a real trail)`
  - `{{set_backdrop_b}}` = `printed velodrome interior backdrop, mirrored-floor neutral studio`
**Slogan:** `{{brand_slogan}}` = `outrun yesterday`
**URL:** `{{brand_url}}` = `drift.fit`
**Scene count:** `{{scene_count}}` = `22` (tighter than the source — single cast)
**Target language:** `{{target_language}}` = `en-elevenlabs-music` — original ElevenLabs Music score (tight modern percussion + breath-rhythm pulse), no VO

### Differences from worked example #1

- **Single-cast simplification.** Drop the `{{model_b}}` arc entirely. Convert the 2-cast scenes (e.g. source scenes 6, 11, 12) into solo-{{model_a}} variants. Scene count drops from 27 to ~22.
- **Action-class shift.** Replace the "feet float / horizontal float" surreal-physics beat (source scenes 9-11) with a "speed blur / heart-rate spike" beat — {{model_a}} sprints, the watch face cuts to ECU showing heart-rate ring spiking, then a wide pull-out.
- **Music swap.** No source-1:1 — generate an ElevenLabs Music track:
  ```
  Tight modern percussion at 128 BPM, layered breath-rhythm synth pulse,
  punchy kick on every other beat, no vocals, no melodic phrases — pure
  rhythmic propulsion. Mood: athletic determination. Genre: cinematic
  electronic / sport-ad scoring. 54-second total length.
  ```
- **Color grade override.** Hot warm-tonal grade (sun-burnt golden + neon-coral accents) instead of cool desaturated blue. Override in every keyframe prompt: `WARM HIGH-CONTRAST GRADE — saturated coral accents, golden sunlight on skin, dark forest-green shadows. NOT cool desaturated blue.`
- **Macro detail shift.** The "fingers rotate dial" ECU (source scene 14) becomes "fingers rotate crown to set workout mode" — same macro grammar, different control surface.

### Expected spend

- ~$22 single-pass (22 scenes x $0.60 keyframe + 18 i2v x $0.42 + masters)
- ~$33 with one regen pass on the speed-blur transitions (which Kling will likely need 2-3 tries to nail — per BEST-PRACTICES.md pitfall #11 on hard motion transitions, you may want to split into two static scenes anyway).

### Where the template still applies despite the differences

- **Identity-lock pipeline** — same. Even with one cast member, the wardrobe-reference + base-portrait pipeline cuts wardrobe drift dead.
- **STATIC + MID-MOTION + NEGATIVE block stack** — same. Kling still adds the deep-breath tic to idle shots regardless of vertical.
- **BTS-commercial-set grammar** — same. The lab-coat crew + printed-banner backdrops translate intact; replace lab-coats with "athletic-trainer coaches in branded windbreakers" if the brand register fits.
- **Title card + endcard pattern** — same. Just swap the typography to the brand kit.

---

## What these examples illustrate

1. **`{{slots}}` are surface-level.** The template's durable shape is the master-shot pipeline + locked prompt blocks + parallel-batch discipline. Brand / cast / wardrobe / set are the cosmetic layer.
2. **Adapt the "surreal-physics beat" to your category's emotional claim.** Audio brand -> body floats (immersion). Fitness brand -> heart-rate spike (intensity). Camera brand -> light-trails / long-exposure body-double (vision). Drone brand -> body lifts (perspective shift). Pick the visual metaphor BEFORE prompting.
3. **Scene count is a slot, not a constant.** 27 was the source; 22 is fine; 18-30 are all in the template's typical range. Adjust the act lengths proportionally.
