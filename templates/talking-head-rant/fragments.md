# Fragments — talking-head-rant

Reusable building blocks for `/ralph-art-director`. Combine fresh per project.

## Character prompt seeds

Each archetype below is a generic seed. The art director should localize wardrobe, ethnicity, and language cues based on the brief (e.g. add "<region>", "<language> lettering on background props" if relevant).

### Remote IT worker
> "Photorealistic 28-year-old in a grey hoodie, dark hair slightly messy, light stubble. Sitting in a cluttered home office — mechanical keyboard, multiple monitors blurred behind, mug of coffee on desk, slightly wilted plant. Soft daylight from the left. Camera medium close-up, eye-level, slight 5-degree offset (looking past the camera). Tired but engaged expression."

### Courier / delivery driver
> "Photorealistic 30-year-old in a dark waterproof jacket with a subtle logo (no readable branded text). Sitting in a car driver seat, dashboard partially visible. Outside the window: blurred city street, slight rain. Camera POV-style, slightly upward from the passenger angle. Tired, resigned expression."

### Student
> "Photorealistic 21-year-old, pastel-dyed hair pulled into a loose bun, university-logo hoodie (logo subtle, not readable). Sitting in a cafe or dorm hallway — blurred coffee cups, books, phone. Cool morning light, soft shadows. Camera at chest level, tilted slightly up. Slightly amused, slightly tired expression."

### Stay-at-home creator
> "Photorealistic 32-year-old, hair in a loose ponytail, no makeup but groomed, wearing comfortable home wear (oversized cardigan). Sitting in a modern apartment kitchen, baby bottle / kids' plate visible blurred behind, plants on the windowsill. Warm afternoon light. Camera at face level, slightly low angle. Friendly but exhausted expression."

### Office worker
> "Photorealistic 35-year-old, neat short hair, clean shave, light blue shirt slightly wrinkled. Sitting in an open-plan office — fluorescent ceiling, computer monitors blurred, generic corporate vibe. Camera mid-shoulder height, eye-level. Resigned, slightly sarcastic expression."

### Gen-Z urban
> "Photorealistic 19-year-old, gen-z styling — bucket hat or oversized sunglasses, pastel hair, baggy clothes. On an urban street — graffiti wall, city light. Camera handheld feel, eye-level. Energetic but slightly bored expression."

### Startup founder
> "Photorealistic 34-year-old, neat haircut, clean shave or light beard, dark merino t-shirt. Sitting in a coworking space — light wood desk, blurred laptops in background, soft window light. Camera medium shot, eye-level. Composed but mildly impatient expression."

### Performance marketer
> "Photorealistic 30-year-old, business casual (button-up over t-shirt), in a neutral office — whiteboard with blurred chart, laptop. Camera medium shot, eye-level. Confident but slightly drained expression."

## Hook screenshot fragments

### Reddit post template
> "r/<subreddit> • <X hours/days ago>
>
> <PROVOCATIVE QUESTION OR STATEMENT IN HEADLINE STYLE>
>
> <BODY TEXT 3-5 LINES>
>
> <UPVOTES>k upvotes • <COMMENTS> comments"

Subreddit picks by archetype: `r/AskReddit` (universal), `r/programming` (IT-life), `r/relationships` (dating), `r/AskRussia` / `r/russia` / `r/europe` (region-specific takes).

### News headline template
> "<MAJOR NEWS OUTLET LOGO>
> <HEADLINE 8-12 words>
> <SUBHEAD 12-18 words>
> <SMALL TIMESTAMP> • <X read time>"

### Chat message template
> "<NAME>
> <TIMESTAMP>
> '<MESSAGE TEXT>'"

iMessage / Telegram / WhatsApp aesthetic — pick one that fits the archetype.

### Tweet template
> "@<HANDLE> · <TIMESTAMP>
> <TWEET BODY>
> <REPLIES> · <RT> · <LIKES>"

## Monologue formulas

### Hook line (≤ 7 words, deadpan)

**English:**
- "I just don't get it anymore."
- "Someone explain this to me."
- "I just saw this and I'm done."
- "Tell me this is normal."

**Russian (alt):**
- "Меня вот это вообще не понимает."
- "Объясните мне как это работает."
- "Я только что увидел такое."
- "Скажите мне это нормально?"

### Body beats (one beat per ~3-4 seconds)

Pattern: thesis → micro-evidence → reaction → next.

**English example:**
> "I open my email — 47 messages from <X>.
> Fine, I think, normal Tuesday.
> First one: 'please send the TPS report.'
> By the end of the day I'm tired of writing TPS reports and tired of being alive."

**Russian example:**
> "Открываю почту утром — там 47 сообщений от <X>.
> Думаю, ладно, нормально.
> Открываю первое — это просьба прислать TPS report.
> К концу дня я устал писать TPS reports и устал жить."

### Outro / punchline

**English:**
- "I get it."
- "Thanks for listening."
- "That's all I had."
- (silent fade — visual punchline)

**Russian:**
- "Понимаю."
- "Спасибо что выслушали."
- "Это всё что я хотел сказать."

## Word budget

- ~2.5 words/sec for deadpan TTS in any language.
- 15s rant ≤ 37 words.
- 18s rant ≤ 45 words.
- 22s rant ≤ 55 words.

Don't push past the budget — TTS compresses to fit and the result sounds rushed and unnatural.

## Banlist (ad-speak)

Anti-deadpan phrases to avoid:
- "unique", "revolutionary", "уникальный", "революционный" — kills deadpan tone.
- "take note", "обратите внимание" — belongs in a memo, not a monologue.
- "don't miss out", "не упустите шанс" — reads as an ad.

## Camera / motion

### veo-3.1 (default — premium)
> "Single static shot. Character speaks naturally to camera. Subtle head movements (small nods at thought-points), occasional eye blink, slight body shift. Lip-sync to provided audio. No camera movement. 15-second duration."

### kling-v3.0-pro (cheap fallback — no native lip-sync)
> "Subtle handheld feel (5% motion), character in static frame, slight head turn at the end of each sentence. Audio off — VO added in post."

## Music prompt

> "Minimal lo-fi background bed, very low energy, subtle piano or ambient pad, 60 BPM, almost imperceptible — supports VO without competing. No vocals, no lyrics, no melody hooks."

## Caption style

- `HormoziCaptions` (default) — large pop, white + black outline. Best for high-impact rants with hot takes.
- `KaraokeCaptions` (alt) — word-by-word highlight, more intimate / monologue feel.
- Don't use `TypewriterCaptions` for a long monologue — the eye gets tired of the typing animation.

## Negative prompt (image / video)

> "no logo, no branded text, no watermark, no text overlays in the source frame, no professional studio lighting, no model-look, no plastic skin, no perfect makeup, no cartoon style."
