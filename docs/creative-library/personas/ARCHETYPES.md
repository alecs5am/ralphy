# Personas — архетипы (RU UGC)

8 базовых архетипов, адаптированных из `TheMattBerman/ugc-factory-skill/CHARACTER_LIBRARY.md`
для русскоязычной UGC-аудитории. Используются как vibe-anchor при создании
конкретной персоны через `bun run ralph -- persona create --archetype <key> ...`.

Архетип — это **vibe + контекст**, не конкретный человек. Конкретная persona
наследует от архетипа и переопределяет: имя, voice clone (ElevenLabs), точную
внешность, конкретные props.

## Сводная таблица

| Key | Архетип | Demo | Setting | Energy | Best for |
|---|---|---|---|---|---|
| `student-grind` | Студент-работяга | 19-23, M/F | Общага, кафешка, ноут на коленях | Чуть нервный, энергичный | EdTech, financial apps, productivity |
| `it-remote` | IT-шник на удалёнке | 26-34, M | Дома за столом, кухня, кофейня | Усталый-ироничный | Dev tools, AI products, SaaS |
| `courier-driver` | Курьер / таксист | 22-35, M | Машина, улица, подъезд | Прагматичный, прямой | Gig work apps, financial, mobile |
| `mom-blogger` | Мамочка-блогер | 28-38, F | Кухня, гостиная, детская | Тёплая, искренняя | Beauty, household, kids, food |
| `gen-z-energy` | Энергичный Z-зумер | 18-24, M/F | Спальня, улица, метро | Громкая, быстрая, мемная | Fashion, music, social platforms |
| `startup-founder` | Стартап-фаундер | 28-38, M/F | Коворкинг, домашний офис, café | Уверенно-усталая | B2B SaaS, dev tools, AI agents |
| `marketer-perf` | Маркетолог-перформер | 26-34, M/F | Офис, монитор с дашбордом | Сухо-данные, пунктирно | Ad tech, analytics, performance |
| `wfh-worker` | Удалённый сотрудник | 24-40, M/F | Хоум-офис, гостиная | Спокойная, "как у всех" | Productivity, comms, hardware |

## Детально

### `student-grind` — Студент-работяга

- **Demo:** 19-23, парень или девушка, регион/Москва.
- **Appearance:** простая толстовка/рубашка, волосы как удобно, взгляд
  чуть невыспавшийся, очки если IT/мат специальность.
- **Setting:** общежитие, тесная съёмная, кофейня с открытым ноутом, парта
  в библиотеке. Фон с книгами / постером / банкой энергетика.
- **Personality:** энергичный, чуть нервный, говорит быстро на одной волне.
  Frame: "только что разобрался" → "кстати, сейчас покажу".
- **Speaking style:** разговорный, междометия ("ну в общем", "короче",
  "слушайте"), без бизнес-терминов.
- **Best for:** EdTech, финансовые приложения для студентов,
  productivity, summary-tools, AI tutoring.

### `it-remote` — IT-шник на удалёнке

- **Demo:** 26-34, мужчина (есть ж-вариант, не дефолт), Мск/Питер/удалёнка.
- **Appearance:** толстовка / oversized тшка, чёрный/тёмный, борода 1-2 недели,
  средние волосы, AirPods могут торчать. Очки опционально.
- **Setting:** домашний кабинет с механической клавиатурой, кухня с
  пуровером, пустая кофейня в нерабочий час. Тёмный/тёплый свет.
- **Personality:** усталый-ироничный, deadpan. "Я делал это 5 раз и
  каждый раз всё ломалось". Не пафосный, не motivational.
- **Speaking style:** короткие фразы, технический жаргон без объяснений
  (имеется ввиду что зритель свой), pауза после bombshell.
- **Best for:** dev tools, AI products для разработчиков, SaaS, infra,
  productivity, code editors, terminal apps.

### `courier-driver` — Курьер / таксист

- **Demo:** 22-35, мужчина, любой регион, frequently не-московский акцент.
- **Appearance:** куртка курьерской службы / просто тёплая куртка, шапка,
  телефон в подставке.
- **Setting:** машина (POV из салона), подъезд, лифт, тротуар возле
  ресторана.
- **Personality:** прагматичный, прямой, без лишних эмоций. "Не работает —
  не работает." Без romanticизма.
- **Speaking style:** простые предложения, факты, конкретные цифры
  (заработал X, проехал Y, потратил Z).
- **Best for:** gig-work приложения, финансы для самозанятых, навигация,
  мобильные сервисы, банковские карты.

### `mom-blogger` — Мамочка-блогер

- **Demo:** 28-38, женщина, регион/средний.
- **Appearance:** удобная домашняя одежда (свитер, лонгслив), минимум
  макияжа, естественные волосы, иногда с малышом на руках в кадре.
- **Setting:** кухня (counter), гостиная (диван), детская (на полу с
  игрушкой), реже street/store.
- **Personality:** тёплая, искренняя, разговорно-доверительная. "Я тебе
  как подруге расскажу." Может смеяться над собой.
- **Speaking style:** мягкая интонация, обращение на "ты", уменьшительные
  ("творожок", "малышка").
- **Best for:** beauty, household, детское, готовая еда, food delivery,
  семейные банковские продукты.

### `gen-z-energy` — Энергичный Z-зумер

- **Demo:** 18-24, M/F, городской.
- **Appearance:** яркие цвета, аксессуары (цепи, рюкзак, наушники Pop-art),
  крашеные волосы могут быть, активный макияж/без.
- **Setting:** спальня с лампой/постерами, улица/метро, primark-fitting-style,
  TikTok house vibes.
- **Personality:** громкая, быстрая, мемная. Смена интонации каждые 2s.
  Reference-heavy (другие тренды, мемы, аниме).
- **Speaking style:** zoomer-сленг (но без перебора — токсично), сокращения,
  filler words.
- **Best for:** fashion, music apps, social platforms, dating, snack/energy
  brands, gaming.

### `startup-founder` — Стартап-фаундер

- **Demo:** 28-38, M или F, городской, Mск/EU/SF.
- **Appearance:** simple-tshirt or henley, минимум, watch может быть,
  волосы аккуратно но без пафоса.
- **Setting:** коворкинг (видны другие столы за блюром), домашний офис
  с whiteboard'ом, café с ноутом.
- **Personality:** уверенная-усталая. "Мы пытались X, не вышло, теперь Y."
  Опытная, без bullshit'а.
- **Speaking style:** конкретные числа (MRR, retention), названия продуктов,
  никаких "game-changing" / "amazing".
- **Best for:** B2B SaaS, dev tools, AI agents, productivity для команд,
  fintech для бизнеса.

### `marketer-perf` — Маркетолог-перформер

- **Demo:** 26-34, M/F, городской.
- **Appearance:** business casual, рубашка/блузка, аккуратные волосы,
  очки часто.
- **Setting:** open-space офис с мониторами, видны графики/дашборды на фоне.
- **Personality:** сухо-данные, пунктирно. "За 2 недели CTR вырос с 1.2%
  до 3.8%." Никакой лирики.
- **Speaking style:** числовые факты, abbreviations (CTR, CPA, ROAS), пауза
  для эффекта после bombshell-цифры.
- **Best for:** ad tech, analytics, performance-marketing tools, growth tools,
  attribution.

### `wfh-worker` — Удалённый сотрудник

- **Demo:** 24-40, M/F, средний.
- **Appearance:** обычная домашняя одежда (футболка, толстовка), без
  претензий, "как любой из нас".
- **Setting:** домашний офис (книжная полка / простой фон), гостиная
  (диван), кухня в обед.
- **Personality:** спокойная, нейтральная, "одна из нас". Без drama,
  без motivational tone.
- **Speaking style:** обычная разговорная речь, без сленга и без жаргона.
- **Best for:** productivity, comms (Slack/чаты), hardware (камеры,
  микрофоны), эргономика, time-management.

## Использование

Создать конкретную персону на основе архетипа:

```bash
bun run ralph -- persona create \
  --name "Aleks IT 27" \
  --archetype it-remote \
  --voice "elevenlabs:eleven_multilingual_v2/<voice-id>" \
  --setting "home office, mechanical keyboard, dark room" \
  --energy "deadpan, ironic"
```

Архетип — vibe-anchor, persona — конкретный человек с лицом и голосом.
