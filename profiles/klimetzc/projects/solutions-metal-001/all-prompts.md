# Solutions METAL — все промпты генераций

Полный дамп всех промптов, отправленных в fal.ai, ElevenLabs и Lyria2 при создании ролика. Извлечено из чат-лога + исходников скриптов в `workspace/projects/solutions-metal-001/scripts/`. Сгруппировано по стадиям пайплайна в хронологическом порядке. Промпты — as-is, как уходили в API.

---

## Стадия 1 — Тестовые картинки (flux-pro/v1.1)

**Модель:** `fal-ai/flux-pro/v1.1`
**Скрипт:** `scripts/image-sample.ts`
**Shared style stack (суффикс):** `Soviet Svema film stock aesthetic, 1974, warm amber tones, heavy 35mm film grain, slightly faded color, soft dust and scratches, shallow depth of field, natural light, documentary photography, muted palette of olive-brown, cream, and warm red`
**Negative (не применялся, но был задан):** `modern objects, plastic, digital artifacts, logos, watermarks, text, blurry, deformed hands, extra fingers`

### 1.1 `01-folder` 
> Extreme close-up of two hands in white cotton laboratory gloves opening a beige cardboard file folder on a dark wooden desk. The folder has a bright red rubber stamp that reads in Cyrillic 'СЕКРЕТНО НИИ-27 ТКАНЬ-12'. Dim desk lamp from above-left casting warm golden light. Ashtray and fountain pen in soft focus. + STYLE_STACK

### 1.2 `06-commission` 
> A Soviet textile engineer in his early fifties, grey hair, wire-frame round glasses, white laboratory coat, wearing a crumpled black bucket hat made of crinkled metallic-cotton fabric on his head. He stands in a wood-panelled conference room in front of three stern committee members in dark suits sitting behind a long table with green cloth, glasses of water and folders in front of them. No one is smiling. Awkward formal atmosphere. Medium shot, eye level. + STYLE_STACK

### 1.3 `10-still-life` ы
> Flat-lay still life: four black fabric headwear items arranged on a raw concrete slab: two bucket hats and two structured caps, all made of crumpled crinkled black metallic-cotton fabric with a small polished metal DOD LOGO shield badge. Cold diffuse overhead studio light, no shadows, stark minimal, editorial look. Slight film grain but otherwise clean and modern. The hats sit in a loose rectangle with negative space between them. Concrete texture visible.

---

## Стадия 2 — v3 тестовые картинки (gpt-image-2)

**Модель:** `openai/gpt-image-2` (portrait_16_9, quality:high)
**Скрипт:** `scripts/image-sample-v3.ts` + 1 прямой MCP-вызов
**Shared fragments:**
- **FABRIC:** `heavily crumpled and densely wrinkled matte-black fabric with a faint metallic sheen. The surface shows permanent sharp creases and folds going in every direction, as if thick aluminum foil was compressed into a ball and then laminated with black cotton. Even flat areas keep a tactile wrinkled texture. Light catches the high points of the creases with a subtle grey-silver gleam. The fabric looks engineered and contemporary, not vintage worn cloth — it holds its shape independently.`
- **SOVIET_STYLE:** `Soviet 1974 archival look, warm amber tones, Svema 35mm film grain, soft dust, shallow depth of field, natural light from a single window, muted palette of olive, cream and warm ochre. Documentary realism.`
- **MODERN_STYLE:** `Contemporary editorial photography, cold neutral studio light, minimal composition, grey concrete and matte black surfaces, muted desaturated palette, clean and quiet — no film grain, no vintage filters, sharp focus.`
- **QUALITY_TAIL:** `Photorealistic, natural human anatomy with exactly five fingers per hand. Realistic hands are critical. No extra fingers. No deformed limbs. No warped text. If any Russian Cyrillic text appears, it must be clearly legible and correctly spelled.`

### 2.1 `04-commission`
> Vertical 2:3 archival-look photograph, Soviet 1974. A wood-paneled conference chamber with a long heavy wooden table covered in green felt, water carafes and glasses, closed folders. Three stern men in grey wool 1970s suits sit behind the table, unsmiling. In the foreground, in medium-shot from behind his shoulder, stands an older Soviet engineer in a white lab coat, grey hair, round glasses, holding up a single prototype bucket hat. The prototype bucket hat is made of {FABRIC}. The atmosphere is formal and awkward. No one is smiling. + SOVIET_STYLE + QUALITY_TAIL

### 2.2 `07-product-stilllife`
> Vertical 2:3 editorial still life, overhead flat-lay top-down composition. Four pieces of matte black contemporary headwear arranged in a loose rectangle on a raw grey concrete slab with visible hairline cracks and mineral speckles: two identical bucket hats (wide soft brim, crown pinched and wrinkled) in the top row, and two identical structured 6-panel caps with stiff curved visors in the bottom row. Each item has a small polished rectangular metal shield badge stitched onto the front. All four items are made of {FABRIC}. Diffused cold overhead studio light, minimal shadow, high-end product photography, clean negative space between items. No props, no typography, no human hands. + MODERN_STYLE + QUALITY_TAIL

*(Этот промпт также запускался напрямую через MCP `mcp__fal-ai__run_model` с output_format: jpeg)*

---

## Стадия 3 — Character references (nano-banana-pro)

**Модель:** `fal-ai/nano-banana-pro` (text-to-image), 2K PNG, 9:16
**Скрипт:** `scripts/refs-and-clip1.ts`

### 3.1 Grandfather portrait (identity anchor)
> Archival-style studio portrait photograph, vertical 2:3 composition, Soviet 1974. Soviet textile engineer in his mid to late fifties. Greying hair combed back, deep-set tired but intelligent eyes, round wire-frame glasses, a trimmed greying moustache and light stubble, weathered face with visible lines and pores. White laboratory coat over a simple grey shirt and thin dark tie. Serious, thoughtful expression. The man looks like an accomplished Soviet scientist, not an actor in costume. He stands against a muted olive-grey painted wall, looking slightly off-camera with a contemplative expression. Warm amber Svema 35mm film grain, soft natural light from a single window on the left, shallow depth of field. Documentary realism, not stylized or cartoonish. Photorealistic, natural human anatomy with exactly five fingers per visible hand. No deformities, no warped features. If any text appears in background (posters, labels), it must be clean correctly-spelled Russian Cyrillic.

### 3.2 Gleb references — загружены 3 исходных фото (не генерились)
Загружены на fal CDN: `gleb-01-fullbody-shirt-tie.png`, `gleb-02-mugshot-duo.png`, `gleb-03-adidas-hair-over-face.png`.

---

## Стадия 4 — Clip 1 keyframe (два варианта)

**Модель:** `fal-ai/nano-banana-pro/edit` (2K PNG, 9:16)

### 4.1 v1 — Gleb с тетрадью в современной студии *(отброшено — нужна советская эстетика с кадра 1)*
**Скрипт:** `scripts/refs-and-clip1.ts`
**Image refs:** 3 фото Глеба
> Cinematic vertical 9:16 portrait photograph. Setting: a minimalist contemporary atelier-workshop with raw grey concrete walls and matte-black steel industrial shelving in soft blurred background; on the shelves are neatly stacked rolls of black {FABRIC_TOKEN}. Foreground: A young slim man in his mid-twenties (Gleb Kostin). His defining feature is messy medium-length layered brown hair with subtle blond highlights that falls heavily over his forehead and partly covers his eyes. Pale skin, thin delicate jawline, faint light moustache just beginning. Narrow shoulders, reserved introverted posture. The hair is asymmetric and unstyled, slightly covering one side of the face. Keep the face and hair in the reference photos — same person, same hairstyle. He sits at a heavy raw-concrete table, wearing a plain black fine-knit turtleneck sweater. He holds open a worn 1970s Soviet-era cloth-bound notebook with a grey linen cover; the open page shows a hand-drawn technical diagram of a woven fabric cross-section and neat handwritten Cyrillic engineering notes (legible, correctly spelled Russian). His hands rest naturally on the notebook, fingers clearly visible and correctly formed (exactly five fingers on each hand). He looks slightly off-camera, composed and thoughtful, hair falling across his forehead as in the reference photos. Cold neutral studio light from above-left. Contemporary editorial photography, sharp focus, muted desaturated palette, clean quiet composition. No vintage film look, no grain, no filters. Preserve Gleb's face, hairstyle and body identity exactly as in the reference photos — this is the same person, just placed in a new setting.

### 4.2 v2 — руки деда на тетради 1974 *(финал)*
**Скрипт:** `scripts/keyframe-clip1-v2.ts`
**Image refs:** портрет деда
> Vertical 9:16 cinematic archival-style photograph, Soviet 1974, warm amber Svema 35mm film grain, heavy soft grain, period-accurate. Overhead close-up of a worn wooden laboratory desk. On the desk sits a weathered 1970s Soviet notebook with a grey cloth-bound cover and mildly frayed edges. Two elderly hands are opening the notebook at the moment captured by the frame: the hands belong to the grandfather in the reference photo — same man, same age, same wardrobe (white laboratory coat cuffs visible, white shirt cuffs underneath). His hands are natural, weathered, with visible veins and age spots, fingernails clean and trimmed, skin slightly wrinkled — exactly five fingers on each hand, correctly articulated, realistic anatomy. The opened page on the right reveals a careful hand-drawn technical cross-section diagram of a woven fabric (layered warp and weft threads labelled in Cyrillic handwriting, numerical annotations in blue-black ink), dated "12/IV – 1974 г." at the bottom. Text and drawing are clearly legible, correctly spelled Russian. Supporting props on the desk: a green bakelite USSR desk lamp on the right edge casts warm directional light across the notebook; a brass ink well; a used pencil; an enamel ashtray with cigarette butts partly out of frame. Colour palette: warm amber, olive brown, cream paper, dark walnut wood, muted ochre. Soft tungsten light source on the right, gentle shadows. No modern elements. No people visible beyond the hands and cuffs. Photorealistic documentary archival look, not stylized or illustrated. Sharp focus on the opening page, gentle motion blur on fingertips suggesting the hand is mid-action.

---

## Стадия 5 — 6 остальных keyframes (nano-banana-pro/edit)

**Скрипт:** `scripts/all-keyframes.ts` (sequential, 2K PNG, 9:16)
**Shared fragments:**
- **SVEMA_FRAME:** `The image is presented as a stylized archival photograph with a thin retro frame border containing vertical Cyrillic text 'СВЕМА 35' and 'ФОТОГРАФИЯ' on the edges — matching the style of the reference photos.`
- **SOVIET_STYLE:** SVEMA_FRAME + `Warm amber Svema 35mm film grain, heavy soft grain, aged paper, muted palette of olive, ochre, cream and warm red. Tungsten light sources. Documentary realism, photorealistic.`
- **MODERN_STYLE:** `Contemporary editorial photography, cold neutral studio light, sharp focus, clean quiet composition, muted desaturated palette, raw grey concrete and matte black surfaces. No film grain, no vintage filters, no archival frame.`
- **GRANDFATHER:** `the Soviet textile engineer in his mid to late fifties from the reference photo — same face, same greying hair combed back, same deep-set tired intelligent eyes, round wire-frame glasses, trimmed greying moustache, weathered face, white laboratory coat over grey shirt and thin dark tie. Preserve his identity exactly.`
- **GLEB:** `Gleb Kostin — the young slim man in the reference photos in his mid-twenties with messy medium-length layered brown hair with subtle blond highlights falling heavily over his forehead and partly covering his eyes, pale skin, thin delicate jawline, faint light moustache. Preserve his face and hairstyle identity exactly.`
- **FABRIC:** `heavily crumpled and densely wrinkled matte-black fabric with a faint metallic sheen, permanent sharp creases going in every direction, as if thick aluminum foil was compressed and laminated with black cotton, holding its shape independently`
- **ANATOMY:** `Photorealistic natural human anatomy with exactly five fingers per visible hand. No extra fingers, no deformed limbs.`

### 5.1 `clip-02-lab-microscope` (ref: grandfather)
> Vertical 9:16 wide documentary-style photograph from a Soviet textile research laboratory, 1974. {GRANDFATHER} He leans over a large brass optical microscope on a wooden workbench, intensely focused on a fabric sample under the lens. On the bench: glass pipettes in a wooden rack, small strips of {FABRIC}, laboratory beakers with amber liquid, paper notes. White glossy ceramic tile walls. Soft snow visible through a narrow high window on the right. A faded Soviet poster in Cyrillic on the wall. + ANATOMY + SOVIET_STYLE

### 5.2 `clip-03-three-samples` (ref: fabric three-samples)
> Reinterpret the exact composition of the reference photo as a stylized Soviet archival documentary photograph, 1974. Preserve the exact arrangement and all details from the reference: three black fabric samples on a grey concrete slab — crumpled ball on the left, flat wrinkled square in the center, folded origami bird on the right. Below each sample: a small white handwritten paper tag taped to the concrete, reading in Cyrillic "образец 1", "образец 2", "образец 3" — legible correctly-spelled Russian. Each sample is {FABRIC}. Apply warm amber Svema 35mm film grain, slight vignetting, aged paper tags, muted desaturated palette typical of 1974 archival photography. + SVEMA_FRAME

### 5.3 `clip-04-commission` (ref: grandfather)
> Vertical 9:16 Soviet 1974 archival photograph of a presentation to a ministry commission. Setting: a wood-paneled conference room, a long heavy wooden table covered in dark green felt, crystal water carafes, glasses, closed dark leather folders, pencils. Three stern middle-aged men in grey 1970s wool suits with thin ties sit behind the table, unsmiling, one writing notes. In the foreground, seen from behind his shoulder, {GRANDFATHER} holds up a single prototype bucket hat made of {FABRIC}. A red lacquered plaque on the wall behind the commission: "СССР · МИНЛЕГПРОМ · МОСКВА · 1974" in clean correctly-spelled Russian Cyrillic. Formal, awkward, quiet atmosphere. No one is smiling. + ANATOMY + SOVIET_STYLE

### 5.4 `clip-05-notebook-in-drawer` (ref: clip01notebook)
> Vertical 9:16 Soviet 1974 archival photograph. An older hand in a white lab-coat cuff places the same grey cloth-bound notebook from the reference photo at the bottom of an open wooden desk drawer. The same notebook — grey linen cover, frayed edges — is being gently set down among older papers, pencils, a small manila file folder tied with cotton string, a faded lab pass. Close-up, slightly overhead angle. The drawer is wooden with a brass keyhole, the interior worn from decades of use. Warm amber tungsten side-light from the right, slight dust motes visible. This is the moment of filing away the research and forgetting it. + ANATOMY + SOVIET_STYLE

### 5.5 `clip-07-gleb-wears-cap` (refs: 3x Gleb + bucket-front)
> Vertical 9:16 contemporary editorial portrait photograph, present day. {GLEB} He stands in a minimalist modern workshop in front of a raw grey concrete wall with softly blurred matte-black steel industrial shelving holding rolls of {FABRIC} in the background. He wears a plain black fine-knit turtleneck sweater. On his head he wears the exact matte-black METAL bucket hat from the cap reference photo — crumpled, heavily wrinkled, with the small polished metal shield badge visible on the front. The hat preserves its distinctive crinkled metallic-fabric surface from the reference. He looks directly into the camera, calm and confident, reserved introverted posture, no smile. Medium shot from the mid-chest up, slight three-quarter angle. + ANATOMY + MODERN_STYLE

### 5.6 `clip-08-still-life-notebook-cap` (refs: clip01notebook + bucket-front)
> Vertical 9:16 overhead top-down editorial still life photograph, present day. On a raw grey concrete slab with visible hairline cracks and mineral speckles: on the left, the same grey cloth-bound Soviet notebook from the first reference photo, open to the fabric cross-section diagram page (same notebook, same diagram, same Cyrillic handwriting). On the right, the same matte-black METAL bucket hat from the second reference photo — crumpled, wrinkled fabric with visible permanent creases, polished metal shield badge facing up. A small amount of empty negative space between the two objects. No hands, no props beyond these two objects, no typography overlays. Cold neutral overhead studio light, minimal shadow. + MODERN_STYLE

---

## Стадия 6 — Video i2v trials (перед тем как вышли на финальный стек)

### 6.1 Seedance 2.0 v1 *(украинский голос — отклонено)*
**Endpoint:** `bytedance/seedance-2.0/image-to-video`, 9:16, 720p, 8s, generate_audio:true
**Start image:** grandfather hands on notebook
> Static overhead locked-off shot of the wooden Soviet 1974 laboratory desk. The grandfather's weathered hands — already placed at the open notebook — remain very still. Over 8 seconds, his right index finger slowly traces down along the hand-drawn technical cross-section diagram of the woven fabric on the open page, pausing near the date line '11/III — 1974 г.' The amber tungsten desk lamp light stays warm and steady; faint dust motes drift gently through the beam. The paper has subtle minute breathing as if a pen was just set down. No camera movement. No other people in frame. Preserve the warm amber Svema 35mm film grain look and the СВЕМА 35 archival frame border exactly as in the start image.
>
> AUDIO — synchronized and generated:
> Ambient: very subtle paper rustle, soft distant tick of a mechanical clock, faint warm hum of the lamp. No music.
>
> VOICEOVER — off-screen narrator only, no one on camera speaks or has a visible mouth. A single male Russian-speaking voice in his mid-twenties (around 25 years old), calm, measured, deadpan delivery, unhurried, thoughtful pauses, introspective. Warm middle register, slightly dry timbre, quiet and reserved — NOT a broadcaster or actor voice. Slight natural Moscow intonation. He speaks the following line in Russian exactly, with a soft pause after each period:
> «Мой дед был инженером-материаловедом. В семьдесят четвёртом году, в закрытом НИИ под Москвой, он придумал ткань, которая запоминает форму.»

### 6.2 Seedance 2.0 v2 + LANGUAGE LOCK *(все ещё славянский акцент, не русский)*
**Endpoint:** `bytedance/seedance-2.0/image-to-video`, 9:16, 720p, 8s, generate_audio:true
> Static overhead locked-off shot of the wooden Soviet 1974 laboratory desk. [...same as v1 video description...]
>
> AUDIO — synchronized and generated: Ambient — very subtle paper rustle, soft distant tick of a mechanical clock, faint warm hum of the lamp. No music.
>
> VOICEOVER — off-screen narrator only, no one on camera speaks or has a visible mouth, so no lip-sync is required.
>
> LANGUAGE LOCK: The voice-over is spoken in STANDARD LITERARY RUSSIAN (ru-RU, Moscow dialect, Russian Federation Russian). It is NOT Ukrainian, NOT Belarusian, NOT Polish, NOT any other Slavic language. Use native Russian phonetics only: hard voiced velar 'г' like the English 'g' in 'go' (never the Ukrainian soft fricative 'h'), standard Moscow vowel reduction (аканье) where unstressed 'o' becomes schwa, clear front 'и' (never the Ukrainian 'i' or 'y'), standard Russian palatalization only before soft vowels. Zero Ukrainian, Belarusian or Polish accent coloring.
>
> VOICE CHARACTER: A single male Russian-speaking voice, around 25 years old, calm and measured deadpan delivery, unhurried, with thoughtful pauses between sentences, no theatricality, no broadcaster tone, no selling energy. Warm middle register, slightly dry, introspective, reserved. He sounds like a quiet young craftsman narrating his grandfather's story.
>
> He speaks the following line IN RUSSIAN, exactly as written, with a natural short pause after each period:
> «Мой дед был инженером-материаловедом. В семьдесят четвёртом году, в закрытом НИИ под Москвой, он придумал ткань, которая запоминает форму.»
>
> Do NOT translate. Speak Russian only.

### 6.3 Veo 3.1 8s *(русский голос есть, но старческий + текст обрывается на половине)*
**Endpoint:** `fal-ai/veo3.1/image-to-video`, 9:16, 1080p, 8s, generate_audio:true, safety_tolerance:6
**Negative:** `Ukrainian language, Ukrainian accent, Ukrainian pronunciation, Belarusian accent, Polish accent, soft Ukrainian fricative г, Ukrainian palatalization, Ukrainian intonation, translation into English, any non-Russian language, visible speaking mouth, lip-sync, camera movement, zoom, pan, tilt, shaking, blur, modern objects, electric lighting, plastic`
> [Тот же video description] + AUDIO + VOICE-OVER + LANGUAGE LOCK + VOICE CHARACTER + text «Мой дед был инженером-материаловедом. В семьдесят четвёртом году, в закрытом НИИ под Москвой, он придумал ткань, которая запоминает форму.» Do NOT translate. Speak Russian only.

### 6.4 Kling v3 Pro 15s *(по доке поддерживает только Chinese + English TTS — не сработало)*
**Endpoint:** `fal-ai/kling-video/v3/pro/image-to-video`, 15s, generate_audio:true, cfg_scale:0.55
**Negative:** `blur, distort, low quality, Ukrainian accent, Ukrainian language, Ukrainian pronunciation, Belarusian accent, Polish accent, English language voice-over, Chinese language voice-over, translation, camera movement, zoom, pan, tilt, shaking, visible speaking mouth, modern objects, plastic, electric lighting`
> Static overhead locked-off shot of the wooden Soviet 1974 laboratory desk. The grandfather's weathered hands remain very still on the open notebook. Over 15 seconds, his right index finger slowly traces down along the hand-drawn technical cross-section diagram of the woven fabric on the open page, pausing at the date line near the bottom, then gently turns a corner of the page. [...]
>
> STRICT LANGUAGE LOCK — THIS IS CRITICAL:
> The voice-over MUST be spoken in STANDARD RUSSIAN LANGUAGE (Russian Federation, Moscow dialect, ru-RU locale). NOT English. NOT Chinese. NOT Ukrainian. NOT translated. [...]
>
> VOICE CHARACTER: A single male voice around 25 years old, young adult (NOT elderly, NOT middle-aged). [...]
>
> Duration target: ~13 seconds of speech over 15 seconds of video. DO NOT TRANSLATE:
> «Мой дед был инженером-материаловедом. В семьдесят четвёртом году, в закрытом НИИ под Москвой, он придумал ткань, которая запоминает форму.»
> Русский язык. Мужской голос, 25 лет, спокойный, размеренный. Стандартное московское произношение.

**Вердикт по стадии 6:** все три модели с встроенным TTS провалились на русском → переход на Kling v3 Pro video-only + ElevenLabs VO.

---

## Стадия 7 — Voice tests (ElevenLabs)

**Endpoint:** `api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`
**Model:** `eleven_multilingual_v2`
**Скрипт:** `scripts/voice-sample.ts`

**Test text (один и тот же):**
> Тысяча девятьсот семьдесят четвёртый. Нам сказали: сделайте ткань, которая держит форму. Хлопок у нас был. Алюминий был. Проблема была одна: они не хотели жить вместе.

**Candidates:**
| voice_id | label | stability | similarity | style |
|---|---|---|---|---|
| `2EiwWnXFnvU5JabPnv8n` | clyde-warvet | 0.55 | 0.75 | 0.25 |
| `CYw3kZ02Hs0563khs1Fj` | dave-british-mature | 0.6 | 0.75 | 0.15 |
| `onwK4e9ZLuTAKqWW03F9` | daniel-deep | 0.6 | 0.75 | 0.15 |

Все были отброшены пользователем. Финальный voice — `m0OQuJtWCw1V23P0pQmG`.

---

## Стадия 8 — Финальный VO (ElevenLabs, 8 сцен)

**Модель:** `eleven_multilingual_v2`
**Voice:** `m0OQuJtWCw1V23P0pQmG`
**Settings:** `{ stability: 0.55, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true }`
**Скрипт:** `scripts/voiceover-final.ts`

| slug | text |
|---|---|
| `clip-01` | Мой дед был инженером-материаловедом. В семьдесят четвёртом году, в закрытом НИИ под Москвой, он придумал ткань, которая запоминает форму. |
| `clip-02` | Хлопок снаружи, тончайшая алюминиевая фольга посередине. Ткань ведёт себя как металл, но остаётся мягкой. Принимает любую форму — и держит её. |
| `clip-03` | На третьей попытке удалось стабилизировать слои. Первые два ушли в брак. Третий — получилось. |
| `clip-04` | В том же году разработку показали комиссии. Сказали — непрофильно. Алюминий уходил на оборону, хлопок — на полотенца. Закрыли. |
| `clip-05` | Тетрадь с записями деда пролежала в ящике стола больше полувека. |
| `clip-06` | Мы достали её прошлой зимой. Разобрали формулы заново и собрали небольшое производство с нуля. |
| `clip-07` | Тот же композит. Хлопок снаружи, металл внутри. Ткань, которая не повторяет форму. Она её создаёт. |
| `clip-08` | Одна идея. Две эпохи. Между ними — полвека, один ящик и одно имя. COTTON METAL. |

Плюс `full-master.mp3` — весь текст одним блоком, 8 реплик через `\n\n`.

---

## Стадия 9 — Финальные 8 клипов (Kling v3 Pro video-only)

**Endpoint:** `fal-ai/kling-video/v3/pro/image-to-video`
**Shared params:** `generate_audio: false`, `cfg_scale: 0.55`
**Скрипт:** `scripts/all-clips-kling.ts`

**Shared negative:**
> blur, distort, low quality, camera shake, handheld, visible speaking mouth, talking face, dialog, subtitles, text overlays, modern objects in Soviet scenes, plastic, electric modern lighting, warped hands, extra fingers

**Shared suffixes:**
- **PRESERVE_SOVIET:** `Preserve the warm amber Svema 35mm film grain and the СВЕМА 35 archival frame border from the start image. No camera movement unless explicitly stated.`
- **PRESERVE_MODERN:** `Preserve the cold neutral editorial studio look from the start image. Sharp focus, clean quiet composition, no grain.`

### 9.1 clip-01 (9s)
> Overhead locked-off static camera. The grandfather's weathered hands stay on the open 1974 notebook. His right index finger moves slowly, deliberately, from the top of the hand-drawn fabric cross-section diagram down to the date line at the bottom, tracing the drawing with care. The amber desk lamp light stays warm and steady; tiny dust motes drift very slowly through the beam. The paper breathes minutely. No other motion, no other people. {PRESERVE_SOVIET}

### 9.2 clip-02 (11s)
> Medium static shot. The grandfather leans over the brass microscope. Over 11 seconds he slowly adjusts the focus knob with his right hand, leans back an inch to regard a strip of black crinkled fabric beside him on the bench, then returns his eye to the eyepiece. The liquid in the amber-filled beaker swirls faintly. Snow drifts softly past the high window behind. His body moves calmly, minimally. No zoom, no pan. {PRESERVE_SOVIET}

### 9.3 clip-03 v1 (7s) *(позже перегенерён)*
> Top-down static overhead camera. The composition of three black fabric samples on concrete remains exactly as in the start image. A faint draft causes the corners of the white paper labels ("образец 1", "образец 2", "образец 3") to flutter gently. The origami bird sample twitches minutely. The square sample has minute surface shimmer as light catches its wrinkled metallic fabric. No camera movement. {PRESERVE_SOVIET}

### 9.4 clip-04 (10s)
> Very slow, very subtle dolly-in from the engineer's shoulder-POV toward the three commissioners sitting behind the green-felt table. Over 10 seconds the camera creeps forward a few centimeters. The commissioners shift only slightly — the middle one writes a single line in his notebook, the right one adjusts his glasses, the left one stays still. The engineer's right hand holding the prototype bucket hat stays steady in the foreground. Formal, awkward silence. {PRESERVE_SOVIET}

### 9.5 clip-05 (5s)
> Close-up static camera on the open wooden desk drawer. The grandfather's hand in its white coat cuff releases the grey notebook, then withdraws gently up and out of frame. Over the next 3 seconds the drawer itself slides slowly closed about two-thirds of the way, stopping with a soft wooden thud. Dust motes drift in warm side-light. No other motion. {PRESERVE_SOVIET}

### 9.6 clip-06 (7s)
> Locked-off medium portrait shot. Gleb sits at the concrete table with his hand on the open notebook, initially looking down at the page. Over 7 seconds he slowly lifts his gaze up to the camera, direct and calm, with one natural blink midway. His breathing is natural and slow. His hair shifts only slightly as he moves his head. No camera movement. {PRESERVE_MODERN}

### 9.7 clip-07 v1 (8s) *(позже перегенерён дважды)*
> Locked-off medium chest-up shot. Gleb wears the black crumpled METAL bucket hat and keeps looking directly into the camera with a calm, composed expression. Over 8 seconds he breathes naturally, has one slow natural blink around the 4-second mark, and his hair shifts minutely from his breath. No smile. No camera movement. No zoom. The crumpled metallic fabric of the hat catches the light slightly as his head holds still. {PRESERVE_MODERN}

### 9.8 clip-08 v1 (8s) *(позже переделан — старый clip-07 стал финалом)*
> Top-down overhead camera begins tight on the notebook and bucket hat on the concrete slab exactly as in the start image. Over 8 seconds the camera performs an extremely slow, smooth vertical dolly upward, revealing slightly more of the surrounding concrete and the empty negative space between the two objects. Neither object moves. No other motion. {PRESERVE_MODERN}

---

## Стадия 10 — Музыка v1 (Lyria2, советская ностальгия)

**Endpoint:** `fal-ai/lyria2`
> Instrumental background score, nostalgic Soviet-era atmosphere, 1970s Soviet documentary film style. Slow tempo around 60 BPM, minor key, warm analog synthesizer pads with subtle tape hiss, soft sustained strings, occasional distant accordion touches, very gentle melancholy but reflective and dignified — not sad. Quiet and unhurried, suitable as a background score behind a calm male voice-over narration. No vocals, no lyrics, no drums, no percussion hits, no strong melodic hooks. Must stay subtle and atmospheric so a voice-over sits clearly above it. Long sustained chords, slow evolving texture, analog warmth, low register emphasis. Duration 60 seconds.

**Negative:** `low quality, loud drums, strong percussion, aggressive beats, vocals, singing, lyrics, rap, electric guitar solo, dubstep, modern EDM, fast tempo, distortion, loud brass, jazzy swing, heavy bass drops`

*(Вышел 32.77s трек → в ffmpeg `acrossfade=d=3:c1=tri:c2=tri` зациклил в 62.57s. Позже заменён пользовательским TikTok-треком и далее сдвинут только на первые 5 сцен.)*

---

## Стадия 11 — Перегенерации по фидбеку

### 11.1 Clip 3 v2 — рука мнёт образец (Kling v3 Pro, 7s)
**Start image:** `0a97448b/rxeBlW_0h8PxvgEtIsBM-_qrJdBGBm.png`
**Negative:** `blur, distort, low quality, camera shake, handheld, visible speaking mouth, talking face, dialog, subtitles, text overlays, modern objects in Soviet scenes, plastic, electric modern lighting, warped hands, extra fingers, fabric springing back flat`
> Top-down static overhead camera, locked-off. The composition of three black fabric samples on concrete with paper labels (образец 1, 2, 3) remains exactly as in the start image. From outside the top of the frame, a single bare hand (weathered, older man, in a white lab-coat cuff) enters slowly and reaches toward the middle square sample (образец 2). The hand grasps the square fabric with the fingertips, slowly lifts its corner about two centimeters off the concrete, gently crumples the fabric inward by squeezing the fingers, then releases and withdraws back up and out of the frame. After release, the fabric does NOT spring back flat — it holds the new crumpled shape, with deep creases and folds locked into the metallic surface. The other two samples (образец 1 origami bird and образец 3) stay still. No camera movement. No other people. Preserve the warm amber Svema 35mm film grain and the СВЕМА 35 archival frame border from the start image.

### 11.2 Clip 7 keyframe v2 — Gleb reshapes hat (nano-banana-pro/edit, 2K)
**Image refs:** 3x Gleb + bucket-front
> Vertical 9:16 photograph, 1080x1920. The young man GLEB from reference photos 1-3 (same face, same long dark hair parted in the middle falling to his jaw, same slender build, mid-20s) is sitting at a cold gray polished concrete studio table, chest-up waist-up framing. He holds the heavily crumpled matte-black METAL bucket hat from reference photo 4 in BOTH hands in front of him, roughly chest height, actively reshaping it mid-action: his left hand presses the crown of the hat inward and slightly down, his right hand grips the brim and bends it upward into a new asymmetric fold. His head is tilted down slightly, eyes focused on the hat he is working with, lips neutral. The fabric of the hat is clearly mid-deformation with fresh dents and creases visible, hinting that it will hold whatever shape he gives it. Wearing a plain dark gray crew-neck t-shirt. Cold neutral editorial studio lighting, soft shadows, sharp focus, no grain, quiet clean composition. Plain pale concrete wall behind him out of focus. No text, no logos, no UI elements, no watermarks, no borders. Photographic realism.

### 11.3 Clip 7 v2 — Reshape motion (Kling v3 Pro, 8s)
**Start image:** новый keyframe (11.2)
**Negative:** `blur, distort, low quality, camera shake, handheld, visible speaking mouth, talking face, dialog, subtitles, text overlays, warped hands, extra fingers, hat springing back to original shape, hat returning to flat, magical transformation, morphing`
> Locked-off medium chest-up static shot. The young man Gleb sits at the concrete studio table holding the crumpled matte-black METAL bucket hat in both hands. Over 8 seconds he works on the hat with calm, deliberate, almost sculptural hands: his left hand slowly presses the top of the crown downward and inward, collapsing it into a new deeper fold; his right hand grips the brim and slowly bends it upward, rotating the hat a few degrees. After the reshape, he loosens his grip and lets the hat rest in his palms for the final second — the fabric holds the new asymmetric shape, does NOT spring back. His eyes stay focused on the hat, no smile. Gentle natural breathing. No camera movement. No zoom. Preserve the cold neutral editorial studio look from the start image. Sharp focus, clean quiet composition, no grain.

*(Старый clip-07 v1 был скопирован в slot clip-08 для финальной сцены с COTTON METAL title.)*

### 11.4 Clip 7 v3 — Fashion lookbook presentation (Kling v3 Pro, 8s)
**Start image:** тот же keyframe (11.2)
**Negative:** `blur, distort, low quality, camera shake, handheld, visible speaking mouth, talking face, dialog, subtitles, text overlays, warped hands, extra fingers, hat disappearing, hat changing color, smiling, goofy expression, awkward pose`
> Locked-off medium chest-up static shot. Gleb sits at the concrete studio table holding the crumpled matte-black METAL bucket hat in both hands. Over 8 seconds he performs a slow confident model-like product presentation: seconds 0-3 he lifts the hat up in front of his chest and slowly rotates it about 30 degrees to the right then back to center, showing the crumpled metallic texture to the camera; seconds 3-5 he uses his left hand to press the crown inward, reshaping one deep fold that stays locked in; seconds 5-8 he raises the hat above his head with both hands and places it firmly on his head, then lowers his hands and gives one small confident head-tilt toward the camera. His face stays calm, composed, no smile, like a fashion lookbook model. Cold editorial studio light, sharp focus, no grain, quiet minimalist composition. No camera movement.

---

## Стадия 12 — Хип-хоп трек (Lyria2)

**Endpoint:** `fal-ai/lyria2`
> Modern dark hip-hop instrumental, heavy 808 trap bass, moody minimalist beat around 80 BPM, confident contemporary fashion-brand vibe, atmospheric lo-fi texture with subtle synth pad, clean punchy kick that hits hard on the one, no vocals, no lyrics, no ad-libs, no singing, no human voice, purely instrumental

**Negative:** `vocals, lyrics, singing, rapping, ad-libs, human voice, talking, whispers, cheerful pop, upbeat rock, orchestral, jazz, country`

*(Вышел 32.8s WAV → сконвертирован в 192k MP3 → используется на 22.47s отрезке clips 6–8.)*

---

## Сводка endpoints и моделей

| Категория | Endpoint / Model | Вызовов | Комментарий |
|---|---|---|---|
| Test images | `fal-ai/flux-pro/v1.1` | 3 | Первые пробники — отброшены |
| Test images v3 | `openai/gpt-image-2` | 2 | Нашли JPEG-артефакты → PNG |
| Character refs | `fal-ai/nano-banana-pro` (text2img) | 1 | Grandfather portrait |
| Keyframes | `fal-ai/nano-banana-pro/edit` | 9 | 8 сцен + 1 регенерация clip-07 keyframe |
| Video i2v trials | `bytedance/seedance-2.0/image-to-video` | 2 | Украинский акцент |
| Video i2v trials | `fal-ai/veo3.1/image-to-video` | 1 | Старческий голос + обрыв |
| Video i2v trials | `fal-ai/kling-video/v3/pro/image-to-video` (audio) | 1 | TTS только Chinese/English |
| Final videos | `fal-ai/kling-video/v3/pro/image-to-video` (no audio) | 8 + 3 regen | 9.1–9.8 + 11.1, 11.3, 11.4 |
| Voiceover tests | ElevenLabs `eleven_multilingual_v2` | 3 | clyde / dave / daniel — отброшены |
| Voiceover final | ElevenLabs `eleven_multilingual_v2` + `m0OQuJtWCw1V23P0pQmG` | 9 | 8 сцен + master track |
| Music | `fal-ai/lyria2` | 2 | Soviet nostalgic (v1, потом заменён) + hip-hop |
