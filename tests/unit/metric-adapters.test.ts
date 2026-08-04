// Specialized media metric adapters (#485).
//
// ALL model-free: the pure WER core, injected transcripts, threshold mapping,
// availability/degradation, and a seeded eval.json for the enrichment merge.
// NO paid generation, NO network, NO model calls — the live (paid) WER path is
// never exercised; tests inject a hypothesis transcript instead.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  ensureDomainContractProject,
  setDomainContractDocumentStage,
  setDomainContractStage,
} from "../helpers/domain-contract";
import { projectDir } from "../../cli/lib/paths";
import { root } from "../../cli/lib/paths";
import { buildScorecard } from "../../cli/lib/scorecard";
import { computeWer, statusForWer } from "../../cli/lib/eval/metrics/tts-wer";
import { statusForAesthetic } from "../../cli/lib/eval/metrics/image-aesthetic";
import { ttsWerAdapter } from "../../cli/lib/eval/metrics/tts-wer";
import { imageAestheticAdapter } from "../../cli/lib/eval/metrics/image-aesthetic";
import { runMetrics, enrichEvalWithMetrics } from "../../cli/lib/eval/metrics/run";
import {
  listMetricAdapters,
  getMetricAdapter,
  adaptersForCapability,
} from "../../cli/lib/eval/metrics/registry";
import {
  setGlobalConfigPath,
  resetGlobalConfigPath,
  configSet,
} from "../../cli/lib/global-config";

// ─── pure WER core ──────────────────────────────────────────────────────────

describe("computeWer — word-level edit distance / reference length", () => {
  test("one substitution over a 3-word reference → 1/3", () => {
    expect(computeWer("the cat sat", "the cat ran")).toBeCloseTo(1 / 3, 10);
  });

  test("identical strings → 0", () => {
    expect(computeWer("hello there friend", "hello there friend")).toBe(0);
  });

  test("normalization: case + punctuation ignored → 0", () => {
    expect(computeWer("Hello, there!", "hello there")).toBe(0);
  });

  test("empty hypothesis over a non-empty reference → 1 (all deleted)", () => {
    expect(computeWer("a real script here", "")).toBe(1);
  });

  test("both empty → 0", () => {
    expect(computeWer("", "")).toBe(0);
  });

  test("empty reference + non-empty hypothesis → 1 (capped)", () => {
    expect(computeWer("", "unexpected words")).toBe(1);
  });

  test("one insertion over a 2-word reference → 1/2", () => {
    expect(computeWer("good morning", "good cold morning")).toBeCloseTo(1 / 2, 10);
  });

  test("one deletion over a 4-word reference → 1/4", () => {
    expect(computeWer("the quick brown fox", "the quick fox")).toBeCloseTo(1 / 4, 10);
  });
});

describe("statusForWer — threshold mapping (≤thr pass, ≤2×thr warn, else fail)", () => {
  test("at or below the threshold → pass", () => {
    expect(statusForWer(0.1, 0.15)).toBe("pass");
    expect(statusForWer(0.15, 0.15)).toBe("pass");
  });
  test("above the threshold but within 2× → warn", () => {
    expect(statusForWer(0.2, 0.15)).toBe("warn");
    expect(statusForWer(0.3, 0.15)).toBe("warn");
  });
  test("beyond 2× the threshold → fail", () => {
    expect(statusForWer(0.31, 0.15)).toBe("fail");
    expect(statusForWer(0.9, 0.15)).toBe("fail");
  });
});

describe("statusForAesthetic — threshold mapping (≥thr pass, within band warn, else fail)", () => {
  test("at or above the threshold → pass", () => {
    expect(statusForAesthetic(0.6, 0.5)).toBe("pass");
    expect(statusForAesthetic(0.5, 0.5)).toBe("pass");
  });
  test("within one band below → warn", () => {
    expect(statusForAesthetic(0.4, 0.5)).toBe("warn");
  });
  test("well below → fail", () => {
    expect(statusForAesthetic(0.2, 0.5)).toBe("fail");
  });
});

// ─── registry ────────────────────────────────────────────────────────────────

describe("metric-adapter registry", () => {
  test("lists both initial adapters in priority order", () => {
    const ids = listMetricAdapters().map((a) => a.id);
    expect(ids).toEqual(["tts-wer", "image-aesthetic"]);
  });
  test("getMetricAdapter resolves a known id and rejects an unknown one", () => {
    expect(getMetricAdapter("tts-wer")?.id).toBe("tts-wer");
    expect(getMetricAdapter("nope")).toBeUndefined();
  });
  test("adaptersForCapability filters by capability", () => {
    expect(adaptersForCapability("voice").map((a) => a.id)).toEqual(["tts-wer"]);
    expect(adaptersForCapability("image").map((a) => a.id)).toEqual(["image-aesthetic"]);
  });
});

// ─── availability / degradation (never throws) ────────────────────────────────

describe("availability + degradation → na + hint, never a throw", () => {
  let cfg: string;
  beforeEach(() => {
    cfg = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-cfg-")) + "/config.json";
    setGlobalConfigPath(cfg);
  });
  afterEach(() => {
    resetGlobalConfigPath();
    try {
      fs.rmSync(path.dirname(cfg), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  test("image-aesthetic is na with a non-empty hint (no bundled scorer)", async () => {
    const avail = await imageAestheticAdapter.available({ projectId: "x" });
    expect(avail.ok).toBe(false);
    expect((avail.hint ?? "").length).toBeGreaterThan(0);

    const res = await imageAestheticAdapter.score({ projectId: "x" });
    expect(res.status).toBe("na");
    expect(res.score).toBeNull();
    expect(res.reason.length).toBeGreaterThan(0);
  });

  test("tts-wer with NO expected text → na with a hint, never throws", async () => {
    const avail = await ttsWerAdapter.available({ projectId: "x", expectedText: "" });
    expect(avail.ok).toBe(false);
    expect((avail.hint ?? "")).toContain("expected");

    const res = await ttsWerAdapter.score({ projectId: "x", expectedText: "" });
    expect(res.status).toBe("na");
    expect(res.score).toBeNull();
  });

  test("tts-wer scores via an injected hypothesis (ZERO model calls) → pass/warn/fail by threshold", async () => {
    // identical → WER 0 → pass
    const pass = await ttsWerAdapter.score({
      projectId: "x",
      expectedText: "the cat sat on the mat",
      hypothesisOverride: "the cat sat on the mat",
    });
    expect(pass.status).toBe("pass");
    expect(pass.score).toBe(0);
    expect(pass.threshold).toBe(0.15);

    // 1 of 6 words wrong → WER 0.1667 → over 0.15, within 2× → warn
    const warn = await ttsWerAdapter.score({
      projectId: "x",
      expectedText: "the cat sat on the mat",
      hypothesisOverride: "the cat sat on the rug",
    });
    expect(warn.status).toBe("warn");

    // many wrong → fail
    const fail = await ttsWerAdapter.score({
      projectId: "x",
      expectedText: "the cat sat on the mat",
      hypothesisOverride: "a dog ran",
    });
    expect(fail.status).toBe("fail");
  });

  test("config threshold override is honored", async () => {
    configSet("metrics.tts-wer.threshold", 0.5);
    const res = await ttsWerAdapter.score({
      projectId: "x",
      expectedText: "the cat sat on the mat",
      hypothesisOverride: "the cat sat on the rug",
    });
    // WER 0.1667 ≤ 0.5 → pass under the raised bar.
    expect(res.threshold).toBe(0.5);
    expect(res.status).toBe("pass");
  });
});

// ─── eval.json enrichment + scorecard no-regression ───────────────────────────

function evalReport(opts: { findings?: Array<{ category: string; severity: "info" | "warn" | "fail" }> } = {}) {
  const findings = (opts.findings ?? []).map((f, i) => ({
    id: `F${i + 1}`,
    category: f.category,
    severity: f.severity,
    sceneIndex: null,
    timestampSec: null,
    message: `${f.category} finding`,
    fixHint: "fix it",
    fixCommand: null,
  }));
  return {
    schemaVersion: "1.0",
    gate: { mode: "native-video", nativeVideo: true, explicitCheapMode: false, shipReady: true, reason: "native pass" },
    meta: {
      video: "render/final.mp4",
      projectId: null,
      template: null,
      evaluatedAt: "2026-06-24T00:00:00Z",
      durationSec: 15,
      resolution: { w: 1080, h: 1920 },
      fps: 30,
      codec: { video: "h264", audio: "aac" },
      bitrateKbps: 6000,
    },
    declared: null,
    structure: {
      scenes: [],
      sceneCount: 5,
      avgSceneDurationSec: 3,
      minSceneDurationSec: 2,
      maxSceneDurationSec: 4,
      hookZone: { durationSec: 3, sceneCount: 2, transcript: "stop scrolling watch this now", wordCount: 5 },
    },
    audio: { integratedLufs: -16, truePeakDb: -1.5, loudnessRangeLu: 8, deadAirSegments: [], voicePresentPct: 80 },
    captions: { available: true, wordCount: 40, wordsPerSecond: 2.6, densityWarn: false },
    vision: { sceneFindings: [] },
    findings,
    scoring: { weights: {}, penalties: {}, score: 90, verdict: "pass" as const },
  };
}

function seedJson(project: string, rel: string, obj: unknown) {
  seed(project, rel, JSON.stringify(obj, null, 2));
}

function seed(project: string, rel: string, body: string) {
  ensureDomainContractProject(root(), project);
  const abs = path.join(projectDir(project), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
  if (rel === "eval.json") {
    setDomainContractDocumentStage(root(), project, "eval", JSON.parse(body));
  } else if (rel === "render/final.mp4") {
    setDomainContractStage(root(), project, "render");
  }
}

describe("enrichEvalWithMetrics + scorecard no-regression (#485)", () => {
  let tmp: TmpRoot;
  let cfg: string;
  beforeEach(() => {
    tmp = makeTmpRoot("metric-enrich-test");
    cfg = fs.mkdtempSync(path.join(os.tmpdir(), "metrics-cfg-")) + "/config.json";
    setGlobalConfigPath(cfg);
  });
  afterEach(() => {
    resetGlobalConfigPath();
    tmp.cleanup();
    try {
      fs.rmSync(path.dirname(cfg), { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  test("metrics land in eval.json AND buildScorecard returns the SAME verdict (idempotent over enrichment)", async () => {
    const id = "enrich-001";
    seed(id, "render/final.mp4", "fake-mp4");
    seedJson(id, "eval.json", evalReport({}));
    seedJson(id, "production-plan.json", { contentMode: { mode: "motion-design" } });

    // Verdict BEFORE enrichment.
    const before = buildScorecard({ projectId: id });

    // Run the adapters with an injected transcript (NO model calls) + an
    // expected script, then merge into eval.json.
    const metrics = await runMetrics({
      projectId: id,
      mode: "motion-design",
      expectedText: "the cat sat on the mat",
      hypothesisOverride: "the cat sat on the mat",
    });
    const wer = metrics.find((m) => m.adapter === "tts-wer")!;
    expect(wer.status).toBe("pass");
    expect(wer.score).toBe(0);

    const { enriched, evalPath } = await enrichEvalWithMetrics(id, metrics);
    expect(enriched).toBe(true);

    // `metrics` is now persisted under eval.json.
    const reloaded = JSON.parse(fs.readFileSync(evalPath, "utf8"));
    expect(Array.isArray(reloaded.metrics)).toBe(true);
    expect(reloaded.metrics.find((m: any) => m.adapter === "tts-wer").status).toBe("pass");

    // Prior eval.json was archived (append-only).
    expect(fs.existsSync(path.join(projectDir(id), "eval.v1.json"))).toBe(true);

    // Verdict AFTER enrichment is IDENTICAL — metrics are note-only.
    const after = buildScorecard({ projectId: id });
    expect(after.verdict).toBe(before.verdict);
    expect(after.dimensions.map((d) => `${d.dimension}:${d.status}`)).toEqual(
      before.dimensions.map((d) => `${d.dimension}:${d.status}`),
    );

    // The audio note is enriched with the WER readout (note-only).
    const audio = after.dimensions.find((d) => d.dimension === "audio")!;
    expect(audio.note).toContain("WER");
    // but the audio STATUS is unchanged vs the pre-enrichment reading.
    const audioBefore = before.dimensions.find((d) => d.dimension === "audio")!;
    expect(audio.status).toBe(audioBefore.status);
  });

  test("no eval.json to enrich → enriched=false, nothing written, no crash", async () => {
    const id = "no-eval-001";
    ensureDomainContractProject(root(), id);
    fs.mkdirSync(projectDir(id), { recursive: true });
    const metrics = await runMetrics({
      projectId: id,
      expectedText: "hello world",
      hypothesisOverride: "hello world",
    });
    const { enriched } = await enrichEvalWithMetrics(id, metrics);
    expect(enriched).toBe(false);
    expect(fs.existsSync(path.join(projectDir(id), "eval.json"))).toBe(false);
  });

  test("buildScorecard builds cleanly over an eval.json that already carries metrics", () => {
    const id = "carries-metrics-001";
    seed(id, "render/final.mp4", "fake-mp4");
    const report: any = evalReport({});
    report.metrics = [
      { adapter: "tts-wer", capability: "voice", status: "warn", score: 0.2, threshold: 0.15, reason: "WER 20.0% over the 15% bar." },
    ];
    seedJson(id, "eval.json", report);
    seedJson(id, "production-plan.json", { contentMode: { mode: "motion-design" } });

    const card = buildScorecard({ projectId: id });
    // metrics are note-only: a `warn` WER must NOT flip the verdict to repair.
    expect(card.verdict).toBe("ship");
    const audio = card.dimensions.find((d) => d.dimension === "audio")!;
    expect(audio.status).toBe("pass");
    expect(audio.note).toContain("WER 20.0%");
  });
});

// ─── CLI smoke (offline, tmp project) ─────────────────────────────────────────

describe("ralphy eval metrics --dry-run CLI smoke (offline)", () => {
  const REPO = path.resolve(import.meta.dir, "..", "..");
  const CLI = path.join(REPO, "cli", "index.ts");
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-metrics-cli-"));
    fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
    const projDir = path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "metrics-001");
    fs.mkdirSync(projDir, { recursive: true });
    fs.writeFileSync(path.join(projDir, "BRIEF.md"), "metrics smoke project\n");
  });
  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  test("--dry-run lists adapters + availability + thresholds, JSON, exit 0", () => {
    const r = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmpRoot, "eval", "metrics", "metrics-001", "--dry-run"],
      { cwd: tmpRoot, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.dryRun).toBe(true);
    expect(json.project).toBe("metrics-001");
    expect(Array.isArray(json.adapters)).toBe(true);
    const ids = json.adapters.map((a: any) => a.adapter);
    expect(ids).toContain("tts-wer");
    expect(ids).toContain("image-aesthetic");
    const aesthetic = json.adapters.find((a: any) => a.adapter === "image-aesthetic");
    expect(aesthetic.available).toBe(false);
    expect(typeof aesthetic.threshold).toBe("number");
    expect((aesthetic.hint ?? "").length).toBeGreaterThan(0);
  });

  test("an unknown --adapter is rejected with E_INPUT_INVALID", () => {
    const r = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmpRoot, "eval", "metrics", "metrics-001", "--adapter", "nope", "--dry-run"],
      { cwd: tmpRoot, encoding: "utf8", env: { ...process.env } },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("E_INPUT_INVALID");
  });
});
