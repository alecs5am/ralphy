# composition — vpn-sticker-pack

There is no video composition. The deliverable is the **transparent PNG set** itself. This file captures the pipeline, the meme-pose vocabulary, and the cutout/sizing recipe — the durable parts of the source project, generalized off the one-off mascot.

## Slots

```
{{mascot_desc}}      — one-sentence physical description of the mascot
                       (e.g. "a small chubby character whose entire body is
                       smooth glossy semi-translucent pale sky-blue jelly with
                       soft inner subsurface-scattering glow, rounded
                       featureless egg-head and smooth simple limbs")
{{mascot_master}}    — absolute path to the ONE neutral identity-anchor PNG,
                       passed as --ref on every generation
{{look_register}}    — render look (e.g. "soft 3D clay Blender figurine, glossy
                       softbox light, gentle AO")
{{bg_hex}}           — flat keying background ("#00b140" chroma green by default;
                       "#dcd7cf" warm grey only for an outlined set)
{{eye_alphabet}}     — the mascot's expression vocabulary, expressed as eye-marks
                       (e.g. "^^ happy / ·· neutral / —— flat / ×× dead /
                       @@ dizzy / heart / wink / closed")
{{sticker_count}}    — how many stickers (default 32)
{{text_slot}}        — the ONE sticker (if any) that needs a crisp rendered
                       letter/word → route to gpt-5.4-image-2, not gemini
```

## Pipeline (from scratch)

```
1. Intake (5 min)
   - Confirm: look register, OUTLINE yes/no, keying background, count, pack vibe.
   - Default: flat chroma-green, NO baked outline (see Key rules #1).
   - ralphy project create --id <id> --platform telegram --aspect-ratio 1:1

2. Lock the mascot (5 min)
   - Stage refs; pick ONE neutral master as {{mascot_master}}.
   - Read the ref set's expression vocabulary → {{eye_alphabet}}.

3. Storyboard (10 min)
   - STORYBOARD.md: one row per sticker = meme reference + pose + eye-mark + chat-use.
   - Get explicit "go". Flag filter-risky + text-bearing slots.

4. Generate (gemini, ~$0.15 each, ~6 concurrent OK)
   - Render on FLAT {{bg_hex}}, NO outline.
   - Pass {{mascot_master}} as --ref on every call. Use absolute paths.
   - Route {{text_slot}} to gpt-5.4-image-2 only.
   - Retry transients in place; spot-check each requested edit.

5. Cut + size (local, free)
   - Flood-fill-connectivity key + GaussianBlur(0.8) feather + despill.
   - Crop solid bbox + scale long-side = 512 → stickers/<NN-slug>.png.

6. Review contact sheet → re-roll only the weak slots.
```

## The cutout / sizing recipe (the single biggest time-saver)

All local, free. (These steps are not yet ralphy verbs — they run on PIL/numpy/ffmpeg in the source project; the gap is logged in that project's `postmortem/03-cli-issues.md`.)

- **Key:** flood-fill from the image-border seeds on the {{bg_hex}} render (`thresh≈95`) → background mask by **connectivity** (removes haze a per-pixel ramp cannot).
- **Smooth:** `GaussianBlur(0.8)` on the alpha → anti-aliased edge, no staircase.
- **Despill:** `G = min(G, max(R, B))` → kills the green fringe.
- **Tight size:** crop to the solid bbox (`alpha > 110`, drop dust via neighbour-count ≥ 2), scale `max(w, h) = 512`. One side exactly 512, the other ≤ 512 (messenger spec).
- For an **outlined** set on a grey bg: same flood-fill, but the outline survives (it is not bg-colored); keep the Gaussian feather.

## Meme-as-pose vocabulary (the differentiators)

A featureless mascot is recognizable through silhouette, not face. Reproduce known chat memes:

```
beg:        kneeling on BOTH knees, hands clasped near face, pleading puppy eye-marks + tears
busy:       sprouted FOUR arms, hunched over THREE glowing laptops, one sweat bead, tense narrow eyes
popcorn:    oversized muscular arms + ribbed tank top, lounging smug, hand in popcorn bucket
tableflip:  mid-flip of a small table, cup + papers flying, '> <' rage eyes, two steam puffs
sigma:      arms crossed, tiny dark sunglasses, cold aloof stance
this-is-fine: seated calm with a mug, small flames around, flat —— eyes
```

Generic "happy/sad" emotions are forgettable — the source user explicitly rejected generic. Every sticker must carry a recognizable meme through POSE + PROP.

## Two-set strategy

One green-no-outline render pass serves both deliverables:
- **Set A — clean silhouette:** the keyed/cropped PNG directly.
- **Set B — white die-cut outline:** add a uniform white stroke (dilate the alpha, fill white, composite under the subject) at the sizing step — no re-gen needed.

Generating outlined first (the source's mistake) forces a full re-gen for the clean set, because a baked outline cannot be stripped from pixels.
