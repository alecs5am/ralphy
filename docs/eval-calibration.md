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

## Calibration status after the gate audit (#569)

The October 2026 gate audit ([`research/gate-audit-2026-10.md`](research/gate-audit-2026-10.md)) is the first measurement of how the gates behave on real projects. What it means for calibration:

- **No judge has been calibrated yet.** The starter datasets reference fixture videos (`fixtures/hook/*.mp4`, `fixtures/captions/*.mp4`) that are not in the repository, so the live path cannot run, and no `--predictions` run has been recorded. Every kappa is still unknown. Adding those fixtures, or a dataset of labeled real renders, is the first step.
- **No outcome labels yet.** The #558 store tables (`evaluations`, `metric_snapshots`) are empty, so human pass / fail labels are the only ground truth available. Once analytics are imported, a gate's verdict can also be checked against the Unit's outcome.
- **What the audit labeled by hand.** 14 keyframe-vision `fail` findings checked against their frames (all 14 wrong) and 7 openings flagged by `structure.hook-zone-static` (all 7 working openings or deliberate continuous shots). They are the seed for a keyframe-vision dataset; the harness covers only `blocksShip` gates today, so that gate would need a binary adapter first.
- **The full-video pass is now calibrated (#583).** It returned a ship-ready verdict on 0 of 29 stored runs. Those 29 renders are labeled in `cli/lib/eval/calibration-datasets/full-video-pass-569.json` (9 ship-ready), and the calibrated aggregation agrees with the labels on 28 of 29 (Cohen's kappa 0.92, was 0.00). The comparison of candidate rules is in the audit; `tests/unit/full-video-calibration-583.test.ts` re-runs it offline from the dataset.

### What changed in the gates' defaults

These are relaxations of measurement or format artifacts, documented with their evidence in the audit:

| Gate / check | Default now | Why |
|---|---|---|
| `structure.hook-zone-static` (`eval video`) | `info` | Cut-count proxy; wrong on every opening inspected |
| `format.resolution` (`eval video`) | no finding for 9:16 at or above 1080x1920; non-9:16 portrait is a `format.aspect-ratio` warn | 2x renders are not a defect |
| Keyframe `vision.*` (`eval video`) | capped at `warn` | 14 of 14 checked keyframe fails were wrong; the full-video pass stays the ship gate |
| `captions.thin` / `captions.dense` | counts words, not caption entries | measurement bug |
| `captions.too-short` (`eval captions`) | skipped on word-level tracks | word timings are not display windows |
| Platform spec (`eval platform`) | intermediates ignored beside a render; over-size frame is a warn | source stills were failed as uploads |
| Full-video ship verdict (`eval video`, native-video / deep-style) | fails block, warns are repair notes; `style.timing-hook-first-3s` capped at warn; rule-violation and motion-artifact fails need the model's holistic `fail` (#583) | "two warns make a warn" blocked all 9 ship-ready renders; the capped fails were wrong on inspection |
| `scoreScenario` (`project score`) | hook word cap hard only in short-ad; format checks advisory for modes that do not declare the gate | course disagreement (#571) and registry scope |

`RALPHY_EVAL_STRICT_RUBRIC=1` restores the previous severities for one release. Run a gate both ways on the same project when you want to compare the readings; record the human label for each disagreement and it becomes calibration data.
