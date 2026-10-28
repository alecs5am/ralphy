# Editor: pixels vs code, the motion-graphics decision tree (04.0A.02)

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Pixels vs code — the motion-graphics decision tree (04.0A.02)

Before routing a scene to `ralphy generate video`, classify the output:

| Pattern | Route | Why |
|---|---|---|
| Live-action scene (person, room, action, weather, gameplay capture) | `ralphy generate video` (i2v / t2v) | Model produces pixels the code can't fake |
| Photoreal still + parallax | `ralphy generate image` + HyperFrames GSAP tween | Image is the asset; motion is the composition |
| Animated text / kinetic typography / "WORDS SLAM IN" | HyperFrames component + GSAP timeline | Code controls timing and exact spelling; video model will smear letters and drift fonts |
| Lower-third / name card / chyron | HyperFrames HTML + GSAP | Trivially parameterized; pixel-route would re-render fonts every gen |
| Animated chart / data viz | HyperFrames HTML + GSAP / Three.js | Code is the source of truth for the data; pixel-route would hallucinate values |
| Animated UI mockup / app screen | HyperFrames HTML + GSAP | Pixel-route invents UI affordances; the result reads as AI slop |
| Transition between two clips | HyperFrames shader/crossfade registry block | The two clips are the assets; the transition is a code recipe |
| Particle / FX overlay | HyperFrames CSS/SVG/Canvas/WebGPU | Repeatable; pixel-route is non-deterministic |
| Lottie animation drop-in | HyperFrames `lottie` adapter | Lottie file is the asset; runtime plays it deterministically |

**Tell-tale signs** (the lint at `bun run lint:templates` flags known offenders in `prompts.json`): "animated text", "kinetic typography", "lower third animates in", "chart animates in", "logo slides in", "transition wipe" → these go to the HTML+GSAP side, not the video model. If you find yourself writing one of those phrases as a `--prompt` to `ralphy generate video`, stop and compose the component instead.

Cross-link: read [`hyperframes`](../../hyperframes/references/playbook.md) for the API specifics.

> **Historical aside (Remotion).** If you're spelunking a pre-`92ef823` branch or a postmortem that mentions `STATIC_ROOT` / `composition-props.json`, the legacy Remotion convention is documented at [editor/render-pipeline.md → Legacy: Remotion `STATIC_ROOT` recipe](./render-pipeline.md#legacy-remotion-static_root-recipe-archived-for-postmortem-cross-reference). Not relevant to current HyperFrames work.
