# Cinematic Prompt Cookbook

The mechanical playbook for assembling a film-look prompt. Pair this with `hooks.md` for the opening 2s and `TEMPLATE.md` for the high-level vibe.

## Master prompt scaffold

Every cinematic prompt fills these blocks in order. Each block is a sentence or two — the model rewards specificity.

```
[OPENING HOOK — 0 to 2 seconds]
<hook technique from hooks.md>
<specific sensory trigger: light burst, sound drop, extreme close-up>
<transition into main action at the 2s mark>

[ESTABLISHING CONTEXT — 2 to 4 seconds]
<location: geography, architecture, atmosphere>
<lighting setup: name + color temperature + angle>
<color grading approach>
<time of day, season, weather>

[PRIMARY ACTION — 4 to 10 seconds]
<camera movement: name + speed in ft/s + duration>
<character or environmental change>
<emotional arc, tension point>
<dialogue or audio integration if applicable>

[DEPTH AND COMPOSITION]
<foreground element>
<mid-ground action>
<background context>
<depth cues: atmospheric perspective, focus layers, scale>

[CAMERA SPECIFICATIONS]
<focal length equivalent: 24mm wide / 35mm standard / 50mm portrait / 85mm close / 200mm tele>
<depth of field: f/1.4 ultra-shallow / f/2.8 moderate / f/5.6 deep>
<movement velocity in ft/s or deg/s>
<focus behavior: locked, breathing, racking>

[LIGHTING SPECIFICATIONS]
<key light intensity, direction (clock position), color temperature>
<fill ratio: 3:1 standard, 5:1 dramatic, 10:1 noir>
<back/rim presence and intensity>
<shadow character: hard or soft, warm or cool>

[AUDIO INTEGRATION]
<silence moments>
<music entrance, build, peak, resolve>
<foley sync points>
<dialogue placement and reverb>
<sound effect impact moments>

[COLOR GRADING]
<grade name: teal-orange / golden / bleach-bypass / desat-with-accent>
<saturation percentage>
<shadow / highlight color bias>
<grain or diffusion>

[MOOD AND ATMOSPHERE]
<emotional target: tense / romantic / awe / melancholic>
<atmospheric: fog / dust / haze / volumetric>
<viewer psychological position>

[OUTPUT SPECIFICATION]
<duration in seconds>
<aspect ratio: 16:9, 9:16, 2.39:1>
<resolution>
```

For 4-8s clips, collapse `[ESTABLISHING CONTEXT]` and `[PRIMARY ACTION]` into a single block. For 15s full-arc clips, add a `[CLIMAX]` and `[RESOLUTION]` block.

## Camera movement vocabulary

Every shot specifies one named camera move. Velocity in feet/second or degrees/second always.

| Move | Purpose | Duration | Phrasing |
|---|---|---|---|
| **Dolly forward** | intimacy, tension build | 1-3s | "Camera dolly forward at constant 2 ft/s. Subject center-frame. Slight lens breathing 2-3 px aperture. No focus shift." |
| **Dolly back / pull-out** | reveal, scale, shock | 1-4s | "Camera pulls back 15 feet at 3 ft/s. Subject locked frame-center. Background gradually reveals. No focus breathing." |
| **Truck left / right** | lateral environment reveal | 2-4s | "Camera trucks left 10 feet at 2 ft/s. Subject frame-right. Parallax: background moves slower than foreground." |
| **Pan** | rotation without translation | 0.5-2s | "Pan left 60 degrees at 30 deg/s. Smooth accel and decel. Ends on secondary subject." |
| **Tilt up / down** | vertical scale or emotion | 1-3s | "Tilt up from feet to face at 20 deg/s. Faster start (30 deg/s), decel to 10 deg/s." |
| **Whip pan** | energetic transition | 0.3-0.6s | "Whip pan A to B in 0.5s at 90 deg/s. Motion blur acceptable. Smooth decel at landing." |
| **Handheld** | documentary, urgency | 2-6s | "Handheld follow. Micro-vibration 0.5-1mm jitter at 2 Hz. Breathing motion 1-2 px frame size fluctuation." |
| **Steadicam / gimbal follow** | controlled flow | 3-8s | "Gimbal-smooth follow at 3-foot distance. All micro-vibrations removed. Liquid motion." |
| **Tracking shot** | subject in environment | 3-6s | "Track from 4-foot side distance. Subject frame-right. Parallax reveals background progressively." |
| **Crane up** | scale, awe, reveal | 3-6s | "Crane rises 30 feet over 4s. Slight tilt down to maintain subject visibility." |
| **Crane down** | overview to intimate | 2-4s | "Descend 20 feet over 3s, ending eye level. Slow tilt up during descent." |
| **270 orbit** | full-environment reveal | 4-8s | "Orbit 270 deg counterclockwise around subject over 5s. Constant 8-foot distance. 54 deg/s." |
| **Rack focus** | depth, attention guide | 0.5-2s | "Rack from sharp foreground (2 ft) to sharp background (25 ft) over 1.5s. Mid-field blurs in transit." |
| **Dutch tilt** | unease, dream | 3-8s | "Frame tilted 20 deg counterclockwise. Horizon diagonal. Hold throughout clip." |
| **Push-in + zoom (vertigo)** | psychological pressure | 2-4s | "Simultaneous dolly forward 5 ft AND zoom to 85mm over 3s. Eliminates depth cues." |
| **Lock-off** | observation, stillness | 2-6s | "Camera fixed. Zero movement. Subject moves through frame. f/2.8 separation." |

**Combine 2-3 moves per clip** for sophisticated arcs: "Dolly forward 0-2s + whip pan transition 2-2.3s + tracking shot 2.3-5s."

## Lighting setups

Every shot specifies one motivated light source.

| Setup | Mood | Ratios | Phrasing |
|---|---|---|---|
| **Three-point classic** | controlled, professional | Key 100% / Fill 33% / Back 60% | "3000K key at 45 deg left 100%. Soft fill 60 deg right 33% (3:1). Rim back 80 deg 60%. Soft shadow gradation." |
| **Chiaroscuro / noir** | mystery, danger | Key 100% / Fill 10-15% / Back 40% | "Hard 3000K key at 45 deg left. Fill 10% creating harsh shadows. Rim 40%. 85% frame in shadow, 15% lit. Black-crushed shadows." |
| **Silhouette backlit** | mystery, power, otherworldly | Key 0% / Fill 0% / Back 100% | "Subject backlit by bright 5000K source (sunset, fire, window). Zero fill. Subject = pure black shape. Rim defines outline only." |
| **Golden hour** | romance, nostalgia | Key 100% / Fill 50% / Back 60% / 3000K | "Warm 3000K directional at low 15 deg angle. Atmospheric haze diffusing. Shadows warm 2000K spill. Entire frame in golden glow." |
| **Cool moonlit** | isolation, melancholy | Key 100% / Fill 20% / Back 30% / 6500K | "6500K cool light at 30 deg suggesting moon. Blue-tinted shadows. Minimal fill, deep shadows. Low overall intensity." |
| **Practical neon** | dystopian, cyberpunk | split-color / Fill 30% | "Visible neon signs casting hot-pink and cyan spill. Multiple sources, conflicting shadows. Optional 2-3 Hz flicker. Cool dominant cast with warm neon accents." |
| **Volumetric / god rays** | spirituality, awe | Key 100% directional + particles | "Directional 3000K key through particle-filled atmosphere. Visible light shafts. Dust motes in rays. Lens flare at source." |
| **Firelight** | intimacy, primal danger | Key 100% flickering / 1500-2000K | "Warm 1800K from visible fire source. Flicker at 2-4 Hz. Large dancing shadows. Soft warm spill in shadow areas." |
| **Two-source split** | conflict, duality | Key 100% one color / Back 100% other | "Warm 3000K key from left 100%. Cool 6000K back from right 100%. Color-temperature conflict on subject. Opposite-color shadows." |
| **Soft overcast** | calm, vulnerability, realism | flat 100% / 5500K | "Diffused uniform 5500K. No harsh shadows. Soft 10ft-radius shadow edges. Omnidirectional light. No visible source." |

## Color grading

| Grade | Look | Phrasing |
|---|---|---|
| **Teal-orange** | modern action, high-stakes | "Shadows biased cyan-teal (200 deg hue, 100% sat). Highlights orange-gold (30 deg hue, 90% sat). Midtones neutral. Overall sat 110%." |
| **Desat with accent** | symbolic focus | "Reduce overall saturation to 30%. Maintain 100% saturation on accent color only [red / gold / cyan]. World grey-blue except accent." |
| **Golden warm** | nostalgia, romance | "Color temp shifted to 3200K. All highlights warm. Shadows warm orange-brown (not blue). Sat boosted 115% on warm tones." |
| **Cool blue** | isolation, sci-fi | "Temp 6500K. Shadows blue-cyan. Highlights retain slight 4000K warmth. Overall desat 85%." |
| **Bleach bypass** | gritty, vintage, tough | "Lift black point (blacks become dark grey, value 10% not 0%). Greys elevated. Compressed contrast. Grain 150%. Vintage stock." |
| **Cyberpunk neon** | futuristic, intense | "Sat 140%. Vibrance 120%. Split-tone: shadows cyan, highlights magenta-pink. Glow/bloom on light sources." |
| **Monochrome with accent** | symbolic, artistic | "0% saturation everywhere except one hue [red / blue / gold] reintroduced at 100% in tonal range." |
| **Bleach B&W high-contrast** | timeless, dramatic | "0% saturation. Crush blacks to 0. Lift whites near-white. S-curve gamma. Eliminate midtones." |

## Sound design

Five layers, each with a target dB relative to dialogue (0dB reference).

- **Ambient bed** (-3 to -6dB): continuous environmental — room tone, wind, distant traffic, ocean. Sets place. Begins at 0s, runs throughout.
- **Foley** (-1 to +1dB): synced to visible action — footsteps, clothing rustle, object impacts. Creates tactile reality.
- **Music** (-2 to -4dB): emotional architecture. Enters at 0.5-2s, builds through middle, peaks at climax, resolves by end. Lock visual cuts to musical downbeats.
- **Dialogue** (0dB): sparse. One emotional line at the climax beats wall-to-wall narration. Add reverb tail matching room (0.3s intimate, 1.2s cathedral).
- **Sound effects** (+1 to +3dB): impact moments synced to visual events. Gunshots, explosions, music drops, glass shatters. 0.3s attack, 0.5s decay.

**Silence is a layer.** 1.5-2.5s of complete silence before the music drop or dialogue entry creates anticipation that no other technique matches.

## Common mistakes

1. **Skipping the 2-second hook.** "Gorgeous landscape pans for 4s" loses 80% of mobile viewers. Always specify the hook technique in the opening lines of the prompt.
2. **Static / locked camera.** Fixed position throughout reads as flat and TV-like. Specify at least 1-2 camera moves per 4s of clip.
3. **Flat lighting.** Overcast or ambient with no direction kills depth. Always specify directional key (45 deg angle), fill ratio (3:1 minimum), and back/rim.
4. **Inconsistent depth of field.** Focus drifting between planes feels amateurish. Lock focus on the primary subject and specify f-stop equivalent.
5. **Audio-visual desync.** Music beat at 4s but visual climax at 3.5s creates dissonance. Specify simultaneous timing: "at 5.5s, visual impact SYNCHRONIZED with drum hit."
6. **Overcrowded framing.** Subject should occupy 30-50% of frame. Use negative space — empty/blurred space directs attention.
7. **Saturation too high.** 150%+ saturation reads as cheap and digital. Stay 100-120%, use split-toning for sophistication.
8. **Camera too fast.** 6+ ft/s or 60+ deg/s rotations disorient. Default to 2-3 ft/s and 20-30 deg/s. Reserve fast motion for climax beats only.

## Ready-to-run example prompts

### Example A: Noir detective interior (10s, 16:9)

```
10-second cinematic noir scene.

[HOOK 0-2s] Black screen, complete silence 0-0.8s. At 0.8s, explosive
cool-blue 5000K light burst from frame-left. Single hard light source
suggests cold industrial fixture. Hard-edged shadow slashes across
center. Viewer disorientation as light invades blackness.

[ESTABLISH 2-4s] 1940s warehouse interior, cool grey concrete, metal
beams overhead. Camera 40 feet back, low angle 15 degrees up. 35mm
equivalent lens. Chiaroscuro lighting: hard 3000K key from upper-left
at 60 deg, minimal fill 15%. 35mm grain visible.

[ACTION 4-8s] Camera slow dolly forward at 1.5 ft/s. As camera approaches,
silhouette of detective materializes in shadow-pool center-frame. At
5.5s, detective's face catches edge of overhead light. Eye glint visible.
Subtle head turn. At 6s, hand pulls cigarette from pocket (silhouette).

[CLIMAX 8-10s] At 8s, detective lights cigarette — small flame reveals
weathered face. At 8.3s second practical lamp flicks on frame-right,
two-source split lighting. At 9.5s fade to black, single light remains.

[CAMERA] f/2.0 shallow. Focus locked on face throughout dolly. 1.5 ft/s
constant. 16:9 widescreen, 720p.

[GRADE] Bleach bypass: blacks lifted to dark grey, greys elevated. 0%
saturation except slight warm cast on skin and white light. Cold blue
shadows. Grain 150%.

[AUDIO] 0-1s silence. 1-4s subtle jazz trumpet enters at -6dB. 4-7s
foley footsteps and clothing rustle. 8-8.3s lighter scratch + ignite
(sharp +2dB). 8.5-10s music swells.

[MOOD] Danger, mystery, weariness. Cigarette smoke visible in light rays
(volumetric). Cold, industrial. Viewer = observer in dangerous space.
```

### Example B: Epic golden-hour landscape reveal (15s, 16:9)

```
15-second cinematic landscape reveal, golden hour.

[HOOK 0-2s] Extreme macro of water droplet refracting upside-down
landscape, 0-0.5s. At 0.5s, camera whip-pulls backward explosively.
Macro vanishes. At 1.2s, extreme wide vista — desert valley, layered
mountains receding to horizon. Scale shock at 2s.

[ESTABLISH 2-4s] High-altitude mountain valley. Golden hour 3200K sunset.
Aerial position 200 ft altitude, looking across valley. 28mm ultra-wide
equivalent. Warm directional light from frame-right. Atmospheric haze
creates volumetric god-rays. Three depth layers: rocky foreground,
valley mid-ground, receding mountains.

[ACTION 4-10s] Crane descend from 200 ft to 20 ft over 6s at 3 ft/s,
decelerating to 1 ft/s near ground. Tilt shifts level to looking-down.
Scale transforms from "vista" to "landing in environment." Valley
detail revealed at 6s. At 10s, camera hovers, slight 90 deg horizontal
pan reveals hidden canyon structure.

[CLIMAX 10-12.5s] Music crescendo. Sun touches mountain-top frame-right,
backlight silhouettes terrain. Camera locked-off briefly.

[RESOLVE 12.5-15s] Slow pull-back 5 ft emphasizing scale. Tiny human
figure visible in valley demonstrates landscape vastness.

[CAMERA] 28mm ultra-wide. f/5.6 deep focus. Velocity 3 ft/s descend, 1
ft/s hover, 2 ft/s pan. 16:9, 720p.

[GRADE] Golden warm. Temp 3200K amber. Saturation 120% on golden areas.
Shadows warm 2000K (not cool). Sky peachy-orange. Magical, nostalgic.

[AUDIO] 0-2s minimal wind. 2-4s orchestral strings -4dB. 6s timpani
rolls enter. 10-12s brass crescendo +2dB. 12-15s peak then fade to wind.

[MOOD] Awe, majesty, insignificance. Viewer feels small before vastness.
```

### Example C: Intimate dialogue close-up (10s, 16:9)

```
10-second cinematic dialogue moment.

[HOOK 0-2s] Silent black 0-1.2s. At 1.2s, sudden cut to extreme close-up
of eye opening. Iris dilates over 0.3s. Pupil sharp, eyelashes macro.
At 1.8s, micro-tear forming (glistening). Primal eye-contact attention grab.

[ESTABLISH 2-4s] Intimate interior, soft lamplight. Camera 2 ft from
face. 50mm portrait equivalent. Three-point soft setup: 3000K warm key
at 45 deg left 60%, soft fill right 40% (2:1 ratio), back rim 45%.
Shadows soft. Warm interior color temp.

[ACTION 4-8s] Subject slow head turn from 45 deg left to camera-facing
over 2s. Deliberate, emotionally weighted. At 5s, mouth opens — single
emotional line. f/1.4 ultra-shallow, face sharp, background bokeh.
Background = warm circular lamp bokeh.

[CLIMAX 8-10s] Emotional peak of dialogue at 8-9s. Camera push-in 6
inches at 3 in/s for intimacy escalation. At 9s, eyes glisten further.
At 9.5s, jaw clench. At 10s, slight pull-back creates breathing room.

[CAMERA] 50mm. f/1.4. Push-in 6 in over 3s. Focus locked on eye. 16:9, 720p.

[GRADE] Warm intimate. Temp 3200K. Skin sat 110%. Shadows lifted toward
warm tones. Exposure +0.3 stops. Slight diffusion 5% on highlights.

[AUDIO] 0-2s silence. 2-7.5s -8dB ambient (private quiet space). 7.5s
dialogue at 0dB with 0.3s reverb tail. 4s gentle music bed -6dB. 8-10s
music swells supporting peak then pulls back.

[MOOD] Vulnerability, intensity, confession. Viewer = intimate confidant.
```

### Example D: High-energy chase (8s, 16:9)

```
8-second adrenaline chase.

[HOOK 0-2s] Black silence 0-0.8s. At 0.8s, explosive kick drum hit
(+3dB). Synchronized whip-cut to high-speed motion. Subject enters
frame-right at 45 mph equivalent. Motion blur 20% trailing.

[ACTION 2-6s] Urban street, dense cityscape. Low 25-degree tracking
from behind-left, 4 ft distance. 35mm equivalent. Harsh midday 5500K
sun, hard geometric shadows. Subject moves at 35 mph through environment.
Foreground fast scroll, background slower (parallax = speed). At 4-5s,
subject veers/jumps. At 5-6s, environment narrows (alley compression).

[CLIMAX 6-8s] At 6s subject accelerates further (deeper motion blur).
At 7s, near-collision moment, camera accelerates to 5+ ft/s. At 7.3s,
impact synchronized with percussion spike. At 7.5-8s, slight slo-mo
deceleration on impact.

[CAMERA] 35mm. f/4-5.6 moderate. 3.5 ft/s base, 5+ peak, 2 finale.
Gimbal-smooth, no handheld. 16:9, 720p.

[GRADE] Teal-orange action. Sat 120%. Shadows crushed. Highlights
warm-yellow, shadows cool-blue. Background slightly desat to make
subject pop.

[AUDIO] 0-0.8s silence. 0.8s kick drop. 2-7s electronic bed at -2dB.
Foley footsteps escalate frequency with speed. 7.3s impact SFX +3dB.
7.5-8s music decel.

[MOOD] Adrenaline, danger, urgency, sensory overload.
```

### Example E: Intimate hands across a table (12s, 16:9)

```
12-second tender emotional moment.

[HOOK 0-2s] Extreme close-up two hands 1 inch apart over wooden table.
Fingertips sharp, hands progressively blur, background black bokeh. At
1.2s, one hand approaches the other slowly. At 1.8s, fingertips barely
touch — intimate contact moment.

[ESTABLISH 2-4s] Small intimate space (corner booth, quiet room). Warm
practicals visible. Camera at table level 3 ft from action. 50mm
portrait. Soft three-point: warm 2700K key upper-left 50% (lamplight),
soft diffused fill right 40%, rim 30%. Very warm 2700K overall.

[ACTION 4-10s] Two figures across table. Camera at table level between,
favoring primary. At 4-5s, primary reaches across at 4 in/s. At 5.5s,
hands make contact, fingers interlace. At 6-8s, hands hold, slight
tremor. Secondary's eyes look at hands then up to face. At 8-9s,
primary leans forward slightly.

[CLIMAX 10-12s] At 10s eye contact locks. At 10.5s camera push-in 12
inches over 1.5s at 8 in/s. At 11s eyes glisten. At 11.5s gentle smile.
At 12s hands remain connected, moment suspended.

[CAMERA] 50mm. f/1.2 ultra-shallow. Push-in 12 in over 1.5s. Focus
locked on hands and faces. 16:9, 720p.

[GRADE] Warm intimate. Temp 2700K. Faces +200K warmth. Lifted shadows
(soft). Exposure +0.5 stops. Sat 90% (muted nostalgic). Diffusion 3%
on highlights. Slight vignette.

[AUDIO] 0-2s -8dB ambient (restaurant murmur). 4-8s gentle piano enters
at -5dB, 60 bpm minor key, sparse arpeggios. 8-10s strings layer at
-4dB. 10-12s music swells, sustained held note. Subtle table-touch
foley at 5.5s -3dB. Optional faint heartbeat -10dB. No dialogue.

[MOOD] Love, loss, connection, goodbye. Viewer = privileged observer.
```
