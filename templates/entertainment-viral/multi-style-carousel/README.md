# multi-style-carousel

A multi-style multi-slide social carousel (5 slides × N aesthetics) where the deliverable is the **baked-text image itself** — no HyperFrames compose. One brand mascot + one benefit arc (hook → problem → how → proof → CTA) is reshot across several distinct looks so the same campaign can A/B a dozen visual registers from one copy deck. Source: `workspace/projects/ralphy-carousel-001/` (the Ralphy ghost mascot, "your terminal is a video studio" arc, 6 styles × 5 slides = 30 final slides).

**Kind:** vibe-style (the recipe is the deliverable — there is no HyperFrames composition; the output is the baked PNG slide set).
**Category:** entertainment-viral (a swipe-through social post).
**Format:** carousel.
**Aspect:** 4:5, 1080×1350.
**Count:** 5 slides per style × N styles (source: 6 × 5 = 30).
**Output:** baked-text PNG slides, one folder/contact-sheet per style.

## How to use

```bash
ralphy template use multi-style-carousel \
  --project <new-project-id> \
  --brief "<your mascot + benefit arc + the styles to A/B>"
```

Then run the pipeline in `composition.md`. There is no render/compose stage — the slides ARE the deliverable.

## Files

| File | What's in it |
|---|---|
| `composition.md` | The cover-first pipeline, the benefit-arc structure, the dual-ref cohesion rule, the contact-sheet review trick. Read this first. |
| `prompt-cookbook.md` | The reusable per-style JSON STYLE+QUALITY block, the "redraw the mascot IN the medium" fix, the single-accent recolor, all with `{{slots}}`. |
| `model-stack.md` | Model picks per stage + cost ballpark + what to avoid. |

## Heavy assets

The source mascot master shot is mascot-specific and not committed here — each remix supplies its own neutral master and passes it as `--ref` on every gen. A reusable mascot identity set, if one proves out, lives in `ralphy-assets/pool/<mascot-slug>/`.

## Cost ballpark

**~$6.8** for a 6-style × 5-slide set (gpt-5.4-image-2 at $0.20/slide; 30 slides + a handful of cover re-rolls). The source ran $6.80 (~1.13× the $6.00 minimum). The only avoidable spend was a brief abandoned style direction (~$0.20) and a punk/acid cover re-roll for mascot-fit (~$0.40) — both eliminated by the cover-first checkpoint and a gritty mascot variant.

## Key rules (each cost money or time in the source project)

1. **Cover-first per style is cheap insurance.** Generate ONE cover per style, review all covers together, THEN fill the remaining slides. This caught a mascot-fit mismatch before the full sets ran — avoided ~$1.60 of blind gens (8 bad slides).
2. **A clean cute mascot does NOT survive gritty/grunge styles.** Punk (xerox) and acid (acid-grunge) fought the clean white ghost. Either redraw the mascot ENTIRELY IN the poster's own medium (verbatim prompt token, see cookbook) or build a dedicated pre-distressed character ref for those styles, and keep the clean mascot for clean styles.
3. **Anchor identity with the mascot ref on EVERY gen; add the approved cover as a 2nd ref for per-style cohesion.** `--ref mascot.png --ref {style}-01.png` holds the character across all slides AND keeps each 5-slide set internally consistent (same paper/light/grade as its cover).
4. **Per-style reusable STYLE + QUALITY blocks, vary only scene + ui_elements.** Lock one STYLE/QUALITY JSON fragment per aesthetic; only swap the scene subject + the exact baked text per slide. That is what makes a 5-slide set read as one design.
5. **All-AI baked text works on `gpt-5.4-image-2` for SHORT display copy.** 30/30 slides baked a 1-2-line headline + small label + one sub-line legibly and spelled-right. Keep headlines short; don't ask it to set paragraphs.
6. **Single-accent lock in every prompt.** Lock ONE accent hue and ban a second (`NO other hue` in the description + the source hue in the AVOID list) — keeps each style on one color and stops gpt-image drifting into rainbow chrome.
7. **"Use our colors" is a one-line instruction.** State the hex AND ban the source hue — e.g. an acid-green reference recolors reliably with `bright brand-ORANGE #FFA630 — NOT green` + AVOID `["green color"]`.
8. **`gpt-5.4-image-2` is capped at 1 concurrent per key — serialize.** Two parallel bg loops → `403 key limit`. Plan each batch as one sequential loop; queue the next behind it.
9. **Never edit/delete a prompt-input file while a background gen-loop reads it.** The loop re-reads each prompt file per iteration; `rm prompts/slide-0?.txt` mid-loop killed three slots (`--prompt arg missing`). Sequence all file edits AFTER background jobs finish.
10. **Transient TLS/socket errors kill a slot mid-batch — budget for retries.** They surface as a fatal exit-1 with no auto-retry, leaving a hole. Re-running the single slot fixes it every time, at $0.

## Do not copy literally

The source mascot (clean white sheet-ghost) and the "video studio" copy are one-off. Reuse the METHOD: one benefit arc reshot across N styles, cover-first checkpoint, dual-ref cohesion, reusable per-style JSON STYLE+QUALITY blocks, single-accent lock, mascot-redraw-in-medium for grunge, serialize on gpt-image with transient retries. Supply your own mascot, arc, and style set.
