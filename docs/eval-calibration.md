# Eval judge calibration

LLM/VLM judges are useful but fallible. A quality gate that BLOCKS or SHIPS content should not be unverified taste — before you trust a judge in a content farm you need to know its true-positive rate, true-negative rate, and agreement with human labels. `ralphy eval calibrate` measures that for a **binary** eval judge (a gate whose report carries a boolean `blocksShip`).

## The binary convention (read this first)

Calibration is framed as binary classification with one fixed convention:

- **Positive class = "the gate should BLOCK / fail."**
- A judge **predicts positive** when its report's `blocksShip === true` (equivalently `verdict === "fail"`).
- The human label `expectedLabel` is `"pass"` (negative) or `"fail"` (positive).

So a true positive (`tp`) is "human said block, judge blocked"; a false negative (`fn`) is the dangerous case — "human said block, judge let it ship."

## Which gates are calibratable

Today: the binary `blocksShip` judges — `first-frame-hook`, `ocr`, `captions`. The `--gate` you pass must match the dataset's `gate` field and be a known `QUALITY_GATES` id (`cli/lib/eval/gate.ts`).

## Authoring a dataset

A dataset is a small JSON file (`cli/lib/schemas/calibration.ts`). Keep it CI-smoke-sized (~4-6 examples); larger production sets are optional.

```json
{
  "version": 1,
  "gate": "first-frame-hook",
  "judgePromptVersion": "hook-v1",
  "examples": [
    {
      "id": "strong-product-opener",
      "artifact": "fixtures/hook/strong-product-opener.mp4",
      "expectedLabel": "pass",
      "mode": "ugc-review",
      "rationale": "Product is large, centered, high-contrast in frame one."
    },
    {
      "id": "empty-establishing-shot",
      "artifact": "fixtures/hook/empty-establishing-shot.mp4",
      "expectedLabel": "fail",
      "mode": "ad-creative-pack",
      "rationale": "Opens on a slow empty room with no subject and no hook line."
    }
  ]
}
```

- `artifact` is an opaque path / ref string — the schema does **not** check it exists.
- `mode` (optional) sets the content mode the live judge is thresholded against.
- `rationale` (optional) records why a human called it pass / fail (English only, like everything on disk).

Starter datasets ship under `cli/lib/eval/calibration-datasets/` (`first-frame-hook.json`, `captions.json`).

## Running it

### Offline (the test / CI seam — no model spend)

Supply a `--predictions` map of pre-recorded judge calls — a JSON object `{ exampleId: "pass" | "fail" }`. The harness uses those instead of calling the live judge, so the run makes **zero model calls** and is fully deterministic:

```bash
ralphy eval calibrate \
  --gate first-frame-hook \
  --dataset cli/lib/eval/calibration-datasets/first-frame-hook.json \
  --predictions preds.json
```

```json
{
  "strong-product-opener": "pass",
  "empty-establishing-shot": "fail"
}
```

### Live (paid)

Omit `--predictions` and the harness runs the gate's real model-backed judge over each `artifact`. Honors `--no-vision` (free deterministic-only judge where the gate supports it) and a `--model <id>` override, same as the other eval verbs:

```bash
ralphy eval calibrate --gate captions --dataset my-captions-set.json
```

By default the report is **printed only**. Pass `--out <path>` to persist it; the write is append-only (an existing report is auto-versioned to `.vN`, never overwritten).

## The metrics

The report includes:

- **Confusion matrix** — `tp` / `fp` / `tn` / `fn` (positive = block).
- **TPR** (recall / sensitivity) = `tp / (tp + fn)` — of the things humans flag to block, how many the judge catches.
- **TNR** (specificity) = `tn / (tn + fp)` — of the things humans pass, how many the judge correctly ships.
- **Precision** = `tp / (tp + fp)` — of the things the judge blocks, how many humans agree should be blocked.
- **Accuracy** = `(tp + tn) / n`.
- **Cohen's kappa** — chance-corrected agreement: `kappa = (po - pe) / (1 - pe)`, where `po = (tp + tn) / n` and `pe = ((tp + fn)·(tp + fp) + (fp + tn)·(fn + tn)) / n²`.

A rate whose denominator is zero is reported as `null` (undefined), never fabricated as `0`. A degenerate dataset where every label collapses onto one class makes kappa undefined; the harness returns `1` for perfect agreement, else `0`.

## The promotion bar (default, not a universal truth)

The report's `recommendation` compares Cohen's kappa to a **default promotion bar of `0.6`**:

- **kappa ≥ 0.6** → `promote-to-hard-gate eligible`. The judge agrees with humans well enough to consider wiring it as a hard, ship-blocking gate.
- **kappa < 0.6** (or undefined) → `keep advisory`. The judge still runs and surfaces findings, but it should not unilaterally block ship until it calibrates better — re-author the prompt / thresholds and re-measure.

`0.6` is the eval research's reasonable **first** bar — substantial agreement. It is a default, not a universal truth: a high-stakes gate (claims/policy) may warrant a stricter bar, and a low-cost advisory signal may tolerate less. Pin the judge model + prompt version in the dataset / report so drift can be re-detected after any model or rubric change.
