# Use cases — what good looks like

Канонические user-utterance → expected-flow → expected-output триплеты. Скиллы и сам чат должны откликаться по этой таблице. Если запрос пользователя сюда попадает — флоу детерминирован. Если нет — fallback в `/ralph-producer` с уточняющим вопросом.

> **Definition of "good":** finished mp4 в `workspace/projects/<id>/render/final.mp4` или явный refusal с конкретным предложением (а не "ну попробую"). Промежуточные шаги логируются в `generations.jsonl`.

---

## A. Cold-start templates

Шаблон-first флоу: чат сразу предлагает шаблон по `ralphy template suggest`, не пишет сценарий с нуля.

### A1. AI-овощи

**Utterance:** "сделай мне ии-овощи про <topic>", "хочу видос с овощами в стиле AI", "запили AI vegetables про <X>"

**Expected first response:**
> Шаблон **ai-vegetables** (виральный POV, 15s, ~$8). Подтверди — стартую.

**Flow:**
1. `ralphy template use ai-vegetables --project <slug>-001 --brief "<topic>"`
2. `/ralph-art-director` → keyframe (gemini-3-pro-image-preview) → i2v (kling-v3.0-pro)
3. `/ralph-editor` → captions (whisper-1) → render
4. `ralphy render <id>` → mp4 path

**Target:** ≤8 min wall-time, ≤$8.

### A2. Talking-head ранта

**Utterance:** "сделай talking head про <X>", "monolog где чувак жалуется на <Y>", "разогретый rant про <Z>"

**Expected first response:**
> Шаблон **talking-head-rant** (15-20s, гипер-герой + хук-скриншот, ~$10). Какой архетип — IT-шник, курьер, мамочка-блогер? Если не знаешь — выберу сам.

**Flow:**
1. `ralphy persona suggest --archetype <inferred>` либо чат предлагает дефолт
2. `ralphy template use talking-head-rant`
3. `/ralph-scenarist` → 15-20s scenario с хуком в первые 3s
4. `/ralph-art-director` → character image → veo-3.1 talking-head
5. `/ralph-editor` → captions + hook screenshot overlay → render

**Target:** ≤10 min, ≤$12.

### A3. Before/after продукта

**Utterance:** "сделай рекламу для <product>", "before-after про <тулзу>", "5 секунд боли + 10 секунд решения для <X>"

**Expected first response:**
> Шаблон **before-after-product** (15s, классическая UGC-форма, ~$8). Скинь скриншот / лого / упаковку — без референса генерить не буду.

**Flow:**
1. **gate:** ждём референс (см. секция D). Без него — refuse.
2. `ralphy template use before-after-product --project <id>` с reference в `assets/uploaded/`
3. `/ralph-scenarist` → 5s проблема + 10s демо
4. `/ralph-art-director` → 2 keyframes → 2 i2v clips
5. `/ralph-editor` → captions + transition → render

**Target:** ≤10 min, ≤$10.

### A4. Совок-видос

**Utterance:** "сделай видос в советском стиле про <X>", "совок-формат про <Y>", "ностальгия СССР про <Z>"

**Expected first response:**
> Шаблон **soviet-nostalgic** (двухэрный TikTok narrative, ~15s, ~$10). Стартую.

**Flow:** см. `workspace/templates/soviet-nostalgic/TEMPLATE.md`.

---

## B. Site-style transfer

### B1. "Сделай в стиле <url>"

**Utterance:** "возьми стиль с https://...", "сделай лендинг-промо в эстетике <site>", "сними как <site>"

**Expected first response:**
> Запускаю `/ralph-researcher` — тащу токены и скриншоты с <site>. Это ~2 мин.

**Flow:**
1. `/ralph-researcher` → `extract-design.ts` → `workspace/references/<site-slug>/`
2. Чат показывает извлечённую палитру + типографику + 3 скрина → пользователь подтверждает
3. `/ralph-scenarist` → сценарий, ссылается на reference
4. `/ralph-art-director` → промпты с upload'ом reference-скринов в `image_urls`
5. `/ralph-editor` → render

**Target:** ≤15 min total.

### B2. "Анализ @handle"

**Utterance:** "посмотри что делает @handle на TikTok", "разбери стиль <creator>", "что у них вирусится"

**Expected first response:**
> Тяну топ-10 видосов @handle, прогоняю через viral-moments analysis. ~3 мин.

**Flow:** `/ralph-researcher` sub-task `discover-trends` → `scrape-tiktok-trends.ts` → `scoreTikTok()` → топ-N + анализ.

---

## C. Persona-required (gate активен)

### C1. Реальный человек по имени

**Utterance:** "сделай видос с Илоном Маском", "видео где <реальная-знаменитость> делает <X>", "от имени <блогер>"

**Expected first response (refusal с предложением):**
> Чтобы сделать `<имя>` хорошо, мне нужна референс-картинка (фото лица, желательно 2-3 ракурса). Скинь сюда либо смени персонажа на безличного (`архетип: it-remote / courier / student`) — без референса делать не буду, выйдет хуже чем дешёвый AI-слоп.

**После референса:**
- `assets/uploaded/<name>-ref.jpg` сохраняется
- `logUserAsset(id, { kind: "photo", source: ..., purpose: "persona-ref" })`
- `/ralph-art-director` использует референс в `image_urls` для каждого keyframe.

### C2. Брендированный продукт

**Utterance:** "видос про Сбербанк", "реклама <бренда>", "упаковка <product>"

**Expected first response (refusal с предложением):**
> Нужно лого / упаковку / brand kit бренда. Скинь сюда фото или ссылку на сайт — заберу через `/ralph-researcher`.

### C3. Стиль конкретной шоу/канала

**Utterance:** "в стиле передачи <X>", "как у канала <Y>", "пародия на <Z>"

**Expected first response:** аналогично C1/C2 — референс обязателен.

### C4. Override (явный consent)

**Utterance:** "генерь без референса, я понимаю что качество будет хуже", "пофиг, сделай как получится"

**Flow:** ok → `logUserPrompt(id, { stage: "no-ref-consent", text: "..." })` → продолжаем без референса.

---

## D. Refusal cases (без override)

### D1. Длительность не тянем

**Utterance:** "сделай 5-минутный фильм", "видос на 2 минуты"

**Expected response:**
> Я заточен на короткое (≤30s, оптимально 15s). 5-минутный фильм — это другая лига и другие модели, я скорее запорю чем сделаю. Можем разбить на серию из ~20 коротких; или скажи в каком сервисе делать длинное и помогу с промптами.

### D2. Несовместимый контент

**Utterance:** "видос с матом для детского канала", "<противоречивый brief>"

**Expected response:** explicit clarifying question + предложение двух непротиворечивых веток.

### D3. Запрос без основания

**Utterance:** "сделай видос про мою бабушку без фото"

**Expected response:** см. C — fallback на безличный архетип или ask-for-ref.

### D4. Quality-gate failure x2

После двух неудачных регенераций (`scoreImage < 7` дважды подряд):
> Не могу выдать качественную картинку для slot `<id>` (попыток: 2, последний score: <n>). Варианты: a) скинь reference получше, b) сменим модель (текущая <m>), c) сменим shot — например с close-up на medium.

---

## E. Batch tasks

### E1. "10 видосов по шаблону"

**Utterance:** "сделай 10 видосов в стиле X на разные темы", "запили серию из N <template> про <area>"

**Flow:**
1. `/ralph-producer` → brainstorm N тем (LLM, не повторяющиеся).
2. Чат показывает список → пользователь подтверждает / правит.
3. `ralphy batch create --template <id> --topics <list>` → параллельный запуск N проектов через `batch-from-template`.
4. Чат отчитывается батчем: rollup costs + final mp4 paths.

**Target:** 10×15s видео ≤25 мин wall (parallel where possible), ≤$120 total.

### E2. "Review the batch"

**Utterance:** "что там по батчу", "статус batch <id>", "какие из них норм"

**Flow:** `/ralph-producer` → `batch-review` → таблица `id | status | cost | score | render_path`.

---

## F. Template lifecycle

### F1. "Сохрани проект <id> как шаблон"

**Utterance:** "сделай шаблон из <project>", "сохрани этот формат на будущее"

**Flow:** `/ralph-producer` sub-task `template-extract` → `workspace/templates/<slug>/` со всеми пятью файлами + `reference-example.md` от исходного проекта.

### F2. "Какие шаблоны есть"

**Utterance:** "что у нас в шаблонах", "покажи доступные шаблоны"

**Flow:** `ralphy template list -p` — таблица.

### F3. "Подсказать шаблон"

**Utterance:** "какой шаблон под <запрос>"

**Flow:** `ralphy template suggest "<utterance>"` — top-3 ranked.

---

## G. Profile share

### G1. "Экспортни мой профиль"

**Utterance:** "выгрузи мой профиль <nick>", "поделись моими шаблонами"

**Flow:** `ralphy profile export <nick>` → `profiles/<nick>/` с PROFILE.md + templates + references + projects (без render).

### G2. "Импортни <nick>"

**Utterance:** "подтяни профиль <nick>", "импортни <nick> доп" 

**Flow:** `ralphy profile import <nick>` (additive). `--overwrite` если конфликты.

---

## Coverage check

После каждого мажорного изменения скиллов или CLI — пройди по этому файлу и убедись что все примеры всё ещё фейр. Если utterance не покрыт — добавить, либо задокументировать как explicit out-of-scope.
