// Eval-judge calibration harness (#483).
//
// Pure-math + offline-harness coverage — NO paid generation, NO network, NO
// model calls. The harness's live judge path is wired and type-checked but
// never exercised: every run here uses the OFFLINE `predictions` seam.
//
// Coverage:
//   1. computeCalibrationMetrics — a hand-computed confusion matrix with exact
//      tpr/tnr/precision/recall/accuracy/kappa assertions (tp=3,fp=1,tn=4,fn=2).
//   2. Perfect agreement → kappa === 1.
//   3. Degenerate all-same-label → guarded kappa (no NaN).
//   4. n === 0 → every metric null.
//   5. Schema parse — valid dataset parses, malformed rejects.
//   6. runCalibration OFFLINE via a predictions map — metrics + recommendation.
//   7. CLI smoke: `ralphy eval calibrate --predictions` over a tmp dataset
//      asserts the JSON shape (offline, no model spend).
//
// English-only-on-disk discipline: every fixture id / artifact / rationale is
// plain English — no Cyrillic, no real-creator tokens.

import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  computeCalibrationMetrics,
  runCalibration,
  DEFAULT_PROMOTION_KAPPA,
} from "../../cli/lib/eval/calibration";
import {
  parseCalibrationDataset,
  type CalibrationDataset,
} from "../../cli/lib/schemas/calibration";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

/** Build N rows from a tp/fp/tn/fn confusion matrix. */
function rowsOf(c: { tp: number; fp: number; tn: number; fn: number }) {
  const rows: Array<{ expected: boolean; predicted: boolean }> = [];
  for (let i = 0; i < c.tp; i++) rows.push({ expected: true, predicted: true });
  for (let i = 0; i < c.fp; i++) rows.push({ expected: false, predicted: true });
  for (let i = 0; i < c.tn; i++) rows.push({ expected: false, predicted: false });
  for (let i = 0; i < c.fn; i++) rows.push({ expected: true, predicted: false });
  return rows;
}

const approx = (a: number | null, b: number, eps = 1e-9) => {
  expect(a).not.toBeNull();
  expect(Math.abs((a as number) - b)).toBeLessThan(eps);
};

describe("computeCalibrationMetrics — worked example tp=3,fp=1,tn=4,fn=2", () => {
  const m = computeCalibrationMetrics(rowsOf({ tp: 3, fp: 1, tn: 4, fn: 2 }));

  test("confusion + n", () => {
    expect(m.n).toBe(10);
    expect(m.confusion).toEqual({ tp: 3, fp: 1, tn: 4, fn: 2 });
  });

  test("rates", () => {
    approx(m.tpr, 3 / 5); // 0.6
    approx(m.tnr, 4 / 5); // 0.8
    approx(m.precision, 3 / 4); // 0.75
    approx(m.recall, 3 / 5); // recall === tpr
    approx(m.accuracy, 7 / 10); // 0.7
  });

  test("cohens kappa", () => {
    // po = 7/10 = 0.7; pe = (5*4 + 5*6)/100 = 0.5; kappa = (0.7-0.5)/(1-0.5) = 0.4
    approx(m.cohensKappa, 0.4);
  });
});

describe("computeCalibrationMetrics — edge cases", () => {
  test("perfect agreement → kappa 1", () => {
    const m = computeCalibrationMetrics(rowsOf({ tp: 4, fp: 0, tn: 6, fn: 0 }));
    approx(m.cohensKappa, 1);
    approx(m.accuracy, 1);
    approx(m.tpr, 1);
    approx(m.tnr, 1);
  });

  test("degenerate all-same-label → guarded kappa, no NaN", () => {
    // Every row expected pass AND predicted pass: 1 - pe === 0, perfect agreement → 1.
    const allPass = computeCalibrationMetrics(rowsOf({ tp: 0, fp: 0, tn: 5, fn: 0 }));
    expect(allPass.cohensKappa).toBe(1);
    expect(Number.isNaN(allPass.cohensKappa as number)).toBe(false);
    // tpr denominator is zero (no positives expected) → null, not fabricated.
    expect(allPass.tpr).toBeNull();
    expect(allPass.precision).toBeNull();
    approx(allPass.tnr, 1);

    // Humans all pass, judge all blocks → 1 - pe === 0 but they DISAGREE → 0.
    const disagree = computeCalibrationMetrics(rowsOf({ tp: 0, fp: 5, tn: 0, fn: 0 }));
    expect(disagree.cohensKappa).toBe(0);
    expect(Number.isNaN(disagree.cohensKappa as number)).toBe(false);
  });

  test("n === 0 → every metric null", () => {
    const m = computeCalibrationMetrics([]);
    expect(m.n).toBe(0);
    expect(m.tpr).toBeNull();
    expect(m.tnr).toBeNull();
    expect(m.precision).toBeNull();
    expect(m.recall).toBeNull();
    expect(m.accuracy).toBeNull();
    expect(m.cohensKappa).toBeNull();
  });
});

describe("parseCalibrationDataset", () => {
  test("valid dataset parses", () => {
    const ds = parseCalibrationDataset({
      version: 1,
      gate: "first-frame-hook",
      examples: [
        { id: "a", artifact: "fixtures/a.mp4", expectedLabel: "pass" },
        { id: "b", artifact: "fixtures/b.mp4", expectedLabel: "fail", mode: "ugc-review" },
      ],
    });
    expect(ds.gate).toBe("first-frame-hook");
    expect(ds.examples.length).toBe(2);
  });

  test("malformed rejects — bad label", () => {
    expect(() =>
      parseCalibrationDataset({
        version: 1,
        gate: "ocr",
        examples: [{ id: "a", artifact: "x", expectedLabel: "maybe" }],
      }),
    ).toThrow();
  });

  test("malformed rejects — empty examples", () => {
    expect(() => parseCalibrationDataset({ version: 1, gate: "ocr", examples: [] })).toThrow();
  });

  test("malformed rejects — missing gate", () => {
    expect(() =>
      parseCalibrationDataset({ version: 1, examples: [{ id: "a", artifact: "x", expectedLabel: "pass" }] }),
    ).toThrow();
  });
});

describe("runCalibration — OFFLINE via predictions map (no model calls)", () => {
  const dataset: CalibrationDataset = {
    version: 1,
    gate: "first-frame-hook",
    judgePromptVersion: "hook-v1",
    examples: [
      { id: "tp1", artifact: "x", expectedLabel: "fail" },
      { id: "tp2", artifact: "x", expectedLabel: "fail" },
      { id: "tp3", artifact: "x", expectedLabel: "fail" },
      { id: "fp1", artifact: "x", expectedLabel: "pass" },
      { id: "tn1", artifact: "x", expectedLabel: "pass" },
      { id: "tn2", artifact: "x", expectedLabel: "pass" },
      { id: "tn3", artifact: "x", expectedLabel: "pass" },
      { id: "tn4", artifact: "x", expectedLabel: "pass" },
      { id: "fn1", artifact: "x", expectedLabel: "fail" },
      { id: "fn2", artifact: "x", expectedLabel: "fail" },
    ],
  };
  // Predict: tp* → fail (correct), fp1 → fail (wrong), tn* → pass (correct), fn* → pass (wrong).
  const predictions = {
    tp1: "fail", tp2: "fail", tp3: "fail",
    fp1: "fail",
    tn1: "pass", tn2: "pass", tn3: "pass", tn4: "pass",
    fn1: "pass", fn2: "pass",
  } as const;

  test("metrics match the worked confusion (tp=3,fp=1,tn=4,fn=2)", async () => {
    const report = await runCalibration(dataset, { predictions });
    expect(report.offline).toBe(true);
    expect(report.gate).toBe("first-frame-hook");
    expect(report.judgePromptVersion).toBe("hook-v1");
    expect(report.metrics.confusion).toEqual({ tp: 3, fp: 1, tn: 4, fn: 2 });
    approx(report.metrics.cohensKappa, 0.4);
    expect(report.promotionKappaBar).toBe(DEFAULT_PROMOTION_KAPPA);
    // kappa 0.4 < 0.6 → keep advisory.
    expect(report.recommendation).toContain("keep advisory");
    expect(report.examples.find((e) => e.id === "fp1")?.agree).toBe(false);
    expect(report.examples.find((e) => e.id === "tp1")?.agree).toBe(true);
  });

  test("perfect predictions → promote-eligible recommendation", async () => {
    const perfect = {
      tp1: "fail", tp2: "fail", tp3: "fail",
      fp1: "pass",
      tn1: "pass", tn2: "pass", tn3: "pass", tn4: "pass",
      fn1: "fail", fn2: "fail",
    } as const;
    const report = await runCalibration(dataset, { predictions: perfect });
    approx(report.metrics.cohensKappa, 1);
    expect(report.recommendation).toContain("promote-to-hard-gate eligible");
  });

  test("records a --model override", async () => {
    const report = await runCalibration(dataset, { predictions, model: "google/gemini-2.5-flash" });
    expect(report.judgeModel).toBe("google/gemini-2.5-flash");
  });
});

describe("CLI smoke: ralphy eval calibrate --predictions (offline)", () => {
  test("emits the calibration JSON shape, no model spend", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-calib-483-"));
    const datasetPath = path.join(tmp, "hooks.json");
    const predPath = path.join(tmp, "preds.json");
    fs.writeFileSync(
      datasetPath,
      JSON.stringify({
        version: 1,
        gate: "first-frame-hook",
        examples: [
          { id: "good", artifact: "fixtures/good.mp4", expectedLabel: "pass" },
          { id: "bad", artifact: "fixtures/bad.mp4", expectedLabel: "fail" },
        ],
      }),
    );
    fs.writeFileSync(predPath, JSON.stringify({ good: "pass", bad: "fail" }));

    const r = spawnSync(
      "bun",
      [
        "run", CLI, "--json",
        "eval", "calibrate",
        "--gate", "first-frame-hook",
        "--dataset", datasetPath,
        "--predictions", predPath,
      ],
      { cwd: tmp, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.gate).toBe("first-frame-hook");
    expect(json.offline).toBe(true);
    expect(json.n).toBe(2);
    expect(json.confusion).toEqual({ tp: 1, fp: 0, tn: 1, fn: 0 });
    expect(json.cohensKappa).toBe(1);
    expect(json.recommendation).toContain("promote-to-hard-gate eligible");
    expect(json.jsonPath).toBeNull(); // no --out → print only
  });

  test("rejects a --gate that does not match the dataset", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-calib-483-mismatch-"));
    const datasetPath = path.join(tmp, "hooks.json");
    fs.writeFileSync(
      datasetPath,
      JSON.stringify({
        version: 1,
        gate: "first-frame-hook",
        examples: [{ id: "a", artifact: "x", expectedLabel: "pass" }],
      }),
    );
    const r = spawnSync(
      "bun",
      ["run", CLI, "--json", "eval", "calibrate", "--gate", "ocr", "--dataset", datasetPath],
      { cwd: tmp, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("E_INPUT_INVALID");
  });
});
