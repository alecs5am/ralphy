# 08 — Quality & Evaluation — SPEC

> **Vision.** Every gate returns a decomposed `Verdict` — per-dimension scores, reasons, evidence. Deterministic checks fail fast; LLM judges run only on what survives. Calibrated against a human gold set. Refuses rather than warns.

## Scope

**In:**

- `cli/lib/eval/` refactor with `Verdict` schema + YAML rubrics
- Deterministic assertions (LUFS, dead-air, caption density, cost)
- LLM-as-judge wrapper with temp 0 / structured output / multi-sample / position-swap
- Hook scorer (its own gate)
- Green-zone enforcement
- Calibration golden set
- Refuse-not-warn enforcement
- Per-template rubric overlays

**Not in (cross-references):**

- Eval-driven iteration ("rework scene") flow → [`04`](../04-user-flow-and-autonomy/)
- Cost rollup data → [`10`](../10-cost-and-telemetry/)
- External analytics integration → [`10`](../10-cost-and-telemetry/) + [`01.08.03`](../01-cli/SPEC.md)
- Render utilities (frame extraction etc.) → [`06`](../06-utilities/)

---

## 08.01 `cli/lib/eval/` refactor

The structural change that everything else hangs on.

### 08.01.01 `Verdict` schema  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Zod schema in `cli/lib/eval/schema.ts`:
  ```ts
  type Verdict = {
    rubric: string;          // "scenario@v3"
    passed: boolean;
    score: number;            // 0-1 weighted
    threshold: number;
    dimensions: Array<{
      id: string;
      weight: number;
      kind: "deterministic" | "llm-rubric" | "clip-similarity" | "aesthetic";
      score: number;          // 0-5 Likert OR pass/fail
      pass: boolean;          // for hard-fail dims
      reason: string;
      evidence?: string;      // quoted span / frame / timestamp range
      samples?: number[];     // raw judge samples if LLM-judged
      variance?: number;
    }>;
    cost: { tokens?: number; usd: number; durationMs: number };
  };
  ```
- All four scorers (`scoreScenario`, `scoreImage`, `scoreVideo`, new `scoreHook`) return this shape.

### 08.01.02 YAML rubrics  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Default rubrics ship at `cli/lib/eval/rubrics/{scenario,image,video,hook,caption,audio}.yaml`.
- Each rubric declares: `id`, `version`, `threshold`, `hard_fail_dimensions: []`, `dimensions: []` with weight + kind + criteria.
- Version-bumped on every rubric change; recorded in `Verdict.rubric` as `<id>@v<version>`.

### 08.01.03 Per-template overlay  [ ]
**v1.0:** yes

**Acceptance criteria:**
- If `templates/<slug>/rubric.yaml` exists, it overlays the default (merges, dimensions added/modified, thresholds adjusted).
- Validation: overlay must not change a dimension's `kind`, only weight/threshold/criteria.

### 08.01.04 Module layout  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/eval/index.ts` — public API
- `cli/lib/eval/config.ts` — YAML loader + Zod
- `cli/lib/eval/rubrics/*.yaml` — default rubrics
- `cli/lib/eval/assertions/{deterministic,clip,aesthetic,llm-rubric}.ts` — assertion handlers
- `cli/lib/eval/judge/{schema,sample,swap}.ts` — judge wrapper
- `cli/lib/eval/golden/{scenarios,renders}/` — calibration set
- `cli/lib/eval/calibrate.ts` — κ computation
- `cli/lib/eval/report.ts` — markdown writer

---

## 08.02 Hook scorer

The single highest-leverage scorer.

### 08.02.01 `scoreHook` is its own function  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Scope: first 90 frames + first VO line.
- Dimensions: `hook_clarity` (who/what/why in 3s), `pattern_interrupt` (unexpected element in 0-30 frames), `cta_or_loop` (last 2s only, but this is the *opening* sibling).
- Hard fail on `hook_clarity < 3`.
- Documented in `cli/lib/eval/rubrics/hook.yaml`.

### 08.02.02 `ralphy project score-hook <id>` verb  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Standalone verb that runs the hook scorer on an existing render.
- Output: full Verdict + a `next_action` hint if failed (e.g., "rewrite hook" / "speed up cold open / add visual interrupt").

---

## 08.03 Deterministic assertions

Cheap, fast, no LLM. Fail fast.

### 08.03.01 LUFS via ffmpeg loudnorm analysis  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/eval/assertions/deterministic.ts` exposes `assertLufs(path, target, tolerance)`.
- Uses ffmpeg's loudnorm pass-1 to get integrated LUFS.
- Default target -14 LUFS (TikTok/Reels), tolerance ±2.

### 08.03.02 Dead-air via ffmpeg silencedetect  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `assertDeadAir(path, maxPct)` returns total silence > threshold (e.g., -40 dBFS for > 0.5s segments).
- Default max 5% of total duration.

### 08.03.03 Caption density  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `assertCaptionDensity(captionsJson, minWordsPerSec)` reads `captions.json` and computes words-on-screen per second.
- Default minimum 1.8 wps.

### 08.03.04 Cost cap  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `assertCostCap(projectId, maxUsd)` reads `generations.jsonl` cost rollup, fails if exceeded.
- Default $1.50 per video (configurable per template).

### 08.03.05 Caption alignment error (cross-link captioning backend)  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `assertCaptionAlignment(captionsJson, voScript)` uses WhisperX-style alignment; max ±0.15s error.

---

## 08.04 LLM-as-judge with anti-bias rituals

### 08.04.01 Judge wrapper at `judge/sample.ts`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `judgeDimension(rubric, dimension, input)` calls `cli/lib/providers/llm.ts → callLLM()` with `temperature: 0`, JSON-schema response_format, `n: 3` (configurable).
- Returns `{ samples: number[], median: number, variance: number, reason: string, evidence: string }`.
- Flags `uncertain: true` when variance > 1.0 on a 0-5 scale.

### 08.04.02 Position swap for pairwise comparisons  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `judge/swap.ts` exposes `pairwise(rubric, dimension, a, b)` that runs both orderings, discards if disagreement.
- Returns `{ winner: "a"|"b"|"tie"|"uncertain", swap_agreement: bool }`.

### 08.04.03 Different judge model vs generator  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Config: `judge_model: claude` if `generator_model: openai`, and vice versa.
- Documented in `cli/lib/eval/config.ts`.
- Cross-link `MODELS.md` for which judge models we trust.

### 08.04.04 Judge model never gets the rubric author's commentary  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Rubric YAML separates `criteria` (shown to judge) from `notes` (author commentary, hidden from judge).
- Lint enforces.

---

## 08.05 Calibration golden set

### 08.05.01 Golden set committed  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/eval/golden/scenarios/` — ≥ 30 hand-labeled scenarios with per-dimension scores.
- `cli/lib/eval/golden/renders/` — ≥ 30 rendered mp4s + label JSON.
- Each label: `{ rubric_version, dimensions: { [id]: { score, pass } }, labeler, labeled_at }`.

### 08.05.02 `ralphy eval calibrate`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Runs every scorer over the golden set; computes per-dimension Cohen's κ vs human labels.
- Writes `cli/lib/eval/CALIBRATION.md` with the latest results.
- CI check: any dimension's κ < 0.6 fails the build.

### 08.05.03 Re-calibration on rubric bump  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Bumping a rubric's `version` requires re-running calibrate and committing the new CALIBRATION.md.
- Lint enforces.

---

## 08.06 Refuse-not-warn enforcement

### 08.06.01 Gate refuses on `passed: false`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy generate` / `ralphy render` / `ralphy ship` paths check the gate; on `passed: false`, exit with code 5 (`E_QUALITY_GATE`).
- Error message names the failing dimension(s) and threshold.
- `--allow-failed-eval` flag overrides; logged as `stage: "eval-override"` in gen-log.

### 08.06.02 No silent warnings  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Audit pass: every call to `scoreScenario` / `scoreImage` / `scoreVideo` either acts on `passed` or is in a documented "diagnostic-only" code path.
- Lint test.

---

## 08.07 Green-zone enforcement

Cross-link `docs/green-zone.md`. Today partially enforced in `src/lib/utils/green-zone.ts` and scoreScenario; tighten.

### 08.07.01 `assertGreenZone(scenario)` in scoreScenario  [~]
**v1.0:** yes

**Acceptance criteria:**
- Every text overlay in scenario is checked against the universal 60-960 × 210-1480 box.
- Per-platform overrides honored via project config.
- Hard fail on out-of-zone overlay.

### 08.07.02 Render-time enforcement on caption layout  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Editor playbook's caption layout respects the green zone presets in `getTextPreset()`.
- Render test verifies (cross-link `11.02`).

---

## 08.08 `ralphy council` — multi-agent evaluation

Renames the eval flow from "one model judges everything" to "1..N independent agents grade in parallel, models hidden from the user". Replaces today's single-call validator. Fixes the documented bug where the LLM judge ignored project context and gave generic "unrealistic" feedback to body-horror / cartoon / surreal content.

### 08.08.01 `ralphy council <project-id>` runs N agents in parallel  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy council <project-id> --agents N` (default 3, range 1..7) launches N independent agents, each scoring the project against the active rubric.
- Each agent runs the full `Verdict` pipeline of `08.01`-`08.05`.
- Models per agent are selected from a configurable pool (see Q-08, default: rotate through Claude / GPT / Gemini for diversity).
- The actual model behind each agent is **hidden from the user** in reports and CLI output. Agents are labeled `Agent 1`, `Agent 2`, … only.
- Output per project: `workspace/projects/<id>/eval/council-<timestamp>/report-from-agent-<N>.md` + `verdict-agent-<N>.json`.
- Summary report at `workspace/projects/<id>/eval/council-<timestamp>/SUMMARY.md` consolidating per-dimension consensus + dissent.

### 08.08.02 Each agent receives FULL project context  [ ]
**v1.0:** yes

**Acceptance criteria:**
- The agent prompt includes: scenario.json, brand.json, persona.json, template metadata (kind + category + intended tone), refs metadata, and the active rubric YAML.
- Critically: the prompt explicitly states the intended *register* / *genre* of the work ("this is a brainrot meme — extreme physics are *desired*, not a fault" / "this is a body-horror experimental short — visceral imagery is intentional").
- Pulled automatically from `template.yaml`'s `register` / `genre_tags` fields (cross-link [`02.06`](../02-prompts-and-templates/SPEC.md)).
- Test: a body-horror project does NOT score "unrealistic" as a fault dimension; a corporate-explainer project DOES.

### 08.08.03 Council consensus and dissent surfaced  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `SUMMARY.md` reports per-dimension: median score, range across agents, marked `consensus` (range ≤ 1) or `dissent` (range > 2).
- High-dissent dimensions trigger a footnote: "Agents disagreed; consider human review".
- `passed` is computed as: majority of agents agreeing on `passed: true`. Documented in Q-09.

### 08.08.04 Council cost-bounded  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy council --agents 3` for a 15s video costs ≤ $0.30 total.
- `--dry-run` returns the cost estimate without running.
- Budget enforcement via `10.03` — refuses if council would breach project budget.

### 08.08.05 Replaces the single-call validator path  [ ]
**v1.0:** yes

**Acceptance criteria:**
- The current `cli/lib/score.ts` single-LLM-judge path is migrated to call `council` with `--agents 1` for fast pre-flight gates, `--agents 3` for ship-time evaluation, `--agents 5+` for stretch / audit work.
- Default mid-flow gate: 1 agent (fast). Default ship-time gate: 3 agents.

### 08.08.06 Council verb wraps and replaces `ralphy eval`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy eval <project-id>` is kept as an alias for `ralphy council <project-id> --agents 1 --quick`.
- The `ralph-evaluator` skill is renamed to `ralph-council` and invokes the verb.

### 08.08.07 Agent diversity strategy documented  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/council.md` documents: which models go in the rotation pool, why diversity matters (anti-self-enhancement bias), how to override per `cli/lib/eval/config.ts`.
- Crucially: a judge model is never the same family as the generator model for that dimension (cross-link [`08.04.03`](#0804-llm-as-judge-with-anti-bias-rituals)).

---

## 08.09 Post-launch

### 08.09.01 CLIP-similarity scorer  [ ]
**v1.0:** no

**Acceptance criteria:**
- `assertions/clip.ts` adds prompt↔frame CLIP cosine + cross-scene identity drift.
- Optional dep: requires ONNX runtime or a remote endpoint; no-op if not installed.

### 08.09.02 LAION aesthetic predictor  [ ]
**v1.0:** no

**Acceptance criteria:**
- `assertions/aesthetic.ts` adds the LAION-aesthetic v2 head.
- Optional dep.

### 08.09.03 Cross-render comparison verb  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy eval compare <render-a> <render-b>` returns a per-dimension delta.

### 08.09.04 External analytics integration (joint with `10`)  [ ]
**v1.0:** no

**Acceptance criteria:**
- TikTok / Meta / YT analytics pulled per project; "iterate from numbers" loop.
