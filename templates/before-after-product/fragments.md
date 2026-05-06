# Fragments — before-after-product

Reusable building blocks for `/ralph-art-director`. Combine fresh per project; don't paste verbatim.

## Pain point visual fragments (per category)

### Cosmetics
> "Close-up of a person's face / hair / nails showing the specific cosmetic problem (dry skin patch, frizzy hair, chipped polish). Soft natural light, slight unflattering angle to amplify the issue. Camera medium close-up, slightly handheld."

### Food
> "Close-up of an unfortunate food situation — broken egg yolk on the shell, soggy cereal, bland-looking dish. Kitchen environment, harsh fluorescent or dim lighting. Camera angled to show the disappointment."

### Software / SaaS
> "Person at a laptop, frustrated expression, screen visible (blurred screenshot of the problem — too many tabs / cluttered UI / error message). Late-evening lighting, cluttered desk. Eye-level shoulder shot."

### Fitness
> "Person on a bed / couch in workout clothes, looking tired and hopeless. Phone showing a fitness app on the floor. Soft morning light, slightly cold tones."

### Household (cleaning, kitchenware, etc.)
> "Specific household frustration in action — crumbs that won't sweep up, a lid that won't stay closed, a towel that's stiff. Hands in frame, mid-action. Domestic environment."

### Fashion
> "Person in front of a mirror, looking down at the clothing item that's wrong (loose seam, too-tight fit, weird drape). Bedroom or fitting-room environment."

## "Pain reinforcement" beat fragments

Pattern: 1-2 micro-failures piled on the original pain.

> "Tries one fix → doesn't work. Tries another → also doesn't work. Slumps."

Generate a 1-2 second sub-clip per micro-failure.

## Product reveal fragments

### Gradual reveal (default)
> "Product appears organically in scene — hand picks it up from counter / table / shelf / bag. Product is foregrounded, in clear focus, AS PER THE PROVIDED REFERENCE IMAGE (no AI-improvised packaging or logo). 1.5-2 second beat to register."

### Dramatic reveal (smash-cut)
> "Hard cut from frustrated face to product close-up centered in frame. Full product shot. AS PER THE PROVIDED REFERENCE IMAGE. 1 second beat."

**Critical:** always pass the user-supplied product reference into `--ref` for the reveal frame. Do not let `gemini-3-pro-image-preview` invent its own packaging — it will hallucinate the logo every time.

## Demo fragments

### Transformation shot (cosmetics, fashion, fitness)
> "Same subject, same setting, after using the product. Same lighting and angle as the 'before' shot for direct comparison. Product visible somewhere in the frame (table, hand)."

### Functional demo (software, household)
> "Product / tool in action, mid-task. Hands or person interacting with it. Clean, satisfying motion. Product reference in frame as an anchor."

### Reaction shot (any category)
> "Subject's face — satisfied / pleased / relieved expression. Same character as the 'before' shots. Eye contact with the camera, slight smile or eyebrow raise."

## VO fragments

VO can be in any language. English defaults below; Russian variants follow as an example. Translate the same beats into whichever language the brief asks for.

### Pain hook (≤ 7 words, frustrated tone)

**English:**
- "Nothing ever works."
- "I'm done dealing with this."
- "Every single morning, same thing."
- "Why is this still happening."

**Russian:**
- "Опять ничего не работает."
- "Сколько можно вот это терпеть."
- "Каждый раз одно и то же."
- "Я сдалась с этими <X>."

### Reveal (≤ 5 words, neutral tone)

**English:**
- "A friend told me about <X>."
- "Saw this online."
- "Decided to try."
- "This thing."

**Russian:**
- "Подруга посоветовала <X>."
- "Случайно увидела <X>."
- "Решила попробовать."
- "Вот это."

### Demo / proof (one line per beat, growing satisfaction)

**English:**
- "First day — okay."
- "After a week — actually noticeable."
- "After a month — forgot it was ever a problem."
- "Can't believe I lived without this."

**Russian:**
- "Первый день — нормально."
- "Через неделю — заметно."
- "Через месяц — забыла что это была проблема."
- "Не верится что я раньше без него."

### Outro / CTA

**English:**
- "Link in bio."
- "If you've got the same problem — try it."
- "<Product name>." (silent reveal)

**Russian:**
- "Линк в био."
- "Если у тебя такое же — попробуй."
- "<Product name>." (silent reveal)

## Tonal arc

VO `voice_settings`:
- **Pain section (0-5s):** stability 0.45 (slightly variable), style 0.30 (more emotional).
- **Reveal + demo (5-15s):** stability 0.60 (calmer), style 0.20 (less emotional, more confident).

If ElevenLabs delivers a too-confident tone in the "pain" section, regen with lower stability.

## Music fragments (two beats)

### Before (0-5s) — tense
> "Tense ambient instrumental, slight dissonance, low strings, 60 BPM, anxious undertone, no vocals, no melody hooks."

### After (5-15s) — uplifting
> "Uplifting indie instrumental, light acoustic guitar + soft piano, 90 BPM, optimistic but not over-the-top, no vocals."

Cross-fade at the reveal frame (frame 150 @ 30fps for the standard 5s split).

## Caption style split

- **Before section:** `HormoziCaptions` — large pop, white + black outline. Conveys frustration / impact.
- **After section:** `MinimalCaptions` or `KaraokeCaptions` — calmer, less aggressive. Conveys relief / confidence.

Switch at frame 150 (the 5s mark).

## Negative prompt

> "no fake brand, no logo distortion, no unauthorized brand modification, no AI-improvised packaging, no text overlays in the source frame, no plastic skin, no model-look, no studio lighting."

## Reference-required prompt addendum

Whenever a user-supplied product reference is in the call, append:

> "Product appears AS PER THE PROVIDED REFERENCE IMAGE — exact packaging, exact logo, exact color. Do NOT improvise branding."

Pass the reference URL into `--ref` for every frame where the product is visible.
