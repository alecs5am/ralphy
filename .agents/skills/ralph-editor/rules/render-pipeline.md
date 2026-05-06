# Render pipeline

## Author-composition

**When:** asset-manifest полный, composition отсутствует или нужны правки.

### Decide composition target

- **Base `UGCVideo`** — для сценариев match generic data-driven layout. Просто пиши/обнови `composition-props.json`.
- **Per-project composition** — `src/videos/<project-slug>/index.tsx`. Создай через композицию primitives из `src/lib/components/` (captions, text, overlays, layouts). Зарегистрируй в `src/Root.tsx` под `Videos` folder с `<Folder>` wrapper.

### Build composition-props.json

Резолвь каждый slot из манифеста в `staticFile()` key. Asset symlink:

```bash
ln -sfn ../../workspace/projects/<id>/assets public/project-<id>
```

### Implement transitions / captions

- `TransitionSeries` с `<Sequence>` per scene.
- Captions из `captions.json` через один из 12 готовых компонентов в `src/lib/components/captions/`.
- Dual audio (VO + music) с `volume` ducking через `interpolate`. См. `rules/audio-mixing.md`.

### Remotion version

**Все пакеты `4.0.441` идентично.** Drift → render fails cryptically.

## Preview

**Не запускаем Studio автоматически.** Если пользователь хочет preview:

> "Запусти `bun run dev` foreground в отдельном терминале — Studio откроется на http://localhost:3000. Композиция: `Videos/<project-slug>` или `UGCVideo` с props из `composition-props.json`."

Проверь что symlink `public/project-<id>` → `assets` активен.

## Final-render

**Always:**
1. Прогон `preflight` (см. ниже). Не пропускай.
2. Symlink активен.
3. Rendering — **через `ralphy render <id>`**, не прямой вызов:
   ```bash
   ralphy render <id>
   # или в dev:
   bun run ralph -- render <id>
   ```
4. Cleanup symlink после рендера:
   ```bash
   rm public/project-<id>
   ```
5. Чат: render path + duration + file size.

`ralphy render` инкапсулирует `bunx remotion render` + symlink lifecycle + log generation event с `provider: "local"`, `kind: "render"`, `cost_usd: 0`.

## Preflight checklist

Прежде чем рендерить:

1. Каждый asset slot в `scenario.json` имеет матч в `asset-manifest.json` + файл существует.
2. VO durations match (или ±0.2s) сцен `durationHintSec`. Drift → handback в scenarist.
3. `captions.json` (Caption[]) существует для каждого VO track.
4. Music bed duration ≥ total composition duration или есть loop rule.
5. `composition-props.json` резолвит каждый `staticFile()` key.
6. **Quality gate:** каждый slot имеет `score >= 7` в манифесте (или explicit bypass-consent).

Output: компактный чат-checklist (`OK` / `MISSING <reason>` per scene).

## Per-clip captions variant

Если сцены имеют отдельные VO files — транскрайбь каждую отдельно (`captions-01.json`, `captions-02.json`, ...) и concat в композиции. См. `src/videos/lyadov-podcast/` для рабочего паттерна.
