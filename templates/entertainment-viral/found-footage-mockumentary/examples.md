# Examples — found-footage-mockumentary

Two worked variants showing different `{{subject_creature}}` × `{{cult_location_descriptor}}` × `{{handheld_persona}}` combinations. Each one is copy-paste-ready for the Clip C (photo + the turn) money-shot — the rest of the cut follows the same scaffolding from `prompt-cookbook.md`.

## Variant A — Pine-forest occult (source-project canonical)

Slot fill:

- `{{target_language}}` → English
- `{{subject_creature}}` → "thin pale humanoid frame with splayed ribcage exposing a fist-sized pulsing wet organ, head replaced by a floating sphere of brassy interlocking tentacle-rings cradling one massive human eyeball at center, shoulders erupting with clusters of dark wet pustules and embedded secondary eyeballs"
- `{{cult_location_descriptor}}` → "dense black pine forest at night, ritual clearing with small bonfire, wet dirt trail underfoot"
- `{{handheld_persona}}` → "anonymous amateur hiker with a Canon Sure Shot point-and-shoot and a phone-torch — face never shown, only gloved hand visible at frame bottom"

Clip C (photo + the turn), filled:

```
9:16 vertical found-footage horror handheld POV, 5s, ONE continuous take. Hi8 camcorder — subtle
grain, cold blue, soft focus.

ANCHOR (matches first-frame): POV of an anonymous amateur hiker with a Canon Sure Shot point-and-shoot
raised to chest height, gloved hand visible bottom-right of frame. Through the gap between foreground
pine trunks in dense black pine forest at night, seven hooded cultists at ~20m distance stand in a
circle around a small bonfire on a wet dirt forest clearing, ALL with BACKS to camera, motionless.

ACTION (5 seconds):
- 0.0s–1.5s: Operator HOLDS the Canon steady, finger poised over shutter. Cultists ABSOLUTELY
  MOTIONLESS in distance. Bonfire flickers behind them.
- 1.5s–1.65s: SHUTTER CLICK. Canon flash bulb fires. ENTIRE FRAME washes PURE WHITE for 4 frames.
- 1.65s–5.0s: As the white flash clears, the seven cultists are NOW ALREADY FACING the camera at
  the same distance — they NEVER moved or rotated, simply ARE NOW facing camera. Hoods slipped back
  revealing PALE WAXY FACES with EMPTY MATTE-BLACK EYE SOCKETS and IMPOSSIBLY WIDE FROZEN DEMON
  GRINS. ABSOLUTELY MOTIONLESS for remaining 3.35 seconds.

VISUAL: cold blue tones, subtle Hi8 grain, vignette. Warm orange bonfire under-lights the demon
faces.

STRICTLY FORBIDDEN: NO music, NO singing, NO percussion, NO speech, NO voiceover. NO captions.
NO daylight. NO body rotation animation.

CRITICAL DO NOT DO: do NOT animate the cultist turn — INSTANT TELEPORT-STATE, NOT animate. NO
Halloween skull-mask mascot style — must be photorealistic uncanny pale skin.
```

Captions for the cut:
- 0:01–0:04 — "trail behind the lake" (English, lower-third)
- 0:21–0:24 — "they see me" (English, lower-third)
- 0:39–0:40 — "SIGNAL LOST" (full-frame end-card, degraded VHS font)

---

## Variant B — Desert-ridge cryptid (different creature, different environment, different operator persona)

Slot fill:

- `{{target_language}}` → English
- `{{subject_creature}}` → "tall, thin-limbed quadruped with elongated cervical vertebrae visible through pale stretched skin, head of an antlered ruminant skull bleached white but with living wet eyes embedded in the eye-sockets, hind legs reverse-jointed like a deer, forelegs ending in 6-fingered humanoid hands with cracked black fingernails"
- `{{cult_location_descriptor}}` → "high desert ridge at dusk transitioning to night, scrub brush and rock outcroppings, ritual fire-pit on a flat sandstone slab"
- `{{handheld_persona}}` → "paranormal investigator with a 1996 Sony Handycam and a forehead-mounted red headlamp — face never shown, only the gloved hand visible at frame bottom, occasional camera-strap edge visible"

Clip C (photo + the turn), filled:

```
9:16 vertical found-footage horror handheld POV, 5s, ONE continuous take. Hi8 camcorder — subtle
grain, cold blue, soft focus.

ANCHOR (matches first-frame): POV of a paranormal investigator with a 1996 Sony Handycam raised to
chest height, gloved hand visible bottom-right of frame. Forehead-mounted red headlamp casts a thin
red wash on the foreground rocks. On a high desert ridge at dusk transitioning to night, seven
hooded cultists at ~20m distance stand in a circle around a ritual fire-pit on a flat sandstone
slab, ALL with BACKS to camera, motionless. Scrub brush and rock outcroppings around the circle.

ACTION (5 seconds):
- 0.0s–1.5s: Operator HOLDS the Handycam steady, finger poised over the manual shutter button.
  Cultists ABSOLUTELY MOTIONLESS in distance. Fire-pit flickers behind them.
- 1.5s–1.65s: SHUTTER CLICK. Handycam still-frame flash fires. ENTIRE FRAME washes PURE WHITE
  for 4 frames.
- 1.65s–5.0s: As the white flash clears, the seven cultists are NOW ALREADY FACING the camera at
  the same distance — they NEVER moved or rotated, simply ARE NOW facing camera. Hoods slipped
  back revealing PALE WAXY FACES with EMPTY MATTE-BLACK EYE SOCKETS and IMPOSSIBLY WIDE FROZEN
  DEMON GRINS. ABSOLUTELY MOTIONLESS for remaining 3.35 seconds.

VISUAL: warmer blue-amber dusk tones bleeding to cold blue night, subtle Hi8 grain, red headlamp
wash on foreground rocks, vignette. Warm orange fire-pit under-lights the demon faces after the
flash.

STRICTLY FORBIDDEN: NO music, NO singing, NO percussion, NO speech, NO voiceover. NO captions.
NO daylight (we are at end-of-dusk transitioning to night). NO body rotation animation.

CRITICAL DO NOT DO: do NOT animate the cultist turn — INSTANT TELEPORT-STATE, NOT animate. NO
Halloween skull-mask mascot style — must be photorealistic uncanny pale skin. NO antlered creature
in this clip (creature appears in Clip F monster reveal only).
```

Captions for the cut:
- 0:01–0:04 — "ridge above kane creek" (English, lower-third)
- 0:21–0:24 — "they see me" (English, lower-third)
- 0:39–0:40 — "TAPE EJECTED" (full-frame end-card, degraded VHS font)

For the Clip F monster reveal, the antlered-cryptid `{{subject_creature}}` description (visible above in slot-fill) replaces the body-horror hybrid description in the cookbook's Clip F prompt. Pass user-supplied antlered-ruminant skull reference + reverse-joint deer-leg reference + humanoid-hand reference as `--ref` on the creature master shot generation.

---

## Building a third variant

For a fresh combination, fill the four slots and walk the cookbook prompts top-to-bottom:

1. Generate creature master in gemini-3-pro-image-preview with 2-3 user creature reference PNGs as `--ref`.
2. Generate cult-circle master + grinning-face master + operator-hand master without creature refs (those are template-portable).
3. Generate per-clip first-frame anchors using the relevant master(s) as `--ref`.
4. Generate clips A-F via seedance-2.0 with the first-frame anchor + verbatim cookbook prompt + your slot-filled action block.
5. Generate the 5 SFX tracks via ElevenLabs Music with the banned-music block.
6. Compose in Remotion: VHS overlay on clips A-E, clean cinema on F, REC-dot HUD persistent through E, three diegetic captions, `SIGNAL LOST`-class end card.

Cost target: ~$5-$10 if you avoid the kling regen trap that the source project fell into. See `model-stack.md` for the per-stage breakdown.
