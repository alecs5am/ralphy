# Captions

## Generation

Tool: `ralphy generate captions` (под капотом `cli/lib/transcribe.ts` → OpenRouter `openai/whisper-1`).

```bash
ralphy generate captions --project <id> \
  --audio workspace/projects/<id>/assets/voiceover/master.mp3 \
  --language ru
```

Output: `workspace/projects/<id>/captions.json` — `Caption[]` в `@remotion/captions` shape:
```ts
{ text: string; startMs: number; endMs: number; timestampMs: number; confidence: number }
```

Logged автоматом: `provider: "openrouter"`, endpoint `openai/whisper-1`, cost ≈ $0.006 / audio-minute.

## Hard limits

- **≤25MB per file** (whisper-1 hard limit). Длиннее → re-encode mono 64kbps mp3 заранее или split на chunks.
- **Word-level timestamps только.** `timestamp_granularities[]=word` уже дефолт в `transcribe.ts`. Segment-level даёт ragged word-pop эффект — не используем.
- **Language explicit** — `--language ru` для русского. Auto-detect фейлит на коротких clips.

## Caching

**Не запускай повторно** если `captions.json` свежее VO file (`mtime captions > mtime audio`). Проверь перед вызовом — каждый рангон $0.006/мин + latency.

## Per-clip variant

Сцены с отдельными VO → транскрайбь каждую:

```bash
for n in 01 02 03; do
  ralphy generate captions --project <id> \
    --audio assets/voiceover/scene-$n.mp3 \
    --output captions-$n.json
done
```

Композиция импортирует все, склеивает по сценам с offset.

## Consume in composition

12 готовых компонентов в `src/lib/components/captions/` принимают `Caption[]` напрямую — никакой конвертации:

- `HormoziCaptions` — крупный pop-effect, лучший для viral hooks
- `TikTokCaptions` — стандарт TikTok-стиля
- `KaraokeCaptions` — слова подсвечиваются sync с речью
- `Typewriter*` — печатная машинка
- `Glow*` / `Gradient*` / `Boxed*` / `Bounce*` — стилистические варианты
- `YellowPop*` — ярко-жёлтые
- `LuxuryMinimal*` / `Minimal*` — тонкие/минималистичные

Выбор стиля — функция шаблона / vibe сценария. Дефолт для UGC — `HormoziCaptions` или `TikTokCaptions`.

## Word-boundary cuts (related)

Когда editor режет сегменты VO для viral moments / repurposing — **только по word boundaries**. whisper-1 word-level timestamps дают честные границы. Mid-word cut → consonant clip. Padding 30–200ms по бокам обязателен.
