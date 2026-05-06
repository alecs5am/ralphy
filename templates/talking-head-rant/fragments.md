# Fragments — talking-head-rant

## Character prompt seeds

### IT-shnik (remote)
> "Photorealistic 28-year-old Russian male, dark hair slightly messy, light stubble, wearing grey hoodie. Sitting in cluttered home office — mechanical keyboard, multiple monitors blurred behind, mug of coffee on desk, plant slightly wilted. Soft daylight from left side. Camera medium close-up, eye-level, slight 5-degree offset (looking past camera). Slightly tired but engaged expression."

### Courier / driver
> "Photorealistic 30-year-old Russian male, short hair, light stubble, wearing dark waterproof jacket with subtle logo (no branded text visible). Sitting in car driver seat, dashboard partially visible. Outside window: blurred Moscow street, slight rain. Camera POV-style — slightly upward from passenger angle. Tired but resigned expression."

### Student
> "Photorealistic 21-year-old Russian female, dyed pastel-pink hair pulled into loose bun, hoodie with university logo subtle. Sitting in cafe / общага лестница — blurred coffee cups, books, phone. Cool morning light, soft shadows. Camera at chest level, tilted slightly up. Slightly amused, slightly tired."

### Mamochka-blogger
> "Photorealistic 32-year-old Russian female, hair in loose ponytail, no makeup but groomed, wearing comfortable home-wear (oversized cardigan). Sitting in modern apartment kitchen, baby bottle / kids' plate visible blurred behind, plants on windowsill. Warm afternoon light. Camera at face level, slightly low angle. Friendly but exhausted expression."

### Office worker
> "Photorealistic 35-year-old Russian male, neat short hair, clean shave, light blue shirt slightly wrinkled. Sitting in open-plan office — fluorescent ceiling, computer monitors blurred, generic corporate vibe. Camera mid-shoulder height, eye-level. Resigned, slightly sarcastic expression."

### Z-zoomer
> "Photorealistic 19-year-old Russian male/female, gen-z styling — bucket hat or oversized sunglasses or pastel hair, baggy clothes. On urban street — graffiti wall, city light. Camera handheld feel, eye-level. Energetic but slightly bored expression."

(Дополнения для startup-founder и marketer-perform — см. ARCHETYPES.md в workspace/personas/.)

## Hook screenshot fragments

### Reddit post template
> "r/<subreddit> • <X hours/days ago>
>
> <PROVOCATIVE QUESTION OR STATEMENT IN HEADLINE STYLE>
>
> <BODY TEXT 3-5 LINES>
>
> <UPVOTES>k upvotes • <COMMENTS> comments"

Russian-targeted subreddits to reference: `r/AskRussia`, `r/russia`, `r/europe`, `r/programming` (для IT-rant'а).

### News headline template
> "<MAJOR NEWS OUTLET LOGO>
> <HEADLINE 8-12 words>
> <SUBHEAD 12-18 words>
> <SMALL TIMESTAMP> • <X read time>"

### Chat message template
> "<NAME>
> <TIMESTAMP>
> '<MESSAGE TEXT>'"

iMessage / Telegram / WhatsApp aesthetic — choose per archetype.

### Tweet template
> "@<HANDLE> · <TIMESTAMP>
> <TWEET BODY>
> <REPLIES> · <RT> · <LIKES>"

## Monologue formulas

### Hook line (≤ 7 слов, RU, deadpan)

- "Меня вот это вообще не понимает."
- "Объясните мне как это работает."
- "Я только что увидел такое."
- "Скажите мне это нормально?"

### Body beats (по 1 на ~3-4 секунды)

Pattern: thesis → micro-evidence → reaction → next.

> "Открываю почту утром — там 47 сообщений от <X>.  
> Думаю, ладно, нормально.  
> Открываю первое — это просьба прислать TPS report.  
> К концу дня я устал писать TPS reports и устал жить."

### Outro / punchline

- "Понимаю."
- "Спасибо что выслушали."
- "Это всё что я хотел сказать."
- (silent fade — visual punchline)

## Word budget

- 2.5 слов / сек (RU TTS deadpan).
- 15s rant ≤ 37 слов VO.
- 18s rant ≤ 45 слов VO.
- Не растягивай — TTS compresses, звучит unnatural.

## Banlist (ad-speak)

См. `workspace/hooks/HOOK_LIBRARY.md` для full list. Для talking-head особенно:
- "уникальный", "революционный" — анти-deadpan.
- "обратите внимание" — пишется в письмо, не в монолог.
- "не упустите шанс" — реклама.

## Camera / motion

### veo-3.1 (default)
> "Single static shot, character speaks naturally to camera. Subtle head movements (nods at thought-points), occasional eye blink, slight body shift. Lip-sync to provided audio. No camera movement. 15-second duration."

### kling-v3.0-pro (cheap fallback)
> "Subtle handheld feel (5% motion), character in static frame, slight head turn at end of each sentence. Audio off — VO added in post."

## Music prompt

> "Minimal lo-fi background bed, very low energy, subtle piano or ambient pad, 60 BPM, almost imperceptible — supports VO without competing. No vocals, no lyrics, no melody hooks."

## Caption style

- `HormoziCaptions` (default) — large pop, white + black outline. Best для high-impact rant с hot takes.
- `KaraokeCaptions` (alt) — word-by-word highlight, более intimate / monologue feel.
- НЕ используй `TypewriterCaptions` для длинного монолога — устаёт глаз.

## Negative prompt (image / video)

> "no logo, no branded text, no watermark, no text overlays in source frame, no professional studio lighting, no model-look, no plastic skin, no perfect makeup, no cartoon style"
