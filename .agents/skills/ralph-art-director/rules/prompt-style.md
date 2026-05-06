# Prompt style

Промпт состоит из четырёх слоёв в строгом порядке:

1. **Subject** — кто/что в кадре. Конкретно, без "красивого парня" — "молодой парень 25 лет, тёмные волосы, серая толстовка, неуверенная улыбка".
2. **Setting** — окружение. Бери из `workspace/scenes/SETTINGS.md` (9 архетипов: кухня, ванная, спортзал, машина, офис, метро, спальня, улица, хакатон).
3. **Style/lens** — фотографические токены. "shot on iPhone 15 Pro, vertical 9:16, natural light, slight handheld shake".
4. **Negative** — что не должно быть. "no professional studio lighting, no model-look, no plastic skin".

## По типу слота

### Image

- Размер всегда `1080x1920` (9:16). Никаких square_hd / landscape — наш pipeline вертикальный.
- Если есть persona/brand reference в `assets/uploaded/` — пихай URL в `image_urls` (multi-ref для gemini-3-pro-image-preview).
- Negative ВСЕГДА содержит "no text overlays, no watermarks" — captions делаем в Remotion отдельно.

### Video (i2v)

- Motion description: 1-2 фразы. "subtle handheld camera shake, character slightly nods, eyes blink naturally". Не описывай весь кадр — он уже в keyframe.
- Camera movement: "static" / "slow push-in 5%" / "subtle handheld" — выбери одно.
- Duration: 5s или 10s. 15s только для veo-3.1.
- **`generate_audio: false`** всегда (см. MODELS.md — no native TTS).

### Voiceover (ElevenLabs)

- Voice settings deadpan-молодой-русский — см. MODELS.md "Voice settings".
- `output_format: mp3_44100_128`.
- Текст — exactly как scenarist написал, без своих правок. Если нужна правка — handback в `/ralph-scenarist`.

### Music (ElevenLabs Music)

- `force_instrumental: true` всегда (если шаблон явно не требует вокал).
- `music_length_ms` подбирается под длину видео + 2с tail для fade-out.
- Промпт: жанр + темп + настроение. "melancholic lo-fi hip-hop, 80 BPM, vinyl crackle, no vocals, instrumental beats".

## Style fragments

Если проект инкарнирован из шаблона — **сначала читай `workspace/templates/<slug>/fragments.md`** и переиспользуй блоки оттуда. Не пиши с нуля стилистические токены, которые шаблон уже стандартизовал.

## Russian-first

Все наши шаблоны русскоязычные. Не пиши промпты "in the style of Wes Anderson" — это работает хуже чем конкретные референсы и токены. Для русской эстетики предпочитай: "Soviet 80s Polaroid", "kommunalka kitchen", "хрущёвка interior" — не "Russian style" общим словом.
