# Quality gate (scenario)

**Hard rule (inherited from `AGENTS.md`):** quality gates refuse, do not warn. Before handoff to `art-director playbook` — the gate is mandatory.

## Tool

```bash
ralphy project score <id>
```

Under the hood — `cli/lib/quality.ts` → `scoreScenario(scenario)`. Non-LLM check (fast, cheap, deterministic).

## What gets checked

### Hard fails (block handoff)

1. **`hook.primary` exists** — non-empty string, ≤10 words.
2. **`angle` ∈ {testimonial, unboxing, problem-solution, comparison, demo}** — top-level field is required.
3. **First scene ≤ 3s** — the hook must land in the 1-3s window.
4. **Total duration ≤ scenario.duration** or 15s default — if scene sum is greater → fail.
5. **Every scene has VO** or explicit `silent: true`. A silent scene without the flag = bug.
6. **All `text_overlay` inside the green zone** — X 60-960, Y 210-1480 for every overlay.
7. **Persona/brand reference policy** — if a scene contains a named persona/brand without `image_urls` → fail with a pointer to [`../art-director/ref-photo-policy.md`](../art-director/ref-photo-policy.md) (the art-director handoff will require the ref anyway).

### Warnings (don't block, but shown)

- Scene > 3s with no internal cut → "scene-NN slow pacing"
- Total duration > 18s — may be intentional but we flag it
- Hook word count > 7 — warning, not fail
- Banlist words in VO ("unique", "high-quality" without specifics) → warning

## Failure handling

**If `passed: false`:**
1. No handoff. Don't tell the user "done".
2. In chat: which fails, which specific scenes.
3. Iterate: fix → re-run `project score` → handoff.

**Report template:**
> "Scenario NOT ready. Fails:
> - scene-01 hook 14 words (limit 10): «<current hook>» → trim
> - scene-03 text_overlay y=1850 (outside green zone) → raise to Y ≤ 1480
> - scene-04 has no VO and no silent: true → decide
>
> Fixing the three above in-place — flag any item that should stay as-is and the rest will be patched."

## Two-failure rule

If after 2 iterations on the same scenes the scenario is still `passed: false` — stop, give the user concrete options:

> "Can't get the scenario to pass after two iterations. The brief seems to contradict the format (TikTok 15s + 4 separate persona showcases). Options:
> a) extend to 25s (say so)
> b) cut down to 1 persona
> c) switch format to comparison-angle
> Which one?"

## Manual override

The user can explicitly bypass:
> "skip the gate, scenario as is"

We log `stage: "scenario-gate-bypass-consent"` and continue. Rare case (production / spike test).

## When the gate runs

- Auto after `new-scenario` — cannot declare ready without passed.
- Auto after each `iterate-scenario` iteration.
- Manual: when the user says "check the scenario".
