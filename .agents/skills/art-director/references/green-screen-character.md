# Green-screen character recipe (#560)

Generate a character (or prop) on flat chroma green when it must move over backgrounds you do not have yet, sit in front of text, or be reused across scenes. Keying is local and free: `ralphy matte key` (pure ffmpeg). This file covers the prompt side; the compositing side is in the editor's [`keying-and-matting.md`](../../editor/references/keying-and-matting.md).

## Prompt rules

Fold these into the prompt's background and lighting blocks (they are background constraints, not the subject):

1. **Flat, uniform chroma green, edge to edge**: "solid flat chroma-key green background (#00B140), uniform, no gradient, no vignette, no floor, no shadow on the background, no horizon line". A gradient or vignette gives the keyer a weak, uneven screen.
2. **Even, neutral key light on the subject**: "soft even studio lighting, neutral white light on the subject". Coloured rim light reads as spill.
3. **No green on the subject**: "no green tint on skin or hair, no green reflections, no green clothing, no green props". Anything green keys out with the screen.
4. **Clean silhouette**: "full figure fully inside the frame with a margin on every side, crisp separation between hair and background". Feet or shoulders cut by the frame edge are fine, but keep most of the border as screen; the keyer measures the screen from the frame border and refuses when less than about a third of it is screen.
5. **No baked text, frames, borders or drop shadows** around the subject.
6. For image-to-video, repeat rules 1 and 3 in the motion prompt ("background stays flat chroma green, camera locked off") so the video model does not drift the screen or add a set.

A working example from this machine: `.ralphy/workspaces/ai-native-offer/projects/astons-sofia-slideshow-20260908/artifacts/images/sofia-master-green.png` (screen about #02AF3A, strength 116; keys cleanly with the defaults).

## Key and check

```bash
ralphy matte key character-green.png            # -> character-green.matte-key.png
ralphy matte key character-green.mp4 --quality best
```

Check the printed `screenStrength` (above 80 is a strong screen) and look at the cutout over a dark and a light background, at the hair. If the edge carries a green fringe, rerun with `--despill avg`; if dim screen survives, lower `--high`. Both reruns write a new `.v2` file.

## When not to use it

- The subject must stay green, or holds glass, smoke or thin wire: generate it in its scene instead.
- Named real people or products still need references (reference gate, AGENTS invariant 3); green does not change that.
- Real footage without a screen: `ralphy matte subject`, not a regeneration.
