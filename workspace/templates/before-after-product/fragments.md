# Fragments — before-after-product

## Pain point visual fragments (per category)

### Cosmetics
> "Close-up shot of a person's face / hair / nails showing the specific cosmetic problem (dry skin patch, frizzy hair, chipped polish). Soft natural light, slight unflattering angle to amplify the issue. Camera medium close-up, slightly handheld."

### Food
> "Close-up of unfortunate food situation — broken egg yolk on shell, soggy cereal, bland-looking dish. Kitchen environment, harsh fluorescent or dim lighting. Camera angled to show the disappointment."

### Software / SaaS
> "Person at laptop, frustrated expression, screen visible (blurred screenshot of the problem — too many tabs / cluttered UI / error message). Late-evening lighting, cluttered desk. Eye-level shoulder shot."

### Fitness
> "Person on bed / couch in workout clothes, looking tired / hopeless. Phone showing fitness app on the floor. Soft morning light, slightly cold tones."

### Household (cleaning, kitchenware, etc)
> "Specific household frustration in action — crumbs that won't sweep up, lid that won't stay closed, towel that's stiff. Hands in frame, mid-action. Domestic environment."

### Fashion
> "Person in front of mirror, looking down at clothing item that's wrong (loose seam, too-tight fit, weird drape). Bedroom or fitting-room environment."

## "Pain reinforcement" beat fragments

Pattern: 1-2 micro-failures piled on the original pain.

> "Tries one fix → doesn't work. Tries another → also doesn't work. Slumps."

Generate 1-2 sec sub-clip per micro-failure.

## Product reveal fragments

### Gradual reveal (default)
> "Product appears organically in scene — hand picks it up from counter / table / shelf / bag. Product is foregrounded, in clear focus, AS PER THE PROVIDED REFERENCE IMAGE (no AI-improvised packaging or logo). 1.5-2 second beat to register."

### Dramatic reveal (smash-cut)
> "Hard cut from frustrated face to product close-up centered in frame. Full product shot. AS PER THE PROVIDED REFERENCE IMAGE. 1 second beat."

**Critical:** Always pass user-supplied product reference в `--ref` для reveal frame. Не позволяй gemini генерировать "своё" packaging — это галлюцинирует лого.

## Demo fragments

### Transformation shot (cosmetics, fashion, fitness)
> "Same subject, same setting, after using product. Same lighting + angle as the 'before' shot for direct comparison. Product visible somewhere in frame (table, hand)."

### Functional demo (software, household)
> "Product / tool in action, mid-task. Hands or person interacting with it. Clean, satisfying motion. Product reference in frame as anchor."

### Reaction shot (any category)
> "Subject's face — satisfied / pleased / relieved expression. Same character as the 'before' shots. Eye contact with camera, slight smile or eyebrow raise."

## VO fragments

### Pain hook (≤ 7 слов, frustrated tone)

- "Опять ничего не работает."
- "Сколько можно вот это терпеть."
- "Я сдалась с этими <X>."
- "Каждый раз одно и то же."

### Reveal (≤ 5 слов, neutral tone)

- "Подруга посоветовала <X>."
- "Случайно увидела <X>."
- "Решила попробовать."
- "Вот это."

### Demo / proof (по 1 line на beat, growing satisfaction)

- "Первый день — нормально."
- "Через неделю — заметно."
- "Через месяц — забыла что это была проблема."
- "Не верится что я раньше без него."

### Outro / CTA

- "Линк в био."
- "Если у тебя такое же — попробуй."
- "<Product name>." (silent reveal)

## Tonal arc

VO `voice_settings`:
- **Pain section (0-5s):** stability 0.45 (slightly variable), style 0.30 (more emotional)
- **Reveal + demo (5-15s):** stability 0.60 (calmer), style 0.20 (less emotional, more confident)

Если ElevenLabs выдаёт slightly уверенный tone в "pain" — regen с lower stability.

## Music fragments (two beats)

### Before (0-5s) — tense
> "Tense ambient instrumental, slight dissonance, low strings, 60 BPM, anxious undertone, no vocals, no melody hooks."

### After (5-15s) — uplifting
> "Uplifting indie instrumental, light acoustic guitar + soft piano, 90 BPM, optimistic but not over-the-top, no vocals."

Cross-fade на reveal frame (frame 150 @ 30fps for 5s split).

## Caption style split

- **Before section:** `HormoziCaptions` — large pop, white + black outline. Conveys frustration / impact.
- **After section:** `MinimalCaptions` или `KaraokeCaptions` — calmer, less aggressive. Conveys relief / confidence.

Switch at frame 150 (5s mark).

## Negative prompt

> "no fake brand, no logo distortion, no unauthorized brand modification, no AI-improvised packaging, no text overlays in source frame, no plastic skin, no model-look, no studio lighting"

## Reference-required prompts

Когда есть user-supplied reference:
> "Product appears AS PER THE PROVIDED REFERENCE IMAGE — exact packaging, exact logo, exact color. Do NOT improvise branding."

Передай URL в `--ref` для всех frames where product visible.
