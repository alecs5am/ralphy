# Eval-driven prompt optimization (experimental)

Prompts — a judge rubric, a generator template, a guideline block — are artifacts you can _measure_ and _improve_, not just hand-tune. `ralphy eval optimize-prompt` treats a prompt as an optimizable artifact: it improves the prompt against a labeled calibration dataset and proves the improvement on a **held-out split** before anyone trusts it.

This is **experimental** and **review-gated**. It NEVER overwrites a template, guideline, MODELS.md, or the source prompt. A `propose` recommendation writes a reviewable proposal; a maintainer applies it by hand.

## Inspiration: DSPy / MIPRO (not a hard dependency)

The eval research names DSPy/MIPROv2 as the strongest prompt-optimization pattern: bootstrap candidate prompts, score them on a metric, keep the best on a held-out set. We borrow the _shape_ — split, generate a candidate, compare on held-out — without pulling in DSPy. The value comes from the **split + the held-out comparison**, not from any one optimizer algorithm. The candidate-generation step is a single bounded `callLLM` call given the train-split failures; it can be swapped for a richer optimizer later without changing the loop.

## Depends on #483

This builds directly on the [calibration harness](eval-calibration.md):

- The **dataset** is a #483 `CalibrationDataset` (`cli/lib/schemas/calibration.ts`) — human-labeled `pass`/`fail` examples for ONE gate.
- The **metrics** are #483 `CalibrationMetrics` (`computeCalibrationMetrics`) — confusion matrix, TPR/TNR, accuracy, Cohen's kappa.
- Held-out evaluation reuses `runCalibration` over the held-out subset.

The binary convention is unchanged: positive class = "the gate should BLOCK / fail".

## The loop

1. **Split** the dataset into `train` / `heldOut` (deterministic — see below).
2. **Evaluate the baseline prompt** on the held-out split via `runCalibration` (the judge runs with the baseline prompt).
3. **Generate a candidate prompt** — the live path asks `callLLM` to improve the prompt given the train-split's labels (bounded by the optimizer budget). Offline, the candidate is injected.
4. **Evaluate the candidate** on the same held-out split.
5. **Compare** baseline-vs-candidate Cohen's kappa → `recommendation`: `propose` when the candidate improves kappa by at least the margin, else `reject`.

```
ralphy eval optimize-prompt --prompt judge.txt --dataset hooks.json
```

## The deterministic split

`splitDataset(dataset, trainFraction, seed)` orders the examples by a stable per-id hash — `sha256(seed:id)`, NOT array position and NOT `Math.random`. The first `floor(n * trainFraction)` of that stable order are the train split; the rest are held out. The same `dataset` + `trainFraction` + `seed` therefore yield byte-identical splits on every call and every machine. Every example lands in exactly one subset, and the union is the full set. Default `trainFraction` is `0.6`.

## The improvement threshold

A bare `candidate.kappa > baseline.kappa` would let split-noise read as a win, so a candidate must beat the baseline by a small but non-trivial margin (default `0.02`). A null kappa on either side (a degenerate split where every label collapses onto one class) is **never** an improvement — we do not propose on undefined agreement.

## No overwrite — the load-bearing rule

`writeProposal(outDir, report)` writes ONLY under `outDir`:

- An **append-only, versioned** `proposal-vN/` dir — `proposal-v1`, then `proposal-v2`, never overwriting an existing one.
- Each dir holds `candidate-prompt.txt` (the proposed prompt) + `report.json` (the full `OptimizationReport`).

It **refuses** to write into the source prompt's own directory or any protected public-guidance path (`templates/`, `guidelines/`, `MODELS.md`) — it throws a clean error instead. The source prompt is read once for the baseline text and is never written; a maintainer reviews the proposal and applies the candidate by hand. Public guidance stays review-gated per the knowledge flywheel.

The default `--out` is `<dataset-dir>/prompt-proposals/`.

## Judge vs generator prompts

`--kind judge` (default) is the cleaner path: the held-out metric is #483's binary judge agreement. `--kind generator` reuses the same proposal + report machinery — a generator prompt's outputs are scored by the target gate / metric, and the same prediction-injection seam exercises it offline. Both kinds split, compare, and propose identically; only the candidate-generation framing differs.

## Offline seams (the CI path — no model spend)

The whole run is model-free when all three injection seams are supplied:

- `--baseline-predictions <path>` — a JSON map `{ exampleId: "pass" | "fail" }` of the baseline judge's calls on the held-out split.
- `--candidate-predictions <path>` — the same for the candidate judge.
- `--candidate <path>` — a candidate prompt file (skips the live `callLLM` candidate generation).

```bash
ralphy eval optimize-prompt \
  --prompt judge.txt \
  --dataset hooks.json \
  --baseline-predictions base.json \
  --candidate-predictions cand.json \
  --candidate cand.txt
```

`--dry-run` prints the plan (train/held-out sizes, what would run, whether it is cost-bearing) and makes ZERO model calls. Without the seams, the live loop runs the gate's real judge twice (held-out, paid) plus the LLM optimizer — `--dry-run` and the three seams are how tests and CI stay free.
