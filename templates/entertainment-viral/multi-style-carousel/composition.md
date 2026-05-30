# composition — multi-style-carousel

There is no video composition. The deliverable is the **baked-text PNG slide set** itself. This file captures the pipeline, the benefit-arc structure, and the cover-first / dual-ref cohesion discipline — the durable parts of the source project, generalized off the one-off mascot and copy.

## Slots

```
{{mascot_desc}}        — one-sentence physical description of the brand mascot
                         (e.g. "a white sheet-ghost in a brimmed hat with two
                         oval eyes, rendered as a soft 3D matte object")
{{mascot_master}}      — absolute path to the ONE neutral identity-anchor PNG,
                         passed as --ref on EVERY generation
{{accent_hex}}         — the single brand accent hex (e.g. "#FFA630"); ONE hue,
                         ban any second accent in the AVOID list
{{copy_deck}}          — the 5-slide benefit arc, eyebrow + headline + sub-line
                         per slide (hook -> problem -> how -> proof -> CTA)
{{styles}}             — the N aesthetics to reshoot the arc across
                         (zine / club / swiss / riso / punk / acid / clean-dtc)
{{slide_count}}        — slides per style (default 5)
{{gritty_mascot_ref}}  — a pre-distressed mascot variant ref for grunge styles
```

## The benefit-arc (source: 5 slides)

The copy deck is locked ONCE and reused across every style — only the visual register changes per style, never the words.

```
Slide 1 — HOOK      eyebrow + 1-2 line headline. The promise. Negative space for type.
Slide 2 — PROBLEM   the old/painful way. Cold, cluttered, the accent dim.
Slide 3 — HOW       the mechanism. The mascot as the hero doing the work.
Slide 4 — PROOF     the result, anchored on a hard number ("8 minutes. ~$3.").
Slide 5 — CTA       install / sign-up. Full accent field, mascot rising, clean type space.
```

Adapt the arc to the product's story — the 5-beat hook→problem→how→proof→CTA structure is the discipline, not the literal copy.

## Pipeline (from scratch)

```
1. Concept + copy        (10 min)
   - Lock a Visual System + the 5-slide {{copy_deck}}; get user "go".
   - ralphy project create --id <id> --platform instagram --aspect-ratio 4:5

2. Mascot ref            (2-5 min)
   - Stage refs; pick ONE neutral master as {{mascot_master}}.
   - For GRITTY styles (punk/acid/xerox): also make {{gritty_mascot_ref}}
     (a pre-distressed character) — this is the step the source project skipped.

3. Prompts (JSON)        (10 min)
   - One reusable STYLE+QUALITY block per aesthetic in {{styles}}.
   - Per slide, vary ONLY scene.subject + composition.ui_elements (the baked text).
   - Fold in the single-accent lock + anti-AI-slop negatives.

4. Cover-first           (1 gen / style, serialized, ~3 min each)
   - ralphy generate image --slot {style}-01 --model openai/gpt-5.4-image-2 \
        --size 1080x1350 --concurrency 1 --ref {{mascot_master}}
   - SHOW all covers together -> user picks/approves -> only THEN fill.

5. Fill 02-05            (serialized, 1 concurrent)
   - --ref {{mascot_master}} --ref {style}-01   (dual-ref cohesion)
   - Retry any transient-network (TLS/socket) failures in place, $0.
   - Queue the next style's loop only AFTER the current one finishes (1-concurrent cap).

6. Contact sheets        (ffmpeg hstack, local, free)
   - One horizontal row per style -> judge the carousel as a unit, not slide-by-slide.
   - Re-roll only the weak slots.
```

## The cover-first checkpoint (the single biggest money-saver)

Generate exactly ONE cover (slide 01) per style, lay all covers side by side, and get the user's pick **before** filling slides 02-05. In the source project this caught the punk/acid mascot-fit mismatch before the full sets ran — eight bad slides (~$1.60) never got generated. A carousel is judged as a unit; the cover sets the register the other four must inherit.

## The dual-ref cohesion rule

- **Identity ref (always):** `{{mascot_master}}` on every single gen — holds the mascot across all slides and all styles.
- **Cohesion ref (fill slides only):** the approved `{style}-01` cover added as a SECOND `--ref` on slides 02-05 of that style. Each 5-slide set then inherits its cover's exact paper texture, light, and color grade — the difference between "five related slides" and "one coherent design".

## Mascot-fit (the art-direction lesson)

A clean, friendly mascot's geometry fights distressed/halftone registers (xerox, acid-grunge, punk). Two fixes, in order of preference:

1. **Build a dedicated `{{gritty_mascot_ref}}`** — a pre-distressed character variant — for grunge styles, and keep the clean master for clean styles. (The source project's headline takeaway: this is the step that was missing.)
2. **Redraw the mascot IN the medium, verbatim** in the prompt (see `prompt-cookbook.md`): "REDRAWN ENTIRELY IN THE POSTER'S OWN MEDIUM ... NOT a clean smooth 3D object, NOT a glossy sticker". This is the in-prompt rescue when you don't have a distressed ref.

## Contact-sheet review (the review trick)

`ffmpeg hstack` the 5 slides of a style into one horizontal row (e.g. each slide scaled to 420×525). Reviewing the row judges the carousel as a swipe-through unit — the fastest way to catch a slide that breaks cohesion. Build one row per style.
