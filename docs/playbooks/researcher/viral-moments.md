# Find viral moments (long-form → 15-60s clips)

## When this fires

Source — long video (podcast, stream, webinar, talk). Goal — find 3-15 viral clips, each 15-60 seconds long.

Real-world case: `workspace/projects/lyadov-podcast-001/` — 16:9 podcast → 9:16 short-form clips.

## Method

```bash
bunx tsx scripts/find-viral-moments.ts \
  --video workspace/references/<handle>/source.mp4 \
  --output workspace/references/<handle>/moments.json \
  --language ru
```

### Pipeline

1. **Transcribe** via `cli/lib/transcribe.ts` → OpenRouter whisper-1 (word-level timestamps).
2. **Sample frames** every 5s (via `ffmpeg -vf fps=0.2`).
3. **Gemini-2.5-flash via `callLLM()`** — vision over frames + full transcript. The prompt focuses on:
   - 3-15 clips, 15-60s each
   - cut on silence, never mid-word
   - 0.2-0.4s lead-in before the hook
   - `viral_hook_text` ≤10 words in the transcript's language
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

`moments.json` feeds straight into `ralphy video extract-segment` — one call per moment:

```bash
jq -c '.[]' workspace/references/<slug>/moments.json | while read -r m; do
  start=$(echo "$m" | jq -r .start)
  end=$(echo   "$m" | jq -r .end)
  out=$(echo   "$m" | jq -r .out)
  ralphy video extract-segment \
    --in workspace/references/<slug>/source.mp4 \
    --start "$start" --end "$end" --out "$out"
done
```

Each clip is extracted lossless with 30-200ms padding on each side (see [`../editor/hard-rules.md`](../editor/hard-rules.md) item 7).

## Quality knobs

- Minimum 15s — anything shorter doesn't add up to a self-contained moment.
- Maximum 60s — anything longer doesn't work for short-form (TikTok cap 60s, Reels — 90s).
- 3-15 clips total — more = noise, fewer = wasted budget.
- `--language ru` is required for Russian (auto-detect fails on short clips).

## Cost

- whisper-1: ~$0.006/min audio (full source).
- Gemini-2.5-flash: ~$0.001/frame × N frames (for a 60-min source ≈ 720 frames @ 5s sample = $0.72).
- Total: ~$1-2 for an hour-long podcast.
