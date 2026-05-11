# Fragments — ai-vegetables prompt seeds

Reusable building blocks for `/ralph-art-director`. Not Mad-Libs — combine fresh per project.

## Vegetable description fragments

### Cucumber
> "Photorealistic anthropomorphic cucumber, slight humanoid proportions — 4 thin limbs sprouting organically from the body, no cartoon attachments. Texture: real cucumber skin with subtle bumps, glossy highlights, deep green color. Eyes are small black dots placed slightly above center. No mouth."

### Tomato
> "Photorealistic anthropomorphic tomato, soft red sphere with a small green stem-cap on top, 4 organic limbs. Texture: glossy ripe-tomato skin, subtle shadows from the stem. Slight body squash when in motion to avoid uncanny stiffness."

### Carrot
> "Photorealistic anthropomorphic carrot, elongated orange body with a green leafy top (reads like hair), 4 thin limbs sprouting from the middle of the carrot. Texture: real carrot ridges, subtle dirt smudges, bright orange skin."

### Potato
> "Photorealistic anthropomorphic potato, lumpy beige body, 4 short limbs, irregular shape. Texture: real potato eyes (sprouts) and slight dirt patches. Personality reads tired / world-weary through slumped posture."

### Eggplant / pepper / onion / broccoli
Same recipe — one sentence describing body + limbs + texture + facial detail (eyes only; most scenes don't need a mouth).

## Setting fragments

### Subway
> "Subway platform, mid-day, fluorescent overhead lighting, faint motion blur from an approaching train, tile floor with warm yellow tones. Camera low-angle POV, 35mm equivalent, slight handheld shake."

### Kitchen
> "Modern apartment kitchen, soft window light from the left, marble counter, basic dishes, neutral palette. Camera medium shot, slight tilt, depth-of-field blur on the background."

### Office
> "Open-plan office, fluorescent ceiling, computer monitors blurred in the background, beige carpet, generic corporate vibe. Camera shoulder-level POV facing the vegetable."

### Gym
> "Modern gym floor, mirrors on the left wall, dumbbells on a rack, rubber floor texture. Soft daylight from a skylight. Wide shot showing the vegetable looking small in the space."

### Street / traffic
> "City sidewalk in winter, slush on asphalt, a bus door closing on the left, bystanders blurred. Cold blue lighting, slight breath fog. Camera POV from the sidewalk, mid-distance."

### Cafe / queue
> "Coffee shop counter from a customer's POV, espresso machine steam, warm tungsten lighting, line of blurred patrons behind. Camera waist-level looking up slightly at the menu."

## Camera / motion fragments

- **Default motion for kling-v3.0-pro:**
  > "Subtle handheld camera shake, slight push-in (5%) over 5 seconds. Vegetable performs the action naturally — no morphing of limbs, no warping."

- **Allowed action verbs** (clean kling output):
  walking, running, sitting, lying down, jumping, looking around, sighing (chest motion), stretching, opening a door, picking up an object.

- **Forbidden action verbs** (kling distorts these):
  speaking with mouth movement (lip-sync on a vegetable looks broken — keep VO as off-screen narrator), complex hand gestures, fast acrobatics.

## VO fragments

The format is language-agnostic visually, so VO can be in any language. Below: English defaults + Russian variants (the Russian deadpan delivery is famously strong for this format — keep it as an option).

### Hook formulas (≤ 7 words, deadpan)

**English:**
- "POV: you're a cucumber and you're late."
- "When you're a tomato and you didn't sleep."
- "POV: you're a potato at the gym."
- "When you're a carrot at work."

**Russian (alt):** translate the same hook formulas — short deadpan one-liners (≤7 words) like "POV: you're a cucumber and you missed the bus.", "When you're a tomato and didn't sleep.", "POV: you're a potato at the gym.", "When you're a carrot at work." (translate to Russian when generating).

### Body lines (one short line per scene)

**English:**
- "Traffic again..."
- "Why am I even here."
- "Of course."
- "Thought this would be easier."

**Russian:** translate the same body-line beats — short deadpan single-line reactions like "Traffic again...", "Why did I even come here.", "Here we go again.", "Thought it would be easier." (translate to Russian when generating).

### Outro (optional)

- "Cucumber life..." [fade]
- "I get it."
- (silent — let the visual punchline carry it)

## Negative prompt (for image / video generation)

> "no cartoon style, no Pixar stylization, no oversaturated colors, no text overlays, no watermarks, no facial features beyond small dot eyes, no extra limbs, no morphing, no surreal background distortion."

## Music prompt (ElevenLabs Music)

### Quirky upbeat (default)

> "Quirky absurd upbeat instrumental, light xylophone + plucked strings + subtle kick drum, 100 BPM, playful but not cartoon, no vocals, no lyrics."

### Melancholic deadpan

> "Melancholic indie instrumental, lo-fi piano + soft strings, 75 BPM, slightly hopeful undertone, no vocals."

### Panicked / chaotic

> "Frenetic comedic instrumental, double-time marimba + tense strings, 140 BPM, rising tension feel, no vocals."

## Caption style

- `HormoziCaptions` — default. Large pop, white fill with black outline. Reads cleanly over photorealistic vegetable backgrounds.
- `TikTokCaptions` — alt. Slightly smaller, less aggressive, better for narrative scenes.

Caption color stays white with a black outline. Don't use the vegetable's signature color (green for cucumber, red for tomato) — it gets lost against the subject.
