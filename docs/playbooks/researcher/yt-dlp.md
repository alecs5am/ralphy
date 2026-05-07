# yt-dlp — downloading source video files

**Read this when:** you have a URL to a video on TikTok / Instagram / YouTube / Reels / X / Reddit / Facebook / 1800+ other sites and you need the actual mp4 (for transcript, frame analysis, viral-moment extraction, or just preview). **WebFetch will not help on these — they're JS-rendered SPAs that return shells.** That's expected, not a failure.

## Install / verify

`yt-dlp` is part of the researcher tooling and should be on PATH already.

```bash
which yt-dlp || brew install yt-dlp
yt-dlp --version
```

If it's missing on a fresh machine, hand to the [ralphy-install playbook](../ralphy-install.md) — it goes in alongside `bun` / `ffmpeg`.

## Standard download

Default to mp4 with audio at the highest reasonable resolution:

```bash
yt-dlp \
  -f 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b' \
  --merge-output-format mp4 \
  -o 'workspace/research/<slug>/video.mp4' \
  '<url>'
```

For TikTok specifically, the format selector usually doesn't matter — TikTok serves a single mp4 — so the simpler form is fine:

```bash
yt-dlp -o 'workspace/research/<slug>/video.mp4' '<url>'
```

## Metadata + description first (cheap recon)

Before pulling the file, get the JSON metadata — often that alone answers the question (caption text, hashtags, music name, view count):

```bash
yt-dlp --dump-json --no-download '<url>' | jq '{ title, description, duration, view_count, like_count, comment_count, uploader, tags, categories, music: .track }'
```

Save it next to the video:

```bash
yt-dlp --write-info-json --skip-download -o 'workspace/research/<slug>/meta' '<url>'
# → workspace/research/<slug>/meta.info.json
```

## Audio only (for transcript)

If you only need the words, skip the video stream — much smaller:

```bash
yt-dlp \
  -x --audio-format mp3 --audio-quality 0 \
  -o 'workspace/research/<slug>/audio.%(ext)s' \
  '<url>'
```

Then feed the mp3 to `ralphy project transcribe` (whisper-1 OpenRouter).

## Subtitles / auto-captions

If the platform exposes auto-captions (YouTube does, TikTok rarely):

```bash
yt-dlp \
  --skip-download \
  --write-auto-subs --sub-lang ru,en \
  --convert-subs srt \
  -o 'workspace/research/<slug>/subs' \
  '<url>'
```

Falling back to whisper-1 transcription is normal for TikTok / IG / Reels.

## Multi-video pull (whole handle / playlist)

```bash
# whole TikTok profile
yt-dlp \
  --max-downloads 20 \
  -o 'workspace/research/<handle>/%(upload_date)s-%(id)s.%(ext)s' \
  'https://www.tiktok.com/@<handle>'
```

Be polite — `--max-downloads 20` is usually enough to map a creator's style.

## When yt-dlp fails

1. **HTTP 403 / "Sign in to confirm"** — the platform changed its auth flow. First, update: `yt-dlp -U` (or `brew upgrade yt-dlp`). yt-dlp ships fixes for these within a day or two.
2. **Region lock** — try `--geo-bypass-country US` or `--geo-bypass-country RU`.
3. **Truly unavailable** (private / deleted) — the metadata fetch will say so. Tell the user; don't silently fail.
4. **Live stream** — `yt-dlp` can record live, but for our format (short-form clips) this almost never applies. Decline and ask the user for a recorded URL.

## What NOT to do

- **Don't fall back to `WebFetch`** thinking it'll get you the description — TikTok / IG / YT all return JS shells without auth. That's the bug pattern this doc exists to prevent.
- **Don't ask the user to `send the file`** before trying yt-dlp. Asking is a last resort, not the first move.
- **Don't shell out to `youtube-dl`** — its release branch is dead since 2021. yt-dlp is the maintained fork.
- **Don't pipe the file straight to a model** — save it under `workspace/research/<slug>/` so subsequent sessions can resume.

## Standard layout after download

```
workspace/research/<slug>/
├── video.mp4              # main file
├── meta.info.json         # description, hashtags, counts
├── audio.mp3              # optional, only if transcribing
├── subs.ru.srt            # optional, only if auto-subs available
├── frames/                # optional, ffmpeg keyframes
└── notes.md               # researcher's structured findings
```

After download, hand back to the calling sub-task in the [researcher playbook](../researcher.md) (`social-analysis`, `find-viral-moments`, etc.).
