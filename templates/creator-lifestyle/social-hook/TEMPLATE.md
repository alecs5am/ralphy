# Social Hook — TEMPLATE.md

> Very short. 6-15 seconds. 9:16. Engineered for a single job: defeat the swipe in the first 3 seconds. Nothing else matters until that gate is cleared.

## What this template is

A scroll-stopper for TikTok / Reels / Shorts. The hook IS the deliverable — the rest of the clip is just the payoff promised by the first 3 seconds. Unlike narrative formats (before-after-product, storytime, music-video), Social Hook is a unit of attention engineering, not a story.

Use it when:
- The brief says "make something that gets views" / "make it go viral" / "scroll-stopper" / "hook for our X video".
- The user wants the **opening 3 seconds** of a longer piece (we ship just the hook; they tail it themselves).
- The user wants a **6-10s hero clip** for paid social or top-of-feed organic.

Don't use it for:
- Anything that needs a full narrative arc (use `talking-head-rant`, `before-after-product`, or `motion-design-ad`).
- Branded ads where the product must be visible by 1s — use `before-after-product` instead, it has the reference-required gate.

## Why hooks dominate

The TikTok / Reels / Shorts algorithm is brutal and public:
- **0-2s** is the retention gate. If 50%+ bounce here, the algorithm buries the video.
- **2-5s** is hook confirmation — viewer decides if it was real.
- **5-15s** is the engagement zone — where most of the watch time is earned.
- 80%+ completion → 2x algorithmic reach. 50% or less → shadowban.

Translation: the first 3 seconds carry the entire economic value of the video. Every other consideration (story, brand, message) is downstream.

## Anchors (do not break these)

1. **First-3-seconds rule.** Frame 0 must already be doing something the eye cannot predict. No fade-ins. No logo cards. No "Hey guys". The hook starts at frame 0 or it's already lost.
2. **Pattern interrupt.** Frame 0 violates a viewer expectation — scale, physics, color, composition, or context. The brain says "anomalous, pay attention" before conscious thought engages (~200ms).
3. **Curiosity gap.** By 1.5s, the viewer has a question they can only answer by NOT scrolling. Show 60% of the reveal, withhold 40%.
4. **Sound is 50% of impact.** Audio starts ≤0.5s. Silence is only acceptable when it sets up a subsequent stab. Quiet ambient hook = dead hook.
5. **Movement always present.** No static talking heads in the first 2s. If the subject has to talk, the camera or the cut moves.
6. **Single primary stimulus per beat.** Don't stack pattern interrupt + glitch + text command + bass drop in the first 0.3s. Pick one. Stacking dilutes.

## Variation axes

Hook angle (the dominant axis — pick one, don't blend):
- **gatekeep** — "Don't tell anyone I told you this" / insider energy
- **skeptic** — "I didn't believe this either, but…" / earned credibility
- **fail** — open on a visible mistake / disaster mid-frame
- **visual-shock** — impossible physics, extreme scale, color explosion
- **curiosity** — half-reveal, ladder-reveal, misdirection
- **transformation-tease** — show the after first, withhold how
- **direct-address** — eye contact + question to camera

First-frame stimulus (independent of angle):
- impossible physics / extreme close-up / freeze-frame break / glitch effect / cute overload / reaction face / split screen / color explosion

Voice presence:
- silent + SFX only (visual-shock, satisfying)
- single VO line, lands ≤1.5s (storytime, gatekeep, skeptic)
- direct-address question to camera (reaction, controversy)
- ASMR whisper (satisfying, intimate)

Text overlay treatment:
- HORMOZI-shout (large, yellow/white, bouncing)
- minimal question (one line, center, sans-serif)
- command word: WAIT / LOOK / STOP / WATCH / LISTEN

See `hooks.md` for the 12-pattern library and when each fires.

## Narrative arc (such as it is)

Hooks barely have an arc. The structure:

```
[0.0 – 0.3s]  ATTENTION GRAB
              One stimulus. Visual or sonic. No competing elements.

[0.3 – 1.5s]  CURIOSITY BUILD
              Information starts to resolve, but incompletely.
              First text overlay lands here (0.3-0.7s).
              Sound either builds or holds menacingly.

[1.5 – 3.0s]  COMMITMENT MOMENT
              Viewer decides: keep watching or scroll.
              The hook's promise is partially confirmed.
              Second text overlay can land here (1.2-1.5s).

[3.0 – end]   PAYOFF
              Deliver on the promise. Don't drag it past 15s total.
              If the promise isn't kept by ~5s, the hook was a lie
              and the algorithm punishes accordingly.
```

For a 6s clip: the whole thing IS the hook + immediate payoff.
For 10-15s: hook is 0-3s, payoff/punchline 3-15s.

## Inputs

The scenarist needs:
- **Hook angle** (one of the seven above) — the user usually has a feeling; map it.
- **Subject / niche** — what's the video actually about? (food, fitness, tech, finance, fashion, drama, etc.)
- **Voice presence** — silent? VO? direct address? Default to silent + SFX if unsure (lowest risk, highest mystery).
- **Platform** — TikTok / Reels / Shorts (affects pacing and text density; defaults to TikTok).
- **Total duration** — 6s (hook only), 10s (hook + punchline), 15s (hook + setup + payoff). Default 8s.

Optional:
- Brand / product / person reference (only required if the hook will visibly feature one — see AGENTS.md rule #3).
- Trending audio reference (the user can provide a TikTok URL; the researcher playbook handles extraction).

## Stack

See `template.json` `stackSummary`. Headline:
- 1-3 keyframes via Gemini 3 Pro (frame 0 is sacred — over-iterate that one).
- 1-2 i2v clips via Kling v3.0 Pro, 5s each, no audio.
- Optional VO via ElevenLabs multilingual v2.
- Music via ElevenLabs Music — one track, hard hit on the resolve.
- Captions: HormoziCaptions or BoldImpactCaptions, motion-in animation.

## When NOT to use this template

- The user wants a story (use storytime / talking-head-rant).
- The user wants a product ad with a real product visible (use before-after-product — it has the named-entity reference gate built in).
- The user wants a music video (use music-video).
- The user wants something cinematic / slow / mood-driven (use cinematic). Hooks are loud and fast by definition.
- The brief says "longer-form" or ">30s". This template caps at ~15s. Beyond that, the format flips and other rules apply.

## Quality gates

Specific to hooks (in addition to the standard `scoreScenario` checks):

1. **Frame-0 test.** If you scrubbed to frame 0 and showed it to a stranger for 1 second, would they pause? If no, regenerate frame 0.
2. **Sound-on test.** Does the audio start ≤0.5s? Is it intentional, not silent ambient?
3. **3-second test.** Read the scenario for the first 3 seconds only. Does it answer "why should I keep watching?" If no, the hook is broken.
4. **Cliché check.** Does the text overlay say "WAIT FOR IT" / "POV:" / "Tell me you ___ without telling me"? In 2026, these are tired. Reject and rewrite unless the user explicitly asked for ironic use.

If two consecutive regenerations fail any of these, stop and report — do not render mp4 over a broken hook.
