# Real Estate — Prompt Cookbook

How to write keyframe and i2v prompts that produce photoreal, listing-grade footage. Read `TEMPLATE.md` for narrative structure first; this file is the per-clip prompt grammar.

All keyframes go through `gemini-3-pro-image-preview` (multi-ref with the user's property photos). All i2v through `kling-v3.0-pro`, 5s clips, `generate_audio: false`.

---

## Master prompt template

Use this skeleton for every clip. Fill the slots with the values from the per-section playbooks below.

**Keyframe prompt (image)**:
```
[Property archetype], [room or exterior subject], shot from [camera position],
at [time of day] light. [Lighting direction and quality]. [Material focal point].
[Sight line / depth element]. Composition: [framing rule]. Photoreal architectural
photography, [aspect ratio], reference photos define facade / view / room layout
exactly — do not invent geometry, materials, or brand markers absent from references.
No people unless specified. No improvised signage, addresses, or logos.
```

**i2v prompt (camera move on top of keyframe)**:
```
Camera: [single named move from camera library]. Pace: slow, [3-5 mph equivalent].
Duration: 5s, single continuous take. The [hero element] stays anchored in frame.
[Light evolution if any: e.g., "sun ray creeps 6° across hardwood"]. No cuts, no
zoom punches, no shaky-cam. Photoreal, architectural visualization quality.
```

The two prompts together produce one 5s clip. Chain 4–10 of them per cut.

---

## Camera move library

Pick exactly one per clip. Mixing two moves in 5s reads as panicked.

| Move | When to use | Pace note |
|---|---|---|
| **Drone aerial push-in** | Section 1 arrival; signature features visible from above. | Start high, descend at constant rate; never zoom. |
| **Drone aerial pull-back** | Final-statement shots, scale reveal of grounds. | Reverse of push-in; ends wide. |
| **Steadicam walkthrough** | Foyer, hallways, room-to-room flow. | Walking pace. Camera height ~5′6″. Hold steady — no head bob. |
| **Gimbal lateral glide** | Exterior facade pass, kitchen counter pass, dining table reveal. | Pure left↔right or right↔left motion. No pan. |
| **Threshold reveal** | Front door entry, bedroom-from-hall, bath-from-bedroom. | Camera approaches doorway; doorway frames the next room; cross over. |
| **Window approach** | View reveals, view-from-bed, view-from-tub. | Slow forward dolly; the view fills frame at the 3.5–4.5s mark. |
| **Vertical tilt up** | Soaring foyers, two-story windows, skylights. | Start low; tilt up to ceiling. Reveals scale. |
| **Pull-back from detail** | Architectural close-ups; "luxury detail → context" beats. | Begin tight on material; pull back to room. |
| **Slow orbit** | Great rooms, kitchen islands, focal-feature spaces. | 90–180° around a center point. Never full 360 in 5s — too fast. |
| **Crane/jib combo** | Multi-level transitions, dramatic exteriors, sweeping outdoor. | Lateral + vertical simultaneously. Use sparingly. |

Avoid: punch zoom, whip pan, handheld shake, dutch tilt. None of these read as "luxury listing."

---

## Lighting playbook

The single highest-leverage variable. Wrong light kills any clip.

### Golden hour (exterior — most exteriors)

```
Sun at 30-45° azimuth, low angle, warm 3200-3800K, long shadows raking
across [stone / stucco / wood], sky transitioning into apricot/rose. Soft
fill on shadow side from sky bounce. Atmospheric haze subtle, golden-tinted.
```

Use for: arrival, facade, gardens, outdoor entertaining, curb appeal.

### Bright indirect daylight (interior — most interiors)

```
Strong directional sunlight entering from [direction] window, but the
camera is positioned so direct rays are not in frame; what's seen is the
diffuse bounce filling the room — bright, clean, slightly cool 4500-5500K
on the lit side, warmer wood/fabric tones in shadow. North-light feel.
```

Use for: living rooms, kitchens, bathrooms, bedrooms during the "showing the space" beats.

### Twilight / blue hour (exterior — final-statement shots)

```
30 minutes after sunset. Sky is deep teal-blue, not black. Interior lights
glow warm tungsten 2700K visible through windows. Exterior accent lighting
washes the facade — uplights on architectural details, path lighting on the
walkway, pool glowing from beneath. The contrast between cool exterior sky
and warm interior windows is the entire point of the shot.
```

Use for: day-to-night transitions, final shots, vacation rental and luxury hero moments.

### Warm evening (interior — entertaining beats)

```
Interior lights fully on. Warm tungsten 2700K from ceiling fixtures and
table lamps. Exterior windows show twilight blue beyond. Candle or
fireplace if present adds 1800K accents. Cozy, inhabited, dinner-party feel.
Slight grain to suggest film stock; not over-clean.
```

Use for: dining rooms with table set, living rooms with fire, primary bedrooms with bedside lamps.

### Avoid (never pick these)

- Bright midday overhead sun — produces blown-out windows and dark interiors. Listings lose to this every day.
- Flat overcast without directional light — kills dimension; rooms look like real-estate-1.0 wide-angle horror.
- Mixed color temperatures uncorrected — interiors with both cool and warm sources unbalanced read as snapshot, not film.

---

## Room-type playbook

For each, the specific keyframe + camera move combo that works most reliably.

### Kitchen

- **Anchor frame**: island in foreground, counter material visible, sink-with-window in mid-ground, dining or outdoor view through window in background. Three planes of depth.
- **Light**: bright indirect daylight from the window above the sink. Warm bounce off wood cabinetry.
- **Move**: gimbal lateral glide along the island, ending with the window view filling frame. Or threshold reveal from the dining room into the kitchen.
- **Detail beat**: pull-back from marble veining or backsplash craftsmanship.
- **Avoid**: shooting *at* a window with sun directly behind — blows out, kills the view.

### Living / great room

- **Anchor frame**: seating arrangement in mid-ground, fireplace or focal wall as anchor, sight line through to view or adjacent room behind seating.
- **Light**: bright indirect daylight; if golden hour, light should be in patches across hardwood, not flooding.
- **Move**: slow orbit around the seating cluster, OR steadicam glide from one entry point through the room.
- **Detail beat**: vertical tilt from hearth up to vaulted ceiling.

### Primary bedroom

- **Anchor frame**: bed centered or off-axis golden-ratio, large window left or right with view, bedside reading nook hinted.
- **Light**: warm directional morning light across bedding; or warm evening with bedside lamp.
- **Move**: slow window approach from foot of bed; the view fills frame.
- **Avoid**: no people in bed unless explicitly briefed. No staged "lifestyle" props that read as fake (e.g., breakfast tray) without the user's request.

### Primary bath

- **Anchor frame**: tub or vanity as hero, large window or skylight visible, marble / tile material textured.
- **Light**: bright morning indirect; or warm evening with sconce + candle.
- **Move**: window approach toward soaking tub; or pull-back from material detail (marble, brass faucet) to full vanity.
- **Detail beat**: a single brass / chrome / matte-black fixture in close-up.

### Outdoor / pool / terrace

- **Anchor frame**: pool edge or terrace railing in foreground, primary view in background, lounge or dining setup visible.
- **Light**: golden hour or twilight. Pool lights on for twilight.
- **Move**: drone pull-back rising above pool; or lateral glide along the terrace railing.

### Exterior facade (arrival)

- **Anchor frame**: full or partial elevation, shot from 3/4 angle (not flat-on — flat-on reads as MLS snapshot).
- **Light**: golden hour. Long shadow across yard.
- **Move**: drone push-in toward the entry; or steadicam dolly along the front walk.

---

## Voiceover guidance

VO is optional. When used, follow these rules:

- **Voice**: warm, conversational, low-pressure. Not "luxury sedan ad bombast." Try ElevenLabs `eleven_multilingual_v2` with a calm female or warm male voice. Pace 130–150 words/minute, slower than ad VO.
- **Length**: 1 sentence per major section, max. A 60s reel has at most 6 VO lines totalling ~80–100 words.
- **Content**: lead with the lifestyle moment, follow with one concrete spec. Example: *"Mornings here start where the cliff meets the sky. Four bedrooms, three baths, a thousand square feet of terrace."*
- **What not to say**: never list features as a checklist. Never say "this stunning property features." Never mention dollar amounts in cinematic VO — let the listing copy carry price.
- **Silence is fine.** For high-end listings, music + ambient + on-screen address spec often outperforms VO. The fewer words, the more luxury.

---

## Music guidance

| Archetype | Style | Reference artists |
|---|---|---|
| Luxury waterfront / coastal | Ambient, minimal, spacious; ocean ambient bed under | Ólafur Arnalds, Max Richter, Nils Frahm |
| Urban modern penthouse | Sophisticated electronic, contemporary classical | Jon Hopkins, Tycho, early Trent Reznor scoring |
| Cozy family / suburban | Warm acoustic instrumental, light piano, strings | Ludovico Einaudi, Bon Iver instrumentals |
| Rustic cabin / mountain | Acoustic guitar, sparse strings, room tone | Bon Iver, Ben Howard instrumentals |
| Commercial / office | Forward-thinking instrumental, light percussion | David Darling, late Ryoji Ikeda |
| Renovation before/after | Two-part: tense minor → resolved major | Custom ElevenLabs Music with explicit two-section prompt |
| Vacation rental destination | Warm, regional flavor (tropical / Mediterranean / alpine) | Match the destination |

**Timing rule**: music enters subtly within the first 0.5s of the cut, never silence-then-add. Builds slightly toward the kitchen-view or final twilight beat. Resolves cleanly at the final frame, no hard cut.

---

## Common mistakes (refuse these patterns at prompt time)

1. **Midday harsh sun.** Produces blown-out windows + dark interiors + chalky exterior. If the user's reference is shot midday, regenerate the keyframe with golden-hour or twilight relight.
2. **Fast camera moves.** A pan in 3s reads as motion sick. Slow every move by 30%; if the model insists on speed, lower the prompt-implied velocity ("micro-dolly", "barely moves").
3. **Generic stock interiors.** This is the failure mode the reference gate exists to prevent. If the i2v output looks like it could be any apartment, the keyframe wasn't anchored to the user's photos. Regenerate with stronger reference weighting.
4. **Over-staged furniture-showroom look.** 40% breathing room per shot is the rule. Cut the throw pillow, cut the second decorative bowl. Buyers project into space, not into stuff.
5. **Invented views.** If the listing reference shows a parking lot view, the prompt does not invent an ocean. Match reality. Lying about views is the single fastest way to torch agent credibility.
6. **Logos and brand markers AI-improvised on appliances or signage.** Either match the reference exactly or omit. No "Sub-Zero-ish" fridge badge. No invented house number.
7. **People without explicit brief.** Adds risk (date the video, demographic mismatch, AI-people uncanny). Default empty-staged.

---

## Three worked examples

### Example A — 30s teaser, urban modern penthouse (9:16)

| t | Section | Keyframe | i2v move |
|---|---|---|---|
| 0–5s | Hook (skyline-from-window) | High floor, floor-to-ceiling glass, dusk skyline; interior dim with one warm lamp | Slow micro-dolly forward toward glass, slight downward tilt |
| 5–10s | Threshold | Foyer with concrete floor, warm pendant, sight line into living | Steadicam walk-through, crossing into living |
| 10–15s | Kitchen-view anchor | Island foreground, sink with skyline beyond | Lateral glide along island ending on window |
| 15–22s | Primary bedroom | Bed off-center, window-skyline right, bedside lamp warm | Slow window approach from bed |
| 22–30s | Twilight final | Pull-back from bed-window scene to wide of full unit; lights warm against blue dusk | Pull-back, music swells, address overlay fades in |

Reference set required: facade or aerial; foyer; living/kitchen; bedroom-with-skyline; one twilight exterior or window twilight shot.

### Example B — 60s reel, luxury waterfront (9:16)

7 clips. Drone aerial → driveway approach → front-door reveal → great-room view-window approach → kitchen-with-water-view lateral glide → primary-bath tub-window approach → twilight pool pull-back. VO: 4 lines, ~70 words, warm female voice, two specs total. Music: Arnalds-style ambient, ocean ambient bed under at -18 dB.

### Example C — 45s renovation before/after (9:16)

5 clips alternating before / after pairs:
1. Before: cracked tile bath, harsh fluorescent. (2s)
2. After: same angle, marble + warm sconce + skylight. (8s)
3. Before: dated kitchen, popcorn ceiling. (2s)
4. After: open-plan kitchen with island, indirect daylight, view to garden. (10s)
5. Final: full house exterior, golden hour. (8s)
Music: minor-key sparse → major-key resolved at clip 2. VO optional — owner testimonial works well here ("we couldn't believe it was the same house").

---

## Output check before render

Before composing, verify each clip against this checklist. If any answer is "no", regenerate.

- [ ] Light is golden hour, bright indirect, twilight, or warm evening — never harsh midday.
- [ ] Camera move is one named move from the library, executed slowly.
- [ ] Reference photos visibly anchored the keyframe (you can identify the property in the output).
- [ ] No invented views, brand markers, or signage.
- [ ] No people unless explicitly briefed.
- [ ] At least 3.5s of usable hold per 5s clip — no busy first/last frame.
- [ ] Color grade is consistent with neighboring clips (warm-up golden hour ~5–10%, cool down twilight ~5%).

When all clips pass, compose with cross-fade transitions (300–500ms), ducked music under VO if any, ambient layer (footsteps, soft door, distant birds for outdoor) at –24 to –30 dB.
