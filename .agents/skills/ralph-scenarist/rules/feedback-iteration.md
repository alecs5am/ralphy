# Feedback iteration

## When this fires

User дал feedback на existing scenario:
- "scene 2 weak" / "rework hook" / "tighten VO clip 4"
- "сделай покороче" / "удлинни"
- "поменяй persona" / "поменяй setting"
- "VO слишком быстрый/медленный"

## Шаги (surgical)

1. **Лог feedback verbatim — самое важное:**
   ```bash
   ralphy project log-prompt <id> --text "<feedback>" --stage scenario-feedback
   ```
   Это cheapest durable record. Без него история контекста теряется.

2. **Read current `scenario.json`** + конкретные секции которые feedback targets.

3. **Apply surgically** — не переписывай untouched scenes:
   - Сохраняй scene IDs где возможно (`scene-01`, `scene-02`, ...) — downstream `prompts.json` / `asset-manifest.json` keys на них.
   - Если scene split / removed — note это **explicitly** в diff чтобы art-director знал какие slots stale.
   - Не меняй voice / persona / setting если feedback не про них.

4. **Recompute timing если изменился duration:**
   - Update top-level `durationSec` / `durationFrames`.
   - Проверь sum(scenes) ≤ duration.

5. **Re-run quality gate:**
   ```bash
   ralphy project score <id>
   ```
   Если fail — fix → re-run.

6. **Diff summary в чат** — sanity-check before art direction spends $:
   > "scene-02 VO с 5 строк → 3; hook переписан; duration 32s → 28s; scene-04 unchanged."

## Cost-aware handoff

После feedback'а определи **что именно регенерировать**:

| Изменилось | Что регенерим в art-director |
|---|---|
| Только VO text | Только voiceover slots (cheap, ~$0.30/scene) |
| Hook scene полностью | scene-01 image + video + VO + caption |
| Visual без VO | Image + video, не VO |
| Setting / persona | Все image + video slots, не VO |
| Pacing / timing | Только composition (editor), ничего не регенерим |
| Captions style | Только composition (editor) |

Hand off с **explicit нотой**: "только voiceover slots: scene-02, scene-03". Это экономит пользователю $$.

## Iteration limit

Если на одной scene было ≥3 feedback'ов и она всё ещё не landing — стоп, пользователю:
> "Scene-XX переделана 3 раза, не сходимся. Опции: a) скинь reference-кадр того что хочется, b) сменим эту scene на другой beat, c) скажи в одном предложении что должно работать в этой scene. Без этого продолжать = просто жечь время."

## Hand off rules

- Visual + VO changes → `/ralph-art-director` full regen для affected scenes.
- VO-only changes → `/ralph-art-director` с note "VO only" (saves money).
- Composition / pacing only → `/ralph-editor` (assets уже годятся).
- Если feedback требует фундаментально нового brief → handback в `/ralph-producer` для clarify с пользователем.
