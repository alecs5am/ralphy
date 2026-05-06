# Prompt fragments — talking-character

Готовые prompt-блоки для каждого pipeline-stage. Не копируй слепо — комбинируй
под конкретного persona × setting × angle.

## Character image (nano-banana-pro)

### Base structure
```
[appearance] + [setting] + [framing] + [quality]
```

### Appearance fragments (от `archetype` в персоне)

**`it-remote`:**
> man in his late 20s, oversized black t-shirt, slight stubble, tired but
> sharp eyes, casual home-office look, no makeup, slightly messy hair

**`wfh-worker`:**
> person in their early 30s, simple casual hoodie or t-shirt, normal
> "everyday" appearance, no styling, natural daylight on face

**`startup-founder`:**
> person in their early 30s, simple grey/black t-shirt or henley, confident
> tired look, slight stubble (M) / no makeup (F), watch on wrist visible

**`mom-blogger`:**
> woman in her early 30s, comfortable sweater, hair pulled back loosely,
> minimal makeup, warm friendly expression, kitchen light on face

**`courier-driver`:**
> man in his late 20s, courier service jacket or warm jacket, beanie hat,
> phone holder visible bottom of frame, working-class everyman vibe

**`gen-z-energy`:**
> 20-year-old, expressive face, one bright accessory (necklace / pop earring),
> mid-styled hair (slight color), animated expression captured mid-thought

### Setting fragments (от `setting` из SETTINGS.md)

**Home office (it-remote / wfh-worker):**
> indoor home office, soft warm tungsten lighting, mechanical keyboard and
> monitor partially visible in soft focus background, cozy domestic
> atmosphere, vertical 9:16

**Kitchen counter (mom-blogger):**
> modern kitchen counter, soft morning natural light through window,
> minimal kitchen utensils slightly visible in background, clean
> composition, vertical 9:16

**Car POV (courier-driver):**
> POV from driver seat, dashboard partially visible bottom, urban street
> through windshield slightly out of focus, evening soft light, vertical 9:16

**Coworking/hackathon (startup-founder / gen-z-energy):**
> coworking space evening, multiple laptops visible, dramatic low-light
> with magenta and cyan LED ambient lighting, blue lights blurred in
> background, vertical 9:16

### Framing (always include)

> close-up portrait, looking directly at camera, eye contact, natural
> facial expression, shallow depth of field, soft skin texture (not
> over-retouched), 4k photo quality, vertical 9:16

### Anti-patterns (negative prompts mental note)

- "professional headshot" → выглядит как LinkedIn → не UGC
- "perfect skin" → uncanny → "natural skin with slight imperfection"
- "studio lighting" → коммерческое → используй "natural daylight" /
  "ambient indoor"
- Side profile / 3/4 → `wan-25` потом плохо лип-синкает

## Voiceover (ElevenLabs script)

### Word budget per duration
- 5s VO ≈ **12 слов**
- 10s VO ≈ **25 слов** (default для wan-25)

### Hook line (from HOOK_LIBRARY.md, ≤10 слов)

Примеры адаптированные под talking-character:
- `it-remote` + `gatekeep` → "Никто тебе не скажет почему джуны не растут."
- `wfh-worker` + `fail` → "Я облажался: купил 4 камеры за месяц, и вот почему."
- `startup-founder` + `skeptic` → "Все думают надо стажироваться. Я думаю иначе."
- `mom-blogger` + `gatekeep` → "Жаль я не знала это с первой беременностью."

### Body (10s ≈ 22 слов)

Структура: hook → reveal → conclusion. Пример (10s, 25 слов):
> "Никто тебе не скажет почему джуны не растут. Они слишком долго делают
> простые задачи. Дай джуну сложное за неделю — увидишь характер."

### Voice settings reminder
- `stability: 0.55` — деадпан стабильный, но не плоский
- `similarity_boost: 0.8` — близко к voice clone
- `style: 0.25` — минимальная экспрессия (UGC = сдержанный)

## Talking video (wan-25)

### Motion prompt structure

Базовый шаблон:
```
front-facing camera selfie POV, handheld phone in front of face with
subtle natural wobble and shake throughout, subject in sharp focus with
softly blurred background shallow depth of field, [scene lighting],
conversational audio with [ambient]
```

### Per-setting motion prompts

**Home office (it-remote):**
> front-facing camera selfie POV, handheld with subtle natural wobble,
> warm tungsten lighting on face, soft shadows, conversational tone with
> faint background hum of fans/AC

**Kitchen counter (mom-blogger):**
> front-facing camera at slight high angle (phone propped or held), warm
> morning natural light, kitchen ambient (faint refrigerator hum, child
> in distance), gentle relaxed expression with occasional smile

**Car POV (courier-driver):**
> selfie POV from driver seat, telephone in dashboard mount with subtle
> wobble from driving, evening street light through windshield, urban
> ambient (traffic, distant car horns), pragmatic expression

**Coworking evening (startup-founder):**
> selfie POV, handheld phone, dramatic low-light with magenta and blue
> ambient LED lights, shallow depth of field, multiple monitors blurred
> in background, conversational confident tone

### wan-25 anti-patterns

- "person walking" / "moving body" → wan-25 это talking-head, не full-body
  motion. Только лицо + лёгкие head-movements.
- "dramatic camera move" → static-ish camera, only natural wobble OK.
- Длительность кроме 5/10s → endpoint reject.

## Captions (TikTokCaptions / HormoziCaptions)

После `bun run ralph -- project transcribe`:

```tsx
import { TikTokCaptions } from "../../lib/components/captions/TikTokCaptions";
import captions from "../../../workspace/projects/<id>/captions.json";

<TikTokCaptions
  captions={captions}
  // дефолт стиль уже UGC-friendly; см. файл компонента для пропсов
/>
```

Для bombshell-моментов с числами или названиями (например "12М") —
`HormoziCaptions` подсвечивает yellow accent на конкретных словах.

## Music (lyria2 prompt)

```
"[mood] [genre] instrumental loop, no vocals, no lyrics, no human voice,
steady tempo around 90 bpm, ambient background, 30 seconds"
```

**Mood × archetype:**
- `it-remote` → "lo-fi chill warm electronic"
- `wfh-worker` → "soft ambient warm pad gentle"
- `startup-founder` → "minimal deep house focused steady"
- `gen-z-energy` → "trap drums energetic urban"
- `mom-blogger` → "acoustic warm folk light"
- `courier-driver` → "moody synth analog cool dark"
