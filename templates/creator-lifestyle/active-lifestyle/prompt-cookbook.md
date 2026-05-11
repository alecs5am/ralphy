# Active Lifestyle — prompt cookbook

## Master template

```
[ESTABLISHING — 0-3s]
Wide pull-back from the activity. Person mid-action, environment dominant.
Prompt: <activity setting> + <time-of-day light> + <handheld camera language> + <real-feel framing>.

[ACTIVITY — 3-18s, 3-5 beats]
Person performing the activity. Product in frame 60-80% but never hero-framed.
Per-beat prompt: <specific motion verb> + <product placement note> + <camera move>.

[SATISFACTION — 18-25s]
Slow-mo or held shot. Smile / breath / view / refill / sip.
Prompt: <facial expression> + <slow-mo cue> + <golden-hour or post-effort tone>.
[Brand title overlay last 1.5s — Remotion text overlay, sans-serif bold]
```

## Activity vocabulary by sport

| Sport | Motion verbs | Required detail prompts | Product fit examples |
|---|---|---|---|
| Cycling | pedal cadence, lean angle, stand-up climb, descent posture | helmet detail, cleat-engage shot, bottle-cage glance | water bottle, helmet brand, cycling shoes, GPS computer |
| Padel | swing follow-through, smash, defensive bandeja, backhand block | wrist-snap, racket-grip detail, court-shoe pivot | sunglasses, padel racket, court shoes, sweat band |
| Gym | bar-bend at lockout, controlled eccentric, post-set breath | grip on bar, sleeve roll, weight-belt buckle | pre-workout shaker, lifting belt, knee sleeves, smartwatch |
| Yoga | flow transition, deep inhale, asana hold | breath-visible, mat texture, hand-placement detail | yoga mat brand, leggings, water bottle, blocks |
| Running | stride form, cadence, breath visible, foot-strike | shoe-during-stride, watch-tap mid-run | running shoes, smartwatch, hydration vest, sunglasses |
| Hiking | switchback step, summit moment, terrain-feel | boot tread, pack adjust, trekking-pole plant | hiking boots, backpack, water bottle, sunscreen |
| Surfing | paddle-out, takeoff, bottom turn, kick-out | board-rail-water spray, wax-grip glance | surf wax, board, rashguard, sunscreen |
| Skiing | edge-carve, powder-spray, pole plant, lift-line breath | ski-base flex, goggle-fog wipe, helmet-strap | goggles, skis, helmet, base layer |

## Product placement discipline

| Beat | Product visibility | Framing rule |
|---|---|---|
| Establishing | Out of frame OR 1 distant glimpse | Don't telegraph the ad. |
| Activity beat 1 | Glance / hand-pass | 0.5-1s, in motion, never centered. |
| Activity beat 2 | In-frame but not framed | Subject is the action; product happens to be there. |
| Activity beat 3 | Brief hero-glance OK | Watch-tap, bottle-sip, shoe-stride — incidental, not posed. |
| Satisfaction | Slow-mo with product visible | Now you can hold on it 1.5-2s. Still feels earned. |
| Outro | Brand title overlay | Remotion text, bottom-third, 1.5s hold, sans-serif bold. |

## Camera language

- **Establishing:** handheld pull-back at 0.5-1.0 m/s; or low-angle dolly with grass/road in foreground.
- **Activity:** handheld tracking from the shoulder, slight breath-jitter; OR locked-off mid-shot for cadence sequences.
- **Satisfaction:** slow-mo (60-120fps source rendered to 30fps) on the smile/breath/view; OR held mid-shot with shallow DOF.
- Avoid: studio gimbal-perfect smoothness — reads as commercial.

## Lighting

- Golden hour (sunrise / sunset) is the conversion sweet spot.
- Midday: only for high-energy activities (gym, summit hike) where shadow contrast adds intensity.
- Dusk / blue hour: serene tone, works for yoga, recovery, post-effort.
- Avoid: studio fill light. The format depends on environmental authenticity.

## Music

| Tone | BPM | Style | Reference vibe |
|---|---|---|---|
| Driven-energetic | 110-130 | instrumental electronic | Bonobo, Tycho, Rüfüs Du Sol |
| Serene-flow | 90-110 | acoustic indie / cinematic | Olafur Arnalds, Bon Iver instrumentals |
| Gym-hype | 100-110 | hip-hop instrumental | Travis Scott / Metro Boomin instrumentals |
| Outdoor-anthemic | 100-120 | indie folk-rock | Local Natives, Mt. Joy |

ElevenLabs Music prompt examples:
- `instrumental electronic, 120 BPM, building intro, Bonobo-style, no vocals`
- `acoustic indie cinematic, 95 BPM, warm guitar + light percussion, Olafur Arnalds vibe`
- `hip-hop instrumental, 105 BPM, hype but not aggressive, Travis Scott style`

## VO discipline

- **Default: no VO.** Diegetic sport sounds + music carry. Brand title overlay closes the spot.
- If VO is used: 1 line at outro, conversational, ElevenLabs `eleven_multilingual_v2` stability 0.4 / similarity 0.75.
- Never voiceover-narrate during activity beats — it kills the "documentary" feel.

## Sound design (diegetic)

- **Cycling:** chain whir, tire hiss, breath; gear-shift click on satisfaction beat.
- **Padel:** racket pop, ball thud, court-shoe squeak.
- **Gym:** plate clack on rack, bar drop, breath after rep.
- **Yoga:** deep breath, mat texture, faint room ambient.
- **Running:** stride foot-strike, breath cadence, wind.
- **Hiking:** boot crunch on terrain, pack-strap creak, distant wind.
- **Surfing:** wave-crash, board-rail-spray, wind.
- **Skiing:** edge-carve hiss, goggle-fog brief, lift hum at start.

Prefer real diegetic capture or licensed library; ElevenLabs SFX library can fill gaps.

## Brand title-card outro

- 1.5s hold at end of clip
- Remotion text overlay, lower-third (Y around 1500-1600 in 1080×1920)
- Font: sans-serif bold (Inter Bold / Onest Bold / Manrope Bold)
- Color: brand color OR white with subtle drop shadow
- Animation: spring-in from bottom (0.4s)

## 8 mistakes to refuse / fix

1. **Product hero-framed during activity beats** → reads as ad-flag. Push it to satisfaction beat.
2. **Stiff / staged motion** → kills authenticity. Use real-cadence reference + handheld camera language.
3. **Studio fill lighting** → not aspirational, reads as commercial. Use natural-light-only prompts.
4. **Music too pumped (commercial-trailer vibe)** → undermines real-feel. Match BPM to activity rhythm, not "epic moment".
5. **No satisfaction payoff** → format requires the human-emotion beat. Don't skip it.
6. **VO during activity** → breaks documentary feel. Save VO for outro (or skip entirely).
7. **Wrong sport-cadence in motion** → if cycling looks like cyclist-in-spin-class, viewers feel the fake. Reference real-cadence prompts.
8. **Brand-title-card too aggressive (huge, neon, slam-in)** → undermines the subtle product-placement discipline. Keep it lower-third, sans-serif, calm.

## 4 worked examples

### 1. Cycling — water bottle brand (15s)

```
[0-3s ESTABLISH] Wide pull-back from cyclist climbing a winding road at golden hour, sunlight raking through trees. Handheld camera tracking from rear quarter. Real-feel road bike, helmet, jersey. 1080×1920 9:16, golden hour 18:30.

[3-7s BEAT 1] Mid-shot of cyclist on the bike, pedal cadence, water bottle in cage visible at bottom-third of frame. Camera tracks alongside at 6 m/s.

[7-11s BEAT 2] Close-up of hand reaching down to pull bottle from cage, sip while riding (one-handed grip steady), bottle-tip glints in sunlight. Brand label in focus for 0.8s.

[11-13s BEAT 3] Replace bottle, hand back to bar. Wide pull-back as cyclist crests the climb.

[13-15s SATISFACTION] Slow-mo (90fps source) of cyclist smiling at the descent ahead, breath visible, sunset behind. Brand title overlay slides up: "ELEVEN — for the climb".

Music: instrumental electronic, 120 BPM, Tycho-style building chord progression. Diegetic chain whir + breath audible under music.
```

### 2. Padel — sunglasses brand (12s)

```
[0-3s ESTABLISH] Low-angle pull-back across a padel court, two players warming up, golden hour light through glass walls.

[3-6s BEAT 1] Close-up of player adjusting sunglasses on the court, lens reflects opponent across the net.

[6-9s BEAT 2] Player executes a smash — slow-mo (60fps) — sunglasses stay locked on face through the swing. Sweat-glow in the lens.

[9-11s BEAT 3] Mid-shot of player walking back to baseline, mid-conversation with partner, sunglasses still on.

[11-12s SATISFACTION] Player tips sunglasses up briefly, smiles at the view of the court, holds the look. Brand title overlay: "OPTIK — built for the sun".

Music: instrumental electronic, 115 BPM, tight kick-snare, no melody-arc — just steady drive. Diegetic racket pop + ball thud audible.
```

### 3. Gym — pre-workout supplement (18s)

```
[0-3s ESTABLISH] Pull-back from a barbell loaded on the rack, gym lit warm-tungsten and one shaft of window light. Hands chalk up at frame edge.

[3-7s BEAT 1] Athlete picks up a shaker bottle from the bench, takes a slow sip mid-warm-up, brand label visible. Camera at chest-level dolly-in.

[7-12s BEAT 2] First set of squats — bar-bend at lockout, controlled eccentric, breath audible. Shaker bottle on rack edge in background of frame, slightly out of focus.

[12-15s BEAT 3] Athlete sets up for the next set, takes another sip, racks the shaker, grips bar.

[15-17s SATISFACTION] Post-set slow-mo (60fps) of athlete leaning on the bar, breath heavy, sweat-shine, eyes-up. Brand title overlay: "FUEL — pre, post, every set".

Music: hip-hop instrumental, 105 BPM, Metro-Boomin-style hype-but-not-aggressive. Diegetic plate clack + breath layered.
```

### 4. Trail run — smartwatch (14s)

```
[0-3s ESTABLISH] Wide pull-back on a runner cresting a forest ridge at sunrise, light cutting through pines. Handheld camera at low angle.

[3-7s BEAT 1] Mid-shot of runner along a trail, smartwatch on left wrist visible during arm swing, screen flickers heart rate.

[7-9s BEAT 2] Close-up of wrist as runner glances at watch — heart rate display, pace, distance — for 0.7s. Then arm continues swing.

[9-12s BEAT 3] Wide shot of runner on the trail, mountains behind. Camera tracking parallel.

[12-14s SATISFACTION] Runner slows at a viewpoint, hands on hips, deep breath, looks at the view. Smartwatch glance one more time. Brand title overlay: "TRAIL — every mile counted".

Music: indie folk-rock, 115 BPM, anthemic but restrained, Local-Natives-style. Diegetic foot-strike + breath audible under.
```

## CLI cookbook

Reminder per AGENTS.md hard rule #2 — every model call goes through `ralphy generate`. No raw `fetch` / `curl` against media APIs.

```bash
# Establishing keyframe
ralphy generate image --project <id> --slot scene-01-establishing \
  --prompt "wide pull-back, cyclist at golden hour..." --ref <product-photo-url>

# Activity-beat keyframes (3-5 beats per project)
ralphy generate image --project <id> --slot scene-02-beat-1 \
  --prompt "mid-shot of cyclist, water bottle in cage..."

# Activity i2v (5s clips per beat)
ralphy generate video --project <id> --slot scene-02-beat-1-vid \
  --image scene-02-beat-1 --prompt "smooth tracking dolly, real-feel cadence" --duration 5

# Music bed
ralphy generate music --project <id> --slot bed-01 \
  --prompt "instrumental electronic, 120 BPM, Tycho-style building" --duration 25

# Compose + render
ralphy render <project>
```

## Pre-flight checklist

- [ ] Product reference photo supplied and logged via `ralphy project log-asset`
- [ ] Sport selected from variation-axes list
- [ ] Establishing shot is wide-pull-back, not closeup
- [ ] Product is OUT of frame in establishing
- [ ] Product is in 60-80% of activity beats but never hero-framed there
- [ ] Satisfaction beat exists and is slow-mo or held
- [ ] Music BPM matches activity tone
- [ ] Brand title overlay is lower-third, calm, 1.5s hold
- [ ] No VO during activity beats
