# broadcast-caught-on-tv-square

Single-clip "caught on a live TV broadcast" trend recreation. The user's own selfie → 1024² square broadcast-capture still on `gpt-5.4-image-2` → 15s i2v on `kling-v3.0-pro` with native ambient venue audio. Square 1:1 is the load-bearing aesthetic decision — real broadcast cameras shoot 16:9, so strict 9:16 portrait reads as AI-generated; square "splits the difference" and feels like a phone capture of a TV screen.

## When to use this template

- The user wants to recreate a "caught on the audience cam" / "kiss-cam" / "jumbotron" / "news vox-pop" trend with their own face.
- The brief names a real broadcast channel + a real live event (KBO, NFL, Wimbledon, Eurovision, BBC News, etc.).
- A clean front-facing selfie of the subject is available.

If any of the above is missing — handback to the user with the concrete ask. AI-improvised faces or invented broadcast channels both break the format.

## Cost ballpark

- **Minimum-viable (one image + one 15s video + ambient audio):** ~$2.30
- **Typical session with one retry buffer:** ~$3.45
- **Two-iteration session (one image variant + two video clips):** ~$5.25 (the source-project actual)

See `model-stack.md` for the per-stage breakdown.

## How to use

```bash
ralphy template use broadcast-caught-on-tv-square \
  --project <new-id> \
  --brief "<one-line: subject + sport + venue>"
```

Then in the new project:

1. Log the user selfie: `ralphy project log-asset <id> --kind photo --purpose character-ref --source <selfie>`
2. Stage 1 still: `ralphy generate image --slot scene-01-still --model openai/gpt-5.4-image-2 --ref <selfie> --prompt "$(cat prompt-cookbook.md from-stage-1-section, slots filled)"`
3. Stage 2 video: `ralphy generate video --slot scene-01-vid --model kwaivgi/kling-v3.0-pro --duration 15 --audio --first-frame <still>.png --prompt "$(cat prompt-cookbook.md from-stage-2-section, pronouns swapped, slots filled)"`
4. Ship raw Kling mp4 — no Remotion composition needed.

## Files in this template

| File | What it contains |
|---|---|
| `template.json` | Metadata + slots + variation axes + asset pointers |
| `TEMPLATE.md` | Vibe + required inputs + key rules + workflow + anti-patterns + beat structure |
| `prompt-cookbook.md` | Stage 1 and Stage 2 prompt templates with slot map + per-clause rationale |
| `model-stack.md` | Per-stage model picks, what worked / what we tried and dropped, cost per stage |
| `hooks.md` | 0–2s hook patterns (live-broadcast tease vs camera-cut-to-crowd) |
| `examples.md` | Two full variant fills (KBO baseball, Wimbledon tennis) with prompt expansions |
| `assets/` | Example still + clip from the source project as visual reference |

## Source project

Extracted from `workspace/projects/kbo-broadcast-001/` (rendered 2026-05-18). Full lessons in that project's `postmortem/02-lessons.md` — re-read before the next character-anchored trend recreation.
