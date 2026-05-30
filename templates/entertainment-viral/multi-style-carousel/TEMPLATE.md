# Multi-Style Carousel (multi-style-carousel)

A multi-style multi-slide social carousel (5 slides × N aesthetics) where the deliverable is the **baked-text image itself** — every headline and label is rendered INSIDE the image, no HyperFrames compose. One brand mascot + one benefit arc (hook → problem → how → proof → CTA) is reshot across several distinct looks so the same campaign A/B's a dozen visual registers from one copy deck. Derived from `ralphy-carousel-001` (the Ralphy ghost mascot, "your terminal is a video studio", 6 styles × 5 slides).

- **Kind:** vibe-style — the recipe IS the deliverable. No HyperFrames composition; the output is the baked PNG slide set.
- **Category:** entertainment-viral (a swipe-through social post).
- **Format:** carousel. **Aspect:** 4:5, 1080×1350. **Count:** 5 slides × N styles (source: 6 × 5 = 30).

## How to use

```bash
ralphy template use multi-style-carousel --project <new-project-id> --brief "<your mascot + benefit arc + the styles to A/B>"
```

There is no render/compose stage — the slides ARE the deliverable. Run the pipeline in `composition.md`.

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `mascot_desc` | yes | One-sentence physical description of the brand mascot. |
| `mascot_master` | yes | Absolute path to the ONE neutral identity-anchor PNG (passed as `--ref` on every gen). |
| `accent_hex` | yes | The single brand accent hex; lock to ONE hue and ban any second accent. |
| `copy_deck` | yes | The 5-slide benefit arc (eyebrow + 1-2 line headline + optional sub-line per slide). |
| `styles` | yes | The N aesthetics to reshoot the arc across (one STYLE+QUALITY JSON block each). |
| `slide_count` | no | Slides per style (default 5). |
| `gritty_mascot_ref` | no | A pre-distressed mascot variant ref for grunge/xerox/acid styles. |

## Files

| File | What's in it |
|---|---|
| `composition.md` | Cover-first pipeline, benefit-arc structure, dual-ref cohesion, contact-sheet review. Read this first. |
| `prompt-cookbook.md` | The reusable per-style JSON STYLE+QUALITY block, the "redraw the mascot IN the medium" fix, single-accent recolor — all with `{{slots}}`. |
| `model-stack.md` | Model picks per stage, cost ballpark, what to avoid. |

## Cost ballpark

**~$6.8** for a 6-style × 5-slide set (gpt-5.4-image-2 at $0.20/slide; 30 slides + a few cover re-rolls). The source ran $6.80 (~1.13× the $6.00 minimum); the only avoidable spend was a brief abandoned style direction (~$0.20) and a punk/acid cover re-roll for mascot-fit (~$0.40).

## Key rules (each cost money or time in the source project)

1. **Cover-first per style is cheap insurance.** One cover per style → review all together → THEN fill. Caught a mascot-fit miss before the full sets ran (~$1.60 saved).
2. **A clean cute mascot does NOT survive gritty/grunge styles.** Redraw it IN the poster's own medium, or build a pre-distressed variant ref.
3. **Anchor identity with the mascot ref on EVERY gen; add the approved cover as a 2nd ref for per-style cohesion** (`--ref mascot --ref {style}-01`).
4. **Per-style reusable STYLE + QUALITY blocks; vary only scene + ui_elements.**
5. **All-AI baked text works on `gpt-5.4-image-2` for SHORT display copy.** Keep headlines short.
6. **Single-accent lock in every prompt** (`NO other hue` + ban the source hue in AVOID).
7. **"Use our colors" is a one-line instruction** — state the hex AND ban the source hue.
8. **`gpt-5.4-image-2` is capped at 1 concurrent per key — serialize.**
9. **Never edit/delete a prompt-input file while a background gen-loop reads it.**
10. **Transient TLS/socket errors kill a slot mid-batch — re-run the single slot ($0).**

## Do not copy literally

The source mascot and "video studio" copy are one-off. Reuse the METHOD: one arc reshot across N styles, cover-first checkpoint, dual-ref cohesion, reusable per-style JSON STYLE+QUALITY blocks, single-accent lock, mascot-redraw-in-medium for grunge. Supply your own mascot, arc, and style set.
