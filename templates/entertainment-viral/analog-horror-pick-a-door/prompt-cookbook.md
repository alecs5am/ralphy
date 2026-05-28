# Prompt cookbook

Slots in `{{double_braces}}`. Model: `google/gemini-3-pro-image-preview` (nano-banana) unless noted, multi-ref. Pass cropped source frames + character master as `--ref` to lock identity + register.

## Rule #0 — Aesthetic lock (READ BEFORE ANY OTHER PROMPT)
The whole video lives inside **ONE aesthetic** end-to-end. Default: **liminal-spaces / found-footage internet-horror**. Both branches inherit it; the safe side is the **warm-liminal** variant, not pinterest-cozy.

Three lighting/mood variants of the same register:
- **Warm-liminal** (SAFE side, montage): lone empty rooms, fluorescent + warm lamp, plain faded walls, low-pile carpet, oversized empty space, plush alone, nostalgic uncanny-calm. NOT decorated, NOT cluttered, NOT hygge.
- **Neutral-liminal** (HUB, two doors): symmetric eye-level wide of an empty low-ceiling party/hub room, brown carpet, flat ceiling light, two flush doors centered. Tall silhouette lurks in the far corner.
- **Cold-liminal** (BAD descent): claustrophobic teal-grey corridors / wall of CRTs / small concrete cell, mold stains, peeling walls, crushed shadows, security-cam unease.

Workflow: generate the hub plate first → approve → write the one-line aesthetic to `STORYBOARD.md` → **prepend that line to every subsequent image prompt** (both branches). If any render looks cozier or more decorated than the hub, regenerate.

## Monster (REUSE FIRST — only regenerate if a different creature is required)
Locked eyes ref = `assets/monster/monster-emote-flat-open.png`. Greenscreen, frontal, chest-up, identical framing across emotions so they swap cleanly. Master prompt:
> Full-frame pure chroma-key GREEN screen (#00b140, even). Centered, dead frontal, chest-up: a tall matte pitch-black featureless humanoid with a dark faceted obsidian-crystal angular shard head. The face is genuinely unsettling: TWO SMALL uncanny photographic human eyes (bright white sclera ring, small dark pupil) that look cut from a magazine and glued on, slightly asymmetric, blank creepy stare. Mouth = a thin geometric white {{single line | "=" two lines | open "O" ring}}. Crisp hard edges for chroma-key, faint VHS grain. NOT cute. 9:16.
- Negative: `large glowing almond eyes, cute, cartoonish, thick blocky mouth, realistic human skin face, text`
- Emotions to keep on hand: flat-open (rest), flat-closed (blink), talk-mid ("="), talk-open (open "O"), stern, shock. Closeup = same face, extreme close-up, dark cell behind, NOT greenscreen.

## Two-door hub (shared plate)
> PHOTOREALISTIC amateur home-camcorder still: symmetric eye-level wide shot of a low-ceiling suburban party room, brown carpet, folding tables + balloons, flat ceiling light. Dead center, two plain flush doors side by side — LEFT matte {{safe_color}}, RIGHT matte {{bad_color}}, white frames, blank (no text). A tall featureless pitch-black humanoid silhouette lurks in the far corner. Liminal-space unease, flat flash lighting, early-2000s camcorder look, faint VHS grain. 9:16. NO subtitle text.
- Pass the monster master as a 2nd ref so the corner silhouette matches the character.
- Door labels are VT323 overlays in the composition, NOT baked in (gemini smudges text). Reference project removed them entirely — optional.

## SAFE world (WARM-LIMINAL — same aesthetic as the door room, not pinterest-cozy)
> PHOTOREALISTIC found-footage camcorder still in the LIMINAL SPACES aesthetic (empty-eerie internet-culture look, **same register as the two-door hub plate**), WARM and SAFE variant (not dread): {{safe_world_prompt}} — e.g. an empty long carpeted corridor with a soft warm glow at the far end; an empty warm rec-room with a drop ceiling and a single armchair; a lone office with one CRT on an empty desk under fluorescent + warm lamp; an empty room with one large window onto soft night. **The {{mascot}} alone in frame.** Patterned low-pile carpet, flat even fluorescent light + warm lamp, plain faded walls, oversized empty space, nostalgic uncanny-calm. Faint VHS grain, early-2000s camcorder. 9:16. No text.
- Refs: pass the mascot master + the two-door hub plate (so the carpet/light/wall register matches the hub).
- Generate 5-6 distinct empty rooms/halls for the montage.
- **Negative (mandatory):** `cozy pinterest clutter, decorated, fairy lights, exposed brick, busy, warm hygge, plants, vinyl, advertisement, illustration, 3D render, cgi, stylized, horror, dread, dark, threatening, monster, text, watermark`. The "cozy hangout" pattern (fairy lights / exposed brick / busy clutter / hygge) is BANNED — it broke the aesthetic on v1.
- **Aesthetic-lock check:** if a render looks cozier than the door-room hub plate, regenerate. Both branches must read as the same world.

## BAD descent (claustrophobic liminal)
> Recreate this exact claustrophobic location + camera: {{grimy dark corridor | wall of CRT monitors showing render bars | small concrete cell, flickering fluorescent}}, mold-stained peeling walls, wet floor, oppressive dread. Cold desaturated teal-grey, crushed shadows, faint VHS grain, security-camera unease. Empty, no figure, no text. 9:16.
- Use cropped source frames as refs for fidelity.

## VO lines (the pattern that works)
- intro: `{{vo_intro}}` — "Pick a door. The one you open decides your next 48 hours."
- safe: `{{vo_safe}}` — **"If you chose {{safe_color_word}} — you're safe. This is {{brand_safe}}..."** (cozy, lively, ~20s).
- bad: `{{vo_bad}}` — **"If you chose {{bad_color_word}} — you're not. The door locks. A meter burns into your arm... and it always runs out."** (the last clause triggers the screamer).
- monster textboxes (lowercase, menacing + thin satirical edge): `{{monster_lines}}`.

> Pattern lock: every "choose your fate" video lives on **"If you chose X — you are safe / you are not"**. Keep it.
