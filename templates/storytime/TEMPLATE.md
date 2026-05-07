# Storytime — vibe style

**Genre:** selfie talking-head narrative — the creator looks straight into camera and tells a personal story (dramatic, funny, awkward, true-crime, throwback).
**Length:** 60-180s. One of the few long formats that hold on short-form feeds.
**Format:** TikTok (primary) / Reels, 9:16, 30fps, 1080×1920.

## Why this works

Storytime breaks the scroll rules. Most short-form formats fight for the first 3 seconds and let the rest decay; storytime fights for the first 2 seconds and then *cashes in* — the viewer commits because they want the payoff. Once they're 15s in, sunk-cost takes over. That's why a 90s storytime can match completion rates a 12s rant cannot.

It earns its length on three levers:

1. **A pre-hook that promises a specific payoff.** "I can't believe this actually happened" is a contract. The viewer stays to collect.
2. **Rising tension with pattern-interrupts.** Every 8-15s the visual switches — a screenshot insert, a b-roll cutaway, a zoom-shake, a frozen-frame thought-bubble. Without these, attention collapses around the 20s mark.
3. **A payoff (or cliffhanger).** The story either lands ("…and then she paid for the whole table") or breaks for part 2 ("…and that's when I found out he was —"). Cliffhanger storytimes drive follower-conversion harder than any other format.

Drew Afualo is the canonical reference. The format dominates dating, parenting, work-drama, true crime, and podcast clips, and is one of the highest DM-share formats on TikTok 2026.

## Vibe anchors

- **Strong pre-hook in 0-2s.** Specific, intriguing, slightly disorienting. Not "let me tell you about something." Yes "I can't believe this actually happened to me at the airport."
- **Selfie framing.** Front-camera energy — not a studio close-up. Slightly off-axis eye contact, conversational warmth, expressive eyes, occasional lean-into-camera at tension peaks.
- **One narrator throughout.** The talking-head is the spine; pattern-interrupts cut away briefly and return.
- **Rising tension.** Every beat is more intense than the last until the payoff. If a beat doesn't escalate, cut it.
- **Pattern-interrupts every 8-15s.** Screenshot insert, b-roll cutaway, gesture zoom, frozen-frame thought. Without them, the viewer disengages around 20s.
- **Captions are not optional.** 85% of viewers watch muted. Word-level Hormozi or TikTok-white-stroke. No captions = no completion.
- **Payoff or cliffhanger — never just stop.** End on the punchline or break for part 2. A storytime that fades out lands as a draft, not a video.

## Variation axes

| Axis | Options |
|---|---|
| Story type | dating-fiasco / family-drama / work-incident / school-throwback / true-crime |
| Tone | deadpan / dramatic / comedic |
| Pattern-interrupt cadence | sparse (every 12-15s, ~3-4 inserts) / busy (every 5-8s, ~6-8 inserts) |
| Final beat | resolved payoff / cliffhanger-for-part-2 |
| Narrator archetype | Gen-Z urban / millennial professional / stay-at-home parent / older-confidant |
| VO language | any — English default; narrative format is language-agnostic |

## Narrative arc

```
0-2s    → Pre-hook. Selfie talking-head, lean-into-camera. One sentence that
          promises a specific payoff. ("I can't believe this actually happened
          to me at the airport.")

2-10s   → Setup. Where, when, who. Just enough context for the tension to
          land. No backstory dumps. End the setup with a turn ("…and that's
          when she walked in.")

10-60s  → Rising tension. 3-5 escalating beats. Each beat = ~10-12s of VO +
          one pattern-interrupt at the turn. Screenshots, b-roll cutaways,
          gesture zooms, frozen-frame thought-bubbles. Each beat raises the
          stakes; each interrupt resets attention.

60-90s  → Payoff or cliffhanger.
          - Payoff variant: the punchline lands, narrator reacts, music
            lifts +3dB, captions go big.
          - Cliffhanger variant: cut on the most charged sentence. Caption
            "PART 2 ↗". Music holds.

90-180s → Optional extension for true-crime / multi-act drama. Same beat
          structure: 10-12s VO + interrupt. Don't pad — every beat must
          escalate.
```

## Required user inputs

1. **Story** — must include:
   - **Hook line** — the literal 0-2s pre-hook sentence.
   - **Setup** — where/when/who in 2-3 lines.
   - **Escalation beats** — 3-5 beats, each more charged than the last.
   - **Payoff** — the punchline, or the cliffhanger break-point.
2. **Pattern-interrupts** — list of 3-7 interrupt moments:
   - **Screenshot inserts** (text messages, Reddit posts, fake headlines, chat threads)
   - **B-roll moments** (hand gesture, environment beat, prop close-up, reenactment shot)
3. **Tone** — deadpan / dramatic / comedic. Drives VO direction and music bed energy.
4. **(Optional) Narrator archetype** — defaults to "millennial professional" if omitted.
5. **(Optional) VO language** — defaults to English.
6. **(Optional) Final-beat mode** — payoff (default) or cliffhanger-for-part-2.

## When NOT to use

- **Story is too short (<30s of actual content).** Use `yap-talking-head` for single-idea education or `pov-first-person` for a quick visual moment. Storytime needs rising tension; without it, the format reads as padded.
- **Content is contrarian / hot-take.** Use `talking-head-rant`. Storytime is plot-driven, not opinion-driven; a rant in storytime clothing falls flat because there's no payoff structure.
- **Single-idea education.** Use `yap-talking-head`. Storytime over-promises a narrative payoff that an explainer can't deliver.
- **Product showcase.** Use `before-after-product`. Storytime can't carry a visual product reveal; the narrator's face is the spine.
- **Multiple narrators.** This format is single-character. For dialog, use `talking-character` or split into two cuts.
- **No pattern-interrupts available.** If the brief gives no screenshots / b-roll moments and the user can't generate them, attention dies around 20s. Either gather interrupts or pick a shorter format.

## Cost ballpark per video

| Stage | Detail | Cost |
|---|---|---|
| Character keyframe | 1 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.15 |
| Screenshot inserts | 3-5 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.45 - $0.75 |
| Talking-head clips | 6-12 × `kling-v3.0-pro` × 5s @ $0.14/s | ~$4.20 - $8.40 |
| B-roll cutaways | 3-7 × `kling-v3.0-pro` × 5s @ $0.14/s | ~$2.10 - $4.90 |
| VO | 1-2 ElevenLabs calls (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 1-2 × whisper-1 | ~$0.002 |
| Render | local | $0 |
| **Total (90s storytime)** | | **~$7 - $12** |
| **Total (180s storytime)** | | **~$13 - $20** |

The cost scales with runtime — longer stories need more talking-head clips and more b-roll. The dominant cost is `kling-v3.0-pro` at $0.14/s. Premium swap: replace the 0-2s pre-hook clip with `veo-3.1` for sharper lip-sync (+$1.05); the rest stays kling.

## Read also

- `hooks.md` — 12 storytime pre-hook patterns with setup, escalation hint, and target niche.
- `prompt-cookbook.md` — master 4-act story scaffold, talking-head prompt vocabulary, pattern-interrupt design, VO direction, captions, music, mistakes-to-avoid, and 4 worked examples.
