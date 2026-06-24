// Eval-driven prompt-optimization loop (#486).
//
// Fully model-free: every run uses the OFFLINE injection seams
// (baselinePredictions / candidatePredictions / candidateOverride) and the pure
// functions (splitDataset / comparePromptCandidates / writeProposal). The live
// callLLM + runCalibration judge paths are wired + type-checked but NEVER
// exercised here — no paid generation, no network.
//
// Coverage:
//   1. splitDataset — deterministic, disjoint, covers all N; same seed/fraction
//      → identical split; reproducible across calls.
//   2. writeProposal no-overwrite — proposal-v1 then proposal-v2 (v1 untouched);
//      refuses to write into the source prompt's dir / a protected path.
//   3. runPromptOptimization — well-formed report from injected predictions +
//      candidateOverride, ZERO model calls; the SOURCE prompt is byte-identical
//      after a full run (never written).
//   4. comparePromptCandidates / recommendation — a better candidate → propose,
//      a worse one → reject.
//   5. CLI smoke — `eval optimize-prompt` fully offline, JSON asserted.
//
// English-only-on-disk: every fixture id / artifact / prompt is plain English.

import { describe, test, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  splitDataset,
  comparePromptCandidates,
  writeProposal,
  runPromptOptimization,
  type OptimizationReport,
} from "../../cli/lib/eval/prompt-optimize";
import { computeCalibrationMetrics } from "../../cli/lib/eval/calibration";
import type { CalibrationDataset } from "../../cli/lib/schemas/calibration";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

/** A 10-example dataset for split + report coverage. */
function dataset(n = 10): CalibrationDataset {
  const examples = [];
  for (let i = 0; i < n; i++) {
    examples.push({
      id: `ex-${i}`,
      artifact: `fixtures/ex-${i}.mp4`,
      expectedLabel: (i % 2 === 0 ? "fail" : "pass") as "fail" | "pass",
    });
  }
  return { version: 1, gate: "first-frame-hook", examples };
}

describe("splitDataset — deterministic, disjoint, total", () => {
  const ds = dataset(10);

  test("train + heldOut partition all N, disjoint", () => {
    const { train, heldOut } = splitDataset(ds, 0.6, 7);
    expect(train.examples.length).toBe(6);
    expect(heldOut.examples.length).toBe(4);
    const ids = new Set<string>();
    for (const e of [...train.examples, ...heldOut.examples]) ids.add(e.id);
    expect(ids.size).toBe(10); // covers all, no overlap
    const trainIds = new Set(train.examples.map((e) => e.id));
    for (const e of heldOut.examples) expect(trainIds.has(e.id)).toBe(false);
  });

  test("same seed + fraction → identical split (reproducible across calls)", () => {
    const a = splitDataset(ds, 0.6, 42);
    const b = splitDataset(ds, 0.6, 42);
    expect(a.train.examples.map((e) => e.id)).toEqual(b.train.examples.map((e) => e.id));
    expect(a.heldOut.examples.map((e) => e.id)).toEqual(b.heldOut.examples.map((e) => e.id));
  });

  test("a different seed generally reorders the split (still deterministic)", () => {
    const s1 = splitDataset(ds, 0.6, 1).train.examples.map((e) => e.id);
    const s2 = splitDataset(ds, 0.6, 2).train.examples.map((e) => e.id);
    // Both are deterministic; with distinct seeds the membership set should differ.
    expect(new Set(s1)).not.toEqual(new Set(s2));
  });

  test("fraction is honored + preserves gate/version", () => {
    const { train, heldOut } = splitDataset(ds, 0.3, 0);
    expect(train.examples.length).toBe(3);
    expect(heldOut.examples.length).toBe(7);
    expect(train.gate).toBe("first-frame-hook");
    expect(heldOut.gate).toBe("first-frame-hook");
  });
});

describe("comparePromptCandidates — improvement threshold", () => {
  // Baseline: tp=2,fp=2,tn=2,fn=2 → kappa 0. Candidate: tp=4,fp=0,tn=4,fn=0 → kappa 1.
  const worse = computeCalibrationMetrics([
    { expected: true, predicted: true }, { expected: true, predicted: true },
    { expected: false, predicted: true }, { expected: false, predicted: true },
    { expected: false, predicted: false }, { expected: false, predicted: false },
    { expected: true, predicted: false }, { expected: true, predicted: false },
  ]);
  const better = computeCalibrationMetrics([
    { expected: true, predicted: true }, { expected: true, predicted: true },
    { expected: true, predicted: true }, { expected: true, predicted: true },
    { expected: false, predicted: false }, { expected: false, predicted: false },
    { expected: false, predicted: false }, { expected: false, predicted: false },
  ]);

  test("candidate that agrees more → improved/propose", () => {
    const c = comparePromptCandidates(worse, better);
    expect(c.improved).toBe(true);
    expect(c.deltaKappa).not.toBeNull();
    expect((c.deltaKappa as number) > 0).toBe(true);
    expect(c.summary).toContain("propose");
  });

  test("candidate that agrees less → not improved/reject", () => {
    const c = comparePromptCandidates(better, worse);
    expect(c.improved).toBe(false);
    expect(c.summary).toContain("reject");
  });

  test("equal metrics do not clear the margin → reject", () => {
    const c = comparePromptCandidates(better, better);
    expect(c.improved).toBe(false);
    expect(c.deltaKappa).toBe(0);
  });
});

describe("writeProposal — append-only, no-overwrite, guarded", () => {
  function makeReport(promptSource: string): OptimizationReport {
    const m = computeCalibrationMetrics([{ expected: true, predicted: true }]);
    return {
      version: 1,
      kind: "judge",
      gate: "first-frame-hook",
      promptSource,
      datasetSource: "/tmp/ds.json",
      trainFraction: 0.6,
      seed: 0,
      optimizerBudget: 1,
      baseline: { metrics: m, prompt: "baseline" },
      candidate: { metrics: m, prompt: "improved candidate prompt" },
      comparison: comparePromptCandidates(m, m),
      recommendation: "propose",
      generatedAt: new Date().toISOString(),
    };
  }

  test("v1 then v2, v1 untouched", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-po-write-"));
    const promptPath = path.join(tmp, "prompts", "judge.txt");
    fs.mkdirSync(path.dirname(promptPath), { recursive: true });
    fs.writeFileSync(promptPath, "the source prompt");
    const outDir = path.join(tmp, "proposals");

    const report = makeReport(promptPath);
    const d1 = writeProposal(outDir, report);
    expect(path.basename(d1)).toBe("proposal-v1");
    expect(fs.readFileSync(path.join(d1, "candidate-prompt.txt"), "utf8")).toBe("improved candidate prompt");
    expect(fs.existsSync(path.join(d1, "report.json"))).toBe(true);

    const d2 = writeProposal(outDir, report);
    expect(path.basename(d2)).toBe("proposal-v2");
    // v1 still present + unchanged.
    expect(fs.existsSync(path.join(outDir, "proposal-v1", "report.json"))).toBe(true);
    expect(fs.readFileSync(path.join(outDir, "proposal-v1", "candidate-prompt.txt"), "utf8")).toBe(
      "improved candidate prompt",
    );
  });

  test("refuses to write into the source prompt's own directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-po-guard-"));
    const promptPath = path.join(tmp, "judge.txt");
    fs.writeFileSync(promptPath, "src");
    // outDir === the source prompt's dir.
    expect(() => writeProposal(tmp, makeReport(promptPath))).toThrow(/source prompt/);
  });

  test("refuses a protected public-guidance path (templates / guidelines / MODELS.md)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-po-protected-"));
    const promptPath = path.join(tmp, "judge.txt");
    fs.writeFileSync(promptPath, "src");
    expect(() => writeProposal(path.join(tmp, "templates", "x"), makeReport(promptPath))).toThrow(/protected/);
    expect(() => writeProposal(path.join(tmp, "guidelines", "y"), makeReport(promptPath))).toThrow(/protected/);
    expect(() => writeProposal(path.join(tmp, "MODELS.md"), makeReport(promptPath))).toThrow(/protected/);
  });
});

describe("runPromptOptimization — offline (zero model calls)", () => {
  const ds = dataset(10);
  // Held-out for trainFraction 0.6 seed 0 has 4 examples; build prediction maps
  // for ALL ids so the offline seam covers whatever lands in held-out.
  const allFail: Record<string, "pass" | "fail"> = {};
  const perfect: Record<string, "pass" | "fail"> = {};
  for (const e of ds.examples) {
    allFail[e.id] = "fail"; // a deliberately wrong baseline (always blocks)
    perfect[e.id] = e.expectedLabel; // candidate agrees with the human labels
  }

  test("well-formed report, both metrics + comparison, no model calls", async () => {
    const report = await runPromptOptimization(
      {
        promptSource: "/tmp/judge.txt",
        baselinePrompt: "baseline judge prompt",
        dataset: ds,
        datasetSource: "/tmp/ds.json",
        kind: "judge",
      },
      {
        trainFraction: 0.6,
        seed: 0,
        baselinePredictions: allFail,
        candidatePredictions: perfect,
        candidateOverride: "improved judge prompt",
      },
    );
    expect(report.version).toBe(1);
    expect(report.kind).toBe("judge");
    expect(report.gate).toBe("first-frame-hook");
    expect(report.baseline.metrics.n).toBe(report.candidate.metrics.n);
    expect(report.candidate.prompt).toBe("improved judge prompt");
    expect(report.baseline.prompt).toBe("baseline judge prompt");
    expect(["propose", "reject"]).toContain(report.recommendation);
    expect(report.comparison.deltaKappa).not.toBeUndefined();
  });

  test("a candidate that agrees more with the labels → propose", async () => {
    const report = await runPromptOptimization(
      {
        promptSource: "/tmp/judge.txt",
        baselinePrompt: "baseline",
        dataset: ds,
        datasetSource: "/tmp/ds.json",
      },
      {
        trainFraction: 0.6,
        seed: 0,
        baselinePredictions: allFail, // wrong on every pass example
        candidatePredictions: perfect, // perfect agreement
        candidateOverride: "better",
      },
    );
    expect(report.recommendation).toBe("propose");
    expect(report.comparison.improved).toBe(true);
  });

  test("a worse candidate → reject", async () => {
    const report = await runPromptOptimization(
      {
        promptSource: "/tmp/judge.txt",
        baselinePrompt: "baseline",
        dataset: ds,
        datasetSource: "/tmp/ds.json",
      },
      {
        trainFraction: 0.6,
        seed: 0,
        baselinePredictions: perfect, // perfect baseline
        candidatePredictions: allFail, // worse candidate
        candidateOverride: "worse",
      },
    );
    expect(report.recommendation).toBe("reject");
    expect(report.comparison.improved).toBe(false);
  });

  test("the SOURCE prompt file is byte-identical after a full run (never written)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-po-source-"));
    const promptPath = path.join(tmp, "judge.txt");
    const original = "the original source prompt — must not change\n";
    fs.writeFileSync(promptPath, original);
    const before = fs.readFileSync(promptPath);

    await runPromptOptimization(
      {
        promptSource: promptPath,
        baselinePrompt: original,
        dataset: ds,
        datasetSource: "/tmp/ds.json",
      },
      {
        trainFraction: 0.6,
        seed: 0,
        baselinePredictions: allFail,
        candidatePredictions: perfect,
        candidateOverride: "candidate",
      },
    );

    const after = fs.readFileSync(promptPath);
    expect(after.equals(before)).toBe(true);
    expect(fs.readFileSync(promptPath, "utf8")).toBe(original);
  });
});

describe("CLI smoke: ralphy eval optimize-prompt (fully offline)", () => {
  test("emits the optimization JSON shape, no model spend", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-po-cli-"));
    const promptPath = path.join(tmp, "judge.txt");
    const datasetPath = path.join(tmp, "hooks.json");
    const basePredPath = path.join(tmp, "base.json");
    const candPredPath = path.join(tmp, "cand.json");
    const candPath = path.join(tmp, "candidate.txt");

    fs.writeFileSync(promptPath, "baseline judge prompt");
    fs.writeFileSync(candPath, "improved judge prompt");

    // 6 examples → train 3 / held-out 3 at fraction 0.5.
    const examples = [];
    for (let i = 0; i < 6; i++) {
      examples.push({
        id: `ex-${i}`,
        artifact: `fixtures/ex-${i}.mp4`,
        expectedLabel: i % 2 === 0 ? "fail" : "pass",
      });
    }
    fs.writeFileSync(datasetPath, JSON.stringify({ version: 1, gate: "first-frame-hook", examples }));

    // Baseline wrong on every example; candidate perfect — guarantees an improvement.
    const base: Record<string, string> = {};
    const cand: Record<string, string> = {};
    for (const e of examples) {
      base[e.id] = e.expectedLabel === "fail" ? "pass" : "fail";
      cand[e.id] = e.expectedLabel;
    }
    fs.writeFileSync(basePredPath, JSON.stringify(base));
    fs.writeFileSync(candPredPath, JSON.stringify(cand));

    const r = spawnSync(
      "bun",
      [
        "run", CLI, "--json",
        "eval", "optimize-prompt",
        "--prompt", promptPath,
        "--dataset", datasetPath,
        "--train-split", "0.5",
        "--baseline-predictions", basePredPath,
        "--candidate-predictions", candPredPath,
        "--candidate", candPath,
      ],
      { cwd: tmp, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.kind).toBe("judge");
    expect(json.gate).toBe("first-frame-hook");
    expect(json.baseline.n).toBe(json.candidate.n);
    expect(json.recommendation).toBe("propose");
    expect(json.comparison.improved).toBe(true);
    // A propose recommendation wrote an append-only proposal dir.
    expect(typeof json.proposalPath).toBe("string");
    expect(fs.existsSync(path.join(json.proposalPath, "candidate-prompt.txt"))).toBe(true);
    expect(fs.readFileSync(path.join(json.proposalPath, "candidate-prompt.txt"), "utf8")).toBe(
      "improved judge prompt",
    );
    // The source prompt is untouched.
    expect(fs.readFileSync(promptPath, "utf8")).toBe("baseline judge prompt");
  });

  test("--dry-run prints the plan with zero model calls", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-po-cli-dry-"));
    const promptPath = path.join(tmp, "judge.txt");
    const datasetPath = path.join(tmp, "hooks.json");
    fs.writeFileSync(promptPath, "baseline");
    fs.writeFileSync(
      datasetPath,
      JSON.stringify({
        version: 1,
        gate: "first-frame-hook",
        examples: [
          { id: "a", artifact: "x", expectedLabel: "pass" },
          { id: "b", artifact: "y", expectedLabel: "fail" },
          { id: "c", artifact: "z", expectedLabel: "pass" },
          { id: "d", artifact: "w", expectedLabel: "fail" },
        ],
      }),
    );
    const r = spawnSync(
      "bun",
      ["run", CLI, "--json", "eval", "optimize-prompt", "--prompt", promptPath, "--dataset", datasetPath, "--dry-run"],
      { cwd: tmp, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.dryRun).toBe(true);
    expect(json.trainSize + json.heldOutSize).toBe(4);
    expect(json.costBearing).toBe(true); // no offline seams supplied
  });

  test("rejects a bad --train-split", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-po-cli-bad-"));
    const promptPath = path.join(tmp, "judge.txt");
    const datasetPath = path.join(tmp, "hooks.json");
    fs.writeFileSync(promptPath, "baseline");
    fs.writeFileSync(
      datasetPath,
      JSON.stringify({ version: 1, gate: "first-frame-hook", examples: [{ id: "a", artifact: "x", expectedLabel: "pass" }] }),
    );
    const r = spawnSync(
      "bun",
      ["run", CLI, "--json", "eval", "optimize-prompt", "--prompt", promptPath, "--dataset", datasetPath, "--train-split", "1.5"],
      { cwd: tmp, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("E_INPUT_INVALID");
  });
});
