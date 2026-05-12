# Fragments — ai-drama prompt seeds

Reusable building blocks for `/ralph-art-director`. Not Mad-Libs — combine fresh per project. Every Veo prompt MUST include the **No-music clause** verbatim (see bottom).

## Character lock-string fragments

### Fruit cast

**Banana (default protagonist husband)**
> "a Pixar-3D cartoon banana-headed man, smooth glossy yellow banana peel head with brown ripe spots, friendly round black eyes, small mouth, wearing a slightly rumpled white office shirt with rolled sleeves and a loose navy tie, beige trousers, mid-30s nervous family-man vibe"

**Strawberry (default partner wife)**
> "a Pixar-3D cartoon strawberry-headed woman, glossy red strawberry head with tiny yellow seeds, two small green leaves on top like a hair-bow, big trusting brown eyes with long lashes, soft pink cheeks, wearing a pastel cream apron over a sky-blue summer dress, gentle motherly posture"

**Cherry (default antagonist / "the other woman")**
> "a Pixar-3D cartoon woman with one single glossy bright red cherry as her head, long curled green stem on top, sharp confident half-lidded green eyes, deep red glossy lips, wearing a fitted black blazer with a low-cut white blouse, red pencil skirt, gold pendant, predatory warm smile"

**Carrot (default rebound / cool new guy)**
> "a Pixar-3D cartoon orange carrot-headed man, smooth tapered bright orange carrot head with three tall green leaves on top like a fauxhawk, chiseled jawline, blue aviator sunglasses, brown leather biker jacket, white t-shirt, confident relaxed swagger, late-30s bad-boy-with-heart"

**Kiwi**
> "a Pixar-3D cartoon kiwi-headed man, fuzzy brown kiwi-fruit head sliced flat in front to show green flesh with black seed pattern as the face, small dark eyes, soft expression, wearing a casual flannel shirt and jeans, easy-going late-30s vibe"

**Orange**
> "a Pixar-3D cartoon orange-headed woman, glossy bright orange citrus head with a tiny green stem on top, big bright eyes with eyeliner, glossy peach lips, wearing a flowing yellow sundress, sunny optimistic posture"

### Vegetable cast (when paired with fruit cast)

**Tomato**
> "a Pixar-3D cartoon tomato-headed man, glossy red tomato body with a green leafy stem-cap on top, kind round eyes with thick eyebrows, wearing a green flannel shirt and brown corduroy pants, gentle giant late-40s neighbor vibe"

**Broccoli**
> "a Pixar-3D cartoon broccoli-headed kid, deep green tree-shaped broccoli head with curly florets, big curious eyes, wearing a yellow raincoat and red rubber boots, small backpack, 8-year-old kid-energy"

### Object cast (less common, more surreal)

**Lamp**
> "a Pixar-3D cartoon woman whose head is a vintage brass desk-lamp with a green glass shade, the bulb glowing softly as one eye, the pull-chain hanging like an earring, wearing a librarian's grey cardigan, soft-spoken late-50s vibe"

**Coffee mug**
> "a Pixar-3D cartoon man whose head is a chunky white ceramic coffee mug with steam rising, the handle like one ear, painted face on the side (eyes and a small mouth), wearing a flannel shirt and apron, café-owner mid-40s vibe"

### Animal cast (Pixar-soft, not photoreal)

**Kitten**
> "a Pixar-3D cartoon kitten with soft grey fur and white paws, big anime-style green eyes, tiny pink nose, wearing a red bowtie and a knitted sweater, kitten-anatomy with humanoid posture, curious 6-month-old kitten energy"

**Duckling**
> "a Pixar-3D cartoon duckling with fluffy yellow down, big black eyes, orange bill, wearing a tiny tweed cap and round wire-frame glasses, scholarly young-academic vibe, humanoid posture"

## Setting fragments

### Suburban home interior

**Sunny kitchen morning**
> "Sunny pastel-warm kitchen, plants on the windowsill, breakfast table with cereal and orange juice, family photo on the wall. Warm morning sun through window, golden bloom, soft handheld camera breath."

**Living room confrontation**
> "Dim living room at night, single overhead pendant lamp creating a dramatic island of light, the rest of the room nearly black. Harsh single source, deep shadows."

**Home entryway**
> "Home entryway at night, warm hallway lamp glow, family photo on the wall, coat rack with one missing coat. Warm key + cool blue moonlight from window outside."

**Front yard at dusk**
> "Suburban front yard at dusk, autumn leaves blowing across the path, picket fence in background. Cold blue dusk palette, long-lens cinematic shot."

### Workplace settings

**Sleek corporate office**
> "Sleek modern corner office with floor-to-ceiling glass walls, city skyline at golden hour, leather chair, glass desk with personal touches. Warm rim light from window, slight red color cast, deep ambient shadows."

**Open-plan office floor**
> "Open-plan office with rows of glass-partitioned desks, fluorescent overhead, monitors blurred in background, plants on windowsills. Cool-toned even lighting, depth-of-field blur."

### Outdoor

**Park golden hour**
> "Sunny park at golden hour, wooden bench beside a calm pond with two ducks, lush green willow trees in the soft bokeh background. Warm sun, lens flare, hopeful Pixar tone."

**Rainy sidewalk**
> "City sidewalk at night, rain falling, neon signs reflecting in puddles, umbrella in the foreground. Cool blue + neon palette, melancholic."

### Romantic / intimate

**Boss's office at night**
> "Same corner office, blinds half-closed, evening, city lights twinkling outside. Warm desk-lamp glow, single red practical light off-frame, deep shadows, shallow depth of field."

## Camera / motion fragments

### Default per scene type

| Scene type | Camera direction |
|---|---|
| Hook / establishing | "Static medium two-shot, slight handheld breath" |
| Seduction / temptation | "Slow push-in on the antagonist as they speak, rack focus to the protagonist's reaction" |
| Discovery moment | "Static medium two-shot, slow push-in on the discoverer's face as expression hardens" |
| Confrontation peak | "Low angle on the accused (makes them look small), the accuser towers above" |
| Departure | "Long-lens tracking shot from behind the departing character; the begging character shrinks in the background" |
| Resolution / outro | "Wide cinematic two-shot, slow dolly-in, warm bokeh" |

### Allowed action verbs (clean Veo output)

walking, kissing on cheek, waving, beckoning with one finger, leaning in, pointing at the screen of a phone, kneeling, running with arms outstretched, sitting on a bench, offering a flower, looking up surprised, blushing, wiping a tear.

### Forbidden action verbs (Veo struggles)

full-body fast acrobatics, complex hand gestures with multiple finger movements, eating (mouth-shape conflicts with lip-sync), driving a vehicle (Veo loses the steering wheel between frames).

## Dialogue style notes

- **Length:** 1-2 sentences per character per scene, ≤ 14 words total per speaker per clip. Veo will pace the words to fill 8s with appropriate beats.
- **Emotional clarity:** name the emotion in the prompt's voice-timbre clause ("warm motherly tone", "sultry seductive purr", "voice cracking with anger and heartbreak"). Veo picks up on these and adjusts delivery.
- **Speaker count per clip:** prefer ONE speaker per Veo clip. Two-speaker clips work but you have to be explicit about the turn-taking — Veo can drop the second speaker entirely if the prompt is vague.
- **Punctuation marks dialogue beats:** commas = small pause, periods = breath, exclamation = emphasis. Veo respects standard English punctuation. For Russian / other languages it's less precise.

### Example dialogue beat pairs (per plot trope)

**Affair trope (scene-by-scene)**

| Sc | Speaker | Line (EN) |
|---|---|---|
| 1 | partner-wife | "Have a great day at work, my sweet banana." |
| 1 | protagonist-husband | "I'll be home for dinner, my little strawberry." |
| 2 | antagonist-boss | "Come closer, banana. Stay with me after work tonight. Nobody has to know." |
| 3 | antagonist-boss | "You're so sweet, banana. So much sweeter than that little strawberry at home." |
| 4 | partner-wife | "What's that on your cheek, my love? That's not my lipstick." |
| 5 | partner-wife | "Ten years, banana! Ten years — and you throw it all away for that pit in a red skirt?!" |
| 6 | protagonist-husband | "Strawberry, wait! Forgive me, please! I was a fool!" |
| 7 | rebound | "Hey there, strawberry. Name's Carrot. You're way too sweet to be crying alone." |

**Found family trope (scene-by-scene)**

| Sc | Speaker | Line (EN) |
|---|---|---|
| 1 | parent-character | "I'm going out for a while. Watch the kids, please. Don't worry, I'll be quick." |
| 2 | sibling-kid | "Mommy! You came back already!" / "Hi! Come on in, let's have fun!" |
| 3 | parent-character | "What is this?! Who is this?!" |
| 4 | parent-character | "I deserve better than this. I deserve so much better than him." |
| 5 | parent-character | (turns to stranger) "Why are you all alone out here?" |
| 6 | stranger | "I don't have a home..." |
| 7 | parent-character | "Oh sweetie. Come live with us. You can be part of our family." |

## The No-music clause (verbatim — paste into every Veo prompt)

> **Audio direction: only the character's spoken dialogue and minimal natural room tone appropriate to the setting. No background music. No instrumental soundtrack. No score. No swelling strings, no piano underscore, no orchestral bed. Strict diegetic audio only — only sounds that exist physically in the scene (footsteps, door, traffic if outdoors). Silence between lines.**

Why this exact wording works:

1. **"Only the character's spoken dialogue"** — primary positive instruction. Tells Veo the audio priority.
2. **"Minimal natural room tone"** — gives Veo a permission for *appropriate* ambient (kitchen-hum, distant traffic) so it doesn't over-correct and produce silence + lip-sync mismatch.
3. **"No background music" + "No instrumental soundtrack" + "No score"** — redundant on purpose. Three different words for the same thing because Veo will skip the no-music order if you only use one word.
4. **"No swelling strings, no piano underscore, no orchestral bed"** — names the *specific* default scores Veo loves to generate. Removes them by name.
5. **"Strict diegetic audio only"** — film-school term Veo's training corpus recognizes. Powerful single phrase.
6. **"Silence between lines"** — explicit. Otherwise Veo fills pauses with score.

### What happens if you omit the clause

- Scene 1: cheerful piano underscore
- Scene 2: dramatic strings entrance for the antagonist
- Scene 3: sultry sax for the seduction
- Scene 4: low ominous drone for the discovery
- Scene 5: full orchestral hit for the confrontation
- Scene 6: melancholic piano
- Scene 7: hopeful glockenspiel + warm strings

Seven different uncoordinated scores. Audible musical jump-cuts every 8 seconds. Format ruined.

### What if you DO want a coordinated music bed

Then **switch templates**. This one is "Veo audio is the score." If you want a unified ElevenLabs Music bed, you have to:
1. Strip out Veo audio entirely (use `kwaivgi/kling-v3.0-pro` for silent visuals)
2. Generate VO separately via ElevenLabs (which means external lip-sync — different model needed, e.g. `fal-ai/sync-lipsync`, but FAL is out-of-stack per AGENTS.md invariant 1)
3. Generate ElevenLabs music bed
4. Mix dialogue + ducked music

That's a fundamentally different pipeline. Not this template. Use `soviet-nostalgic` or `ai-vegetables` if you need it.

## Caption style

Always `PopWordCaptions` for this template:

- `fontFamily`: TheBoldFont (loaded from `public/fonts/TheBoldFont.ttf`)
- `fontSize`: 140 (1080-width canvas)
- `bottomOffset`: 360 (sits above TikTok engagement column at y≈1420)
- `color`: white
- Stroke: 4px black + drop shadow
- Pop-in: spring from scale 0.55 → 1.0 over ~0.3s

Don't switch to `HormoziCaptions` for this template — the multi-word page grouping breaks the per-word emotional punctuation that the format is built around.

## Negative prompt (for image / video generation)

> "text, watermark, captions, subtitles, letters, photorealistic humans, anime, dark horror, glitch, distorted limbs, extra limbs, morphing faces, mouth-shape conflicts."
