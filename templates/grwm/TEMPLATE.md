# GRWM (Get Ready With Me) — vibe style

**Genre:** modern GRWM as codified by Alix Earle — creator gets ready for an event while running a parallel storytime / commentary track.
**Length:** 30-90s.
**Format:** TikTok / Reels / Shorts, 9:16, 30fps, 1080×1920.
**Cadence:** jump-cut every 4-7s between makeup / outfit steps. 5-12 clips total.

> **Reference-required gate.** If the brief names a real brand (Sephora, Rare Beauty, Charlotte Tilbury, Glossier, etc.), a reference (photo / logo / packaging) MUST exist at `workspace/projects/<id>/assets/uploaded/`. Without it, `/ralph-art-director` refuses (AGENTS.md hard rule #3). For generic GRWM with no named brand, the gate is soft — but a character reference is still strongly recommended so the face stays consistent across 8+ jump-cuts.

## Why this works

GRWM is one of the highest-completion formats on short-form because it carries **two independent retention hooks** running in parallel:

1. **Visual dynamic.** Hands move, makeup goes on, the look transforms in jump-cuts. The eye has new information every 4-7s.
2. **Narrative pull.** A story unfolds in voice — date, drama, hot take, confession. The ear has a payoff coming.

If the visual stalls, the story holds. If the story drifts, the makeup pulls. **Both layers must work; either alone is weaker than the format average.**

The format is also ideal for **native product placement** — the makeup / outfit *is* the visual track, so a Sephora product or a Rare Beauty stick lands as part of the routine rather than as an interruption. Brands love it because it converts without feeling like an ad.

## Vibe anchors

- **Strong opening line + first makeup beat.** First 3 seconds set both layers. "Today I'm having the strangest date of my life — let me tell you while I do my base." Visual: foundation goes on. Audio: hook line.
- **Jump-cut between steps.** Never linger on one beat. Every 4-7s, hard cut to the next step. The cuts ARE the rhythm.
- **Voice tells a story while hands work.** The VO does NOT narrate the makeup ("now I'm applying foundation"). It runs an independent storyline. The viewer's brain stitches them.
- **Final reveal.** A mirror beat or outfit-reveal walk-out. The transformation lands as a payoff to the visual track.
- **Cliffhanger or CTA.** "Part 2 tomorrow when I tell you what he said." "Comment if you want the full story." The last second is the next-video pitch.
- **Native product placement.** When a brand is in play, hold the product clearly for ~1s on at least one beat — but in-use, not as a hero shot. The reference image is mandatory.

## Variation axes

| Axis | Options |
|---|---|
| Occasion | date / wedding / investor meeting / first day of work / gym / festival / brunch |
| Beauty-level | full glam / no-makeup-makeup / minimal / skincare-only |
| Narrative type | storytime / hot-take / vlog-update / advice / confession |
| Final reveal | mirror selfie / outfit-reveal walk-out / CTA cliffhanger / "part 2 tomorrow" |
| Niche | beauty / fashion / lifestyle / fitness (gym GRWM) / corporate ("GRWM for an investor meeting") |

## Narrative arc

```
0-3s     → Hook. Strong opening line + first makeup beat (foundation, primer, or cleanser).
            VO: "Today I'm <verb-ing>, so let me tell you about <intriguing thing>."
            Visual: hands on face, mirror reflection, or first product picked up.

3-60s    → Parallel tracks.
            Visual: jump-cut every 4-7s between makeup / outfit / hair steps.
              Beat 1: base / foundation
              Beat 2: eyes / brows
              Beat 3: lips / contour
              Beat 4: hair
              Beat 5: outfit / accessories
              (5-12 clips depending on duration)
            VO: storytime / commentary running underneath. Independent narrative.
              Beats build: setup → tension → twist → punch.

60-90s   → Final look + cliffhanger / CTA.
            Visual: mirror reveal, walk-out, or hero-shot of finished look.
            VO: "and that's why <punchline>." or "part 2 tomorrow when I tell you what he said."
```

For a 30-45s video: compress parallel-tracks to 3-6 beats, drop one of the longer narrative steps. Hook + reveal stay.

## Required user inputs

1. **Occasion** — date, wedding, investor meeting, gym, etc. Drives the look and the story tone.
2. **Makeup / outfit steps** — 4-8 steps the creator will perform. Drives the visual track.
3. **Story to tell** — what the VO is *actually* about. Storytime, hot take, advice. Without this, GRWM collapses into a product reel — see "When NOT to use".
4. **Brand references** — if any named brand appears, photo / logo / packaging is REQUIRED. Otherwise refuse.
5. **(Optional) Character reference** — strongly recommended for face consistency across 8+ jump-cuts.
6. **(Optional) VO language** — defaults to English. Works in any language; the dual-layer holds regardless.

## Reference-required gate (hard refuse)

If the brief mentions a specific brand without a file at `workspace/projects/<id>/assets/uploaded/<product-ref>.<ext>`:

> "The brief mentions '<brand>'. I need a reference (photo / logo / packaging) — drop one in this chat, or rephrase the brief in generic terms ('this lip stick', 'a foundation'). I can't ship this with hallucinated branding — it always reads as fake on a real brand."

For character consistency:

> "GRWM jump-cuts 8+ times across the same face. Without a character reference, gemini-3-pro will drift between cuts and the look will read as 'three different women putting on makeup'. Drop a portrait reference, or accept the drift."

## When NOT to use

- **No story to tell.** GRWM without a narrative track is just a product reel — use `before-after-product` or a product-360 format instead. The dual-layer is the whole point.
- **No on-camera presence.** GRWM is built around a real face doing real things in real time. If the user has no character to anchor it, switch to an `ai-avatar` or product-only format.
- **Pure product spotlight.** If the goal is "show off this lipstick", a 6s product shot will outperform a 60s GRWM — wrong tool.
- **Brand-awareness only.** GRWM is conversion-friendly via native placement, but if there's no product or service at all, the format wastes its placement potential.
- **Length < 25s.** The dual-layer needs room to breathe. Under 25s, the story can't develop; the visual is just a montage. Use a hook-only format instead.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Keyframes | 8-12 × `gemini-3-pro-image-preview` @ $0.15 | $1.20 - $1.80 |
| Video clips | 6-10 × `kling-v3.0-pro` × 4-5s @ $0.14/s | $3.40 - $7.00 |
| VO | 1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 1 × whisper-1 | ~$0.001 |
| Render | local | $0 |
| **Total** | | **~$4.60 - $8.80** |

Higher than `before-after-product` because the jump-cut count is higher. The dual-layer pays it back in completion rate.

## Read also

- `hooks.md` — 12 GRWM opener patterns with setup, niche fit, and audio cue.
- `prompt-cookbook.md` — master parallel-track scaffold, beauty-shot vocabulary, jump-cut pacing, VO settings, caption style, music mix, common mistakes, and 4 worked examples.
