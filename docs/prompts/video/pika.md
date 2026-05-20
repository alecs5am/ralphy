# Pika video prompts

Pika 2.x takes a flat comma-delimited list in **fixed order**:

```
<subject>, <action>, <setting>, <style>, <camera>, <lighting>, [<motion>], [<gesture prose>], [<dialogue>]
```

### Hard rules

- **Order matters.** Pika weights early tokens heavier.
- **No "shot:" or "scene:" tags.** Flat prose only.
- **Dialogue is treated as ambient text.** Don't expect strict lip-sync.

---

## Mode 1 — `tiktok-meme-cut`

**Sample prompt:**
> a confused teenager in a hoodie, shrugs and looks off-camera, suburban bedroom, TikTok native flat register, handheld 28mm front-cam, overhead LED ceiling light, snap cut from neutral to confused, palm-open gesture, spoken neutral: "wait what"

## Mode 2 — `product-lifestyle`

**Sample prompt:**
> a ceramic coffee mug with a pastel logo, sits on a sunlit windowsill beside an open book, cozy home kitchen, lifestyle warm naturalistic register, locked 50mm, soft morning sun from screen-right, steam curls upward in slow loops

## Mode 3 — `cinematic-establishing`

**Sample prompt:**
> a lone lighthouse silhouette, stands against a stormy sea, rocky coastline at dusk, cinematic anamorphic register, wide 24mm slow dolly-in, dramatic side-light through breaking clouds, waves crash in rhythmic foreground motion

## Mode 4 — `animated-character-action`

**Sample prompt:**
> a stylized 3D fox with oversized eyes, leaps over a fallen log, mossy forest clearing, Pixar-adjacent 3D animation register, locked 35mm tracking shot, dappled afternoon light, tail trails behind in arc

## Mode 5 — `abstract-motion-graphic`

**Sample prompt:**
> a glowing geometric pattern of interlocking triangles, slowly rotates and pulses, deep blue void, motion-graphic flat register, locked centered camera, neon backlight glow, particles dissipate outward at each pulse
