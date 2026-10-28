# Quality gate (scenario)

**Hard rule (inherited from `AGENTS.md`):** quality gates refuse, do not warn. Before handoff to `art-director playbook` — the gate is mandatory.

## Tool

```bash
ralphy project score <id>
```

Under the hood — `cli/lib/score.ts` → `scoreScenario(scenario, { mode })`. Non-LLM check (fast, cheap, deterministic).

## What gets checked

The checks below mirror `cli/lib/score.ts` (re-scoped by the #569 gate audit, `docs/research/gate-audit-2026-10.md`). The thresholds follow the **duration tier**: the declared `target_duration_s` (or `duration` / `durationSec`), else the planned scene total.

| Tier | Declared length | First-scene window | Per-scene warning above | Total overhead allowed |
|---|---|---|---|---|
| short-ad | ≤ 15 s | 3 s | 3 s | +0.5 s |
| mid-form | 15-45 s | 6 s | 8 s | +1.0 s |
| long-form | > 45 s | 10 s | 12 s | +2.0 s |

### Hard fails (block handoff)

1. **A hook line exists** — `hook` string, `hook.primary`, or the canonical `hook.vo`.
2. **Hook ≤ 10 words in the short-ad tier.** Above the short-ad tier a longer hook is a warning: the course the retention review follows sets no word cap, so judge whether the opening reads at its pace.
3. **First scene inside the tier's window.**
4. **Scenes exist.**
5. **Total ≤ declared target + tier overhead** — only when a target is declared; with no declaration there is nothing to exceed.
6. **A set `angle` is one of the valid angles** (`VALID_ANGLES` in `cli/lib/score.ts`). A missing angle is a warning.
7. **Every `text_overlay` inside the green zone** — X 60-960, Y 210-1480. This one is a real defect in every format and stays hard for every content mode.

### Content-mode applicability

The content-mode registry (`cli/lib/content-modes.ts → qualityGates`) names the gates each mode runs. For a mode that does not list `scoreScenario` (personal-clipper, podcast-video, motion-design, typography-animation, infographic-animation), fails 1-6 are reported as warnings with an `advisory` note and `passed` stays true; green-zone fails still block. `ralphy project score` reads the mode from `production-plan.json`, else the scenario's `content_mode`. An unknown or missing mode keeps the gate hard.

`RALPHY_EVAL_STRICT_RUBRIC=1` restores the pre-audit behavior (universal 10-word cap, no mode applicability) for one release.

### Warnings (don't block, but shown)

- A scene longer than the tier's per-scene limit → "break with internal cut/transition"
- Short-ad tier total above 15 s
- Legacy array-shaped `scenes`
- Missing `angle`

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
