# prompt-cookbook — vpn-sticker-pack

Per-stage prompts with `{{slots}}`. The base prompt + the no-outline conversion are the load-bearing two; the pose clauses are appended per sticker.

## Base sticker prompt (gemini-3-pro-image, every slot, `--ref {{mascot_master}}`)

```
Cute kawaii die-cut messaging sticker of the mascot: {{mascot_desc}} — the exact
character in the reference image. The mascot fills ~80% of the frame, centered,
full body, do NOT crop limbs. {{look_register}}. Flat uniform {{bg_hex}}
background, no cast shadow. The face has NO nose and NO mouth — emotion ONLY via
minimalist white eye-marks ({{eye_alphabet}}) + body pose.
[+ per-sticker EXPRESSION / POSE / PROP clause from composition.md]
```

Key tokens that must survive every remix: *featureless head*, *minimalist white eye-marks*, *NO mouth NO nose*, *fills ~80% of frame*, flat named bg hex. Drop "die-cut outline" from the prompt when generating the no-outline default — keep the bg flat and the edges clean.

## i2i no-outline conversion (gemini-3-pro-image, `--ref <finished outlined sticker>`)

Only needed if you (against rule #1) rendered an outlined set first and now need the clean one. Prefer to skip this by generating clean on green from the start.

```
Recreate the EXACT same character, identical pose, expression, gesture, props
and colors — but (1) completely REMOVE the white die-cut outline/border, clean
natural edges, NO white stroke anywhere; (2) place everything on a solid uniform
pure chroma-key GREEN ({{bg_hex}}), flat, no shadow.
NEG: white outline, white halo, white glow, sticker border, grey background, mouth
```

Escalation for stubborn slots (gemini ignores the removal ~6% of the time): add *"green must touch the body directly, NO halo/glow"* and re-run. Always spot-check the specific slot.

## Per-meme pose clauses (appended to the base prompt)

```
beg:        kneeling on BOTH knees, hands clasped near face, big shiny pleading puppy eye-marks + tears
busy:       sprouted FOUR arms, hunched over THREE glowing laptops, one sweat bead, tense narrow eyes
popcorn:    oversized muscular bodybuilder arms + ribbed tank top, lounging smug, hand in popcorn bucket
tableflip:  mid-flip of a small wooden table, cup + papers flying, '> <' rage eyes, two steam puffs
sigma:      arms crossed, tiny dark sunglasses, cold aloof stance
this-is-fine: seated calm holding a mug, small flames around, flat —— eyes
```

Build one clause per sticker in STORYBOARD.md before batching. Read the mascot's reference set for its own emotion alphabet and reuse it verbatim.

## Text-bearing sticker (gpt-5.4-image-2, the one exception)

For the single sticker that needs a crisp rendered letter or short word ({{text_slot}}), route to gpt-5.4-image-2 — gemini smudges letterforms. Keep the same mascot description and bg; add the exact glyph to render.

## Negative base (carry on every gen)

```
NEG: photorealistic human, mouth, nose, teeth, text watermark, busy background,
cast shadow on background, gradient background, JPEG artifacts, extra limbs
(unless the pose calls for them), cropped limbs
```
