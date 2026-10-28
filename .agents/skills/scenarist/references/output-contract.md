# Scenarist output contract (02.04, typed Scene[])

> Moved out of `SKILL.md` to keep the skill body small (#574). Read it before emitting or editing `scenario.json`.

The scenario the scenarist emits MUST conform to `cli/lib/schemas/scene.ts` (`ScenarioSchema`). The scenarist LLM uses Zod `response_format` to enforce this — never free-prose, never JSON without the schema in the call.

**Scene shape:**

```ts
{
  id: "scene-NN",           // two-digit zero-padded
  role: "hook" | "body" | "cta",
  vo_text: string,          // empty string is legal for B-roll
  target_duration_s: number,
  camera: string,           // one-line, required
  lighting?: string,
  gesture?: Gesture,        // finite enum from cli/lib/schemas/gestures.ts
  broll?: string,
  refs: string[],           // flat list for v1.0
  notes?: string            // free-text escape hatch — see below
}
```

**`notes` is reserved for what the schema can't express.** Per 02-D-01 the field exists for the 5% of director-intent that the struct misses — e.g. "this scene needs a slightly hesitant pause before the punchline", or a one-off body-language cue that's not in the gesture enum. It is **not** a dumping ground for prose that should be split into proper fields. Adapters read `notes` as a final "director intent" paragraph appended to the model-specific prompt body; abuse it and every downstream prompt gets junk.

**Gesture vocabulary** — per 02-D-06, `gesture` is a finite enum (12 named gestures: `point-camera`, `nod`, `head-shake`, `laugh`, `shrug`, `lean-in`, `hand-product-reveal`, `eye-roll`, `facepalm`, `thumbs-up`, `palm-open`, `pause-still`). One-off / niche gestures go in `notes`. Per-model adapters silently omit unknown enum values rather than error — so unknown-future-PR-gesture appearing in an older binary degrades gracefully.

**Hook / Body / CTA shape** — per 02.08.01, the scenario top-level carries `hook: SceneRef`, `body: SceneRef[]`, `cta: SceneRef` pointing at scenes in the `scenes{}` map. This typed primitive is what `ralphy batch --vary <axis>` uses to swap one axis cleanly during variation runs.
