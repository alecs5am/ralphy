# Comic to Video — vibe style

**Genre:** sequential-art animation. Comic panels, manga pages, webtoons, illustrated storyboards → short narrative video where each panel becomes a motion beat.
**Length:** 10-25s typical (3-6 panel beats × 3-5s each).
**Format:** TikTok / Reels / Shorts default 9:16, 24fps. Switchable to 16:9 for YouTube cinematics, 1:1 for social, vertical scroll for webtoon-native.

> **Reference-required gate.** Source panels MUST exist at `workspace/projects/<id>/assets/uploaded/` before generation starts. AGENTS.md hard rule #3 refuses without them — there is no way to invent comic art that matches an existing series, and a generic AI "comic style" reads as slop. If the brief says "a comic in the style of X" with no panels uploaded, route to `/ralph-researcher` first.

## Why this works

Comics already are storyboards. The hard creative work — composition, pose, expression, emotional beat — is done. The pipeline only has to:

1. **Read the panels in the right order** (LTR vs RTL vs vertical scroll changes the entire story).
2. **Preserve the art's signature** — line weight, halftone, color model, screentone — so motion frames feel like extensions of the original, not a different render entirely.
3. **Translate static visual grammar to motion** — speed lines become motion blur, jagged speech bubbles become emphatic gestures, sweat drops mark micro-emotion.
4. **Pace by emotion, not by clock.** Dialogue panels breathe (1.5-2.5s), action panels snap (0.5-0.8s), comedic 4-koma punchlines hold the pause before landing.

The format converts strongly because the source already has a tested narrative arc — the pipeline just adds time and sound.

## Vibe anchors

- **Reading order is load-bearing.** Western LTR pans left→right. Manga RTL pans right→left (reversing this spoils the reveal). Webtoons pan top→bottom with parallax. State it explicitly in every prompt; never let the model guess.
- **Style preservation over photorealism.** "Preserve thick black ink outlines and CMYK halftone" beats "make it cinematic." If the source is screen-toned manga, the motion frames must keep the screentone — drift to smooth digital flats reads as a different show.
- **One panel = one motion beat.** Don't try to animate a 12-panel page in 3 seconds. Allocate 0.5-2.5s per panel based on whether it's action, dialogue, or emotional pause.
- **Hook in the first 2 seconds.** A static panel doesn't grab — pick a hook from `hooks.md` (panel crack, ink splash, speech-bubble pop, parallax drop) and open with it.
- **Speech bubbles dictate sound and motion.** Bubble shape encodes emotion (jagged = yelling, cloud = thought, wavy = fear). Tail direction encodes who animates. SFX onomatopoeia (POW, WHOOSH, RUMBLE) becomes audio + secondary motion.
- **Camera respects panel composition.** Don't add zooms the original artist didn't imply. The panel border is the original framing — push in only when emotional weight justifies it.

## Variation axes

| Axis | Options |
|---|---|
| Format | Western superhero, manga shonen, manga shoujo/seinen, webtoon, 4-koma, European BD/ligne claire, indie, raw storyboard |
| Reading order | Western LTR, Manga RTL, Webtoon Vertical, 4-Koma 2x2, European mixed |
| Tone | Action, emotional/intimate, comedic, noir, surreal, contemplative, horror |
| Panel-to-motion technique | Stance shift, expression morph, impact follow-through, speed-line activation, environment-only, depth shift, microexpression, multi-character sync |
| Transition | Dissolve, crack/shatter, wipe, morph, page-turn, ink-splash, hard cut |
| VO language | Any — English, Japanese, Korean, Russian, etc. The emotional arc reads visually regardless. |
| Output | 9:16 social, 16:9 cinematic, 1:1 feed, vertical scroll webtoon-native |

## Narrative arc (3-panel default)

```
0-2s     → Hook (one of 12 from hooks.md). Panel-1 art appears + opening motion grabs attention.
2-6s     → Panel 1 beat. Setup: who, where, what's about to happen. VO/dialogue if any.
6-11s    → Panel 2 beat. Escalation or response. Camera pans in reading-order direction.
11-15s   → Panel 3 beat. Resolution / reaction / reveal. Final transition lands the emotional payoff.
15-18s   → Outro card or held final frame with music tail.
```

For longer sequences (5-6 panels): same shape, scale each beat to 2-3s, total 18-25s. For single-panel "bring this illustration to life": one 5-8s clip, no transitions, hook is internal (e.g., ink splash sourced from the character).

## Required user inputs

1. **Source panels.** PNG/JPG/WebP, ideally one image per panel (or a single page with clear panel boundaries). **REQUIRED — refuse without.**
2. **Reading order.** Western LTR / Manga RTL / Webtoon Vertical / 4-Koma / European. Critical — the model defaults wrong half the time.
3. **Format / genre tag.** Shonen action, shoujo romance, noir storyboard, webtoon slice-of-life, etc. Drives art-style preservation keywords.
4. **Dialogue / SFX text** (transcribe from bubbles if not auto-readable). Plus speaker attribution per bubble.
5. **(Optional) Tone override.** "Make it more comedic" / "play it straight."
6. **(Optional) VO language.** Defaults to source language; auto-translates if requested.

## When NOT to use

- **No source panels.** Refuse — go research first or pick a different template.
- **The user wants "a comic-style original story from a brief."** That's `talking-character` or `01-cinematic` with comic-style keyframes — not this template, which is conversion-only.
- **Single static brand logo.** No sequence, nothing to animate panel-to-panel.
- **Live-action-style realism.** This template intentionally preserves illustration aesthetic; if the goal is photoreal, the wrong format.
- **More than ~8 panels in one video.** Pacing collapses; split into a series.

## Cost ballpark (3-panel, 15s, 9:16)

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 3-4 × `gemini-3-pro-image-preview` multi-ref @ ~$0.15 | ~$0.60 |
| Video clips | 3 × `kling-v3.0-pro` × 5s @ $0.14/s | ~$2.10 |
| VO | 1-3 ElevenLabs calls (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 1 × whisper-1 | ~$0.001 |
| Render | local Remotion | $0 |
| **Total** | | **~$2.70** |

Mid-tier cost. Goes up linearly with panel count: 6 panels ≈ $5, 8 panels ≈ $6.50.

## Read also

- `hooks.md` — 12 opener hooks (panel crack, speech bubble pop, ink splash, parallax drop, etc.) with name / setup / why / example.
- `prompt-cookbook.md` — master prompt template, reading-order rules, camera vocabulary, style-preservation keywords, speech-bubble-to-sound mapping, transitions, common mistakes, and 3 fully worked examples (Western action, manga emotional RTL, webtoon vertical).
