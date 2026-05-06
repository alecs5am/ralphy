# Social analysis & trends

## social-analysis (single video / handle)

Working dir: `workspace/references/<handle>/`.

### Method

1. **Download** через `yt-dlp`:
   ```bash
   yt-dlp -f "best[ext=mp4]/best" --no-playlist \
     -o "workspace/references/<handle>/reels/<name>.mp4" "<VIDEO_URL>"
   ```

2. **Analyze.** Стандартный reproduction blueprint:
   ```bash
   bunx tsx scripts/analyze-video.ts \
     --video workspace/references/<handle>/reels/<name>.mp4 \
     --output workspace/references/<handle>/blueprints/<name>
   ```
   
   Для bespoke вопроса ("выдели только caption style", "сравни hook timing с другим reel'ом") — вызывай Gemini напрямую через `callLLM()` + tailored prompt. Не давай canned blueprint shape ограничивать вопрос.

3. **Register:**
   ```bash
   ralphy ref create --url <VIDEO_URL> --type social
   ```

4. **Cross-analyze** multiple videos одного creator'а:
   ```bash
   bunx tsx scripts/cross-analyze.ts --handle <handle>
   ```
   Output: `<handle>-pattern.json` — recurring hooks, editing signatures, format rules.

### Blueprint shape (стандарт)

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

Скрипт visits `tiktok.com/tag/<hashtag>` без логина, парсит `__UNIVERSAL_DATA_FOR_REHYDRATION__`, дампит Apify-shape JSON, прогоняет каждый video через `scoreTikTok()` и возвращает ranked top-N.

### Scoring (engagement ratios)

| Tier | Like-rate | Comment-rate | Share-rate | Views |
|---|---|---|---|---|
| viral | ≥15% | ≥2% | ≥3% | ≥1M |
| great | ≥10% | ≥1% | ≥1% | ≥100K |
| good | ≥5% | ≥0.5% | ≥0.3% | ≥10K |
| weak | <5% | <0.5% | <0.3% | <10K |

`scoreTikTok({ playCount, diggCount, commentCount, shareCount }) → { score, tier }`.

### Caveats

- TikTok rotates anti-bot tokens. Captcha → wait day, change IP.
- Без логина TikTok может скрыть numbers — fallback на URL+text only (бесполезно для scoring).
- Если selectors сломались — re-check hydration script вручную.

### After scraping

Top videos (`tier: viral` / `great`) → дёргай по каждой `social-analysis` → `analyze-video.ts` для blueprint.

## Outputs

```
workspace/references/trends-<date>/
  results.json              # Apify-shape array, scored
  blueprints/<name>/        # per-video deep analysis (top-N only)
```

## Apify compatibility

Output schema идентичен Apify `clockworks/tiktok-scraper`. Если в будущем появится Apify-ключ, можно переключить consumer'ы без правок (только switch source).
