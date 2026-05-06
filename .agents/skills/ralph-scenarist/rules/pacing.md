# Pacing

## 15s formula (TikTok/Reels default)

```
0-3s   → hook (must land or scroll)
3-13s  → demo / content body
13-15s → CTA / button-press / outro
```

15s is our default. The shortest length that can say something meaningful on TikTok without cuts. 12-18s is fine; ≥20s requires justification.

## Per-scene budget

- **Each scene ≤ 3s** with no internal cut. 3+ seconds of a single shot in UGC = pacing dead.
- **Hook scene ≤ 3s**, ideally 2s.
- **CTA scene ≤ 2s** — the user either taps or doesn't.

If you want a 5s scene — split it into 2 shots with a micro-cut (jump cut, push-in, reverse) inside one narrative beat.

## Word budget per scene

**2.5 words/sec** for RU deadpan VO. Count words in each VO line:

- Hook (2-3s) ≤ 5-7 words
- Body scene (3s) ≤ 7-8 words
- CTA (2s) ≤ 5 words

Long VO in a short shot = TTS compresses it, sounds "rushed" and "tight".

## Total duration

`scenario.duration` or `scenario.durationSec` — top-level. Default 15. Range 10-25.

`durationFrames` is computed by the editor: `durationSec * fps` where `fps = 30` (our default).

## Pacing patterns by angle

| Angle | Pattern | Notes |
|---|---|---|
| testimonial | hook → 2-3 reaction shots → CTA | stronger with a micro-zoom-in on the face during reactions |
| unboxing | tease → reveal → reaction → use | the first 1s must be the "tease" — packaging is mandatory |
| problem-solution | pain (5s) → product (10s) | maximum 5s on pain — otherwise scroll |
| comparison | A (3s) → B (3s) → A vs B (5s) → CTA | paired composition, symmetrical shots |
| demo | quick teaser → 3-4 demo beats → result | each beat 2-3s |

## Cut cadence

The faster the cuts, the higher the completion rate. Average on TikTok is 1 cut every 2.0s (≈7 cuts per 15s). Fewer cuts feel slow to a younger audience; more is disorienting.

For talking-head templates this rule doesn't apply — talking-head should be continuous, transitions = death of immersion.

## Pacing gate

`scoreScenario` warning (not fail) if:
- scene > 3s with no internal cut → warning
- total duration > 18s → warning (not a fail if there's an obvious narrative reason)

Hard fails (not warnings):
- total duration > scenario.duration
- hook scene > 3s
- no VO in a content scene (silent: true must be explicit)

## Special: podcast clips / repurpose

`workspace/projects/lyadov-podcast-001/` — real case. 16:9 source → 9:16 cuts on viral moments. Each clip duration 15-60s (`find-viral-moments` enforces this). This is an **exception** to the 15s rule — explicit podcast-mode flag in the scenario.
