# 08 — Quality & Evaluation — PRD

## Problem

Ralphy has three quality layers: `scoreScenario` (pre-render gate on scenario), `scoreImage` / `scoreVideo` (per-asset gates), and `ralph-evaluator` (post-render audit). They exist in `cli/lib/score.ts` and the evaluator skill. They use a "virality rubric" (`docs/virality-rubric.md`) and a "green zone" enforcement (`docs/green-zone.md`).

The scaffolding is right; the discipline is shallow. Concrete gaps from competitive research:

1. **Single-score output.** OpusClip's "virality score" is the canonical anti-pattern: one opaque number, no decomposition, no justification. Anthropic's eval guide and every serious framework (DeepEval G-Eval, EvalCrafter, VBench) explicitly reject this: *grade each dimension with an isolated judge, with its own field, justification, and score, with failure definitions explicit.* Our `scoreScenario` outputs an integer with a `reason` string — we're one step above the OpusClip anti-pattern but not by much.
2. **No human-calibrated baseline.** A rubric you haven't checked against 20-50 hand-labeled examples is vibes, not eval. We don't have a golden set.
3. **LLM-as-judge without the four anti-bias rituals.** Research consensus (Patronus, Confident AI, position-bias paper): temperature 0-0.1, JSON-schema structured output, multiple samples + majority vote on borderline, position swap for pairwise. We're not enforcing any of these in `scoreScenario`.
4. **Quality gates warn, don't refuse.** `AGENTS.md` invariant #4 says they should refuse. They don't; today they print a warning and continue.
5. **Hook quality isn't its own scorer.** The 3-second hook is the highest-leverage dimension (>65% 3-sec retention → 4-7× impressions per industry data). We score it as one dimension among many; it should have its own gate.
6. **Cost / latency / dead-air / loudness are deterministic and trivial; we're not exploiting them.** ffmpeg's `loudnorm` and `silencedetect` filters give exact LUFS and dead-air % for free. We're not using them in the gate.
7. **The single-LLM-judge path ignores project genre.** Concrete bug: when a project's intent is brainrot / body-horror / surreal cartoon, the judge has scored it "unrealistic" — a generic failure label that's a feature of the work, not a fault. The judge prompt never received the template's intended register / genre. This breaks all confidence in the gate for non-realistic work.

This category owns "is this output any good?" — the system, the rubrics, the calibration loop.

## Users

| User | Need |
|---|---|
| **Producer agent** | Decisive pre-render gate. "Refuse if X, Y, Z. Proceed otherwise." |
| **Evaluator agent** (`ralph-evaluator` skill) | Decomposed verdict per render, with per-dimension evidence and reproducible scores. |
| **Human user** | Honest feedback on what's wrong with a draft. "Hook is unclear" beats "score 4/10". |
| **Template author** | Per-template rubric overlays. A meme template doesn't have the same dead-air budget as a corporate spot. |

## User stories

1. As the **producer**, before render, I run `scoreScenario` and get a `Verdict` — per-dimension scores (0-5), pass/fail markers, weighted total, threshold. If `passed: false`, I refuse to render unless explicitly overridden.
2. As the **evaluator**, after render, I run `ralph-evaluator` and produce an `eval-report.md` that decomposes the render: hook clarity, payload density, caption legibility, audio intelligibility, visual consistency, aesthetic. Each dimension has a score, reason, evidence (timestamp/frame).
3. As a **template author**, I write `templates/<slug>/rubric.yaml` overlay that adjusts thresholds for my template (e.g., the brainrot template can have 10% dead air; the corporate spot cannot).
4. As a **maintainer**, on every PR that touches `cli/lib/eval/`, the calibration test runs against the golden set and asserts Cohen's κ ≥ 0.6 per dimension.
5. As an **agent**, the verdict structure is stable and machine-readable. I can act on `verdict.dimensions[id="hook_clarity"].pass` without parsing prose.
6. As a **user**, when the gate refuses, the error names the failing dimension and the threshold I'm under, with a concrete next action.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| `Verdict` structure with per-dimension scores | Every gate returns this shape | Schema check |
| Calibration κ vs human gold on every dimension | ≥ 0.6 | `ralphy eval calibrate` |
| Hook scorer running on first 90 frames + first VO line | Yes | Test |
| Deterministic checks (LUFS, dead-air %, caption density, cost cap) running before LLM-judged checks | Yes | Code path order |
| Quality gates refuse rather than warn | 100% of gates | Code path |
| Per-template rubric overlays loaded when present | Yes | Template lint |
| Eval cost per render | ≤ $0.10 | Logged in gen-log |
| Eval wall time per render | ≤ 60s for a 15s video | Stopwatch |

## Non-goals

- **Reproducing VBench / EvalCrafter at full scale.** Their dimension taxonomy is gold; their implementations require Python + GPU + large model weights. Borrow the taxonomy, skip the deps.
- **Visual aesthetic scoring above LAION's predictor + a CLIP-similarity check.** Anything beyond is research, not v1.0.
- **External analytics integration.** "Iterate from numbers" with TikTok/Meta APIs is owned by [`10`](../10-cost-and-telemetry/) and [`01.08.03`](../01-cli/SPEC.md), post-launch.
- **Human review queue.** No human-in-the-loop UI for v1.0. The agent + the user pair via chat.
- **Cross-render comparison ("is v2 better than v1?")** beyond reading both verdicts side by side.

## v1.0 cut

**Must ship:**

- `08.01` — `cli/lib/eval/` refactor: `Verdict` schema, YAML rubrics, per-dimension scoring
- `08.02` — Hook scorer (first 90 frames + first VO line; own threshold)
- `08.03` — Deterministic assertions (LUFS, dead-air, caption density, cost cap)
- `08.04` — LLM-as-judge with the four anti-bias rituals (temp 0, JSON schema, N samples, position swap on pairwise)
- `08.05` — Golden set (≥ 30 scenarios, ≥ 30 renders) + `ralphy eval calibrate`
- `08.06` — Refuse-not-warn enforcement
- `08.07` — Green-zone enforcement in scoreScenario (cross-link `docs/green-zone.md`)
- `08.08` — `ralphy council` multi-agent evaluation with project-genre-aware grading (replaces single-LLM-judge path)

**Post-launch:**

- `08.09` — CLIP-similarity + LAION aesthetic as deterministic floors
- `08.10` — Cross-render comparison
- `08.11` — External analytics integration (joint with `10`)
