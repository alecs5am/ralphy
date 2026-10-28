# Intake: ship mechanics and gating cadence

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Ship (04.01.04)

"Ship it" / "let's go to the final" / "publish it" is the explicit transition from iteration to final render. Mechanics:

1. **Reference-required gate re-check.** Before the final render, re-run `ralphy ref check <project-id>` to confirm any named real entity has a satisfied ref (or a logged `--no-ref-consent`). The intake-step ref check at step 1 may be stale if the scenario changed.
2. **Quality gates.** Run `ralphy editor preflight <id>` (aspect / fps / music-length divergence). The agent quality gates (`scoreScenario`, `scoreImage`, `scoreVideo`) refuse-not-warn per AGENTS invariant #4; if any fails twice in a row, stop and report concrete options — do not render mp4 over a failed gate. There is no model upgrade between draft and ship: best models are used throughout (AGENTS invariant + `04.0A.03`).
3. **Render.** `ralphy render <project-id>` → `.ralphy/workspaces/<ws>/projects/<id>/render/final.mp4`.
4. **Post-render eval.** Hand off to `/evaluator` for `eval.json` + `eval-report.md`. Surface the report inline.
5. **Authorize commit/push.** Only after the eval lands, ask once "ready to commit/push?". User's "yes" is the only thing that authorizes git/network operations on shared state (CLAUDE.md "Executing actions with care").

## What's a "step" worth gating on?

The default cadence is **every paid generation OR every named scene**, whichever is shorter. As trust builds within a project (3+ scenes accepted in a row), you may batch the next 2-3 scenes together without waiting — but always return to single-step pacing the moment the user flags a miss.

For **template-driven** projects (`ralphy template use <slug>`), the template's `composition.md` or `TEMPLATE.md` may pre-define a tighter / looser pacing. Honor the template, but if the user says "one at a time", you're back to scene-by-scene regardless of template default.
