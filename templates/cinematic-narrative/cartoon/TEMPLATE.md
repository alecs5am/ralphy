# Cartoon — vibe style reference

**Genre:** stylized 2D / stop-motion / non-photoreal animation. Cartoon, cel-shaded, hand-drawn, illustrated.
**Length:** 5-15s (i2v sweet spot is 2-6s per clip; 2-4 clips total).
**Format:** TikTok / Reels / Shorts, 9:16, 30fps composition, 1080x1920.

> **Reference gate (soft).** Cartoon is a *style*, not a real-entity reproduction — no upload required by default. Hard refuse only if the brief names a real brand mascot, real person, or specific franchise character (AGENTS.md hard rule #3 still applies for those).

## Why this works

Cartoon strips away the photoreal-i2v failure modes (uncanny faces, flickering hands, broken physics) by leaning *into* stylization. The eye accepts impossible motion when the line work signals "this is a drawing." That gives you:

1. **Permission to exaggerate.** Squash-stretch, rubber limbs, instant facial deformation — all the things that destroy photoreal clips become signature features here.
2. **Strong 2-second hook by default.** Cartoon language (smash-zoom, color explosion, fourth-wall break, particle cascade) is built for hooks. The format is half-trained on attention-grabbing.
3. **Style as thumbprint.** A coherent line/palette/proportion choice makes the video instantly recognizable in the feed even at thumbnail size.
4. **Cheap and fast.** 2-4 short clips in a tight aspect; no expensive product reference, no painstaking mocap. Strong fit for explainers, ads, jokes, and personal-brand reels.

## Vibe anchors

- **Pick exactly ONE primary style** and lock it across every keyframe. Disney + Cartoon Network in the same scene = muddy frames.
- **2-second hook is non-negotiable.** Open with smash-zoom, color burst, extreme expression, or impossible deformation. Day-1 frame must demand attention.
- **Lean on the 12 animation principles** in the prompt itself. Name them: "squash on landing", "anticipation crouch before jump", "follow-through on hair", "arc trajectory". The model parses these literally.
- **Color is precise, not vague.** "Bright pastels" is weak. "Hot magenta + electric cyan + golden yellow at 100% saturation" is strong. Hex codes when you have them.
- **Line work matches style.** Bold 4-8px outlines for Cartoon Network rubber hose; thin 1-2px for flat vector; gestural variable weight for hand-drawn; none for watercolor.
- **Background is secondary.** When the character carries the scene, simplify the background to flat color blocks or a soft gradient. Detailed background only when the *style itself* (Ghibli, watercolor) demands it.
- **Sound design is part of the prompt.** Cartoon SFX (boing, whoosh, comedic stab, slide-whistle, horn-honk) read as "cartoon" almost as strongly as the visuals.

## Variation axes

| Axis | Options |
|---|---|
| Art style | Classic Disney / Cartoon Network rubber hose / flat vector / 1920s rubber hose / pencil sketch / watercolor / paper cutout / pixel art (8-16 bit) / neon line / manga-anime / claymation / oil painting / silhouette / doodle / 3D toon-shaded |
| Line work | thick bold 4-8px / thin uniform 1-2px / variable gestural / no-outline color-only / sketchy textured |
| Color palette | bold saturated / pastel soft / monochrome single-hue / warm nostalgic / cool calm / complementary high-contrast / earth tones / neon cyberpunk |
| Background | detailed painted / simplified graphic / abstract gradient / repeating pattern / fully dynamic shape-shifting |
| Framerate target | 12fps (claymation, retro rubber hose, paper cutout) / 24fps (most styles, theatrical feel) / 30-60fps (flat vector, neon line, 3D cel-shaded) |
| Tone | slapstick comedy / peaceful Ghibli wonder / modern explainer / surreal whimsy / dramatic anime / vintage charm / chiptune nostalgia |
| VO language | any — visual style carries regardless |

## Narrative arc

```
0-2s    -> 2-second hook. ONE pop: smash-zoom, color explosion, extreme expression,
           impossible deformation, particle cascade, or fourth-wall wink.
2-6s    -> Action beat. Character does the thing. Animation principles fire here:
           anticipation crouch -> snappy action -> follow-through trail.
6-10s   -> Reaction / payoff. Reaction face (eyes pop, mouth stretches), or
           transformation reveal, or environmental morph.
10-15s  -> Closure. Held end-pose with motion lines, sparkle, or quick freeze-and-snap.
           CTA / brand bug / final beat.
```

For a single-clip 5s social cut, collapse to: hook (1s) → action (3s) → snap closure (1s).

## Required user inputs

1. **Topic / scenario** — what's the video about? One-line brief.
2. **Primary art style** — pick from the variation axis. Default: "Cartoon Network rubber hose" (most universally legible).
3. **(Optional) Tone** — slapstick / wonder / explainer / surreal. Defaults to slapstick.
4. **(Optional) Color palette** — bold-saturated / pastel / neon / warm. Defaults to bold-saturated.
5. **(Optional) Sub-style accent** — one secondary flavor (e.g. "with art deco background patterns"). Use sparingly.
6. **(Optional) VO language and emotional arc.**

No product reference, no logo, no real face required (for generic cartoon work).

## When NOT to use

- **Real product demo.** Use `before-after-product`. Cartoon hides product detail — buyers can't read the label.
- **Named real person or brand mascot.** Cartoon hallucinates branding badly. Either provide a strong reference (and switch to a vibe-reference template) or rephrase the brief generically.
- **Investor / corporate-serious tone.** Cartoon reads as informal. For serious B2B, use a flat-vector explainer sub-style at most, not a full rubber-hose cartoon.
- **Length > 20s.** The format depends on snappy hook-action-payoff cycles. Long cartoons need real story structure that single-prompt i2v can't sustain.
- **Photoreal blend.** Don't mix cartoon character with photoreal background — model splits the difference and produces uncanny middle-ground frames.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 2-4 x `gemini-3-pro-image-preview` @ ~$0.15 | $0.30 - $0.60 |
| Video clips | 2-4 x `kling-v3.0-pro` x 5s @ $0.14/s | $1.40 - $2.80 |
| VO | 1-2 ElevenLabs calls (subscription) | $0 |
| Music + SFX | 1-2 ElevenLabs Music calls (subscription) | $0 |
| Captions | 1 x whisper-1 | ~$0.001 |
| Render | local | $0 |
| **Total** | | **~$1.70 - $3.40** |

Among the cheapest formats in the pack — short clips, no premium reference work, no extra QA passes.

## Read also

- `hooks.md` — 10 reusable 2-second hooks with prompt fragments.
- `prompt-cookbook.md` — master prompt template, camera/lighting/sound vocabulary, common mistakes, full example prompts.
