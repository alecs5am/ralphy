# Mode quality playbook — `cartoon-animation`

> A stylized 2D / 3D cartoon-animated short — character-driven illustrated motion. Backing skills: [`/ugc-toon-action`](../../../.agents/skills/ugc-toon-action/SKILL.md) + [`/seedance-prompts`](../../../.agents/skills/seedance-prompts/SKILL.md). Route: `intake → scenarist → art-director → editor → ralphy render`.

## Creative objective

A toon-action short lives on **a consistent cast + action the model can actually render**. The two biggest failures are silhouette drift (the character looks different shot to shot) and motion smear (the action is outside the model's lane). Both are solved up front: design the cast with a tight SUBJECTS block + a named-style-reference silhouette lock, and route the motion to seedance with the painterly STYLE block held literal across every clip.

## Required inputs

- Story or concept (premise + the action vocabulary: fight / chase / trick / dance).

## Reference requirements

No reference for original stylized characters. The reference-required gate fires for a **named real IP character as the subject** (Spider-Man, a specific anime character) — ref or logged `--no-ref-consent`. Naming a pop-culture style reference to LOCK a silhouette (hair / cape / signature accessory) is allowed — it shapes an original character, it does not depict the IP. This is original aesthetic homage, not a copyrighted-scene reproduction.

## Prompt spine

Author each seedance clip as SUBJECTS → ENVIRONMENT → AUDIO-POLICY → STYLE → SHOT-LIST. The descriptor blocks are **literal — do not paraphrase between clips** (paraphrasing drifts the look).
1. **SUBJECTS block** — each character one dense line: name, age, height, skin, hair (with a NAMED pop-culture silhouette reference), outfit head-to-toe, signature prop, stance. Two contrasting silhouettes read best.
2. **STYLE block (literal)** — the full painterly register (flat color blocks, hard-edge brush, gouache texture, chunky ink linework, halftone in mid-shadows, chromatic-aberration on bright edges) + a NO-list (no photorealism, no Pixar CG, no glossy cel-shade).
3. **AUDIO-POLICY block (every prompt)** — bans music/score; diegetic SFX only (6-8 specific cues); music is a post pass.
4. **SHOT-LIST** — number SHOT 1..N with lens (24/28/35/50mm) + camera move + the action beat + per-shot SFX.
5. **Multi-clip continuity anchor** — end clip N with a location-exit phrase, open clip N+1 with "They have JUST" + that phrase; match sky/time-of-day + 1-2 silhouette descriptors verbatim.

## Model recommendations

Verify against `MODELS.md` every run.
- **Character design + script:** the scenarist LLM (`callLLM`) — the SUBJECTS blocks + shot beats.
- **Action video:** `bytedance/seedance-2.0` t2v, 1080p, `--audio` ON with the AUDIO-POLICY banning music. NOT kling (tuned for default selfie motion, **smears** jumps / flips / combat) and NOT veo (5-6× pricier, no gain on painterly). Pure t2v, not i2v from a photoreal anchor (seedance blocks photoreal-human i2v).
- **Music:** post-render ElevenLabs Music, instrumental, genre+BPM+instrumentation only — no artist names; on `400 bad_prompt` resubmit the API `prompt_suggestion`.

## Style / visual constraints

- Lock the animation style before any clip — character consistency depends on it.
- Named-style-reference silhouette lock on every character or it drifts between shots.
- Painterly STYLE block verbatim across clips; comic SFX text (KRRRACK / FWIP) painted into impact frames doubles as caption.

## Common failure modes

- **Silhouette drift** → named-style-reference lock + verbatim SUBJECTS block.
- **Motion smear** → seedance, not kling, for non-default physics.
- **Music bleeding into the clip** → AUDIO-POLICY block in every prompt; music is a post pass.
- **Paraphrasing the STYLE block between clips** → keep it literal.

## Evaluation criteria

`scoreScenario` → `scoreImage` → `scoreVideo` gates (each refuses, not warns). Beyond the gates: the cast is the same across clips, the action renders cleanly (no smear), the painterly register holds, continuity matches across cuts. Optional `/evaluator` post-render pass.

## Does NOT apply to:

- A photoreal live-action UGC video (talking creator, unboxing, testimonial) → use [`tutorial-ugc.md`](tutorial-ugc.md) / [`unboxing-ugc.md`](unboxing-ugc.md) / `ugc-review`.
- Abstract graphic motion (shapes, logo motion, no character) → use [`motion-design.md`](motion-design.md).
- A single static illustration → match an image mode.
- Reproducing one specific animation → the remix path (`ralphy template use <slug>`).
