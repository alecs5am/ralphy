# Photoreal humans — register checklist

When the brief calls for photoreal human characters (UGC selfies, lifestyle, news-style, broadcast-realism), the default agent instinct is **TV-commercial register** — Tom-Ford chiaroscuro, marble + tuxedo, ARRI Alexa + Cooke S4. This reads as AI-slop, not authentic.

The correct register is **still-photo / candid documentary** — Sony A7 IV + 50mm/85mm prime + Kodak Portra 400 + ambient single-source light. Venom-bodywash-001 burned ~$3 on the TV-commercial default before the user manually pointed at noski-people-001 (the photoreal sibling project) as the correct register.

## The 5-cue checklist (all 5 required, not 3, not 4)

Every photoreal-human image prompt MUST carry:

1. **Specific real camera body + prime lens.** Examples: "Sony A7 IV + Sigma 35mm f/2.8 ART", "Leica M11 + Summicron 50mm", "Canon R5 + RF 85mm f/1.2". Generic "DSLR" / "photo" is too weak — model drifts to glossy.
2. **Specific real film stock OR sensor profile.** "Kodak Portra 400", "Fuji 400H", "Cinestill 800T", "natural digital sensor profile no grading". This is the highest-impact single token — it shifts the model away from beauty-filter / cinema-LUT territory.
3. **Ambient single-source light, not studio.** "soft window light from the left", "open shade midday", "kitchen overhead with bounce", "evening interior with lamp". The "single source" wording is load-bearing — beauty-filter outputs come from multi-source "studio" defaults.
4. **"Hyperreal NOT glossy"** + **"naturalistic candid not staged"** phrases verbatim. These are the strongest anti-AI-slop tokens in the gemini-3-pro vocabulary (validated across noski + venom-bodywash + glitter-cream).
5. **Identity-restating inline.** Even with `--ref`, restate "Black man, late 20s, soft warm features, shoulder-length thin natural locs, thin gold wire-rim eyeglasses" in the prompt body. Don't rely on the ref alone — gemini's i2v sometimes ignores the ref's identity if the prompt drifts.

## Anti-AI-slop block (default-on for every gen)

Append this verbatim to the negatives / "avoid" section:

```
NO glossy beauty-filter skin, NO enlarged anime-eyes, NO smoothed jawline-reshape,
NO airbrush, NO uniform porelessness, NO oversharpened eyelashes, NO catchlight-bomb,
NO Tom-Ford chiaroscuro, NO TV-commercial register, NO Apple-keynote rim-light.
```

User feedback "слишком иишно идеально" (too AI-perfectly-perfect) on noski + glitter-cream traces to skipping this block.

## Anatomy checklist (before accepting any character anchor)

Self-critique gate. For every generated character anchor, the agent verifies:

- **Hips on seat?** No "torso provalivshiysya into back-cushion" — body geometry physically possible.
- **Back against cushion-back?** Or explicitly leaning forward — no clipping through furniture.
- **Knees forward?** No "knees through coffee table" / "knees through floor".
- **Body-head connect at a real neck angle?** No floating heads, no impossible head-tilt geometry.
- **Limb count = 2 arms, 2 legs, 1 head?** Diffusion models occasionally add a third arm or merge two characters; quick visual check.
- **Eyes match prompt?** "Eyes wide open looking up" → not closed / sleeping. Negative prompts ("no eyes closed") are non-deterministic in gemini — use positive cues ("eyes wide open, pupils centered looking up") instead. For head-back poses where eyes need to read as open, **top-down camera angle is more reliable** than three-quarter-front (front-quarter + head-back is a contradiction the model resolves by giving up on one).
- **No body parts sticking out of furniture?** Common diffusion artifact.

If ANY check fails, regenerate with the failure mode explicitly negated. Don't ship a broken anchor downstream — Kling i2v will interpolate from the broken first-frame and the artifact compounds.

## Locked-ref discipline

For UGC selfie / product review / multi-scene projects with one persona:

- **Generate the persona master FIRST** (anchor #1, even before location plate if no shared setting).
- **Pass the persona master via `--ref` on EVERY downstream gen.** Don't trust the model's "memory" — gemini's identity drift after 3+ unrefed gens is ~30%.
- For product reviews, **the product master is anchor #2** — passed as `--ref` alongside persona on every scene gen. Glitter-cream-001's $13.79 budget held because both refs went into every gen; remove either and identity collapses across scenes.
- The CLI auto-versions on regen (commit 753d2f7), so iterating the persona master doesn't lose the v1 — pass `<slot>` repeatedly without fear.

## Strongest poses (when the brief asks for unusual angles)

- **Head fully tipped back on cushion** → strict side-profile OR strict top-down (face-up to camera). Three-quarter-front + head-back is physically conflicting; the model drops one of them. Noski rule #5 ($0.45 + 30 min relearning).
- **Eyes wide open looking up** → top-down is strongest (both eyes plainly visible, gaze direction unambiguous). Negative prompts to suppress closed eyes are unreliable; positive "irises blue-grey, pupils centered" works better.
- **Mid-blink / half-closed eyes** → don't. Gemini reads "blink" as "closed". Use "soft natural expression, eyes open" instead.

## Model picks for photoreal humans

| Stage | Winner | Why |
|---|---|---|
| Persona master portrait (1 character, single scene) | `openai/gpt-5.4-image-2` | Best photoreal skin + natural features at single-portrait scale |
| Scene anchors (multi-ref, identity continuity) | `google/gemini-3-pro-image-preview` | Multi-ref consistency is the killer feature; locks character + location + lighting across 30+ gens |
| Product label fidelity inside a photoreal scene | `openai/gpt-5.4-image-2` | Holds small typography + brand glyphs through 3 redos |
| Reference video analysis for register matching | `google/gemini-3.1-pro-preview` via `ralphy ref analyze-video` | Natively reads mp4; pulls "still-photo register" cues from a sibling project's final cut |
| Human i2v with lip-sync (EN dialog) | `kwaivgi/kling-v3.0-pro --audio` | Only viable choice for photoreal-human i2v with natural lip-sync. **EN only** — non-English produces accent slip + voice-age drift. |
| Human i2v non-English | `kwaivgi/kling-v3.0-pro` motion-only + ElevenLabs VO post-mix | The `--audio` route is unsafe outside English (noski + venom). |

## What to avoid

- **`bytedance/seedance-2.0`** rejects photoreal-human anchors via the privacy filter (`InputImageSensitiveContentDetected.PrivacyInformation`), even when the human was itself AI-generated. Reserve seedance for cartoons / non-human anchors / landscapes / hands. Tokyo / noski / venom postmortems all hit this.
- **TV-commercial vocabulary** — "ARRI Alexa", "Cooke S4 lens", "broadcast LUT", "key + fill + rim" — defaults the output to AI-slop register.
- **Negative prompts as the only suppressor.** "NO closed eyes" doesn't reliably suppress closed eyes in gemini. Use positive direction ("eyes wide open") + the 5-cue checklist together.
