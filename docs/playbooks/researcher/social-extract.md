# Social analysis & trends

> **Canonical-refs-first rule (every brief that names a brand / show / specific entity):** before drafting any prompt, pull the canonical reference into `refs/`. Specifically:
> - Named brand → `ralphy ref pull <brand-site-or-youtube-spot>` → `ralphy ref analyze-video <slug>` (gemini-3.1-pro full-mp4 visual analysis). Don't improvise the brand's visual DNA from training-data memory; flipper-hypermotion-001 wasted $2.80 on wrong-palette product gens because Claude's "memory" of the Flipper Zero was stale.
> - Named show / movie / aesthetic (Spider-Verse, Arcane, Tom-Ford editorial) → `ralphy ref pull` + analyze; the named-corpus refs anchor downstream image gens far better than text descriptions.
> - **Re-fire researcher mid-session if a new brand is named.** If the scenarist or art-director introduces a brand the researcher never analyzed, route BACK to researcher before generating. Venom-bodywash-001 traced its $3 register-mismatch burn to skipping this re-fire.
>
> Cost of canonical-refs-first: ~$0.02 (gemini vision pass). Cost of skipping: $2-5 in wasted gens + 30-45 min wall-clock per brand miscalibration.

## social-analysis (single video / handle)

Working dir: `workspace/references/<slug>/` (slug derived from URL by `ref pull`, or pass `--slug <name>`).

### Method — the standard chain is six `ralphy` verbs, no scripts

```bash
# 1. Pull mp4 + meta + audio (yt-dlp wrapper, also extracts mono 64k mp3)
ralphy ref pull <VIDEO_URL> [--slug <name>]

# 2. Sample frames for vision analysis
ralphy ref frames <slug> --max 12

# 3. Transcribe (ElevenLabs Scribe v1 by default — word-level)
ralphy ref transcribe <slug> --language ru

# 4. Vision LLM over frames → blueprint JSON
ralphy ref analyze <slug>

# 5. Audio LLM (tone, music, VO style) — optional but cheap
ralphy ref audio-describe <slug>

# 6. Synthesize → workspace/references/<slug>/blueprint.md
ralphy ref blueprint <slug>

# Register the URL in the registry so it's attachable to projects
ralphy ref create <VIDEO_URL> --type social --name <slug>
ralphy ref attach <slug> --to <projectId>
```

Each step is idempotent and writes to `state.json` so re-runs skip what's already done.

For a bespoke question ("extract caption style only", "compare hook timing across two reels") pass `--prompt-file <md>` to `ralphy ref analyze` — same verb, custom prompt. Don't reach for `callLLM()` directly.

### Blueprint shape (standard)

duration / resolution / aspect, category, language, format type, subtitle style, hook text + why it works, per-scene timestamps + description + on-screen text + transition + camera angle, editing pace, color grading, audio (VO / music / mood / tone), viral factors, reproduction guide (difficulty, assets, steps, variation ideas).

### Outputs

```
workspace/references/<slug>/
├── source.mp4              # main file (yt-dlp)
├── meta.info.json          # title, uploader, view/like/comment counts, hashtags
├── source.mp3              # mono 64k for transcribe (≤25MB)
├── frames/frame-NN.jpg     # ffmpeg sampler
├── transcript.json         # Caption[] (word-level via ElevenLabs Scribe)
├── analysis.json           # vision LLM blueprint
├── audio-analysis.json     # tonal / music / VO style
├── blueprint.md            # synthesized — feed this to scenarist
└── state.json              # bookkeeping (pulledAt, framesAt, …)
```

### Project context

```bash
ralphy project log-asset <project-id> --kind doc \
  --source workspace/references/<slug>/blueprint.md \
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
