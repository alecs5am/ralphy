# Intake: clarification triage

> Moved out of `SKILL.md` to keep the skill body small (#574). Read on demand.

## Clarification triage (04.03.01 + 04.03.03)

The intake protocol caps real questions at 5 per turn for legibility, BUT every question must name a specific decision and offer one or two defaults the user can accept. Three buckets:

1. **Infer (most cases).** Use the default-pick table above. Announce the pick and proceed; do not stall waiting for confirmation.
2. **Ask (rare but real).** Multiple distinct decisions are blocked by the same unknown, OR the brief contradicts a default the agent would otherwise pick (e.g. user said "60s long-form" but the template caps at 20s). Frame each question as "Decision: <X>. Default: <Y>. Override? __".
3. **Fail loudly (missing-and-irreplaceable).** The brief names a real entity but no reference is attached AND the user hasn't opted into `--no-ref-consent`. The reference-required gate refuses; do NOT improvise the entity from text alone (AGENTS invariant #3).

**Forbidden shapes** (the lint at `bun run lint:confirmation-shape` will flag these in playbooks; the agent must not emit them in chat either):

<!-- confirmation-shape-allow:section -->
```
"Should I proceed?"
"Shall I go ahead?"
"Would you like me to ..."
"Just to confirm, ..."
"I'll go ahead and ..."
"Should I continue?"
"Do you want me to ...?"
"Keep going?"
```
<!-- /confirmation-shape-allow:section -->

These add no information and break the one-beat-at-a-time loop. Replace with action statements: "Generating scene-01 now — flag if anything looks wrong." If the answer would unblock a distinct decision, ask a real question; otherwise just act.
