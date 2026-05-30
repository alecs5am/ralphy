# prompt-cookbook — brand-motion-ad

Generalized prompt recipes for the two paid assets in this template: the ONE mascot still, and the OPTIONAL `seedance-2.0` fully-animated alt-cut. Lifted + generalized from `odindoma-motion-001`.

## Mascot still (`gpt-5.4-image-2`, required)

Flat picture-book line; emotion via pose + eye-marks, never mouth/nose.

```
hand-drawn cute {{creature}} mascot, {{pose}} (e.g. one stick arm raised in a
friendly wave), simple silhouette body — one rounded blob, no neck, no detailed
texture; two big round WHITE dot eyes (no pupils, just plain white circles), a
tiny single-curve black smile, thin black STICK ARMS + STICK LEGS, no claws.
NO fur texture, NO shading, NO highlights, NO 3D — pure flat solid {{fill}}
outlined by a thin wobbly hand-drawn black ink stroke. Children's-picture-book
line aesthetic. Transparent background. ~800x800.
```

Fire via `ralphy generate image --project <id> --slot mascot --model openai/gpt-5.4-image-2`.

## Seedance alt-cut (`bytedance/seedance-2.0`, optional)

A fully-animated 6s cut as an alternate to the HyperFrames render. The prompt mirrors the SUBJECTS / ENVIRONMENT / AUDIO POLICY / STYLE / SHOT-LIST skeleton and over-specifies negatives because hand-drawn cartoon is off seedance's sweet spot.

```
SUBJECTS:
{{mascot}} — flat solid {{fill}} silhouette, two big round white dot eyes (no
pupils), thin black stick arms/legs, hand-drawn naive picture-book style.
Holding one front paw/hand raised in a friendly wave. NO fur, NO shading, NO 3D.

ENVIRONMENT:
Flat {{bg}} stage, edge-to-edge, NO floor line, NO horizon, NO depth. Centred:
a {{product_window}} shape drawn in {{accent}} (thin stroke + solid inner fill).
The mascot sits inside the window, body bigger than the window so its waving
hand and one leg poke past the edges. Below, a TWO-LINE slogan; ONE keyword is
the highlight in chunky hand-drawn bubble lettering, every other word in {{accent}}.

AUDIO POLICY — CRITICAL:
NO MUSIC. NO SOUNDTRACK. NO SCORE. Only diegetic SFX: a soft marker squeak as
the wordmark is drawn, a short "boing" on the pop-in, a tiny chirp on the wave,
light paper rustle as the slogan lands. Music is added in post via ElevenLabs.

STYLE:
Hand-drawn 2D children's-picture-book cartoon. Frame-by-frame cel feel — every
stroke wobbles 1-2px per frame (boil/shimmer), every outline a thin wobbly black
ink line, every fill a single flat solid colour. NO Pixar/Disney polish, NO anime
cel-shade gloss, NO realistic 3D, NO film grain, NO depth-of-field, NO motion blur.
Palette strictly: {{bg}}, {{accent}}, ink black.

SHOT-LIST (single continuous 6.0s loop, locked frame, no camera move):
SHOT 1 0.0-1.0s  mascot waving inside the window, slogan already visible
SHOT 2 1.0-1.8s  mascot tips, spins out + up off frame; slogan lifts + fades
SHOT 3 1.8-2.6s  wordmark draws itself letter-by-letter (felt-tip swipe, clean, no bounce)
SHOT 4 2.85-4.2s ONE big diagonal marker stroke floods the canvas with {{accent}}
SHOT 5 4.2-4.9s  the flood SHRINKS via inset() morph back into the window shape (NOT a circle iris)
SHOT 6 4.9-6.0s  mascot pops back in (elastic), slogan staggers in, footer URL fades, loop closes

LOOP CONTINUITY: frame 0 and the last frame must be visually identical.
ASPECT: 16:9 1080p (closest native to 4:3), locked frame, dead-still camera, 24 fps.

NEGATIVE: NO photorealism. NO 3D render. NO Pixar/Disney polish. NO anime gloss.
NO live-action. NO film grain. NO motion blur. NO chromatic aberration. NO
ambient occlusion. NO realistic fur. NO whiskers/pupils/nose/claws. {{palette ban}}.
NO horizontal zigzag scribble (the wipe is DIAGONAL, 3 long sweeps). NO circle
iris reveal (it is a rounded-rect inset morph). NO bouncing on the wordmark
letters (they arrive clean). NO music, NO instrumental soundtrack.
```

Fire via `ralphy generate video --model bytedance/seedance-2.0 --duration 6 --aspect-ratio 16:9 --resolution 1080p --prompt-file <path> --no-ref-consent "original brand mascot, no real entity"`. Use `--prompt-file` so the multi-line block isn't shell-escaped.

## Why these prompts are shaped this way

- **Named visual reference** (a picture-book bumper you can point to) gives the model a concrete style anchor — the same trick used across the seedance prompt library.
- **Strict palette ban** at the bottom prevents seedance drifting to its photoreal default — the negative cluster's job.
- **Explicit "no music"** follows the `feedback_kling_no_music_eleven_music_postmix` rule: music is a separate ElevenLabs pass in post, never baked into the video gen.
- **If seedance drifts** (it will, first roll): strengthen the negative cluster ("NO Blender, NO Unreal, NO After Effects polish"), add a pixel style-ref (`--ref`), or accept it as a "seedance interpretation" alt-cut. The deterministic HyperFrames cut is the safe default.
