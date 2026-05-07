# 3D / CGI — vibe style

**Genre:** rendered / CGI video — Pixar-stylized through to photorealistic, plus low-poly, isometric, cel-shaded, and hyperreal-with-impossible-physics.
**Length:** 4-10s. Sweet spot 5-7s. Single continuous shot, no cuts.
**Format:** 9:16, 24fps cinematic (default) or 30fps smooth, 1080×1920.

> **Reference-required gate still applies for branded subjects.** If the brief names a real product or brand, a reference (photo / logo / packaging) MUST exist at `workspace/projects/<id>/assets/uploaded/`. For pure-CGI subjects (creatures, abstract sequences, original characters), no reference is needed — this template is reference-optional by default.

## Why this works

The gap between a generic "make it look 3D" output and a production-grade CGI clip is **render vocabulary**. i2v models latch onto:

1. **Render-engine terminology** — Octane / Cycles / Unreal Engine 5 / V-Ray vibes, even when the model itself isn't running them. The words steer the latent space.
2. **Material science** — PBR, SSS, Fresnel, caustics, anisotropic, fresnel reflections. Each term unlocks a specific look.
3. **Lighting in Kelvin** — "warm key (3200K) with cool fill (7500K)" beats "nice lighting" by an order of magnitude.
4. **Camera in CG grammar** — "slow orbit at 45°/sec with easing" beats "dynamic camera."
5. **A hook in the first 2 seconds** — CGI without a hook is a screensaver.

This template is a vocabulary pack and a master template. Use it as scaffolding, not a script.

## Vibe anchors

- **Technical director, not film critic.** Quantify everything: degrees per second, color temperature in Kelvin, duration in seconds, distance, density, opacity curves. "Slowly" is ambiguous; "45°/sec for 3 seconds completing 135°" is not.
- **Easing always.** Never linear motion unless explicitly stylized. Ease-in / ease-out is the default for camera and object motion both.
- **Hook lives in sentence one.** The first sentence of the prompt sets the first frame. If sentence one is bland, the clip is bland.
- **Specify what's sharp and what's soft.** Depth of field is a deliberate choice. Spell it out: "sharp focus on product, creamy bokeh on background."
- **Materials must be physically consistent.** "Mirror-polished velvet" contradicts itself. Velvet is diffuse by definition. Don't fight physics — i2v models bias toward the realistic interpretation and produce mush.
- **One render style per shot.** Mixing photoreal subject + stylized environment is fine, but call it out explicitly: "photorealistic product, stylized environment."

## Variation axes

| Axis | Options |
|---|---|
| Render style | Pixar-stylized / painterly / cel-shaded / low-poly / isometric / hyperreal / hyperreal-with-impossible-physics |
| Subject | product / character / creature / environment / abstract |
| Camera arc | orbital / push-in / crane / dolly-zoom / spiral ascent / glide-through / free-floating / static-with-internal-motion |
| Lighting key | golden-hour HDRI / studio 3-point / single dramatic side / rim-dominant / neon practical / cool moonlight / volumetric god rays / caustics |
| Material hero | chrome / gold / glass / crystal / skin (SSS) / fur / water / marble / bioluminescent |
| Particle effect | dust motes / swirling smoke / coalescing swarm / sparks / splash / fire / data particles / fog |
| Duration | 2-4s viral hit / 5-7s narrative beat / 8-10s cinematic flythrough |

Pick **one option per axis** and build the prompt around them. Mix is fine, but more than 3 axes shouting in one shot reads as confused.

## Narrative arc (single-shot CGI)

```
0.0-2.0s   → Hook frame. Visually arresting first impression. The "stop scrolling" beat.
2.0-4.0s   → Development. Camera moves, materials reveal, particles bloom.
4.0-7.0s   → Payoff. The clearest, sharpest framing of the subject. Music swells.
7.0-10.0s  → Hold or pull-back. Optional. Used for cinematic / architectural pieces.
```

For 4-second shots collapse this to: hook (1s) → motion (2s) → payoff (1s).

## Required user inputs

1. **Subject** — what's in the frame (product, character, environment, abstract concept).
2. **Render style** — pick one from the variation axis. If unsure, "photorealistic with cinematic lighting" is the safe default.
3. **Hook technique** — one of the 12 in `hooks.md`. The router into the prompt.
4. **Duration** — 4-10s. Default 6s.
5. **(Optional) Reference** — required if the subject is a named brand / product. Otherwise skip.
6. **(Optional) Mood / palette** — warm / cool / cyberpunk / pastel / monochrome.

## When NOT to use

- **Talking-head UGC.** This template is for rendered visual storytelling, not face-to-camera scripts. Use a UGC template instead.
- **Live-action mimicry.** If the goal is "looks like real footage of real people," go i2v on photographs, not CGI vocabulary.
- **Anything > 12s in a single shot.** Tension dies. If you need more, cut into multiple shots and use a sequence template.
- **When the subject is a real person.** Photoreal CGI of real humans is uncanny-valley territory and almost always reads as fake. Stick to product / creature / environment / stylized character.
- **Brand-awareness ads with product as hero.** The reference-required gate applies: AI-improvised packaging on a branded product is unshippable.

## Cost ballpark (single 6s clip)

| Stage | Detail | Cost |
|---|---|---|
| Keyframe | 1 × `gemini-3-pro-image-preview` @ $0.15 | ~$0.15 |
| Video clip | 1 × `kling-v3.0-pro` × 6s @ $0.14/s | ~$0.84 |
| Music | 1 ElevenLabs Music call (subscription) | $0 |
| VO (optional) | 1 ElevenLabs call (subscription) | $0 |
| Render | local | $0 |
| **Total** | | **~$1.00 per shot** |

For premium camera-fidelity shots (dolly-zoom, spiral ascent, complex orbit), swap kling for veo-3.1 and expect ~3× cost.

## Read also

- `hooks.md` — 12 hook techniques with one-line examples. Pick the hook before writing the prompt.
- `prompt-cookbook.md` — master template, camera grammar, lighting setups, sound design, common mistakes, ready-to-paste examples.
- `examples.md` — placeholder; fills in after the first real run.
