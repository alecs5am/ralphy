# Find viral moments (long-form → 15-60s clips)

## When this fires

Source — long video (podcast, stream, webinar, talk). Цель — найти 3-15 viral clips длиной 15-60 секунд каждый.

Real-world кейс: `workspace/projects/lyadov-podcast-001/` — 16:9 podcast → 9:16 short-form clips.

## Method

```bash
bunx tsx scripts/find-viral-moments.ts \
  --video workspace/references/<handle>/source.mp4 \
  --output workspace/references/<handle>/moments.json \
  --language ru
```

### Pipeline

1. **Transcribe** через `cli/lib/transcribe.ts` → OpenRouter whisper-1 (word-level timestamps).
2. **Sample frames** каждые 5s (через `ffmpeg -vf fps=0.2`).
3. **Gemini-2.5-flash через `callLLM()`** — vision на frames + полный transcript. Промпт фокусирует на:
   - 3-15 clips, 15-60s каждый
   - cut on silence, never mid-word
   - 0.2-0.4s lead-in перед hook
   - `viral_hook_text` ≤10 слов на языке transcript'а
   - `angle` ∈ {gatekeep, skeptic, fail, visual-shock}

### Output schema

```json
{
  "clips": [
    {
      "start": 124.5,
      "end": 167.2,
      "viral_hook_text": "Никто не говорит про X, но...",
      "angle": "gatekeep",
      "reason": "drops a counter-intuitive insider claim with strong visual",
      "transcript_excerpt": "..."
    }
  ]
}
```

## Downstream consumption

`moments.json` идёт в `cli/lib/ffmpeg-recipes.ts → extractSegment`:

```bash
ralphy generate clip-cut --project <id> --moments workspace/references/<handle>/moments.json
```

Каждый clip извлекается lossless с padding 30-200ms по бокам (см. `ralph-editor/rules/hard-rules.md` пункт 7).

## Quality knobs

- Минимум 15s — короче не складывается в self-contained moment.
- Максимум 60s — длиннее не работает на short-form (TikTok cap 60s, Reels — 90s).
- 3-15 clips total — больше = шум, меньше = wasted budget.
- `--language ru` обязателен для русского (auto-detect фейлит на коротких).

## Cost

- whisper-1: ~$0.006/min audio (полный source).
- Gemini-2.5-flash: ~$0.001/frame × N frames (для 60-min source ≈ 720 frames @ 5s sample = $0.72).
- Total: ~$1-2 для часового подкаста.
