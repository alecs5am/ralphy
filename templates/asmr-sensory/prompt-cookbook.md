# Prompt cookbook — asmr-sensory

Reusable building blocks for `/ralph-art-director`. Combine fresh per project; never paste verbatim. ASMR lives or dies on three things: macro framing, slow motion, and sound that matches the motion frame-perfectly. The model stack handles the visual; the foley is your job in composition.

---

## Master template (one sensory beat)

Every beat is **one macro shot + one foley sound + one slow motion**.

```
KEYFRAME (gemini-3-pro-image-preview):
  "Extreme macro close-up of <SUBJECT> at the moment <ACTION-START>.
   <TEXTURE-DETAIL — 1-2 sensory adjectives>. Shallow depth of field, f/1.4-f/2.0,
   lens flare absent, subject fills 80% of the frame, 9:16 portrait.
   Soft <LIGHT-DESCRIPTION> from <LIGHT-DIRECTION>.
   Color: <COLOR-NOTE — natural, restrained, no over-saturation>.
   No text, no overlay, no logo (unless reference-anchored), no model face."

I2V (kling-v3.0-pro, 5s, generate_audio: false):
  "Slow motion <ACTION>: <MOTION-DESCRIPTION>. Camera locked, no pan, no zoom.
   <DURATION-PHRASING — e.g. 'over 4 seconds', 'unhurried'>. Subject remains
   in extreme close-up throughout. Maintain shallow DOF. Maintain ambient light.
   No camera shake. No cuts. Single continuous motion."

FOLEY (composition):
  Layer: <PRIMARY-FOLEY> at -6dB
  Sub-layer: <SECONDARY-FOLEY> at -12dB (optional)
  Room tone: ~-30dB underneath
  Sync: foley peak aligned to motion peak frame
```

If any of these three are missing for a beat, re-plan the beat. Don't ship a beat with a clean visual but no clean sound.

---

## Macro prompt vocabulary

Lift these into keyframe prompts. Match 2-3 per shot — more clutters the model.

### Framing
- `extreme close-up`, `macro`, `1:1 magnification`, `subject fills frame`
- `shallow depth of field`, `f/1.4 bokeh`, `silken bokeh background`
- `top-down 90°`, `45° angle`, `eye-level with subject`
- `9:16 portrait`, `vertical composition`

### Texture
- `glistening`, `dewy`, `velvet matte`, `silken`, `grainy`, `crystalline`
- `creamy`, `viscous`, `tacky`, `crisp`, `flaky`, `powdery`
- `dust-mote-dance` (light beam particles), `condensation droplets`
- `micro-pores visible`, `surface tension`, `meniscus curl`

### Light
- `soft window light, single source`, `low-angle morning sun`, `overcast diffused`
- `slight backlight, rim glow on subject edge`
- `warm tungsten 3200K`, `cool daylight 5600K`, `golden hour 4000K`
- AVOID: `studio lighting`, `softbox`, `ring light` — reads as commercial / fake

### Motion (for i2v prompt)
- `slow-motion`, `silken motion`, `unhurried`, `meditative pace`
- `droplet-perfect`, `single continuous arc`
- `over 4 seconds`, `glacial speed`
- `camera locked, no movement` (default for ASMR — handheld breaks the trance)

### Color discipline
- `restrained palette`, `natural color`, `desaturated by 15%`, `no oversaturation`
- AVOID: `vibrant`, `vivid`, `pop`, `cinematic LUT` — reads as ad / fake

### Negative prompt (always include)
> "no text, no overlay, no logo (unless reference-anchored), no model face, no studio lighting, no ring-light reflection, no oversaturation, no fast motion, no camera shake, no zoom, no cuts within the clip, no AI-improvised packaging."

---

## Sound-design matrix (per category)

The single most important table in this template. The key insight: every category has 2-4 signature foley sounds. Get those right; everything else is fluency.

### Beauty — cream / lipstick / foam

| Beat | Primary foley | Sub-layer | Notes |
|---|---|---|---|
| Lid twist | plastic-screw click | very faint air-seal pop | 0.5-1s |
| Scoop / dip | soft squelch | finger-friction whisper | the "money sound" |
| Spread on skin | wet smear, low-frequency drag | skin-contact friction | 2-3s sustained |
| Tap test | dry pat | ambient room tone | confirms texture is set |

**ElevenLabs SFX prompt examples:**
- `"soft squelch of cosmetic cream being scooped from a glass jar with a fingertip, close-mic, no music, mono"`
- `"slow wet smear of moisturizer on cheek skin, breathy ambient room, close-mic, no music"`

### Food — chocolate / cheese / sizzle

| Beat | Primary foley | Sub-layer | Notes |
|---|---|---|---|
| Knife contact | crisp tap on hard surface | board resonance | 0.3-0.5s |
| Snap / crack | dry crackle + low thump | reverb tail | the climactic sound — peak it |
| Stretch (cheese pull) | wet rubbery creak | air bubbles popping | 2-4s |
| Sizzle | high-frequency hiss | fat pop crackles | 3-5s |
| Pour | liquid stream | bowl-resonance bell | 2-3s |

**ElevenLabs SFX prompt examples:**
- `"sharp dry snap of dark chocolate breaking in two, close-mic, no music, mono"`
- `"gentle sizzle of butter melting in a hot pan, close-mic, slight room tone, no music"`

### Unboxing — cardboard / tape / parcel

| Beat | Primary foley | Sub-layer | Notes |
|---|---|---|---|
| Tape rip | sticky vinyl tear | crinkle of carton | 1-1.5s — the iconic sound |
| Cardboard creak | dry fiber flex | low room tone | 0.5-1s |
| Plastic rustle | high-frequency wrap-crinkle | static-like fizz | 1-3s |
| Foam extract | dry slide-friction | soft thump on table | 1-2s |
| Box close / lid set | low wood/cardboard thump | air-displacement woof | 0.5s |

**ElevenLabs SFX prompt examples:**
- `"clear packing tape being slowly peeled off a cardboard box, sticky vinyl tear, close-mic, no music"`
- `"crinkle of plastic protective wrap being unfolded, high-frequency rustle, close-mic, mono"`

### Slime / craft

| Beat | Primary foley | Sub-layer | Notes |
|---|---|---|---|
| Press / poke | wet squish | air-bubble pop | 0.5-1s |
| Stretch | rubbery creak | tension-snap fizz | 2-4s |
| Fold | wet smack | low gloop | 1s |
| Bubble pop | sharp pop | wet aftermath | 0.3s |

**ElevenLabs SFX prompt examples:**
- `"thick slime being slowly stretched between two hands, wet squish, close-mic, no music"`
- `"slime fold and press, deep gloop with surface bubble pop, close-mic, mono"`

### Spa ritual — matcha / candle / water

| Beat | Primary foley | Sub-layer | Notes |
|---|---|---|---|
| Water pour | thin liquid stream | bowl bell-resonance | 2-3s |
| Match / lighter strike | dry rasp + flame whoosh | wood crackle | 0.5s + 1s tail |
| Whisk (matcha) | rapid bamboo brush | foam-rise hiss | 3-5s |
| Bell strike | clean metallic ring | long sustained tail | 0.3s + 4s decay |
| Drip | single droplet | quiet ripple | 0.5s |

**ElevenLabs SFX prompt examples:**
- `"single match strike on a wooden matchbox, dry rasp followed by flame whoosh, close-mic, no music"`
- `"bamboo whisk frothing matcha tea in a ceramic bowl, rapid swish, close-mic, slight room tone, no music"`

---

## Audio production discipline

ASMR fails in audio more than visual. Three valid pipelines:

### Pipeline A — live diegetic recording (highest quality, most effort)
1. Record the actual action with a small-diaphragm condenser or shotgun close-mic'd (~6-12cm).
2. Bring into composition as the foley layer at -6dB to -3dB.
3. Add ~-30dB room tone for "alive silence" (gating to true digital silence sounds artificial).
4. Sync foley peak to motion peak frame-by-frame.

### Pipeline B — SFX library (medium effort, very reliable)
1. Source from Soundsnap / Pro Sound Effects / Free To Use Sounds. Pick close-mic'd, mono, no-music versions.
2. Layer per the matrix above (primary at -6dB, sub-layer at -12dB).
3. Time-stretch to match the slow-motion clip — most stock SFX are recorded at real speed; ASMR clips are at 0.5x or slower. Time-stretch by 1.5-2x in composition.
4. Add room tone underneath.

### Pipeline C — ElevenLabs Music SFX prompts (lowest effort, variable quality)
1. Use ElevenLabs Music with a precise SFX prompt — see examples in the matrix.
2. Critical: prompt MUST end with `, no music, mono` or it returns a melodic clip.
3. Quality is hit-or-miss; budget one regen per beat.
4. Layer and time-align per pipeline B.

**The wrong path:** generating foley from `kling-v3.0-pro`'s `generate_audio: true`. The output is generic ambient noise that doesn't sync to the motion. ALWAYS pass `generate_audio: false` and add foley in composition.

---

## VO discipline

NO VO is the default. ASMR doesn't need narration; explanation kills the trance.

If VO is requested:
- ElevenLabs `eleven_multilingual_v2`, voice picked for warmth (not clarity).
- `voice_settings`: `stability: 0.6`, `similarity_boost: 0.7`, `style: 0.05`, `use_speaker_boost: false`.
- Direct the script in whisper tone explicitly: prepend `[whispered, soft, breathy, intimate]` to every line.
- Mix at -3dB **below the foley bed** — VO must never overpower the foley.
- Lines stay under 8 words. ≥2s of silence between lines. No back-to-back narration.

If VO regen produces a confident announcer tone, drop stability to 0.45 and increase the `[whispered, soft, breathy]` direction prefix.

---

## Music policy

OFF by default.

If a music bed is requested:
- ElevenLabs Music prompt: `"sub-perceptual ambient drone, no melody, no rhythm, no instruments above 200Hz, low pad, no swells, no climax, 60 seconds, mono"`.
- Mix at **-25dB** (yes, that low). Music is below conscious perception; viewers feel it without hearing it as music.
- Cut music entirely in the first 3s and the last 3s. Open and close in pure foley.
- Never add music with a melody to ASMR. It collapses the format into a generic montage.

---

## 6 mistakes that kill ASMR

1. **Music too loud.** Music at -10dB or higher fights the foley. The viewer's brain perceives "song with sound effects on top" instead of "intimate sensory experience." Format collapses. Mix music at -25dB or skip it entirely.
2. **Cuts too fast.** Anything under 1.5s per shot reads as a montage, not ASMR. Slow pacing IS the relaxation trigger — if you cut to keep "energy up," you've made the wrong format.
3. **Sound out-of-sync with motion.** A cream-spread foley that peaks 4 frames after the visual peak reads as fake. Sync to the frame, not the second. This is the single most common defect.
4. **No diegetic foley = empty silence.** A macro visual with no foley underneath sounds like a mute video, not ASMR. Even "silent" beats need ambient room tone (~-30dB) for the format to feel alive.
5. **Loud captions / hormozi-style overlays.** Fast-pulsing big text fights the slow visual pace and contradicts the "calm down" promise. MinimalCaptions only, low opacity, no entrance animation.
6. **VO that sounds like an ad.** Confident announcer voice in an ASMR clip reads as a commercial sneak-attack. If VO at all, whisper-only, sub-foley level.

---

## 4 worked examples

### Example 1 — Beauty: cream texture (45s, silent, 5 beats)

Subject: anonymous luxury moisturizer in a clear glass jar.

| Beat | Frame | Visual | Foley | Duration |
|---|---|---|---|---|
| 0-3s | 0-90 | Macro top-down on sealed jar, cream surface untouched, soft window light | room tone only, ~-30dB | establish |
| 3-13s | 90-390 | 45° macro, fingertip slowly enters frame and presses into cream, surface deforms | soft squelch -6dB + finger-friction -12dB | scoop |
| 13-25s | 390-750 | 45° macro, finger lifts cream out, peak forms a soft tendril | wet pull-away -6dB + air-thread fizz -14dB | lift |
| 25-37s | 750-1110 | Side-angle macro, fingertip drags cream in a slow stripe across (anonymous) skin | wet smear sustained -6dB | spread |
| 37-45s | 1110-1350 | Top-down macro on skin, cream now glossy stripe, fingertip lifts away | dry pat -8dB, then 2s of room tone tail | reveal |

VO: none. Music: off. Captions: silent overlay frame 0 only — `the most satisfying texture · sound on`.

### Example 2 — Food: chocolate snap reveal (30s, silent, 3 beats)

Subject: anonymous dark chocolate bar (70% generic, no brand).

| Beat | Frame | Visual | Foley | Duration |
|---|---|---|---|---|
| 0-4s | 0-120 | Macro top-down on a sealed chocolate bar, foil wrap intact | foil-crinkle anticipation tap -10dB | establish |
| 4-15s | 120-450 | Macro side-angle, hands slowly peel foil off chocolate | foil-crinkle sustained -6dB + low room rumble | unwrap |
| 15-30s | 450-900 | Macro front, knife or hand snaps chocolate at the score line | dry snap -3dB peak + low thump -8dB + 4s reverb tail | snap reveal |

VO: none. Music: off. Captions: none.

### Example 3 — Unboxing: jewelry box (60s, whisper-VO, 6 beats)

Subject: anonymous matte-black jewelry box with magnetic closure.

| Beat | Frame | Visual | Foley | Whisper-VO line |
|---|---|---|---|---|
| 0-5s | 0-150 | Macro top-down on sealed box, ribbon visible | room tone | "we begin with the box" |
| 5-15s | 150-450 | Hands slowly untie the ribbon | silk-friction whisper | (silent) |
| 15-25s | 450-750 | Lid lift, magnetic-clasp release | soft magnetic thunk | "and then" |
| 25-40s | 750-1200 | Tissue paper unfold | high-freq paper rustle | (silent) |
| 40-55s | 1200-1650 | Velvet pouch lifted out | velvet drag + soft thump | "the inside" |
| 55-60s | 1650-1800 | Final macro on revealed item | one bell strike -8dB + tail | (silent) |

VO mixed at -9dB (foley at -6dB). Music: off. Captions: minimal text on first frame only.

### Example 4 — Spa: matcha ritual (75s, pure-foley, 6 beats)

Subject: matcha bowl, bamboo whisk, kettle, ceramic cup.

| Beat | Frame | Visual | Foley | Duration |
|---|---|---|---|---|
| 0-5s | 0-150 | Macro top-down on empty matcha bowl | room tone -30dB | establish |
| 5-18s | 150-540 | Match strike, candle lit | dry rasp + flame whoosh + 2s crackle | ritual open |
| 18-30s | 540-900 | Matcha powder sifted into bowl | fine-particle hiss + tap on bowl edge | dose |
| 30-50s | 900-1500 | Hot water poured from kettle into bowl | thin stream + bowl bell-resonance | pour |
| 50-65s | 1500-1950 | Bamboo whisk in bowl, foam rises | rapid swish + foam-rise hiss | whisk |
| 65-75s | 1950-2250 | Final macro on whisked matcha, foam at peak, bell strike | single bell -8dB + 6s decay tail | reveal |

VO: none. Music: optional sub-perceptual ambient drone at -25dB starting frame 150 (after the establish), cut at frame 1950 (before the bell). Captions: none.

---

## Workflow checklist before you ship

1. Every beat has a visual + a foley + a duration ≥ 1.5s.
2. Music is OFF or at -25dB. Foley is at -6dB. VO (if any) is at -3dB below foley.
3. First foley beat lands within 1.5s of frame 0.
4. Foley peaks are sync'd to motion peaks frame-by-frame (zoom in on the timeline).
5. No HormoziCaptions, no KaraokeCaptions, no big bouncy text anywhere.
6. Ambient room tone is laid under every beat — no true digital silence.
7. `generate_audio: false` on every kling clip — foley is composed, never trusted to i2v.
8. If brand-named subject, reference-required gate has been verified.
