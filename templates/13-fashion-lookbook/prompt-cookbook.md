# Fashion lookbook — prompt cookbook

How to write Gemini-3-Pro keyframe prompts and Kling-v3.0-Pro motion prompts for fashion lookbook video. Source of truth for the `/ralph-art-director` role when working in this template.

---

## Master prompt template

Use this skeleton for every fashion-lookbook prompt. Fill all eight blocks. Empty blocks → flat output.

```
[FORMAT]
Duration: <15 / 25 / 30>s | Aspect: 9:16 (mobile) | 1080×1920 | 30fps

[2-SECOND HOOK]
Hook: <hook id from hooks.md, e.g. mirror-reveal | power-walk | fabric-macro>
First-frame: <what the camera sees at t=0>

[GARMENT]
Piece(s): <name, color, silhouette, length, fit>
Fabric: <silk / denim / leather / chiffon / knit / velvet / sequins / lace / technical / fur>
Fabric behavior: <how it moves — "ripples and catches light", "creases at elbows and waist", "floats with each step">
Styling: <accessories, shoes, hair, makeup, jewelry — minimum viable list>

[MODEL DIRECTION]
Walk / pose: <power-walk / slow-sway / strut / catwalk / casual-amble / 360-spin / static-profile>
Attitude: <confidence / sensuality / playfulness / grace / edginess / approachability / rebelliousness>
Expression: <strong-gaze / subtle-smile / smoldering / blank-slate / contemplative / side-eye>
Hands: <relaxed-at-sides / in-pockets / through-hair / adjusting-garment / on-hips / overhead>

[ENVIRONMENT]
Location: <studio-white-cyc / urban-street / rooftop / garden / beach / industrial / gallery / hotel-lobby / desert / water>
Background: <dominant texture, color, depth-of-field>
Props (optional): <mirror / curtain / pedestal / bench / stairs / ONE thing max — usually none>

[LIGHTING]
Style: <golden-hour / studio-flash / bright-daylight / neon-night / soft-window / dramatic-backlight / gel-color>
Direction: <key-from-left, fill-from-right, backlight-rim>
Color temp: <warm-amber / neutral-daylight / cool-blue / mixed-practical>

[MOTION SEQUENCE]
0-2s: <hook action>
2-Xs: <primary movement — walk, sway, rotation>
X-Ys: <detail beat — accessory cut, fabric macro, hand gesture>
Y-Zs: <finale — held pose, exit, brand reveal>

[CAMERA & TRANSITIONS]
Camera: <static / slow-pull-back / orbit / track-with / push-in>
Cuts: <single-take / cut-every-3-5s / flash-cut-on-beat>
Effects: <slow-mo-on-spin / wind / NONE>

[AUDIO MOOD] (drives ElevenLabs Music prompt)
Mood: <cinematic-orchestral / hip-hop / indie / pop-dance / lo-fi / electronic / acoustic / retro>
BPM: <40-60 meditative / 80-100 editorial / 100-120 energetic / 120+ rapid>
```

---

## Model-direction vocabulary

The single biggest lever in a fashion video. "Confident strut" and "uncertain walk" produce two different videos from the same keyframes.

### Walks

| Type | Description | Best for |
|---|---|---|
| **Power-walk** | Confident, direct stride, shoulders back, purposeful | Streetwear, formal, athleisure |
| **Slow sway** | Side-to-side fluid motion, sensual, relaxed | Evening, romantic, swimwear |
| **Strut** | Attitude-forward, swagger, exaggerated confidence, head high | Streetwear, contemporary |
| **Catwalk** | Heel-to-toe, dramatic, deliberate, runway-style | Haute couture, evening |
| **Casual amble** | Natural gait, relaxed, approachable | Casual, everyday, sustainable |
| **Float / glide** | Ethereal, effortless, minimal visible effort | Bridal, dreamy, luxury |
| **Stomp** | Heavy, confident footfalls, attitude | Streetwear, edgy, boots-focused |

### Poses

- Standing profile (shows silhouette + drape)
- Three-quarter turn (front + side simultaneously)
- Hands on hips (powerful, statement)
- Hands in pockets (casual, approachable)
- Over-shoulder glance (mysterious, editorial)
- Full rotation / spin (showcases all angles)
- Lean / recline (relaxed, sensual, languid)

### Expressions

- Strong gaze (direct lens contact, intensity)
- Subtle smile (warm, relatable)
- Smoldering (sensual, editorial)
- Blank slate (high-fashion, lets garment speak)
- Genuine laugh (authentic joy, kids / casual)
- Contemplative (thoughtful, moody)
- Side-eye / attitude (streetwear, rebellious)

### Attitudes

Confidence — Sensuality — Playfulness — Grace — Edginess — Approachability — Rebelliousness — Contemplative

**Pick one.** Mixing attitudes muddles the read.

---

## Location × lighting matrix

Picking these together is the single most reliable way to make a lookbook feel "expensive." Rows are locations; columns are lighting choices that work in that location.

| Location | Default lighting | Alt lighting | Mood |
|---|---|---|---|
| **Studio white cyc** | Studio flash key+fill | Soft box diffused | Editorial luxury, accessories, haute couture |
| **Urban street** | Bright daylight | Neon night, practical streetlight | Streetwear, contemporary |
| **Rooftop** | Golden hour | Neon night with skyline | Aspirational urban, luxury |
| **Lush garden** | Golden hour | Bright daylight with dappled shadow | Sustainable, romantic, cottagecore |
| **Beach / ocean** | Golden hour | Bright daylight, midday | Swimwear, summer, casual |
| **Industrial warehouse** | Dramatic backlight | Practical sodium / neon | Edgy, contemporary, alternative |
| **Gallery / art space** | Soft diffused gallery light | Spotlit pieces | Editorial, art-forward, minimalist |
| **Hotel lobby** | Mixed practical (chandeliers + window) | Soft warm tungsten | Luxury, formal, evening |
| **Desert / landscape** | Golden hour, low sun | Harsh midday for drama | Luxury campaign, surreal, cinematic |
| **Water / reflective** | Soft window light | Backlit (sun behind subject) | Editorial, artistic, contemplative |

**Rules.**
- Never mix lighting types within a single 15s clip. Pick golden-hour OR neon, never both.
- Always specify lighting direction (key-from-left, backlight-rim) — Kling defaults to flat lighting otherwise.
- Color temperature must match location vibe. A warm-amber studio shot reads "golden-hour-fake" and looks cheap.

---

## Styling beats — minimum viable per category

Don't over-style. Each piece you add to the model is one more thing the AI can hallucinate.

| Category | Garment | Hair | Makeup | Jewelry | Footwear |
|---|---|---|---|---|---|
| Haute couture | Statement gown / suit | Sleek bun or polished waves | Editorial — strong eye OR strong lip, not both | Single statement piece | Heels matched to gown tone |
| Streetwear | Hoodie + cargo + sneaker | Casual half-up or natural | Dewy / natural | Layered chains | Pristine sneakers |
| Athleisure | Set / leggings + crop | Slick high pony | Flushed / sport-no-makeup | None | Performance trainers |
| Formal | Tailored suit / structured dress | Polished low pony or sleek | Polished neutral | Watch + studs | Pointed-toe heels / oxfords |
| Casual | Jeans + tee + jacket | Loose natural | Barely-there | Single small piece | Sneakers / flats |
| Swimwear | Cut / coverage + cover-up | Wet-look or beach waves | Glowing skin, no eye | Anklet / shell necklace | Bare feet |
| Accessories | Neutral black base outfit | Sleek | Polished neutral | THE ACCESSORY (the focus) | Match to accessory tone |
| Sustainable | Hand-woven natural fibers | Loose, unstyled | Bare-skin clean | Single artisanal piece | Canvas / undyed leather |
| Vintage | Era-correct silhouette | Era-correct hair | Era-correct makeup | Era-correct stack | Era-correct shoe |
| Evening / party | Sequins / silk / dramatic cut | Hollywood waves or sleek | Strong eye AND strong lip | Layered statement | Heels |

---

## Common mistakes & fixes

### 1. Static model, no fabric movement

**Symptom.** Output looks like a still photo — model stands, fabric hangs, nothing breathes.

**Fix.** Always specify a primary motion: "model walks toward camera at moderate pace, dress sways with each step" or "model rotates 270° clockwise, train trails behind catching light." Kling rewards explicit motion verbs.

### 2. Lighting unspecified → flat

**Symptom.** Output is evenly lit, no shadows, no dimension. Reads cheap.

**Fix.** Specify direction ("key from left at 45°, fill softly from right, subtle backlight rim") AND mood (golden-hour / studio-flash / neon). Without direction, Kling collapses to overhead daylight.

### 3. Mixed lighting within one clip

**Symptom.** Cuts feel disjointed — golden hour into neon into studio. Color temp jumps.

**Fix.** One lighting setup per clip. If you need a tonal shift, gate it on a transition (light-shift transition is its own beat — see hooks.md #10 alt).

### 4. Over-styled — accessory soup

**Symptom.** Model wears 3 necklaces, 2 bags, sunglasses, watch, scarf, belt. Frame reads chaotic.

**Fix.** Cut to minimum viable from the styling table. The garment is the hero, accessories are evidence — not the cast.

### 5. Hook conflict with category

**Symptom.** Curtain reveal hook on athleisure, or power-walk hook on haute couture. Reads wrong.

**Fix.** Cross-reference `hooks.md` "best for / avoid for." Curtain → couture / evening. Power-walk → streetwear / formal. Mirror → editorial / formal.

### 6. Generic location ("a city street", "outdoors")

**Symptom.** Output environment is generic stock-photo background.

**Fix.** Specify materials, time of day, weather: "narrow brick alley with damp pavement reflecting overhead string-lights, dusk, light rain" beats "a city street."

### 7. Brand named without reference

**Symptom.** "Make a Prada-style coat lookbook." Output is AI-imagined coat that doesn't match any real Prada piece. Reads fake.

**Fix.** Refuse per AGENTS.md hard rule #3. Either user provides a reference, or the brief becomes generic ("a black double-breasted trench coat in archive minimalist style").

### 8. Voiceover stuffed in

**Symptom.** Brief asks for VO; AD writes 3 sentences of brand-speak; reel feels overloaded.

**Fix.** Lookbook default = no VO. If VO is requested, max 1-2 short sentences, calm editorial delivery, placed at the brand-reveal beat (final 3-4s), never over a fast-cut sequence.

---

## Worked examples

### Example 1 — single look, 15s, streetwear, urban

**Brief.** "Show off this oversized hoodie + cargo combo, streetwear vibe, vertical for TikTok."

**Prompt blocks (abbreviated).**

```
[FORMAT] 15s | 9:16 | 1080×1920 | 30fps

[HOOK] power-walk-at-camera. First frame: model mid-stride, full body, brick alley behind, 
camera at chest height tilted up 10°.

[GARMENT] Oversized charcoal hoodie (mid-thigh length, kangaroo pocket, slightly cropped 
ribbed hem), black cargo trousers (relaxed leg, cuffed at ankle), white low-top canvas 
sneakers. Fabric: heavyweight cotton fleece. Behavior: hoodie hem swings with each step, 
drawstrings sway. Styling: navy cap, single thin gold chain, black crossbody bag.

[MODEL DIRECTION] Walk: power-walk, fast pace. Attitude: confident, slight edge. 
Expression: subtle smirk, direct gaze. Hands: one in front pocket, one swinging naturally.

[ENVIRONMENT] Urban brick alley, faded graffiti far background, wet pavement reflecting 
ambient light, shallow depth-of-field.

[LIGHTING] Bright overcast daylight, soft shadow definition, neutral color temp, no harsh contrast.

[MOTION SEQUENCE]
0-2s: Power-walk approach, model dominates frame by 1.5s.
2-7s: Pass camera, three-quarter turn back toward lens, hand adjusts cap.
7-12s: Cut to medium — hand-on-bag detail, fabric texture macro on hoodie sleeve, 
       cut back to full body in profile.
12-15s: Hold confident pose, hands in pockets, slow zoom-out, brand text fades in 
        last 2s.

[CAMERA] Handheld feel, single take 0-7s, cut at 7s, locked frame 7-15s.

[AUDIO] Hip-hop, 100 BPM, groove-forward, beat drops align with cuts at 7s and 12s.
```

### Example 2 — three looks, 15s, capsule collection (mixed)

**Brief.** "Three-piece spring capsule, white cyc studio, fast-cut lookbook reel."

**Sequence.**

- 0-2s: HOOK = fabric-macro pull-back on Look 1's silk shoulder. Reveals model in cream silk dress at 2s.
- 2-6s: Look 1 (silk dress) — slow rotation, fabric ripples, golden-hour-toned studio light.
- 6-7s: TRANSITION = spin-cut. Model spins, mid-spin flash-cut.
- 7-11s: Look 2 (knit set) — power-walk + texture macro on knit ribbing.
- 11-12s: TRANSITION = light-shift cut (warm → cool).
- 12-15s: Look 3 (signature trench) — final pose, hands in pockets, brand card fades in.

**Lighting.** Studio flash throughout (key-left, fill-right). Color temp shift at 11-12s carries the look-2-to-look-3 transition.

**Audio.** Indie-electronic, 110 BPM, beat drops at 2s, 7s, 12s aligned with hook end and transitions.

### Example 3 — single look, 25s, sustainable, garden

**Brief.** "Hand-woven linen dress, sustainable brand campaign, golden hour garden, 16:9 for YouTube."

**Sequence.**

- 0-3s: HOOK = fabric-macro on hand-woven linen weave. Pull back to reveal artisan's hands, then cut to model in garden.
- 3-12s: Look beat — model walks slow garden path, hand reaches toward flowers, fabric catches dappled sun, 270° rotation showing dress drape.
- 12-14s: Transition — model pauses by wooden bench, sits, hand touches grass.
- 14-22s: Detail beat — fabric texture macro, hand-and-flower interaction, model's content expression.
- 22-25s: Wide pull-back, model walking away into garden depth, brand card "Hand-Woven. Hand-Made." fades in last 2s.

**Lighting.** Golden hour throughout, warm amber temp, dappled shadow from foliage.

**Audio.** Acoustic / folk, 90 BPM, single guitar lead, no percussion, resolves to natural garden sounds in last 3s.

### Example 4 — accessory focus, 18s, luxury

**Brief.** "Cognac leather handbag launch, luxury campaign, hotel lobby."

**Sequence.**

- 0-2s: HOOK = macro on handbag leather grain + hand-stitching. Pull back to over-shoulder of model.
- 2-6s: Model walks luxury hotel lobby, low-angle camera emphasizes heel and bag swing.
- 6-9s: Detail cuts — ringed hand on bag clasp, wrist with watch + cuff, sunglasses lift to reveal eyes.
- 9-14s: Slow rotation, bag visible from front / side / back, jewelry catches chandelier light.
- 14-17s: Static pose, full accessory ensemble visible, camera holds.
- 17-18s: Hold + brand card fade.

**Lighting.** Mixed practical — chandeliers warm, window cool fill. Studio-style key on bag during macro.

**Audio.** Sophisticated jazz / contemporary classical, 85 BPM, smooth elegant.

---

## CLI cookbook (bridge to ralphy)

```bash
# Apply this template to a new project
ralphy template use 13-fashion-lookbook --project <project-id>

# After uploading the garment reference:
ralphy project log-asset <project-id> --path workspace/projects/<project-id>/assets/uploaded/<garment>.jpg \
  --kind reference --note "primary garment reference"

# Generate keyframes (one per look + one per transition anchor)
ralphy generate image --project <project-id> --scene scene-01 --model gemini-3-pro-image-preview \
  --reference workspace/projects/<project-id>/assets/uploaded/<garment>.jpg

# Generate motion clips
ralphy generate video --project <project-id> --scene scene-01 --model kling-v3.0-pro \
  --duration 5 --keyframe workspace/projects/<project-id>/assets/keyframes/scene-01.png \
  --no-audio

# Generate music (single track, BPM aligned to your cut plan)
ralphy generate music --project <project-id> --duration 15 --mood "cinematic-orchestral, 60 BPM"

# Render
ralphy render <project-id>
```

Always check `MODELS.md` before locking model IDs — Claude's training is stale.
