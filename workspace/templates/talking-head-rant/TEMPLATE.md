# Talking Head Rant — vibe reference

**Жанр:** character-driven монолог 15-20s, deadpan ranting tone, опционально с hook screenshot overlay.
**Длительность:** 15-22s (default 18).
**Формат:** TikTok/Reels 9:16, 30fps, 1080×1920.

## Why this format works

Топ-formate UGC рекламы и личных каналов 2025-2026:

1. **Hook screenshot в первые 3s** — Reddit post / news headline / chat — даёт мозгу "что это будет про", удерживает.
2. **Single character close-up** — talking-head формат intimate, чувство 1-на-1.
3. **Deadpan tone** — не пытаемся быть смешными, не overact'им; пользователь чувствует "это разговор не реклама".
4. **Длительность 15-20s** — достаточно сказать что-то substantive, не overstays welcome.

## Vibe anchors

- **Photorealistic character**, не стилизация.
- **Single setting throughout** — не cut'аем между локациями. Continuity = immersion.
- **Eye contact с камерой** — character смотрит прямо в кадр (или 5° offset для естественности).
- **Subtle motion** — head bobs, eye blinks, slight body shifts. Never fast cuts within the talking-head shot.
- **Background** — соответствует архетипу. IT-shnik → home office. Courier → driver seat or street. Mamochka → kitchen.

## Characters (from `workspace/personas/ARCHETYPES.md`)

8 архетипов:
- **IT-shnik (remote)** — 25-32, в свитшоте, дома, неубранный фон.
- **Courier / driver** — 25-35, в форме / куртке, машина или улица.
- **Student** — 18-23, толстовка, общага / кафе.
- **Mamochka-blogger** — 28-35, домашняя одежда, кухня.
- **Office worker** — 25-40, рубашка, open-space.
- **Z-zoomer** — 16-22, gen-z fashion, городская улица.
- **Startup founder** — 30-40, sleeker dress, coworking.
- **Marketer-perform** — 25-35, business casual, neutral office.

Подбор архетипа = функция rant subject. IT-monolог → it-remote. Жалоба на цены → courier / mamochka. Dating монолог → z-zoomer.

## Variation axes

| Ось | Варианты |
|---|---|
| Character archetype | 8 options ↑ |
| Rant subject | работа, dating, цены, IT-жизнь, транспорт, еда, родители, воспитание |
| Hook screenshot type | Reddit пост / news headline / chat message / tweet / TikTok comment |
| Tone | deadpan / frustrated / sarcastic / resigned |

## Narrative arc (форма, не prescription)

```
0-3s   → Hook screenshot overlay (Reddit пост или news). Character в кадре в background, screenshot занимает 60-70%.
3-4s   → Screenshot fades out, character прямо в кадре.
4-13s  → Body of the rant — 3-4 micro-points в монологе.
13-18s → Punchline / outro — самая edgy / памятная фраза.
```

## Hook screenshot examples

**Reddit:**
> r/AskRussia • 2 days ago
> "Why does <X> in Russia <verb>?"
> 1.2k upvotes

**News headline:**
> "Government announces new <X> tax — citizens angry"

**Chat message:**
> [iMessage screenshot] Mom: "Have you eaten today?"

**Tweet:**
> "@user just lost his @ for X. Welcome to 2026."

## Required user inputs

1. **Subject** — про что rant (1-2 строки).
2. **Hook source** (optional) — конкретный screenshot path или "придумай" → chat генерит.
3. **Archetype** (optional) — если не сказали, инфер по subject.

## When NOT to use

- Если нужен product showcase / demo (visual product needs to be в кадре, talking-head не может).
- > 25s rant (overstays).
- Multiple characters (формат 1-character).
- Brand promo с required logo placement (logo не нaturally fit'ится в talking-head).

## Cost ballpark per video

- 1× character image (gemini-3-pro-image-preview): $0.15
- 1× video clip (veo-3.1, 15s): $7.50 (premium model для good lip-sync)
- VO (subscription): $0
- Captions (whisper-1): ~$0.001
- Music (subscription): $0
- Render: $0
- **Total: ~$7.65 per video**

veo-3.1 dominates cost. Если можно довольствоваться kling-v3.0-pro lip-sync (slightly worse) → $2.10 per 15s clip = ~$2.25 total.

## Read also

- `fragments.md` — character prompts + hook screenshot generators + monologue formulas.
- `model-stack.md` — concrete ralphy generate commands.
- `composition.md` — Remotion skeleton с HookScreenshot overlay timing.
- `reference-example.md` — placeholder.
