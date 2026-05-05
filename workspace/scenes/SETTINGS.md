# Scene settings — 9 архетипов локации

Источник: `TheMattBerman/ugc-factory-skill/SCENE_SETTINGS.md` + наш опыт.
Используется `/ralph-art-director` при `prepare-prompts` — выбор `setting` для
каждой сцены.

Каждая запись даёт: prompt fragments (готовые блоки для image/video promp'ов),
освещение, типичный camera angle, и под какой формат/persona лучше подходит.

## 1. Кухня (counter)

- **Prompt elements:** "kitchen counter, modern apartment, soft morning light
  through window, clean composition, kitchen utensils slightly visible in
  background, shallow depth of field"
- **Lighting:** natural soft daylight (window-side) или warm tungsten вечером
- **Camera angle:** medium close-up на talking head; для product — overhead
  или 3/4 high
- **Best for:** mom-blogger, wfh-worker; food/beverage, household, cooking
  apps, beauty (если "morning routine"), любые "обычный человек у себя дома"

## 2. Ванная (mirror)

- **Prompt elements:** "bathroom mirror, modern apartment, even bathroom
  lighting, hand reaching for product, mirror selfie composition"
- **Lighting:** even bright (vanity lights), без harsh shadows
- **Camera angle:** mirror-selfie POV (телефон в руке, в зеркале) или face-cam
  close-up
- **Best for:** beauty, skincare, dental, утренние routine, "честная" оценка
  продукта

## 3. Спортзал

- **Prompt elements:** "gym interior, soft natural light through high windows,
  fitness equipment slightly out of focus in background, motion blur on
  background figures"
- **Lighting:** mixed (overhead industrial + natural side), high contrast OK
- **Camera angle:** medium-wide (показать пространство), close-up на VO-моменты
- **Best for:** fitness apps, supplements, sportswear, energy drinks, productivity
  ("утром после зала")

## 4. Машина (POV из салона)

- **Prompt elements:** "POV from driver/passenger seat, car interior at night
  / day, dashboard partially visible bottom, urban environment through
  windshield, motion blur on streetlights, raindrops streaking on windshield
  (if night scene)"
- **Lighting:** night = neon + street lights + dashboard glow; day = natural
  через лобовое
- **Camera angle:** строго POV (handheld feel), telephone слегка наклонена
- **Best for:** courier-driver, taxi-driver persona; gig-work apps, fintech
  для самозанятых, навигация, "обычный пацан рассказывает по дороге"

## 5. Офис / open-space

- **Prompt elements:** "modern open-space office, monitors with dashboards
  visible (charts/numbers), other workstations slightly out of focus in
  background, even office lighting, business casual environment"
- **Lighting:** flat office overhead (cool white) + monitor glow на лицо
- **Camera angle:** medium close-up на лицо, monitor partially in frame для
  legitimacy
- **Best for:** marketer-perf, startup-founder; ad tech, analytics,
  performance-marketing tools, B2B SaaS

## 6. Метро / станция

- **Prompt elements:** "moscow metro station / train interior, fluorescent
  ceiling lighting, advertisement boards in background blurred, slight motion
  on background passengers, urban commuter atmosphere"
- **Lighting:** harsh fluorescent overhead + station ad-board glow
- **Camera angle:** handheld street-style, slight wobble, селfie-POV или 3/4
- **Best for:** gen-z-energy, courier-driver; "обычная ситуация по дороге",
  social platforms, mobile apps, food delivery

## 7. Спальня / morning light

- **Prompt elements:** "bedroom interior, soft morning light through curtains,
  unmade bed visible in background, person sitting on edge of bed or at desk
  with laptop, intimate domestic atmosphere"
- **Lighting:** soft warm directional sunlight через шторы
- **Camera angle:** medium close-up, lower height (sitting), warm intimate
- **Best for:** mom-blogger, gen-z-energy, wfh-worker; productivity ("утром
  смотрю что нужно сделать"), wellness, sleep apps, intimate-tone контент

## 8. Улица / двор

- **Prompt elements:** "russian residential courtyard, panel buildings in
  background slightly out of focus, autumn/winter light, person walking or
  standing near building entrance, urban Moscow / Spb atmosphere"
- **Lighting:** natural overcast (most common in RU climate) — soft, even,
  cool
- **Camera angle:** handheld walking selfie (vertical), wider shots для context
- **Best for:** courier-driver, wfh-worker; street-food, navigation, lifestyle,
  "обычный двор" relatability

## 9. Хакатон / коворкинг

- **Prompt elements:** "hackathon space at night / coworking space evening,
  multiple laptops visible, dramatic low-light environment with intense
  magenta and hot pink LED lighting creating strong color cast, ambient blue
  lights in background, abstract out-of-focus colorful lights"
- **Lighting:** dramatic low-light, magenta/cyan LED ambient, monitor glow
  на лицо
- **Camera angle:** selfie POV close (телефон в руке), shallow DoF, slight
  natural wobble
- **Best for:** startup-founder, it-remote, gen-z-energy; AI products, dev
  tools, "только что собрали MVP за ночь" контент, conference recap

## Применение в prompts.json

```jsonc
{
  "scenes": {
    "scene-01": {
      "setting": "hackathon-coworking",       // ← key из этого файла
      "promptFragments": [
        // художник копирует из соответствующего блока выше
        "selfie POV, hackathon space at night, dramatic magenta lighting...",
      ],
      "model": "fal-ai/nano-banana-pro/edit",
      ...
    }
  }
}
```

`/ralph-art-director` не копирует слепо — добавляет конкретику (одежда персоны
из `personality.context.wardrobe`, props, ракурс под scene-type из сценария).

## Анти-паттерны

- **Generic stock:** "office workspace, professional setting" — выходит как
  ad. Используй конкретику ("3 monitor дашборд, vlc плейлист в углу").
- **Несоответствие persona ↔ setting:** mom-blogger в хакатон-сетинге не
  работает. Проверь по `Best for` в каждом архетипе.
- **Слишком яркое освещение для "honest UGC":** flat soft light = home/cozy,
  dramatic light = dev/creative/night, неправильная пара = uncanny.
