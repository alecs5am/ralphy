# Reference example — fruit-drama-001

The canonical seed project for this template. Built 2026-05-11. 56s English fruit-drama affair plot.

## At a glance

- **Project ID:** `fruit-drama-001`
- **Composition ID in Remotion:** `FruitDrama001`
- **Duration:** 56.1s = 7 scenes × 8s
- **Aspect:** 9:16, 1080×1920, 30fps
- **VO language:** English (Veo native)
- **Music:** NONE (Veo native ambient only — no ElevenLabs bed)
- **Cost (verified):** $29.05 actual

## Plot — Affair trope

A trope-library affair story:

1. **Hook (0-8s):** Banana-husband + Strawberry-wife say goodbye at the door. Both speak on camera. *"Have a great day at work, my sweet banana." / "I'll be home for dinner, my little strawberry."*
2. **Inciting (8-16s):** Cherry-boss sits on her glass desk, beckons Banana into the office. *"Come closer, banana. Stay with me after work tonight. Nobody has to know."*
3. **Rising action (16-24s):** Cherry leans in, hand on Banana's cheek. *"You're so sweet, banana. So much sweeter than that little strawberry at home."*
4. **Discovery (24-32s):** Banana arrives home with lipstick on his cheek. Strawberry: *"What's that on your cheek, my love? That's not my lipstick."*
5. **Confrontation (32-40s):** Strawberry holds the phone with chat bubbles, Banana on his knees crying. *"Ten years, banana! Ten years — and you throw it all away for that pit in a red skirt?!"*
6. **Departure (40-48s):** Strawberry walks out with a suitcase. Banana runs after her. *"Strawberry, wait! Forgive me, please! I was a fool!"*
7. **Resolution (48-56s):** Strawberry on a park bench at golden hour. Carrot pulls up on a motorbike. *"Hey there, strawberry. Name's Carrot. You're way too sweet to be crying alone."*

## Cast lock-strings (verbatim — reusable)

See `fragments.md → Character lock-string fragments → Fruit cast`. The four canonical lock-strings (banana-husband, strawberry-wife, cherry-boss, carrot-rebound) were authored against this reference.

## File layout (when checked out)

```
workspace/projects/fruit-drama-001/
├── scenario.json                 ← 7 scenes with dialogue blocks
├── captions.json                 ← word-level from scribe v1 (101 words)
├── assets/
│   ├── images/
│   │   ├── scene-01-keyframe.png … scene-07-keyframe.png
│   └── videos/
│       └── scene-01-vid.mp4    … scene-07-vid.mp4   (Veo 3.1 i2v, --audio on)
├── render/
│   ├── concat.mp4                ← lossless concat of 7 Veo mp4s
│   ├── final.mp4                 ← concat + loudnorm (Veo audio only)
│   ├── final-popwords.mp4        ← Remotion render w/ PopWordCaptions overlay  ← deliverable
│   ├── final-with-2music.mp4     ← bug archive (had double-music; kept for diffing)
│   └── final.srt                 ← optional .srt for non-Remotion captioning paths
└── logs/
    ├── generations.jsonl         ← every model call + cost
    └── user-prompts.jsonl
src/videos/fruit-drama-001/
├── index.tsx                     ← FruitDrama001 composition
├── captions.ts                   ← Caption[] re-export
└── PopWordCaptions.tsx           ← re-export from src/lib/components/captions/
public/fruit-drama-001 → workspace/projects/fruit-drama-001  (symlink)
public/fonts/TheBoldFont.ttf     ← 43KB TTF for the popwords font
```

## What the bug-archive teaches

The first build of this project had **two music layers** stacked:

1. Veo's auto-generated ambient/score inside each 8s clip (because the no-music clause wasn't yet baked into the prompt)
2. An ElevenLabs Music bed mixed on top via `ralphy audio sidechain`

Both ducked under the same dialogue. Audible in every pause between lines. Mud.

The fix that produced the final clean version:
1. Added the no-music clause to every Veo prompt (now codified in `fragments.md`)
2. Deleted the ElevenLabs music step entirely
3. Re-loudnorm the Veo-audio-only concat directly

If you're recreating this template, **you skip step 1's bug entirely** because the no-music clause is now the default. Don't reintroduce the music step.

## Build trace (for replication)

The full build command sequence (pruned to the load-bearing calls):

```bash
# 0. Set up
ralphy project create --id fruit-drama-001 --duration 60 --aspect-ratio 9:16

# 1. Per-scene keyframe + Veo i2v (parallelized via background)
for n in 01 02 03 04 05 06 07; do
  ralphy generate image --project fruit-drama-001 --slot scene-${n}-keyframe \
    --size 1080x1920 \
    --prompt "<scene-${n} keyframe prompt — see scenario.json>"
done

for n in 01 02 03 04 05 06 07; do
  ralphy generate video --project fruit-drama-001 --slot scene-${n}-vid \
    --model google/veo-3.1 --duration 8 --resolution 1080p --aspect-ratio 9:16 --audio \
    --first-frame workspace/projects/fruit-drama-001/assets/images/scene-${n}-keyframe.png \
    --prompt "<scene-${n} Veo prompt with no-music clause — see scenario.json>"
done

# 2. Concat + loudnorm (no music mix step!)
P=workspace/projects/fruit-drama-001
ralphy video concat --files $P/assets/videos/scene-01-vid.mp4,...,scene-07-vid.mp4 \
  --out $P/render/concat.mp4 --project fruit-drama-001
ffmpeg -i $P/render/concat.mp4 -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
  -c:v copy -c:a aac -b:a 192k $P/render/final.mp4

# 3. Word-level captions
ralphy generate captions --project fruit-drama-001 \
  --audio $P/render/final.mp4 --language en

# 4. Remotion render with PopWordCaptions
bunx remotion render src/index.ts FruitDrama001 \
  $P/render/final-popwords.mp4 --codec h264 --crf 18 --concurrency 4
```

## Do not copy literally

The scenario, dialogue lines, exact prompts, and per-scene camera direction. This is a reference *example* — `/ralph-scenarist` writes a fresh scenario for every new project even when reusing the same cast and trope. What you DO inherit literally:

- The Veo-only-audio rule
- The PopWordCaptions style + TheBoldFont font
- The 7×8s scene structure (or 6×8s / 8×8s variants)
- The no-music clause in every Veo prompt
- The lock-string discipline for character consistency
