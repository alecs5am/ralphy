# Tier List / Ranking — vibe style

**Genre:** opinion-as-content. Visible S/A/B/C/D grid; items pop into their slot with a one-line reason; end on a controversial pick to spark comments.
**Length:** 40-75s.
**Format:** TikTok / Shorts / Reels, 9:16, 30fps, 1080×1920.

> **Remotion-heavy.** The tier grid is the hero of the composition and is built in Remotion (color-coded rows, spring item pops, audio cues, tier highlight). gemini-3-pro generates per-item icons. kling-v3.0-pro i2v is OPTIONAL and only for the hook intro. Do not try to generate the grid itself with i2v — it'll look mushy and unreadable.

## Why this works

1. **Opinion-as-content drives debate.** Every viewer has their own ranking. Disagreement = comments = algorithm signal. "Why is X in B?" is the engagement engine.
2. **Search-friendly evergreen.** "Ranking [niche] 2026", "best [category] tier list" are persistent search queries. Tier-list videos surface in search long after the trend wave passes.
3. **Templatizable.** ★★★ in the AI-friendliness matrix. Same grid composition, swap items + reasons + voice. The format is a function: `tierList(category, items, opinions) → video`.
4. **Faceless-friendly.** No creator on camera needed. Pure VO + grid. Lower barrier, easier to batch.

## Vibe anchors

- **The grid is visible the whole time.** Don't cut away from it — viewers want to see what's coming. Pre-render empty rows in frame 0 so the structure is legible before any item lands.
- **Item pops with audio cue.** Spring animation + a short whoosh/pop SFX on impact. Without the audio cue, the pop feels weightless.
- **Tier row briefly highlights on pop.** 0.3s glow on the destination row tells the viewer where to look.
- **Controversial final pick is actually controversial.** Putting a beloved fan-favorite in D-tier (or a meme entry in S) is the comment driver. A safe ranking dies in the For You queue.
- **Mobile legibility is non-negotiable.** Item icon ≥ 180px, tier label ≥ 96pt, reason text ≥ 56pt on 1080×1920. If you can't read it on a 6-inch phone screen one-handed, it's broken.
- **Consistent icon style.** All items must share visual style (all flat illustrations, OR all photo cutouts, OR all logo chips). Mixed styles look like Frankenstein.

## Variation axes

| Axis | Options |
|---|---|
| Tier count | 3 (S/A/B — tight, ≤45s) / 4 (S/A/B/C — default) / 5 (S/A/B/C/D — full ladder, 60-75s) |
| Category | gaming, movies, anime, food chains, dating apps, AI tools, brands, fast food, streaming services, sports teams |
| Reveal order | D→S (ascending crescendo) / S→D (lead with the bangers) / random (chaos, debate-maximizing) |
| Commentary tone | snarky / serious-analytical / chaotic-shitposty / earnest-fan |
| VO language | any — visual reads regardless |

## Narrative arc

```
0-2s    → Setup. "Ranking every [X]" title card or hook intro. Empty grid visible.
2s-end-3s → Per-item beats, ~3-5s each:
            • Item icon springs into its tier slot
            • Audio cue (whoosh/pop)
            • Destination tier row glows 0.3s
            • Reason overlay text appears (1 short line)
            • VO delivers the opinion
end-3s-end → Controversial final pick + outro. Hold on the full grid.
              VO closes with a debate-bait line ("fight me in comments").
```

For a 5-item list at ~5s each: 2s setup + 25s items + 3s outro = ~30s.
For a 10-item list at ~5s each: 2s setup + 50s items + 3s outro = ~55s.

## Required user inputs

1. **Category** — what's being ranked (e.g. "fast-food chains", "Studio Ghibli films", "dating apps").
2. **Items list** — 5-12 entries. Each: name + (optional) reference photo/logo.
3. **Tier assignments** — which item goes where (S/A/B/C/D). The user's opinion is the content.
4. **Controversial pick** — which entry is the deliberate hot take. (If the user doesn't flag one, ask.)
5. **Commentary tone** — snarky / serious / chaotic / earnest. Default: snarky.
6. **(Optional) VO language** — defaults to English.
7. **(Optional) Reveal order** — defaults to D→S ascending.

## Reference policy

- For **branded items** (fast-food chains, dating apps, console games, named anime characters), user-supplied logos / promo art make the icons look real. Strongly preferred but not required.
- If a real brand is named AND no reference is supplied, fall back to a **stylized text chip** with the brand name in the slot — never an AI-hallucinated logo.
- For **generic categories** (pizza toppings, study habits, sleep positions), no references needed; gemini-3-pro generates clean iconography.

## When NOT to use

- **Items have no visual identity** (e.g. "ranking emotions"). Without recognizable icons, the grid is just text — boring.
- **Audience is unlikely to argue.** A tier list of "things everyone agrees are good" has no engagement engine. Pick categories with passionate, polarized fans.
- **Pure educational content** that needs nuance. The format compresses each item to ~5s + 1 line — bad for genuinely complex topics.
- **Brand-safe corporate brief** that can't tolerate a controversial pick. The controversial final IS the format. Without it, kill the format and use a Listicle / Top-N instead.
- **>12 items.** Grid gets cluttered and per-item time drops below the 3s legibility floor.

## Cost ballpark

| Stage | Detail | Cost |
|---|---|---|
| Item icons | 8 × `gemini-3-pro-image-preview` @ $0.15 | ~$1.20 |
| Hook intro (optional) | 1 × `kling-v3.0-pro` × 4s @ $0.14/s | $0.56 |
| VO | 1 ElevenLabs call (subscription) | $0 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| Captions | 0-1 × whisper-1 | <$0.001 |
| Render | local | $0 |
| **Total** | 8-item list with hook intro | **~$1.75** |

Cheapest format in the pack — most cost lives in static icon generation, no long i2v footage needed.

## Read also

- `hooks.md` — 10-12 tier-list opening hooks, with setup + why + example for each.
- `prompt-cookbook.md` — master prompt template, grid layout vocabulary, item-pop pattern, VO pacing, music direction, common mistakes, four worked examples (anime power scaling, fast-food chains, dating apps, AI tools).
