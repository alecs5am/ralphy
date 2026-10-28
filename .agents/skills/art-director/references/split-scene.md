# Art director: split the scene instead of a third regen

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Split-scene-instead-of-regen (repeat-failure rule)

**Rule.** When a single scene fails twice on the same axis — the same motion beat, the same camera move, the same physically-impossible action — **stop re-prompting and split it into N micro-shots inside the original slot's time budget.** Don't try a third prompt variant; that loop converges nowhere.

The default agent instinct is re-prompt-on-fail (tweak verbs, try a different model, add a negative). For "one beat the model can't deliver" failures, that instinct is wrong. Splitting converts an impossible 5s shot into three possible ~1.6s shots — each a beat the model *can* hit — and the editor stitches them within the same slot duration. The total cost is usually lower than a third regen and the result actually lands.

**Concrete example — `flipper-hypermotion-001` scene-03 (POSTMORTEM rule #11).** Scene-03 was a single 5s hypermotion shot the model couldn't sustain; two regens on the same prompt axis drifted the same way. The redo (one scene, split into micro-shots) cost **$1.28 — ~10% of the entire project budget** — and produced more lessons per dollar than the rest of phase 3 combined. The lesson the postmortem locked in: the second failure on the same axis is the signal to restructure, not to re-prompt.

**Structural pairing.** Splitting becomes much cheaper once `ralphy ref extract-frame` + `ralphy generate video --extend-from <slot>` ship (see [notes/issues/done/012-no-frame-extract-or-i2v-extend-verbs.md](../../../../notes/issues/done/012-no-frame-extract-or-i2v-extend-verbs.md)) — that pair lets you i2v-anchor each micro-shot from the previous one's last frame, keeping continuity without a fresh anchor for every sub-beat. Until those verbs land, hand-author the split by reusing the scene anchor as `--ref` on every micro-shot.

**Operationally.**

1. After the second failure on the same axis, write down the axis in one line ("camera can't crash-zoom through the prop on contact") and stop regenerating.
2. Rewrite the scene as 2-4 micro-shots whose durations sum to the original slot. Each micro-shot must be a beat the model has hit in this project before.
3. Update `scenario.json` slot list (`scene-03a`, `scene-03b`, …) via `ralphy project update`, regenerate prompts for the new slots only, then `ralphy generate` each.
4. Editor stitches the micro-shots back into the original scene's time window.
