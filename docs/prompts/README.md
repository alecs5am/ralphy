# Prompt cookbook — production UGC

Tested prompt-templates for production-grade image and video generation. Mined from three public sources (letsenhance.io, rephrase-it.com, media.io) and adapted into slot-fillable masters. **The agent reads the relevant mode file, takes the user's request, fills slots, and calls `ralphy generate image --prompt "..."` directly.** No new CLI flag, no skill — just curated library.

## Default model

- Premium / типографика / чёткий лейбл — **`openai/gpt-5.4-image-2`** (CLI default since 2026-05-12).
- Multi-ref character/face consistency (2+ refs) — **`google/gemini-3-pro-image-preview`** (pass `--model` explicitly).
- Цена: gpt-5.4-image-2 ≈ $0.20/image, gemini-3-pro ≈ $0.15/image (см. MODELS.md).

## Intent → mode mapping

| Юзер говорит | Mode file |
|---|---|
| "studio фото продукта", "packshot", "белый фон", "каталог", "marketplace listing" | [`image/product-shot.md`](image/product-shot.md) |
| "в реальной среде", "lifestyle", "на кухне / в зале / на полке", "в интерьере" | [`image/lifestyle-scene.md`](image/lifestyle-scene.md) |
| "рука держит", "в использовании", "model using", "swipe / apply / unbox" | [`image/closeup-with-person.md`](image/closeup-with-person.md) |
| "макро", "текстура", "шиммер", "капли", "extreme close-up" | [`image/macro-detail.md`](image/macro-detail.md) |
| "сверху", "flat lay", "top-down", "раскладка" | [`image/flat-lay.md`](image/flat-lay.md) |
| "AI-модель носит / использует", "виртуальная примерка", "model wearing X" | [`image/virtual-model-tryout.md`](image/virtual-model-tryout.md) |
| "баннер на сайт", "hero для лендинга", "wide-format", "email header" | [`image/hero-banner.md`](image/hero-banner.md) |
| "сюрреал", "CGI", "левитация", "всплеск", "splash", "neon", "color gels" | [`image/conceptual-product.md`](image/conceptual-product.md) |
| "поменяй только X", "тот же продукт но Y", "перегенерь с другим фоном" | [`image/iteration-edit.md`](image/iteration-edit.md) |

## File anatomy

Каждый mode-файл устроен одинаково:

1. **When to use** — 1-2 предложения, когда этот режим адекватен.
2. **Master template** — слотовый промпт-скелет, который агент заполняет под конкретный запрос.
3. **Worked examples** — 3-8 verbatim промптов из источников с атрибуцией.
4. **Slot vocabulary** — допустимые значения для surface / lighting / lens / aperture / aspect.
5. **Model recommendation** — какую модель брать для этого режима.

## How the agent uses it

```
1. Юзер: "сделай packshot моего нового флакона духов на белом фоне"
2. Агент: читает docs/prompts/image/product-shot.md
3. Агент: берёт Master template, фильтрует под "perfume bottle, pure white background"
4. Агент: заполняет слоты конкретикой из запроса юзера (продукт = "perfume bottle",
          surface = "pure white seamless", lens = "85mm", aspect = "1:1", etc.)
5. Агент: ralphy generate image --project <id> --slot hero-01 --prompt "<собранный>"
6. Результат: премиум-генерация через openai/gpt-5.4-image-2 (дефолт)
```

Если для multi-ref нужна character consistency (модель + продукт, та же модель в нескольких сценах) — агент явно пишет `--model google/gemini-3-pro-image-preview --ref model.png --ref product.png`.

## Sources

Все verbatim примеры в этой коллекции из этих трёх публичных источников. Каждый помечен в worked examples секциях.

- [letsenhance.io/blog/all/ecommerce-product-prompts](https://letsenhance.io/blog/all/ecommerce-product-prompts/) — 20 промптов, шаблонные со слотом `[product]`, бакеты studio / lifestyle / scale / with-people / seasonal.
- [rephrase-it.com](https://rephrase-it.com/blog/best-prompts-for-ai-product-photography-packshots-lifestyle-) — 5 структурированных промптов с "Hard exclusions" блоком — отличный скелет для master-template.
- [media.io](https://www.media.io/ai-prompts/ai-product-photography-photo-prompts.html) — 25 промптов с конкретными камерами/линзами/диафрагмой, все `--ar 4:5`.

Видео-cookbook (kling/seedance camera moves, motion grammar) — отдельная фаза, см. `video/` когда появится.
