# Use cases — what good looks like

Canonical user-utterance → expected-flow → expected-output triples. The skills and the chat itself should respond according to this table. If a user's request matches a row here, the flow is deterministic. If it doesn't, fall back to `/ralph-producer` with a clarifying question.

> **Definition of "good":** a finished mp4 at `workspace/projects/<id>/render/final.mp4`, or an explicit refusal with a concrete suggestion (not "I'll give it a shot"). Intermediate steps log to `generations.jsonl`.

User utterances below are shown in both English and Russian where the system needs to recognize either; verbatim Russian phrases (consent overrides, refusal triggers) are preserved as literal matchers.

---

## A. Cold-start templates

Template-first flow: the chat suggests a template via `ralphy template suggest` immediately rather than writing a scenario from scratch.

### A1. AI vegetables

**Utterance:**
- EN: "make me an AI vegetables video about <topic>", "I want a vegetable video AI-style", "do AI vegetables for <X>"
- RU: "сделай мне ии-овощи про <topic>", "хочу видос с овощами в стиле AI", "запили AI vegetables про <X>"

**Expected first response (matches user's language):**
> The **ai-vegetables** template (viral POV, 15s, ~$8). Confirm and I'll start.

**Flow:**
1. `ralphy template use ai-vegetables --project <slug>-001 --brief "<topic>"`
2. `/ralph-art-director` → keyframe (gemini-3-pro-image-preview) → i2v (kling-v3.0-pro)
3. `/ralph-editor` → captions (whisper-1) → render
4. `ralphy render <id>` → mp4 path

**Target:** ≤8 min wall-time, ≤$8.

### A2. Talking-head rant

**Utterance:**
- EN: "make a talking head about <X>", "monologue where a guy rants about <Y>", "deadpan rant about <Z>"
- RU: "сделай talking head про <X>", "monolog где чувак жалуется на <Y>", "разогретый rant про <Z>"

**Expected first response:**
> The **talking-head-rant** template (15-20s, character + hook screenshot, ~$10). Which archetype — remote IT worker, courier/driver, stay-at-home creator? If you don't know, I'll pick.

**Flow:**
1. `ralphy persona suggest --archetype <inferred>` or the chat proposes a default.
2. `ralphy template use talking-head-rant`
3. `/ralph-scenarist` → 15-20s scenario with hook in the first 3s.
4. `/ralph-art-director` → character image → veo-3.1 talking-head.
5. `/ralph-editor` → captions + hook screenshot overlay → render.

**Target:** ≤10 min, ≤$12.

### A3. Before/after product

**Utterance:**
- EN: "make an ad for <product>", "before-after for <tool>", "5s pain + 10s solution for <X>"
- RU: "сделай рекламу для <product>", "before-after про <тулзу>", "5 секунд боли + 10 секунд решения для <X>"

**Expected first response:**
> The **before-after-product** template (15s, classic UGC pattern, ~$8). Drop a screenshot / logo / packaging — I won't generate without a reference.

**Flow:**
1. **Gate:** wait for the reference (see section D). Without it — refuse.
2. `ralphy template use before-after-product --project <id>` with the reference in `assets/uploaded/`.
3. `/ralph-scenarist` → 5s problem + 10s demo.
4. `/ralph-art-director` → 2 keyframes → 2 i2v clips.
5. `/ralph-editor` → captions + transition → render.

**Target:** ≤10 min, ≤$10.

### A4. Soviet-nostalgic video

**Utterance:**
- EN: "make a Soviet-style video about <X>", "Soviet-format video about <Y>", "USSR nostalgia about <Z>"
- RU: "сделай видос в советском стиле про <X>", "совок-формат про <Y>", "ностальгия СССР про <Z>"

**Expected first response:**
> The **soviet-nostalgic** template (two-era TikTok narrative, ~60s, ~$12). Starting.

**Flow:** see `templates/soviet-nostalgic/TEMPLATE.md`.

---

## B. Site-style transfer

### B1. "Make it in the style of <url>"

**Utterance:**
- EN: "take the style from https://...", "make a landing-promo in the aesthetic of <site>", "shoot it like <site>"
- RU: "возьми стиль с https://...", "сделай лендинг-промо в эстетике <site>", "сними как <site>"

**Expected first response:**
> Launching `/ralph-researcher` — pulling design tokens and screenshots from <site>. ~2 min.

**Flow:**
1. `/ralph-researcher` → `extract-design.ts` → `workspace/references/<site-slug>/`.
2. The chat shows the extracted palette + typography + 3 screenshots → user confirms.
3. `/ralph-scenarist` → scenario referencing the design.
4. `/ralph-art-director` → prompts that pass the reference screenshots into `image_urls`.
5. `/ralph-editor` → render.

**Target:** ≤15 min total.

### B2. "Analyze @handle"

**Utterance:**
- EN: "look at what @handle does on TikTok", "break down <creator>'s style", "what's going viral for them"
- RU: "посмотри что делает @handle на TikTok", "разбери стиль <creator>", "что у них вирусится"

**Expected first response:**
> Pulling the top 10 videos for @handle, running viral-moments analysis. ~3 min.

**Flow:** `/ralph-researcher` sub-task `discover-trends` → `scrape-tiktok-trends.ts` → `scoreTikTok()` → top-N + analysis.

---

## C. Persona-required (gate active)

### C1. A real named person

**Utterance:**
- EN: "make a video with Elon Musk", "video where <real-celebrity> does <X>", "as <blogger>"
- RU: "сделай видос с Илоном Маском", "видео где <реальная-знаменитость> делает <X>", "от имени <блогер>"

**Expected first response (refusal with proposal):**
> "Чтобы сделать `<имя>` хорошо, мне нужна референс-картинка (фото лица, желательно 2-3 ракурса). Скинь сюда либо смени персонажа на безличного (`архетип: it-remote / courier / student`) — без референса делать не буду, выйдет хуже чем дешёвый AI-слоп."
>
> (English equivalent: "To do `<name>` well, I need a reference image (face photo, ideally 2-3 angles). Drop one in here, or switch to a generic archetype (`it-remote / courier / student`) — I won't generate without a reference, it'll come out worse than cheap AI slop.")

**After the reference arrives:**
- `assets/uploaded/<name>-ref.jpg` is saved.
- `logUserAsset(id, { kind: "photo", source: ..., purpose: "persona-ref" })`.
- `/ralph-art-director` uses the reference in `image_urls` for every keyframe.

### C2. A branded product

**Utterance:**
- EN: "video about Stripe", "ad for <brand>", "<product> packaging"
- RU: "видос про Сбербанк", "реклама <бренда>", "упаковка <product>"

**Expected first response (refusal with proposal):**
> Need a logo / packaging / brand kit. Drop a photo here or a link to the site — I'll pull it through `/ralph-researcher`.

### C3. The style of a specific show / channel

**Utterance:**
- EN: "in the style of show <X>", "like channel <Y>", "parody of <Z>"
- RU: "в стиле передачи <X>", "как у канала <Y>", "пародия на <Z>"

**Expected first response:** same as C1/C2 — reference is required.

### C4. Override (explicit consent)

**Utterance (literal phrase matchers — do not translate):**
- `"генерь без референса, я понимаю что качество будет хуже"`
- `"пофиг, сделай как получится"`
- EN equivalent the chat should also accept: `"generate without a reference, I know quality will be worse"`

**Flow:** ok → `logUserPrompt(id, { stage: "no-ref-consent", text: "..." })` → continue without a reference.

---

## D. Refusal cases (no override)

### D1. Length we can't deliver

**Utterance:**
- EN: "make a 5-minute film", "2-minute video"
- RU: "сделай 5-минутный фильм", "видос на 2 минуты"

**Expected response:**
> I'm built for short form (≤30s, optimal 15s). A 5-minute film is a different league and a different model — I'd more likely botch it than land it. We can split it into a series of ~20 shorts; or tell me which other tool you want to use and I'll help with prompts.

### D2. Incompatible content

**Utterance:**
- EN: "video with profanity for a kids' channel", "<contradictory brief>"
- RU: "видос с матом для детского канала", "<противоречивый brief>"

**Expected response:** an explicit clarifying question + a proposal of two non-contradictory branches.

### D3. Request with no grounding

**Utterance:**
- EN: "make a video about my grandma without a photo"
- RU: "сделай видос про мою бабушку без фото"

**Expected response:** see C — fall back to a generic archetype or ask for the reference.

### D4. Quality-gate failure × 2

After two failed regenerations (`scoreImage < 7` twice in a row):

> Can't get a quality image for slot `<id>` (attempts: 2, latest score: <n>). Options: a) drop a better reference, b) switch model (current is <m>), c) change the shot — e.g. close-up to medium.

---

## E. Batch tasks

### E1. "10 videos from a template"

**Utterance:**
- EN: "make 10 videos in style X on different topics", "run a series of N <template> about <area>"
- RU: "сделай 10 видосов в стиле X на разные темы", "запили серию из N <template> про <area>"

**Flow:**
1. `/ralph-producer` → brainstorm N non-repeating topics (LLM).
2. The chat shows the list → user confirms / edits.
3. `ralphy batch create --template <id> --topics <list>` → parallel launch of N projects via `batch-from-template`.
4. The chat reports back as a batch: rollup of costs + final mp4 paths.

**Target:** 10× 15s videos ≤25 min wall (parallel where possible), ≤$120 total.

### E2. "Review the batch"

**Utterance:**
- EN: "how's the batch", "status of batch <id>", "which ones came out OK"
- RU: "что там по батчу", "статус batch <id>", "какие из них норм"

**Flow:** `/ralph-producer` → `batch-review` → table `id | status | cost | score | render_path`.

---

## F. Template lifecycle

### F1. "Save project <id> as a template"

**Utterance:**
- EN: "make a template from <project>", "save this format for later"
- RU: "сделай шаблон из <project>", "сохрани этот формат на будущее"

**Flow:** `/ralph-producer` sub-task `template-extract` → `workspace/templates/<slug>/` with all five files + `reference-example.md` populated from the source project.

### F2. "What templates do we have"

**Utterance:**
- EN: "what's in templates", "show available templates"
- RU: "что у нас в шаблонах", "покажи доступные шаблоны"

**Flow:** `ralphy template list -p` — table.

### F3. "Suggest a template"

**Utterance:**
- EN: "which template fits <request>"
- RU: "какой шаблон под <запрос>"

**Flow:** `ralphy template suggest "<utterance>"` — top-3 ranked.

---

## G. Profile share

### G1. "Export my profile"

**Utterance:**
- EN: "export my profile <nick>", "share my templates"
- RU: "выгрузи мой профиль <nick>", "поделись моими шаблонами"

**Flow:** `ralphy profile export <nick>` → `profiles/<nick>/` with `PROFILE.md` + templates + references + projects (no renders).

### G2. "Import <nick>"

**Utterance:**
- EN: "pull profile <nick>", "import <nick> additively"
- RU: "подтяни профиль <nick>", "импортни <nick> доп"

**Flow:** `ralphy profile import <nick>` (additive). Use `--overwrite` if there are conflicts.

---

## Coverage check

After every major change to skills or the CLI, walk this file and confirm all examples still hold. If an utterance isn't covered, either add it, or document it as explicit out-of-scope.
