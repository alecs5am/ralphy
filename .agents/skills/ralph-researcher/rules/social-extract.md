# Social analysis & trends

## social-analysis (single video / handle)

Working dir: `workspace/references/<handle>/`.

### Method

1. **Download** via `yt-dlp`:
   ```bash
   yt-dlp -f "best[ext=mp4]/best" --no-playlist \
     -o "workspace/references/<handle>/reels/<name>.mp4" "<VIDEO_URL>"
   ```

2. **Analyze.** Standard reproduction blueprint:
   ```bash
   bunx tsx scripts/analyze-video.ts \
     --video workspace/references/<handle>/reels/<name>.mp4 \
     --output workspace/references/<handle>/blueprints/<name>
   ```

   For a bespoke question ("extract caption style only", "compare hook timing with another reel") — call Gemini directly via `callLLM()` + a tailored prompt. Don't let the canned blueprint shape constrain the question.

3. **Register:**
   ```bash
   ralphy ref create --url <VIDEO_URL> --type social
   ```

4. **Cross-analyze** multiple videos from the same creator:
   ```bash
   bunx tsx scripts/cross-analyze.ts --handle <handle>
   ```
   Output: `<handle>-pattern.json` — recurring hooks, editing signatures, format rules.

### Blueprint shape (standard)

duration / resolution / aspect, category, language, format type, subtitle style, hook text + why it works, per-scene timestamps + description + on-screen text + transition + camera angle, editing pace, color grading, audio (VO / music / mood / tone), viral factors, reproduction guide (difficulty, assets, steps, variation ideas).

### Outputs

```
workspace/references/<handle>/
  reels/<name>.mp4
  blueprints/<name>/blueprint.json
  blueprints/<name>/frames/
  blueprints/<name>/audio.mp3
  <handle>-pattern.json   (optional, cross-video)
```

### Project context

```bash
ralphy project log-asset <project-id> --kind blueprint \
  --source workspace/references/<handle>/blueprints/<name> \
  --purpose social-ref
```

## discover-trends

Working dir: `workspace/references/trends-<date>/`.

### Method

```bash
ralphy ref scrape-trends \
  --hashtags "ai,productivity,startuplife" \
  --limit 15
```

The script visits `tiktok.com/tag/<hashtag>` without login, parses `__UNIVERSAL_DATA_FOR_REHYDRATION__`, dumps Apify-shape JSON, runs each video through `scoreTikTok()` and returns the ranked top-N.

### Scoring (engagement ratios)

| Tier | Like-rate | Comment-rate | Share-rate | Views |
|---|---|---|---|---|
| viral | ≥15% | ≥2% | ≥3% | ≥1M |
| great | ≥10% | ≥1% | ≥1% | ≥100K |
| good | ≥5% | ≥0.5% | ≥0.3% | ≥10K |
| weak | <5% | <0.5% | <0.3% | <10K |

`scoreTikTok({ playCount, diggCount, commentCount, shareCount }) → { score, tier }`.

### Caveats

- TikTok rotates anti-bot tokens. Captcha → wait a day, change IP.
- Without login, TikTok may hide numbers — fallback to URL+text only (useless for scoring).
- If selectors break — re-check the hydration script manually.

### After scraping

Top videos (`tier: viral` / `great`) → run `social-analysis` on each → `analyze-video.ts` for the blueprint.

## Outputs

```
workspace/references/trends-<date>/
  results.json              # Apify-shape array, scored
  blueprints/<name>/        # per-video deep analysis (top-N only)
```

## Apify compatibility

Output schema is identical to Apify's `clockworks/tiktok-scraper`. If an Apify key shows up later, consumers can switch source without changes.
