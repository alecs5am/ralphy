# Listicle / Top-N — vibe style

**Genre:** numbered list / countdown — "Top 5 X you didn't know", "3 things to stop doing", "7 tools that replace your job".
**Length:** 30-60s (45-55s is the sweet spot).
**Format:** YouTube Shorts (primary) / TikTok / Reels, 9:16, 30fps, 1080×1920.
**Reference:** not required by default. See `template.json` → `referenceNotes` for the named-brand edge case.

> **Why this is in the pack.** Format #9 in the 2026 short-form research doc, scored ★★★ on AI-fit, "Очень высокая" templatizability, and YouTube Shorts ★★★. Search-friendly and evergreen — a good listicle keeps pulling traffic for months because social platforms now serve as search engines (Sprout 2025: 37% of consumers go to social before Google for product research; 41% for Gen Z).

## Why this works

1. **Open loop in the hook.** The promise ("Top 5 …") creates a question — *what's #1?* — and the viewer stays to find out.
2. **Visible progress.** The big on-screen counter (1/5, 2/5, …) is a constant retention cue: the viewer always knows how much is left, and how close the payoff is.
3. **Even cognitive load.** Each item is a self-contained 6-10s beat with the same shape (b-roll → number → reason → cut). The pattern itself becomes comfortable to watch.
4. **#1 saved for the end.** Reverse-countdown is the default. The biggest, most surprising, or most useful item lands at the climax — completion-rate weapon.
5. **AI-friendly.** No face required, no real environment required. One keyframe + one short i2v loop per item is enough. Cheap to generate, cheap to A/B.

## Vibe anchors

- **Clear, specific promise in the hook.** "Top 5 AI tools that will replace your job" beats "Top AI tools." Specificity = stop-scroll.
- **Big counter, dominant.** The fraction counter (1/5, 2/5) is the strongest visual element on screen — bigger than the item title, bigger than the captions. If it disappears under the captions, the format is broken.
- **One item per ~7 seconds.** Faster than 5s feels rushed; slower than 10s loses tension. 5 items × 8s + 2s hook + 3s outro = 45s — typical.
- **B-roll idles, counter pops.** The b-roll loop should be calm — subtle camera drift, ambient motion. The counter and item title carry attention.
- **#1 cliffhanger.** When you reveal item #1, give it 1-2 extra seconds and a music lift. It's the payoff for the open loop.

## Variation axes

| Axis | Options |
|---|---|
| List size | 3, 5, 7, 10 — **5 is default** for 45-60s; 3 for ≤30s; 7-10 only if items are very short |
| Reveal order | reverse-countdown #5→#1 (**default**, classic WatchMojo) / forward #1→#5 (only if hook teases #1 twice) |
| Presence | faceless VO + b-roll (**default**, AI-friendly) / face-on-camera host cutting between items |
| Niche | tech / AI tools, finance / money, food / recipes, travel, gaming, productivity, life advice |
| Tone | informational ("5 X you didn't know") / controversial ("3 hot takes") / tested ("I tried N, here's #1") / mistakes ("3 things to stop doing") |
| VO language | any — counter and on-screen numbers are universal |

## Narrative arc (5-item example, ~50s total)

```
0-2s    → Hook + promise. "Top 5 AI tools that will replace your job — and #1 is already taking mine."
                                         ^ open loop on #1, search-keyword-rich
2-3s    → Beat-zero card (optional). Title card "5 AI tools" + small subtitle "ranked".
3-11s   → Item #5. b-roll-loop_5 + counter "5/5" + item title + 1-line reason in VO.
11-19s  → Item #4. b-roll-loop_4 + counter "4/5" + …
19-27s  → Item #3.
27-35s  → Item #2.
35-45s  → Item #1. Slightly longer beat (10s vs 8s). Music lifts. "And #1 — the one I actually use every day…"
45-50s  → CTA / outro. "Subscribe for more lists like this." or "Which one would you try? Comment #5/4/3/2/1."
```

For 3-item lists, drop to 30-35s with 8s items. For 7-item, drop each item to 5-6s and skip the beat-zero card.

## Required user inputs

1. **Topic** — what's the list about? ("AI tools", "European cities to visit in winter", "habits to drop").
2. **List size** — 3 / 5 / 7 / 10. Default 5.
3. **Items** — N item names + a 1-line reason for each ("why this is on the list"). One item per line is enough.
4. **(Optional) Niche** — tech / finance / food / travel / gaming / productivity / life. Affects b-roll vibe and music.
5. **(Optional) Reveal order** — reverse-countdown (default) or forward.
6. **(Optional) Tone** — informational (default) / controversial / tested / mistakes.
7. **(Optional) VO language** — defaults to English.

## When NOT to use

- **The ranking feels arbitrary.** If item #3 could trade places with item #1 and nobody would notice, the format collapses. Listicle needs a real ranking signal — best, worst, biggest, most-likely-to-X.
- **Items don't have visual support.** "Top 5 abstract concepts" — there's nothing to b-roll. Either pick a more concrete topic or use Tier List instead.
- **Items need long context.** If each item needs 30s of explanation, this is a tutorial, not a listicle. Cap context at 1-2 lines per item.
- **One item dominates the others.** "Top 5 reasons X is bad" where #1 is 80% of the argument — turn it into a Hot Take instead, item-shape will feel padded.
- **Hard product ad.** Listicle works for product *roundups* ("5 tools we tested"), not single-product ads. Use Before/After Product for single-product conversion.

## Read also

- `hooks.md` — 12 listicle hook patterns with setup / why / example.
- `prompt-cookbook.md` — counter-overlay design, item-beat structure, VO pacing, music, mistakes-with-fix, 4 worked examples (tech AI tools, healthy snacks, productivity hacks, travel destinations).
