# Transcript

Researcher сам транскрайбит когда нужно для analysis (find-viral-moments, deep social-analysis). Editor имеет свой generate-captions для production VO. Тот же tool, разные contexts.

## Tool

```bash
ralphy project transcribe <id> --audio <path> --language ru
```

или для research-context (без project ID):

```bash
bunx tsx -e '
  import { transcribeAudio } from "../../../../cli/lib/transcribe.js";
  const result = await transcribeAudio({
    audioPath: "workspace/references/<handle>/source.mp3",
    language: "ru"
  });
  console.log(JSON.stringify(result.captions, null, 2));
'
```

## Hard limits

- ≤25MB per file (whisper-1 hard limit OpenRouter).
- Длиннее → re-encode в mono 64kbps mp3:
  ```bash
  ffmpeg -i source.mp4 -vn -ac 1 -b:a 64k workspace/references/<handle>/source.mp3
  ```
- Ещё длиннее (>30min audio @ 64kbps ≈ 14MB безопасно, >60min — split на chunks).

## Word-level timestamps

`timestamp_granularities[]=word` — дефолт в `transcribe.ts`. Возвращает `Caption[]`:
```ts
{ text: string; startMs: number; endMs: number; timestampMs: number; confidence: number }
```

Используется для:
- find-viral-moments (cut on word boundary)
- editor caption components (12 styles из `src/lib/components/captions/`)
- deep social-analysis (timing анализ hook'а)

## Caching

Если `<handle>/source.transcript.json` существует и `mtime > mtime audio` — **не запускай заново**. ~$0.006/min × сколько раз = wasted.

## Language

- `--language ru` для русских sources.
- `--language en` для английских.
- `--language auto` — фейлит на коротких clips (≤10s) и иногда на code-switching. Не дефолт.

## Cost

$0.006 per audio-minute. Часовой podcast = $0.36. Считается через `loggedFetch()` автоматом в `generations.jsonl`.
