# Prompt Cookbook — found-footage-mockumentary

<!-- All prompts reconstructed from `workspace/projects/occult-mockumentary-001/logs/generations.jsonl` — postmortem absent, prompts not templated through a curated `prompts.json` source. Verbatim handheld + REC-overlay + diegetic-captions patterns preserved literal. -->

Slot legend:

| Slot | Description |
|---|---|
| `{{target_language}}` | Language for diegetic captions; never used for VO (template ships no-VO) |
| `{{subject_creature}}` | The Act-2 monster — anatomy described in detail, must restate identity inline per `feedback_super_original_refs` |
| `{{cult_location_descriptor}}` | Environment block reused across every master shot + first-frame |
| `{{handheld_persona}}` | Operator identity — drives the gloved-hand frame and on-screen camera device |

---

## Stage 1 — Image masters (gemini-3-pro-image-preview)

Generate ONE master shot per repeated element. Pass user-supplied creature reference PNGs as `--ref` on the monster master. Every subsequent image / video generation that references that element passes the master as `--ref` (super-original-refs rule).

### Master 1 — subject_creature (full-body anchor)

```
Hyperrealistic horror still, 9:16 vertical, full standing body of {{subject_creature}}
on a wet dirt path inside {{cult_location_descriptor}} at night. <restate creature anatomy inline,
specifying anatomically anchored details — body type, limb count, surface texture, sub-features —
matching the user-supplied reference PNGs feature-for-feature>. Posture: standing PERFECTLY STILL,
motionless, facing the camera dead-on, 3 meters away. Light: phone-torch beam from below cuts up
across the body, harsh under-lit, deep shadows above. Background pitch-black {{cult_location_descriptor}}.
Style: cinematic horror photography, slight film grain, very mild chromatic aberration. Practical-effect
Cronenberg / Silent Hill vibe — NOT cartoon, NOT CGI-glossy, NOT digital plasticky.
```

Pass user creature refs (2-3 PNGs) as `--ref`. ~$0.15.

### Master 2 — cult circle

```
Hyperrealistic horror still, 9:16 vertical, mid-distance shot taken through gaps in foreground
foliage at night. Seven adult-height figures stand in a perfect circle around a small bonfire
in {{cult_location_descriptor}}. Each figure wears a floor-length matte-black hooded robe, the hood
pulled low to fully shadow the face. Robes are identical, plain, no symbols, no embroidery, no
insignia, slightly weathered cotton-wool texture with a coarse rough weave. Posture: arms hanging
loose at sides, perfectly motionless, all facing the center fire, all standing at identical spacing
forming a clean geometric circle ~3m diameter. The bonfire is small, ~60cm tall flames, orange-red
glow casting up onto the lower edges of the robes, leaving hoods in deep shadow. Behind the circle:
dense dark {{cult_location_descriptor}}, no visible horizon. Above: heavy overcast sky, no moon
visible, no stars. Mood: ritualistic, unhurried, deeply quiet, frozen in time. Cinematic low-key
key light from the fire only, no fill, no rim light, deep shadows everywhere. Slight 35mm film-grain
texture, very mild chromatic aberration on firelight bloom. SHOT FROM the perspective of someone
hiding ~8m away behind branches — out-of-focus foreground edges. Cultists look like NORMAL hooded
people from this distance — faces are completely hidden inside hoods.
```

~$0.15.

### Master 3 — single grinning cultist face (for the turn beat)

```
Hyperrealistic horror still, 9:16 vertical, mid-shot of a single human face emerging from a deep
black robe hood at night inside {{cult_location_descriptor}}. Face is pale, waxy, slightly damp-looking
skin, no makeup, no blood, no wound, no decay. EYES: empty matte-black pits — no whites, no iris, no
reflection, the eye sockets are filled with felt-black void as if there are no eyes at all. MOUTH:
stretched into an impossibly wide frozen grin — corners pulled past the natural anatomical limit
toward the ears, lips thin and unnatural, teeth visible: too white, too even, too many (about 24
visible upper teeth stretching past where the cheek should end, like the smile keeps going around
the face). The grin is FROZEN, photographic, NOT in motion, NOT laughing, NOT screaming — just a
still wide unblinking smile. Head angled slightly downward toward the camera, looking directly at
the lens. Behind: out-of-focus night environment, faint orange firelight bloom blur on the right
edge. Lighting: low-key bottom-up firelight under-lighting from below the chin, deep shadow above
the brow, deep shadow inside the hood. Cinematic, uncanny valley intentionally — the face looks
ALMOST human but the proportions are subtly off (slightly too long, slightly too narrow). Style:
35mm film-grain photo, mild chromatic aberration. Captured as if mid-stride by a fleeing photographer
— natural slight focus softness.
```

~$0.15.

### Master 4 — operator hand with camera (for the photo beat)

```
Hyperrealistic POV still, 9:16 vertical, gloved hand of {{handheld_persona}} raising a small
amateur camera (point-and-shoot / camcorder appropriate to persona) into the lower frame at night
in {{cult_location_descriptor}}. Camera held at chest height by a single gloved hand visible
bottom-right of frame. Background blurred behind — out-of-focus distant orange firelight bloom.
Phone-torch wash from above, cold blue, deep shadows on the surrounding trees / structures.
Slight Hi8 / amateur-camera grain, mild chromatic aberration.
```

~$0.15.

### Per-clip first-frame anchors

For each clip, generate a first-frame using the relevant master shot(s) as `--ref`. Prompt skeleton:

```
9:16 vertical handheld found-footage horror still — first frame for an i2v clip. Hi8 camcorder
look: subtle filmic grain, cold blue tonality, soft cheap-lens focus. POV of {{handheld_persona}}
at <SCENE-SPECIFIC POSITION>. Anatomy / cast must match the --ref master shot(s) feature-for-feature.
Persistent diegetic HUD: REC ● <TIMECODE> · BAT NN% top-corners — small, not stylized.
```

Pass master shot(s) as `--ref`. ~$0.15 per anchor.

---

## Stage 2 — Video clips (i2v)

Default endpoint: `bytedance/seedance-2.0` for non-default physics motion (per `feedback_vg_model_picks.md`). Fallback: `kwaivgi/kling-v3.0-pro` for simple POV walking only. Always pass the first-frame anchor.

### Clip A — Approach (POV walking)

Endpoint: `seedance-2.0` (kling produced foot-in-camera artifacts on this beat).

```
9:16 vertical found-footage horror handheld POV, 5s, ONE continuous take, no cuts. Hi8 1996
camcorder feel — subtle filmic grain, cold blue tonality, soft cheap-lens focus. Naturalistic
handheld micro-shake.

ANCHOR (matches first-frame): POV of {{handheld_persona}} mid-stride walking forward down a narrow
dirt trail through {{cult_location_descriptor}} at night. Boots faintly visible at bottom of frame.
Small warm-orange firelight bloom visible far ahead through {{cult_location_descriptor}}.

ACTION: Operator walks slowly forward down the trail for the full 5 seconds. Camera handheld with
natural micro-shake. The distant warm-orange firelight bloom slowly grows over time. Foreground
low foliage passes the edges. NO cultists visible (they are still far ahead off-screen).

VISUAL: cold blue tones matching the reference, subtle Hi8 grain, soft natural vignette, no overlays.
Authentic amateur found-footage feel.

STRICTLY FORBIDDEN: NO music, NO singing, NO percussion. NO speech, NO voiceover, NO narration.
NO captions or text overlays. NO daylight, NO clear bright lighting. NO people in frame.

CRITICAL DO NOT DO: do NOT show operator face or body. Do NOT zoom. Do NOT add cuts. Do NOT
introduce cultists in this clip — they appear in the next scene.
```

### Clip B — Discovery (peering through cover)

Endpoint: `seedance-2.0`.

```
9:16 vertical found-footage horror handheld POV, 5s, ONE continuous take, no cuts. Hi8 camcorder
feel — subtle grain, cold blue, soft focus.

ANCHOR (matches first-frame): POV of {{handheld_persona}} peering through narrow gap between
foreground cover in {{cult_location_descriptor}} at night. In the middle distance ~20m away, seven
hooded figures in matte-black robes stand in an imperfect circle around a small bonfire, ALL with
BACKS to camera. Amateur camera held at hip level visible bottom of frame.

ACTION (5 seconds): The operator HOLDS POSITION behind cover, peering through the gap. The seven
cultists are ABSOLUTELY MOTIONLESS — frozen statues, no breathing, no sway, no head-tilt, no
foot-shift. ONLY the bonfire flames flicker irregularly. Camera handheld with very subtle natural
tremor (operator's hands shaking from nerves). Slight forward-creep ~3% over the 5 seconds —
operator inches closer. NO action otherwise.

VISUAL: cold blue tones, subtle Hi8 grain, vignette. Authentic amateur footage.

STRICTLY FORBIDDEN: NO music, NO singing, NO percussion, NO speech, NO voiceover. NO captions
or text. NO daylight. NO cultist motion of any kind.

CRITICAL DO NOT DO: do NOT have cultists turn around, do NOT have them sway, breathe, shift weight,
tilt head, or move arms. They are FROZEN STATUES. Do NOT have operator raise the camera yet
(raised in next scene). Do NOT zoom dramatically. Do NOT show operator face.
```

### Clip C — Photo + The Turn (THE money shot)

Endpoint: `seedance-2.0`. Critical: do NOT use kling here — kling will animate body rotation even when explicitly told not to. Seedance honors the instant-teleport instruction.

```
9:16 vertical found-footage horror handheld POV, 5s, ONE continuous take. Hi8 camcorder — subtle
grain, cold blue, soft focus.

ANCHOR (matches first-frame): POV of {{handheld_persona}} with amateur camera raised to chest
height, gloved hand visible bottom-right of frame. Through the gap between foreground cover, seven
hooded cultists at ~20m distance stand in a circle around a small bonfire, ALL with BACKS to
camera, motionless.

ACTION (5 seconds):
- 0.0s–1.5s: Operator HOLDS the camera steady, finger poised over shutter. Cultists ABSOLUTELY
  MOTIONLESS in distance (frozen statues, no sway, no breath). Bonfire flickers behind them.
- 1.5s–1.65s: SHUTTER CLICK. Camera flash bulb fires. The ENTIRE FRAME washes PURE WHITE for 4
  frames (total overexposure, no detail visible — full white).
- 1.65s–5.0s: As the white flash clears at 1.65s, the seven cultists are NOW ALREADY FACING the
  camera at the same distance — they remained in their spots around the bonfire, NEVER moved or
  rotated, simply ARE NOW facing camera. Hoods slipped back revealing PALE WAXY FACES with EMPTY
  MATTE-BLACK EYE SOCKETS (felt-black voids) and IMPOSSIBLY WIDE FROZEN DEMON GRINS — too many
  white teeth, corners past anatomical limit. Pale skin catches the bonfire under-glow. ABSOLUTELY
  MOTIONLESS for remaining 3.35 seconds — no breath, no blink, no step, no sway. Just standing
  and staring. Camera still visible bottom-right of frame.

VISUAL: cold blue tones, subtle Hi8 grain, vignette. Warm orange bonfire under-lights the demon
faces after the flash. NO overlays.

STRICTLY FORBIDDEN: NO music, NO singing, NO percussion, NO speech, NO voiceover. NO captions.
NO daylight. NO body rotation animation.

CRITICAL DO NOT DO: do NOT animate the cultist turn — ZERO body rotation, ZERO torso-twist, ZERO
arm motion during the turn. Before flash: 100% backs to camera. During flash: pure white frame.
After flash: 100% facing camera, perfectly still. INSTANT TELEPORT-STATE, NOT animate. Do NOT have
cultists step forward. Do NOT zoom. Do NOT make grins comical — uncanny, frozen, demonic. NO
Halloween skull-mask mascot style — must be photorealistic uncanny pale skin.
```

### Clip D — Backing away

Endpoint: `seedance-2.0` (kling lets cultists drift; seedance keeps them frozen statues).

```
9:16 vertical found-footage horror handheld POV, 5s, ONE continuous take. Hi8 camcorder — subtle
grain, cold blue, soft focus.

ANCHOR (matches first-frame): POV of {{handheld_persona}} at forest clearing — seven hooded cultists
facing camera with pale faces, empty matte-black eye sockets, wide demon grins, motionless statues.
Bonfire warm-orange behind them. Amateur camera visible in operator hand bottom.

ACTION (5 seconds): Operator BACKS AWAY through {{cult_location_descriptor}}. Camera moves backwards
from clearing — cultists shrink in frame as we retreat. Panic-shake handheld. Foreground branches
whip past edges. Phone-torch beam swings creating cold-blue wash on tree trunks. The seven cultists
STAY ABSOLUTELY MOTIONLESS at their distant spots — FROZEN STATUES, no head-track, no body-turn,
no step, no blink, no breath, no sway, no arm motion. They simply stand and stare from afar as the
operator retreats. Operator gloved hand still visible at frame bottom holding the camera.

VISUAL: cold blue tones, subtle Hi8 grain, motion-blur smear on foreground, vignette. Authentic
panicked retreat footage.

STRICTLY FORBIDDEN: NO music, NO singing, NO percussion, NO speech, NO voiceover. NO captions.
NO daylight. NO cultist motion of any kind. NO cultist chasing.

CRITICAL DO NOT DO: do NOT animate cultists at ALL — they are frozen statues. NO blink, NO breath,
NO head-turn-to-track-operator, NO step, NO arm-raise, NO mouth-movement. The horror is in their
UTTER STILLNESS. Do NOT show operator face. Do NOT zoom. Do NOT cut. Do NOT make cultists step
forward or run.
```

### Clip E — The Sound (slow whip-pan)

Endpoint: `seedance-2.0`.

```
9:16 vertical found-footage horror handheld POV, 5s, ONE continuous take. Hi8 camcorder — subtle
grain, cold blue, soft focus.

ANCHOR (matches first-frame): POV of {{handheld_persona}} stopped on a dark trail in
{{cult_location_descriptor}} at night with one tall central element (tree / column / pillar) ~4m
away. Cold blue phone-torch beam from below illuminating the trail in a tight cone. Operator hand
with camera visible at frame bottom-right.

ACTION (5 seconds):
- 0.0s–1.0s: Camera holds still, slight nervous tremble. Operator has just stopped running. Faint
  distant fire flicker no longer visible (cult clearing is far behind off-screen).
- 1.0s–1.2s: A WET CARTILAGINOUS CRUNCH sound suggestion from behind operator. Camera freezes
  utterly still.
- 1.2s–4.5s: Camera begins SLOW 180° rotation to the right to look behind operator. Pan is
  deliberately slow, taking ~3.3 seconds for a half-turn. Dark surroundings blur past during the
  slow whip-pan with mild motion blur. Phone-torch beam swings with the camera.
- 4.5s–5.0s: Rotation reaches near-completion. The right edge of frame begins to show a faint pale
  silhouette of SOMETHING — just a hint, not yet a full reveal.

VISUAL: cold blue tones, subtle Hi8 grain, soft motion blur during the rotation, vignette.

STRICTLY FORBIDDEN: NO music, NO singing, NO percussion, NO speech, NO voiceover. NO captions.
NO daylight. NO full monster reveal — only a faint edge silhouette at very end. NO bonfire visible
(it is far behind off-screen).

CRITICAL DO NOT DO: do NOT show the full monster — only a barely-visible pale silhouette at the
right edge in the LAST 0.5 seconds. Do NOT speed up the rotation — it MUST be slow and deliberate.
Do NOT have the camera drop. Do NOT show operator face. Do NOT add jump-scare zoom.
```

### Clip F — Monster reveal (DIEGETIC REGISTER BREAK — Hi8 → clean cinema)

Endpoint: `seedance-2.0`. This is the only clip in the cut WITHOUT the VHS overlay layer in Remotion — the diegetic justification is that the camera fell at the end of Clip E and the cinema register represents "the truth visible without the amateur-camera filter".

```
9:16 vertical cinematic horror, 5s, ONE continuous take, no cuts. CINEMA register — clean grade,
true blacks, sharp focus, subtle modern film grain. NOT Hi8.

ANCHOR (matches first-frame): eye-level full-body wide shot of {{subject_creature}} standing
motionless on a wet dirt path in {{cult_location_descriptor}} at night, 3m from camera, dead-on.
<RESTATE creature anatomy inline matching --ref master>. Phone-torch beam from below.

ACTION (5 seconds):
- 0.0s–2.0s: Creature ABSOLUTELY STATIC, frozen, just staring. At ~0.8s a single subtle micro-motion
  (eye swivel / organ pulse / breath shudder — pick ONE). Otherwise FROZEN — no sway, no step.
  Hold the dread.
- 2.0s–2.2s: SUDDEN VIOLENT LUNGE — creature explodes forward at high speed toward the camera,
  body swelling in frame.
- 2.2s–3.0s: Creature FILLS THE FRAME at point-blank range. Camera shakes violently from impact.
- 3.0s–4.5s: HEAVY VHS SIGNAL-LOSS GLITCH overtakes — chromatic aberration explodes, scanline
  distortion bands flicker, color channels shift apart, tracking errors scramble, brief pure-static
  frames.
- 4.5s–5.0s: Frame collapses to mostly black with intermittent static flashes — signal dying.

VISUAL: clean cinema until 2.0s, then violent motion blur during lunge, then catastrophic VHS-glitch
chaos for the last 2s. Cold blue moonlight + warm torch under-light during the static moments.

STRICTLY FORBIDDEN: NO music, NO singing, NO speech, NO voiceover, NO captions. NO daylight.
NO additional creatures, NO duplicates.

CRITICAL DO NOT DO: do NOT have the creature move during first 2s — ONLY one micro-motion. The
lunge MUST be sudden and explosive at exactly 2.0s. Do NOT skip the lunge — it IS the climax.
Do NOT change creature design — match first-frame exactly. Horror is stillness BEFORE lunge +
catastrophic violence of lunge itself.
```

Alternate Clip F — stalking-walk variant (use this if the static-then-lunge reads as too cheap):

```
[Same anchor block as above]

ACTION (5 seconds):
- 0.0s–1.0s: Creature stays hunched, ABSOLUTELY MOTIONLESS at ~10m distance, head-fixture locked
  on camera. Subtle volumetric mist drifts. Torch beam steady with mild handheld tremor.
- 1.0s–2.5s: The creature SUDDENLY starts moving forward toward the camera, fast stalking gait —
  body proper does not bob, head-fixture stays FIXED forward like a predator. Distance shrinks
  from ~10m to ~4m. Volumetric mist parts around the body.
- 2.5s–4.0s: Acceleration — the creature is now striding rapidly toward the camera. Distance
  shrinks from ~4m to ~1.5m.
- 4.0s–5.0s: POINT-BLANK — creature is now ~0.5m from the camera lens. The body fills the frame.
  Camera shakes violently from proximity terror.

CRITICAL DO NOT DO: do NOT keep the creature static for more than the first 1 second. Do NOT have
the creature stop or hesitate during the approach — it MUST keep accelerating toward camera. Do
NOT make the head-fixture bob — it stays FIXED forward like a predator. Do NOT have the creature
lunge in the air or jump — it WALKS stalking with rapid strides.
```

---

## Stage 3 — SFX + ambient (ElevenLabs Music endpoint, banned-music)

Generate sound-design audio via ElevenLabs Music with an explicit no-music block. Returns clean SFX every time when banned this hard.

### Horror ambient bed (full runtime)

```
Slow, monotonous classic horror ambient bed. Sub-bass drone at very low frequency (~40Hz),
barely-audible distant low choral hum (no melody, no words, just held note), occasional sparse
metallic shimmer/scrape in extreme background, faint environmental wind layer matching
{{cult_location_descriptor}}. Tonal: dark minor, dissonant low strings, NO percussion, NO drums,
NO rhythm, NO melody, NO build-up, NO climax — just a sustained dread bed.
```

### Collective wet inhale (the turn beat)

```
Single deep collective wet drawn-out inhale through multiple mouths simultaneously, lasting 2
seconds at the start, then absolute silence. Layered with very low subharmonic shudder. NO music,
NO melody, NO rhythm, NO percussion, NO singing, NO words. JUST the wet inhale SFX and ambient
silence. Sound design for horror movie scare beat — the moment cultists collectively breathe in
together. Pure SFX, not a song.
```

### Wet crunch + multi-foot step (the sound beat)

```
Single wet cartilaginous CRUNCH sound at 0.5 seconds (like bones snapping inside wet flesh), then
1 second of silence, then a single heavy organic footstep with TOO MANY FEET — multiple wet
overlapping thumps as if a creature with many limbs takes one step on damp ground, lasting 1.5
seconds. Followed by a low subharmonic drone that slowly rises. NO music, NO melody, NO percussion,
NO singing, NO instruments. Pure sound design SFX.
```

### Camera-drop thud + VHS signal-loss static (act-break transition)

```
Heavy organic THUD sound of a small plastic camera hitting damp ground from chest height, followed
immediately by harsh VHS static / signal-loss audio (white noise burst, brief tape-mechanism click,
dropouts) lasting 2 seconds, then absolute silence. NO music, NO melody, NO rhythm, NO percussion,
NO singing. JUST the impact SFX and VHS signal noise. Pure sound design SFX, NOT a song.
```

### Distant chant whisper layer (Discovery + photo build-up)

```
Distant indistinct collective whisper-chant from a group of 7 voices, almost subliminal, repeating
low Latin-like syllables ('sanguis... voco... veni...') in a slow ritualistic cadence. Mixed very
low and far away, as if heard from 20 meters through {{cult_location_descriptor}}. Layer this over
a faint environmental ambient. NO music, NO melody, NO percussion, NO instruments.
```

---

## Stage 4 — Captions + HUD overlays (Remotion)

3 diegetic captions in `{{target_language}}` max in a 40s cut. Lower-third, simple sans-serif system-font, no kinetic typography. No VO at all (template default).

| Time | Text (example, English) | Where |
|---|---|---|
| ~3% of runtime | establishing context ("trail behind the lake") | Lower-third of opening clip, fades in/out |
| ~60% of runtime | peak-beat reaction ("they see me") | Lower-third of backing-away clip, fades in/out |
| Final 1s | end-card ("SIGNAL LOST" / "NO SIGNAL" / "TAPE EJECTED") | Full-frame after monster reveal, degraded VHS font, then black |

Persistent HUD layer (Act 1 only, removed at the camera-drop):

```
REC ●  AUG 15 2003 23:47:XX
                  · BAT NN%
```

Top-corners, small (≤4% of frame width), animate the `XX` seconds per beat (increment by clip duration). VHS chromatic-aberration filter + scanline flicker at low opacity over the whole Act-1 layer. Act-2 (monster reveal) renders clean cinema with no HUD and no VHS overlay — the diegetic break IS the climax.
