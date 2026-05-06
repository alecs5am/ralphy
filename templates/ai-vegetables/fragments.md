# Fragments — ai-vegetables prompt seeds

Reusable building blocks для `/ralph-art-director`. Не Mad-Libs — комбинируй per project.

## Vegetable description fragments

### Cucumber
> "Photorealistic anthropomorphic cucumber, slight humanoid proportions — 4 thin limbs sprouting organically from the body, no cartoon attachments. Texture: real cucumber skin with subtle bumps, glossy highlights, deep green color. Eyes are small black dots, slightly above center."

### Tomato
> "Photorealistic anthropomorphic tomato, soft red sphere with a small green stem-cap on top, 4 organic limbs. Texture: glossy ripe-tomato skin, subtle shadows from stem. Slight stretching when in motion to avoid uncanny stiffness."

### Carrot
> "Photorealistic anthropomorphic carrot, elongated orange body with green leafy top (like a hairstyle), 4 thin limbs from middle of carrot. Texture: real carrot grooves, slight dirt, bright orange skin."

### Potato
> "Photorealistic anthropomorphic potato, lumpy beige body, 4 short limbs, irregular shape. Texture: real potato eyes (sprouts) and slight dirt patches. Personality reads tired / world-weary через slumped posture."

### Eggplant / pepper / onion / broccoli
Аналогично — single sentence describing body + limbs + texture + facial detail (eyes only, no mouth needed для большинства scenes).

## Setting fragments

### Метро / subway
> "Moscow metro platform, mid-day, fluorescent overhead lighting, faint motion blur from approaching train, tile floor with warm yellow tones. Camera low-angle POV, 35mm equivalent, slight handheld shake."

### Kitchen
> "Modern apartment kitchen, soft window light from left, marble counter, basic dishes, neutral palette. Camera medium shot, slight tilt, depth-of-field blur on background."

### Office
> "Open-plan office, fluorescent ceiling, computer monitors blurred in background, beige carpet, generic corporate vibe. Camera shoulder-level POV facing the vegetable."

### Gym
> "Modern gym floor, mirrors on left wall, dumbbells on rack, rubber floor texture. Soft daylight from skylight. Wide shot showing vegetable looking small in the space."

### Traffic / маршрутка
> "Russian winter street, slush on asphalt, marshrutka (minibus) door closing on the left, bystanders blurred. Cold blue lighting, slight breath fog. Camera POV from sidewalk, mid-distance."

## Camera / motion fragments

- **Motion default for kling-v3.0-pro:**
  > "Subtle handheld camera shake, slight push-in (5%) over 5 seconds. Vegetable performs the action naturally — no morphing of limbs, no warping."
  
- **Action verbs допустимые:**
  walking, running, sitting, lying down, jumping, looking around, sighing (chest motion), stretching, opening door, picking up object.

- **Action verbs не допустимые** (морфит kling):
  speaking (mouth animation плохо работает на овощах — silent VO от narrator OK, но не lip-sync), complex hand gestures, fast acrobatics.

## VO fragments (RU, deadpan young Russian)

### Hook formulas (≤ 7 слов)

- "POV: ты огурец и опоздал на маршрутку"
- "Когда ты помидор и не выспался"
- "POV: ты картошка и пошёл в зал"
- "Когда ты морковка на работе"

### Body lines (короткие, по 1 на сцену)

- "Опять пробка..."
- "Зачем я сюда пришёл."
- "Ну вот опять."
- "Думал будет легче."

### Outro (если нужен)

- "Жизнь огурца..." [fade]
- "Понимаю."
- (silent — visual punchline сам)

## Negative prompt (для image / video gen)

> "no cartoon style, no Pixar stylization, no bright saturated colors, no text overlays, no watermarks, no facial features beyond eyes, no extra limbs, no morphing"

## Music prompt (ElevenLabs Music)

### Quirky upbeat (default)

> "Quirky absurd upbeat instrumental, light xylophone + plucked strings + subtle kick drum, 100 BPM, playful but not cartoon, no vocals, no lyrics."

### Melancholic deadpan

> "Melancholic indie instrumental, lo-fi piano + soft strings, 75 BPM, slightly hopeful undertone, no vocals."

### Panicked / chaotic

> "Frenetic comedic instrumental, double-time marimba + tense strings, 140 BPM, rising tension feel, no vocals."

## Caption style

- `HormoziCaptions` — default, large pop, perfect для visual-shock format.
- `TikTokCaptions` — alt, чуть меньше, для более narrative scenes.

Captions цвет — белый с чёрным outline. Не используй фирменные цвета овоща (огурец → зелёный) — теряется в фоне.
